#!/usr/bin/env node
// Minimal 131 — the second Mills-school minimal techno track, 80 bars, A minor.
//
// Same vocabulary as minimal-130.mjs (Bart's kit and sub from techno-128-base.json,
// the same taste rules) with new material: a tresillo sub, a rim lattice on the
// "e" of 1 and the "a" of 2, a 202 stab line from 1, b3, 4, b7, and a 303
// playing straight 8ths on the root where the filter sweep is the tune.
//
// Shape (8-bar sections; the ghost bar is bar 41):
//   1   PULSE   kick + sub
//   9   RIM     one rim through a 16th delay; hats creep in
//   17  SWEEP   the lattice fills in; 303 pulse opens 100 → 420 Hz
//   25  STABS   202 stabs rise out of a closed filter; pulse settles under
//   33  PEAK    stabs at rest, open hat, low tom answers; pulse out
//   41  GHOST   one bar: kick and sub out
//   42  PEAK 2  octave-jump line, pulse bites and snaps back, toms, two bars of ride
//   49  STRIP   kick, hats, one rim, sub; stabs sink
//   57  DRIFT   303 alone drifts 300 → 90 Hz over the drums
//   65  RETURN  stabs and lattice back with the open hat
//   73  OUT     kick, sub and dim stabs
//
//   node scripts/jam/songs/minimal-131.mjs        (OUT=…, AUDITION=n as in minimal-130.mjs)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HILMA = resolve(HERE, '..', '..', '..')
const JAMBOT = resolve(HILMA, '../vibeceo/jambot')
const BASE = resolve(HERE, 'techno-128-base.json')
const OUT = process.env.OUT || resolve(HERE, 'out', 'minimal-131')
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
await t('set_bpm', { bpm: 131 })
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
await t('mute_track', { track: 'jt10', mute: true })   // no top line in this one either

await t('add_effect', { target: 'jt90.rimshot', effect: 'delay', mode: 'analog', sync: '16th', feedback: 20, mix: 12, lowcut: 300, highcut: 6000, saturation: 8 })
await t('add_effect', { target: 'jt90.oh', effect: 'reverb', decay: 1.6, mix: 18, lowcut: 300, damping: 65, size: 45 })
await t('tweak_effect', { target: 'jb202', effect: 'sidechain1', amount: 0.35 })

// ---------------------------------------------------------------------------
// 2. Drums — a different lattice: the "e" of 1, the "a" of 2, the "e" of 4
// ---------------------------------------------------------------------------
const RIM_ORGANIC = [14, 15, 16, 18, 20, 22, 23, 24, 23, 22, 20, 18, 16, 15, 14, 14]
const LAT1 = [2, 7, 13]
const LAT2 = [2, 7, 10, 13]
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: EIGHTHS })
await t('save_pattern', { instrument: 'jt90', name: 'K' })
// R1 (8 bars): one rim on the "e" of 1; hats creep up.
await t('add_jt90', { clear: true, bars: 8, kick: everyBar(8, KICK), ch: everyBar(8, EIGHTHS), rimshot: everyBar(8, [2]) })
await t('automate', { path: 'jt90.ch.level', values: linRamp(128, -33, -26) })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'R1' })
// R2 (2 bars): the lattice.
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, EIGHTHS), rimshot: [...LAT1, ...LAT2.map((s) => s + 16)] })
await t('tweak', { path: 'jt90.ch.level', value: -26 })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'R2' })
// P (2 bars): lattice + one dark open hat + a low tom answering in bar 2.
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, EIGHTHS), oh: everyBar(2, [14]),
  rimshot: [...LAT1, ...LAT2.map((s) => s + 16)], lowtom: [16 + 10] })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'P' })
// GHOST (1 bar): kick out.
await t('add_jt90', { clear: true, bars: 1, ch: EIGHTHS, oh: [14], rimshot: LAT2 })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'GHOST' })
// P2 (8 bars): P + a mid tom on the 5 of every fourth bar; the ride for the last two bars.
await t('add_jt90', { clear: true, bars: 8, kick: everyBar(8, KICK), ch: everyBar(8, EIGHTHS), oh: everyBar(8, [14]),
  rimshot: Array.from({ length: 4 }, (_, i) => [...LAT1, ...LAT2.map((s) => s + 16)].map((s) => s + i * 32)).flat(),
  lowtom: [1, 3, 5, 7].map((b) => b * 16 + 10), midtom: [3, 7].map((b) => b * 16 + 5),
  ride: everyBar(2, EIGHTHS).map((s) => s + 6 * 16) })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'P2' })
// S: kick, 8ths, one rim.
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: EIGHTHS, rimshot: [2] })
await t('automate', { path: 'jt90.rimshot.decay', values: RIM_ORGANIC })
await t('save_pattern', { instrument: 'jt90', name: 'S' })

// ---------------------------------------------------------------------------
// 3. Sub — one note, a tresillo with a backbeat, accents on 1 and 3
// ---------------------------------------------------------------------------
const sub = seq({ 0: 'A1!', 3: 'A1', 6: 'A1', 8: 'A1!', 11: 'A1', 14: 'A1' })
await t('add_jb202', { instrument: 'jb202-2', pattern: sub })
await t('save_pattern', { instrument: 'jb202-2', name: 'SUB' })

// ---------------------------------------------------------------------------
// 4. Stabs — a new line from 1, b3, 4, b7; the filter is the melody
// ---------------------------------------------------------------------------
const stabs = seq({ 1: 'A1', 4: 'A1!', 7: 'C2~', 9: 'A1', 12: 'D2', 14: 'A1!', 15: 'G1~' })
const stabsUp = seq({ 0: 'A1!', 3: 'A2', 4: 'A1', 7: 'C2', 9: 'A1', 11: 'A2', 12: 'G1', 14: 'A1!', 15: 'E2~' })
await t('tweak_multi', { params: { 'jb202.filterCutoff': 380, 'jb202.filterResonance': 30, 'jb202.drive': 25 } })
await t('add_jb202', { instrument: 'jb202', pattern: repeat(stabs, 8) })
await t('automate', { path: 'jb202.filterCutoff', values: expRamp(128, 90, 380) })
await t('automate', { path: 'jb202.filterResonance', values: linRamp(128, 30, 40) })
await t('save_pattern', { instrument: 'jb202', name: 'RISE' })
await t('add_jb202', { instrument: 'jb202', pattern: clone(stabs) })
await t('save_pattern', { instrument: 'jb202', name: 'A' })
await t('add_jb202', { instrument: 'jb202', pattern: clone(stabsUp) })
await t('tweak', { path: 'jb202.filterCutoff', value: 480 })
await t('tweak', { path: 'jb202.drive', value: 36 })
await t('save_pattern', { instrument: 'jb202', name: 'B' })
await t('add_jb202', { instrument: 'jb202', pattern: repeat(stabs, 8) })
await t('tweak', { path: 'jb202.drive', value: 25 })
await t('automate', { path: 'jb202.filterCutoff', values: expRamp(128, 380, 110) })
await t('automate', { path: 'jb202.filterResonance', values: linRamp(128, 30, 46) })
await t('save_pattern', { instrument: 'jb202', name: 'FALL' })
await t('add_jb202', { instrument: 'jb202', pattern: clone(stabs) })
await t('tweak', { path: 'jb202.filterCutoff', value: 140 })
await t('tweak', { path: 'jb202.osc1Level', value: 45 })
await t('save_pattern', { instrument: 'jb202', name: 'DIM' })
await t('tweak', { path: 'jb202.osc1Level', value: 70 })
await t('tweak', { path: 'jb202.filterCutoff', value: 380 })

// ---------------------------------------------------------------------------
// 5. JT30 — an 8th-note pulse on the root; the filter sweep is the tune
// ---------------------------------------------------------------------------
const pulse = seq({ 0: 'A1!', 2: 'A1', 4: 'A1', 6: 'A1', 8: 'A1!', 10: 'A1', 12: 'A1', 14: 'A1' })
await t('add_jt30', { pattern: repeat(pulse, 8), bars: 8 })
await t('tweak_multi', { params: { 'jt30.bass.waveform': 'sawtooth', 'jt30.bass.cutoff': 100, 'jt30.bass.resonance': 70, 'jt30.bass.envMod': 35, 'jt30.bass.decay': 30, 'jt30.bass.accent': 60, 'jt30.bass.drive': 25 } })
await t('tweak', { path: 'jt30.level', value: -12 })
await t('add_sidechain', { target: 'jt30', trigger: 'kick', amount: 0.4 })
// SWEEP (8 bars): 100 → 420 Hz.
await t('automate', { path: 'jt30.bass.cutoff', values: expRamp(128, 100, 420) })
await t('save_pattern', { instrument: 'jt30', name: 'SWEEP' })
// HOLD (8 bars): 420 → 300, settling under the stabs.
await t('add_jt30', { pattern: repeat(pulse, 8), bars: 8 })
await t('automate', { path: 'jt30.bass.cutoff', values: expRamp(128, 420, 300) })
await t('save_pattern', { instrument: 'jt30', name: 'HOLD' })
// BITE (8 bars): 160 → 560 and a snap back.
await t('add_jt30', { pattern: repeat(pulse, 8), bars: 8 })
await t('automate', { path: 'jt30.bass.cutoff', values: [...expRamp(104, 160, 560), ...expRamp(24, 560, 150)] })
await t('automate', { path: 'jt30.bass.resonance', values: linRamp(128, 70, 78) })
await t('save_pattern', { instrument: 'jt30', name: 'BITE' })
// SINK (8 bars): 300 → 90, going under.
await t('add_jt30', { pattern: repeat(pulse, 8), bars: 8 })
await t('automate', { path: 'jt30.bass.cutoff', values: expRamp(128, 300, 90) })
await t('save_pattern', { instrument: 'jt30', name: 'SINK' })

// ---------------------------------------------------------------------------
// 6. Arrangement — 80 bars
// ---------------------------------------------------------------------------
const plan = [
  { name: 'Pulse', bars: 8, patterns: { jt90: 'K', 'jb202-2': 'SUB' } },
  { name: 'Rim', bars: 8, patterns: { jt90: 'R1', 'jb202-2': 'SUB' } },
  { name: 'Sweep', bars: 8, patterns: { jt90: 'R2', 'jb202-2': 'SUB', jt30: 'SWEEP' } },
  { name: 'Stabs', bars: 8, patterns: { jt90: 'R2', 'jb202-2': 'SUB', jt30: 'HOLD', jb202: 'RISE' } },
  { name: 'Peak', bars: 8, patterns: { jt90: 'P', 'jb202-2': 'SUB', jb202: 'A' } },
  { name: 'Ghost', bars: 1, patterns: { jt90: 'GHOST', jb202: 'A' } },
  { name: 'Peak 2', bars: 7, patterns: { jt90: 'P2', 'jb202-2': 'SUB', jb202: 'B', jt30: 'BITE' } },
  { name: 'Strip', bars: 8, patterns: { jt90: 'S', 'jb202-2': 'SUB', jb202: 'FALL' } },
  { name: 'Drift', bars: 8, patterns: { jt90: 'S', 'jb202-2': 'SUB', jt30: 'SINK' } },
  { name: 'Return', bars: 8, patterns: { jt90: 'P', 'jb202-2': 'SUB', jb202: 'A' } },
  { name: 'Out', bars: 8, patterns: { jt90: 'K', 'jb202-2': 'SUB', jb202: 'DIM' } },
]
await t('set_arrangement', { sections: plan.map((s) => ({ bars: s.bars, ...s.patterns })) })
const BARS = plan.reduce((a, s) => a + s.bars, 0)
if (BARS !== 80) throw new Error(`arrangement is ${BARS} bars`)

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
const brief = 'Another one in that genre: minimal techno at 131, A minor, Mills school. My 909 kit and one-note sub with a tresillo, a rimshot lattice on the e of 1 and the a of 2 through a 16th delay, a 202 stab line from the root, the third and the seventh, and a 303 playing straight 8ths on the root where the filter sweep is the tune. 80 bars, changes only on 8-bar boundaries, one element at a time, tension from subtraction. Dry, hypnotic, no clap, no top line, no cheese.'
const description = [
  'Kick and a one-note sub on a tresillo open it. At 9 a rimshot lands on the "e" of 1 through a 16th delay while the closed 8ths creep up; at 17 the rim lattice fills in and a 303 starts pulsing straight 8ths on the root with its filter opening from 100 to 420 Hz — that sweep is the tune; at 25 the 202 stabs rise out of a closed filter while the pulse settles under them; at 33 the stabs sit at rest with one dark open hat and a low tom answering in every second bar, the pulse gone. Bar 41 is a ghost bar, kick and sub out; then the kick returns on the octave-jump line with the pulse biting back in, a mid tom every fourth bar, and the ride for two bars. At 49 it strips to kick, hats, one rim and sub while the stabs sink under the filter; at 57 the 303 alone drifts down from 300 to 90 Hz over the drums; at 65 the stabs and the lattice return with the open hat; from 73 it is kick, sub and the stabs closed and quiet for the next record.',
  'Patterns to open: jt90 K/R1/R2/P/GHOST/P2/S, jb202 RISE/A/B/FALL/DIM, jb202-2 SUB, jt30 SWEEP/HOLD/BITE/SINK (the JT10 is muted and unused). Loop mode plays the peak. Levels are gain-staged to peak at -0.5 dBFS with no master trim; in song mode a slider writes through to every saved pattern of that instrument.',
].join('\n\n')

writeFileSync(`${OUT}/track.json`, JSON.stringify({
  title: 'Minimal 131',
  bpm: 131,
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
