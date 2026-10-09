#!/usr/bin/env node
// Tinsley — a 30-second sketch of Sheffield bleep techno. 16 bars at 124 in E minor.
//
// The genre: Warp's first records (1989–91) — Forgemasters "Track With No
// Name", Sweet Exorcist "Testone", LFO "LFO", Unique 3 "The Theme". Two hooks
// and almost nothing else: a PURE-TONE BLEEP up top (a square wave through a
// closed, resonance-free filter, a 100 ms blip, Casio-pure) and a SUB BASS
// line that is a riff, not a drone, deep enough to be felt before it is heard.
// A kick, a dry backbeat on 2 and 4 with a short room, offbeat hats, 808-style
// tom rolls as the fills, and the bleep in a dotted-8th delay (the 3-against-4
// cascade is the genre's one effect). No 303, no acid, no chords.
//
// Different lead synth from the Overclock EP: the JT10 (101-style) carries the
// hook, not the JT30. Its patch is NEW (flagged): pulse only, cutoff 1.5 kHz,
// resonance 0, envMod 0, decay/release short — a blip. Kit, sub patch,
// sidechain and the JT10 delay/room are Bart's own values (Minimal 131, Polder,
// his techno-128 base), verbatim.
//
// The hook sits on the delay grid: notes on steps 0, 3, 6 of each bar — the
// same 3/16 spacing as the dotted-8th echo, so every repeat lands on a hit or
// in the gap the next hit leaves. Bar 2 adds a lift (D5 G5) into the repeat.
// The sub (E1 +5 cents = 41.33 Hz = 20 cycles per beat at 124, phase-locked
// to the kick): roots on the "and"s, G1 on the "and" of 3, a D2–B1–G1 walk
// down in bar 2.
//
// Shape (1-indexed bars):
//   1   bleep + sub, cold (no drums)       9  the THROW: one hit, then only its echoes; no snare
//   3   + kick, offbeat hats              10  tom roll (hi → mid → low), open hat
//   5   + snare on 2 and 4, open hat;     11  hook back, full kit
//       a tom fill into 9                 15  hook 2: the octave-up stutter, a final roll
//
//   node scripts/jam/songs/tinsley.mjs   (OUT=…, AUDITION=n plays one section, SOLO=<id,…> stems)

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HILMA = resolve(HERE, '..', '..', '..')
const JAMBOT = resolve(HILMA, '../vibeceo/jambot')
const OUT = process.env.OUT || resolve(HERE, 'out', 'tinsley')
mkdirSync(OUT, { recursive: true })

const { createSession, deserializeSession, serializeSession } = await import(`${JAMBOT}/core/session.js`)
const { renderSessionToBuffer } = await import(`${JAMBOT}/core/render.js`)
const { audioBufferToWav } = await import(`${JAMBOT}/core/wav.js`)
const { initializeTools, executeTool } = await import(`${JAMBOT}/tools/index.js`)
const { readWav, analyzeWav, formatRows } = await import(`${HILMA}/scripts/jam/song-metrics.mjs`)

await initializeTools()
const BPM = 124
const session = createSession({ bpm: BPM })   // a new session: drive law 2

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

/** Melodic pattern from { stepIndex: 'E5' | 'E5!' | 'E5~' } over `bars`; a '~' step holds (legato) from the step before. */
function seq(spec, bars = 1, rest = 'E1') {
  const steps = Array.from({ length: bars * 16 }, () => ({ note: rest, gate: false, accent: false, slide: false }))
  for (const [i, tok] of Object.entries(spec)) {
    const note = tok.replace(/[!~]/g, '')
    steps[Number(i)] = { note, gate: true, accent: tok.includes('!'), slide: tok.includes('~') }
  }
  return steps
}
/** A note held for `len` steps from `at`: the first step attacks, the rest tie. */
function hold(spec, at, note, len, accent = false) {
  spec[at] = note + (accent ? '!' : '')
  for (let k = 1; k < len; k++) spec[at + k] = note + '~'
  return spec
}

// ---------------------------------------------------------------------------
// 1. Tempo, kit — Bart's values (Minimal 131 / Polder), verbatim
// ---------------------------------------------------------------------------
await t('set_bpm', { bpm: BPM })
await t('set_swing', { amount: 0 })
await t('tweak_multi', { params: {
  'jt90.kick.tune': -6, 'jt90.kick.decay': 90, 'jt90.kick.attack': 40, 'jt90.kick.level': -5.5,
  'jt90.ch.level': Number(process.env.HAT_DB ?? -18), 'jt90.ch.decay': 39, 'jt90.ch.tone': 100,
  'jt90.oh.level': -24, 'jt90.oh.decay': 45, 'jt90.oh.tone': 15,
  'jt90.lowtom.level': -9, 'jt90.lowtom.tune': -2, 'jt90.lowtom.decay': 65,
  'jt90.midtom.level': -11, 'jt90.midtom.tune': -5, 'jt90.midtom.decay': 50,
  'jt90.hitom.level': -13, 'jt90.hitom.tune': 0, 'jt90.hitom.decay': 55,   // engine default tune/decay, a notch under the mid tom
  'jt90.snare.level': Number(process.env.SNARE_DB ?? -13),   // engine default snare (decay 40, tone 50, snappy 50)
  'jt90.clap.level': -60, 'jt90.rimshot.level': -60,
} })
await t('tweak', { path: 'jt90.level', value: -0.2 })
// The backbeat's room: the open hat's small reverb from Polder, on the snare.
await t('add_effect', { target: 'jt90.snare', effect: 'reverb', decay: 1.6, mix: 18, lowcut: 300, damping: 65, size: 45 })
await t('add_effect', { target: 'jt90.oh', effect: 'reverb', decay: 1.6, mix: 18, lowcut: 300, damping: 65, size: 45 })

const KICK = [0, 4, 8, 12], OFF = [2, 6, 10, 14], BACK = [4, 12]
// KH: kick + offbeat hats. KHS (2 bars): + snare on 2 and 4, an open hat on
// the "a" of 4 in the second bar. FILL (4 bars): KHS twice, the last bar
// ending in a low-mid tom fill. THROW9: kick, hats, no snare (the floor under
// the echoes). ROLL (1 bar): the 808 roll — high tom on 1, mid on 2, low tom
// doubling through 3 and 4, the open hat on the last 8th. END (2 bars): full
// kit, the last beat a roll down to the low tom. The rolls sit on the 16ths
// BETWEEN the kicks, so a tom never stacks on a kick.
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: OFF })
await t('save_pattern', { instrument: 'jt90', name: 'KH' })
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, OFF), snare: everyBar(2, BACK), oh: [16 + 14] })
await t('save_pattern', { instrument: 'jt90', name: 'KHS' })
await t('add_jt90', { clear: true, bars: 4, kick: everyBar(4, KICK), ch: everyBar(4, OFF), snare: everyBar(4, BACK), oh: [16 + 14, 48 + 14],
  midtom: [48 + 10, 48 + 11], lowtom: [48 + 13, 48 + 14] })
await t('save_pattern', { instrument: 'jt90', name: 'FILL' })
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: OFF })
await t('save_pattern', { instrument: 'jt90', name: 'THROW9' })
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: OFF, hitom: [1, 2, 3], midtom: [5, 6, 7], lowtom: [9, 10, 11, 13, 14, 15], oh: [14] })
await t('save_pattern', { instrument: 'jt90', name: 'ROLL' })
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, OFF), snare: everyBar(2, BACK), oh: [14, 16 + 14],
  hitom: [16 + 12], midtom: [16 + 13], lowtom: [16 + 14, 16 + 15] })
await t('save_pattern', { instrument: 'jt90', name: 'END' })

// ---------------------------------------------------------------------------
// 2. The sub — Bart's sub patch (triangle + sine, cutoff 120), law 2 at drive 40,
//    as in Polder; +5 cents so E1 = 41.33 Hz = 20 cycles a beat at 124.
// ---------------------------------------------------------------------------
//  bar 1:  E . . . | . . E . | . . G . | E . . .      bar 2:  E . . . | . . E . | . . D2 . | B1 . G1 .
const riff = {}
hold(riff, 0, 'E1', 3, true)
hold(riff, 6, 'E1', 2)
hold(riff, 10, 'G1', 2)
hold(riff, 12, 'E1', 3)
hold(riff, 16, 'E1', 3, true)
hold(riff, 22, 'E1', 2)
hold(riff, 26, 'D2', 2)
hold(riff, 28, 'B1', 2)
hold(riff, 30, 'G1', 2)
await t('tweak_multi', { params: {
  'jb202.osc1Waveform': 'triangle', 'jb202.osc2Waveform': 'sine', 'jb202.osc1Level': 55, 'jb202.osc2Level': 100,
  'jb202.osc1Octave': 0, 'jb202.osc2Octave': 0, 'jb202.osc1Detune': 5, 'jb202.osc2Detune': 5,
  'jb202.filterCutoff': 120, 'jb202.filterResonance': 0, 'jb202.filterEnvAmount': 60, 'jb202.filterDecay': 47,
  'jb202.ampAttack': 0, 'jb202.ampDecay': 72, 'jb202.ampSustain': 60, 'jb202.ampRelease': 15,
  'jb202.drive': Number(process.env.SUB_DRIVE ?? 40),
} })
await t('tweak', { path: 'jb202.level', value: Number(process.env.SUB_DB ?? -9) })
await t('add_sidechain', { target: 'jb202', trigger: 'kick', amount: 0.5 })
await t('add_jb202', { instrument: 'jb202', pattern: seq(riff, 2) })
await t('save_pattern', { instrument: 'jb202', name: 'RIFF' })

// ---------------------------------------------------------------------------
// 3. The bleep — JT10, NEW PATCH (flagged): a square through a closed filter
//    with no resonance and no envelope, a short blip. Bart's JT10 delay and
//    room from Minimal 130 on it, verbatim.
// ---------------------------------------------------------------------------
await t('tweak_multi', { params: {
  'jt10.sawLevel': 0, 'jt10.pulseLevel': 100, 'jt10.pulseWidth': 50, 'jt10.subLevel': 0, 'jt10.subMode': 0,
  'jt10.cutoff': Number(process.env.BLIP_CUTOFF ?? 1500), 'jt10.resonance': 0, 'jt10.envMod': 0, 'jt10.keyTrack': 50,
  'jt10.attack': 0, 'jt10.decay': Number(process.env.BLIP_DECAY ?? 30), 'jt10.sustain': 0, 'jt10.release': Number(process.env.BLIP_RELEASE ?? 20),
  'jt10.lfoToPitch': 0, 'jt10.lfoToFilter': 0, 'jt10.lfoToPW': 0, 'jt10.glideTime': 0.05,
} })
await t('tweak', { path: 'jt10.level', value: Number(process.env.BLIP_DB ?? -4) })
await t('add_effect', { target: 'jt10', effect: 'delay', mode: 'pingpong', sync: 'dotted8th', feedback: 52, mix: Number(process.env.BLIP_MIX ?? 42), lowcut: 300, highcut: 6500 })
await t('add_effect', { target: 'jt10', effect: 'reverb', decay: 2.2, mix: 16, lowcut: 260, damping: 60, predelay: 20, size: 55 })

// HOOK (2 bars): E5 E5 B4 on 0 3 6 — the delay grid — then nothing until bar 2's
// lift, D5 on the "a" of 3 and G5 on the "and" of 4, into the repeat.
// THROW (2 bars): one accented E5 on the 1, then only the echoes.
// HOOK2 (2 bars): the hook with the low "boop" (E4) answering on the 4 of bar 1
// and, in bar 2, the octave stutter — E6 on four 16ths — before the roll.
const HOOK = seq({ 0: 'E5!', 3: 'E5', 6: 'B4', 16: 'E5!', 19: 'E5', 22: 'B4', 27: 'D5', 30: 'G5' }, 2, 'E5')
const THROW = seq({ 0: 'E5!' }, 2, 'E5')
const HOOK2 = seq({ 0: 'E5!', 3: 'E5', 6: 'B4', 12: 'E4', 16: 'E5!', 19: 'E5', 22: 'B4', 24: 'E6', 25: 'E6', 26: 'E6', 27: 'E6', 30: 'G5' }, 2, 'E5')
for (const [name, pat] of [['HOOK', HOOK], ['THROW', THROW], ['HOOK2', HOOK2]]) {
  await t('add_jt10', { pattern: pat, bars: 2 })
  await t('save_pattern', { instrument: 'jt10', name })
}

// ---------------------------------------------------------------------------
// 4. Arrangement — 16 bars
// ---------------------------------------------------------------------------
const plan = [
  { name: 'Cold: bleep + sub', bars: 2, patterns: { jt10: 'HOOK', jb202: 'RIFF' } },
  { name: 'Kick + hats', bars: 2, patterns: { jt90: 'KH', jt10: 'HOOK', jb202: 'RIFF' } },
  { name: 'Backbeat; fill', bars: 4, patterns: { jt90: 'FILL', jt10: 'HOOK', jb202: 'RIFF' } },
  { name: 'Throw', bars: 1, patterns: { jt90: 'THROW9', jt10: 'THROW', jb202: 'RIFF' } },
  { name: 'Tom roll', bars: 1, patterns: { jt90: 'ROLL', jb202: 'RIFF' } },
  { name: 'Hook back, full', bars: 4, patterns: { jt90: 'KHS', jt10: 'HOOK', jb202: 'RIFF' } },
  { name: 'Hook 2, stutter, roll', bars: 2, patterns: { jt90: 'END', jt10: 'HOOK2', jb202: 'RIFF' } },
]
await t('set_arrangement', { sections: plan.map((s) => ({ bars: s.bars, ...s.patterns })) })
const BARS = plan.reduce((a, s) => a + s.bars, 0)
if (BARS !== 16) throw new Error(`arrangement is ${BARS} bars`)

await t('load_pattern', { instrument: 'jt90', name: 'KHS' })
await t('load_pattern', { instrument: 'jb202', name: 'RIFF' })
await t('load_pattern', { instrument: 'jt10', name: 'HOOK' })

// ---------------------------------------------------------------------------
// 5. Render, gain-stage, measure
// ---------------------------------------------------------------------------
const NODES = ['jt90', 'jb202', 'jt10']
if (process.env.SOLO) {
  const keep = process.env.SOLO.split(',')
  for (const id of NODES) if (!keep.includes(id)) await t('mute_track', { track: id, mute: true })
}
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
if (Math.abs(delta) > 0.05 && !process.env.SOLO) {
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
if (r.stems.jt10 && r.stems.jt10.crestDb < 7) throw new Error(`bleep crest ${r.stems.jt10.crestDb.toFixed(1)} dB — the line is squashed`)
const metrics = formatRows(r.rows)
const table = r.rows.map((row, i) => `${row.bars.padEnd(9)} ${plan[i].name}`).join('\n')
const levels = NODES.map((id) => `${id} ${session.getNode(id).getLevel().toFixed(1)} dB`).join(', ')
writeFileSync(`${OUT}/metrics.txt`, `${r.message}\nstems: ${stems}\npeak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(2)} dB, ${r.seconds.toFixed(1)} s\nlevels: ${levels}\n\n${metrics}\n\nsections:\n${table}\n`)
console.log(metrics)
console.log(table)
console.log(`levels: ${levels}`)

// Checks: nothing silent that should play, the top end stays modest, the
// throw bar is quieter than the hook bars around it, and the sub carries the low band.
const bad = []
r.rows.forEach((row, i) => {
  if (row.silence > 0.02) bad.push(`${plan[i].name}: ${(row.silence * 100).toFixed(0)} % silence`)
  if (row.high > 0.04) bad.push(`${plan[i].name}: high band ${(row.high * 100).toFixed(1)} % (> 4 %)`)
})
if (!process.env.SOLO) {
  if (!(r.rows[3].rmsDb < r.rows[2].rmsDb)) bad.push(`throw (${r.rows[3].rmsDb.toFixed(1)} dB) is not quieter than the bars before it (${r.rows[2].rmsDb.toFixed(1)} dB)`)
  if (r.rows[0].low < 0.3) bad.push(`cold open low band ${(r.rows[0].low * 100).toFixed(0)} % — the sub is not carrying it`)
}
console.log(bad.length ? `CHECKS: ${bad.length} flags\n  ${bad.join('\n  ')}` : 'CHECKS: clean')

// Round trip: what the app will load must render the same sketch.
const saved = serializeSession(session)
const again = deserializeSession(JSON.parse(JSON.stringify(saved)))
const r2 = await renderSessionToBuffer(again, BARS)
const same = r2.message === r.message && r2.bars === r.bars && Math.abs(r2.peak - r.peak) < 1e-6
console.log(`ROUND TRIP: ${same ? 'ok' : 'MISMATCH'} — ${r2.message} (peak ${r2.peak.toFixed(3)})`)
if (!same) process.exitCode = 1

// ---------------------------------------------------------------------------
// 6. track.json — what the app saves as a track
// ---------------------------------------------------------------------------
const brief = 'Tinsley: a 30-second sketch of Sheffield bleep techno at 124 in E minor — early Warp (Forgemasters, Sweet Exorcist, LFO). A pure-tone bleep hook on the JT10 (square wave, closed filter, no resonance, a 100 ms blip) in a dotted-8th delay, a sub bass riff deep enough to feel before you hear it, a kick, a dry backbeat on 2 and 4, offbeat hats, 808-style tom rolls for fills. No 303, no chords. Open cold on the bleep and the sub, drop the kick at bar 3, throw the bleep into its echoes at bar 9, roll the toms, bring it back, and end on an octave stutter.'
const description = [
  'Bars 1–2 are the bleep and the sub alone; the kick and the offbeat hats come in at 3; the snare on 2 and 4 from 5, with a tom fill at the end of 8; bar 9 is the throw — one bleep, then only its echoes over the kick — and bar 10 the tom roll (high, mid, low) under an open hat; the hook returns with the full kit at 11; bars 15–16 add the low E4 answer and the E6 stutter, and the toms roll it out. The echoes and the room ring into the tail.',
  'Patterns: jt90 KH/KHS/FILL/THROW9/ROLL/END, jb202 RIFF (the sub, E1 +5 cents so it sits at 20 cycles a beat), jt10 HOOK/THROW/HOOK2 (its delay and room are the Minimal 130 ones). Loop mode plays the full section. The bleep patch is new — a square through a 1.5 kHz filter, no resonance, no envelope — worth a listen before it goes anywhere.',
].join('\n\n')

writeFileSync(`${OUT}/track.json`, JSON.stringify({
  title: 'Tinsley',
  bpm: BPM,
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
