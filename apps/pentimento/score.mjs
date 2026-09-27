// PENTIMENTO — the score. A passacaglia: variations over a repeating ground.
//
// The ground is the lament bass (D–C–B♭–A, the descending tetrachord under
// Purcell's "When I am laid in earth", 1689 — the dodo's century). Each pass of
// the ground is one layer of the painting:
//   0–10 s   ground alone, harpsichord enters   → charcoal underdrawing
//  10–20 s   the dodo theme (recorder)          → Mauritius, 1598
//  20–30 s   dotted chords + timpani            → the ships, 1606
//  30–40 s   the lament (high recorder)         → the empty shore, 1662
//  40–50 s   every variation at once            → the X-ray: every layer at once
//  50–57 s   D major (a Picardy third)          → the dodo is still there
//
// Everything is synthesized here, offline, sample by sample: plucked strings
// (Karplus-Strong), a bowed viol (wavetable + bow noise), a recorder (sine +
// breath), timpani (inharmonic modes), charcoal and palette-knife foley, and
// a Freeverb church. Writes audio/score.wav and events.js (the timeline the
// picture is cut to).
//
//   node score.mjs

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const SR = 48000
const DUR = 57
const N = SR * DUR
const L = new Float32Array(N), R = new Float32Array(N)
const VL = new Float32Array(N), VR = new Float32Array(N) // reverb send

let seed = 20260926
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const noise = () => rnd() * 2 - 1
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)

const BPM = 72
const BEAT = 60 / BPM
const BAR = BEAT * 3
const T = (bar, beat = 0) => bar * BAR + beat * BEAT

// ─── mixing ───

function add(buf, t0, pan, gain, send) {
  const i0 = Math.round(t0 * SR)
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4)
  for (let i = 0; i < buf.length; i++) {
    const j = i0 + i
    if (j < 0 || j >= N) continue
    const v = buf[i]
    L[j] += v * gl
    R[j] += v * gr
    VL[j] += v * gl * send
    VR[j] += v * gr * send
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

// ─── instruments ───

// Harpsichord: two plucked strings (8' and a hair sharp), a quill click, dampers on release.
function harpsichord(m, dur, vel = 1) {
  const n = Math.floor((dur + 0.5) * SR)
  const out = new Float32Array(n)
  for (const [det, g] of [[0, 1], [3, 0.55]]) {
    const f = mtof(m) * Math.pow(2, det / 1200)
    const P = SR / f
    const len = Math.ceil(P) + 2
    const buf = new Float32Array(len)
    let prev = 0
    for (let i = 0; i < len; i++) { const x = noise(); buf[i] = (x + prev) * 0.5 * 0.9 + x * 0.1; prev = x }
    let w = 0
    const frac = P - Math.floor(P)
    const decay = Math.pow(0.001, 1 / (SR * (2.2 - Math.min(1.6, (m - 40) * 0.025))))
    let last = 0
    for (let i = 0; i < n; i++) {
      const r1 = (w - Math.floor(P) + len * 4) % len, r0 = (r1 - 1 + len) % len
      const d = buf[r1] * (1 - frac) + buf[r0] * frac
      const damp = i > dur * SR ? 0.93 : 1
      const y = (d + last) * 0.5 * decay * damp + (d - (d + last) * 0.5) * 0.02
      last = d
      buf[w] = y
      w = (w + 1) % len
      out[i] += y * g * 0.5 * vel
    }
  }
  const hp = new Biquad('hp', 2500, 0.7)
  for (let i = 0; i < SR * 0.006; i++) out[i] += hp.run(noise()) * 0.12 * vel * (1 - i / (SR * 0.006))
  return out
}

// Bass viol: a wavetable with a body curve, vibrato after the attack, bow hiss.
function viol(m, dur, vel = 1, marcato = false) {
  const f0 = mtof(m)
  const n = Math.floor((dur + 0.35) * SR)
  const out = new Float32Array(n)
  const TL = 2048
  const table = new Float32Array(TL)
  const body = (hz) => 0.35 + 1.1 * Math.exp(-(((hz - 280) / 140) ** 2)) + 0.8 * Math.exp(-(((hz - 650) / 260) ** 2)) + 0.45 * Math.exp(-(((hz - 2600) / 900) ** 2))
  for (let h = 1; h * f0 < 7000; h++) {
    const a = (1 / h) * body(h * f0)
    for (let i = 0; i < TL; i++) table[i] += a * Math.sin((2 * Math.PI * h * i) / TL)
  }
  let mx = 0
  for (const v of table) mx = Math.max(mx, Math.abs(v))
  for (let i = 0; i < TL; i++) table[i] /= mx
  const bow = new Biquad('bp', Math.min(4000, f0 * 6), 1.2)
  let ph = 0
  const att = marcato ? 0.035 : 0.14
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const vib = t > 0.3 ? 1 + 0.0026 * Math.sin(2 * Math.PI * 5.1 * t) * Math.min(1, (t - 0.3) * 3) : 1
    ph += (f0 * vib * TL) / SR
    const s = table[Math.floor(ph) % TL]
    let env = t < att ? t / att : t < dur ? 1 - 0.18 * ((t - att) / Math.max(0.01, dur - att)) : Math.max(0, 0.82 * (1 - (t - dur) / 0.35))
    if (marcato) env *= 1 + 0.6 * Math.exp(-t * 10)
    out[i] = (s * 0.9 + bow.run(noise()) * 0.18) * env * vel * 0.3
  }
  return out
}

// Recorder: nearly a sine, a chiff at the start, breath around the pitch.
function recorder(m, dur, vel = 1) {
  const f0 = mtof(m)
  const n = Math.floor((dur + 0.25) * SR)
  const out = new Float32Array(n)
  const breath = new Biquad('bp', f0, 6)
  const chiff = new Biquad('hp', 3000, 0.7)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const vib = t > 0.35 ? 1 + 0.0035 * Math.sin(2 * Math.PI * 4.8 * t) * Math.min(1, (t - 0.35) * 2) : 1
    ph += (2 * Math.PI * f0 * vib) / SR
    const tone = Math.sin(ph) + 0.08 * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph)
    const env = t < 0.045 ? t / 0.045 : t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.25)
    out[i] = (tone * 0.85 + breath.run(noise()) * 0.5) * env * vel * 0.16
    if (t < 0.03) out[i] += chiff.run(noise()) * 0.05 * vel * (1 - t / 0.03)
  }
  return out
}

// Timpani: inharmonic membrane modes, a felt mallet, a slight pitch sag.
function timpani(m, vel = 1) {
  const f0 = mtof(m)
  const n = SR * 3.5
  const out = new Float32Array(n)
  const modes = [[1, 1, 2.6], [1.504, 0.55, 1.7], [1.742, 0.32, 1.3], [2.0, 0.38, 1.1], [2.245, 0.22, 0.9], [2.494, 0.18, 0.8]]
  const phs = modes.map(() => 0)
  const lp = new Biquad('lp', 400, 0.7)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const sag = 1 + 0.012 * Math.exp(-t * 18)
    let s = 0
    modes.forEach(([r, a, d], k) => {
      phs[k] += (2 * Math.PI * f0 * r * sag) / SR
      s += Math.sin(phs[k]) * a * Math.exp(-t / d * 1.4)
    })
    if (t < 0.04) s += lp.run(noise()) * 1.6 * (1 - t / 0.04)
    out[i] = s * vel * 0.34 * Math.min(1, t / 0.002)
  }
  return out
}

// Charcoal on primed canvas: a dry, grainy scratch.
function charcoal(len, vel = 1) {
  const n = Math.floor(len * SR)
  const out = new Float32Array(n)
  const bp = new Biquad('bp', 3200 + rnd() * 900, 0.9)
  let grain = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    if (rnd() < 0.02) grain = 0.4 + rnd() * 0.6
    grain *= 0.995
    out[i] = bp.run(noise()) * (0.35 + grain) * Math.sin(Math.PI * t) * vel * 0.1
  }
  return out
}

// A palette knife dragged through wet paint: a rough rising scrape.
function scrape(len, vel = 1) {
  const n = Math.floor(len * SR)
  const out = new Float32Array(n)
  let chat = 0
  const bps = [new Biquad('bp', 900, 1.4), new Biquad('bp', 1700, 1.6)]
  for (let i = 0; i < n; i++) {
    const t = i / n
    if (rnd() < 0.008) chat = 0.5 + rnd() * 0.5
    chat *= 0.997
    const x = noise()
    out[i] = (bps[0].run(x) * (1 - t) + bps[1].run(x) * t) * (0.45 + chat) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.6) * vel * 0.3
  }
  return out
}

// ─── the ground and its variations ───

const GROUND = [38, 36, 34, 33] // D C B♭ A
const CHORDS = [[62, 65, 69], [60, 64, 67], [58, 62, 65], [57, 61, 64]]
const ARP = (c) => [c[0], c[1], c[2], c[0] + 12, c[2], c[1]]
const DODO = [ // bar-relative [beat, midi, beats]
  [[0, 74, 1], [1, 77, 0.5], [1.5, 76, 0.5], [2, 74, 1]],
  [[0, 72, 1.5], [1.5, 74, 0.5], [2, 76, 1]],
  [[0, 77, 0.5], [0.5, 76, 0.5], [1, 74, 1], [2, 70, 1]],
  [[0, 73, 2], [2, 69, 1]],
]
const LAMENT = [
  [[0, 81, 2], [2, 79, 1]],
  [[0, 79, 1], [1, 76, 2]],
  [[0, 77, 2], [2, 74, 1]],
  [[0, 76, 3]],
]

const ev = { charcoal: [], harp: [], dodo: [], chords: [], timp: [], lament: [], xray: [], final: T(20) }

// pan: viol a little left, harpsichord right, recorders either side, timpani center
for (let b = 0; b < 20; b++) {
  const g = b % 4, sec = Math.floor(b / 4)
  // the ground, always
  const bassVel = sec === 3 ? 0.55 : sec === 2 ? 1.1 : 0.9
  add(viol(GROUND[g], BAR * 0.98, bassVel, sec === 2), T(b), -0.25, 1, 0.25)
  if (sec === 2) add(viol(GROUND[g] + 12, BAR * 0.98, 0.5, true), T(b), -0.35, 1, 0.25)

  if (sec === 0) {
    for (let k = 0; k < 3; k++) {
      ev.charcoal.push(T(b, k))
      add(charcoal(0.28 + rnd() * 0.25, 0.9), T(b, k) + 0.02, (rnd() - 0.5) * 0.6, 1, 0.12)
    }
    if (b >= 1) CHORDS[g].forEach((m, i) => add(harpsichord(m, 0.5, 0.45), T(b, 1 + i * 0.5), 0.35, 1, 0.3))
  }
  if (sec === 1 || sec === 4) {
    ARP(CHORDS[g]).forEach((m, i) => {
      add(harpsichord(m, BEAT * 0.5, sec === 4 ? 0.5 : 0.62), T(b, i * 0.5), 0.35, 1, 0.3)
      if (sec === 1) ev.harp.push(T(b, i * 0.5))
    })
    for (const [bt, m, d] of DODO[g]) {
      add(recorder(m, d * BEAT * 0.95, sec === 4 ? 0.9 : 1), T(b, bt), -0.4, 1, 0.35)
      ;(sec === 1 ? ev.dodo : ev.xray).push({ t: T(b, bt), m, d: d * BEAT })
    }
  }
  if (sec === 2 || sec === 4) {
    const vel = sec === 4 ? 0.35 : 0.8
    for (let k = 0; k < 3; k++) {
      if (sec === 4 && k > 0) break
      for (const [off, v] of [[0, 1], [0.75, 0.7]]) {
        CHORDS[g].forEach((m, i) => add(harpsichord(m - 12, BEAT * 0.2, vel * v), T(b, k + off) + i * 0.012, 0.3, 1, 0.3))
        if (sec === 2) ev.chords.push(T(b, k + off))
      }
    }
    const hits = sec === 2 ? (g === 3 ? [0, 1, 2] : [0]) : [0]
    for (const k of hits) {
      const t = T(b, k)
      add(timpani(g === 3 ? 45 : 50, sec === 4 ? 0.45 : g === 3 ? 0.85 + k * 0.1 : 1), t, 0, 1, 0.3)
      if (sec === 2) {
        ev.timp.push(t)
        add(scrape(0.55 + rnd() * 0.2, 0.9), t + 0.03, (rnd() - 0.5) * 0.8, 1, 0.2)
      }
    }
  }
  if (sec === 3 || sec === 4) {
    if (sec === 3) add(harpsichord(GROUND[g] + 12, BAR * 0.5, 0.35), T(b), 0.35, 1, 0.45)
    for (const [bt, m, d] of LAMENT[g]) {
      add(recorder(m, d * BEAT * 0.97, sec === 4 ? 0.62 : 0.8), T(b, bt), sec === 4 ? 0.45 : -0.2, 1, 0.45)
      if (sec === 3) ev.lament.push({ t: T(b, bt), m, d: d * BEAT })
      else ev.xray.push({ t: T(b, bt), m, d: d * BEAT, lament: true })
    }
  }
}

// the Picardy third: D major, rolled, held into the church
const tf = T(20)
add(viol(38, 5.2, 0.9), tf, -0.25, 1, 0.35)
;[50, 54, 57, 62, 66, 69, 74].forEach((m, i) => add(harpsichord(m, 4, 0.55), tf + i * 0.07, 0.35, 1, 0.4))
add(recorder(78, 4.6, 0.75), tf + 0.5, -0.4, 1, 0.45)
add(recorder(81, 4.2, 0.55), tf + 0.9, 0.45, 1, 0.45)
add(timpani(50, 0.4), tf, 0, 1, 0.4)

// ─── Freeverb (a stone church) on the send bus ───

function freeverb(inp, spread) {
  const s = SR / 44100
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((l) => ({ b: new Float32Array(Math.round((l + spread) * s)), i: 0, f: 0 }))
  const aps = [556, 441, 341, 225].map((l) => ({ b: new Float32Array(Math.round((l + spread) * s)), i: 0 }))
  const room = 0.28 + 0.7 * 0.88, damp = 0.4 * 0.45
  const out = new Float32Array(inp.length)
  for (let n = 0; n < inp.length; n++) {
    const x = inp[n] * 0.015
    let y = 0
    for (const c of combs) {
      const o = c.b[c.i]
      c.f = o * (1 - damp) + c.f * damp
      c.b[c.i] = x + c.f * room
      c.i = (c.i + 1) % c.b.length
      y += o
    }
    for (const a of aps) {
      const o = a.b[a.i]
      a.b[a.i] = y + o * 0.5
      a.i = (a.i + 1) % a.b.length
      y = o - y
    }
    out[n] = y
  }
  return out
}
const RL = freeverb(VL, 0), RR = freeverb(VR, 23)
for (let i = 0; i < N; i++) {
  L[i] += RL[i] * 3.2
  R[i] += RR[i] * 3.2
}

// ─── master: gentle tape-ish saturation, normalize to −1 dBFS, fade the tail ───

let peak = 0
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh(L[i] * 1.1)
  R[i] = Math.tanh(R[i] * 1.1)
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
}
const norm = 0.89 / peak
const fadeFrom = (DUR - 1.5) * SR
const pcm = new Int16Array(N * 2)
let sum = 0
for (let i = 0; i < N; i++) {
  const f = i > fadeFrom ? 1 - (i - fadeFrom) / (N - fadeFrom) : 1
  const l = L[i] * norm * f, r = R[i] * norm * f
  sum += (l * l + r * r) / 2
  pcm[i * 2] = l * 32767
  pcm[i * 2 + 1] = r * 32767
}
const header = Buffer.alloc(44)
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.byteLength, 4); header.write('WAVE', 8)
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22)
header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34)
header.write('data', 36); header.writeUInt32LE(pcm.byteLength, 40)
mkdirSync(path.join(dir, 'audio'), { recursive: true })
writeFileSync(path.join(dir, 'audio/score.wav'), Buffer.concat([header, Buffer.from(pcm.buffer)]))
writeFileSync(
  path.join(dir, 'events.js'),
  `// generated by score.mjs — the timeline the picture is cut to\nwindow.SCORE = ${JSON.stringify({ bpm: BPM, beat: BEAT, bar: BAR, duration: DUR, ...ev })};\n`,
)
console.log(`score.wav ${DUR}s, rms ${(10 * Math.log10(sum / N)).toFixed(1)} dBFS, peak −1 dBFS; ${ev.charcoal.length} charcoal, ${ev.harp.length} harp, ${ev.dodo.length} dodo, ${ev.chords.length} chords, ${ev.timp.length} timp, ${ev.lament.length} lament`)
