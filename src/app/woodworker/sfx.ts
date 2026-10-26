// The Woodworker's sounds, synthesized: wood knocks, a hinge creak, pins
// catching, rolling, an egg, a chime. No audio files.

let ctx: AudioContext | null = null
let on = true

export function setSound(v: boolean) {
  on = v
}

/** The one AudioContext, created on the first gesture (shared with the music). */
export function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
  return ctx
}

/** Call from a gesture, or the browser keeps the context suspended. */
export function unlock() {
  if (on) audio()
}

function tone(freq: number, end: number, dur: number, gain: number, type: OscillatorType = 'sine', when = 0) {
  if (!ctx || !on) return
  const t = ctx.currentTime + when
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  o.frequency.exponentialRampToValueAtTime(end, t + dur)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, freq: number, gain: number, when = 0, q = 1.6) {
  if (!ctx || !on) return
  const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0)
  for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len) ** 3
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  g.gain.value = gain
  s.buffer = buf
  s.connect(f).connect(g).connect(ctx.destination)
  s.start(ctx.currentTime + when)
}

export const knock = (dist = 1) => (tone(190 - dist * 12, 80, 0.09, 0.32), noise(0.05, 1400, 0.5))
export const thunk = () => (tone(110, 55, 0.12, 0.3), noise(0.04, 500, 0.35))
export const creak = () => (tone(420, 610, 0.32, 0.05, 'sawtooth'), noise(0.3, 2400, 0.12, 0, 8), knock(1))
export const click = () => (noise(0.025, 3200, 0.5), tone(1200, 900, 0.04, 0.08, 'square'))
export const roll = (cells: number) => {
  for (let k = 0; k < cells; k++) noise(0.06, 300 + Math.random() * 120, 0.25, k * 0.08)
  if (cells) knock(1)
}
export const crack = () => (noise(0.08, 2600, 0.7), noise(0.2, 900, 0.4, 0.06), tone(300, 120, 0.15, 0.2, 'triangle'))
export const chime = () => [660, 880, 1046].forEach((f, k) => tone(f, f * 0.995, 0.5, 0.12, 'triangle', k * 0.12))
/** Cyriel's phone, ringing out twice. */
export const ring = () => {
  for (let k = 0; k < 2; k++) for (let j = 0; j < 10; j++) tone(j % 2 ? 1180 : 1320, j % 2 ? 1180 : 1320, 0.035, 0.035, 'triangle', k * 0.5 + j * 0.035)
}
/** Krul, delighted. */
export const yip = () => (tone(820, 1500, 0.09, 0.1, 'triangle'), tone(900, 1700, 0.08, 0.08, 'triangle', 0.16))
