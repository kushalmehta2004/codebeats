// ─── GitHub API shapes ───────────────────────────────────────────────────────

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTree {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface GitHubRepoInfo {
  defaultBranch: string;
  starCount: number;
  openIssues: number;
  sizeKb: number;
}

export interface CommitData {
  sha: string;
  message: string;
  date: string;
  author: string;
}

export interface GitHubPR {
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

// ─── Parsed file ─────────────────────────────────────────────────────────────

export interface ParsedFile {
  path: string;
  content: string;
  loc: number;
}

// ─── Per-file analysis ───────────────────────────────────────────────────────

export interface FunctionMetric {
  name: string;
  loc: number;
  complexity: number;
  params: number;
}

export interface FileMetrics {
  path: string;
  loc: number;
  functions: FunctionMetric[];
  /** Raw import source strings (e.g. 'react', './utils') */
  imports: string[];
  /** Exported identifier names */
  exports: string[];
  isTestFile: boolean;
  parseError?: string;
}

// ─── Commit analysis ─────────────────────────────────────────────────────────

export interface CommitAnalysis {
  commitCount: number;
  /** Number of commits in the last 90 days (used directly as frequency metric) */
  commitFrequencyPer90Days: number;
  /** Weighted average sentiment score, range -1 to 1 */
  avgSentiment: number;
  sentimentLabel: 'very positive' | 'positive' | 'neutral' | 'negative' | 'very negative';
}

// ─── Aggregated metrics ───────────────────────────────────────────────────────

export interface RawMetrics {
  totalLOC: number;
  fileCount: number;
  avgCyclomaticComplexity: number;
  avgFunctionLength: number;
  /** Average number of import statements per file */
  importDensity: number;
  /** Fraction 0–1: non-test files with exports that are never imported anywhere */
  deadCodeRatio: number;
  /** Fraction 0–1: duplicated code blocks relative to total blocks */
  duplicationRatio: number;
  /** Fraction 0–1 proxy: (test LOC) / (total LOC) mapped to a coverage estimate */
  testCoverageProxy: number;
  commitFrequency: number;
  commitSentiment: number;
  /** open issues / (totalLOC / 1000) */
  bugDensity: number;
  openIssueCount: number;
  /** Average hours from PR created_at to merged_at/closed_at */
  avgPRReviewTimeHours: number;
}

// ─── Normalized metrics (all values 0–1) ─────────────────────────────────────

/**
 * All values are 0–1.
 * For "bad" metrics (complexity, duplication, etc.) HIGHER means WORSE.
 * For "good" metrics (testCoverage, commitFrequency, commitSentiment) HIGHER means BETTER.
 * The composition engine uses these values directly as musical intensity parameters.
 */
export interface NormalizedMetrics {
  /** 0=simple, 1=very complex */
  cyclomaticComplexity: number;
  /** 0=no tests, 1=well tested */
  testCoverage: number;
  /** 0=no duplication, 1=highly duplicated */
  duplication: number;
  /** 0=no bugs, 1=very buggy */
  bugDensity: number;
  /** 0=short functions, 1=very long functions */
  avgFunctionLength: number;
  /** 0=dormant, 1=very active */
  commitFrequency: number;
  /** 0=very negative sentiment, 1=very positive */
  commitSentiment: number;
  /** 0=no dead code, 1=lots of dead code */
  deadCode: number;
  /** 0=tiny project, 1=massive project (used for voice count) */
  fileCount: number;
  /** 0=tiny project, 1=huge project (used for duration) */
  totalLOC: number;
  /** 0=modular, 1=tightly coupled */
  importDensity: number;
  /** 0=fast reviews, 1=very slow reviews */
  avgPRReviewTime: number;
}

// ─── Metric detail card ───────────────────────────────────────────────────────

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

// ─── Composition config ───────────────────────────────────────────────────────

export interface CompositionConfig {
  /** Beats per minute: 60–140 driven by commit frequency */
  tempo: number;
  /** major = positive sentiment, minor = negative sentiment */
  mode: 'major' | 'minor';
  /** 0–1: out-of-tune intervals driven by bug density */
  dissonance: number;
  /** 0–1: beat regularity driven by test coverage */
  rhythmicStability: number;
  /** 0–1: melodic repetition driven by duplication ratio */
  motifRepetition: number;
  /** 0–1: phrase length multiplier driven by avg function length */
  phraseLengthMultiplier: number;
  /** 0–1: silence/rest ratio driven by dead code */
  silenceRatio: number;
  /** 1–8: number of instruments/voices driven by file count */
  voiceCount: number;
  /** 0–1: chord tension driven by cyclomatic complexity */
  harmonicComplexity: number;
  /** 0–1: staccato(1) vs legato(0) driven by PR review time */
  articulationSharpness: number;
  /** Total composition duration in seconds (45–90) */
  totalDurationSeconds: number;
}

export interface RepoFileTypeProfile {
  totalFiles: number;
  jsFiles: number;
  cssFiles: number;
  testFiles: number;
  otherFiles: number;
}

// ─── Final analysis result ───────────────────────────────────────────────────

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
