import * as Tone from 'tone'

import { startAudioContext } from './toneSetup'
import {
  applyDissonance,
  articulationMultiplier,
  buildChord,
  generateRhythmBar,
  getChordProgression,
  getScaleNotes,
  intensityToVelocity,
  randomScaleNote,
  selectRootNote,
  selectScaleType,
  type ChordDegree,
  type RhythmCell,
} from './scaleHelpers'
import { getFileTypeShares, getThemeMix } from './themes'
import type {
  CompositionAnnotation,
  CompositionConfig,
  CompositionTheme,
  CompositionSection,
  PlaybackStatus,
  RepoFileTypeProfile,
  SectionName,
} from '../types/composition'

type StatusListener = (status: PlaybackStatus) => void

interface ScheduledEvent {
  time: number
  note: string
  duration: Tone.Unit.Time
  velocity: number
}

interface ChordEvent {
  time: number
  chord: string[]
  duration: Tone.Unit.Time
  velocity: number
}

interface PercussionEvent {
  time: number
  note: string
  duration: Tone.Unit.Time
  velocity: number
}

type RootNote = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'

interface SectionBarWindow {
  startBar: number
  endBar: number
  barCount: number
}

type SectionBars = Record<SectionName, SectionBarWindow>

const SECTION_ORDER: SectionName[] = ['intro', 'theme', 'development', 'resolution']

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export class CompositionEngine {
  private config: CompositionConfig | null = null
  private theme: CompositionTheme = 'electronic'
  private fileTypeProfile: RepoFileTypeProfile | null = null
  private healthScore = 50
  private sections: CompositionSection[] = []

  private leadSynth: Tone.Synth | null = null
  private padSynth: Tone.PolySynth | null = null
  private bassSynth: Tone.MonoSynth | null = null
  private percussionSynth: Tone.MembraneSynth | null = null
  private masterGain: Tone.Gain | null = null

  private leadPart: Tone.Part<ScheduledEvent> | null = null
  private chordPart: Tone.Part<ChordEvent> | null = null
  private bassPart: Tone.Part<ScheduledEvent> | null = null
  private percussionPart: Tone.Part<PercussionEvent> | null = null
  private textureParts: Tone.Part<ChordEvent>[] = []
  private textureSynths: Tone.PolySynth[] = []

  private timelinePollTimer: number | null = null
  private annotations: CompositionAnnotation[] = []
  private status: PlaybackStatus = {
    state: 'idle',
    currentTime: 0,
    totalTime: 0,
    currentSection: null,
    currentAnnotation: null,
  }
  private statusListener: StatusListener | null = null

  setTheme(theme: CompositionTheme): void {
    this.theme = theme
    this.applyConfigToInstruments()
  }

  async load(
    config: CompositionConfig,
    healthScore: number,
    options?: { theme?: CompositionTheme; fileTypeProfile?: RepoFileTypeProfile | null },
  ): Promise<void> {
    this.config = config
    this.healthScore = clamp(healthScore, 0, 100)
    this.theme = options?.theme ?? this.theme
    this.fileTypeProfile = options?.fileTypeProfile ?? null
    this.sections = this.buildSections(config.totalDurationSeconds)
    this.annotations = this.buildAnnotations(config, this.sections)
    this.status = {
      state: 'stopped',
      currentTime: 0,
      totalTime: config.totalDurationSeconds,
      currentSection: this.sections[0]?.name ?? null,
      currentAnnotation: this.annotations[0] ?? null,
    }

    this.emitStatus()
  }

  setStatusListener(listener: StatusListener | null): void {
    this.statusListener = listener
    this.emitStatus()
  }

  getStatus(): PlaybackStatus {
    return { ...this.status }
  }

  getSections(): CompositionSection[] {
    return this.sections.map((section) => ({ ...section }))
  }

  getAnnotations(): CompositionAnnotation[] {
    return this.annotations.map((annotation) => ({ ...annotation }))
  }

  getCurrentAnnotation(): CompositionAnnotation | null {
    return this.status.currentAnnotation ? { ...this.status.currentAnnotation } : null
  }

  async play(): Promise<void> {
    if (!this.config) {
      throw new Error('Composition config not loaded. Call load() first.')
    }

    this.setState('loading')

    const started = await startAudioContext()
    if (!started) {
      this.setState('error', 'Audio context failed to start')
      return
    }

    this.ensureSignalChain()
    this.schedulePartsIfNeeded()

    if (Tone.Transport.state !== 'started') {
      Tone.Transport.start()
    }

    this.startTimelinePoll()
    this.setState('playing')
  }

  pause(): void {
    if (Tone.Transport.state === 'started') {
      Tone.Transport.pause()
    }
    this.stopTimelinePoll()
    this.setState('paused')
  }

  stop(): void {
    Tone.Transport.stop()
    Tone.Transport.seconds = 0
    this.stopTimelinePoll()

    this.status.currentTime = 0
    this.status.currentSection = this.sections[0]?.name ?? null
    this.status.currentAnnotation = this.annotations[0] ?? null
    this.setState('stopped')
  }

  async restart(): Promise<void> {
    this.stop()
    await this.play()
  }

  dispose(): void {
    this.stopTimelinePoll()

    this.disposeParts()
    this.disposeInstruments()

    Tone.Transport.stop()
    Tone.Transport.cancel(0)
    Tone.Transport.seconds = 0

    this.setState('idle')
  }

  private ensureSignalChain(): void {
    if (this.leadSynth && this.padSynth && this.bassSynth && this.masterGain) {
      return
    }

    this.masterGain = new Tone.Gain(0.85).toDestination()

    this.leadSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.08, sustain: 0.3, release: 0.5 },
    }).connect(this.masterGain)

    this.padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.2, decay: 0.1, sustain: 0.5, release: 1.5 },
    }).connect(this.masterGain)

    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'square' },
      filter: { Q: 2, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.6 },
    }).connect(this.masterGain)

    this.percussionSynth = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.15 },
    }).connect(this.masterGain)

    this.reconcileTextureVoices()
    this.applyConfigToInstruments()
  }

  private schedulePartsIfNeeded(): void {
    if (!this.config) return

    this.disposeParts()
    Tone.Transport.cancel(0)

    Tone.Transport.bpm.value = this.config.tempo
    Tone.Transport.swing = (1 - clamp(this.config.rhythmicStability, 0, 1)) * 0.32
    Tone.Transport.swingSubdivision = '8n'

    this.reconcileTextureVoices()
    this.applyConfigToInstruments()

    const root = selectRootNote(this.healthScore)
    const scaleType = selectScaleType(this.config.mode, this.config.harmonicComplexity)
    const scaleNotes = getScaleNotes(root, scaleType, 3, 3)
    const progression = getChordProgression(this.config.mode, this.healthScore)

    const barsPerSecond = this.config.tempo / 60 / 4
    const totalBars = Math.max(8, Math.round(this.config.totalDurationSeconds * barsPerSecond))
    const sectionBars = this.computeSectionBars(totalBars)

    const leadEvents = this.buildLeadEvents(root, scaleNotes, totalBars, sectionBars)
    const chordEvents = this.buildChordEvents(root, progression, totalBars, sectionBars)
    const bassEvents = this.buildBassEvents(scaleNotes, totalBars, sectionBars)
    const textureEvents = this.buildTextureEvents(root, progression, totalBars, sectionBars)
    const percussionEvents = this.buildPercussionEvents(totalBars, sectionBars)
    const activeVoices = Math.max(1, Math.round(this.config.voiceCount))
    const themeMix = getThemeMix(this.theme, this.fileTypeProfile)

    this.leadPart = new Tone.Part((time, event) => {
      if (!this.leadSynth) return
      this.leadSynth.triggerAttackRelease(event.note, event.duration, time, event.velocity)
    }, leadEvents).start(0)

    if (activeVoices >= 3 && this.theme !== 'minimal') {
      this.chordPart = new Tone.Part((time, event) => {
        if (!this.padSynth) return
        this.padSynth.triggerAttackRelease(event.chord, event.duration, time, event.velocity)
      }, chordEvents).start(0)
    }

    if (activeVoices >= 2 && this.theme !== 'minimal') {
      this.bassPart = new Tone.Part((time, event) => {
        if (!this.bassSynth) return
        this.bassSynth.triggerAttackRelease(event.note, event.duration, time, event.velocity)
      }, bassEvents).start(0)
    }

    if (themeMix.allowPercussion && percussionEvents.length > 0) {
      this.percussionPart = new Tone.Part((time, event) => {
        if (!this.percussionSynth) return
        this.percussionSynth.triggerAttackRelease(event.note, event.duration, time, event.velocity)
      }, percussionEvents).start(0)
    }

    this.textureParts = themeMix.allowTextureLayers
      ? this.textureSynths.map((synth, layerIndex) => {
      const part = new Tone.Part((time, event) => {
        synth.triggerAttackRelease(event.chord, event.duration, time, event.velocity)
      }, textureEvents[layerIndex] ?? []).start(0)
      return part
      })
      : []

    const transportEnd = this.config.totalDurationSeconds
    Tone.Transport.scheduleOnce(() => {
      this.stop()
    }, transportEnd)
  }

  private buildLeadEvents(
    root: RootNote,
    scaleNotes: string[],
    totalBars: number,
    sectionBars: SectionBars,
  ): ScheduledEvent[] {
    if (!this.config) return []
    const config = this.config

    const events: ScheduledEvent[] = []
    const rhythmicStability = clamp(config.rhythmicStability, 0, 1)
    const silenceRatio = clamp(config.silenceRatio, 0, 1)
    const phraseLength = 1 + config.phraseLengthMultiplier * 2
    const articulation = articulationMultiplier(config.articulationSharpness)
    const intensity = clamp(1 - config.harmonicComplexity * 0.4, 0.2, 1)
    const motifRepetition = clamp(config.motifRepetition, 0, 1)
    const motifSize = Math.max(2, Math.round(2 + motifRepetition * 4))
    const motifNotes: string[] = []
    const introAnchorNotes = [
      `${root}3`,
      `${root}4`,
      scaleNotes[Math.min(4, scaleNotes.length - 1)] ?? `${root}4`,
    ]

    for (let bar = 0; bar < totalBars; bar++) {
      const section = this.getSectionForBar(bar, sectionBars)
      const barOffset = bar * 4
      const sectionIntensity = this.getSectionIntensity(section)
      const sectionStability = clamp(
        rhythmicStability + (section === 'intro' ? 0.18 : section === 'development' ? -0.2 : 0),
        0,
        1,
      )
      const sectionSilence = clamp(
        silenceRatio + (section === 'intro' ? 0.1 : section === 'development' ? 0.14 : section === 'theme' ? -0.08 : 0),
        0,
        1,
      )
      const rhythm = generateRhythmBar(sectionStability, sectionSilence)
      const stepLength = 4 / Math.max(rhythm.length, 1)

      rhythm.forEach((cell: RhythmCell, index) => {
        if (!cell) return

        const phraseGate = 1 / phraseLength
        const sectionGate =
          section === 'intro' ? phraseGate * 0.55 : section === 'theme' ? phraseGate * 1.25 : section === 'development' ? phraseGate * 1.1 : phraseGate * 0.75
        if (Math.random() > sectionGate) return

        let chosen = randomScaleNote(scaleNotes)
        if (section === 'intro') {
          chosen = introAnchorNotes[(bar + index) % introAnchorNotes.length]
        } else if (motifNotes.length > 1 && Math.random() < motifRepetition * (section === 'theme' ? 0.9 : 0.6)) {
          const motifIndex = (bar + index) % motifNotes.length
          chosen = motifNotes[motifIndex]
        } else if (motifNotes.length < motifSize) {
          motifNotes.push(chosen)
        }

        const sectionDissonance = clamp(
          config.dissonance + (section === 'development' ? 0.25 : section === 'resolution' && this.healthScore > 60 ? -0.2 : 0),
          0,
          1,
        )
        const note = applyDissonance(chosen, sectionDissonance)
        const velocity = intensityToVelocity(intensity * sectionIntensity, 0.78)
        const sectionArticulation =
          section === 'intro'
            ? articulation + 0.15
            : section === 'development'
              ? articulation - 0.12
              : section === 'resolution'
                ? articulation + (this.healthScore >= 60 ? 0.2 : -0.08)
                : articulation
        events.push({
          time: barOffset + index * stepLength,
          note,
          duration: this.adjustDuration(cell, sectionArticulation),
          velocity,
        })
      })
    }

    if (events.length === 0) {
      events.push({ time: 0, note: scaleNotes[0] ?? 'C4', duration: '4n', velocity: 0.7 })
    }

    return events
  }

  private buildChordEvents(
    root: RootNote,
    progression: { intro: ChordDegree[]; theme: ChordDegree[]; development: ChordDegree[]; resolution: ChordDegree[] },
    totalBars: number,
    sectionBars: SectionBars,
  ): ChordEvent[] {
    if (!this.config) return []

    const events: ChordEvent[] = []

    for (const sectionName of SECTION_ORDER) {
      const window = sectionBars[sectionName]
      const degrees = progression[sectionName]
      const sectionIntensity = this.getSectionIntensity(sectionName)

      for (let localBar = 0; localBar < window.barCount; localBar++) {
        const bar = window.startBar + localBar
        const degree = degrees[localBar % degrees.length]
        const complexityBoost =
          sectionName === 'development' ? 0.18 : sectionName === 'resolution' && this.healthScore >= 60 ? -0.12 : 0
        const chord = buildChord(
          root,
          this.config.mode,
          degree,
          clamp(this.config.harmonicComplexity + complexityBoost, 0, 1),
          3,
        )

        events.push({
          time: bar * 4,
          chord,
          duration: sectionName === 'intro' ? '2n' : sectionName === 'development' ? '2n' : '1n',
          velocity: intensityToVelocity((1 - this.config.silenceRatio) * sectionIntensity, 0.48),
        })
      }
    }

    const finalDegree: ChordDegree = this.healthScore >= 60 ? 0 : this.config.mode === 'major' ? 6 : 1
    const finalComplexity = this.healthScore >= 60
      ? Math.max(0, this.config.harmonicComplexity - 0.25)
      : Math.min(1, this.config.harmonicComplexity + 0.2)
    const finalChord = buildChord(root, this.config.mode, finalDegree, finalComplexity, 3)
    events.push({
      time: Math.max(0, totalBars * 4 - 0.5),
      chord: finalChord,
      duration: '2n',
      velocity: intensityToVelocity(0.8, 0.54),
    })

    return events
  }

  private buildTextureEvents(
    root: RootNote,
    progression: { intro: ChordDegree[]; theme: ChordDegree[]; development: ChordDegree[]; resolution: ChordDegree[] },
    totalBars: number,
    sectionBars: SectionBars,
  ): ChordEvent[][] {
    if (!this.config) return []

    const layerCount = this.textureSynths.length
    if (layerCount === 0) return []

    const allLayers: ChordEvent[][] = []
    const complexity = clamp(this.config.harmonicComplexity, 0, 1)

    for (let layer = 0; layer < layerCount; layer++) {
      const events: ChordEvent[] = []
      const octave = 4 + (layer % 2)
      const layerDensity = 0.45 + layer * 0.1

      for (let bar = 0; bar < totalBars; bar++) {
        const section = this.getSectionForBar(bar, sectionBars)
        const sectionDensity =
          section === 'intro'
            ? layerDensity * 0.35
            : section === 'theme'
              ? layerDensity * 0.8
              : section === 'development'
                ? layerDensity * 1.05
                : layerDensity * 0.6
        if (Math.random() > sectionDensity) continue

        const sequence = progression[section]
        const degree = sequence[(bar + layer) % sequence.length]
        const chord = buildChord(root, this.config.mode, degree, complexity, octave)
        const sectionIntensity = this.getSectionIntensity(section)
        events.push({
          time: bar * 4,
          chord,
          duration:
            section === 'intro'
              ? '1n'
              : this.config.articulationSharpness > 0.65
                ? '2n'
                : '1n',
          velocity: intensityToVelocity((0.5 + complexity * 0.3) * sectionIntensity, 0.33),
        })
      }

      allLayers.push(events)
    }

    return allLayers
  }

  private buildBassEvents(scaleNotes: string[], totalBars: number, sectionBars: SectionBars): ScheduledEvent[] {
    if (!this.config) return []

    const bassPool = scaleNotes.filter((note) => /[23]$/.test(note))
    const source = bassPool.length > 0 ? bassPool : scaleNotes

    const events: ScheduledEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      const section = this.getSectionForBar(bar, sectionBars)
      const sourceOffset =
        section === 'development' ? 2 : section === 'resolution' && this.healthScore >= 60 ? 0 : 1
      const dissonance =
        section === 'development'
          ? Math.min(1, this.config.dissonance * 0.8 + 0.15)
          : section === 'resolution' && this.healthScore >= 60
            ? Math.max(0, this.config.dissonance * 0.4)
            : this.config.dissonance * 0.5
      const note = applyDissonance(source[(bar + sourceOffset) % source.length], dissonance)
      const sectionIntensity = this.getSectionIntensity(section)
      events.push({
        time: bar * 4,
        note,
        duration: section === 'intro' ? '1n' : '2n',
        velocity: intensityToVelocity(0.6 * sectionIntensity + 0.2, 0.65),
      })
    }

    return events
  }

  private buildPercussionEvents(totalBars: number, sectionBars: SectionBars): PercussionEvent[] {
    if (!this.config) return []

    const { testShare } = getFileTypeShares(this.fileTypeProfile)
    const density = clamp(0.15 + testShare * 0.85, 0.1, 0.95)
    const events: PercussionEvent[] = []

    for (let bar = 0; bar < totalBars; bar++) {
      const section = this.getSectionForBar(bar, sectionBars)
      const sectionWeight = section === 'intro' ? 0.5 : section === 'theme' ? 0.75 : section === 'development' ? 1 : 0.6
      const playHit = Math.random() < density * sectionWeight
      if (!playHit) continue

      const hitCount = section === 'development' ? 2 : 1
      for (let hit = 0; hit < hitCount; hit++) {
        const offset = hit === 0 ? 0 : 2
        const note = hit === 0 ? 'C2' : 'G1'
        events.push({
          time: bar * 4 + offset,
          note,
          duration: '8n',
          velocity: 0.45 + density * 0.35,
        })
      }
    }

    return events
  }

  private adjustDuration(duration: RhythmCell, articulation: number): Tone.Unit.Time {
    if (!duration) return '8n'

    const shortMap: Record<string, Tone.Unit.Time> = {
      '1n': '2n',
      '2n': '4n',
      '4n': '8n',
      '8n': '16n',
      '16n': '16n',
      '4n.': '8n',
      '8n.': '16n',
      '2t': '4t',
      '4t': '8t',
      '8t': '16n',
    }

    if (articulation < 0.55) {
      return shortMap[duration] ?? duration
    }
    return duration
  }

  private buildSections(totalDurationSeconds: number): CompositionSection[] {
    const safeDuration = clamp(totalDurationSeconds, 20, 180)

    const intro = safeDuration * 0.2
    const theme = safeDuration * 0.35
    const development = safeDuration * 0.3
    const resolution = safeDuration - intro - theme - development

    return [
      { name: 'intro', startTime: 0, duration: intro, intensityScale: 0.6 },
      { name: 'theme', startTime: intro, duration: theme, intensityScale: 0.85 },
      {
        name: 'development',
        startTime: intro + theme,
        duration: development,
        intensityScale: 1,
      },
      {
        name: 'resolution',
        startTime: intro + theme + development,
        duration: resolution,
        intensityScale: 0.7,
      },
    ]
  }

  private startTimelinePoll(): void {
    this.stopTimelinePoll()
    this.timelinePollTimer = window.setInterval(() => {
      if (!this.config) return
      this.status.currentTime = clamp(Tone.Transport.seconds, 0, this.config.totalDurationSeconds)
      this.status.currentSection = this.getCurrentSection(this.status.currentTime)
      this.status.currentAnnotation = this.getActiveAnnotation(this.status.currentTime)
      this.emitStatus()
    }, 120)
  }

  private stopTimelinePoll(): void {
    if (this.timelinePollTimer !== null) {
      window.clearInterval(this.timelinePollTimer)
      this.timelinePollTimer = null
    }
  }

  private getCurrentSection(timeSeconds: number): SectionName | null {
    const section = this.sections.find((item) => {
      const end = item.startTime + item.duration
      return timeSeconds >= item.startTime && timeSeconds < end
    })
    return section?.name ?? this.sections[this.sections.length - 1]?.name ?? null
  }

  private getSectionIntensity(section: SectionName): number {
    return this.sections.find((item) => item.name === section)?.intensityScale ?? 0.8
  }

  private computeSectionBars(totalBars: number): SectionBars {
    const sectionAllocations = this.sections.map((section) => {
      const barCount = Math.max(1, Math.round((section.duration / (this.config?.totalDurationSeconds ?? 1)) * totalBars))
      return { name: section.name, barCount }
    })

    let assigned = sectionAllocations.reduce((sum, item) => sum + item.barCount, 0)
    while (assigned > totalBars) {
      const index = sectionAllocations.findIndex((item) => item.barCount > 1)
      if (index === -1) break
      sectionAllocations[index].barCount -= 1
      assigned -= 1
    }
    while (assigned < totalBars) {
      const index = SECTION_ORDER.findIndex((name) => name === 'theme')
      sectionAllocations[index].barCount += 1
      assigned += 1
    }

    let cursor = 0
    const windows = {} as SectionBars
    for (const name of SECTION_ORDER) {
      const alloc = sectionAllocations.find((item) => item.name === name)
      const barCount = alloc?.barCount ?? 1
      windows[name] = {
        startBar: cursor,
        endBar: cursor + barCount,
        barCount,
      }
      cursor += barCount
    }

    windows.resolution.endBar = totalBars
    windows.resolution.barCount = Math.max(1, totalBars - windows.resolution.startBar)

    return windows
  }

  private getSectionForBar(bar: number, sectionBars: SectionBars): SectionName {
    if (bar >= sectionBars.resolution.startBar) return 'resolution'
    if (bar >= sectionBars.development.startBar) return 'development'
    if (bar >= sectionBars.theme.startBar) return 'theme'
    return 'intro'
  }

  private buildAnnotations(
    config: CompositionConfig,
    sections: CompositionSection[],
  ): CompositionAnnotation[] {
    const intro = sections.find((section) => section.name === 'intro')
    const theme = sections.find((section) => section.name === 'theme')
    const development = sections.find((section) => section.name === 'development')
    const resolution = sections.find((section) => section.name === 'resolution')

    const annotations: CompositionAnnotation[] = [
      {
        timeSeconds: 0,
        label: `Tempo ${Math.round(config.tempo)} BPM sets motion`,
        metricName: 'commitFrequency',
        value: clamp((config.tempo - 60) / 80, 0, 1),
        rating: this.ratingFromGoodness(clamp((config.tempo - 60) / 80, 0, 1)),
      },
      {
        timeSeconds: 0.2,
        label: config.mode === 'major' ? 'Major mode from positive commits' : 'Minor mode from negative commits',
        metricName: 'commitSentiment',
        value: config.mode === 'major' ? 1 : 0,
        rating: config.mode === 'major' ? 'good' : 'poor',
      },
      {
        timeSeconds: (intro?.startTime ?? 0) + (intro?.duration ?? 0) * 0.55,
        label: 'Rhythmic regularity reflects test coverage',
        metricName: 'testCoverage',
        value: clamp(config.rhythmicStability, 0, 1),
        rating: this.ratingFromGoodness(clamp(config.rhythmicStability, 0, 1)),
      },
      {
        timeSeconds: (theme?.startTime ?? 0) + (theme?.duration ?? 0) * 0.2,
        label: 'Motif repetition mirrors code duplication',
        metricName: 'duplication',
        value: clamp(config.motifRepetition, 0, 1),
        rating: this.ratingFromGoodness(1 - clamp(config.motifRepetition, 0, 1)),
      },
      {
        timeSeconds: (theme?.startTime ?? 0) + (theme?.duration ?? 0) * 0.7,
        label: 'Phrase length reflects average function size',
        metricName: 'avgFunctionLength',
        value: clamp(config.phraseLengthMultiplier, 0, 1),
        rating: this.ratingFromGoodness(1 - clamp(config.phraseLengthMultiplier, 0, 1)),
      },
      {
        timeSeconds: (development?.startTime ?? 0) + (development?.duration ?? 0) * 0.12,
        label: 'Chord tension tracks cyclomatic complexity',
        metricName: 'cyclomaticComplexity',
        value: clamp(config.harmonicComplexity, 0, 1),
        rating: this.ratingFromGoodness(1 - clamp(config.harmonicComplexity, 0, 1)),
      },
      {
        timeSeconds: (development?.startTime ?? 0) + (development?.duration ?? 0) * 0.52,
        label: 'Dissonance rises with bug density',
        metricName: 'bugDensity',
        value: clamp(config.dissonance, 0, 1),
        rating: this.ratingFromGoodness(1 - clamp(config.dissonance, 0, 1)),
      },
      {
        timeSeconds: (development?.startTime ?? 0) + (development?.duration ?? 0) * 0.8,
        label: 'Silence/rests represent dead code',
        metricName: 'deadCode',
        value: clamp(config.silenceRatio, 0, 1),
        rating: this.ratingFromGoodness(1 - clamp(config.silenceRatio, 0, 1)),
      },
      {
        timeSeconds: (resolution?.startTime ?? 0) + (resolution?.duration ?? 0) * 0.22,
        label: 'Articulation reflects PR review speed',
        metricName: 'avgPRReviewTime',
        value: clamp(config.articulationSharpness, 0, 1),
        rating: this.ratingFromGoodness(clamp(config.articulationSharpness, 0, 1)),
      },
      {
        timeSeconds: (resolution?.startTime ?? 0) + (resolution?.duration ?? 0) * 0.66,
        label: `${Math.round(clamp(config.voiceCount, 1, 8))} voices reflect file count`,
        metricName: 'fileCount',
        value: clamp((config.voiceCount - 1) / 7, 0, 1),
        rating: this.ratingFromGoodness(clamp((config.voiceCount - 1) / 7, 0, 1) * 0.6 + 0.35),
      },
    ]

    return annotations
      .map((annotation) => ({
        ...annotation,
        timeSeconds: clamp(annotation.timeSeconds, 0, config.totalDurationSeconds),
      }))
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
  }

  private getActiveAnnotation(timeSeconds: number): CompositionAnnotation | null {
    if (this.annotations.length === 0) return null

    for (let index = this.annotations.length - 1; index >= 0; index -= 1) {
      if (timeSeconds >= this.annotations[index].timeSeconds) {
        return this.annotations[index]
      }
    }

    return this.annotations[0]
  }

  private ratingFromGoodness(goodness: number): CompositionAnnotation['rating'] {
    const clamped = clamp(goodness, 0, 1)
    if (clamped >= 0.8) return 'excellent'
    if (clamped >= 0.6) return 'good'
    if (clamped >= 0.4) return 'moderate'
    return 'poor'
  }

  private disposeParts(): void {
    this.leadPart?.dispose()
    this.chordPart?.dispose()
    this.bassPart?.dispose()
    this.percussionPart?.dispose()
    this.textureParts.forEach((part) => part.dispose())
    this.leadPart = null
    this.chordPart = null
    this.bassPart = null
    this.percussionPart = null
    this.textureParts = []
  }

  private disposeInstruments(): void {
    this.leadSynth?.dispose()
    this.padSynth?.dispose()
    this.bassSynth?.dispose()
    this.percussionSynth?.dispose()
    this.textureSynths.forEach((synth) => synth.dispose())
    this.masterGain?.dispose()

    this.leadSynth = null
    this.padSynth = null
    this.bassSynth = null
    this.percussionSynth = null
    this.textureSynths = []
    this.masterGain = null
  }

  private reconcileTextureVoices(): void {
    if (!this.masterGain || !this.config) return

    const clampedVoices = clamp(this.config.voiceCount, 1, 8)
    const targetTextureCount = this.theme === 'minimal' ? 0 : Math.max(0, Math.round(clampedVoices) - 3)

    while (this.textureSynths.length > targetTextureCount) {
      const synth = this.textureSynths.pop()
      synth?.dispose()
    }

    while (this.textureSynths.length < targetTextureCount) {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.9 },
      }).connect(this.masterGain)
      this.textureSynths.push(synth)
    }
  }

  private applyConfigToInstruments(): void {
    if (!this.config) return

    const complexity = clamp(this.config.harmonicComplexity, 0, 1)
    const articulation = clamp(this.config.articulationSharpness, 0, 1)
    const dissonance = clamp(this.config.dissonance, 0, 1)
    const themeMix = getThemeMix(this.theme, this.fileTypeProfile)

    if (this.masterGain) {
      const voiceFactor = 1 / Math.sqrt(clamp(this.config.voiceCount, 1, 8))
      this.masterGain.gain.rampTo(0.82 * voiceFactor + 0.18, 0.08)
    }

    if (this.leadSynth) {
      const leadWave =
        this.theme === 'orchestra'
          ? 'triangle'
          : this.theme === 'minimal'
            ? 'sine'
            : complexity > 0.66
              ? 'sawtooth'
              : complexity > 0.33
                ? 'triangle'
                : 'sine'
      this.leadSynth.set({
        volume: themeMix.leadDb,
        oscillator: { type: leadWave },
        envelope: {
          attack: 0.01,
          decay: 0.08 + dissonance * 0.06,
          sustain: 0.3,
          release: 0.18 + (1 - articulation) * 0.9,
        },
      })
    }

    if (this.padSynth) {
      const padWave = this.theme === 'orchestra' ? 'triangle' : this.config.mode === 'minor' ? 'triangle' : 'sine'
      this.padSynth.set({
        volume: themeMix.padDb,
        oscillator: { type: padWave },
        envelope: {
          attack: 0.2,
          decay: 0.12,
          sustain: 0.45,
          release: 0.7 + (1 - articulation) * 1.2,
        },
      })
    }

    if (this.bassSynth) {
      this.bassSynth.set({
        volume: themeMix.bassDb,
        envelope: {
          attack: 0.015,
          decay: 0.17,
          sustain: 0.42,
          release: 0.15 + (1 - articulation) * 0.8,
        },
        filter: {
          Q: 1.2 + dissonance * 4,
          type: 'lowpass',
          frequency: 250 + (1 - complexity) * 700,
          rolloff: -24,
        },
      })
    }

    if (this.percussionSynth) {
      this.percussionSynth.set({
        volume: themeMix.percussionDb,
        octaves: this.theme === 'electronic' ? 6 : 4,
        envelope: {
          attack: 0.001,
          decay: this.theme === 'orchestra' ? 0.24 : 0.18,
          sustain: 0,
          release: 0.12,
        },
      })
    }

    this.textureSynths.forEach((synth, index) => {
      const wave: Tone.ToneOscillatorType =
        this.theme === 'orchestra'
          ? 'triangle'
          : this.theme === 'minimal'
            ? 'sine'
            : index % 2 === 0
              ? 'triangle'
              : 'square'
      synth.set({
        volume: themeMix.textureDb,
        oscillator: { type: wave },
        envelope: {
          attack: 0.03,
          decay: 0.15,
          sustain: 0.35,
          release: 0.35 + (1 - articulation) * 0.7,
        },
      })
    })
  }

  private setState(state: PlaybackStatus['state'], error?: string): void {
    this.status.state = state
    this.status.error = error
    this.emitStatus()
  }

  private emitStatus(): void {
    if (this.statusListener) {
      this.statusListener({ ...this.status })
    }
  }
}
