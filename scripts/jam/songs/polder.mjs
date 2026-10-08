#!/usr/bin/env node
// Polder — dub techno at 122 in A minor, 128 bars (4:12). The producer who
// made the dry Overclock EP goes wet: the same restraint, now with echoes.
//
// The school is Basic Channel / Maurizio / Rhythm & Sound: a soft deep kick,
// one offbeat hat, a chord stab that lives in a dark feedback delay and a long
// reverb, a melodic DUB BASS RIFF in the sub (roots phrasing: two bars, rests,
// the drop on bar two's downbeat, the E-D-C-A turnaround), a breathing drone,
// a rim through its own delay, and a sparse bell on a three-bar cycle. No 303,
// no acid. Tension comes from the dub mixer's moves: stabs "thrown" into the
// delay so only their echoes remain, the floor leaving under the open chord.
//
// Tuning (from library.json's phase_locked_techno): the sub is tuned 3 cents
// flat — 54.9 Hz is exactly 27 cycles per beat at 122, so its phase at every
// kick is the same — and the chord (E3 G3 C4 over the A: Am7 in first
// inversion) is in just intonation to that root (+0, +14, +12 cents).
//
// Voices: jt90 (Bart's kit), jb202 = the sub riff (his sub patch, law 2),
// chord-lo / chord-mid / chord-hi = three JB202 instances (one note each),
// bell = a fourth, jt10 = the drone. Sends: 'dub' (analog delay, dotted 8th,
// feedback 58, high cut 2.4 kHz, saturation) and 'space' (7 s reverb).
//
// Shape (1-indexed bars):
//   1   drone + stab throws in the space      73  the floor goes: no kick, no sub — chord, drone, bell, rim, hats
//   9   + kick · 17 + sub riff + hats          81  kick and sub back, chord fully open (the peak)
//   25  + rim lattice · 33 + bell              97  dub mix: throws, chord closing
//   49  throws (the first dub drop)           113 sub out · 121 kick out; drone fades
//
//   node scripts/jam/songs/polder.mjs        (OUT=…, AUDITION=n plays one section, SOLO=<id> a stem)

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HILMA = resolve(HERE, '..', '..', '..')
const JAMBOT = resolve(HILMA, '../vibeceo/jambot')
const OUT = process.env.OUT || resolve(HERE, 'out', 'polder')
mkdirSync(OUT, { recursive: true })

const { createSession, deserializeSession, serializeSession } = await import(`${JAMBOT}/core/session.js`)
const { renderSessionToBuffer } = await import(`${JAMBOT}/core/render.js`)
const { audioBufferToWav } = await import(`${JAMBOT}/core/wav.js`)
const { initializeTools, executeTool } = await import(`${JAMBOT}/tools/index.js`)
const { readWav, analyzeWav, formatRows } = await import(`${HILMA}/scripts/jam/song-metrics.mjs`)

await initializeTools()
const session = createSession({ bpm: 122 })   // a new session: drive law 2

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
const expRamp = (n, a, b) => Array.from({ length: n }, (_, i) => Math.round(a * Math.pow(b / a, i / (n - 1))))

/** Melodic pattern from { stepIndex: 'A1' | 'A1!' | 'A1~' } over `bars`; a '~' step holds (legato) from the step before. */
function seq(spec, bars = 1, rest = 'A1') {
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
const held = (note, bars) => Array.from({ length: bars * 16 }, (_, i) => ({ note, gate: true, accent: false, slide: i > 0 }))

// ---------------------------------------------------------------------------
// 1. Tempo, instances, sends
// ---------------------------------------------------------------------------
await t('set_bpm', { bpm: 122 })
await t('set_swing', { amount: 0 })
for (const id of ['chord-lo', 'chord-mid', 'chord-hi', 'bell']) await t('add_instrument', { type: 'jb202', id })

// The dub delay: a dotted 8th, darkening on every repeat (the filters sit in
// the feedback path), a little saturation. The space: a long dark room.
await t('add_send', { id: 'dub', effect: 'delay', mode: 'analog', sync: 'dotted8th', feedback: 58, lowcut: 150, highcut: 2400, saturation: 25, level: 0.9 })
await t('add_send', { id: 'space', effect: 'reverb', decay: 7, damping: 65, predelay: 20, size: 75, lowcut: 180, highcut: 6000, level: 0.6 })

// ---------------------------------------------------------------------------
// 2. Drums — Bart's kit; the rim through its own dotted-8th delay
// ---------------------------------------------------------------------------
await t('tweak_multi', { params: {
  'jt90.kick.tune': -6, 'jt90.kick.decay': 90, 'jt90.kick.attack': 40, 'jt90.kick.level': -5.5,
  'jt90.ch.level': Number(process.env.HAT_DB ?? -18), 'jt90.ch.decay': 39, 'jt90.ch.tone': 100,
  'jt90.oh.level': -24, 'jt90.oh.decay': 45, 'jt90.oh.tone': 15,
  'jt90.rimshot.level': Number(process.env.RIM_DB ?? -9), 'jt90.rimshot.tune': -5, 'jt90.rimshot.decay': 14,
  'jt90.clap.level': -60,
} })
await t('tweak', { path: 'jt90.level', value: -0.2 })
await t('add_effect', { target: 'jt90.rimshot', effect: 'delay', mode: 'analog', sync: 'dotted8th', feedback: 45, mix: 38, lowcut: 300, highcut: 3000, saturation: 12 })
await t('add_effect', { target: 'jt90.oh', effect: 'reverb', decay: 1.6, mix: 18, lowcut: 300, damping: 65, size: 45 })

const KICK = [0, 4, 8, 12], OFF = [2, 6, 10, 14]
await t('add_jt90', { clear: true, bars: 1, kick: KICK })
await t('save_pattern', { instrument: 'jt90', name: 'K' })
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: OFF })
await t('save_pattern', { instrument: 'jt90', name: 'KH' })
// The lattice: one rim on the "a" of 2, then two in the second bar, each
// cascading through the dotted-8th delay against the 4/4.
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, OFF), rimshot: [7, 16 + 3, 16 + 13] })
await t('save_pattern', { instrument: 'jt90', name: 'KHR' })
await t('add_jt90', { clear: true, bars: 2, kick: everyBar(2, KICK), ch: everyBar(2, OFF), rimshot: [7, 16 + 3, 16 + 13], oh: [16 + 14] })
await t('save_pattern', { instrument: 'jt90', name: 'KHRO' })
await t('add_jt90', { clear: true, bars: 2, ch: everyBar(2, OFF), rimshot: [7, 16 + 3, 16 + 13] })
await t('save_pattern', { instrument: 'jt90', name: 'HR' })      // the floor out: hats and rim, no kick
await t('add_jt90', { clear: true, bars: 1, kick: KICK, ch: OFF })
await t('save_pattern', { instrument: 'jt90', name: 'KH2' })

// ---------------------------------------------------------------------------
// 3. The sub riff — a dub bass line, two bars, A minor pentatonic
// ---------------------------------------------------------------------------
//  bar 1:  A . . . | . . A . | . . C . | A . . G       bar 2:  . . A . | . . E . | D . C . | A . . .
// Root-heavy, the "and" placements of a roots line, beat 1 of bar 2 left empty
// (the drop), and the E-D-C-A walk down into the repeat.
const riff = {}
hold(riff, 0, 'A1', 3, true)
hold(riff, 6, 'A1', 2)
hold(riff, 10, 'C2', 2)
hold(riff, 12, 'A1', 3)
hold(riff, 15, 'G1', 1)
hold(riff, 18, 'A1', 2, true)
hold(riff, 22, 'E2', 2)
hold(riff, 24, 'D2', 2)
hold(riff, 26, 'C2', 2)
hold(riff, 28, 'A1', 4)
// Bart's sub patch (triangle + sine, cutoff 120), on law 2 at drive 40; both
// oscillators 3 cents flat: A1 = 54.9 Hz = 27 cycles a beat at 122.
await t('tweak_multi', { params: {
  'jb202.osc1Waveform': 'triangle', 'jb202.osc2Waveform': 'sine', 'jb202.osc1Level': 55, 'jb202.osc2Level': 100,
  'jb202.osc1Octave': 0, 'jb202.osc2Octave': 0, 'jb202.osc1Detune': -3, 'jb202.osc2Detune': -3,
  'jb202.filterCutoff': 120, 'jb202.filterResonance': 0, 'jb202.filterEnvAmount': 60, 'jb202.filterDecay': 47,
  'jb202.ampAttack': 0, 'jb202.ampDecay': 72, 'jb202.ampSustain': 60, 'jb202.ampRelease': 15,
  'jb202.drive': Number(process.env.SUB_DRIVE ?? 40),
} })
await t('tweak', { path: 'jb202.level', value: Number(process.env.SUB_DB ?? -9) })
await t('add_sidechain', { target: 'jb202', trigger: 'kick', amount: 0.5 })
await t('add_jb202', { instrument: 'jb202', pattern: seq(riff, 2) })
await t('save_pattern', { instrument: 'jb202', name: 'RIFF' })

// ---------------------------------------------------------------------------
// 4. The chord — three instances, one note each, just intonation over the sub
// ---------------------------------------------------------------------------
// E3 G3 C4 over A = Am7, first inversion. In just intonation to 54.9 Hz:
// E = 3/1 → 164.7 (ET 164.81, −1 c), G = 18/5 → 197.6 (ET 196.00, +14 c),
// C = 24/5 → 263.5 (ET 261.63, +12 c). NEW PATCH, flagged for a listen: a saw
// and a square under a lowpass at 320–900 Hz, the envelope snapping it open.
const CHORD = [['chord-lo', 'E3', -1], ['chord-mid', 'G3', 14], ['chord-hi', 'C4', 12]]
for (const [id, , cents] of CHORD) {
  await t('tweak_multi', { params: {
    [`${id}.osc1Waveform`]: 'sawtooth', [`${id}.osc2Waveform`]: 'square', [`${id}.osc1Level`]: 70, [`${id}.osc2Level`]: 45,
    [`${id}.osc1Octave`]: 0, [`${id}.osc2Octave`]: 0, [`${id}.osc1Detune`]: cents, [`${id}.osc2Detune`]: cents,
    [`${id}.filterCutoff`]: 320, [`${id}.filterResonance`]: 22, [`${id}.filterEnvAmount`]: 40,
    [`${id}.filterAttack`]: 0, [`${id}.filterDecay`]: 30, [`${id}.filterSustain`]: 10, [`${id}.filterRelease`]: 25,
    [`${id}.ampAttack`]: 0, [`${id}.ampDecay`]: 28, [`${id}.ampSustain`]: 0, [`${id}.ampRelease`]: 22,
    [`${id}.drive`]: Number(process.env.CHORD_DRIVE ?? 18),
  } })
  await t('tweak', { path: `${id}.level`, value: Number(process.env.CHORD_DB ?? -7) })
  await t('add_sidechain', { target: id, trigger: 'kick', amount: 0.3 })
  await t('route', { track: id, send: 'dub', level: 0.55 })
  await t('route', { track: id, send: 'space', level: 0.25 })
}
// The stab rhythms (steps are 0-indexed). SKANK: the "and" of 1, 2 and 3 —
// the dotted-8th echoes land on 5 8 11 14 / 9 12 15 / 13 16 and fill the rest.
// HALF: the "and" of 1 and 3. THROW: one hit every two bars; the delay is
// the instrument for the other 31 steps.
const STAB = {
  SKANK: (note) => seq({ 2: note + '!', 6: note, 10: note }),
  HALF: (note) => seq({ 2: note + '!', 10: note }),
  THROW: (note) => seq({ 2: note + '!' }, 2),
}
// Per 8-bar block, one saved pattern per instance carrying that block's slice
// of the filter opening: `CUT[b]` = [start Hz, end Hz] for the block at bar b.
const CUT = {
  0: [320, 320], 8: [320, 360], 16: [360, 420], 24: [420, 500], 32: [500, 580], 40: [580, 660], 48: [660, 660],
  56: [660, 760], 64: [760, 860], 72: [860, 900], 80: [900, 900], 88: [900, 820], 96: [820, 650], 104: [650, 500],
  112: [500, 380], 120: [380, 320],
}
const STABS = {
  0: 'THROW', 8: 'HALF', 16: 'SKANK', 24: 'SKANK', 32: 'SKANK', 40: 'SKANK', 48: 'THROW', 56: 'SKANK', 64: 'SKANK',
  72: 'SKANK', 80: 'SKANK', 88: 'SKANK', 96: 'HALF', 104: 'THROW', 112: 'THROW', 120: 'THROW',
}
for (const [b, [a, z]] of Object.entries(CUT)) {
  const start = Number(b), kind = STABS[start]
  for (const [id, note] of CHORD) {
    const pat = STAB[kind](note)
    await t('add_jb202', { instrument: id, pattern: pat, bars: pat.length / 16 })
    await t('automate', { path: `${id}.filterCutoff`, values: expRamp(pat.length, a, z) })
    await t('save_pattern', { instrument: id, name: `S${start + 1}` })
  }
}

// ---------------------------------------------------------------------------
// 5. The bell — a fourth JB202, a plink on a three-bar cycle, in the delay
// ---------------------------------------------------------------------------
await t('tweak_multi', { params: {
  'bell.osc1Waveform': 'triangle', 'bell.osc2Waveform': 'sine', 'bell.osc1Level': 60, 'bell.osc2Level': 40,
  'bell.osc1Octave': 0, 'bell.osc2Octave': 12, 'bell.osc1Detune': 0, 'bell.osc2Detune': 0,
  'bell.filterCutoff': 1800, 'bell.filterResonance': 10, 'bell.filterEnvAmount': 30, 'bell.filterDecay': 20,
  'bell.ampAttack': 0, 'bell.ampDecay': 35, 'bell.ampSustain': 0, 'bell.ampRelease': 30, 'bell.drive': 0,
} })
await t('tweak', { path: 'bell.level', value: Number(process.env.BELL_DB ?? -16) })
await t('route', { track: 'bell', send: 'dub', level: 0.5 })
await t('route', { track: 'bell', send: 'space', level: 0.4 })
// E4 on the 1 of bar 1, G4 on the "and" of 3 in bar 2, A4 on the 2 of bar 3:
// three notes across three bars, so the figure drifts against the 4/4.
await t('add_jb202', { instrument: 'bell', pattern: seq({ 0: 'E4', 26: 'G4', 36: 'A4' }, 3, 'E4'), bars: 3 })
await t('save_pattern', { instrument: 'bell', name: 'FIG' })

// ---------------------------------------------------------------------------
// 6. The drone — JT10 on A2, a slow filter breath, in the room, pumped by the kick
// ---------------------------------------------------------------------------
// NEW PATCH, flagged for a listen: saw + pulse, low cutoff, an LFO of about
// 0.3 Hz (rate 20 → 0.1·300^0.2) swinging the cutoff ±200 Hz.
await t('tweak_multi', { params: {
  'jt10.sawLevel': 70, 'jt10.pulseLevel': 70, 'jt10.pulseWidth': 40, 'jt10.subLevel': 0,
  'jt10.cutoff': 220, 'jt10.resonance': 12, 'jt10.envMod': 0, 'jt10.keyTrack': 30,
  'jt10.attack': 60, 'jt10.decay': 50, 'jt10.sustain': 100, 'jt10.release': 70,
  'jt10.lfoRate': 20, 'jt10.lfoWaveform': 'triangle', 'jt10.lfoToFilter': 5, 'jt10.lfoToPitch': 0,
} })
await t('tweak', { path: 'jt10.level', value: Number(process.env.PAD_DB ?? -10) })
await t('add_sidechain', { target: 'jt10', trigger: 'kick', amount: 0.35 })
await t('route', { track: 'jt10', send: 'space', level: 0.5 })
await t('add_jt10', { pattern: held('A2', 1) })
await t('save_pattern', { instrument: 'jt10', name: 'PAD' })
await t('add_jt10', { pattern: held('A2', 8) })
await t('automate', { path: 'jt10.level', values: [...Array(48).fill(0), ...linRamp(80, 0, -50)] })   // dB offsets from the fader
await t('save_pattern', { instrument: 'jt10', name: 'PADOUT' })
await t('clear_automation', { path: 'jt10.level' })

// ---------------------------------------------------------------------------
// 7. Arrangement — 128 bars
// ---------------------------------------------------------------------------
const chord = (b) => Object.fromEntries(CHORD.map(([id]) => [id, `S${b + 1}`]))
const plan = [
  { name: 'Space: drone + throws', bars: 8, patterns: { ...chord(0), jt10: 'PAD' } },
  { name: 'Kick', bars: 8, patterns: { jt90: 'K', ...chord(8), jt10: 'PAD' } },
  { name: 'Riff + hats', bars: 8, patterns: { jt90: 'KH', jb202: 'RIFF', ...chord(16), jt10: 'PAD' } },
  { name: 'Rim lattice', bars: 8, patterns: { jt90: 'KHR', jb202: 'RIFF', ...chord(24), jt10: 'PAD' } },
  { name: 'Bell', bars: 8, patterns: { jt90: 'KHR', jb202: 'RIFF', ...chord(32), bell: 'FIG', jt10: 'PAD' } },
  { name: 'Opening', bars: 8, patterns: { jt90: 'KHRO', jb202: 'RIFF', ...chord(40), bell: 'FIG', jt10: 'PAD' } },
  { name: 'Throws (dub drop)', bars: 8, patterns: { jt90: 'KH', jb202: 'RIFF', ...chord(48), bell: 'FIG', jt10: 'PAD' } },
  { name: 'Opening', bars: 8, patterns: { jt90: 'KHRO', jb202: 'RIFF', ...chord(56), bell: 'FIG', jt10: 'PAD' } },
  { name: 'Opening', bars: 8, patterns: { jt90: 'KHRO', jb202: 'RIFF', ...chord(64), bell: 'FIG', jt10: 'PAD' } },
  { name: 'Floor out', bars: 8, patterns: { jt90: 'HR', ...chord(72), bell: 'FIG', jt10: 'PAD' } },
  { name: 'Peak: kick + riff back, open', bars: 8, patterns: { jt90: 'KHRO', jb202: 'RIFF', ...chord(80), bell: 'FIG', jt10: 'PAD' } },
  { name: 'Peak', bars: 8, patterns: { jt90: 'KHRO', jb202: 'RIFF', ...chord(88), bell: 'FIG', jt10: 'PAD' } },
  { name: 'Dub mix: half', bars: 8, patterns: { jt90: 'KHR', jb202: 'RIFF', ...chord(96), bell: 'FIG', jt10: 'PAD' } },
  { name: 'Dub mix: throws', bars: 8, patterns: { jt90: 'KHR', jb202: 'RIFF', ...chord(104), jt10: 'PAD' } },
  { name: 'Sub out', bars: 8, patterns: { jt90: 'KH2', ...chord(112), jt10: 'PAD' } },
  { name: 'Kick out, drone fades', bars: 8, patterns: { ...chord(120), jt10: 'PADOUT' } },
]
await t('set_arrangement', { sections: plan.map((s) => ({ bars: s.bars, ...s.patterns })) })
const BARS = plan.reduce((a, s) => a + s.bars, 0)
if (BARS !== 128) throw new Error(`arrangement is ${BARS} bars`)

await t('load_pattern', { instrument: 'jt90', name: 'KHRO' })
await t('load_pattern', { instrument: 'jb202', name: 'RIFF' })
for (const [id] of CHORD) await t('load_pattern', { instrument: id, name: 'S81' })
await t('load_pattern', { instrument: 'bell', name: 'FIG' })
await t('load_pattern', { instrument: 'jt10', name: 'PAD' })

// ---------------------------------------------------------------------------
// 8. Render, gain-stage, measure
// ---------------------------------------------------------------------------
const NODES = ['jt90', 'jb202', 'chord-lo', 'chord-mid', 'chord-hi', 'bell', 'jt10']
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
const metrics = formatRows(r.rows)
const table = r.rows.map((row, i) => `${row.bars.padEnd(9)} ${plan[i].name}`).join('\n')
const levels = NODES.map((id) => `${id} ${session.getNode(id).getLevel().toFixed(1)} dB`).join(', ')
writeFileSync(`${OUT}/metrics.txt`, `${r.message}\nstems: ${stems}\npeak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(2)} dB, ${r.seconds.toFixed(1)} s\nlevels: ${levels}\n\n${metrics}\n\nsections:\n${table}\n`)
console.log(metrics)
console.log(table)
console.log(`levels: ${levels}`)

// Taste checks: no drop-outs while the drums play, nothing bright (dub techno
// lives under 5 kHz), the sub owns the low band whenever the riff plays, and the
// throws leave no silence — the delay must carry the bars between hits.
const bad = []
r.rows.forEach((row, i) => {
  const p = plan[i].patterns
  if (row.silence > 0.02 && p.jt90) bad.push(`${plan[i].name}: ${(row.silence * 100).toFixed(0)} % silence`)
  if (row.high > 0.02) bad.push(`${plan[i].name}: high band ${(row.high * 100).toFixed(1)} % (> 2 %)`)
  if (p.jb202 && row.low < 0.5) bad.push(`${plan[i].name}: low band ${(row.low * 100).toFixed(0)} % (< 50 % with the sub in)`)
  if (i === 0 && row.silence > 0.05) bad.push(`${plan[i].name}: ${(row.silence * 100).toFixed(0)} % silence — the throws' echoes should carry`)
})
const pk = (id) => (r.stems[id] ? r.stems[id].peakDb : -99)
if (pk('chord-lo') < pk('jt90') - 12) bad.push(`chord peaks ${(pk('jt90') - pk('chord-lo')).toFixed(1)} dB under the drums — buried`)
if (pk('jt10') < -26) bad.push(`drone peaks at ${pk('jt10').toFixed(1)} dBFS — inaudible`)
console.log(bad.length ? `CHECKS: ${bad.length} flags\n  ${bad.join('\n  ')}` : 'CHECKS: clean')

// Round trip: what the app will load must render the same song.
const saved = serializeSession(session)
const again = deserializeSession(JSON.parse(JSON.stringify(saved)))
const r2 = await renderSessionToBuffer(again, BARS)
const same = r2.message === r.message && r2.bars === r.bars && Math.abs(r2.peak - r.peak) < 1e-6
console.log(`ROUND TRIP: ${same ? 'ok' : 'MISMATCH'} — ${r2.message.split('. Stems')[0]} (peak ${r2.peak.toFixed(3)})`)
if (!same) process.exitCode = 1

// ---------------------------------------------------------------------------
// 9. track.json — what the app saves as a track
// ---------------------------------------------------------------------------
const brief = 'Something in the dub techno neighborhood, with good taste: no acid, no 303, a different kind of bass line. 122 in A minor. A soft deep kick and one offbeat hat, a melodic dub bass riff in the sub (two bars, roots phrasing, the drop on bar two, an E-D-C-A turnaround), a minor-seventh chord stab living in a dark dotted-eighth delay and a long reverb, a breathing drone, a rim through its own delay, a sparse bell on a three-bar cycle. Basic Channel, Maurizio, Rhythm & Sound. Four minutes, 8-bar moves, tension from the dub mixer — stabs thrown into the delay, the floor leaving under the open chord.'
const description = [
  'The drone and the chord throws open the space; the kick comes at 9, the riff and hats at 17, the rim lattice at 25, the bell at 33. The chord filter opens slowly from 320 to 900 Hz; at 49 the stabs thin to throws for eight bars (the delay carries), then open again; at 73 the kick and the riff leave — chord, drone, bell, rim and hats float — and at 81 they come back under the fully open chord, the peak. From 97 the dub mix: half stabs, then throws, the filter closing; the sub leaves at 113, the kick at 121, and the drone fades.',
  'Tuning: the sub is 3 cents flat (54.9 Hz = 27 cycles a beat at 122, phase-locked to the kick) and the chord E3 G3 C4 is in just intonation over it (+0, +14, +12 cents). Patterns: jt90 K/KH/KHR/KHRO/HR/KH2, jb202 RIFF, chord-lo/mid/hi S1…S121 (one per 8-bar block, each with its slice of the filter), bell FIG, jt10 PAD/PADOUT. Sends: dub (dotted-8th analog delay, feedback 58, high cut 2.4 kHz) and space (7 s reverb). Loop mode plays the peak.',
].join('\n\n')

writeFileSync(`${OUT}/track.json`, JSON.stringify({
  title: 'Polder',
  bpm: 122,
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
