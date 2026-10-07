#!/usr/bin/env node
// Overclock (Act II) — the second track of the EP: same producer, same tools,
// a different track. 128 bars at 128 BPM in D (a tone under Act III).
//
// Same palette as overclock.mjs (Act III): Bart's 909 kick and one closed hat
// on the offbeat 8ths, the JT30 on drive law 2 with the same patch, a drone of
// saws on the JB202, the kick sidechaining both, no reverb or delay anywhere,
// one 16-step line that never changes and one filter sweep as the only motion.
// What is different:
//
//   the line     Dm7 broken into octave leaps (D F A C), accents on 1 4 7 10 13 —
//                a 3-3-3-3 roll that crosses the bar, where Act III's cell was
//                3-3-2 twice with a pickup; rests on 6 and 12 (asymmetric)
//   the drone    D1 with the octave ten cents flat beating against it, not a
//                detuned unison
//   the shape    the voice opens the track alone and closes it alone; the kick
//                is the first event (bar 17); the sweep is one straight climb,
//                and the breakdown is the FLOOR leaving at the brightest point
//                (81–88: hats, acid and drone, no kick) rather than the filter
//                pulling back; the kick's return at 89 under the fully open line
//                is the one peak, two thirds in, and everything closes from there
//
// Shape (1-indexed bars, `p` = filter progress 0..1):
//   1   acid + drone, closed            81  kick out, p .85 → 1 (the exposed line)
//   17  + kick                          89  kick back, p 1 → .8 (the peak)
//   25  + hats                          97  p → .4
//   33  one straight climb, p → .7     113  hats out, p → .25
//   65  p → .85                        121  kick out; acid and drone close, fade over 125–128
//
//   node scripts/jam/songs/overclock-ii.mjs   (OUT=…, AUDITION=n plays one section, SOLO=<id> a stem)

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HILMA = resolve(HERE, '..', '..', '..')
const JAMBOT = resolve(HILMA, '../vibeceo/jambot')
const OUT = process.env.OUT || resolve(HERE, 'out', 'overclock-ii')
mkdirSync(OUT, { recursive: true })

const { createSession, deserializeSession, serializeSession } = await import(`${JAMBOT}/core/session.js`)
const { renderSessionToBuffer } = await import(`${JAMBOT}/core/render.js`)
const { audioBufferToWav } = await import(`${JAMBOT}/core/wav.js`)
const { initializeTools, executeTool } = await import(`${JAMBOT}/tools/index.js`)
const { readWav, analyzeWav, formatRows } = await import(`${HILMA}/scripts/jam/song-metrics.mjs`)

await initializeTools()
const session = createSession({ bpm: 128 })   // a new session: drive law 2

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
const everyBar = (bars, stepsInBar) => Array.from({ length: bars }, (_, b) => stepsInBar.map((s) => b * 16 + s)).flat()
const linRamp = (n, a, b) => Array.from({ length: n }, (_, i) => Math.round((a + ((b - a) * i) / (n - 1)) * 10) / 10)

// The sweep: [0-indexed bar, p], linear in between. One climb, the top at the
// kick's return, a long close.
const P_KEYS = [[0, 0], [16, 0.15], [64, 0.7], [80, 0.85], [88, 1], [96, 0.8], [116, 0.25], [128, 0.1]]
function pAt(barF) {
  if (barF <= P_KEYS[0][0]) return P_KEYS[0][1]
  for (let i = 1; i < P_KEYS.length; i++) {
    const [b1, v1] = P_KEYS[i], [b0, v0] = P_KEYS[i - 1]
    if (barF <= b1) return v0 + ((v1 - v0) * (barF - b0)) / (b1 - b0)
  }
  return P_KEYS[P_KEYS.length - 1][1]
}
// Same mapping as Act III: the JT30's envelope opens about 1.6 octaves above
// the base cutoff, so 100 → 900 Hz base puts the open line near 2.7 kHz.
const CUT_LO = 100, CUT_HI = 900
const cutoffAt = (barF) => Math.round(CUT_LO + (CUT_HI - CUT_LO) * pAt(barF) ** 2)

// ---------------------------------------------------------------------------
// 1. Tempo, kit, levels — the Act III settings
// ---------------------------------------------------------------------------
await t('set_bpm', { bpm: 128 })
await t('set_swing', { amount: 0 })
await t('tweak_multi', { params: {
  'jt90.kick.tune': -6, 'jt90.kick.decay': 90, 'jt90.kick.attack': 40, 'jt90.kick.level': -5.5,
  'jt90.ch.level': Number(process.env.HAT_DB ?? -17), 'jt90.ch.decay': 39, 'jt90.ch.tone': 100,
  'jt90.clap.level': -60,
} })
await t('tweak', { path: 'jt90.level', value: -0.2 })
await t('tweak', { path: 'jt30.level', value: Number(process.env.ACID_DB ?? -6) })
await t('tweak', { path: 'jb202.level', value: Number(process.env.DRONE_DB ?? -22) })

// ---------------------------------------------------------------------------
// 2. Drums — kick, kick + offbeat hats, and hats alone for the floor-out
// ---------------------------------------------------------------------------
await t('add_jt90', { clear: true, bars: 1, kick: [0, 4, 8, 12] })
await t('save_pattern', { instrument: 'jt90', name: 'K' })
await t('add_jt90', { clear: true, bars: 1, kick: [0, 4, 8, 12], ch: [2, 6, 10, 14] })
await t('save_pattern', { instrument: 'jt90', name: 'KH' })
await t('add_jt90', { clear: true, bars: 1, ch: [2, 6, 10, 14] })
await t('save_pattern', { instrument: 'jt90', name: 'H' })

// ---------------------------------------------------------------------------
// 3. Acid — Dm7 in octave leaps, a 3-3-3-3 accent roll, rests on 6 and 12
// ---------------------------------------------------------------------------
//  step   1   2   3   4   5   6   7   8   9   10  11  12  13  14  15  16
//  note   D2  D3  D2  F2  D2  .   A2  D2  D3  C3  D2  .   A3  D2  F3  D2
//  acc    ●           ●           ●           ●           ●
const SEQ = [0, 12, 0, 3, 0, null, 7, 0, 12, 10, 0, null, 19, 0, 15, 0]
const ACC = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0]
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const D2 = 38 // MIDI
const noteName = (midi) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
const line = SEQ.map((s, i) => s === null
  ? { note: 'D2', gate: false, accent: false, slide: false }
  : { note: noteName(D2 + s), gate: true, accent: !!ACC[i], slide: false })
const lineBars = (bars) => Array.from({ length: bars }, () => line.map((s) => ({ ...s }))).flat()

await t('add_jt30', { pattern: lineBars(8), bars: 8 })
await t('tweak_multi', { params: { 'jt30.bass.waveform': 'sawtooth', 'jt30.bass.cutoff': 100, 'jt30.bass.resonance': 70, 'jt30.bass.envMod': 35, 'jt30.bass.decay': 30, 'jt30.bass.accent': 60, 'jt30.bass.drive': Number(process.env.ACID_DRIVE ?? 15) } })
await t('add_sidechain', { target: 'jt30', trigger: 'kick', amount: 0.4 })

// The line plays the whole track: one 8-bar pattern per block, each carrying
// its slice of the sweep; the last block also fades the voice out over its
// second half (a `level` lane is a dB offset from the fader, 0 = unity).
const BLOCKS = Array.from({ length: 16 }, (_, i) => i * 8)
const FADE = [...Array(64).fill(0), ...linRamp(64, 0, -60)]
for (const start of BLOCKS) {
  await t('add_jt30', { pattern: lineBars(8), bars: 8 })
  await t('automate', { path: 'jt30.bass.cutoff', values: Array.from({ length: 128 }, (_, i) => cutoffAt(start + i / 16)) })
  if (start === 120) await t('automate', { path: 'jt30.level', values: FADE })
  await t('save_pattern', { instrument: 'jt30', name: `A${start + 1}` })
}
await t('clear_automation', { path: 'jt30.level' })

// ---------------------------------------------------------------------------
// 4. Drone — D1 with its octave ten cents flat, breathing with the sweep
// ---------------------------------------------------------------------------
await t('add_sidechain', { target: 'jb202', trigger: 'kick', amount: 0.35 })
await t('tweak_multi', { params: {
  'jb202.osc1Waveform': 'sawtooth', 'jb202.osc1Octave': 0, 'jb202.osc1Detune': 0, 'jb202.osc1Level': 100,
  'jb202.osc2Waveform': 'sawtooth', 'jb202.osc2Octave': 12, 'jb202.osc2Detune': -10, 'jb202.osc2Level': 80,
  'jb202.filterCutoff': 420, 'jb202.filterResonance': 0, 'jb202.filterEnvAmount': 0,
  'jb202.ampAttack': 0, 'jb202.ampSustain': 100, 'jb202.ampRelease': 30, 'jb202.drive': 0,
} })
const held = (bars) => Array.from({ length: bars * 16 }, (_, i) => ({ note: 'D1', gate: true, accent: false, slide: i > 0 }))
const droneCut = (start, bars) => Array.from({ length: bars * 16 }, (_, i) => Math.round(420 + 100 * pAt(start + i / 16)))
for (const start of BLOCKS) {
  await t('add_jb202', { pattern: held(8) })
  await t('automate', { path: 'jb202.filterCutoff', values: droneCut(start, 8) })
  if (start === 0) await t('automate', { path: 'jb202.level', values: linRamp(128, -40, 0) })
  if (start === 120) await t('automate', { path: 'jb202.level', values: FADE })
  await t('save_pattern', { instrument: 'jb202', name: `D${start + 1}` })
  if (start === 0 || start === 120) await t('clear_automation', { path: 'jb202.level' })   // a live lane would ride into the next save
}

// ---------------------------------------------------------------------------
// 5. Arrangement — 128 bars
// ---------------------------------------------------------------------------
const acid = (start) => `A${start + 1}`
const drone = (start) => `D${start + 1}`
const pRange = (b) => `p ${pAt(b).toFixed(2)}→${pAt(b + 8).toFixed(2)}`
const plan = [
  { name: `Voice alone, ${pRange(0)}`, bars: 8, patterns: { jt30: acid(0), jb202: drone(0) } },
  { name: `Voice + drone, ${pRange(8)}`, bars: 8, patterns: { jt30: acid(8), jb202: drone(8) } },
  { name: `Kick in, ${pRange(16)}`, bars: 8, patterns: { jt90: 'K', jt30: acid(16), jb202: drone(16) } },
  { name: `Hats in, ${pRange(24)}`, bars: 8, patterns: { jt90: 'KH', jt30: acid(24), jb202: drone(24) } },
  ...[32, 40, 48, 56, 64, 72].map((b) => ({ name: `Climb, ${pRange(b)}`, bars: 8, patterns: { jt90: 'KH', jt30: acid(b), jb202: drone(b) } })),
  { name: `Floor out, ${pRange(80)}`, bars: 8, patterns: { jt90: 'H', jt30: acid(80), jb202: drone(80) } },
  { name: `Peak, ${pRange(88)}`, bars: 8, patterns: { jt90: 'KH', jt30: acid(88), jb202: drone(88) } },
  ...[96, 104].map((b) => ({ name: `Close, ${pRange(b)}`, bars: 8, patterns: { jt90: 'KH', jt30: acid(b), jb202: drone(b) } })),
  { name: `Hats out, ${pRange(112)}`, bars: 8, patterns: { jt90: 'K', jt30: acid(112), jb202: drone(112) } },
  { name: `Voice alone again, ${pRange(120)}`, bars: 8, patterns: { jt30: acid(120), jb202: drone(120) } },
]
await t('set_arrangement', { sections: plan.map((s) => ({ bars: s.bars, ...s.patterns })) })
const BARS = plan.reduce((a, s) => a + s.bars, 0)
if (BARS !== 128) throw new Error(`arrangement is ${BARS} bars`)

await t('load_pattern', { instrument: 'jt90', name: 'KH' })
await t('load_pattern', { instrument: 'jt30', name: acid(88) })
await t('load_pattern', { instrument: 'jb202', name: drone(88) })

// ---------------------------------------------------------------------------
// 6. Render, gain-stage, measure
// ---------------------------------------------------------------------------
const NODES = ['jt90', 'jt30', 'jb202']
// SOLO=jt30 (etc.) mutes the other two: stems, and a check that each voice sounds.
if (process.env.SOLO) for (const id of NODES) if (id !== process.env.SOLO) await t('mute_track', { track: id, mute: true })
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
  console.log(formatRows(analyzeWav(readWav(readFileSync(`${OUT}/audition-${i + 1}.wav`)), session.bpm, [plan[i].bars]).rows))
  process.exit(0)
}

let r = await render()
console.log(`RENDER 1: ${r.message.split('. Stems')[0]}  [${r.seconds.toFixed(1)} s, peak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(1)} dB]`)
const TARGET_PEAK_DB = -1
let delta = TARGET_PEAK_DB - 20 * Math.log10(r.peak)
delta = Math.min(delta, Math.min(...NODES.map((id) => 6 - session.getNode(id).getLevel())))
if (Math.abs(delta) > 0.05) {
  for (const id of NODES) {
    const cur = session.getNode(id).getLevel()
    await t('tweak', { path: `${id}.level`, value: Math.round((cur + delta) * 10) / 10 })
  }
  r = await render()
  console.log(`RENDER 2 (gain ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} dB): ${r.message.split('. Stems')[0]}  [${r.seconds.toFixed(1)} s, peak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(1)} dB]`)
}
if (r.trimDb < -2) throw new Error(`trim ${r.trimDb} dB — levels too hot`)
if (/fail/i.test(r.message)) throw new Error(`render reported failures: ${r.message}`)

writeFileSync(`${OUT}/song.wav`, r.wav)
const stems = Object.entries(r.stems).map(([id, st]) => `${id} ${st.peakDb.toFixed(1)} dBFS crest ${st.crestDb.toFixed(1)} dB`).join(', ')
console.log(`STEMS: ${stems}`)
if (r.stems.jt30.crestDb < 7) throw new Error(`acid crest ${r.stems.jt30.crestDb.toFixed(1)} dB — the line is squashed`)
const metrics = formatRows(r.rows)
const table = r.rows.map((row, i) => `${row.bars.padEnd(9)} ${plan[i].name}`).join('\n')
const levels = NODES.map((id) => `${id} ${session.getNode(id).getLevel().toFixed(1)} dB`).join(', ')
writeFileSync(`${OUT}/metrics.txt`, `${r.message}\nstems: ${stems}\npeak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(2)} dB, ${r.seconds.toFixed(1)} s\nlevels: ${levels}\n\n${metrics}\n\nsections:\n${table}\n`)
console.log(metrics)
console.log(table)
console.log(`levels: ${levels}`)

// Checks: no drop-outs while the drums play (the voice-alone sections fade in
// and out on purpose), the hats stay dark.
const bad = []
r.rows.forEach((row, i) => {
  if (row.silence > 0.02 && plan[i].patterns.jt90) bad.push(`${plan[i].name}: ${(row.silence * 100).toFixed(0)} % silence`)
  if (row.high > 0.03) bad.push(`${plan[i].name}: high band ${(row.high * 100).toFixed(1)} % (> 3 %)`)
})
console.log(bad.length ? `CHECKS: ${bad.length} flags\n  ${bad.join('\n  ')}` : 'CHECKS: clean')

// Round trip: what the app will load must render the same song.
const saved = serializeSession(session)
const again = deserializeSession(JSON.parse(JSON.stringify(saved)))
const r2 = await renderSessionToBuffer(again, BARS)
const same = r2.message === r.message && r2.bars === r.bars && Math.abs(r2.peak - r.peak) < 1e-6
console.log(`ROUND TRIP: ${same ? 'ok' : 'MISMATCH'} — ${r2.message.split('. Stems')[0]} (peak ${r2.peak.toFixed(3)})`)
if (!same) process.exitCode = 1

// ---------------------------------------------------------------------------
// 7. track.json — what the app saves as a track
// ---------------------------------------------------------------------------
const brief = 'Another track from the same EP as Overclock (Act III): same producer, same vibe, a different track. Dry, mono minimal acid at 128, in D this time. The 303 opens the track alone, closed, over the drone; the kick is the first event at bar 17, hats at 25; one straight filter climb; at 81 the kick drops out under the line at its brightest, and its return at 89 under the fully open filter is the one peak; then it all closes, the drums leave, and the voice ends the track alone the way it began. No reverb, no delay, no fills, no slides. The line spells Dm7 in octave leaps with accents on 1, 4, 7, 10, 13.'
const description = [
  'The 303 alone for 16 bars, closed, over the drone; the kick arrives at 17 and the offbeat hats at 25. From 33 the filter opens in one straight line to bar 80. At 81 the floor goes — hats, line and drone, no kick — while the filter opens the rest of the way; the kick returns at 89 under the fully open line, the one peak, and from there it closes: hats out at 113, kick out at 121, and the voice and the drone fade out over the last four bars.',
  `Patterns: jt90 K/KH/H, jt30 ${BLOCKS.map(acid).join('/')} (one per 8-bar block, each carrying its slice of the sweep; A121 fades the voice), jb202 ${BLOCKS.map(drone).join('/')} (the drone's filter breath rides the same sweep; D1 fades in, D121 out). Loop mode plays the peak.`,
].join('\n\n')

writeFileSync(`${OUT}/track.json`, JSON.stringify({
  title: 'Overclock (Act II)',
  bpm: 128,
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
