// The Woodworker's background music, synthesized live: a slow, swung workshop
// shuffle. Marimba carries the tune (it's all wood here), a plucked upright
// bass walks underneath, soft Rhodes chords, brushes, a kick you feel more
// than hear, and the odd woodblock knock. Sixteen bars in F (A: I vi ii V iii
// vi ii-V I, B: IV iii ii V I VI7 ii-V I), each room in its own key with its
// own seeded tune. Kept quiet and spacious: it should be as easy to ignore as
// it is to enjoy, while you think.
import { audio } from './sfx'

const BPM = 86
const SWING = 0.63
const BEAT = 60 / BPM
/** Semitones from F per room: F, G, D, Bb, Eb. */
const KEYS = [0, 2, -3, 5, -2]

type Chord = { root: number; tones: number[] }
const C: Record<string, Chord> = {
  Fmaj7: { root: 0, tones: [0, 4, 7, 11] },
  Dm7: { root: -3, tones: [-3, 0, 4, 7] },
  Gm7: { root: 2, tones: [2, 5, 9, 12] },
  C7: { root: -5, tones: [7, 11, 14, 17] },
  Am7: { root: 4, tones: [4, 7, 11, 14] },
  Bbmaj7: { root: 5, tones: [5, 9, 12, 16] },
  D7: { root: -3, tones: [-3, 1, 4, 7] },
}
/** Sixteen bars; a bar with two chords changes on beat 3. */
const FORM: string[][] = [
  ['Fmaj7'], ['Dm7'], ['Gm7'], ['C7'], ['Am7'], ['Dm7'], ['Gm7', 'C7'], ['Fmaj7'],
  ['Bbmaj7'], ['Am7'], ['Gm7'], ['C7'], ['Fmaj7'], ['D7'], ['Gm7', 'C7'], ['Fmaj7'],
]
/** F major, as semitones from F. */
const SCALE = [0, 2, 4, 5, 7, 9, 11]
/** Eighth-note rhythms for the tune (1 = play), swung. */
const RHYTHMS = [
  [1, 0, 1, 1, 0, 0, 1, 0],
  [1, 0, 0, 1, 0, 1, 0, 0],
  [0, 0, 1, 0, 1, 1, 0, 1],
  [1, 1, 0, 1, 0, 0, 0, 0],
  [1, 0, 1, 0, 1, 0, 0, 0],
  [0, 1, 1, 0, 1, 0, 1, 0],
]

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12)

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** A sixteen-bar tune: per bar, eight eighth-note slots, a MIDI note or null. */
function compose(seed: number): (number | null)[][] {
  const r = rng(seed * 7919 + 17)
  let prev = 72 // F5 sits at 77; start a little under it
  const phraseRhythms = [0, 1, 2, 3].map(() => RHYTHMS[Math.floor(r() * RHYTHMS.length)])
  return FORM.map((chords, bar) => {
    // Bars 4, 8, 12, 16 breathe: one long note, then rest.
    if (bar % 4 === 3) {
      const ch = C[chords[chords.length - 1]]
      return [nearest(ch.tones, prev, 72, 84), null, null, null, null, null, null, null]
    }
    // Phrases repeat their rhythm (bars 1 and 3 alike), which makes it a tune.
    const rhythm = phraseRhythms[(bar % 4) % 2 === 0 ? (bar >> 2) % 2 : 2 + ((bar >> 2) % 2)]
    return rhythm.map((on, i) => {
      if (!on) return null
      const ch = C[chords[chords.length > 1 && i >= 4 ? 1 : 0]]
      const strong = i % 2 === 0
      let n: number
      if (strong || r() < 0.4) n = nearest(ch.tones, prev + (r() < 0.5 ? -2 : 3), 70, 86)
      else n = stepFrom(prev, r() < 0.55 ? -1 : 1)
      prev = n
      return n
    })
  })
}

/** The chord tone (any octave) nearest to target, inside [lo, hi]. */
function nearest(tones: number[], target: number, lo: number, hi: number): number {
  let best = lo, d = 99
  for (let m = lo; m <= hi; m++) {
    if (!tones.some((t) => (((m - 65 - t) % 12) + 12) % 12 === 0)) continue
    if (Math.abs(m - target) < d) (d = Math.abs(m - target), (best = m))
  }
  return best
}
/** One scale step up or down from m, in F major. */
function stepFrom(m: number, dir: number): number {
  for (let k = 1; k <= 2; k++) {
    const n = m + dir * k
    if (SCALE.includes((((n - 65) % 12) + 12) % 12)) return Math.max(70, Math.min(86, n))
  }
  return m
}

// ---------- the band ----------

let ctx: AudioContext | null = null
let master: GainNode | null = null
let send: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let timer = 0
let playing = false
let room = 0
let tune = compose(0)
let step = 0
let pass = 0
let next = 0

function wire(a: AudioContext) {
  if (master) return
  master = a.createGain()
  master.gain.value = 0
  const tone = a.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 5200
  master.connect(tone).connect(a.destination)
  // A small room: a generated two-second tail, mixed low.
  const len = Math.floor(a.sampleRate * 2)
  const ir = a.createBuffer(2, len, a.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2
  }
  const verb = a.createConvolver()
  verb.buffer = ir
  send = a.createGain()
  send.gain.value = 0.28
  send.connect(verb).connect(master)
  noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate)
  const n = noiseBuf.getChannelData(0)
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1
}

function out(node: AudioNode, wet = 0) {
  node.connect(master!)
  if (wet) {
    const g = ctx!.createGain()
    g.gain.value = wet
    node.connect(g).connect(send!)
  }
}

function marimba(t: number, m: number, vel: number) {
  const a = ctx!, f = mtof(m)
  const g = a.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
  const o = a.createOscillator()
  o.frequency.value = f
  o.connect(g)
  // The bar's bright fourth partial, gone almost at once: the mallet on wood.
  const p = a.createOscillator(), pg = a.createGain()
  p.frequency.value = f * 3.93
  pg.gain.setValueAtTime(0.05 * vel, t)
  pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
  p.connect(pg).connect(g)
  out(g, 0.5)
  for (const x of [o, p]) (x.start(t), x.stop(t + 1))
}

function rhodes(t: number, notes: number[], dur: number) {
  const a = ctx!
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1900
  const g = a.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.045, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.018, t + dur * 0.8)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35)
  // A slow tremolo, the amp's wobble.
  const lfo = a.createOscillator(), depth = a.createGain()
  lfo.frequency.value = 4.6
  depth.gain.value = 0.006
  lfo.connect(depth).connect(g.gain)
  lp.connect(g)
  out(g, 0.45)
  const all: OscillatorNode[] = [lfo]
  for (const m of notes) {
    const f = mtof(m) * (1 + (Math.random() - 0.5) * 0.002)
    const o = a.createOscillator(), o2 = a.createOscillator(), g2 = a.createGain()
    o.frequency.value = f
    o2.frequency.value = f * 2
    g2.gain.value = 0.18
    o.connect(lp)
    o2.connect(g2).connect(lp)
    all.push(o, o2)
  }
  for (const x of all) (x.start(t), x.stop(t + dur + 0.4))
}

function bass(t: number, m: number) {
  const a = ctx!, f = mtof(m)
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(900, t)
  lp.frequency.exponentialRampToValueAtTime(260, t + 0.3)
  const g = a.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.2, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62)
  const o = a.createOscillator(), o2 = a.createOscillator()
  o.type = 'triangle'
  o.frequency.value = f
  o2.frequency.value = f
  o.connect(lp)
  o2.connect(lp)
  lp.connect(g)
  out(g, 0.1)
  for (const x of [o, o2]) (x.start(t), x.stop(t + 0.7))
}

function hit(t: number, freq: number, q: number, gain: number, dur: number, wet = 0.2) {
  const a = ctx!
  const s = a.createBufferSource()
  s.buffer = noiseBuf
  const f = a.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = a.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g)
  out(g, wet)
  s.start(t, Math.random() * 0.5)
  s.stop(t + dur + 0.02)
}

function kick(t: number, gain: number) {
  const a = ctx!
  const o = a.createOscillator(), g = a.createGain()
  o.frequency.setValueAtTime(110, t)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.18)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  o.connect(g)
  out(g)
  o.start(t)
  o.stop(t + 0.32)
}

function woodblock(t: number, high: boolean) {
  const a = ctx!
  const o = a.createOscillator(), g = a.createGain()
  o.frequency.value = high ? 1180 : 860
  g.gain.setValueAtTime(0.05, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
  o.connect(g)
  out(g, 0.6)
  o.start(t)
  o.stop(t + 0.08)
  hit(t, high ? 2400 : 1800, 6, 0.05, 0.03, 0.4)
}

/** Fold a note into [lo, lo + 12). */
const fold = (m: number, lo: number) => lo + ((((m - lo) % 12) + 12) % 12)

/** Play one swung eighth: step 0..127 across the sixteen bars. */
function play(s: number, t: number) {
  const bar = s >> 3, i = s & 7
  const key = KEYS[room] ?? 0
  const chords = FORM[bar]
  const ch = C[chords[chords.length > 1 && i >= 4 ? 1 : 0]]
  const r = Math.random()

  // Drums: brushes every eighth (leaning on 2 and 4), a soft kick, the odd woodblock.
  hit(t, 5200, 0.8, i === 2 || i === 6 ? 0.035 : 0.014, i === 2 || i === 6 ? 0.16 : 0.05, 0.1)
  if (i === 0) kick(t, 0.22)
  if (i === 5 && r < 0.35) kick(t, 0.12)
  if (i === 7 && bar % 2 === 1) woodblock(t, bar % 4 === 3)
  if (i === 3 && r < 0.12) woodblock(t, true)

  // Bass: root on 1, fifth on 3, a walking approach into the next bar.
  const lo = 36
  if (i === 0 || (chords.length > 1 && i === 4)) bass(t, fold(65 + ch.root + key, lo))
  else if (i === 4) bass(t, fold(65 + ch.root + 7 + key, lo))
  else if (i === 6 && r < 0.5) {
    const nextRoot = C[FORM[(bar + 1) % 16][0]].root
    bass(t, fold(65 + nextRoot + key, lo) + (r < 0.25 ? 1 : -1))
  }

  // Rhodes: lay the chord on 1, push it on the and-of-2 now and then.
  if (i === 0 || (chords.length > 1 && i === 4)) rhodes(t, ch.tones.map((x) => fold(65 + x + key, 53)), chords.length > 1 ? BEAT * 2 : BEAT * 3.4)
  else if (i === 3 && chords.length === 1 && r < 0.3) rhodes(t, ch.tones.slice(1).map((x) => fold(65 + x + key, 57)), BEAT * 1.2)

  // The tune. Every third time round it only plays the first half of each
  // phrase, and leaves the answer to you.
  const n = tune[bar][i]
  if (n !== null && !(pass % 3 === 2 && bar % 4 >= 2)) marimba(t, n + key, i % 2 === 0 ? 1 : 0.75)
}

function tick() {
  if (!ctx || !playing) return
  while (next < ctx.currentTime + 0.18) {
    const i = step & 7
    // Swing: the off-beat eighth comes late.
    const t = next + (i % 2 === 1 ? BEAT * (SWING - 0.5) : 0)
    play(step, t)
    next += BEAT / 2
    step = (step + 1) % 128
    if (step === 0) pass++
  }
}

export function startMusic() {
  const a = audio()
  if (!a || playing) return
  ctx = a
  wire(a)
  playing = true
  step = 0
  pass = 0
  next = a.currentTime + 0.12
  master!.gain.cancelScheduledValues(a.currentTime)
  master!.gain.setValueAtTime(master!.gain.value, a.currentTime)
  master!.gain.linearRampToValueAtTime(0.75, a.currentTime + 2.5)
  clearInterval(timer)
  timer = window.setInterval(tick, 25)
  tick()
}

export function stopMusic() {
  if (!ctx || !master) return
  playing = false
  clearInterval(timer)
  master.gain.cancelScheduledValues(ctx.currentTime)
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
  master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6)
}

/** Each room has its own key and its own tune; the change lands at once, mid-groove. */
export function setRoom(i: number) {
  room = i
  tune = compose(i + 1)
}

/** Make room for the win chime, then come back. */
export function duck() {
  if (!ctx || !master || !playing) return
  const t = ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setValueAtTime(master.gain.value, t)
  master.gain.linearRampToValueAtTime(0.3, t + 0.3)
  master.gain.linearRampToValueAtTime(0.75, t + 3.5)
}
