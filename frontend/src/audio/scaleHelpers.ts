/**
 * scaleHelpers.ts
 *
 * Music-theory utilities for the CodeBeats composition engine.
 * All note names use Tone.js Scientific Pitch Notation ("C4", "D#3", etc.)
 */

// ─── Chromatic reference ──────────────────────────────────────────────────────

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
type NoteName = (typeof CHROMATIC)[number]

// Semitone intervals (from root) for each scale type
const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
}

export type ScaleType = 'major' | 'minor' | 'pentatonic_major' | 'pentatonic_minor'
export type Mode = 'major' | 'minor'

// ─── Key selection ────────────────────────────────────────────────────────────

/**
 * Map a health score (0–100) to a root note.
 * Healthier repos use brighter (sharper) keys; sicker repos use darker (flatter) keys.
 */
export function selectRootNote(healthScore: number): NoteName {
  // Segments: 0–20 → F#, 21–35 → Bb, 36–50 → Eb, 51–65 → F, 66–78 → G, 79–89 → C, 90–100 → D
  if (healthScore >= 90) return 'D'
  if (healthScore >= 79) return 'C'
  if (healthScore >= 66) return 'G'
  if (healthScore >= 51) return 'F'
  if (healthScore >= 36) return 'D#'  // Eb
  if (healthScore >= 21) return 'A#'  // Bb
  return 'F#'
}

/**
 * Choose the scale type based on mode and harmonic complexity.
 * - Low complexity + major  → diatonic major (full, bright)
 * - High complexity + minor → diatonic minor (full, tense)
 * - Very high complexity    → pentatonic (limits available dissonance somewhat)
 * The pentatonic path is a safety valve so even very sick repos stay listenable.
 */
export function selectScaleType(mode: Mode, harmonicComplexity: number): ScaleType {
  if (harmonicComplexity > 0.75) {
    return mode === 'major' ? 'pentatonic_major' : 'pentatonic_minor'
  }
  return mode
}

// ─── Scale note generation ────────────────────────────────────────────────────

function chromaticIndex(note: NoteName): number {
  return CHROMATIC.indexOf(note)
}

function noteAtInterval(root: NoteName, semitones: number, octave: number): string {
  const rootIdx = chromaticIndex(root)
  const totalSemitones = rootIdx + semitones
  const noteIdx = ((totalSemitones % 12) + 12) % 12
  const octaveShift = Math.floor(totalSemitones / 12)
  return `${CHROMATIC[noteIdx]}${octave + octaveShift}`
}

/**
 * Return all notes in a scale across one or more octaves.
 * @param root    Root note name (e.g. 'C')
 * @param type    Scale type
 * @param octave  Starting octave (default 4)
 * @param span    Number of octaves to span (default 2)
 */
export function getScaleNotes(
  root: NoteName,
  type: ScaleType,
  octave = 4,
  span = 2,
): string[] {
  const intervals = SCALE_INTERVALS[type]
  const notes: string[] = []
  for (let o = 0; o < span; o++) {
    for (const semitones of intervals) {
      notes.push(noteAtInterval(root, semitones + o * 12, octave))
    }
  }
  return notes
}

/**
 * Pick a random note from the scale, weighted towards the middle octave.
 * Used when the composition engine needs a melodic note.
 */
export function randomScaleNote(scaleNotes: string[]): string {
  // Weight centre of the array more strongly for mid-register emphasis
  const mid = Math.floor(scaleNotes.length / 2)
  const weights = scaleNotes.map((_, i) => 1 / (1 + Math.abs(i - mid)))
  const total = weights.reduce((a, b) => a + b, 0)
  let rand = Math.random() * total
  for (let i = 0; i < scaleNotes.length; i++) {
    rand -= weights[i]
    if (rand <= 0) return scaleNotes[i]
  }
  return scaleNotes[mid]
}

// ─── Chord building ───────────────────────────────────────────────────────────

// Triad intervals for each chord degree in a major/minor key (root = 0)
// Degree indices 0–6 correspond to scale degrees I–VII
const MAJOR_TRIAD_OFFSETS: [number, number, number][] = [
  [0, 4, 7],   // I   major
  [2, 5, 9],   // ii  minor
  [4, 7, 11],  // iii minor
  [5, 9, 0],   // IV  major  (0 wraps to next octave; handled below)
  [7, 11, 2],  // V   major
  [9, 0, 4],   // vi  minor
  [11, 2, 5],  // vii diminished
]

const MINOR_TRIAD_OFFSETS: [number, number, number][] = [
  [0, 3, 7],   // i   minor
  [2, 5, 8],   // ii  dim
  [3, 7, 10],  // III major
  [5, 8, 0],   // iv  minor
  [7, 10, 2],  // v   minor
  [8, 0, 3],   // VI  major
  [10, 2, 5],  // VII major
]

export type ChordDegree = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * Build a chord (triad or extended) at a given scale degree.
 * @param root               Root note of the key
 * @param mode               'major' or 'minor'
 * @param degree             Scale degree 0–6 (I–VII)
 * @param harmonicComplexity 0–1: adds 7th at >0.4, flat-9 at >0.75
 * @param octave             Base octave (default 3 for comping register)
 */
export function buildChord(
  root: NoteName,
  mode: Mode,
  degree: ChordDegree,
  harmonicComplexity: number,
  octave = 3,
): string[] {
  const offsets =
    mode === 'major'
      ? MAJOR_TRIAD_OFFSETS[degree]
      : MINOR_TRIAD_OFFSETS[degree]

  const notes = offsets.map((semitones) => noteAtInterval(root, semitones, octave))

  // Add 7th for mid-level complexity
  if (harmonicComplexity > 0.4) {
    const seventh = mode === 'major' ? offsets[0] + 11 : offsets[0] + 10
    notes.push(noteAtInterval(root, seventh, octave))
  }

  // Add flat-9 tension for high complexity (creates dissonance within structure)
  if (harmonicComplexity > 0.75) {
    notes.push(noteAtInterval(root, offsets[0] + 1, octave + 1))
  }

  return notes
}

// ─── Chord progressions ───────────────────────────────────────────────────────

export interface ChordProgression {
  /** Section name → array of scale degrees to play in order */
  intro: ChordDegree[]
  theme: ChordDegree[]
  development: ChordDegree[]
  resolution: ChordDegree[]
}

/**
 * Choose a chord progression based on mode and overall health.
 * Healthier repos get more pleasant, resolved progressions.
 * Sicker repos get unresolved, darker progressions.
 */
export function getChordProgression(mode: Mode, healthScore: number): ChordProgression {
  // Four health tiers
  if (healthScore >= 75) {
    // Excellent health — bright, resolved, classic
    return mode === 'major'
      ? { intro: [0, 3], theme: [0, 3, 4, 0], development: [5, 3, 4, 0], resolution: [3, 4, 0, 0] }
      : { intro: [0, 5], theme: [0, 5, 3, 0], development: [3, 5, 6, 0], resolution: [5, 6, 0, 0] }
  }
  if (healthScore >= 50) {
    // Moderate health — some tension, still mostly resolved
    return mode === 'major'
      ? { intro: [0, 1], theme: [0, 5, 3, 4], development: [1, 6, 4, 0], resolution: [5, 3, 4, 0] }
      : { intro: [0, 3], theme: [0, 6, 3, 4], development: [1, 6, 4, 0], resolution: [6, 3, 4, 0] }
  }
  if (healthScore >= 25) {
    // Poor health — unresolved, darker
    return mode === 'major'
      ? { intro: [5, 6], theme: [0, 6, 3, 1], development: [1, 6, 6, 4], resolution: [6, 1, 4, 0] }
      : { intro: [0, 1], theme: [0, 1, 6, 4], development: [1, 6, 1, 4], resolution: [1, 6, 4, 0] }
  }
  // Very poor health — tension-heavy, barely resolves
  return mode === 'major'
    ? { intro: [6, 1], theme: [1, 6, 4, 1], development: [6, 1, 6, 4], resolution: [1, 4, 1, 0] }
    : { intro: [1, 6], theme: [0, 1, 6, 1], development: [1, 6, 1, 0], resolution: [1, 0, 1, 0] }
}

// ─── Dissonance – note alteration ────────────────────────────────────────────

/**
 * Optionally replace a note with a slightly dissonant neighbour.
 * At dissonance=0 always returns the original note unchanged.
 * At dissonance=1 replaces ~60% of notes with a semitone neighbour.
 *
 * @param note       Tone.js note string ("C4")
 * @param dissonance 0–1
 */
export function applyDissonance(note: string, dissonance: number): string {
  if (dissonance <= 0 || Math.random() > dissonance * 0.6) return note
  // Parse note name and octave
  const match = note.match(/^([A-G]#?)(\d)$/)
  if (!match) return note
  const [, name, octStr] = match
  const oct = parseInt(octStr, 10)
  const idx = CHROMATIC.indexOf(name as NoteName)
  if (idx === -1) return note
  // Shift up or down one semitone
  const shift = Math.random() < 0.5 ? 1 : -1
  const newIdx = ((idx + shift + 12) % 12)
  const octShift = idx + shift < 0 ? -1 : idx + shift >= 12 ? 1 : 0
  return `${CHROMATIC[newIdx]}${oct + octShift}`
}

// ─── Rhythm patterns ─────────────────────────────────────────────────────────

export type ToneDuration = '1n' | '2n' | '4n' | '8n' | '16n' | '4n.' | '8n.' | '2t' | '4t' | '8t'
export type RhythmCell = ToneDuration | null  // null = rest

/**
 * Generate one bar of rhythm cells.
 * - rhythmicStability=1 → steady quarter or 8th notes, no rests
 * - rhythmicStability=0 → irregular mix of 16ths, triplets, syncopation, many rests
 * - silenceRatio 0–1 increases chance of null (rest) cells
 *
 * Returns an array of (duration | null) representing successive beats/subdivisions.
 */
export function generateRhythmBar(
  rhythmicStability: number,
  silenceRatio: number,
): RhythmCell[] {
  // Stable patterns (use directly at high stability)
  const stablePatterns: ToneDuration[][] = [
    ['4n', '4n', '4n', '4n'],
    ['8n', '8n', '8n', '8n', '8n', '8n', '8n', '8n'],
    ['4n.', '8n', '4n', '4n'],
  ]

  // Unstable patterns (use at low stability)
  const unstablePatterns: ToneDuration[][] = [
    ['16n', '8n', '16n', '8n.', '16n', '8n', '4n'],
    ['8t', '8t', '8t', '8t', '8t', '8t', '4n'],
    ['4n', '16n', '16n', '8n', '8t', '8t', '8t'],
    ['16n', '16n', '8n.', '4t', '4t', '4t'],
  ]

  let baseCells: ToneDuration[]
  if (rhythmicStability > 0.6) {
    baseCells = stablePatterns[Math.floor(Math.random() * stablePatterns.length)]
  } else if (rhythmicStability > 0.3) {
    // Mix
    const stableChoice = stablePatterns[Math.floor(Math.random() * stablePatterns.length)]
    const unstableChoice = unstablePatterns[Math.floor(Math.random() * unstablePatterns.length)]
    baseCells = Math.random() < rhythmicStability ? stableChoice : unstableChoice
  } else {
    baseCells = unstablePatterns[Math.floor(Math.random() * unstablePatterns.length)]
  }

  // Apply silence (replace cells with null rests)
  return baseCells.map((cell): RhythmCell => {
    if (Math.random() < silenceRatio * 0.5) return null
    return cell
  })
}

// ─── Velocity / dynamics ─────────────────────────────────────────────────────

/**
 * Map a 0–1 intensity to a Tone.js velocity (0.0–1.0).
 * Shaped with a gentle curve so extremes are avoided.
 */
export function intensityToVelocity(intensity: number, baseVelocity = 0.7): number {
  const scaled = baseVelocity * (0.4 + intensity * 0.6)
  return Math.max(0.05, Math.min(1.0, scaled))
}

/**
 * Map articulationSharpness (0=legato, 1=staccato) to a note duration fraction.
 * Returns a multiplier: 1.0 = full note duration, 0.2 = very short staccato.
 */
export function articulationMultiplier(articulationSharpness: number): number {
  return 1.0 - articulationSharpness * 0.8  // 0.2 → 1.0
}
