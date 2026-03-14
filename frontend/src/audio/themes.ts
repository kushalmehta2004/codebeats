import type { CompositionTheme, RepoFileTypeProfile } from '../types/composition'

export interface ThemeLabel {
  id: CompositionTheme
  name: string
  description: string
}

export const THEME_OPTIONS: ThemeLabel[] = [
  {
    id: 'orchestra',
    name: 'Orchestra',
    description: 'JS → piano-like lead, CSS → strings pad, tests → percussion accents',
  },
  {
    id: 'electronic',
    name: 'Electronic',
    description: 'Synth-driven modern texture across all layers',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Sparse single-voice style with restrained harmonic layers',
  },
]

export interface ThemeMix {
  leadDb: number
  padDb: number
  bassDb: number
  textureDb: number
  percussionDb: number
  allowTextureLayers: boolean
  allowPercussion: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function getFileTypeShares(profile?: RepoFileTypeProfile | null): {
  jsShare: number
  cssShare: number
  testShare: number
} {
  const total = Math.max(1, profile?.totalFiles ?? 0)
  return {
    jsShare: clamp((profile?.jsFiles ?? 0) / total, 0, 1),
    cssShare: clamp((profile?.cssFiles ?? 0) / total, 0, 1),
    testShare: clamp((profile?.testFiles ?? 0) / total, 0, 1),
  }
}

export function getThemeMix(
  theme: CompositionTheme,
  profile?: RepoFileTypeProfile | null,
): ThemeMix {
  const { jsShare, cssShare, testShare } = getFileTypeShares(profile)

  if (theme === 'minimal') {
    return {
      leadDb: -6,
      padDb: -24,
      bassDb: -18,
      textureDb: -36,
      percussionDb: -30,
      allowTextureLayers: false,
      allowPercussion: false,
    }
  }

  if (theme === 'orchestra') {
    return {
      leadDb: -8 + jsShare * 6,
      padDb: -14 + cssShare * 8,
      bassDb: -12,
      textureDb: -20 + cssShare * 4,
      percussionDb: -18 + testShare * 10,
      allowTextureLayers: true,
      allowPercussion: true,
    }
  }

  return {
    leadDb: -10,
    padDb: -12,
    bassDb: -11,
    textureDb: -16,
    percussionDb: -22,
    allowTextureLayers: true,
    allowPercussion: false,
  }
}
