#!/usr/bin/env node
// Minimal 132 (Dub) — the third in the series: Mills-school minimal crossed with
// Basic Channel dub. 96 bars (3:04), 125 BPM, G minor.
//
// Proven values only: the kit, sub, stab and 303 patches are minimal-131's,
// verbatim; the stab delay + reverb are techno-128's proven dotted-8th
// ping-pong and hall (there on the second JT10), moved to the 202 stabs. What
// is new is notes and arrangement: offbeat dub hats, stabs as sparse "throws"
// whose filtered echoes carry the groove, the 303 pulse sweep as the tune.
//
// Shape (8-bar sections; the ghost bar is bar 57):
//   1   PULSE    kick + sub
//   9   SHUFFLE  offbeat hats, one rim on the "e" of 1 through the 16th delay
//   17  THROW    one stab every two bars, left to the echoes
//   25  CHORD    the stab riff rises out of a closed filter
//   33  SWEEP    the 303 pulse opens 100 → 420 Hz under the stabs
//   41  PEAK     lattice, dark open hat, low tom answers; pulse holds
//   49  PEAK 2   the busier stab line, pulse bites and snaps back
//   57  GHOST    one bar: kick and sub out, the echoes hang
//   58  DUB      kick, rim and throws only — the echo is the song
//   65  DRIFT    303 alone sinks 300 → 90 Hz
//   73  RETURN   lattice, open hat, the riff
//   81  FALL     stabs sink under the filter, hats strip
//   89  OUT      kick, sub, dim stabs
//
//   node scripts/jam/songs/minimal-132-dub.mjs     (OUT=…, AUDITION=n as in minimal-131.mjs)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HILMA = resolve(HERE, '..', '..', '..')
const JAMBOT = resolve(HILMA, '../vibeceo/jambot')
const BASE = resolve(HERE, 'techno-128-base.json')
const OUT = process.env.OUT || resolve(HERE, 'out', 'minimal-132-dub')
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
// 1. Tempo, groove, kit, levels, effects (patches verbatim from minimal-131)
// ---------------------------------------------------------------------------
await t('set_bpm', { bpm: 125 })
await t('set_swing', { amount: 6 })

await t('tweak_multi', { params: {
  'jt90.kick.tune': -6, 'jt90.kick.decay': 90, 'jt90.kick.attack': 40, 'jt90.kick.level': -5.5,
  'jt90.ch.level': -33, 'jt90.ch.decay': 39, 'jt90.ch.tone': 100,
  'jt90.oh.level': -20, 'jt90.oh.decay': 50, 'jt90.oh.tone': 15,
  'jt90.rimshot.level': -7, 'jt90.rimshot.tune': -5, 'jt90.rimshot.decay': 14,
  'jt90.lowtom.level': -9, 'jt90.lowtom.tune': -2, 'jt90.lowtom.decay': 65,
  'jt90.midtom.level': -11, 'jt90.midtom.tune': -5, 'jt90.midtom.decay': 50,
  'jt90.ride.level': -23, 'jt90.ride.tune': 2, 'jt90.ride.decay': 60,
  'jt90.clap.level': -60,
} })
await t('tweak', { path: 'jt90.level', value: -0.2 })
await t('tweak', { path: 'jb202.level', value: -10.5 })
await t('tweak', { path: 'jb202-2.level', value: -4.7 })
await t('tweak', { path: 'jt10.level', value: -8.2 })
await t('mute_track', { track: 'jt10', mute: true })   // no top line, as in 130 and 131

await t('add_effect', { target: 'jt90.rimshot', effect: 'delay', mode: 'analog', sync: '16th', feedback: 20, mix: 12, lowcut: 300, highcut: 6000, saturation: 8 })
await t('add_effect', { target: 'jt90.oh', effect: 'reverb', decay: 1.6, mix: 18, lowcut: 300, damping: 65, size: 45 })
await t('tweak_effect', { target: 'jb202', effect: 'sidechain1', amount: 0.35 })
// The dub: techno-128's proven echo + hall, verbatim, on the stabs. The 300 Hz
// low cut keeps the echoes to the stab's upper partials — filtered repeats.
await t('add_effect', { target: 'jb202', effect: 'delay', mode: 'pingpong', sync: 'dotted8th', feedback: 60, mix: 55, lowcut: 300, highcut: 5500 })
await t('add_effect', { target: 'jb202', effect: 'reverb', decay: 3.2, mix: 28, lowcut: 250, damping: 65, size: 70, predelay: 30 })

// ---------------------------------------------------------------------------
// 2. Drums — dub offbeat hats first, the lattice later
// ---------------------------------------------------------------------------
const RIM_ORGANIC = [14, 15, 16, 18, 20, 22, 23, 24, 23, 22, 20, 18, 16, 15, 14, 14]
const OFF = [2, 6, 10, 14]
const LAT1 = [2, 7, 13]
const LAT2 = [2, 7, 10, 13]
const lattice = (pairs) => Array.from({ length: pairs }, (_, i) => [...LAT1, ...LAT2.map((s) => s + 16)].map((s) => s + i * 32)).flat()
// K: kick and the offbeat hat only.
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: OFF })
await t('save_pattern', { instrument: 'jt90', name: 'K' })
// SH (8 bars): offbeat hats creeping up, one rim on the "e" of 1.
await t('add_jt90', { clear: true, bars: 8, kick: everyBar(8, KICK), ch: everyBar(8, OFF), rimshot: everyBar(8, [2]) })
await t('automate', { path: 'jt90.ch.level', values: linRamp(128, -33, -26) })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'SH' })
// R2 (2 bars): 8ths and the lattice.
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, EIGHTHS), rimshot: lattice(1) })
await t('tweak', { path: 'jt90.ch.level', value: -26 })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'R2' })
// P (2 bars): lattice + the dark open hat + a low tom answering in bar 2.
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, EIGHTHS), oh: everyBar(2, [14]),
  rimshot: lattice(1), lowtom: [16 + 10] })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'P' })
// P2 (8 bars): P + a mid tom every fourth bar, the ride for the last two.
await t('add_jt90', { clear: true, bars: 8, kick: everyBar(8, KICK), ch: everyBar(8, EIGHTHS), oh: everyBar(8, [14]),
  rimshot: lattice(4), lowtom: [1, 3, 5, 7].map((b) => b * 16 + 10), midtom: [3, 7].map((b) => b * 16 + 5),
  ride: everyBar(2, EIGHTHS).map((s) => s + 6 * 16) })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'P2' })
// GHOST (1 bar): kick out, the hat and one rim.
await t('add_jt90', { clear: true, bars: 1, ch: OFF, oh: [14], rimshot: [2] })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'GHOST' })
// DUB: kick, one rim, nothing else — room for the echoes.
await t('add_jt90', { clear: true, bars: 1, kick: KICK, rimshot: [2] })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'DUB' })
// S: kick, offbeat hats, one rim.
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: OFF, rimshot: [2] })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'S' })

// ---------------------------------------------------------------------------
// 3. Sub — one note, G, a pushed tresillo
// ---------------------------------------------------------------------------
const sub = seq({ 0: 'G1!', 3: 'G1', 7: 'G1', 8: 'G1!', 11: 'G1', 14: 'G1' })
await t('add_jb202', { instrument: 'jb202-2', pattern: sub })
await t('save_pattern', { instrument: 'jb202-2', name: 'SUB' })

// ---------------------------------------------------------------------------
// 4. Stabs — sparse; the dotted-8th echo fills the gaps. G minor: G A# C D F.
// ---------------------------------------------------------------------------
const throwLine = seq({ 6: 'G1!' }, 2)                                     // one hit per two bars
const riff = seq({ 6: 'G1!', 13: 'A#1' })                                 // the "and" of 2, the "e" of 4
const riffUp = seq({ 3: 'G1', 6: 'G1!', 11: 'C2~', 14: 'F1' })            // busier, for the second peak
const throwAlt = seq({ 6: 'G1!', 27: 'D2' }, 2)                            // throws with an answer
// Stab patch settings: minimal-131's values only (380/30/25, B 480/36, DIM 140 + osc1 45).
await t('tweak_multi', { params: { 'jb202.filterCutoff': 380, 'jb202.filterResonance': 30, 'jb202.drive': 25 } })
await t('add_jb202', { instrument: 'jb202', pattern: repeat(throwLine, 4) })
await t('save_pattern', { instrument: 'jb202', name: 'THROW' })
await t('add_jb202', { instrument: 'jb202', pattern: repeat(riff, 8) })
await t('automate', { path: 'jb202.filterCutoff', values: expRamp(128, 90, 380) })
await t('automate', { path: 'jb202.filterResonance', values: linRamp(128, 30, 40) })
await t('save_pattern', { instrument: 'jb202', name: 'RISE' })
await t('add_jb202', { instrument: 'jb202', pattern: clone(riff) })
await t('save_pattern', { instrument: 'jb202', name: 'A' })
await t('add_jb202', { instrument: 'jb202', pattern: clone(riffUp) })
await t('tweak', { path: 'jb202.filterCutoff', value: 480 })
await t('tweak', { path: 'jb202.drive', value: 36 })
await t('save_pattern', { instrument: 'jb202', name: 'B' })
await t('add_jb202', { instrument: 'jb202', pattern: repeat(throwAlt, 4) })
await t('tweak', { path: 'jb202.filterCutoff', value: 380 })
await t('tweak', { path: 'jb202.drive', value: 25 })
await t('save_pattern', { instrument: 'jb202', name: 'DUBT' })
await t('add_jb202', { instrument: 'jb202', pattern: repeat(riff, 8) })
await t('automate', { path: 'jb202.filterCutoff', values: expRamp(128, 380, 110) })
await t('automate', { path: 'jb202.filterResonance', values: linRamp(128, 30, 46) })
await t('save_pattern', { instrument: 'jb202', name: 'FALL' })
await t('add_jb202', { instrument: 'jb202', pattern: clone(riff) })
await t('tweak', { path: 'jb202.filterCutoff', value: 140 })
await t('tweak', { path: 'jb202.osc1Level', value: 45 })
await t('save_pattern', { instrument: 'jb202', name: 'DIM' })
await t('tweak', { path: 'jb202.osc1Level', value: 70 })
await t('tweak', { path: 'jb202.filterCutoff', value: 380 })

// ---------------------------------------------------------------------------
// 5. JT30 — straight 8ths on G; the filter sweep is the tune (patch verbatim)
// ---------------------------------------------------------------------------
const pulse = seq({ 0: 'G1!', 2: 'G1', 4: 'G1', 6: 'G1', 8: 'G1!', 10: 'G1', 12: 'G1', 14: 'G1' })
await t('add_jt30', { pattern: repeat(pulse, 8), bars: 8 })
await t('tweak_multi', { params: { 'jt30.bass.waveform': 'sawtooth', 'jt30.bass.cutoff': 100, 'jt30.bass.resonance': 70, 'jt30.bass.envMod': 35, 'jt30.bass.decay': 30, 'jt30.bass.accent': 60, 'jt30.bass.drive': 25 } })
await t('tweak', { path: 'jt30.level', value: -12 })
await t('add_sidechain', { target: 'jt30', trigger: 'kick', amount: 0.4 })
await t('automate', { path: 'jt30.bass.cutoff', values: expRamp(128, 100, 420) })
await t('save_pattern', { instrument: 'jt30', name: 'SWEEP' })
await t('add_jt30', { pattern: repeat(pulse, 8), bars: 8 })
await t('automate', { path: 'jt30.bass.cutoff', values: expRamp(128, 420, 300) })
await t('save_pattern', { instrument: 'jt30', name: 'HOLD' })
await t('add_jt30', { pattern: repeat(pulse, 8), bars: 8 })
await t('automate', { path: 'jt30.bass.cutoff', values: [...expRamp(104, 160, 560), ...expRamp(24, 560, 150)] })
await t('automate', { path: 'jt30.bass.resonance', values: linRamp(128, 70, 78) })
await t('save_pattern', { instrument: 'jt30', name: 'BITE' })
await t('add_jt30', { pattern: repeat(pulse, 8), bars: 8 })
await t('automate', { path: 'jt30.bass.cutoff', values: expRamp(128, 300, 90) })
await t('save_pattern', { instrument: 'jt30', name: 'SINK' })

// ---------------------------------------------------------------------------
// 6. Arrangement — 96 bars
// ---------------------------------------------------------------------------
const plan = [
  { name: 'Pulse', bars: 8, patterns: { jt90: 'K', 'jb202-2': 'SUB' } },
  { name: 'Shuffle', bars: 8, patterns: { jt90: 'SH', 'jb202-2': 'SUB' } },
  { name: 'Throw', bars: 8, patterns: { jt90: 'S', 'jb202-2': 'SUB', jb202: 'THROW' } },
  { name: 'Chord', bars: 8, patterns: { jt90: 'R2', 'jb202-2': 'SUB', jb202: 'RISE' } },
  { name: 'Sweep', bars: 8, patterns: { jt90: 'R2', 'jb202-2': 'SUB', jb202: 'A', jt30: 'SWEEP' } },
  { name: 'Peak', bars: 8, patterns: { jt90: 'P', 'jb202-2': 'SUB', jb202: 'A', jt30: 'HOLD' } },
  { name: 'Peak 2', bars: 8, patterns: { jt90: 'P2', 'jb202-2': 'SUB', jb202: 'B', jt30: 'BITE' } },
  { name: 'Ghost', bars: 1, patterns: { jt90: 'GHOST', jb202: 'THROW' } },
  { name: 'Dub', bars: 7, patterns: { jt90: 'DUB', 'jb202-2': 'SUB', jb202: 'DUBT' } },
  { name: 'Drift', bars: 8, patterns: { jt90: 'S', 'jb202-2': 'SUB', jt30: 'SINK' } },
  { name: 'Return', bars: 8, patterns: { jt90: 'P', 'jb202-2': 'SUB', jb202: 'A' } },
  { name: 'Fall', bars: 8, patterns: { jt90: 'S', 'jb202-2': 'SUB', jb202: 'FALL' } },
  { name: 'Out', bars: 8, patterns: { jt90: 'K', 'jb202-2': 'SUB', jb202: 'DIM' } },
]
await t('set_arrangement', { sections: plan.map((s) => ({ bars: s.bars, ...s.patterns })) })
const BARS = plan.reduce((a, s) => a + s.bars, 0)
if (BARS !== 96) throw new Error(`arrangement is ${BARS} bars`)

await t('load_pattern', { instrument: 'jt90', name: 'P' })
await t('load_pattern', { instrument: 'jb202', name: 'A' })
await t('load_pattern', { instrument: 'jb202-2', name: 'SUB' })
await t('load_pattern', { instrument: 'jt30', name: 'HOLD' })

// ---------------------------------------------------------------------------
// 7. Render, gain-stage, measure
// ---------------------------------------------------------------------------
const NODES = ['jt90', 'jb202', 'jb202-2', 'jt30']
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
  const cap = plan[i].patterns.jb202 || plan[i].patterns.jt30 ? 14 : 10.5
  if (row.onsetsPerBar > cap) bad.push(`${plan[i].name}: ${row.onsetsPerBar.toFixed(1)} onsets/bar (> ${cap})`)
  if (row.high > 0.03) bad.push(`${plan[i].name}: high band ${(row.high * 100).toFixed(1)} % (> 3 %)`)
  if (plan[i].patterns['jb202-2'] && row.low < 0.55) bad.push(`${plan[i].name}: low band ${(row.low * 100).toFixed(0)} % (< 55 % with the sub in)`)
  if (row.silence > 0.02 && plan[i].bars > 1) bad.push(`${plan[i].name}: ${(row.silence * 100).toFixed(0)} % silence`) // a ghost bar is meant to breathe
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
const brief = 'The third one, crossed with dub: Mills-school minimal meets Basic Channel at 125, G minor. My 909 kit and one-note sub, offbeat dub hats, the rim through its 16th delay, sparse 202 stabs thrown into a dotted-8th ping-pong echo and a hall so the repeats carry the groove, and the 303 pulse where the filter sweep is the tune. Changes on 8-bar boundaries, a ghost bar, a dub section where the echo is the song. Hypnotic, deep, no clap, no top line, no cheese.'
const description = [
  'Kick and a one-note G sub on a pushed tresillo open it. At 9 the offbeat dub hats creep up with one rim on the "e" of 1 through its 16th delay. At 17 a single 202 stab lands every two bars and the dotted-8th ping-pong echo and the hall carry it; at 25 the stab riff (the "and" of 2, the "e" of 4) rises out of a closed filter over the rim lattice. At 33 the 303 starts pulsing straight 8ths on G, its filter opening from 100 to 420 Hz; at 41 the open hat and the low tom answer arrive while the pulse holds; at 49 the busier stab line bites in with the pulse sweeping to 560 and snapping back, toms and two bars of ride. Bar 57 is a ghost bar; then seven bars of dub: kick, one rim and stab throws with an answer, the echo doing the rest. At 65 the 303 alone sinks from 300 to 90 Hz; at 73 the lattice, open hat and riff return; at 81 the stabs sink under the filter; from 89 kick, sub and dim stabs close it.',
  'Patterns to open: jt90 K/SH/R2/P/P2/GHOST/DUB/S, jb202 THROW/RISE/A/B/DUBT/FALL/DIM, jb202-2 SUB, jt30 SWEEP/HOLD/BITE/SINK (the JT10 is muted). Every patch value is from Minimal 131 and the stab echo is Techno 128\'s; levels are gain-staged to peak at -0.5 dBFS.',
].join('\n\n')

writeFileSync(`${OUT}/track.json`, JSON.stringify({
  title: 'Minimal 132 (Dub)',
  bpm: 125,
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
