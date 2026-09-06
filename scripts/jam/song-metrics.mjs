#!/usr/bin/env node
// Listening proxy for rendered Jambot songs: per-section loudness, dynamics
// and spectral balance from a WAV (16-bit PCM, mono or stereo).
//
//   node scripts/jam/song-metrics.mjs song.wav 128 "8,8,16,8,16,16,8,8,16,8,8,8"
//   node scripts/jam/song-metrics.mjs song.wav 128            (one row per 8 bars)
//
// Columns: bar range, RMS (dBFS), peak (dBFS), crest factor, low band
// (< 120 Hz) share, high band (> 5 kHz) share, onsets per bar, silence %.
// Also exported as analyzeWav(buffer, bpm, sectionBars) for scripts.

import { readFileSync } from 'node:fs'

export function readWav(buf) {
  const riff = buf.toString('ascii', 0, 4)
  if (riff !== 'RIFF') throw new Error('not a RIFF/WAV file')
  let off = 12
  let fmt = null
  let data = null
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') {
      fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) }
    } else if (id === 'data') {
      data = buf.subarray(off + 8, off + 8 + size)
    }
    off += 8 + size + (size % 2)
  }
  if (!fmt || !data) throw new Error('missing fmt or data chunk')
  if (fmt.bits !== 16) throw new Error(`unsupported bit depth ${fmt.bits}`)
  const frames = data.length / 2 / fmt.channels
  const mono = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let s = 0
    for (let c = 0; c < fmt.channels; c++) s += data.readInt16LE((i * fmt.channels + c) * 2) / 32768
    mono[i] = s / fmt.channels
  }
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, mono }
}

const db = (x) => (x <= 1e-9 ? -Infinity : 20 * Math.log10(x))
const fmtDb = (x) => (x === -Infinity ? '  -inf' : x.toFixed(1).padStart(6))

// One-pole band split is enough for a balance proxy.
function bandShares(x, sampleRate) {
  const lowRc = 1 / (2 * Math.PI * 120), highRc = 1 / (2 * Math.PI * 5000)
  const dt = 1 / sampleRate
  const aL = dt / (lowRc + dt), aH = highRc / (highRc + dt)
  let lp = 0, hpPrev = 0, hpOut = 0
  let eL = 0, eH = 0, eT = 0
  for (let i = 0; i < x.length; i++) {
    lp += aL * (x[i] - lp)
    hpOut = aH * (hpOut + x[i] - hpPrev); hpPrev = x[i]
    eL += lp * lp; eH += hpOut * hpOut; eT += x[i] * x[i]
  }
  return { low: eT ? eL / eT : 0, high: eT ? eH / eT : 0 }
}

function onsets(x, sampleRate) {
  // Energy envelope in 10 ms hops; onset when it jumps > 6 dB over the
  // previous hop and is above -40 dBFS.
  const hop = Math.floor(sampleRate / 100)
  let prev = 0, n = 0
  for (let i = 0; i + hop <= x.length; i += hop) {
    let e = 0
    for (let j = i; j < i + hop; j++) e += x[j] * x[j]
    e = Math.sqrt(e / hop)
    if (e > 0.01 && prev > 0 && e / prev > 2) n++
    prev = e
  }
  return n
}

export function analyzeWav({ sampleRate, mono }, bpm, sectionBars) {
  const samplesPerBar = Math.round((60 / bpm) * 4 * sampleRate)
  const totalBars = Math.floor(mono.length / samplesPerBar)
  const bars = sectionBars && sectionBars.length ? sectionBars : Array.from({ length: Math.ceil(totalBars / 8) }, () => 8)
  const rows = []
  let bar = 0
  for (const n of bars) {
    const start = bar * samplesPerBar, end = Math.min(mono.length, (bar + n) * samplesPerBar)
    if (start >= mono.length) break
    const x = mono.subarray(start, end)
    let sum = 0, peak = 0, silent = 0
    for (let i = 0; i < x.length; i++) { const v = x[i]; sum += v * v; const a = Math.abs(v); if (a > peak) peak = a }
    const hop = Math.floor(sampleRate / 20)
    let hops = 0
    for (let i = 0; i + hop <= x.length; i += hop) { let e = 0; for (let j = i; j < i + hop; j++) e += x[j] * x[j]; hops++; if (Math.sqrt(e / hop) < 0.003) silent++ }
    const rms = Math.sqrt(sum / x.length)
    const { low, high } = bandShares(x, sampleRate)
    rows.push({
      bars: `${bar + 1}-${bar + n}`, n,
      rmsDb: db(rms), peakDb: db(peak), crest: peak && rms ? peak / rms : 0,
      low, high, onsetsPerBar: onsets(x, sampleRate) / n, silence: hops ? silent / hops : 0,
    })
    bar += n
  }
  return { totalBars, rows }
}

export function formatRows(rows) {
  const head = 'bars       rms dB   peak dB  crest  low%  high%  onsets/bar  silence%'
  const lines = rows.map((r) =>
    `${r.bars.padEnd(9)} ${fmtDb(r.rmsDb)}   ${fmtDb(r.peakDb)}  ${r.crest.toFixed(1).padStart(5)}  ${(r.low * 100).toFixed(0).padStart(4)}  ${(r.high * 100).toFixed(1).padStart(5)}  ${r.onsetsPerBar.toFixed(1).padStart(10)}  ${(r.silence * 100).toFixed(0).padStart(8)}`)
  return [head, ...lines].join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, bpmArg, sectionsArg] = process.argv.slice(2)
  if (!file) { console.error('usage: song-metrics.mjs <wav> [bpm] [sectionBars,...]'); process.exit(1) }
  const wav = readWav(readFileSync(file))
  const bpm = Number(bpmArg) || 128
  const sections = sectionsArg ? sectionsArg.split(',').map(Number) : null
  const { totalBars, rows } = analyzeWav(wav, bpm, sections)
  console.log(`${file}: ${totalBars} bars at ${bpm} BPM, ${wav.channels} ch, ${wav.sampleRate} Hz`)
  console.log(formatRows(rows))
}
