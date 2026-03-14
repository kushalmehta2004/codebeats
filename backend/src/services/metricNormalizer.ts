import type {
  RawMetrics,
  NormalizedMetrics,
  CompositionConfig,
  MetricDetail,
  MetricRating,
} from '../types';

// ─── Normalisation helpers ────────────────────────────────────────────────────

/**
 * Linear clamp: maps `value` from [lo, hi] to [0, 1].
 * Values below `lo` return 0; values above `hi` return 1.
 */
function clamp01(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

// ─── Normalisation reference points ──────────────────────────────────────────
//
// Each pair is (best_raw_value → 0, worst_raw_value → 1) OR
//              (worst_raw_value → 0, best_raw_value → 1)
// depending on the metric direction.
//
// Sources: Google engineering standards, SonarQube quality gates, and
// industry benchmarks for mid-sized open-source projects.

const BENCHMARKS = {
  // "lower is better" — 0 = good, 1 = bad
  complexity:    { lo: 1,    hi: 20   },  // cyclomatic complexity per function
  duplication:   { lo: 0,    hi: 0.40 },  // fraction of duplicated code blocks
  bugDensity:    { lo: 0,    hi: 0.02 },  // open issues per LOC
  funcLength:    { lo: 10,   hi: 100  },  // average function length in lines
  deadCode:      { lo: 0,    hi: 0.50 },  // fraction of dead files
  importDensity: { lo: 0,    hi: 50   },  // average imports per file
  prReviewHrs:   { lo: 0,    hi: 720  },  // average PR review time in hours (30 days)
  // "higher is better" — 0 = bad, 1 = good
  testCoverage:  { lo: 0,    hi: 0.30 },  // test/total LOC ratio (30% ratio ≈ well tested)
  commitFreq:    { lo: 0,    hi: 100  },  // commits in last 90 days
  // sentiment is already in [-1, 1]; we map to [0, 1] separately
} as const;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Normalises all raw metric values to the [0, 1] range using empirical
 * reference benchmarks.  Semantics of the output values:
 *  - "bad" metrics (complexity, duplication…): 0 = excellent, 1 = terrible
 *  - "good" metrics (test coverage, commit freq…): 0 = terrible, 1 = excellent
 *
 * The composition engine uses these values as direct musical intensity
 * parameters, so the direction is intentional and consistent.
 */
export function normalizeMetrics(raw: RawMetrics): NormalizedMetrics {
  return {
    cyclomaticComplexity: clamp01(raw.avgCyclomaticComplexity, BENCHMARKS.complexity.lo, BENCHMARKS.complexity.hi),
    testCoverage:        clamp01(raw.testCoverageProxy,        BENCHMARKS.testCoverage.lo, BENCHMARKS.testCoverage.hi),
    duplication:         clamp01(raw.duplicationRatio,         BENCHMARKS.duplication.lo,  BENCHMARKS.duplication.hi),
    bugDensity:          clamp01(raw.bugDensity,               BENCHMARKS.bugDensity.lo,   BENCHMARKS.bugDensity.hi),
    avgFunctionLength:   clamp01(raw.avgFunctionLength,        BENCHMARKS.funcLength.lo,   BENCHMARKS.funcLength.hi),
    commitFrequency:     clamp01(raw.commitFrequency,          BENCHMARKS.commitFreq.lo,   BENCHMARKS.commitFreq.hi),
    // raw.commitSentiment is in [-1, 1]; map to [0, 1]
    commitSentiment:     (raw.commitSentiment + 1) / 2,
    deadCode:            clamp01(raw.deadCodeRatio,            BENCHMARKS.deadCode.lo,     BENCHMARKS.deadCode.hi),
    // File count and LOC are used for musical parameters (voice count, duration)
    fileCount:           clamp01(raw.fileCount,   1,     1_000),
    totalLOC:            clamp01(raw.totalLOC,    100,  50_000),
    importDensity:       clamp01(raw.importDensity,     BENCHMARKS.importDensity.lo, BENCHMARKS.importDensity.hi),
    avgPRReviewTime:     clamp01(raw.avgPRReviewTimeHours, BENCHMARKS.prReviewHrs.lo, BENCHMARKS.prReviewHrs.hi),
  };
}

/**
 * Computes the overall codebase health score on a 0–100 scale.
 *
 * Each normalised metric is converted to a "goodness" value (1 = best),
 * then combined as a weighted average.  Weights reflect the relative
 * importance of each metric for production-software health.
 */
export function computeHealthScore(n: NormalizedMetrics): number {
  const components: Array<[number, number]> = [
    // [goodness value, weight]
    [n.testCoverage,              0.20],
    [1 - n.cyclomaticComplexity,  0.15],
    [1 - n.bugDensity,            0.20],
    [1 - n.duplication,           0.10],
    [n.commitFrequency,           0.10],
    [n.commitSentiment,           0.05],
    [1 - n.avgFunctionLength,     0.10],
    [1 - n.deadCode,              0.05],
    [1 - n.importDensity,         0.05],
  ];

  const total = components.reduce((acc, [val, w]) => acc + val * w, 0);
  const weightSum = components.reduce((acc, [, w]) => acc + w, 0);

  return Math.max(0, Math.min(100, Math.round((total / weightSum) * 100)));
}

/**
 * Maps a normalised "goodness" value (0–1, higher = better) to a rating label.
 */
function getRating(goodness: number): MetricRating {
  if (goodness >= 0.80) return 'excellent';
  if (goodness >= 0.60) return 'good';
  if (goodness >= 0.40) return 'moderate';
  return 'poor';
}

/**
 * Builds the array of `MetricDetail` cards for the UI metrics panel.
 * Each card exposes the raw value, normalised value, rating, and
 * the musical property it maps to.
 */
export function buildMetricDetails(raw: RawMetrics, n: NormalizedMetrics): MetricDetail[] {
  return [
    {
      name: 'cyclomaticComplexity',
      display: 'Cyclomatic Complexity',
      rawValue: parseFloat(raw.avgCyclomaticComplexity.toFixed(1)),
      rawUnit: 'avg per fn',
      normalizedValue: n.cyclomaticComplexity,
      rating: getRating(1 - n.cyclomaticComplexity),
      musicalMapping: 'Harmonic complexity / chord tension',
    },
    {
      name: 'testCoverage',
      display: 'Test Coverage (proxy)',
      rawValue: Math.round(raw.testCoverageProxy * 100),
      rawUnit: '%',
      normalizedValue: n.testCoverage,
      rating: getRating(n.testCoverage),
      musicalMapping: 'Rhythmic stability (regular vs erratic beat)',
    },
    {
      name: 'duplication',
      display: 'Code Duplication',
      rawValue: parseFloat((raw.duplicationRatio * 100).toFixed(1)),
      rawUnit: '%',
      normalizedValue: n.duplication,
      rating: getRating(1 - n.duplication),
      musicalMapping: 'Melodic repetition (motif frequency)',
    },
    {
      name: 'bugDensity',
      display: 'Bug Density',
      rawValue: parseFloat(raw.bugDensity.toFixed(4)),
      rawUnit: 'issues / LOC',
      normalizedValue: n.bugDensity,
      rating: getRating(1 - n.bugDensity),
      musicalMapping: 'Dissonance level (out-of-tune intervals)',
    },
    {
      name: 'avgFunctionLength',
      display: 'Avg Function Length',
      rawValue: Math.round(raw.avgFunctionLength),
      rawUnit: 'lines',
      normalizedValue: n.avgFunctionLength,
      rating: getRating(1 - n.avgFunctionLength),
      musicalMapping: 'Phrase length (note / phrase duration)',
    },
    {
      name: 'commitFrequency',
      display: 'Commit Frequency',
      rawValue: raw.commitFrequency,
      rawUnit: 'commits / 90d',
      normalizedValue: n.commitFrequency,
      rating: getRating(n.commitFrequency),
      musicalMapping: 'Tempo (BPM)',
    },
    {
      name: 'commitSentiment',
      display: 'Commit Sentiment',
      rawValue: parseFloat(raw.commitSentiment.toFixed(2)),
      rawUnit: 'score',
      normalizedValue: n.commitSentiment,
      rating: getRating(n.commitSentiment),
      musicalMapping: 'Musical mode (major = positive, minor = negative)',
    },
    {
      name: 'deadCode',
      display: 'Dead Code Estimate',
      rawValue: parseFloat((raw.deadCodeRatio * 100).toFixed(1)),
      rawUnit: '%',
      normalizedValue: n.deadCode,
      rating: getRating(1 - n.deadCode),
      musicalMapping: 'Silence / rests',
    },
    {
      name: 'importDensity',
      display: 'Coupling (Import Density)',
      rawValue: parseFloat(raw.importDensity.toFixed(1)),
      rawUnit: 'imports / file',
      normalizedValue: n.importDensity,
      rating: getRating(1 - n.importDensity),
      musicalMapping: 'Harmonic interdependence (chord clusters)',
    },
    {
      name: 'fileCount',
      display: 'File Count',
      rawValue: raw.fileCount,
      rawUnit: 'files',
      normalizedValue: n.fileCount,
      rating: 'good', // Not a quality indicator, just a scale parameter
      musicalMapping: 'Number of instruments / voices',
    },
    {
      name: 'avgPRReviewTime',
      display: 'Avg PR Review Time',
      rawValue: Math.round(raw.avgPRReviewTimeHours),
      rawUnit: 'hours',
      normalizedValue: n.avgPRReviewTime,
      rating: getRating(1 - n.avgPRReviewTime),
      musicalMapping: 'Note articulation (staccato vs legato)',
    },
  ];
}

/**
 * Builds the `CompositionConfig` that the Tone.js engine will consume.
 * Every musical parameter is derived directly from the normalised metrics
 * using the mappings defined in the PRD.
 */
export function buildCompositionConfig(n: NormalizedMetrics): CompositionConfig {
  // Tempo: 60 BPM (dormant repo) to 140 BPM (very active repo)
  const tempo = Math.round(60 + n.commitFrequency * 80);

  // Mode: positive sentiment → major; negative → minor
  const mode: 'major' | 'minor' = n.commitSentiment >= 0.5 ? 'major' : 'minor';

  // Duration: 45 s (tiny repo) to 90 s (large repo)
  const totalDurationSeconds = Math.round(45 + n.totalLOC * 45);

  // Voices: 1 (single file) to 8 (large multi-file project)
  const voiceCount = Math.max(1, Math.min(8, Math.round(1 + n.fileCount * 7)));

  return {
    tempo,
    mode,
    dissonance:            n.bugDensity,
    rhythmicStability:     n.testCoverage,
    motifRepetition:       n.duplication,
    phraseLengthMultiplier: n.avgFunctionLength,
    silenceRatio:          n.deadCode,
    voiceCount,
    harmonicComplexity:    n.cyclomaticComplexity,
    // Fast reviews → staccato (sharp = 1); slow reviews → legato (sharp = 0)
    articulationSharpness: 1 - n.avgPRReviewTime,
    totalDurationSeconds,
  };
}
