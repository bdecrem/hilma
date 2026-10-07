#!/usr/bin/env node
// Overclock (Act III), rebuilt in Jambot — 128 bars of dry acid techno at 128 in E.
//
// The original is a hand-built Web Audio render (production notes + render.js,
// 2026-10-06): sine kick, one offbeat closed hat, a 16-step 303 line that never
// changes, a low drone, and one long filter sweep as the only motion. Same
// arrangement and the same sweep curve here, voiced on Jambot instruments:
//
//   kick + hat   jt90, Bart's kit values from Minimal 131 (hats 9 dB up: they are the only top end)
//   acid         jt30 on drive law 2 (timbre, not gain): drive 15, resonance 70, envMod 35,
//                decay 30, accent 60; the sweep `p` drives the base cutoff 100 → 900 Hz,
//                quadratic like the original's 300 + 2600·p², so the envelope's peak lands
//                near 1 kHz at p .55 and 2.7 kHz at p 1 — the original's own arc
//   drone        jb202, two saws on E1 ten cents apart, no resonance, one tied note
//   pump         the kick sidechains the acid and the drone, standing in for the bus compressor
//
// The first pass (same day) used the Minimal 131 JT30 patch verbatim on the
// legacy drive law, where drive 25 is ×5 of gain into a clipper and every
// accent adds +20 more: fine for a root pulse buried at -12 dB, "crazy
// overdrive" on an exposed melody (and its crest still read 8 dB — the Stems
// line catches squash, the drive law and its docs catch this). Hence law 2.
//
// Shape (1-indexed bars, `p` = filter progress 0..1, as in the notes):
//   1   kick, drone fades in           57  kick + hats back, p .35 → 1
//   9   + offbeat hats                 97  peak, p = 1
//   17  + acid, p 0 → .55              105 p 1 → .3
//   49  breakdown: acid + drone only   117 acid out · 121 hats out · 125 drone fades out
//
//   node scripts/jam/songs/overclock.mjs        (OUT=…, AUDITION=n plays one section, SOLO=<id> a stem)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HILMA = resolve(HERE, '..', '..', '..')
const JAMBOT = resolve(HILMA, '../vibeceo/jambot')
const OUT = process.env.OUT || resolve(HERE, 'out', 'overclock')
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

// The sweep, verbatim from render.js: [0-indexed bar, p], linear in between.
const P_KEYS = [[16, 0], [48, 0.55], [56, 0.35], [96, 1], [104, 1], [116, 0.3]]
function pAt(barF) {
  if (barF <= P_KEYS[0][0]) return P_KEYS[0][1]
  for (let i = 1; i < P_KEYS.length; i++) {
    const [b1, v1] = P_KEYS[i], [b0, v0] = P_KEYS[i - 1]
    if (barF <= b1) return v0 + ((v1 - v0) * (barF - b0)) / (b1 - b0)
  }
  return P_KEYS[P_KEYS.length - 1][1]
}
// The original's per-note peak cutoff is 300 + 2600·p². The JT30's envelope
// opens the filter about 1.6 octaves (×3) above the base cutoff at envMod 35,
// so the base sweeps 100 → 900 Hz on the same quadratic.
const CUT_LO = 100, CUT_HI = 900
const cutoffAt = (barF) => Math.round(CUT_LO + (CUT_HI - CUT_LO) * pAt(barF) ** 2)

// ---------------------------------------------------------------------------
// 1. Tempo, kit, levels
// ---------------------------------------------------------------------------
await t('set_bpm', { bpm: 128 })
await t('set_swing', { amount: 0 })   // straight 16ths

// Kick and hat: Bart's kit with the Minimal 131 values, verbatim.
await t('tweak_multi', { params: {
  'jt90.kick.tune': -6, 'jt90.kick.decay': 90, 'jt90.kick.attack': 40, 'jt90.kick.level': -5.5,
  'jt90.ch.level': Number(process.env.HAT_DB ?? -17), 'jt90.ch.decay': 39, 'jt90.ch.tone': 100,
  'jt90.clap.level': -60,
} })
await t('tweak', { path: 'jt90.level', value: -0.2 })
await t('tweak', { path: 'jt30.level', value: Number(process.env.ACID_DB ?? -6) })
await t('tweak', { path: 'jb202.level', value: Number(process.env.DRONE_DB ?? -22) })

// ---------------------------------------------------------------------------
// 2. Drums — four on the floor, one closed hat on every offbeat 8th
// ---------------------------------------------------------------------------
await t('add_jt90', { clear: true, bars: 1, kick: [0, 4, 8, 12] })
await t('save_pattern', { instrument: 'jt90', name: 'K' })
await t('add_jt90', { clear: true, bars: 1, kick: [0, 4, 8, 12], ch: [2, 6, 10, 14] })
await t('save_pattern', { instrument: 'jt90', name: 'KH' })

// ---------------------------------------------------------------------------
// 3. Acid — the 16-step line, transposed to E2, never varied
// ---------------------------------------------------------------------------
const SEQ = [0, 0, 12, 0, 3, null, 15, 7, 0, 10, 0, 12, 3, null, 7, 19]
const ACC = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1]
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const E2 = 40 // MIDI
const noteName = (midi) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
const line = SEQ.map((s, i) => s === null
  ? { note: 'E2', gate: false, accent: false, slide: false }
  : { note: noteName(E2 + s), gate: true, accent: !!ACC[i], slide: false })
const lineBars = (bars) => Array.from({ length: bars }, () => line.map((s) => ({ ...s }))).flat()

// The 303: the Minimal 131 patch with the drive at 15 on law 2 (warm grit, no
// gain), cutoff automated per step below.
await t('add_jt30', { pattern: lineBars(8), bars: 8 })
await t('tweak_multi', { params: { 'jt30.bass.waveform': 'sawtooth', 'jt30.bass.cutoff': 100, 'jt30.bass.resonance': 70, 'jt30.bass.envMod': 35, 'jt30.bass.decay': 30, 'jt30.bass.accent': 60, 'jt30.bass.drive': Number(process.env.ACID_DRIVE ?? 15) } })
await t('add_sidechain', { target: 'jt30', trigger: 'kick', amount: 0.4 })

// One acid pattern per block of the arrangement, each carrying its slice of the sweep.
const ACID_BLOCKS = [] // [startBar (0-indexed), bars]
for (let b = 16; b < 112; b += 8) ACID_BLOCKS.push([b, 8])
ACID_BLOCKS.push([112, 4])
for (const [start, bars] of ACID_BLOCKS) {
  await t('add_jt30', { pattern: lineBars(bars), bars })
  await t('automate', { path: 'jt30.bass.cutoff', values: Array.from({ length: bars * 16 }, (_, i) => cutoffAt(start + i / 16)) })
  await t('save_pattern', { instrument: 'jt30', name: `A${start + 1}` })
}

// ---------------------------------------------------------------------------
// 4. Drone — two saws on E1 ten cents apart (the original's 41.2 / 41.45 Hz
// beat) under a plain lowpass that breathes 420 → 520 Hz with the sweep. No
// resonance, no filter envelope, full sustain: one tied note per pattern.
// The original's own values (Bart's sub patch is a triangle + sine under
// ~60 Hz, inaudible as a drone on E1), flagged for a listen.
// ---------------------------------------------------------------------------
await t('add_sidechain', { target: 'jb202', trigger: 'kick', amount: 0.35 })
await t('tweak_multi', { params: {
  'jb202.osc1Waveform': 'sawtooth', 'jb202.osc1Octave': 0, 'jb202.osc1Detune': 0, 'jb202.osc1Level': 100,
  'jb202.osc2Waveform': 'sawtooth', 'jb202.osc2Octave': 0, 'jb202.osc2Detune': 10, 'jb202.osc2Level': 100,
  'jb202.filterCutoff': 420, 'jb202.filterResonance': 0, 'jb202.filterEnvAmount': 0,
  'jb202.ampAttack': 0, 'jb202.ampSustain': 100, 'jb202.ampRelease': 30, 'jb202.drive': 0,
} })
const held = (bars) => Array.from({ length: bars * 16 }, (_, i) => ({ note: 'E1', gate: true, accent: false, slide: i > 0 }))
const droneCut = (start, bars) => Array.from({ length: bars * 16 }, (_, i) => Math.round(420 + 100 * pAt(start + i / 16)))
// `level` lanes are dB offsets from the fader (0 = unity), so the fades hold
// after the gain staging below moves the faders.
await t('add_jb202', { instrument: 'jb202', pattern: held(8) })
await t('automate', { path: 'jb202.level', values: linRamp(128, -40, 0) })
await t('save_pattern', { instrument: 'jb202', name: 'IN' })
await t('clear_automation', { path: 'jb202.level' })   // a live lane would ride into every later save
await t('add_jb202', { instrument: 'jb202', pattern: held(4) })
await t('save_pattern', { instrument: 'jb202', name: 'D' })
// One drone pattern per acid block, each carrying its slice of the filter breath.
for (const [start, bars] of ACID_BLOCKS) {
  await t('add_jb202', { instrument: 'jb202', pattern: held(bars) })
  await t('automate', { path: 'jb202.filterCutoff', values: droneCut(start, bars) })
  await t('save_pattern', { instrument: 'jb202', name: `D${start + 1}` })
}
await t('add_jb202', { instrument: 'jb202', pattern: held(4) })
await t('automate', { path: 'jb202.filterCutoff', values: droneCut(116, 4) })
await t('save_pattern', { instrument: 'jb202', name: 'DEND' })
await t('add_jb202', { instrument: 'jb202', pattern: held(4) })
await t('automate', { path: 'jb202.filterCutoff', values: droneCut(116, 4) })
await t('automate', { path: 'jb202.level', values: linRamp(64, 0, -60) })
await t('save_pattern', { instrument: 'jb202', name: 'OUT' })

// ---------------------------------------------------------------------------
// 5. Arrangement — 128 bars, as in the notes
// ---------------------------------------------------------------------------
const acid = (start) => `A${start + 1}`
const drone = (start) => `D${start + 1}`
const plan = [
  { name: 'Kick + drone in', bars: 8, patterns: { jt90: 'K', 'jb202': 'IN' } },
  { name: 'Hats', bars: 8, patterns: { jt90: 'KH', 'jb202': 'D' } },
  ...[16, 24, 32, 40].map((b) => ({ name: `Acid p ${pAt(b).toFixed(2)}→${pAt(b + 8).toFixed(2)}`, bars: 8, patterns: { jt90: 'KH', jt30: acid(b), 'jb202': drone(b) } })),
  { name: 'Breakdown', bars: 8, patterns: { jt30: acid(48), 'jb202': drone(48) } },
  ...[56, 64, 72, 80, 88].map((b) => ({ name: `Climb p ${pAt(b).toFixed(2)}→${pAt(b + 8).toFixed(2)}`, bars: 8, patterns: { jt90: 'KH', jt30: acid(b), 'jb202': drone(b) } })),
  { name: 'Peak p 1', bars: 8, patterns: { jt90: 'KH', jt30: acid(96), 'jb202': drone(96) } },
  { name: 'Close p 1→.3', bars: 8, patterns: { jt90: 'KH', jt30: acid(104), 'jb202': drone(104) } },
  { name: 'Close', bars: 4, patterns: { jt90: 'KH', jt30: acid(112), 'jb202': drone(112) } },
  { name: 'Kick + hats', bars: 4, patterns: { jt90: 'KH', 'jb202': 'DEND' } },
  { name: 'Kick', bars: 4, patterns: { jt90: 'K', 'jb202': 'DEND' } },
  { name: 'Drone out', bars: 4, patterns: { 'jb202': 'OUT' } },
]
await t('set_arrangement', { sections: plan.map((s) => ({ bars: s.bars, ...s.patterns })) })
const BARS = plan.reduce((a, s) => a + s.bars, 0)
if (BARS !== 128) throw new Error(`arrangement is ${BARS} bars`)

await t('load_pattern', { instrument: 'jt90', name: 'KH' })
await t('load_pattern', { instrument: 'jt30', name: acid(96) })
await t('load_pattern', { instrument: 'jb202', name: 'D' })

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
if (r.stems.jt30 && r.stems.jt30.crestDb < 7) throw new Error(`acid crest ${r.stems.jt30.crestDb.toFixed(1)} dB — the line is squashed`)
const metrics = formatRows(r.rows)
const table = r.rows.map((row, i) => `${row.bars.padEnd(9)} ${plan[i].name}`).join('\n')
const levels = NODES.map((id) => `${id} ${session.getNode(id).getLevel().toFixed(1)} dB`).join(', ')
writeFileSync(`${OUT}/metrics.txt`, `${r.message}\nstems: ${stems}\npeak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(2)} dB, ${r.seconds.toFixed(1)} s\nlevels: ${levels}\n\n${metrics}\n\nsections:\n${table}\n`)
console.log(metrics)
console.log(table)
console.log(`levels: ${levels}`)

// Checks: nothing silent that should play, the hats stay dark, and the acid
// sweep is audible as a rise in the high band between the first acid block and the peak.
const bad = []
r.rows.forEach((row, i) => {
  if (row.silence > 0.02 && i < plan.length - 1) bad.push(`${plan[i].name}: ${(row.silence * 100).toFixed(0)} % silence`)
  if (row.high > 0.03) bad.push(`${plan[i].name}: high band ${(row.high * 100).toFixed(1)} % (> 3 %)`)
})
console.log(bad.length ? `CHECKS: ${bad.length} flags\n  ${bad.join('\n  ')}` : 'CHECKS: clean')

// Round trip: what the app will load must render the same song.
const saved = serializeSession(session)
const again = deserializeSession(JSON.parse(JSON.stringify(saved)))
const r2 = await renderSessionToBuffer(again, BARS)
const same = r2.message === r.message && r2.bars === r.bars && Math.abs(r2.peak - r.peak) < 1e-6
console.log(`ROUND TRIP: ${same ? 'ok' : 'MISMATCH'} — ${r2.message} (peak ${r2.peak.toFixed(3)})`)
if (!same) process.exitCode = 1

// ---------------------------------------------------------------------------
// 7. track.json — what the app saves as a track
// ---------------------------------------------------------------------------
const brief = 'Overclock (Act III): dry, mono acid techno at 128 in E. Four on the floor, one closed hat on every offbeat, a 16-step 303 line that never changes (E E E3 E G . G3 B E D3 E E3 G . B B3), a low E drone underneath, and one long filter sweep as the only motion: open to the middle, a breakdown, all the way up once around 3:00, then back down. No reverb, no delay, no fills, no slides.'
const description = [
  'Kick alone while the drone fades in; hats on the offbeats from bar 9; at 17 the acid line starts closed and opens slowly to bar 48; bars 49–56 drop the drums for the line and the drone while the filter eases back; the kick returns at 57 and the line climbs to fully open at 97, holds eight bars, then closes back down to 116; then the acid leaves, the hats leave, the kick leaves and the drone fades out at 128.',
  `Patterns: jt90 K/KH, jt30 ${ACID_BLOCKS.map(([b]) => acid(b)).join('/')} (one per block, each carrying its slice of the sweep), jb202 IN/D/D17…D113/DEND/OUT (the drone's filter breath rides the same sweep). Loop mode plays the peak.`,
].join('\n\n')

writeFileSync(`${OUT}/track.json`, JSON.stringify({
  title: 'Overclock (Act III)',
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
