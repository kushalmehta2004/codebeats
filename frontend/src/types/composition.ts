// ─── API response shapes (mirrors backend src/types/index.ts) ─────────────────

export interface RawMetrics {
  totalLOC: number;
  fileCount: number;
  avgCyclomaticComplexity: number;
  avgFunctionLength: number;
  importDensity: number;
  deadCodeRatio: number;
  duplicationRatio: number;
  testCoverageProxy: number;
  commitFrequency: number;
  commitSentiment: number;
  bugDensity: number;
  openIssueCount: number;
  avgPRReviewTimeHours: number;
}

export interface NormalizedMetrics {
  cyclomaticComplexity: number;
  testCoverage: number;
  duplication: number;
  bugDensity: number;
  avgFunctionLength: number;
  commitFrequency: number;
  commitSentiment: number;
  deadCode: number;
  fileCount: number;
  totalLOC: number;
  importDensity: number;
  avgPRReviewTime: number;
}

export type MetricRating = 'excellent' | 'good' | 'moderate' | 'poor';

export interface MetricDetail {
  name: string;
  display: string;
  rawValue: number;
  rawUnit: string;
  normalizedValue: number;
  rating: MetricRating;
  musicalMapping: string;
}

export interface CompositionConfig {
  /** Beats per minute: 60–140 */
  tempo: number;
  /** major = positive sentiment, minor = negative */
  mode: 'major' | 'minor';
  /** 0–1: dissonance driven by bug density */
  dissonance: number;
  /** 0–1: beat regularity driven by test coverage */
  rhythmicStability: number;
  /** 0–1: melodic repetition driven by duplication */
  motifRepetition: number;
  /** 0–1: phrase length multiplier driven by avg function length */
  phraseLengthMultiplier: number;
  /** 0–1: silence ratio driven by dead code */
  silenceRatio: number;
  /** 1–8: voice count driven by file count */
  voiceCount: number;
  /** 0–1: chord tension driven by cyclomatic complexity */
  harmonicComplexity: number;
  /** 0–1: staccato(1) vs legato(0) driven by PR review time */
  articulationSharpness: number;
  /** Total composition duration in seconds (45–90) */
  totalDurationSeconds: number;
}

export type CompositionTheme = 'orchestra' | 'electronic' | 'minimal';

export interface RepoFileTypeProfile {
  totalFiles: number;
  jsFiles: number;
  cssFiles: number;
  testFiles: number;
  otherFiles: number;
}

export interface AnalysisResult {
  repoId: string;
  repoUrl: string;
  owner: string;
  repo: string;
  analyzedAt: string;
  raw: RawMetrics;
  normalized: NormalizedMetrics;
  healthScore: number;
  metrics: MetricDetail[];
  compositionConfig: CompositionConfig;
  fileTypeProfile: RepoFileTypeProfile;
}

export interface GalleryRepoSummary {
  repoId: string;
  repoUrl: string;
  owner: string;
  repo: string;
  analyzeCount: number;
  lastHealthScore: number;
  lastTempo: number;
  lastMode: 'major' | 'minor';
  lastAnalyzedAt: string;
}

// ─── Composition section (for 4-part structure) ───────────────────────────────

export type SectionName = 'intro' | 'theme' | 'development' | 'resolution';

export interface CompositionSection {
  name: SectionName;
  startTime: number;   // seconds from start
  duration: number;    // seconds
  /** Fraction of the full config applied (e.g. intro uses softer dynamics) */
  intensityScale: number;
}

// ─── Playback state ───────────────────────────────────────────────────────────

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';

export interface PlaybackStatus {
  state: PlaybackState;
  currentTime: number;    // seconds elapsed
  totalTime: number;      // total duration in seconds
  currentSection: SectionName | null;
  currentAnnotation: CompositionAnnotation | null;
  error?: string;
}

// ─── Annotation / event ───────────────────────────────────────────────────────

export interface CompositionAnnotation {
  timeSeconds: number;
  label: string;
  metricName: string;
  value: number;
  rating: MetricRating;
}
