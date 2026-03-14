import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Tone from 'tone'

import { CompositionEngine } from '../audio/CompositionEngine'
import { audioBufferToWavBlob, triggerBlobDownload } from '../audio/wavExport'
import type {
  AnalysisResult,
  CompositionAnnotation,
  CompositionTheme,
  CompositionSection,
  PlaybackStatus,
} from '../types/composition'

function getApiAnalyzeEndpoint(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!baseUrl || baseUrl.trim() === '') {
    return '/api/analyze'
  }
  return `${baseUrl.replace(/\/$/, '')}/api/analyze`
}

function getApiShareEndpoint(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!baseUrl || baseUrl.trim() === '') {
    return '/api/share'
  }
  return `${baseUrl.replace(/\/$/, '')}/api/share`
}

function normalizeGitHubUrl(input: string): string {
  const trimmed = input.trim()
  if (trimmed.length === 0) return ''

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    if (!/^(www\.)?github\.com$/i.test(url.hostname)) return ''
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return ''
    return `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/i, '')}`
  } catch {
    return ''
  }
}

async function analyzeRepoRequest(repoUrl: string): Promise<AnalysisResult> {
  const response = await fetch(getApiAnalyzeEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: repoUrl }),
  })

  if (!response.ok) {
    let message = `Analyze request failed (${response.status})`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) {
        message = payload.error
      }
    } catch {
      // fall back to status text only
    }
    throw new Error(message)
  }

  return response.json() as Promise<AnalysisResult>
}

export interface UseCompositionResult {
  analysis: AnalysisResult | null
  status: PlaybackStatus
  sections: CompositionSection[]
  annotations: CompositionAnnotation[]
  isAnalyzing: boolean
  error: string | null
  selectedTheme: CompositionTheme
  setSelectedTheme: (theme: CompositionTheme) => void
  analyzeRepository: (repoUrl: string) => Promise<void>
  play: () => Promise<void>
  pause: () => void
  stop: () => void
  restart: () => Promise<void>
  clearError: () => void
  progressRatio: number
  activeAnnotationIndex: number
  createShareUrl: () => Promise<string | null>
  loadSharedAnalysis: (shareId: string) => Promise<void>
  exportWav: () => Promise<void>
}

export function useComposition(): UseCompositionResult {
  const engineRef = useRef<CompositionEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = new CompositionEngine()
  }

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [sections, setSections] = useState<CompositionSection[]>([])
  const [annotations, setAnnotations] = useState<CompositionAnnotation[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<CompositionTheme>('electronic')
  const [status, setStatus] = useState<PlaybackStatus>({
    state: 'idle',
    currentTime: 0,
    totalTime: 0,
    currentSection: null,
    currentAnnotation: null,
  })

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    engine.setStatusListener((nextStatus) => {
      setStatus(nextStatus)
    })

    return () => {
      engine.setStatusListener(null)
      engine.dispose()
    }
  }, [])

  const analyzeRepository = useCallback(async (repoUrl: string) => {
    const normalizedUrl = normalizeGitHubUrl(repoUrl)
    if (!normalizedUrl) {
      setError('Enter a valid GitHub repository URL (example: https://github.com/owner/repo)')
      return
    }

    setError(null)
    setIsAnalyzing(true)

    try {
      const engine = engineRef.current
      if (!engine) {
        throw new Error('Audio engine is not initialized')
      }

      engine.stop()

      const result = await analyzeRepoRequest(normalizedUrl)

      await engine.load(result.compositionConfig, result.healthScore, {
        theme: selectedTheme,
        fileTypeProfile: result.fileTypeProfile,
      })

      setAnalysis(result)
      setSections(engine.getSections())
      setAnnotations(engine.getAnnotations())
      setStatus(engine.getStatus())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze repository'
      setError(message)
    } finally {
      setIsAnalyzing(false)
    }
  }, [selectedTheme])

  const updateSelectedTheme = useCallback((theme: CompositionTheme) => {
    setSelectedTheme(theme)
    engineRef.current?.setTheme(theme)
  }, [])

  const play = useCallback(async () => {
    if (!analysis) {
      setError('Analyze a repository first')
      return
    }

    try {
      setError(null)
      await engineRef.current?.play()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Playback failed'
      setError(message)
    }
  }, [analysis])

  const pause = useCallback(() => {
    engineRef.current?.pause()
  }, [])

  const stop = useCallback(() => {
    engineRef.current?.stop()
  }, [])

  const restart = useCallback(async () => {
    if (!analysis) {
      setError('Analyze a repository first')
      return
    }

    try {
      setError(null)
      await engineRef.current?.restart()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restart failed'
      setError(message)
    }
  }, [analysis])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const createShareUrl = useCallback(async (): Promise<string | null> => {
    if (!analysis) {
      setError('Analyze a repository first')
      return null
    }

    try {
      const response = await fetch(getApiShareEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      })

      if (!response.ok) {
        throw new Error(`Share request failed (${response.status})`)
      }

      const payload = (await response.json()) as { id?: string }
      if (!payload.id) throw new Error('Missing share id in response')

      const url = `${window.location.origin}${window.location.pathname}?share=${payload.id}`
      await navigator.clipboard.writeText(url)
      return url
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create share URL'
      setError(message)
      return null
    }
  }, [analysis])

  const loadSharedAnalysis = useCallback(async (shareId: string) => {
    if (!shareId) return

    setIsAnalyzing(true)
    setError(null)

    try {
      const response = await fetch(`${getApiShareEndpoint()}/${encodeURIComponent(shareId)}`)
      if (!response.ok) {
        throw new Error(`Share load failed (${response.status})`)
      }
      const payload = (await response.json()) as { analysis?: AnalysisResult }
      if (!payload.analysis) {
        throw new Error('Invalid share payload')
      }

      const engine = engineRef.current
      if (!engine) {
        throw new Error('Audio engine is not initialized')
      }

      engine.stop()
      await engine.load(payload.analysis.compositionConfig, payload.analysis.healthScore, {
        theme: selectedTheme,
        fileTypeProfile: payload.analysis.fileTypeProfile,
      })

      setAnalysis(payload.analysis)
      setSections(engine.getSections())
      setAnnotations(engine.getAnnotations())
      setStatus(engine.getStatus())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load shared analysis'
      setError(message)
    } finally {
      setIsAnalyzing(false)
    }
  }, [selectedTheme])

  const exportWav = useCallback(async () => {
    if (!analysis) {
      setError('Analyze a repository first')
      return
    }

    try {
      setError(null)
      const duration = analysis.compositionConfig.totalDurationSeconds
      const offlineBuffer = await Tone.Offline(({ transport }) => {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: analysis.compositionConfig.mode === 'major' ? 'triangle' : 'sawtooth' },
        }).toDestination()

        const notes = analysis.compositionConfig.mode === 'major'
          ? ['C4', 'E4', 'G4', 'B4']
          : ['C4', 'D#4', 'G4', 'A#4']

        const stepSeconds = Math.max(0.25, 60 / Math.max(60, analysis.compositionConfig.tempo))
        const eventCount = Math.floor(duration / stepSeconds)
        for (let index = 0; index < eventCount; index += 1) {
          const note = notes[index % notes.length]
          const velocity = 0.4 + (analysis.compositionConfig.rhythmicStability * 0.4)
          synth.triggerAttackRelease(note, `${Math.max(0.1, stepSeconds * 0.7)}`, index * stepSeconds, velocity)
        }

        transport.start()
      }, duration)

      const nativeBuffer = offlineBuffer.get()
      if (!nativeBuffer) {
        throw new Error('Offline renderer did not produce an audio buffer')
      }
      const wavBlob = audioBufferToWavBlob(nativeBuffer)
      const safeRepo = `${analysis.owner}-${analysis.repo}`.replace(/[^a-z0-9-]/gi, '_').toLowerCase()
      triggerBlobDownload(wavBlob, `${safeRepo}-codebeats.wav`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'WAV export failed'
      setError(message)
    }
  }, [analysis])

  const progressRatio = useMemo(() => {
    if (status.totalTime <= 0) return 0
    return Math.max(0, Math.min(1, status.currentTime / status.totalTime))
  }, [status.currentTime, status.totalTime])

  const activeAnnotationIndex = useMemo(() => {
    if (!status.currentAnnotation) return -1
    return annotations.findIndex((annotation) =>
      annotation.timeSeconds === status.currentAnnotation?.timeSeconds
      && annotation.metricName === status.currentAnnotation?.metricName
      && annotation.label === status.currentAnnotation?.label,
    )
  }, [annotations, status.currentAnnotation])

  return {
    analysis,
    status,
    sections,
    annotations,
    isAnalyzing,
    error,
    selectedTheme,
    setSelectedTheme: updateSelectedTheme,
    analyzeRepository,
    play,
    pause,
    stop,
    restart,
    clearError,
    progressRatio,
    activeAnnotationIndex,
    createShareUrl,
    loadSharedAnalysis,
    exportWav,
  }
}
