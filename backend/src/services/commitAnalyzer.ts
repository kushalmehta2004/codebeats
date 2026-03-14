import Sentiment from 'sentiment';
import { config } from '../config';
import { getCommits } from './githubClient';
import type { CommitAnalysis } from '../types';

const sentimentEngine = new Sentiment();

/**
 * Analyses commit history for a repository over the configured look-back window.
 *
 * Metrics produced:
 * - `commitFrequencyPer90Days` — raw commit count in the window
 * - `avgSentiment`             — recency-weighted average sentiment in [-1, 1]
 *   (positive = healthy/happy messages, negative = frustrated messages)
 *
 * Sentiment scoring uses the `sentiment` npm package which is based on AFINN-165
 * and extends it with emoji and slang. The `comparative` score is normalised by
 * token count, making it robust to short vs. long messages. We then clamp it to
 * [-1, 1] and apply an exponential recency weight (half-life ≈ 30 days) so
 * recent commit messages have more influence than old ones.
 */
export async function analyzeCommits(owner: string, repo: string): Promise<CommitAnalysis> {
  const since = new Date(
    Date.now() - config.analysis.commitWindowDays * 24 * 60 * 60 * 1_000,
  ).toISOString();

  const commits = await getCommits(owner, repo, since);

  if (commits.length === 0) {
    return {
      commitCount: 0,
      commitFrequencyPer90Days: 0,
      avgSentiment: 0,
      sentimentLabel: 'neutral',
    };
  }

  const now = Date.now();
  let totalWeight = 0;
  let weightedSentiment = 0;

  for (const commit of commits) {
    const commitMs = new Date(commit.date).getTime();
    const daysAgo = Math.max(0, (now - commitMs) / (1_000 * 60 * 60 * 24));

    // Exponential recency weight — commits from 30 days ago have half the weight
    // of today's commits; commits from 90 days ago have ~5% of today's weight.
    const weight = Math.exp(-daysAgo / 30);

    // Analyse only the subject line (first line) to avoid noise from body text
    const subject = commit.message.split('\n')[0].trim();
    if (!subject) continue;

    const analysis = sentimentEngine.analyze(subject);

    // `comparative` is score / word count, typically in [-3, 3].
    // Clamp to [-1, 1] for a clean normalised value.
    const score = Math.max(-1, Math.min(1, analysis.comparative / 3));

    weightedSentiment += score * weight;
    totalWeight += weight;
  }

  const avgSentiment = totalWeight > 0 ? weightedSentiment / totalWeight : 0;

  const sentimentLabel: CommitAnalysis['sentimentLabel'] =
    avgSentiment > 0.3
      ? 'very positive'
      : avgSentiment > 0.1
      ? 'positive'
      : avgSentiment > -0.1
      ? 'neutral'
      : avgSentiment > -0.3
      ? 'negative'
      : 'very negative';

  return {
    commitCount: commits.length,
    commitFrequencyPer90Days: commits.length,
    avgSentiment,
    sentimentLabel,
  };
}

/**
 * Computes the average time (in hours) between PR creation and merge/close.
 * Only considers PRs merged/closed within the last 180 days to avoid skew
 * from ancient PRs on long-lived projects.
 * Returns 0 if no qualifying pull requests are available.
 */
export function computeAvgPRReviewTimeHours(
  prs: Array<{ createdAt: string; mergedAt: string | null; closedAt: string | null }>,
): number {
  if (prs.length === 0) return 0;

  const cutoffMs = Date.now() - 180 * 24 * 60 * 60 * 1_000; // 180 days ago

  let totalHours = 0;
  let count = 0;

  for (const pr of prs) {
    const resolved = pr.mergedAt ?? pr.closedAt;
    if (!resolved) continue;

    const resolvedMs = new Date(resolved).getTime();
    // Skip PRs resolved before the freshness window
    if (resolvedMs < cutoffMs) continue;

    const created = new Date(pr.createdAt).getTime();
    if (resolvedMs > created) {
      totalHours += (resolvedMs - created) / (1_000 * 60 * 60);
      count++;
    }
  }

  return count > 0 ? totalHours / count : 0;
}
