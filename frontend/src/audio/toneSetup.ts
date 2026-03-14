import * as Tone from 'tone'

/**
 * Must be called inside a user-gesture handler (click, keydown, etc.)
 * before any audio can be produced. Returns true on success.
 */
export async function startAudioContext(): Promise<boolean> {
  await Tone.start()
  return Tone.getContext().state === 'running'
}

/** Play a single test note to confirm audio is working. */
export async function playTestNote(): Promise<void> {
  await startAudioContext()

  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.8 },
  }).toDestination()

  synth.triggerAttackRelease('C4', '8n')

  // Dispose after the note finishes to avoid memory leaks
  setTimeout(() => synth.dispose(), 2000)
}
