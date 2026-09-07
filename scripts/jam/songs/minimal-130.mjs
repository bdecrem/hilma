#!/usr/bin/env node
// Minimal 130 — Mills-school minimal techno, 64 bars, A minor, 130 BPM.
//
// Built from Bart's own saved sounds and lines (scripts/jam/songs/
// techno-128-base.json: his tuned-down 909 kit, the one-note A1 sub, his A
// and B 202 stabs, the seven JT10 notes) using only Jambot tool calls — the
// same calls the chat agent makes — so it opens in the web and native apps as
// a real track with every pattern, lane and effect.
//
// Rules it obeys (from what he kept and what he rejected, the tribal-sketch
// invariants and the Mills / Hawtin entries in library.json): changes only
// on 8-bar boundaries, one element at a time, tension from subtraction;
// kick tuned down as the anchor, sub one note under it; hats on 8ths and
// quiet, no clap, one dark open hat per bar at most; the rimshot carries the
// syncopation through a short 16th delay; stabs from his own lines with at
// most two slides; one sparse counter line (his seven notes); the filter, not
// new notes, is the melody; dry drums, reverb only on the JT10 and the open
// hat; no risers, no crashes, no EDM grammar.
//
// Shape (8-bar sections; the ghost bar is bar 32):
//   1   PULSE  kick + one-note sub
//   9   RIM    a rimshot on the "a" of 3 through a 16th delay; closed 8ths creep in
//   17  STABS  his A stabs rise out of a closed filter; the rim grows a second hit
//   25  LINE   his seven JT10 notes on the dotted-8th ping-pong; a dark open hat
//   32  GHOST  one bar: kick and sub out, hats, rim and stabs hang
//   33  PEAK   kick back on his B line, the rim lattice, one dark open hat
//   41  PEAK 2 the stabs step out and a low JT30 answers, filter opening then snapping back; toms; two bars of ride
//   49  STRIP  everything but kick, hats, rim, sub and the A stabs sinking under the filter
//   57  OUT    kick, sub and dim stabs for the next record
//
//   node scripts/jam/songs/minimal-130.mjs              # full build + render
//   OUT=/some/dir node scripts/jam/songs/minimal-130.mjs
//   AUDITION=6 node scripts/jam/songs/minimal-130.mjs   # render section 6 only
//
// Outputs in $OUT (default scripts/jam/songs/out/minimal-130, gitignored):
// song.wav, metrics.txt, track.json (title, bpm, bars, session, plan,
// messages, feed), toolcalls.log. Deterministic.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HILMA = resolve(HERE, '..', '..', '..')
const JAMBOT = resolve(HILMA, '../vibeceo/jambot')
const BASE = resolve(HERE, 'techno-128-base.json')
const OUT = process.env.OUT || resolve(HERE, 'out', 'minimal-130')
mkdirSync(OUT, { recursive: true })

const { deserializeSession, serializeSession } = await import(`${JAMBOT}/core/session.js`)
const { renderSessionToBuffer } = await import(`${JAMBOT}/core/render.js`)
const { audioBufferToWav } = await import(`${JAMBOT}/core/wav.js`)
const { initializeTools, executeTool } = await import(`${JAMBOT}/tools/index.js`)
const { readWav, analyzeWav, formatRows } = await import(`${HILMA}/scripts/jam/song-metrics.mjs`)

await initializeTools()
const session = deserializeSession(JSON.parse(readFileSync(BASE, 'utf8')))

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const VERBOSE = !!process.env.VERBOSE
const log = []
async function t(name, input) {
  const r = await executeTool(name, input, session, {})
  const text = typeof r === 'string' ? r : JSON.stringify(r)
  log.push(`${name} ${JSON.stringify(input).slice(0, 160)} → ${text.split('\n')[0].slice(0, 160)}`)
  if (VERBOSE) console.log(log[log.length - 1])
  if (/^Error|^No |^Unknown|FAILED/.test(text)) throw new Error(`${name}: ${text}`)
  return text
}

/** Melodic pattern from { stepIndex: 'A1' | 'A1!' | 'C2~' | 'A1!~' }. */
function seq(spec, bars = 1) {
  const steps = Array.from({ length: bars * 16 }, () => ({ note: 'A1', gate: false, accent: false, slide: false }))
  for (const [i, tok] of Object.entries(spec)) {
    const note = tok.replace(/[!~]/g, '')
    steps[Number(i)] = { note, gate: true, accent: tok.includes('!'), slide: tok.includes('~') }
  }
  return steps
}
const clone = (pattern) => pattern.map((s) => ({ ...s }))
const repeat = (pattern, n) => Array.from({ length: n }, () => clone(pattern)).flat()
const expRamp = (n, a, b) => Array.from({ length: n }, (_, i) => Math.round(a * Math.pow(b / a, i / (n - 1))))
const linRamp = (n, a, b) => Array.from({ length: n }, (_, i) => Math.round((a + ((b - a) * i) / (n - 1)) * 10) / 10)
const everyBar = (bars, stepsInBar) => Array.from({ length: bars }, (_, b) => stepsInBar.map((s) => b * 16 + s)).flat()
const KICK = [0, 4, 8, 12]
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14]

// His saved lines, reused verbatim.
const stabsA = session.patterns.jb202.A.pattern     // . A1 A1 . . A1 A1! . . A1 C2~ . . A1 A1! G1~
const stabsB = session.patterns.jb202.B.pattern     // A1! . A2 A1 . C2 . D2~ A1! . A2 . G1 A1 . E2~
const subA = session.patterns['jb202-2'].A.pattern  // A1! . . A1 . . A1 . A1! . A1 A1 . . A1 .
const leadA = session.patterns.jt10.A.pattern       // 64 steps: E4! G4 A4 E4 C5! B4 A4~

// ---------------------------------------------------------------------------
// 1. Tempo, groove, kit, levels, effects
// ---------------------------------------------------------------------------
await t('set_bpm', { bpm: 130 })
await t('set_swing', { amount: 8 })

// His 909: kick -7 st, decay 100, attack 40. The open hat goes dark (his last
// move on it), the rim tuned down and short, no clap, no ride by default.
await t('tweak_multi', { params: {
  'jt90.kick.tune': -7, 'jt90.kick.decay': 100, 'jt90.kick.attack': 40, 'jt90.kick.level': -5.5,
  'jt90.ch.level': -33, 'jt90.ch.decay': 39, 'jt90.ch.tone': 100,
  'jt90.oh.level': -19, 'jt90.oh.decay': 55, 'jt90.oh.tone': 20,
  'jt90.rimshot.level': -6, 'jt90.rimshot.tune': -7, 'jt90.rimshot.decay': 12,
  'jt90.lowtom.level': -8, 'jt90.lowtom.tune': -2, 'jt90.lowtom.decay': 70,
  'jt90.midtom.level': -10, 'jt90.midtom.tune': -5, 'jt90.midtom.decay': 55,
  'jt90.ride.level': -22, 'jt90.ride.tune': 2, 'jt90.ride.decay': 60,
  'jt90.clap.level': -60,
} })

// Gain-staged node levels (the stage in section 8 re-runs only if the peak moves).
await t('tweak', { path: 'jt90.level', value: -0.2 })
await t('tweak', { path: 'jb202.level', value: -10.2 })
await t('tweak', { path: 'jb202-2.level', value: -4.7 })
await t('tweak', { path: 'jt10.level', value: -8.2 })

// His JT10 delay: dotted-8th ping-pong, feedback 52, 6.5 kHz highcut. Small room on it.
await t('tweak', { path: 'fx.jt10.delay1.mode', value: 'pingpong' })
await t('tweak', { path: 'fx.jt10.delay1.sync', value: 'dotted8th' })
await t('tweak_effect', { target: 'jt10', effect: 'delay1', feedback: 52, mix: 42, lowcut: 300, highcut: 6500 })
await t('add_effect', { target: 'jt10', effect: 'reverb', decay: 2.2, mix: 16, lowcut: 260, damping: 60, predelay: 20, size: 55 })
// The rimshot through a short 16th analog delay (his Mills-track settings) and the open hat in a small room.
await t('add_effect', { target: 'jt90.rimshot', effect: 'delay', mode: 'analog', sync: '16th', feedback: 14, mix: 11, lowcut: 300, highcut: 6000, saturation: 8 })
await t('add_effect', { target: 'jt90.oh', effect: 'reverb', decay: 1.6, mix: 18, lowcut: 300, damping: 65, size: 45 })
// Sub and stabs already duck under the kick (his session); a touch less on the stabs.
await t('tweak_effect', { target: 'jb202', effect: 'sidechain1', amount: 0.35 })

// ---------------------------------------------------------------------------
// 2. Drums — every pattern is one element more or less than the last
// ---------------------------------------------------------------------------
const RIM_ORGANIC = [12, 13, 14, 16, 18, 20, 21, 22, 21, 20, 18, 16, 14, 13, 12, 12] // decay ride, per bar
// K: kick + closed 8ths. The pulse.
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: EIGHTHS })
await t('save_pattern', { instrument: 'jt90', name: 'K' })
// R1 (8 bars): + one rimshot on the "a" of 3; the closed hats creep up over the eight bars.
await t('add_jt90', { clear: true, bars: 8, kick: everyBar(8, KICK), ch: everyBar(8, EIGHTHS), rimshot: everyBar(8, [11]) })
await t('automate', { path: 'jt90.ch.level', values: linRamp(128, -33, -24) })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'R1' })
// R2 (2 bars): the rim grows — bar 2 answers with the "e" of 1 and the "a" of 4.
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, EIGHTHS), rimshot: [11, 16 + 3, 16 + 11, 16 + 14] })
await t('tweak', { path: 'jt90.ch.level', value: -24 })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'R2' })
// R2O: R2 + one dark open hat on 14.
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, EIGHTHS), oh: everyBar(2, [14]), rimshot: [11, 16 + 3, 16 + 11, 16 + 14] })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'R2O' })
// GHOST (1 bar): the kick is gone; hats, rim and open hat hold the room.
await t('add_jt90', { clear: true, bars: 1, ch: EIGHTHS, oh: [14], rimshot: [3, 11, 14] })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'GHOST' })
// P1 (2 bars): the lattice — E(5,16)-ish rim, a low tom on the 6 of bar 2, open hat on 14.
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, EIGHTHS), oh: everyBar(2, [14]),
  rimshot: [3, 11, 16 + 3, 16 + 9, 16 + 11, 16 + 14] })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'P1' })
// P2 (8 bars): P1 + a mid tom on the 13 of every fourth bar, and the ride for the last two bars only.
await t('add_jt90', { clear: true, bars: 8, kick: everyBar(8, KICK), ch: everyBar(8, EIGHTHS), oh: everyBar(8, [14]),
  rimshot: Array.from({ length: 4 }, (_, i) => [3, 11, 16 + 3, 16 + 9, 16 + 11, 16 + 14].map((s) => s + i * 32)).flat(),
  lowtom: [1, 3, 5, 7].map((b) => b * 16 + 6), midtom: [3, 7].map((b) => b * 16 + 13),
  ride: everyBar(2, EIGHTHS).map((s) => s + 6 * 16) })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'P2' })
// S: subtraction — kick, 8ths, one rim.
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: EIGHTHS, rimshot: [11] })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'S' })

// ---------------------------------------------------------------------------
// 3. Sub — one note, his rhythm, all the way through
// ---------------------------------------------------------------------------
await t('add_jb202', { instrument: 'jb202-2', pattern: clone(subA) })
await t('save_pattern', { instrument: 'jb202-2', name: 'SUB' })

// ---------------------------------------------------------------------------
// 4. Stabs — his A and B lines; the filter is the melody
// ---------------------------------------------------------------------------
// RISE (8 bars): A stabs climbing out of a closed filter.
await t('add_jb202', { instrument: 'jb202', pattern: repeat(stabsA, 8) })
await t('automate', { path: 'jb202.filterCutoff', values: expRamp(128, 90, 420) })
await t('automate', { path: 'jb202.filterResonance', values: linRamp(128, 28, 38) })
await t('save_pattern', { instrument: 'jb202', name: 'RISE' })
// A: at rest, cutoff 420.
await t('add_jb202', { instrument: 'jb202', pattern: clone(stabsA) })
await t('tweak', { path: 'jb202.filterCutoff', value: 420 })
await t('tweak', { path: 'jb202.filterResonance', value: 28 })
await t('save_pattern', { instrument: 'jb202', name: 'A' })
// B: his octave-jump line for the peak, a little more open and driven.
await t('add_jb202', { instrument: 'jb202', pattern: clone(stabsB) })
await t('tweak', { path: 'jb202.filterCutoff', value: 520 })
await t('tweak', { path: 'jb202.drive', value: 38 })
await t('save_pattern', { instrument: 'jb202', name: 'B' })
// FALL (8 bars): A stabs sinking under the filter.
await t('add_jb202', { instrument: 'jb202', pattern: repeat(stabsA, 8) })
await t('tweak', { path: 'jb202.drive', value: 25 })
await t('automate', { path: 'jb202.filterCutoff', values: expRamp(128, 420, 120) })
await t('automate', { path: 'jb202.filterResonance', values: linRamp(128, 28, 44) })
await t('save_pattern', { instrument: 'jb202', name: 'FALL' })
// DIM: A stabs closed and quiet for the outro.
await t('add_jb202', { instrument: 'jb202', pattern: clone(stabsA) })
await t('tweak', { path: 'jb202.filterCutoff', value: 150 })
await t('tweak', { path: 'jb202.osc1Level', value: 45 })
await t('save_pattern', { instrument: 'jb202', name: 'DIM' })
await t('tweak', { path: 'jb202.osc1Level', value: 70 })
await t('tweak', { path: 'jb202.filterCutoff', value: 420 })

// ---------------------------------------------------------------------------
// 5. The line — his seven notes, nothing added
// ---------------------------------------------------------------------------
await t('add_jt10', { pattern: clone(leadA), bars: 4 })
await t('save_pattern', { instrument: 'jt10', name: 'A' })

// ---------------------------------------------------------------------------
// 6. JT30 — a low acid answer for the peak only: 1, b3, b7, one slide
// ---------------------------------------------------------------------------
const acid = seq({ 0: 'A1!', 6: 'C2', 10: 'A1~', 12: 'G1', 14: 'A1' })
await t('add_jt30', { pattern: repeat(acid, 8), bars: 8 })
await t('tweak_multi', { params: { 'jt30.bass.waveform': 'sawtooth', 'jt30.bass.cutoff': 120, 'jt30.bass.resonance': 62, 'jt30.bass.envMod': 55, 'jt30.bass.decay': 40, 'jt30.bass.accent': 70, 'jt30.bass.drive': 30 } })
await t('tweak', { path: 'jt30.level', value: -9 })
await t('add_sidechain', { target: 'jt30', trigger: 'kick', amount: 0.35 })
// ACID (8 bars): the filter opens from 120 to 520 Hz across the section.
await t('automate', { path: 'jt30.bass.cutoff', values: expRamp(128, 120, 520) })
await t('save_pattern', { instrument: 'jt30', name: 'ACID' })
// ACID2 (8 bars): it bites (more resonance) and snaps back down over the last bars.
await t('add_jt30', { pattern: repeat(acid, 8), bars: 8 })
await t('automate', { path: 'jt30.bass.cutoff', values: [...expRamp(96, 140, 620), ...expRamp(32, 620, 160)] })
await t('automate', { path: 'jt30.bass.resonance', values: linRamp(128, 62, 74) })
await t('save_pattern', { instrument: 'jt30', name: 'ACID2' })

// ---------------------------------------------------------------------------
// 7. Arrangement — 64 bars
// ---------------------------------------------------------------------------
const plan = [
  { name: 'Pulse', bars: 8, patterns: { jt90: 'K', 'jb202-2': 'SUB' } },
  { name: 'Rim', bars: 8, patterns: { jt90: 'R1', 'jb202-2': 'SUB' } },
  { name: 'Stabs', bars: 8, patterns: { jt90: 'R2', 'jb202-2': 'SUB', jb202: 'RISE' } },
  { name: 'Line', bars: 7, patterns: { jt90: 'R2O', 'jb202-2': 'SUB', jb202: 'A', jt10: 'A' } },
  { name: 'Ghost', bars: 1, patterns: { jt90: 'GHOST', jb202: 'A', jt10: 'A' } },
  { name: 'Peak', bars: 8, patterns: { jt90: 'P1', 'jb202-2': 'SUB', jb202: 'B', jt10: 'A' } },
  { name: 'Peak 2', bars: 8, patterns: { jt90: 'P2', 'jb202-2': 'SUB', jt10: 'A', jt30: 'ACID2' } },
  { name: 'Strip', bars: 8, patterns: { jt90: 'S', 'jb202-2': 'SUB', jb202: 'FALL' } },
  { name: 'Out', bars: 8, patterns: { jt90: 'K', 'jb202-2': 'SUB', jb202: 'DIM' } },
]
await t('set_arrangement', { sections: plan.map((s) => ({ bars: s.bars, ...s.patterns })) })
const BARS = plan.reduce((a, s) => a + s.bars, 0)
if (BARS !== 64) throw new Error(`arrangement is ${BARS} bars`)

// Live patterns = the peak, so loop mode in the app plays the full groove.
await t('load_pattern', { instrument: 'jt90', name: 'P1' })
await t('load_pattern', { instrument: 'jb202', name: 'B' })
await t('load_pattern', { instrument: 'jb202-2', name: 'SUB' })
await t('load_pattern', { instrument: 'jt10', name: 'A' })
await t('load_pattern', { instrument: 'jt30', name: 'ACID' })

// ---------------------------------------------------------------------------
// 8. Render, gain-stage, measure
// ---------------------------------------------------------------------------
const NODES = ['jt90', 'jb202', 'jb202-2', 'jt10', 'jt30']
const sectionBars = plan.map((s) => s.bars)
async function render() {
  const r = await renderSessionToBuffer(session, BARS)
  const wav = Buffer.from(audioBufferToWav(r.buffer))
  const { rows } = analyzeWav(readWav(wav), session.bpm, sectionBars)
  return { ...r, wav, rows, seconds: r.buffer.duration }
}

if (process.env.AUDITION) {
  const i = Number(process.env.AUDITION) - 1
  const full = session.arrangement
  session.arrangement = [full[i]]
  const r = await renderSessionToBuffer(session, 0)
  session.arrangement = full
  writeFileSync(`${OUT}/audition-${i + 1}.wav`, Buffer.from(audioBufferToWav(r.buffer)))
  console.log(`AUDITION ${i + 1} (${plan[i].name}): ${r.message}`)
  const wav = readWav(readFileSync(`${OUT}/audition-${i + 1}.wav`))
  console.log(formatRows(analyzeWav(wav, session.bpm, [plan[i].bars]).rows))
  process.exit(0)
}

let r = await render()
console.log(`RENDER 1: ${r.message}  [${r.seconds.toFixed(1)} s, peak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(1)} dB]`)
const TARGET_PEAK_DB = -0.5
let delta = TARGET_PEAK_DB - 20 * Math.log10(r.peak)
const headroom = Math.min(...NODES.map((id) => 6 - session.getNode(id).getLevel()))
delta = Math.min(delta, headroom)
if (Math.abs(delta) > 0.05) {
  for (const id of NODES) {
    const cur = session.getNode(id).getLevel()
    await t('tweak', { path: `${id}.level`, value: Math.round((cur + delta) * 10) / 10 })
  }
  r = await render()
  console.log(`RENDER 2 (gain ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} dB): ${r.message}  [${r.seconds.toFixed(1)} s, peak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(1)} dB]`)
}
if (r.trimDb < -2) throw new Error(`trim ${r.trimDb} dB — levels too hot`)
if (/fail/i.test(r.message)) throw new Error(`render reported failures: ${r.message}`)

writeFileSync(`${OUT}/song.wav`, r.wav)
const metrics = formatRows(r.rows)
const table = r.rows.map((row, i) => `${row.bars.padEnd(9)} ${plan[i].name}`).join('\n')
const levels = NODES.map((id) => `${id} ${session.getNode(id).getLevel().toFixed(1)} dB`).join(', ')
writeFileSync(`${OUT}/metrics.txt`, `${r.message}\npeak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(2)} dB, ${r.seconds.toFixed(1)} s\nlevels: ${levels}\n\n${metrics}\n\nsections:\n${table}\n`)
console.log(metrics)
console.log(table)
console.log(`levels: ${levels}`)

// Taste checks (from his kept data): density and spectrum per section. His
// starred loop measures 9.3 onsets/bar on this detector; here the rimshot and
// its 16th echoes add 2-4, so 14 is the line, 10 for sections without stabs.
const bad = []
r.rows.forEach((row, i) => {
  const cap = plan[i].patterns.jb202 ? 14 : 10.5
  if (row.onsetsPerBar > cap) bad.push(`${plan[i].name}: ${row.onsetsPerBar.toFixed(1)} onsets/bar (> ${cap})`)
  if (row.high > 0.03) bad.push(`${plan[i].name}: high band ${(row.high * 100).toFixed(1)} % (> 3 %)`)
  if (plan[i].patterns['jb202-2'] && row.low < 0.55) bad.push(`${plan[i].name}: low band ${(row.low * 100).toFixed(0)} % (< 55 % with the sub in)`)
  if (row.silence > 0.02) bad.push(`${plan[i].name}: ${(row.silence * 100).toFixed(0)} % silence`)
})
console.log(bad.length ? `TASTE CHECKS: ${bad.length} flags\n  ${bad.join('\n  ')}` : 'TASTE CHECKS: clean')

// Round trip: what the app will load must render the same song.
const saved = serializeSession(session)
const again = deserializeSession(JSON.parse(JSON.stringify(saved)))
const r2 = await renderSessionToBuffer(again, BARS)
const same = r2.message === r.message && r2.bars === r.bars && Math.abs(r2.peak - r.peak) < 1e-6
console.log(`ROUND TRIP: ${same ? 'ok' : 'MISMATCH'} — ${r2.message} (peak ${r2.peak.toFixed(3)})`)
if (!same) process.exitCode = 1

// ---------------------------------------------------------------------------
// 9. track.json — what the app saves as a track
// ---------------------------------------------------------------------------
const brief = 'Make me one tasteful minimal techno track at 130, A minor, Mills school: my tuned-down 909 kick and one-note sub, my 202 stabs and the seven JT10 notes, a rimshot carrying the syncopation through a short delay, a low 303 answer at the peak only. 64 bars, changes only on 8-bar boundaries, one element at a time, tension from subtraction. Dry, hypnotic, no clap, no risers, no cheese.'
const description = [
  'Kick and your one-note sub open it. At 9 a rimshot lands on the "a" of 3 through a 16th delay while the closed 8ths creep up over the eight bars; at 17 your A stabs rise out of a closed filter and the rim grows a second hit; at 25 your seven JT10 notes arrive on the dotted-8th ping-pong with one dark open hat per bar. Bar 32 is a ghost bar: kick and sub out, hats, rim and stabs hanging. At 33 the kick returns on your B line with the full rim lattice; at 41 the stabs step out and a JT30 answers low in A minor — five notes, one slide — with its filter opening across the section and snapping shut at the end, a low tom on every second bar, a mid tom every fourth, and the ride for two bars only. At 49 everything but kick, hats, one rim and the sub is gone while the A stabs sink under the filter, and from 57 it is kick, sub and the stabs closed and quiet for the next record.',
  'Every pattern, lane and effect is yours to open: jt90 K/R1/R2/R2O/GHOST/P1/P2/S, jb202 RISE/A/B/FALL/DIM, jb202-2 SUB, jt10 A, jt30 ACID/ACID2. Loop mode plays the peak. Levels are gain-staged to peak at -0.5 dBFS with no master trim; in song mode a slider writes through to every saved pattern of that instrument.',
].join('\n\n')

writeFileSync(`${OUT}/track.json`, JSON.stringify({
  title: 'Minimal 130',
  bpm: 130,
  bars: BARS,
  session: saved,
  plan: { sections: plan.map((s, i) => ({ ...s, range: r.rows[i].bars })) },
  messages: [
    { role: 'user', content: brief },
    { role: 'assistant', content: description },
  ],
  feed: [
    { id: 'u1', kind: 'user', text: brief },
    { id: 'a1', kind: 'assistant', text: description },
  ],
}, null, 2))
writeFileSync(`${OUT}/toolcalls.log`, log.join('\n') + '\n')
console.log(`wrote ${OUT}/song.wav, metrics.txt, track.json, toolcalls.log (${(r.wav.length / 1048576).toFixed(1)} MB wav)`)
