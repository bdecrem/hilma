// Listening proxy for a DRUM sheet's WAV: levels, clipping, bands, and the
// spacing of kick onsets. node scripts/drum/wav-metrics.mjs <file.wav> [bpm]
import { readFileSync } from 'node:fs'

const buf = readFileSync(process.argv[2])
const bpm = Number(process.argv[3] ?? 124)
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
const sr = dv.getUint32(24, true)
const ch = dv.getUint16(22, true)
const n = (buf.length - 44) / 2 / ch
const L = new Float32Array(n), R = new Float32Array(n)
for (let i = 0; i < n; i++) {
  L[i] = dv.getInt16(44 + i * 2 * ch, true) / 32768
  R[i] = dv.getInt16(44 + i * 2 * ch + 2, true) / 32768
}
const db = (v) => (20 * Math.log10(Math.max(1e-9, v))).toFixed(1)
let peak = 0, sum = 0, clip = 0
for (let i = 0; i < n; i++) {
  const m = Math.max(Math.abs(L[i]), Math.abs(R[i]))
  peak = Math.max(peak, m)
  sum += (L[i] * L[i] + R[i] * R[i]) / 2
  if (m > 0.995) clip++
}
const rms = Math.sqrt(sum / n)
// one-pole bands on the mono sum
const mono = L.map((v, i) => (v + R[i]) / 2)
const lp = (x, fc) => {
  const a = Math.exp((-2 * Math.PI * fc) / sr)
  const y = new Float32Array(x.length)
  let s = 0
  for (let i = 0; i < x.length; i++) y[i] = s = (1 - a) * x[i] + a * s
  return y
}
const low = lp(lp(mono, 150), 150)
const lowMid = lp(mono, 2000)
const high = mono.map((v, i) => v - lowMid[i])
const e = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)
// kick onsets: low-band envelope rising through a threshold
const hop = Math.floor(sr * 0.005)
const env = []
for (let i = 0; i + hop < n; i += hop) {
  let m = 0
  for (let j = i; j < i + hop; j++) m = Math.max(m, Math.abs(low[j]))
  env.push(m)
}
const thr = Math.max(...env) * 0.45
const onsets = []
for (let i = 1; i < env.length; i++) if (env[i] >= thr && env[i - 1] < thr && (!onsets.length || i * 0.005 - onsets[onsets.length - 1] > 0.15)) onsets.push(i * 0.005)
const iv = onsets.slice(1).map((t, i) => t - onsets[i])
const beat = 60 / bpm
const dev = iv.map((d) => Math.abs(d - beat * Math.round(d / beat)))
console.log(JSON.stringify({
  seconds: +(n / sr).toFixed(2),
  peak_dbfs: +db(peak),
  rms_dbfs: +db(rms),
  crest_db: +(20 * Math.log10(peak / rms)).toFixed(1),
  clipped_samples: clip,
  low_rms_db: +db(e(low)),
  high_rms_db: +db(e(high)),
  kicks: onsets.length,
  kick_interval_ms: iv.length ? +((iv.reduce((a, b) => a + b, 0) / iv.length) * 1000).toFixed(1) : null,
  beat_ms: +(beat * 1000).toFixed(1),
  worst_off_grid_ms: dev.length ? +(Math.max(...dev) * 1000).toFixed(1) : null,
}))
