import { Router, Request, Response } from 'express';
import { fetchRepoFiles } from '../services/fileFetcher';
import { getRepoInfo, getClosedPRs } from '../services/githubClient';
import {
  extractFileMetrics,
  computeDeadCodeRatio,
  computeDuplicationRatio,
  computeTestCoverageProxy,
  aggregateFileMetrics,
} from '../services/metricExtractor';
import { analyzeCommits, computeAvgPRReviewTimeHours } from '../services/commitAnalyzer';
import {
  normalizeMetrics,
  computeHealthScore,
  buildMetricDetails,
  buildCompositionConfig,
} from '../services/metricNormalizer';
import type { AnalysisResult, RawMetrics } from '../types';

export const analyzeRouter = Router();

// ─── URL parser ───────────────────────────────────────────────────────────────

const GITHUB_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(\/.*)?$/i;
const SHORTHAND_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/;

/**
 * Parses a GitHub repository URL or `owner/repo` shorthand.
 * Returns null if the input cannot be resolved.
 */
function parseGitHubUrl(raw: string): { owner: string; repo: string } | null {
  const trimmed = raw.trim();
  const match = GITHUB_URL_RE.exec(trimmed) ?? SHORTHAND_RE.exec(trimmed);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

// ─── Analysis orchestrator ────────────────────────────────────────────────────

/**
 * Runs the full analysis pipeline for a GitHub repository:
 *  1. Fetch repo metadata and JS/TS files in parallel
 *  2. Extract per-file AST metrics
 *  3. Aggregate to repo-level raw metrics
 *  4. Normalise to [0, 1]
 *  5. Compute health score and composition config
 *
 * @throws AxiosError with a `.response.status` property on GitHub API errors
 */
async function analyzeRepository(owner: string, repo: string): Promise<AnalysisResult> {
  console.log(`[analyze] Starting analysis for ${owner}/${repo}`);

  // Run independent API calls concurrently
  const [repoInfo, files, commitAnalysis, closedPRs] = await Promise.all([
    getRepoInfo(owner, repo),
    fetchRepoFiles(owner, repo),
    analyzeCommits(owner, repo),
    getClosedPRs(owner, repo),
  ]);

  // ── Per-file metric extraction ─────────────────────────────────────────────
  // Skip TypeScript declaration files produced by compilers
  const parsableFiles = files.filter((f) => !f.path.endsWith('.d.ts'));
  const fileMetrics = parsableFiles.map((f) => extractFileMetrics(f));

  const parseErrors = fileMetrics.filter((m) => m.parseError).length;
  if (parseErrors > 0) {
    console.warn(`[analyze] ${parseErrors} files could not be parsed and were skipped`);
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const { avgCyclomaticComplexity, avgFunctionLength, importDensity } =
    aggregateFileMetrics(fileMetrics);

  const totalLOC = files.reduce((s, f) => s + f.loc, 0);
  const openIssues = repoInfo.openIssues;
  // Bug density: issues per 1 000 LOC, then converted to issues/LOC
  const bugDensity = totalLOC > 0 ? openIssues / totalLOC : 0;

  const avgPRReviewTimeHours = computeAvgPRReviewTimeHours(closedPRs);

  const raw: RawMetrics = {
    totalLOC,
    fileCount: files.length,
    avgCyclomaticComplexity,
    avgFunctionLength,
    importDensity,
    deadCodeRatio: computeDeadCodeRatio(fileMetrics),
    duplicationRatio: computeDuplicationRatio(parsableFiles),
    testCoverageProxy: computeTestCoverageProxy(fileMetrics),
    commitFrequency: commitAnalysis.commitFrequencyPer90Days,
    commitSentiment: commitAnalysis.avgSentiment,
    bugDensity,
    openIssueCount: openIssues,
    avgPRReviewTimeHours,
  };

  // ── Normalise & compose ────────────────────────────────────────────────────
  const normalized = normalizeMetrics(raw);
  const healthScore = computeHealthScore(normalized);
  const compositionConfig = buildCompositionConfig(normalized);
  const metrics = buildMetricDetails(raw, normalized);

  console.log(`[analyze] ${owner}/${repo} — health score: ${healthScore}/100`);

  return {
    repoId: `github:${owner}/${repo}`,
    repoUrl: `https://github.com/${owner}/${repo}`,
    owner,
    repo,
    analyzedAt: new Date().toISOString(),
    raw,
    normalized,
    healthScore,
    metrics,
    compositionConfig,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * POST /api/analyze
 *
 * Body: { "url": "https://github.com/owner/repo" }
 *
 * Returns the full `AnalysisResult` JSON on success or an `{ error }` object
 * with an appropriate HTTP status code on failure.
 */
analyzeRouter.post('/', async (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Request body must include a "url" string field.' });
  }

  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    return res
      .status(400)
      .json({ error: 'Invalid GitHub URL. Use format: https://github.com/owner/repo' });
  }

  const { owner, repo } = parsed;

  try {
    const result = await analyzeRepository(owner, repo);
    return res.json(result);
  } catch (err: any) {
    const status: number = err?.response?.status ?? 0;

    if (status === 404) {
      return res
        .status(404)
        .json({ error: `Repository ${owner}/${repo} not found or is private.` });
    }
    if (status === 403 || status === 429) {
      return res
        .status(429)
        .json({ error: 'GitHub API rate limit exceeded. Please try again later.' });
    }

    console.error('[analyze] Unexpected error:', err);
    return res.status(500).json({
      error: `Analysis failed: ${err?.message ?? 'Unknown error'}`,
    });
  }
});
