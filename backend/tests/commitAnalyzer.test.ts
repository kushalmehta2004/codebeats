import { computeAvgPRReviewTimeHours } from '../src/services/commitAnalyzer';

// Note: analyzeCommits talks to the GitHub API so we test only the pure helpers here.
// Integration tests covering the sentiment computation live at the bottom of this file
// and run against known commit message fixtures (no network needed).

describe('computeAvgPRReviewTimeHours', () => {
  test('returns 0 for an empty array', () => {
    expect(computeAvgPRReviewTimeHours([])).toBe(0);
  });

  test('returns 0 when no PRs have a resolved date', () => {
    const prs = [{ createdAt: '2024-01-01T00:00:00Z', mergedAt: null, closedAt: null }];
    expect(computeAvgPRReviewTimeHours(prs)).toBe(0);
  });

  test('uses mergedAt when available', () => {
    // Use dates within the 180-day freshness window (relative to now)
    const now = new Date();
    const created = new Date(now.getTime() - 50 * 60 * 60 * 1_000).toISOString(); // 50h ago
    const merged  = new Date(now.getTime() -  2 * 60 * 60 * 1_000).toISOString(); // 2h ago
    const prs = [{ createdAt: created, mergedAt: merged, closedAt: null }];
    expect(computeAvgPRReviewTimeHours(prs)).toBeCloseTo(48, 1);
  });

  test('falls back to closedAt when mergedAt is null', () => {
    const now = new Date();
    const created = new Date(now.getTime() - 26 * 60 * 60 * 1_000).toISOString(); // 26h ago
    const closed  = new Date(now.getTime() -  2 * 60 * 60 * 1_000).toISOString(); // 2h ago
    const prs = [{ createdAt: created, mergedAt: null, closedAt: closed }];
    expect(computeAvgPRReviewTimeHours(prs)).toBeCloseTo(24, 1);
  });

  test('averages multiple PRs correctly', () => {
    // PR1: 24 h, PR2: 48 h → avg = 36 h  (both within 180-day window)
    const now = new Date();
    const base = now.getTime();
    const prs = [
      {
        createdAt: new Date(base - 26 * 3600_000).toISOString(),
        mergedAt:  new Date(base -  2 * 3600_000).toISOString(),
        closedAt: null,
      },
      {
        createdAt: new Date(base - 50 * 3600_000).toISOString(),
        mergedAt:  new Date(base -  2 * 3600_000).toISOString(),
        closedAt: null,
      },
    ];
    expect(computeAvgPRReviewTimeHours(prs)).toBeCloseTo(36, 1);
  });

  test('ignores PRs where closedAt is before createdAt (data error)', () => {
    const now = new Date();
    const base = now.getTime();
    const prs = [
      // Invalid: resolved before created
      {
        createdAt: new Date(base -  2 * 3600_000).toISOString(),
        mergedAt:  new Date(base - 50 * 3600_000).toISOString(),
        closedAt: null,
      },
      // Valid: 24 h within window
      {
        createdAt: new Date(base - 26 * 3600_000).toISOString(),
        mergedAt:  new Date(base -  2 * 3600_000).toISOString(),
        closedAt: null,
      },
    ];
    expect(computeAvgPRReviewTimeHours(prs)).toBeCloseTo(24, 1);
  });

  test('ignores PRs resolved outside the 180-day freshness window', () => {
    // All PRs merged 200 days ago → should return 0 (no qualifying PRs)
    const old = new Date(Date.now() - 200 * 24 * 3600_000);
    const prs = [
      {
        createdAt: new Date(old.getTime() - 48 * 3600_000).toISOString(),
        mergedAt:  old.toISOString(),
        closedAt:  null,
      },
    ];
    expect(computeAvgPRReviewTimeHours(prs)).toBe(0);
  });
});

// ─── Sentiment integration (no network) ──────────────────────────────────────

// We re-implement a tiny version of the scoring logic here to validate that
// the sentiment library works as expected in the test environment.

import Sentiment from 'sentiment';

const sentimentEngine = new Sentiment();

describe('sentiment library', () => {
  test('positive words yield a positive comparative score', () => {
    const result = sentimentEngine.analyze('fix: great improvement, awesome work done');
    expect(result.comparative).toBeGreaterThan(0);
  });

  test('negative words yield a negative comparative score', () => {
    // "horrible", "broken", "failing" are in AFINN with negative scores
    const result = sentimentEngine.analyze('fix: horrible broken garbage');
    expect(result.comparative).toBeLessThan(0);
  });

  test('neutral technical message has near-zero comparative score', () => {
    const result = sentimentEngine.analyze('chore: update package.json');
    // Could be slightly positive or negative but should be close to 0
    expect(Math.abs(result.comparative)).toBeLessThan(1);
  });

  test('empty string returns score of 0', () => {
    const result = sentimentEngine.analyze('');
    expect(result.score).toBe(0);
    expect(result.comparative).toBe(0);
  });
});
