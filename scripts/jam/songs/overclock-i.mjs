#!/usr/bin/env node
// Overclock (Act I) — the EP's opener: same producer, same tools, a different
// kind of bass line. 128 bars at 128 BPM in A minor.
//
// Acts II and III are staccato octave-leap lines on the beat. This one is the
// other acid bass: a ROLLING OFF-BEAT line with slides. Every note attacks on
// the "and" between two kicks and holds an 8th; three of the four glide away
// from the root on their second half (up to C, up to E, down to G) and one
// just holds — the 303's own gesture, where the pitch moves inside the note.
// Accents on the "and" of 1 and 3 only, so the bar has a two-beat lean.
// What else is different, a little: a fifth in the drone (A1 with E2 six cents
// sharp) instead of a unison or an octave, the kick pumping the drone harder,
// the filter decay a notch longer so the glide keeps its "wow", and a
// subtractive shape — everything rolls from bar 1 like a DJ tool, the HATS
// leave for the breakdown (the kick and the bass keep rolling), and at the
// end the bass leaves before the drums do.
//
// Shape (1-indexed bars, `p` = filter progress 0..1):
//   1   kick, hats, bass, drone, p .1 → .6 over 48 bars     89  peak, p = 1, held
//   49  hats out, p .6 → .5                                 97  p 1 → .3
//   57  hats back, p .5 → 1                                113  bass out; kick, hats, drone
//                                                         121  hats out; kick and drone, fade over 125–128
//
//   node scripts/jam/songs/overclock-i.mjs   (OUT=…, AUDITION=n plays one section, SOLO=<id> a stem)

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HILMA = resolve(HERE, '..', '..', '..')
const JAMBOT = resolve(HILMA, '../vibeceo/jambot')
const OUT = process.env.OUT || resolve(HERE, 'out', 'overclock-i')
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
const linRamp = (n, a, b) => Array.from({ length: n }, (_, i) => Math.round((a + ((b - a) * i) / (n - 1)) * 10) / 10)

// The sweep: [0-indexed bar, p], linear in between. Slightly open from the
// start (the bass rolls from bar 1), a small ease back while the hats are out,
// the top held for eight bars, then a close.
const P_KEYS = [[0, 0.1], [48, 0.6], [56, 0.5], [88, 1], [96, 1], [112, 0.3]]
function pAt(barF) {
  if (barF <= P_KEYS[0][0]) return P_KEYS[0][1]
  for (let i = 1; i < P_KEYS.length; i++) {
    const [b1, v1] = P_KEYS[i], [b0, v0] = P_KEYS[i - 1]
    if (barF <= b1) return v0 + ((v1 - v0) * (barF - b0)) / (b1 - b0)
  }
  return P_KEYS[P_KEYS.length - 1][1]
}
// Same mapping as Acts II and III: the JT30's envelope opens about 1.6 octaves
// above the base cutoff, so 100 → 900 Hz base puts the open line near 2.7 kHz.
const CUT_LO = 100, CUT_HI = 900
const cutoffAt = (barF) => Math.round(CUT_LO + (CUT_HI - CUT_LO) * pAt(barF) ** 2)

// ---------------------------------------------------------------------------
// 1. Tempo, kit, levels — the EP settings
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
// 2. Drums — kick, and kick with the offbeat closed hat
// ---------------------------------------------------------------------------
await t('add_jt90', { clear: true, bars: 1, kick: [0, 4, 8, 12] })
await t('save_pattern', { instrument: 'jt90', name: 'K' })
await t('add_jt90', { clear: true, bars: 1, kick: [0, 4, 8, 12], ch: [2, 6, 10, 14] })
await t('save_pattern', { instrument: 'jt90', name: 'KH' })

// ---------------------------------------------------------------------------
// 3. The bass — off the beat, sliding; A minor, root A2
// ---------------------------------------------------------------------------
//  step   1   2   3    4    5   6   7    8    9   10  11   12   13  14  15   16
//  note   .   .   A2   C3~  .   .   A2   A2~  .   .   A2   E3~  .   .   A2   G2~
//  acc            ●                                   ●
// Every note attacks on the "and" (3, 7, 11, 15) and holds through the next
// 16th with a slide: the pitch glides up to C, holds on A, glides up to E,
// glides down to G into the bar line. Kicks fall in the gaps.
const STEPS = {
  2: ['A2', true], 3: ['C3', false, true],
  6: ['A2', false], 7: ['A2', false, true],
  10: ['A2', true], 11: ['E3', false, true],
  14: ['A2', false], 15: ['G2', false, true],
}
const line = Array.from({ length: 16 }, (_, i) => {
  const s = STEPS[i]
  return s ? { note: s[0], gate: true, accent: !!s[1], slide: !!s[2] } : { note: 'A2', gate: false, accent: false, slide: false }
})
const lineBars = (bars) => Array.from({ length: bars }, () => line.map((s) => ({ ...s }))).flat()

await t('add_jt30', { pattern: lineBars(8), bars: 8 })
// The EP's JT30 patch with the filter decay a notch longer (40, not 30) so the
// glide keeps its wow: slides re-trigger the envelope only partway.
await t('tweak_multi', { params: { 'jt30.bass.waveform': 'sawtooth', 'jt30.bass.cutoff': 100, 'jt30.bass.resonance': 70, 'jt30.bass.envMod': 35, 'jt30.bass.decay': Number(process.env.ACID_DECAY ?? 40), 'jt30.bass.accent': 60, 'jt30.bass.drive': Number(process.env.ACID_DRIVE ?? 15) } })
await t('add_sidechain', { target: 'jt30', trigger: 'kick', amount: 0.4 })

// One 8-bar pattern per block, each carrying its slice of the sweep; the bass
// plays bars 1–112 and leaves at a bar line.
const BLOCKS = Array.from({ length: 14 }, (_, i) => i * 8)
for (const start of BLOCKS) {
  await t('add_jt30', { pattern: lineBars(8), bars: 8 })
  await t('automate', { path: 'jt30.bass.cutoff', values: Array.from({ length: 128 }, (_, i) => cutoffAt(start + i / 16)) })
  await t('save_pattern', { instrument: 'jt30', name: `A${start + 1}` })
}

// ---------------------------------------------------------------------------
// 4. Drone — A1 and a fifth above it, six cents sharp, pumped by the kick
// ---------------------------------------------------------------------------
await t('add_sidechain', { target: 'jb202', trigger: 'kick', amount: Number(process.env.DRONE_PUMP ?? 0.5) })
await t('tweak_multi', { params: {
  'jb202.osc1Waveform': 'sawtooth', 'jb202.osc1Octave': 0, 'jb202.osc1Detune': 0, 'jb202.osc1Level': 100,
  'jb202.osc2Waveform': 'sawtooth', 'jb202.osc2Octave': 7, 'jb202.osc2Detune': 6, 'jb202.osc2Level': 70,
  'jb202.filterCutoff': 420, 'jb202.filterResonance': 0, 'jb202.filterEnvAmount': 0,
  'jb202.ampAttack': 0, 'jb202.ampSustain': 100, 'jb202.ampRelease': 30, 'jb202.drive': 0,
} })
const held = (bars) => Array.from({ length: bars * 16 }, (_, i) => ({ note: 'A1', gate: true, accent: false, slide: i > 0 }))
const droneCut = (start, bars) => Array.from({ length: bars * 16 }, (_, i) => Math.round(420 + 100 * pAt(start + i / 16)))
// `level` lanes are dB offsets from the fader (0 = unity): two bars in at the
// start (a saw from sample one would click), four bars out at the end.
const DRONE_BLOCKS = Array.from({ length: 16 }, (_, i) => i * 8)
for (const start of DRONE_BLOCKS) {
  await t('add_jb202', { pattern: held(8) })
  await t('automate', { path: 'jb202.filterCutoff', values: droneCut(start, 8) })
  if (start === 0) await t('automate', { path: 'jb202.level', values: [...linRamp(32, -40, 0), ...Array(96).fill(0)] })
  if (start === 120) await t('automate', { path: 'jb202.level', values: [...Array(64).fill(0), ...linRamp(64, 0, -60)] })
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
  ...[0, 8, 16, 24, 32, 40].map((b) => ({ name: `Roll, ${pRange(b)}`, bars: 8, patterns: { jt90: 'KH', jt30: acid(b), jb202: drone(b) } })),
  { name: `Hats out, ${pRange(48)}`, bars: 8, patterns: { jt90: 'K', jt30: acid(48), jb202: drone(48) } },
  ...[56, 64, 72, 80].map((b) => ({ name: `Climb, ${pRange(b)}`, bars: 8, patterns: { jt90: 'KH', jt30: acid(b), jb202: drone(b) } })),
  { name: `Peak, ${pRange(88)}`, bars: 8, patterns: { jt90: 'KH', jt30: acid(88), jb202: drone(88) } },
  ...[96, 104].map((b) => ({ name: `Close, ${pRange(b)}`, bars: 8, patterns: { jt90: 'KH', jt30: acid(b), jb202: drone(b) } })),
  { name: 'Bass out', bars: 8, patterns: { jt90: 'KH', jb202: drone(112) } },
  { name: 'Run-out', bars: 8, patterns: { jt90: 'K', jb202: drone(120) } },
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
if (r.stems.jt30 && r.stems.jt30.crestDb < 7) throw new Error(`bass crest ${r.stems.jt30.crestDb.toFixed(1)} dB — the line is squashed`)
const metrics = formatRows(r.rows)
const table = r.rows.map((row, i) => `${row.bars.padEnd(9)} ${plan[i].name}`).join('\n')
const levels = NODES.map((id) => `${id} ${session.getNode(id).getLevel().toFixed(1)} dB`).join(', ')
writeFileSync(`${OUT}/metrics.txt`, `${r.message}\nstems: ${stems}\npeak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(2)} dB, ${r.seconds.toFixed(1)} s\nlevels: ${levels}\n\n${metrics}\n\nsections:\n${table}\n`)
console.log(metrics)
console.log(table)
console.log(`levels: ${levels}`)

// Checks: no drop-outs while the drums play (the run-out fades on purpose), the hats stay dark.
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
console.log(`ROUND TRIP: ${same ? 'ok' : 'MISMATCH'} — ${r2.message.split('. Stems')[0]} (peak ${r2.peak.toFixed(3)})`)
if (!same) process.exitCode = 1

// ---------------------------------------------------------------------------
// 7. track.json — what the app saves as a track
// ---------------------------------------------------------------------------
const brief = 'A third track for the Overclock EP, and mix it up a little: a different kind of bass line. Same producer, same tools — kick, one offbeat closed hat, the 303, a drone, dry and mono at 128 — but the 303 plays a rolling off-beat bass with slides this time, every note on the "and" between the kicks and gliding away from the root, instead of a staccato octave line on the beat. A minor. Everything rolls from bar 1, the hats drop out for the breakdown, the bass leaves before the drums at the end.'
const description = [
  'Kick, hats, bass and drone from the first bar, the filter a tenth open. The bass sits on the "and" of every beat, an 8th long, sliding up to C after the first, holding on the second, up to E after the third and down to G into the bar line; the accents on the "and" of 1 and 3 give it a two-beat lean. The filter opens to .6 over 48 bars; at 49 the hats go while the kick and the bass keep rolling; at 57 they are back and the filter climbs to fully open at 89, held eight bars, then closes to 112. At 113 the bass leaves and the kick, hats and drone run out; at 121 the hats go too, and the drone fades under the kick over the last four bars.',
  `Patterns: jt90 K/KH, jt30 ${BLOCKS.map(acid).join('/')} (one per 8-bar block, each carrying its slice of the sweep), jb202 ${DRONE_BLOCKS.map(drone).join('/')} (the drone's filter breath rides the same sweep; D1 fades in over two bars, D121 out over four). Loop mode plays the peak.`,
].join('\n\n')

writeFileSync(`${OUT}/track.json`, JSON.stringify({
  title: 'Overclock (Act I)',
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
