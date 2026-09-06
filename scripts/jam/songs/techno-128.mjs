#!/usr/bin/env node
// Techno 128 — song sketch (final build).
//
// Grows Bart's "techno beat at 128 with a 909 kick" (scripts/jam/songs/
// techno-128-base.json) into a 128-bar / 4:00 DJ sketch using only Jambot
// tool calls — the same calls the chat agent makes — so the result is a real
// Jam track: every pattern, automation lane and effect opens in the web app.
//
// Shape (every structural event on a 16-bar boundary, sections in 8s):
//   1   kick + half sub            (mixable)
//   9   closed hats fade in
//   17  his A stabs rise out of a closed filter for 16 bars, hats creep up, full sub arrives
//   33  DROP 1 — his B section, 7-note JT10 on the dotted-8th ping-pong
//   49  16th ghost hats, back to the A stabs
//   57  filter sinks, dub JT10 takes the melody
//   65  BREAK — kick and sub out; ghost stabs, delay tails, closed hats keep time
//   73  lift — open hats bloom, tom figure, B riff creeps back under a filter
//   81  kick and sub return on his B section (re-drop)
//   89  second rise: cutoff + drive climb into the peak
//   97  PEAK — driven B bass, offbeat open hats, 13-note JT10, JT30 acid answer
//   105 toms join under the peak
//   113 reduction — his B line, dim melody
//   121 his original A drums + half sub, for the next DJ
//
//   node scripts/jam/songs/techno-128.mjs                 # full build + render
//   OUT=/some/dir node scripts/jam/songs/techno-128.mjs   # outputs elsewhere
//   AUDITION=7 node scripts/jam/songs/techno-128.mjs      # render section 7 only
//   BASE16=/path/to/base16.wav …                          # loudness check against his 16-bar loop
//
// Outputs in $OUT (default scripts/jam/songs/out/techno-128, gitignored):
// song.wav, metrics.txt, track.json (title, bpm, bars, session, plan, messages,
// feed), toolcalls.log.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HILMA = resolve(HERE, '../../..')
const JAMBOT = resolve(HILMA, '../vibeceo/jambot')
const BASE = resolve(HERE, 'techno-128-base.json')
const OUT = process.env.OUT || resolve(HERE, 'out', 'techno-128')
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
/** JT90 step objects: hits at `strong` get velocity 1, hits at `soft` get `softVel`. */
function velSteps(len, strong, soft = [], softVel = 0.5) {
  return Array.from({ length: len }, (_, i) => ({ velocity: strong.includes(i) ? 1 : soft.includes(i) ? softVel : 0, accent: false }))
}
const everyBar = (bars, stepsInBar) => Array.from({ length: bars }, (_, b) => stepsInBar.map((s) => b * 16 + s)).flat()
const KICK = [0, 4, 8, 12]
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14]
const OFFBEATS = [2, 6, 10, 14]
// The 909 closed hat chokes the open hat: an open hat rings until the next
// closed-hat step. Ghost 16ths therefore never sit on the step after an open hat.
const ghosts16 = (bars, openAt) => everyBar(bars, [1, 3, 5, 7, 9, 11, 13, 15]).filter((s) => !openAt.includes(s - 1))

// Bart's saved steps — reused verbatim so his lines carry into every variant.
const bassA = session.patterns.jb202.A.pattern   // . A1 A1 . . A1 A1! . . A1 C2~ . . A1 A1! G1~
const bassB = session.patterns.jb202.B.pattern   // A1! . A2 A1 . C2 . D2~ A1! . A2 . G1 A1 . E2~
const leadA = session.patterns.jt10.A.pattern    // 64 steps, 7 notes: E4 G4 A4 E4 C5 B4 A4~

// ---------------------------------------------------------------------------
// 1. Global mix decisions (node levels, effect chains)
// ---------------------------------------------------------------------------
// The saved session had the melodic 202 at -24 dB (his chat set -3; at -24 it
// was inaudible under the sub — read as a slider accident) and the sub at
// +2.5, where it alone peaked -0.4 dBFS and was 83 % of the loop's energy.
// Balance: his loop was sub-driven, so the sub stays the biggest thing in RMS
// with the kick peaking just over it; stabs under the sub; melody a hint.
// These are starting points — every node level is moved by the same delta
// after the first render so the mix peaks at -0.5 dBFS with no master trim.
await t('tweak', { path: 'jt90.level', value: 4 })
await t('tweak', { path: 'jb202.level', value: -6 })
await t('tweak', { path: 'jb202-2.level', value: -0.5 })
await t('tweak', { path: 'jt10.level', value: -4 })

// The saved session lost the delay his chat set on the JT10 (it came back as
// the default analog 375 ms). Restore his settings: dotted-8th ping-pong.
await t('tweak', { path: 'fx.jt10.delay1.mode', value: 'pingpong' })
await t('tweak', { path: 'fx.jt10.delay1.sync', value: 'dotted8th' })
await t('tweak_effect', { target: 'jt10', effect: 'delay1', feedback: 45, mix: 32, lowcut: 300, highcut: 7000 })
// Small rooms on the melody and the open hat only (lowcut >= 260 Hz). Closed
// hats, basses and kick stay dry.
await t('add_effect', { target: 'jt10', effect: 'reverb', decay: 2.2, mix: 16, lowcut: 260, damping: 60, predelay: 20, size: 55 })
await t('add_effect', { target: 'jt90.oh', effect: 'reverb', decay: 1.6, mix: 18, lowcut: 300, damping: 65, size: 45 })

// ---------------------------------------------------------------------------
// 2. JT90 — Bart's kick (tune -7, decay 100, attack 40, voice -5.5 dB) in
//    every pattern. His saved A and B are never overwritten; variants get new
//    names, so his exact loop is one load_pattern away in the app.
// ---------------------------------------------------------------------------
// K: kick only — intro.
await t('load_pattern', { instrument: 'jt90', name: 'A' })
await t('add_jt90', { clear: true, kick: KICK })
await t('save_pattern', { instrument: 'jt90', name: 'K' })

// HIN (8 bars): his A figure with the hats fading in from nothing.
await t('load_pattern', { instrument: 'jt90', name: 'A' })
await t('add_jt90', { bars: 8, clear: true, kick: everyBar(8, KICK), ch: everyBar(8, EIGHTHS), oh: everyBar(8, [14]) })
await t('automate', { path: 'jt90.ch.level', values: linRamp(128, -46, -11) })
await t('automate', { path: 'jt90.oh.level', values: linRamp(128, -40, -10) })
await t('save_pattern', { instrument: 'jt90', name: 'HIN' })
await t('clear_automation', { path: 'jt90' })

// AH: his A steps, hats brought up from -29 dB to where they read.
await t('load_pattern', { instrument: 'jt90', name: 'A' })
await t('tweak_multi', { params: { 'jt90.ch.level': -11, 'jt90.oh.level': -10 } })
await t('save_pattern', { instrument: 'jt90', name: 'AH' })

// AH16 (16 bars): the same, with the hats walking up (-11 -> -6 / -10 -> -5)
// across the first build so the top end grows into the drop with the filter
// and lands on the drop's hat level.
await t('load_pattern', { instrument: 'jt90', name: 'A' })
await t('add_jt90', { bars: 16, clear: true, kick: everyBar(16, KICK), ch: everyBar(16, EIGHTHS), oh: everyBar(16, [14]) })
await t('automate', { path: 'jt90.ch.level', values: linRamp(256, -11, -6) })
await t('automate', { path: 'jt90.oh.level', values: linRamp(256, -10, -5) })
await t('save_pattern', { instrument: 'jt90', name: 'AH16' })
await t('clear_automation', { path: 'jt90' })

// BH (4 bars): his B steps for the drops, hats a notch louder; bar 4 of every
// four the open hat moves to step 10 and a ghost kick lands on the and-of-4 —
// cheap Berlin fills that help a DJ count.
await t('load_pattern', { instrument: 'jt90', name: 'B' })
await t('add_jt90', {
  bars: 4, clear: true,
  kick: velSteps(64, everyBar(4, KICK), [62], 0.4),
  ch: everyBar(4, EIGHTHS),
  oh: [14, 30, 46, 58],
})
await t('tweak_multi', { params: { 'jt90.ch.level': -6, 'jt90.oh.level': -5 } })
await t('save_pattern', { instrument: 'jt90', name: 'BH' })

// C (2 bars): 8ths with offbeat-16th ghosts, a second open hat in bar 2.
await t('load_pattern', { instrument: 'jt90', name: 'A' })
await t('add_jt90', {
  bars: 2, clear: true,
  kick: everyBar(2, KICK),
  ch: velSteps(32, everyBar(2, EIGHTHS), ghosts16(2, [14, 22, 30]), 0.45),
  oh: [14, 22, 30],
})
await t('tweak_multi', { params: { 'jt90.ch.level': -5, 'jt90.oh.level': -5, 'jt90.oh.decay': 58 } })
await t('save_pattern', { instrument: 'jt90', name: 'C' })

// BREAK (1 bar): no kick — closed 8ths and his open hat on 14 keep time.
await t('load_pattern', { instrument: 'jt90', name: 'A' })
await t('add_jt90', { clear: true, ch: EIGHTHS, oh: [14] })
await t('tweak_multi', { params: { 'jt90.ch.level': -9, 'jt90.oh.level': -7 } })
await t('save_pattern', { instrument: 'jt90', name: 'BREAK' })

// BREAK2 (8 bars): still no kick and no closed hats, so the offbeat open hats
// actually ring (nothing chokes them) while they bloom over the 8 bars
// (level -24 -> -4 dB, decay 25 -> 92). Bars 5-8: rimshot on 3 and 11 and the
// mid/hi tom figure tuned to a fifth (midtom -7, hitom -2) answer the riff.
await t('load_pattern', { instrument: 'jt90', name: 'A' })
await t('add_jt90', {
  bars: 8, clear: true,
  oh: everyBar(8, OFFBEATS),
  rimshot: [67, 75, 83, 91, 99, 107, 115, 123],
  midtom: [70, 86, 102, 118],
  hitom: [77, 93, 95, 109, 125, 127],
})
await t('tweak_multi', { params: {
  'jt90.rimshot.level': -16, 'jt90.rimshot.tune': -4, 'jt90.rimshot.decay': 12,
  'jt90.midtom.level': -13, 'jt90.midtom.tune': -7, 'jt90.midtom.decay': 55,
  'jt90.hitom.level': -15, 'jt90.hitom.tune': -2, 'jt90.hitom.decay': 45,
} })
await t('automate', { path: 'jt90.oh.level', values: linRamp(128, -24, -4) })
await t('automate', { path: 'jt90.oh.decay', values: linRamp(128, 25, 92) })
await t('save_pattern', { instrument: 'jt90', name: 'BREAK2' })
await t('clear_automation', { path: 'jt90' })

// D (2 bars, peak): closed hat on the beat with a 16th pickup before each
// offbeat open hat (never after it, so the open hats ring an 8th), a 909
// rimshot figure, and the kick +1.5 dB — tune/decay/attack stay his.
await t('load_pattern', { instrument: 'jt90', name: 'A' })
await t('add_jt90', {
  bars: 2, clear: true,
  kick: everyBar(2, KICK),
  ch: velSteps(32, everyBar(2, KICK), everyBar(2, [1, 5, 9, 13]), 0.6),
  oh: everyBar(2, OFFBEATS),
  rimshot: [3, 11, 19, 27, 30],
})
const PEAK_DRUMS = {
  'jt90.kick.level': -4, 'jt90.ch.level': -4, 'jt90.oh.level': -3, 'jt90.oh.decay': 50,
  'jt90.rimshot.level': -14, 'jt90.rimshot.tune': -7, 'jt90.rimshot.decay': 12,
}
await t('tweak_multi', { params: PEAK_DRUMS })
await t('save_pattern', { instrument: 'jt90', name: 'D' })

// D2 (2 bars): D plus the tom figure from the break.
await t('add_jt90', {
  bars: 2, clear: true,
  kick: everyBar(2, KICK),
  ch: velSteps(32, everyBar(2, KICK), everyBar(2, [1, 5, 9, 13]), 0.6),
  oh: everyBar(2, OFFBEATS),
  rimshot: [3, 11, 19, 27, 30],
  midtom: [6, 22],
  hitom: [13, 29, 31],
})
await t('tweak_multi', { params: {
  ...PEAK_DRUMS,
  'jt90.midtom.level': -13, 'jt90.midtom.tune': -7, 'jt90.midtom.decay': 55,
  'jt90.hitom.level': -15, 'jt90.hitom.tune': -2, 'jt90.hitom.decay': 45,
} })
await t('save_pattern', { instrument: 'jt90', name: 'D2' })

// ---------------------------------------------------------------------------
// 3. jb202-2 (sub) — his one-note A1 pattern is the anchor and never changes.
//    IN: the same held back ~6 dB (osc levels and drive down) for both ends.
//    MID: ~2 dB under his patch for the first build, so the full sub is part
//    of the drop at 33.
// ---------------------------------------------------------------------------
await t('load_pattern', { instrument: 'jb202-2', name: 'A' })
await t('tweak_multi', { params: { 'jb202-2.osc1Level': 22, 'jb202-2.osc2Level': 40, 'jb202-2.drive': 15 } })
await t('save_pattern', { instrument: 'jb202-2', name: 'IN' })
await t('load_pattern', { instrument: 'jb202-2', name: 'A' })
await t('tweak_multi', { params: { 'jb202-2.osc1Level': 45, 'jb202-2.osc2Level': 80, 'jb202-2.drive': 45 } })
await t('save_pattern', { instrument: 'jb202-2', name: 'MID' })
await t('load_pattern', { instrument: 'jb202-2', name: 'A' })

// ---------------------------------------------------------------------------
// 4. JB202 (melodic bass) — his A and B untouched; motion variants around them.
//    Automation indexes step % pattern length, so a 16-bar sweep is his 16
//    steps repeated 16x with a 256-value lane.
// ---------------------------------------------------------------------------
// RISE (16 bars of A): filter climbs from 90 Hz (fundamental only) to his 420 Hz
// while the oscillator level ramps up to his 70, so the entry is an arrival.
await t('load_pattern', { instrument: 'jb202', name: 'A' })
await t('add_jb202', { pattern: repeat(bassA, 16), bars: 16 })
await t('automate', { path: 'jb202.filterCutoff', values: expRamp(256, 90, 420) })
await t('automate', { path: 'jb202.filterResonance', values: linRamp(256, 28, 40) })
await t('automate', { path: 'jb202.osc1Level', values: linRamp(256, 40, 70) })
await t('save_pattern', { instrument: 'jb202', name: 'RISE' })
await t('clear_automation', { path: 'jb202' })

// A8 / B8 (8 bars): his lines with one note changing in bar 8 of every eight —
// A: the C2 slide lifts to D2 and the G1 turnaround drops to F1; B: G1 -> F1.
const bassA8 = repeat(bassA, 8)
bassA8[7 * 16 + 10].note = 'D2'
bassA8[7 * 16 + 15].note = 'F1'
await t('load_pattern', { instrument: 'jb202', name: 'A' })
await t('add_jb202', { pattern: bassA8, bars: 8 })
await t('save_pattern', { instrument: 'jb202', name: 'A8' })
const bassB8 = repeat(bassB, 8)
bassB8[7 * 16 + 12].note = 'F1'
await t('load_pattern', { instrument: 'jb202', name: 'B' })
await t('add_jb202', { pattern: bassB8, bars: 8 })
await t('save_pattern', { instrument: 'jb202', name: 'B8' })

// FALL (8 bars of A): filter sinks under water into the break.
await t('load_pattern', { instrument: 'jb202', name: 'A' })
await t('add_jb202', { pattern: repeat(bassA, 8), bars: 8 })
await t('automate', { path: 'jb202.filterCutoff', values: expRamp(128, 420, 80) })
await t('automate', { path: 'jb202.filterResonance', values: linRamp(128, 28, 50) })
await t('save_pattern', { instrument: 'jb202', name: 'FALL' })
await t('clear_automation', { path: 'jb202' })

// GHOST (breakdown): his A stabs an octave up (A2 / C3 / G2, inside the 202's
// C1-C3 range) through a hollow resonant filter, little drive. Transposed in
// the notes rather than with the octave params (see PLAN.md, engine notes).
// Louder than his stab patch (osc 85) because it carries the break almost alone.
const up12 = (s) => (s.gate ? { ...s, note: s.note.replace(/(\d)$/, (d) => String(Number(d) + 1)) } : { ...s })
await t('load_pattern', { instrument: 'jb202', name: 'A' })
await t('add_jb202', { pattern: bassA.map(up12) })
await t('tweak_multi', { params: { 'jb202.filterCutoff': 1600, 'jb202.filterResonance': 58, 'jb202.drive': 15, 'jb202.ampRelease': 32, 'jb202.osc1Level': 85 } })
await t('save_pattern', { instrument: 'jb202', name: 'GHOST' })

// FILT (8 bars of B): the riff creeps back under a closed filter, 130 -> 420 Hz,
// and swells in level, so it lands on his cutoff exactly as the kick returns.
await t('load_pattern', { instrument: 'jb202', name: 'B' })
await t('add_jb202', { pattern: repeat(bassB, 8), bars: 8 })
await t('tweak_multi', { params: { 'jb202.drive': 15, 'jb202.filterResonance': 42, 'jb202.ampRelease': 30 } })
await t('automate', { path: 'jb202.filterCutoff', values: expRamp(128, 130, 420) })
await t('automate', { path: 'jb202.osc1Level', values: linRamp(128, 55, 100) })
await t('save_pattern', { instrument: 'jb202', name: 'FILT' })
await t('clear_automation', { path: 'jb202' })

// RISE2 (8 bars of B): from his patch into the peak — cutoff 420 -> 700 Hz,
// drive 25 -> 52.
await t('load_pattern', { instrument: 'jb202', name: 'B' })
await t('add_jb202', { pattern: repeat(bassB, 8), bars: 8 })
await t('automate', { path: 'jb202.filterCutoff', values: expRamp(128, 420, 700) })
await t('automate', { path: 'jb202.drive', values: linRamp(128, 25, 52) })
await t('save_pattern', { instrument: 'jb202', name: 'RISE2' })
await t('clear_automation', { path: 'jb202' })

// DRIVE (peak): his B line on the driven patch the rise lands on.
await t('load_pattern', { instrument: 'jb202', name: 'B' })
await t('tweak_multi', { params: { 'jb202.filterCutoff': 700, 'jb202.drive': 52, 'jb202.filterResonance': 30 } })
await t('save_pattern', { instrument: 'jb202', name: 'DRIVE' })

// ---------------------------------------------------------------------------
// 5. JT10 — his 7 notes, a fuller 13-note phrase for the peak, a dim restatement
// ---------------------------------------------------------------------------
const leadFull = clone(leadA)
for (const [i, tok] of Object.entries({ 12: 'D5', 26: 'C5', 30: 'G4~', 42: 'D5', 46: 'B4', 50: 'G4', 58: 'C5' })) {
  leadFull[Number(i)] = { note: tok.replace(/[!~]/g, ''), gate: true, accent: tok.includes('!'), slide: tok.includes('~') }
}
await t('load_pattern', { instrument: 'jt10', name: 'A' })
await t('add_jt10', { pattern: leadFull, bars: 4 })
await t('tweak_multi', { params: { 'jt10.cutoff': 3200, 'jt10.decay': 50 } })
await t('save_pattern', { instrument: 'jt10', name: 'FULL' })

await t('load_pattern', { instrument: 'jt10', name: 'A' })
await t('tweak_multi', { params: { 'jt10.cutoff': 1500, 'jt10.resonance': 20 } })
await t('save_pattern', { instrument: 'jt10', name: 'DIM' })
await t('load_pattern', { instrument: 'jt10', name: 'A' })

// ---------------------------------------------------------------------------
// 6. jt10-2 — dub copy of the melody: the delay that swells into the break.
//    Effect chains are per instrument and fx params can't be automated, so the
//    swell is a second JT10 with his 7 notes into a long ping-pong + reverb.
//    Feedback 60 / decay 3.2 s keep the tail >= 26 dB under the mix at the
//    2 s point where song mode cuts a section's tail (measured).
// ---------------------------------------------------------------------------
await t('add_instrument', { type: 'jt10' }) // -> jt10-2
await t('add_jt10', { instrument: 'jt10-2', pattern: clone(leadA), bars: 4 })
await t('tweak_multi', { params: {
  'jt10-2.sawLevel': 55, 'jt10-2.pulseLevel': 50, 'jt10-2.pulseWidth': 35, 'jt10-2.subLevel': 0, 'jt10-2.subMode': 0,
  'jt10-2.cutoff': 2100, 'jt10-2.resonance': 30, 'jt10-2.envMod': 45, 'jt10-2.keyTrack': 50,
  'jt10-2.attack': 2, 'jt10-2.decay': 45, 'jt10-2.sustain': 20, 'jt10-2.release': 45, 'jt10-2.glideTime': 0.25,
} })
await t('tweak', { path: 'jt10-2.level', value: 0 })
await t('add_sidechain', { target: 'jt10-2', trigger: 'kick', amount: 0.4 })
await t('add_effect', { target: 'jt10-2', effect: 'delay', mode: 'pingpong', sync: 'dotted8th', feedback: 60, mix: 55, lowcut: 300, highcut: 5500 })
await t('add_effect', { target: 'jt10-2', effect: 'reverb', decay: 3.2, mix: 28, lowcut: 250, damping: 65, size: 70, predelay: 30 })
await t('save_pattern', { instrument: 'jt10-2', name: 'A' })
// LOW: the same wash 6 dB down (JT10 oscillator level is linear) to carry the
// break's texture under the returning kick instead of cutting it at bar 81.
await t('tweak_multi', { params: { 'jt10-2.sawLevel': 28, 'jt10-2.pulseLevel': 25 } })
await t('save_pattern', { instrument: 'jt10-2', name: 'LOW' })
await t('load_pattern', { instrument: 'jt10-2', name: 'A' })

// ---------------------------------------------------------------------------
// 7. JT30 acid — one 16-bar answer to the 202's B line, A minor, peak only
// ---------------------------------------------------------------------------
await t('add_jt30', { pattern: seq({ 1: 'A2', 3: 'A2!~', 4: 'C3', 6: 'E3', 9: 'A2!', 11: 'G2', 13: 'A2~', 14: 'C3!', 15: 'E3~' }) })
await t('tweak_multi', { params: { 'jt30.waveform': 'sawtooth', 'jt30.cutoff': 380, 'jt30.resonance': 74, 'jt30.envMod': 62, 'jt30.decay': 42, 'jt30.accent': 72, 'jt30.drive': 22 } })
await t('tweak', { path: 'jt30.level', value: -8 })
await t('add_sidechain', { target: 'jt30', trigger: 'kick', amount: 0.35 })
await t('save_pattern', { instrument: 'jt30', name: 'ACID' })

// ---------------------------------------------------------------------------
// 8. Arrangement — 128 bars, 15 sections, structural events on 16-bar boundaries
// ---------------------------------------------------------------------------
const plan = [
  { bars: 8, name: 'Intro', patterns: { jt90: 'K', 'jb202-2': 'IN' }, what_happens: 'His tuned-down kick and the A1 sub at half level. Mixable, dry.' },
  { bars: 8, name: 'Intro hats', patterns: { jt90: 'HIN', 'jb202-2': 'IN' }, what_happens: 'Closed 8ths and the open hat on 14 fade in from nothing over 8 bars.' },
  { bars: 16, name: 'Build 1', patterns: { jt90: 'AH16', jb202: 'RISE', 'jb202-2': 'MID' }, what_happens: 'The sub steps up; his A stabs enter as a filtered pulse and rise 90 -> 420 Hz over 16 bars into his patch while the hats walk up 3 dB.' },
  { bars: 8, name: 'Drop 1', patterns: { jt90: 'BH', jb202: 'B', 'jb202-2': 'A', jt10: 'A' }, what_happens: 'His B section as he built it: full sub, octave-jump bassline, hats louder, the 7-note JT10 melody on dotted-8th ping-pong. Every 4th bar the open hat displaces and a ghost kick lands on the and-of-4.' },
  { bars: 8, name: 'Drop 1 hold', patterns: { jt90: 'BH', jb202: 'B8', 'jb202-2': 'A', jt10: 'A' }, what_happens: 'Holds; the G1 in the last bar drops to F1.' },
  { bars: 8, name: 'Drop 1 var', patterns: { jt90: 'C', jb202: 'A8', 'jb202-2': 'A', jt10: 'A' }, what_happens: 'Offbeat-16th ghost hats, a second open hat; bass back to the A stabs, one bar with D2 / F1 substitutions.' },
  { bars: 8, name: 'Pre-break', patterns: { jt90: 'AH', jb202: 'FALL', 'jb202-2': 'A', 'jt10-2': 'A' }, what_happens: 'Hats step back; the filter sinks 420 -> 80 Hz with rising resonance; the dub JT10 takes the melody and its delay swells.' },
  { bars: 8, name: 'Breakdown', patterns: { jt90: 'BREAK', jb202: 'GHOST', 'jt10-2': 'A' }, what_happens: 'Kick and sub out. His stabs an octave up through a hollow resonant filter, delay tails and reverb carry it, closed 8ths keep time.' },
  { bars: 8, name: 'Breakdown lift', patterns: { jt90: 'BREAK2', jb202: 'FILT', 'jt10-2': 'A' }, what_happens: 'Offbeat open hats bloom over 8 bars (level and decay automation), rimshot and a tom figure tuned to a fifth in the last 4; his B riff creeps back under a closed filter 130 -> 420 Hz.' },
  { bars: 8, name: 'Build 2', patterns: { jt90: 'BH', jb202: 'B', 'jb202-2': 'A', jt10: 'A', 'jt10-2': 'LOW' }, what_happens: 'Kick and sub return on his B section with the drop-1 drums; the 7 notes are back, the wash carries on quietly underneath.' },
  { bars: 8, name: 'Build 2 rise', patterns: { jt90: 'C', jb202: 'RISE2', 'jb202-2': 'A', jt10: 'A', 'jt10-2': 'LOW' }, what_happens: 'Ghost hats; his B line rises 420 -> 700 Hz with drive climbing 25 -> 52 into the peak.' },
  { bars: 8, name: 'Peak', patterns: { jt90: 'D', jb202: 'DRIVE', 'jb202-2': 'A', jt10: 'FULL', jt30: 'ACID' }, what_happens: 'Driven B bass, offbeat open hats and a rimshot figure, kick +1.5 dB, the melody grown to 13 notes, and the JT30 acid line answering in A minor.' },
  { bars: 8, name: 'Peak toms', patterns: { jt90: 'D2', jb202: 'DRIVE', 'jb202-2': 'A', jt10: 'FULL', jt30: 'ACID' }, what_happens: 'The tom figure joins under the peak.' },
  { bars: 8, name: 'Reduction', patterns: { jt90: 'C', jb202: 'B8', 'jb202-2': 'A', jt10: 'DIM' }, what_happens: 'Acid and toms gone, bass back on his clean patch, the 7 notes return dimmer.' },
  { bars: 8, name: 'Outro', patterns: { jt90: 'A', 'jb202-2': 'IN' }, what_happens: 'His original A drums, verbatim, over the half-level sub — kick and sub for the next record.' },
]
if (plan.reduce((n, s) => n + s.bars, 0) !== 128) throw new Error('plan is not 128 bars')
await t('set_arrangement', { sections: plan.map((s) => ({ bars: s.bars, ...s.patterns })) })

// Leave the live instruments on Bart's own patterns. The web app's engine
// reads the LIVE jt90 pattern for the sidechain trigger, so jt90 must end on
// A (kick on the 4s) or nothing ducks.
await t('load_pattern', { instrument: 'jt90', name: 'A' })
await t('load_pattern', { instrument: 'jb202', name: 'B' })
await t('load_pattern', { instrument: 'jb202-2', name: 'A' })
await t('load_pattern', { instrument: 'jt10', name: 'A' })
await t('clear_automation', {})

// ---------------------------------------------------------------------------
// 9. Render, gain-stage, metrics, round trip
// ---------------------------------------------------------------------------
const sectionBars = plan.map((s) => s.bars)
const NODES = ['jt90', 'jb202', 'jb202-2', 'jt10', 'jt10-2', 'jt30']

async function render() {
  const t0 = Date.now()
  const r = await renderSessionToBuffer(session, 128)
  const wav = Buffer.from(audioBufferToWav(r.buffer))
  const { rows } = analyzeWav(readWav(wav), session.bpm, sectionBars)
  return { ...r, wav, rows, seconds: (Date.now() - t0) / 1000 }
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

// Gain stage: move every instrument level by the same delta so the mix peaks at
// -0.5 dBFS with no master trim. Balance untouched; node levels cap at +6 dB.
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
writeFileSync(`${OUT}/metrics.txt`, `${r.message}\npeak ${(20 * Math.log10(r.peak)).toFixed(2)} dBFS, trim ${r.trimDb.toFixed(2)} dB, ${r.buffer.duration.toFixed(1)} s\nlevels: ${levels}\n\n${metrics}\n\nsections:\n${table}\n`)
console.log(metrics)
console.log(`levels: ${levels}`)

// The loop this grew from, for a loudness sanity check (optional file).
const BASE16 = process.env.BASE16 || resolve(HERE, 'out', 'base16.wav')
if (existsSync(BASE16)) {
  const base = analyzeWav(readWav(readFileSync(BASE16)), session.bpm, [8, 8]).rows
  const baseRms = base.reduce((a, row) => a + row.rmsDb, 0) / base.length
  const main = r.rows.filter((_, i) => /Drop|Peak|Build 2/.test(plan[i].name))
  const mainRms = main.reduce((a, row) => a + row.rmsDb, 0) / main.length
  console.log(`LOUDNESS: his loop ${baseRms.toFixed(1)} dBFS RMS; song main sections ${mainRms.toFixed(1)} (${(mainRms - baseRms).toFixed(1)} dB)`)
}

// Round trip: what the web app will load must render the same song.
const saved = serializeSession(session)
const again = deserializeSession(JSON.parse(JSON.stringify(saved)))
const r2 = await renderSessionToBuffer(again, 128)
const same = r2.message === r.message && r2.bars === r.bars && Math.abs(r2.peak - r.peak) < 1e-6
console.log(`ROUND TRIP: ${same ? 'ok' : 'MISMATCH'} — ${r2.message} (peak ${r2.peak.toFixed(3)})`)
if (!same) process.exitCode = 1

// ---------------------------------------------------------------------------
// 10. track.json — what the web app saves as a track
// ---------------------------------------------------------------------------
const brief = 'Turn my techno beat at 128 into a full 128-bar song sketch. Keep my patterns — the tuned-down 909 kick, the A1 sub, the 202 stabs and the octave-jump B line, the seven high notes on the JT10 — but grow it into something a DJ could play: a mixable intro, elements coming in on 8 and 16 bar phrases, a first drop, a breakdown where the kick goes out and the melody carries it, a peak with real new energy, then bring it back down to kick and sub. Berlin, dry, hypnotic, A minor, no cheese.'
const description = [
  'Kick and half the sub for sixteen bars while the closed hats fade in, then your A stabs rise out of a closed filter for sixteen bars, hats creeping up, into your B section at 33: full sub, the octave-jump line, the seven notes on the dotted-8th ping-pong, a ghost kick and a displaced open hat every fourth bar. At 57 the filter sinks under water and a dub copy of the JT10 takes the melody; at 65 the kick and sub are gone, your stabs an octave up as a hollow ghost over closed 8ths, and from 73 open hats bloom over a rimshot and a tom figure while the B riff creeps back under a filter. Kick and sub land again at 81 on your B section, a second rise pushes cutoff and drive into the peak at 97 with offbeat open hats, the kick up 1.5 dB, the melody grown to thirteen notes and a JT30 acid line answering in A minor for sixteen bars only; it reduces at 113 and ends on your original A drums over kick and half sub for the next record.',
  'Your saved A and B patterns are untouched; the new ones sit next to them. I restored the ping-pong delay your chat set on the JT10 (it had reverted to the analog default), brought the melodic 202 up from -24 dB where it was inaudible, kept the sub the biggest thing in the mix with the kick just over it, and moved every level together so the mix peaks at -0.5 dBFS with no master trim. In the app the ducking follows the drum pattern that is loaded live, so keep A or another kick pattern loaded or the pump disappears; and in song mode a slider writes through to every saved pattern of that instrument, so touching hats or cutoff flattens the per-section evolution for that parameter.',
].join('\n\n')

writeFileSync(`${OUT}/track.json`, JSON.stringify({
  title: 'Techno 128 — song sketch',
  bpm: 128,
  bars: 128,
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
