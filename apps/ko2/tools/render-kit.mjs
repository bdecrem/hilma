#!/usr/bin/env node
// Render a KO II kit of one-shots from Bart's Jambot kit (the Minimal 130
// session: his tuned-down 909, his 202 stabs + sub, the JT10 line, the JT30
// acid patch). One WAV per pad, trimmed, plus kit.json naming each sound.
//
//   node apps/ko2/tools/render-kit.mjs            → apps/ko2/out/kit/
//   OUT=/dir node apps/ko2/tools/render-kit.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HILMA = resolve(HERE, '..', '..', '..')
const JAMBOT = resolve(HILMA, '../vibeceo/jambot')
const BASE = resolve(HILMA, 'scripts/jam/songs/techno-128-base.json')
const OUT = process.env.OUT || resolve(HERE, '..', 'out', 'kit')
mkdirSync(OUT, { recursive: true })

const { deserializeSession } = await import(`${JAMBOT}/core/session.js`)
const { renderSessionToBuffer } = await import(`${JAMBOT}/core/render.js`)
const { audioBufferToWav } = await import(`${JAMBOT}/core/wav.js`)
const { initializeTools, executeTool } = await import(`${JAMBOT}/tools/index.js`)
await initializeTools()

const session = deserializeSession(JSON.parse(readFileSync(BASE, 'utf8')))
session.arrangement = []
async function t(name, input) {
  const r = await executeTool(name, input, session, {})
  const text = typeof r === 'string' ? r : JSON.stringify(r)
  if (/^Error|^No |^Unknown|FAILED/.test(text)) throw new Error(`${name}: ${text}`)
  return text
}

// Minimal 130's kit, verbatim (proven values).
await t('set_bpm', { bpm: 130 })
await t('set_swing', { amount: 0 })
await t('tweak_multi', { params: {
  'jt90.kick.tune': -7, 'jt90.kick.decay': 100, 'jt90.kick.attack': 40, 'jt90.kick.level': -5.5,
  'jt90.ch.level': -33, 'jt90.ch.decay': 39, 'jt90.ch.tone': 100,
  'jt90.oh.level': -19, 'jt90.oh.decay': 55, 'jt90.oh.tone': 20,
  'jt90.rimshot.level': -6, 'jt90.rimshot.tune': -7, 'jt90.rimshot.decay': 12,
  'jt90.lowtom.level': -8, 'jt90.lowtom.tune': -2, 'jt90.lowtom.decay': 70,
  'jt90.midtom.level': -10, 'jt90.midtom.tune': -5, 'jt90.midtom.decay': 55,
  'jt90.ride.level': -22, 'jt90.ride.tune': 2, 'jt90.ride.decay': 60,
  'jt90.clap.level': -6,
} })
await t('tweak', { path: 'jt90.level', value: -0.2 })
await t('tweak', { path: 'jb202.level', value: -10.2 })
await t('tweak', { path: 'jb202-2.level', value: -4.7 })
await t('tweak', { path: 'jt10.level', value: -8.2 })
await t('tweak', { path: 'jb202.filterCutoff', value: 420 })
await t('tweak', { path: 'jb202.osc1Level', value: 70 })
await t('tweak_multi', { params: { 'jt30.bass.waveform': 'sawtooth', 'jt30.bass.cutoff': 300, 'jt30.bass.resonance': 62, 'jt30.bass.envMod': 55, 'jt30.bass.decay': 40, 'jt30.bass.accent': 70, 'jt30.bass.drive': 30 } })
await t('tweak', { path: 'jt30.level', value: -9 })
// JT10 delay + room, as in the song (they are part of the sound).
await t('tweak', { path: 'fx.jt10.delay1.mode', value: 'pingpong' })
await t('tweak', { path: 'fx.jt10.delay1.sync', value: 'dotted8th' })
await t('tweak_effect', { target: 'jt10', effect: 'delay1', feedback: 52, mix: 42, lowcut: 300, highcut: 6500 })
await t('add_effect', { target: 'jt10', effect: 'reverb', decay: 2.2, mix: 16, lowcut: 260, damping: 60, predelay: 20, size: 55 })
await t('add_effect', { target: 'jt90.rimshot', effect: 'delay', mode: 'analog', sync: '16th', feedback: 14, mix: 11, lowcut: 300, highcut: 6000, saturation: 8 })
await t('add_effect', { target: 'jt90.oh', effect: 'reverb', decay: 1.6, mix: 18, lowcut: 300, damping: 65, size: 45 })

const NODES = ['jt90', 'jb202', 'jb202-2', 'jt10', 'jt30', 'jb01', 'jbs', 'jp9000']
async function solo(id) {
  for (const n of NODES) await t('mute_track', { track: n, mute: n !== id })
}
function silentMono(bars = 1) {
  return Array.from({ length: bars * 16 }, () => ({ note: 'A1', gate: false, accent: false, slide: false }))
}
function oneNote(note, accent = false) {
  const p = silentMono(1); p[0] = { note, gate: true, accent, slide: false }; return p
}
function trim(buffer, floorDb = -66) {
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1)
  const floor = Math.pow(10, floorDb / 20)
  let end = 0
  for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) > floor || Math.abs(R[i]) > floor) end = i
  end = Math.min(L.length, end + Math.round(0.02 * buffer.sampleRate))
  const out = { sampleRate: buffer.sampleRate, length: end, numberOfChannels: 2, duration: end / buffer.sampleRate,
    getChannelData: (c) => (c === 0 ? L : R).subarray(0, end) }
  let peak = 0
  for (let i = 0; i < end; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  return { out, peak }
}
const kit = []
async function shot({ name, group, pad, note, root }, program) {
  await program()
  const r = await renderSessionToBuffer(session, 1)
  const { out, peak } = trim(r.buffer)
  if (peak > 0) { const g = Math.pow(10, -3 / 20) / peak; for (const c of [0, 1]) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g } }
  const file = `${name}.wav`
  writeFileSync(resolve(OUT, file), Buffer.from(audioBufferToWav(out)))
  kit.push({ name, file, group, pad, note, root, seconds: +out.duration.toFixed(3), peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1) })
  console.log(`${group}${String(pad).padStart(2, '0')}  ${name.padEnd(14)} ${out.duration.toFixed(2)} s  peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dB`)
}

// Group A: his 909. Pads are the archive pNN numbers (p10 = ".", p11 = "0", p12 = "enter", p07..p09 = 1 2 3, p04..p06 = 4 5 6, p01..p03 = 7 8 9).
await solo('jt90')
const DRUMS = [
  ['kick', 10], ['rimshot', 11], ['snare', 12],
  ['ch', 7], ['oh', 8], ['ride', 9],
  ['lowtom', 4], ['midtom', 5], ['hitom', 6],
  ['clap', 1], ['crash', 2],
]
for (const [voice, pad] of DRUMS) {
  await shot({ name: voice, group: 'A', pad, root: 60 }, async () => {
    await t('add_jt90', { clear: true, bars: 1, [voice]: [0] })
  })
}
// Group B: the sub (jb202-2) on the low pads, his 202 stabs above. Root = the note rendered, so pitch on the KO II tracks.
const NOTE_MIDI = (n) => { const m = n.match(/^([A-G])(#?)(-?\d)$/); const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0); return 12 * (Number(m[3]) + 1) + base }
await t('set_bpm', { bpm: 65 })
await solo('jb202-2')
for (const [note, pad] of [['A1', 10], ['G1', 11], ['C2', 12]]) {
  await shot({ name: `sub-${note}`, group: 'B', pad, note, root: NOTE_MIDI(note) }, async () => {
    await t('add_jb202', { instrument: 'jb202-2', pattern: oneNote(note, true) })
  })
}
await solo('jb202')
for (const [note, pad, acc] of [['A1', 7, false], ['A1', 8, true], ['C2', 9, false], ['G1', 4, false], ['A2', 5, false], ['D2', 6, false], ['E2', 1, false], ['A1', 2, false], ['A1', 3, false]]) {
  const name = pad === 2 ? 'stab-dim-A1' : pad === 3 ? 'stab-open-A1' : `stab-${note}${acc ? '-acc' : ''}`
  await shot({ name, group: 'B', pad, note, root: NOTE_MIDI(note) }, async () => {
    if (pad === 2) await t('tweak', { path: 'jb202.filterCutoff', value: 150 })
    if (pad === 3) await t('tweak', { path: 'jb202.filterCutoff', value: 900 })
    await t('add_jb202', { instrument: 'jb202', pattern: oneNote(note, acc) })
    if (pad === 2 || pad === 3) { await t('tweak', { path: 'jb202.filterCutoff', value: 420 }) }
  })
}
// Group C: the JT10 line's notes, with its delay and room printed in.
await t('set_bpm', { bpm: 130 })
await solo('jt10')
for (const [note, pad, acc] of [['E4', 10, true], ['G4', 11, false], ['A4', 12, false], ['E4', 7, false], ['C5', 8, true], ['B4', 9, false], ['A4', 4, true], ['D5', 5, false], ['G4', 6, true]]) {
  await shot({ name: `lead-${note}${acc ? '-acc' : ''}`, group: 'C', pad, note, root: NOTE_MIDI(note) }, async () => {
    await t('add_jt10', { pattern: oneNote(note, acc), bars: 1 })
  })
}
// Group D: the JT30 acid patch at three filter openings × four notes.
await t('set_bpm', { bpm: 65 })
await solo('jt30')
const ACID = [['A1', 10, 160], ['C2', 11, 160], ['G1', 12, 160], ['A1', 7, 320], ['C2', 8, 320], ['E2', 9, 320], ['A1', 4, 620], ['C2', 5, 620], ['D2', 6, 620], ['A1', 1, 620], ['G1', 2, 320], ['A2', 3, 160]]
for (const [note, pad, cutoff] of ACID) {
  const acc = pad === 1
  await shot({ name: `acid-${note}-${cutoff}${acc ? '-acc' : ''}`, group: 'D', pad, note, root: NOTE_MIDI(note) }, async () => {
    await t('tweak', { path: 'jt30.bass.cutoff', value: cutoff })
    await t('add_jt30', { pattern: oneNote(note, acc), bars: 1 })
  })
}
writeFileSync(resolve(OUT, 'kit.json'), JSON.stringify({ bpm: 130, sampleRate: session.clock.sampleRate || 44100, sounds: kit }, null, 2))
console.log(`${kit.length} sounds → ${OUT}`)
