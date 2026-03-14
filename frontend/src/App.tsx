import { useEffect, useMemo, useState } from 'react'

import { THEME_OPTIONS } from './audio/themes'
import { useComposition } from './hooks/useComposition'
import { useGallery } from './hooks/useGallery'

function App() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/expressjs/express')
  const {
    analysis,
    status,
    sections,
    annotations,
    isAnalyzing,
    error,
    selectedTheme,
    setSelectedTheme,
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
  } = useComposition()
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const {
    leaderboard,
    hallOfFame,
    hallOfShame,
    isLoading: isGalleryLoading,
    error: galleryError,
    refresh: refreshGallery,
  } = useGallery(8)

  const canControlPlayback = analysis !== null
  const progressPercent = Math.round(progressRatio * 100)

  const healthBadgeClass = useMemo(() => {
    if (!analysis) return 'border-gray-700 bg-gray-800/50 text-gray-300'
    if (analysis.healthScore >= 75) return 'border-green-700 bg-green-900/40 text-green-300'
    if (analysis.healthScore >= 55) return 'border-amber-700 bg-amber-900/40 text-amber-300'
    return 'border-red-700 bg-red-900/40 text-red-300'
  }, [analysis])

  const stateLabel = useMemo(() => {
    if (isAnalyzing) return 'analyzing'
    return status.state
  }, [isAnalyzing, status.state])

  const sectionSummary = useMemo(() => {
    return sections.map((section) => `${section.name}: ${section.duration.toFixed(1)}s`).join(' • ')
  }, [sections])

  useEffect(() => {
    if (!analysis) return
    void refreshGallery()
  }, [analysis, refreshGallery])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shareId = params.get('share')
    if (!shareId) return
    void loadSharedAnalysis(shareId)
  }, [loadSharedAnalysis])

  async function handleCreateShare() {
    const url = await createShareUrl()
    if (url) {
      setShareNotice(`Share URL copied: ${url}`)
    }
  }

  async function handleAnalyzeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await analyzeRepository(repoUrl)
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">CodeBeats</h1>
          <p className="text-gray-400">
            Turn any GitHub repository into music. Healthy code sounds like jazz.
            Legacy code sounds like a horror movie.
          </p>
        </header>

        <form onSubmit={handleAnalyzeSubmit} className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
          <label className="text-sm text-gray-300">Public GitHub repository URL</label>
          <label className="text-sm text-gray-300">Instrument theme</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {THEME_OPTIONS.map((theme) => (
              <button
                type="button"
                key={theme.id}
                onClick={() => setSelectedTheme(theme.id)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  selectedTheme === theme.id
                    ? 'border-indigo-500 bg-indigo-900/40 text-indigo-200'
                    : 'border-gray-700 bg-gray-950/70 text-gray-300 hover:bg-gray-900/80'
                }`}
              >
                <p className="font-medium">{theme.name}</p>
                <p className="text-xs text-gray-400">{theme.description}</p>
              </button>
            ))}
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repo"
              className="flex-1 rounded-lg bg-gray-950 border border-gray-700 px-4 py-3 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isAnalyzing}
              className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze & Load Composition'}
            </button>
          </div>
        </form>

        {error && (
          <div className="rounded-lg border border-red-700 bg-red-950/50 px-4 py-3 text-red-300 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={clearError} className="text-sm underline underline-offset-2">dismiss</button>
          </div>
        )}

        <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={play}
              disabled={!canControlPlayback || status.state === 'playing'}
              className="rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              Play
            </button>
            <button
              onClick={pause}
              disabled={!canControlPlayback || status.state !== 'playing'}
              className="rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500 disabled:opacity-50"
            >
              Pause
            </button>
            <button
              onClick={restart}
              disabled={!canControlPlayback}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500 disabled:opacity-50"
            >
              Restart
            </button>
            <button
              onClick={stop}
              disabled={!canControlPlayback}
              className="rounded-lg bg-gray-700 px-4 py-2 font-medium hover:bg-gray-600 disabled:opacity-50"
            >
              Stop
            </button>
            <button
              onClick={() => void exportWav()}
              disabled={!canControlPlayback}
              className="rounded-lg bg-sky-700 px-4 py-2 font-medium hover:bg-sky-600 disabled:opacity-50"
            >
              Export WAV
            </button>
            <button
              onClick={() => void handleCreateShare()}
              disabled={!canControlPlayback}
              className="rounded-lg bg-fuchsia-700 px-4 py-2 font-medium hover:bg-fuchsia-600 disabled:opacity-50"
            >
              Create Share URL
            </button>
            <span className="text-sm text-gray-300 capitalize">State: {stateLabel}</span>
          </div>

          {shareNotice && (
            <div className="rounded-lg border border-fuchsia-700 bg-fuchsia-950/40 px-3 py-2 text-xs text-fuchsia-200">
              {shareNotice}
            </div>
          )}

          <div className="space-y-2">
            <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
              <div className="h-full bg-indigo-500 transition-[width] duration-100" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>{status.currentTime.toFixed(1)}s</span>
              <span>{status.totalTime.toFixed(1)}s</span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
              <p className="text-gray-400 mb-1">Current section</p>
              <p className="font-medium capitalize">{status.currentSection ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
              <p className="text-gray-400 mb-1">What you’re hearing now</p>
              <p className="font-medium">{status.currentAnnotation?.label ?? 'No annotation yet'}</p>
            </div>
          </div>
        </section>

        {analysis && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Loaded analysis</h2>
              <span className={`text-xs px-3 py-1 rounded-full border ${healthBadgeClass}`}>
                Health {analysis.healthScore}/100
              </span>
            </div>
            <p className="text-sm text-gray-300">
              {analysis.owner}/{analysis.repo} • Tempo {analysis.compositionConfig.tempo} BPM • Mode {analysis.compositionConfig.mode}
            </p>
            <p className="text-xs text-gray-400">
              Theme: <span className="capitalize">{selectedTheme}</span> • File profile — JS/TS: {analysis.fileTypeProfile.jsFiles}, CSS: {analysis.fileTypeProfile.cssFiles}, Tests: {analysis.fileTypeProfile.testFiles}, Other: {analysis.fileTypeProfile.otherFiles}
            </p>
            <p className="text-xs text-gray-400">Sections: {sectionSummary}</p>
            <p className="text-xs text-gray-400">Timeline annotations: {annotations.length}</p>

            <div className="grid md:grid-cols-2 gap-3 pt-1">
              {annotations.map((annotation, index) => {
                const isActive = index === activeAnnotationIndex
                return (
                  <div
                    key={`${annotation.metricName}-${annotation.timeSeconds}-${index}`}
                    className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-950/50 text-indigo-200'
                        : 'border-gray-800 bg-gray-950/60 text-gray-300'
                    }`}
                  >
                    <p className="font-medium">{annotation.timeSeconds.toFixed(1)}s • {annotation.label}</p>
                    <p className="mt-1 text-gray-400">metric: {annotation.metricName} • rating: {annotation.rating}</p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Public Gallery</h2>
            <button
              onClick={() => void refreshGallery()}
              className="rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-1 text-xs text-gray-300 hover:bg-gray-900"
            >
              {isGalleryLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {galleryError && (
            <div className="rounded-lg border border-red-700 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {galleryError}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-3">
            <GalleryColumn
              title="Most Analyzed"
              subtitle="Leaderboard"
              items={leaderboard}
              rankStyle="count"
            />
            <GalleryColumn
              title="Hall of Fame"
              subtitle="Highest health"
              items={hallOfFame}
              rankStyle="health"
            />
            <GalleryColumn
              title="Hall of Shame"
              subtitle="Lowest health"
              items={hallOfShame}
              rankStyle="health"
              reverseHealth
            />
          </div>
        </section>
      </div>
    </main>
  )
}

interface GalleryColumnProps {
  title: string
  subtitle: string
  items: Array<{
    owner: string
    repo: string
    repoUrl: string
    analyzeCount: number
    lastHealthScore: number
    lastMode: 'major' | 'minor'
    lastTempo: number
  }>
  rankStyle: 'count' | 'health'
  reverseHealth?: boolean
}

function GalleryColumn({
  title,
  subtitle,
  items,
  rankStyle,
  reverseHealth = false,
}: GalleryColumnProps) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3 space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-gray-400">{subtitle}</p>

      {items.length === 0 ? (
        <p className="text-xs text-gray-500">No entries yet</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <a
              key={`${item.owner}/${item.repo}-${index}`}
              href={item.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md border border-gray-800 bg-gray-900/70 px-2 py-2 hover:bg-gray-900"
            >
              <p className="text-xs font-medium text-gray-100">
                #{index + 1} {item.owner}/{item.repo}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                {rankStyle === 'count'
                  ? `${item.analyzeCount} analyses`
                  : `Health ${item.lastHealthScore}/100${reverseHealth ? ' (low)' : ''}`} • {item.lastMode} • {item.lastTempo} BPM
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default App
