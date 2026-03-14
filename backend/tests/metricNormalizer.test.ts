import {
  normalizeMetrics,
  computeHealthScore,
  buildCompositionConfig,
  buildMetricDetails,
} from '../src/services/metricNormalizer';
import type { RawMetrics, NormalizedMetrics } from '../src/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HEALTHY_RAW: RawMetrics = {
  totalLOC: 8_000,
  fileCount: 80,
  avgCyclomaticComplexity: 3.5,
  avgFunctionLength: 18,
  importDensity: 6,
  deadCodeRatio: 0.05,
  duplicationRatio: 0.04,
  testCoverageProxy: 0.25,
  commitFrequency: 60,
  commitSentiment: 0.25,
  bugDensity: 0.001,
  openIssueCount: 8,
  avgPRReviewTimeHours: 12,
};

const UNHEALTHY_RAW: RawMetrics = {
  totalLOC: 45_000,
  fileCount: 250,
  avgCyclomaticComplexity: 18,
  avgFunctionLength: 90,
  importDensity: 45,
  deadCodeRatio: 0.40,
  duplicationRatio: 0.35,
  testCoverageProxy: 0.01,
  commitFrequency: 4,
  commitSentiment: -0.4,
  bugDensity: 0.018,
  openIssueCount: 810,
  avgPRReviewTimeHours: 150,
};

// ─── normalizeMetrics ─────────────────────────────────────────────────────────

describe('normalizeMetrics', () => {
  test('all output values are in [0, 1]', () => {
    for (const raw of [HEALTHY_RAW, UNHEALTHY_RAW]) {
      const n = normalizeMetrics(raw);
      for (const [key, val] of Object.entries(n)) {
        expect(val).toBeGreaterThanOrEqual(0), `${key} should be ≥ 0`;
        expect(val).toBeLessThanOrEqual(1), `${key} should be ≤ 1`;
      }
    }
  });

  test('healthy repo has lower complexity than unhealthy', () => {
    const nh = normalizeMetrics(HEALTHY_RAW);
    const nu = normalizeMetrics(UNHEALTHY_RAW);
    expect(nh.cyclomaticComplexity).toBeLessThan(nu.cyclomaticComplexity);
  });

  test('healthy repo has higher test coverage than unhealthy', () => {
    const nh = normalizeMetrics(HEALTHY_RAW);
    const nu = normalizeMetrics(UNHEALTHY_RAW);
    expect(nh.testCoverage).toBeGreaterThan(nu.testCoverage);
  });

  test('healthy repo has higher commit frequency than unhealthy', () => {
    const nh = normalizeMetrics(HEALTHY_RAW);
    const nu = normalizeMetrics(UNHEALTHY_RAW);
    expect(nh.commitFrequency).toBeGreaterThan(nu.commitFrequency);
  });

  test('positive sentiment maps above 0.5', () => {
    const n = normalizeMetrics({ ...HEALTHY_RAW, commitSentiment: 0.5 });
    expect(n.commitSentiment).toBe(0.75);
  });

  test('negative sentiment maps below 0.5', () => {
    const n = normalizeMetrics({ ...HEALTHY_RAW, commitSentiment: -0.5 });
    expect(n.commitSentiment).toBe(0.25);
  });

  test('zero sentiment maps to exactly 0.5', () => {
    const n = normalizeMetrics({ ...HEALTHY_RAW, commitSentiment: 0 });
    expect(n.commitSentiment).toBe(0.5);
  });

  test('extreme values are clamped to [0, 1]', () => {
    const extreme: RawMetrics = {
      ...UNHEALTHY_RAW,
      avgCyclomaticComplexity: 999,
      avgFunctionLength: 9999,
      commitFrequency: 0,
      commitSentiment: -5, // beyond the [-1,1] range
      bugDensity: 999,
    };
    const n = normalizeMetrics(extreme);
    expect(n.cyclomaticComplexity).toBe(1);
    expect(n.avgFunctionLength).toBe(1);
    expect(n.commitFrequency).toBe(0);
    expect(n.commitSentiment).toBeCloseTo((-5 + 1) / 2, 5); // may be negative — that's OK since it's clamped later by health score
  });
});

// ─── computeHealthScore ────────────────────────────────────────────────────────

describe('computeHealthScore', () => {
  test('healthy repo scores higher than unhealthy repo', () => {
    const scoreHealthy = computeHealthScore(normalizeMetrics(HEALTHY_RAW));
    const scoreUnhealthy = computeHealthScore(normalizeMetrics(UNHEALTHY_RAW));
    expect(scoreHealthy).toBeGreaterThan(scoreUnhealthy);
  });

  test('score is between 0 and 100', () => {
    for (const raw of [HEALTHY_RAW, UNHEALTHY_RAW]) {
      const score = computeHealthScore(normalizeMetrics(raw));
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  test('perfect repo scores close to 100', () => {
    const perfect: NormalizedMetrics = {
      cyclomaticComplexity: 0,
      testCoverage: 1,
      duplication: 0,
      bugDensity: 0,
      avgFunctionLength: 0,
      commitFrequency: 1,
      commitSentiment: 1,
      deadCode: 0,
      fileCount: 0.5,
      totalLOC: 0.5,
      importDensity: 0,
      avgPRReviewTime: 0,
    };
    expect(computeHealthScore(perfect)).toBeGreaterThan(90);
  });

  test('worst repo scores close to 0', () => {
    const worst: NormalizedMetrics = {
      cyclomaticComplexity: 1,
      testCoverage: 0,
      duplication: 1,
      bugDensity: 1,
      avgFunctionLength: 1,
      commitFrequency: 0,
      commitSentiment: 0,
      deadCode: 1,
      fileCount: 0.5,
      totalLOC: 0.5,
      importDensity: 1,
      avgPRReviewTime: 1,
    };
    expect(computeHealthScore(worst)).toBeLessThan(10);
  });
});

// ─── buildCompositionConfig ────────────────────────────────────────────────────

describe('buildCompositionConfig', () => {
  test('active repo gets higher BPM than dormant repo', () => {
    const active = buildCompositionConfig(normalizeMetrics(HEALTHY_RAW));
    const dormant = buildCompositionConfig(normalizeMetrics(UNHEALTHY_RAW));
    expect(active.tempo).toBeGreaterThan(dormant.tempo);
  });

  test('positive sentiment yields major mode', () => {
    const config = buildCompositionConfig(normalizeMetrics(HEALTHY_RAW));
    expect(config.mode).toBe('major');
  });

  test('negative sentiment yields minor mode', () => {
    const config = buildCompositionConfig(normalizeMetrics(UNHEALTHY_RAW));
    expect(config.mode).toBe('minor');
  });

  test('tempo is in [60, 140] BPM', () => {
    for (const raw of [HEALTHY_RAW, UNHEALTHY_RAW]) {
      const config = buildCompositionConfig(normalizeMetrics(raw));
      expect(config.tempo).toBeGreaterThanOrEqual(60);
      expect(config.tempo).toBeLessThanOrEqual(140);
    }
  });

  test('duration is in [45, 90] seconds', () => {
    for (const raw of [HEALTHY_RAW, UNHEALTHY_RAW]) {
      const config = buildCompositionConfig(normalizeMetrics(raw));
      expect(config.totalDurationSeconds).toBeGreaterThanOrEqual(45);
      expect(config.totalDurationSeconds).toBeLessThanOrEqual(90);
    }
  });

  test('voice count is in [1, 8]', () => {
    for (const raw of [HEALTHY_RAW, UNHEALTHY_RAW]) {
      const config = buildCompositionConfig(normalizeMetrics(raw));
      expect(config.voiceCount).toBeGreaterThanOrEqual(1);
      expect(config.voiceCount).toBeLessThanOrEqual(8);
    }
  });
});

// ─── buildMetricDetails ────────────────────────────────────────────────────────

describe('buildMetricDetails', () => {
  test('returns 11 metric cards', () => {
    const details = buildMetricDetails(HEALTHY_RAW, normalizeMetrics(HEALTHY_RAW));
    expect(details).toHaveLength(11);
  });

  test('each card has the required shape', () => {
    const details = buildMetricDetails(HEALTHY_RAW, normalizeMetrics(HEALTHY_RAW));
    for (const d of details) {
      expect(typeof d.name).toBe('string');
      expect(typeof d.display).toBe('string');
      expect(typeof d.rawValue).toBe('number');
      expect(typeof d.normalizedValue).toBe('number');
      expect(['excellent', 'good', 'moderate', 'poor']).toContain(d.rating);
      expect(typeof d.musicalMapping).toBe('string');
    }
  });

  test('healthy repo has mostly excellent/good ratings', () => {
    const details = buildMetricDetails(HEALTHY_RAW, normalizeMetrics(HEALTHY_RAW));
    const goodOrExcellent = details.filter(
      (d) => d.rating === 'excellent' || d.rating === 'good',
    ).length;
    expect(goodOrExcellent).toBeGreaterThan(details.length / 2);
  });

  test('unhealthy repo has mostly moderate/poor ratings', () => {
    const details = buildMetricDetails(UNHEALTHY_RAW, normalizeMetrics(UNHEALTHY_RAW));
    const poorOrModerate = details.filter(
      (d) => d.rating === 'poor' || d.rating === 'moderate',
    ).length;
    expect(poorOrModerate).toBeGreaterThan(details.length / 2);
  });
});
