// SUNNY M1 — the song. 124 BPM in G major: I–V–vi–IV, the sunniest four
// chords there are, on marimba, whistle, a warm FM piano, a plucky bass and a
// kick, clap and shaker. Everything stops dead on bar 14 (STOP!!!!!!!!!), a
// quiet webcam interlude follows, and it builds back up to a `git push`.
//
// All synthesized here, offline. Writes audio/song.wav and events.js.
//   node score.mjs

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const SR = 48000
const BPM = 124
const BEAT = 60 / BPM
const BAR = BEAT * 4
const BARS = 26
const DUR = Math.ceil(BARS * BAR + 3)
const N = SR * DUR
const L = new Float32Array(N), R = new Float32Array(N), VL = new Float32Array(N), VR = new Float32Array(N)
const T = (bar, beat = 0) => bar * BAR + beat * BEAT
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)
let seed = 926
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const noise = () => rnd() * 2 - 1

function add(buf, t0, pan, gain, send = 0) {
  const i0 = Math.round(t0 * SR)
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4)
  for (let i = 0; i < buf.length; i++) {
    const j = i0 + i
    if (j < 0 || j >= N) continue
    L[j] += buf[i] * gl; R[j] += buf[i] * gr; VL[j] += buf[i] * gl * send; VR[j] += buf[i] * gr * send
  }
}

class Biquad {
  constructor(type, f, q) {
    const w = (2 * Math.PI * f) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q)
    let b0, b1, b2, a0, a1, a2
    if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a }
    else if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a }
    else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a }
    Object.assign(this, { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 })
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y
    return y
  }
}
const buf = (sec) => new Float32Array(Math.floor(sec * SR))

// chamber's kick (src/app/amber/chamber), rendered offline with the same numbers
function kick(amp = 0.7) {
  const o = buf(0.26)
  let ph = 0
  for (let i = 0; i < o.length; i++) {
    const t = i / SR
    const f = t < 0.06 ? 70 * Math.pow(45 / 70, t / 0.06) : 45
    ph += (2 * Math.PI * f) / SR
    const env = t < 0.005 ? (amp * t) / 0.005 : amp * Math.pow(0.001 / amp, (t - 0.005) / 0.215)
    o[i] = Math.sin(ph) * (t < 0.22 ? env : 0)
  }
  const hp = new Biquad('hp', 1800, 0.7)
  for (let i = 0; i < SR * 0.022; i++) { const t = i / SR; o[i] += hp.run(noise()) * amp * 0.12 * Math.pow(0.001 / (amp * 0.12), t / 0.018) * (t < 0.018 ? 1 : 0) }
  return o
}
function clap(v = 1) {
  const o = buf(0.25), bp = new Biquad('bp', 1350, 0.9)
  for (let i = 0; i < o.length; i++) {
    const t = i / SR
    let e = 0
    for (const d of [0, 0.011, 0.023]) if (t >= d) e = Math.max(e, Math.exp(-(t - d) * (d === 0.023 ? 16 : 180)))
    o[i] = bp.run(noise()) * e * 0.5 * v
  }
  return o
}
function shaker(v = 1) {
  const o = buf(0.06), hp = new Biquad('hp', 7500, 0.7)
  for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = hp.run(noise()) * Math.sin(Math.PI * Math.min(1, t / 0.05)) * 0.12 * v }
  return o
}
function bass(m, len, v = 1) {
  const f = mtof(m), o = buf(len + 0.05), lp = new Biquad('lp', 700, 0.9)
  let ph = 0
  for (let i = 0; i < o.length; i++) {
    const t = i / SR
    ph += (2 * Math.PI * f) / SR
    const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 4.2) * (t < len ? 1 : Math.max(0, 1 - (t - len) / 0.05))
    o[i] = (Math.sin(ph) * 0.8 + lp.run(saw) * 0.35) * env * 0.42 * v
  }
  return o
}
function marimba(m, v = 1) {
  const f = mtof(m), o = buf(0.9)
  const parts = [[1, 1, 2.2], [3.93, 0.3, 7], [9.1, 0.1, 22]]
  for (let i = 0; i < o.length; i++) {
    const t = i / SR
    let s = 0
    for (const [r, a, d] of parts) s += Math.sin(2 * Math.PI * f * r * t) * a * Math.exp(-t * d)
    o[i] = s * Math.min(1, t / 0.0015) * 0.22 * v
  }
  const bp = new Biquad('bp', f * 2, 2)
  for (let i = 0; i < SR * 0.008; i++) o[i] += bp.run(noise()) * 0.08 * v * (1 - i / (SR * 0.008))
  return o
}
function epiano(m, len, v = 1) {
  const f = mtof(m), o = buf(len + 0.4)
  for (let i = 0; i < o.length; i++) {
    const t = i / SR
    const idx = 1.8 * Math.exp(-t * 5)
    const mod = Math.sin(2 * Math.PI * f * t) * idx
    const env = Math.min(1, t / 0.003) * Math.exp(-t * 2.2) * (t < len ? 1 : Math.max(0, 1 - (t - len) / 0.4))
    o[i] = Math.sin(2 * Math.PI * f * t + mod) * env * 0.09 * v
  }
  return o
}
function pad(ms, len, v = 1) {
  const o = buf(len + 1), lp = new Biquad('lp', 1100, 0.7)
  const phs = ms.flatMap((m) => [[mtof(m) * 1.003, 0], [mtof(m) * 0.997, 0]])
  for (let i = 0; i < o.length; i++) {
    const t = i / SR
    let s = 0
    for (const p of phs) { p[1] += p[0] / SR; s += ((p[1] % 1) * 2 - 1) }
    const env = Math.min(1, t / 0.6) * (t < len ? 1 : Math.max(0, 1 - (t - len)))
    o[i] = lp.run(s) * env * 0.025 * v
  }
  return o
}
function whistle(m, len, v = 1) {
  const f = mtof(m), o = buf(len + 0.15), br = new Biquad('bp', f, 5)
  let ph = 0
  for (let i = 0; i < o.length; i++) {
    const t = i / SR
    const scoop = Math.pow(2, (-55 * Math.exp(-t * 30)) / 1200)
    const vib = 1 + (t > 0.14 ? 0.006 * Math.sin(2 * Math.PI * 5.6 * t) : 0)
    ph += (2 * Math.PI * f * scoop * vib) / SR
    const env = Math.min(1, t / 0.025) * (t < len ? 1 : Math.max(0, 1 - (t - len) / 0.15))
    o[i] = (Math.sin(ph) + 0.05 * Math.sin(2 * ph) + br.run(noise()) * 0.25) * env * 0.13 * v
  }
  return o
}

// ─── the song ───
const ROOT = [43, 42, 40, 36] // G, D/F#, Em, C
const CHORD = [[55, 59, 62], [54, 57, 62], [55, 59, 64], [55, 60, 64]]
const RIFF = [2, 0, 1, 2, 0, 1, 2, 1]
const HOOK = [
  [[0, 83, 1], [1, 86, 1], [2, 83, 0.5], [2.5, 81, 0.5], [3, 79, 1]],
  [[0, 81, 1], [1, 78, 1], [2, 81, 0.5], [2.5, 83, 0.5], [3, 81, 1]],
  [[0, 79, 1], [1, 76, 1], [2, 79, 1], [3, 83, 1]],
  [[0, 81, 2], [2, 79, 0.5], [2.5, 76, 0.5], [3, 74, 1]],
]
const STOP_BAR = 14
const ev = { bpm: BPM, beat: BEAT, bar: BAR, bars: BARS, stop: T(STOP_BAR), end: T(BARS), kicks: [], claps: [], hook: [], plinks: [] }

for (let b = 0; b < BARS; b++) {
  const g = b % 4
  const intro = b < 2, stop = b === STOP_BAR, soft = b > STOP_BAR && b < 20, build = b >= 20 && b < 22
  const full = (b >= 2 && b < STOP_BAR) || b >= 22
  if (stop) {
    // a single plink, three beats after the silence: "I stopped."
    add(marimba(79, 0.7), T(b, 3), 0.2, 1, 0.3)
    ev.plinks.push(T(b, 3))
    continue
  }
  // marimba riff (softer in the interlude)
  RIFF.forEach((ci, k) => {
    if (soft && k % 2) return
    const acc = k === 0 || k === 3 || k === 6 ? 1 : 0.7
    add(marimba(CHORD[g][ci] + 12, acc * (soft ? 0.6 : intro ? 0.75 : 0.9)), T(b, k * 0.5), 0.25, 1, 0.2)
  })
  if (soft) {
    add(pad(CHORD[g], BAR * 0.98, 1), T(b), 0, 1, 0.4)
    if (b >= 17) for (let k = 0; k < 8; k++) add(shaker(0.5), T(b, k * 0.5 + (k % 2 ? 0.08 : 0)), 0.4, 1, 0)
  }
  if (full || build) {
    for (let k = 0; k < 4; k++) { add(kick(0.7), T(b, k), 0, 1, 0); ev.kicks.push(T(b, k)) }
    if (full || b === 21) for (const k of [1, 3]) { add(clap(1), T(b, k), -0.05, 1, 0.25); ev.claps.push(T(b, k)) }
    for (let k = 0; k < 16; k++) add(shaker(k % 4 === 2 ? 1.2 : 0.8), T(b, k * 0.25 + (k % 2 ? 0.045 : 0)), 0.45, 1, 0)
    // bass: root, the and-of-2, and an octave on 4
    for (const [st, oct, len] of [[0, 0, 0.9], [1.5, 0, 0.4], [3, 12, 0.4], [3.5, 0, 0.35]]) add(bass(ROOT[g] - 12 + oct, BEAT * len), T(b, st), 0, 1, 0)
    // FM piano stabs on the offbeats
    for (const st of [0.5, 2.5]) CHORD[g].forEach((m) => add(epiano(m + 12, BEAT * 0.4), T(b, st), -0.3, 1, 0.3))
  }
  if (b === 1) for (let k = 0; k < 8; k++) add(shaker(0.6), T(b, k * 0.5), 0.4, 1, 0)
  // the whistle hook
  if ((b >= 4 && b < 8) || (b >= 10 && b < 14) || b >= 22) {
    for (const [st, m, d] of HOOK[g]) { add(whistle(m, BEAT * d * 0.9), T(b, st), -0.3, 1, 0.35); ev.hook.push(T(b, st)) }
  }
}
// the last chord, and let it ring
const tEnd = T(BARS)
add(kick(0.7), tEnd, 0, 1, 0)
add(clap(1.1), tEnd, 0, 1, 0.4)
;[43, 55, 59, 62, 67, 71].forEach((m, i) => add(marimba(m + (i > 2 ? 12 : 0), 1), tEnd + i * 0.03, 0.2, 1, 0.4))
add(whistle(79, 1.6, 0.9), tEnd, -0.3, 1, 0.5)
add(pad([55, 59, 62], 2, 1.2), tEnd, 0, 1, 0.5)

// ─── room reverb, master ───
function freeverb(inp, spread) {
  const s = SR / 44100
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((l) => ({ b: new Float32Array(Math.round((l + spread) * s)), i: 0, f: 0 }))
  const aps = [556, 441, 341, 225].map((l) => ({ b: new Float32Array(Math.round((l + spread) * s)), i: 0 }))
  const room = 0.28 + 0.7 * 0.6, damp = 0.4 * 0.5
  const out = new Float32Array(inp.length)
  for (let n = 0; n < inp.length; n++) {
    const x = inp[n] * 0.015
    let y = 0
    for (const c of combs) { const o = c.b[c.i]; c.f = o * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * room; c.i = (c.i + 1) % c.b.length; y += o }
    for (const a of aps) { const o = a.b[a.i]; a.b[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.b.length; y = o - y }
    out[n] = y
  }
  return out
}
const RL = freeverb(VL, 0), RR = freeverb(VR, 23)
let peak = 0
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh((L[i] + RL[i] * 2.4) * 1.2)
  R[i] = Math.tanh((R[i] + RR[i] * 2.4) * 1.2)
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
}
const norm = 0.89 / peak
const pcm = new Int16Array(N * 2)
let sum = 0
for (let i = 0; i < N; i++) { const l = L[i] * norm, r = R[i] * norm; sum += (l * l + r * r) / 2; pcm[i * 2] = l * 32767; pcm[i * 2 + 1] = r * 32767 }
const h = Buffer.alloc(44)
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.byteLength, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16)
h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34)
h.write('data', 36); h.writeUInt32LE(pcm.byteLength, 40)
mkdirSync(path.join(dir, 'audio'), { recursive: true })
writeFileSync(path.join(dir, 'audio/song.wav'), Buffer.concat([h, Buffer.from(pcm.buffer)]))
writeFileSync(path.join(dir, 'events.js'), `// generated by score.mjs\nwindow.SONG = ${JSON.stringify({ ...ev, duration: DUR })};\n`)
console.log(`song.wav ${DUR}s rms ${(10 * Math.log10(sum / N)).toFixed(1)} dBFS · stop at ${ev.stop.toFixed(2)}s · end ${ev.end.toFixed(2)}s`)
