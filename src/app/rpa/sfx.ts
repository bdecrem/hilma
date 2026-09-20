// Rock Paper Anything — five sounds, synthesized; no audio files.

let ctx: AudioContext | null = null
let muted = false

export function setMuted(m: boolean) {
  muted = m
}

/** Call from a user gesture (Start), or the browser keeps the context suspended. */
export function unlock() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

function tone(type: OscillatorType, from: number, to: number, dur: number, gain: number, delay = 0) {
  if (!ctx || muted) return
  const t = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
  amp.gain.setValueAtTime(gain, t)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(amp).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

export const sfx = {
  fire: () => tone('square', 520, 160, 0.12, 0.05),
  hit: (strength: number) => tone('triangle', 140 + strength * 1.2, 60, 0.16, 0.12, 0.18),
  kill: () => {
    tone('square', 440, 440, 0.07, 0.05, 0.2)
    tone('square', 660, 660, 0.12, 0.05, 0.27)
  },
  miss: () => tone('sine', 180, 120, 0.12, 0.05, 0.1),
  refuse: () => tone('sawtooth', 110, 80, 0.2, 0.05),
  breach: () => {
    tone('sawtooth', 90, 40, 0.5, 0.12)
    tone('square', 60, 30, 0.5, 0.08)
  },
  wave: () => {
    tone('square', 330, 330, 0.08, 0.04)
    tone('square', 440, 440, 0.08, 0.04, 0.09)
    tone('square', 550, 550, 0.14, 0.04, 0.18)
  },
}
