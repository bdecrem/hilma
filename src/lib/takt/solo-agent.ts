// The improv teacher's whole track (Takt, 2026-11-07). Bart: "when the agent suggests an
// improvement to the jam, have them produce a full version of the track that I can play, so
// their improvisation changes across the song to be interesting, follows chord changes etc.
// Not too hard, but make it interesting; add that to the versions of the song available in
// game mode, with a new level name." After the review (improv-agent.ts) the app sends the
// take, the review and the backing song's file here; Opus 5.5 writes a solo line over every
// bar of the song, grown from the idea it gave, and the result is saved as the player's solo
// of that song (a takt_mods row of kind 'solo', one per song, rewritten as the next version by
// each new take), which the app plays as the Solo level under the song on the Stage. Every
// rule the app needs (the grid, the range, the notes allowed, the density, the changes, the
// idea quoted, no looping) is checked here and sent back to the model with the reasons.

import type Anthropic from '@anthropic-ai/sdk'
import { type Backing, type Idea, type ImprovRequest, type Review, NAMES, noteName, stats, transcript } from './improv-agent'
import { type Charting, type SongOverride } from './charting'
import { type Draft, runTool } from './mod-tools'
import { type ModBundle, type ModRow, bundle, createMod, findSolo, saveMod } from './mods'
import { type PartNote, type SongFile, cloneSong, musicBars, sortedNotes, ticksPerBar } from './songfile'
import { handFigures, handLine } from './fingering'
import { type HandBudget, type HomePosition, budgetLine, handBudget, handProblems, homeLine, homePosition, noteNameSharp } from './leveling'
import { type TakeShape, shapeLine, takeShape, trackLimits } from './take-shape'

export const SOLO_MODEL = 'claude-opus-5-5'

export type SoloEvent = { type: 'status'; text: string } | { type: 'track'; mod: ModBundle | null; title: string; line: string }

/** What the agent wrote: the song file with the solo as its melody, named and described. */
export type Solo = { song: SongFile; title: string; line: string; notes: PartNote[] }

// MARK: Chords

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** The pitch classes of a chord symbol ("Dm7", "Bb7", "A7", "Gm7", "Dm", "F#m7b5"); null for
 *  anything that is not a chord (the form's "—" tail). */
export function chordTones(symbol: string): number[] | null {
  const m = /^([A-G])([#♯b♭]?)(.*)$/.exec(symbol.trim())
  if (!m) return null
  let root = PC[m[1]]
  if (m[2] === '#' || m[2] === '♯') root += 1
  if (m[2] === 'b' || m[2] === '♭') root -= 1
  root = (root + 12) % 12
  const q = m[3].replace(/\s+/g, '')
  let iv: number[]
  if (/^(m7b5|m7♭5|ø7?)$/.test(q)) iv = [0, 3, 6, 10]
  else if (/^(dim7|°7|o7)$/.test(q)) iv = [0, 3, 6, 9]
  else if (/^(dim|°|o)$/.test(q)) iv = [0, 3, 6]
  else if (/^(maj7|Δ7?|M7|maj9)$/.test(q)) iv = [0, 4, 7, 11]
  else if (/^(m6|min6|-6)$/.test(q)) iv = [0, 3, 7, 9]
  else if (/^(m9|min9|-9|m11)$/.test(q)) iv = [0, 3, 7, 10, 2]
  else if (/^(m7|min7|-7)$/.test(q)) iv = [0, 3, 7, 10]
  else if (/^(m|min|-)$/.test(q)) iv = [0, 3, 7]
  else if (/^(9|13|7\(?9\)?)$/.test(q)) iv = [0, 4, 7, 10, 2]
  else if (/^7(sus4?)?$/.test(q)) iv = q.includes('sus') ? [0, 5, 7, 10] : [0, 4, 7, 10]
  else if (/^6$/.test(q)) iv = [0, 4, 7, 9]
  else if (/^sus4?$/.test(q)) iv = [0, 5, 7]
  else if (/^sus2$/.test(q)) iv = [0, 2, 7]
  else if (/^(aug|\+)$/.test(q)) iv = [0, 4, 8]
  else if (q === '' || q === 'maj' || q === 'M') iv = [0, 4, 7]
  else iv = [0, 4, 7, 10]
  return iv.map((i) => (root + i) % 12)
}

/** A chord's tones among the notes allowed (all of them when none are off the scale, or when
 *  the scale leaves none: a chord with nothing allowed is still a chord). */
function tonesAllowed(symbol: string, scale: number[] | null): number[] | null {
  const tones = chordTones(symbol)
  if (!tones) return null
  if (!scale) return tones
  const inside = tones.filter((p) => scale.includes(p))
  return inside.length ? inside : tones
}

/** "Dm7 = D F A C · Gm7 = G D F (B♭ is not allowed)": every chord of the form once. */
export function chordLine(form: string[], scale: number[] | null): string {
  const seen: string[] = []
  const out: string[] = []
  for (const c of form) {
    if (seen.includes(c)) continue
    const tones = chordTones(c)
    if (!tones) continue
    seen.push(c)
    const inside = scale ? tones.filter((p) => scale.includes(p)) : tones
    const outside = scale ? tones.filter((p) => !scale.includes(p)) : []
    out.push(`${c} = ${(inside.length ? inside : tones).map((p) => NAMES[p]).join(' ')}${outside.length ? ` (${outside.map((p) => NAMES[p]).join(', ')} ${outside.length === 1 ? 'is' : 'are'} not allowed)` : ''}`)
  }
  return out.join(' · ')
}

/** "1–4 Dm7 · 5–6 Gm7 · …" over the music bars. */
function formRuns(form: string[], bars: number): string {
  const out: string[] = []
  let start = 0
  for (let b = 1; b <= bars; b++) {
    if (b === bars || form[b] !== form[start]) {
      out.push(`${start + 1 === b ? `${b}` : `${start + 1}–${b}`} ${form[start]}`)
      start = b
    }
  }
  return out.join(' · ')
}

// MARK: The check

export type SoloRules = {
  /** Notes allowed (pitch classes), or null. */
  scale: number[] | null
  scaleName: string
  low: number
  high: number
  shuffle: boolean
  /** Onsets a second over the song. */
  minPerSecond: number
  maxPerSecond: number
  /** The hand (LEVELING.md §2): the player's level's budget for a solo track, the home
   *  position the line is written in, and which hand. */
  hand: HandBudget
  home: HomePosition
  right: boolean
  /** The take's level (take-shape.ts): sixteenths on the grid only when they played them, and
   *  the longest run of eighths (or quicker) in a row. */
  sixteenths: boolean
  run: number
  shape: TakeShape
}

/** The rules for this backing and take, at the take's level (Bart, 2026-11-13: "the same
 *  general complexity / difficulty as what the user did"; take-shape.ts): the density is 0.8× to
 *  1.3× their notes a second with the rests, sixteenths only when they played them, runs of
 *  quick notes no longer than theirs (four at least), and the hand budget their own moves a bar
 *  over the song (a quarter more, at least 2). The hand first (LEVELING.md, 2026-11-08): on a
 *  map level's improv the budget is also the level's for a solo track (Level 1: at most 4 moves
 *  in 2 places, 2 positions, inside an octave), whichever is less, and on Levels 1–2 the range
 *  is the home position (the five scale keys where their take mostly sat) and a step either
 *  side. A jam's range is where they played and a step either side, a sixth at least; from
 *  Level 3 near where they played (a seventh under, an octave over, two octaves at most).
 *  `bars`: the song's, for the hand budget. */
export function rulesFor(r: ImprovRequest, bars = 48): SoloRules {
  const s = stats(r)
  const level = r.context.level || 1
  const right = r.context.hand === 'right'
  const shape = takeShape(r.take.notes, r.take.tempo, right)
  const track = trackLimits(shape, bars)
  const own: HandBudget = { level, positions: track.positions, moves: track.moves, moments: track.moments, span: track.span }
  const cap = handBudget(level, true)
  const hand: HandBudget = r.context.where === 'level'
    ? { level, positions: Math.min(own.positions, cap.positions), moves: Math.min(own.moves, cap.moves), moments: Math.min(own.moments, cap.moments), span: Math.min(own.span, cap.span) }
    : own
  const home = homePosition(r.take.notes, r.backing.scale, level <= 1 ? 5 : 6)
  const tail = { sixteenths: track.sixteenths, run: Math.max(4, shape.longestRun), shape }
  let low: number, high: number
  if (r.context.where === 'jam') {
    const lo = s.low ?? 60, hi = s.high ?? 72
    low = Math.max(36, lo - 2)
    high = Math.min(96, hi + 2)
    if (high - low < 9) high = Math.min(96, low + 9)
    return { scale: r.backing.scale, scaleName: r.backing.scaleName, low, high, shuffle: r.backing.feel === 'shuffle', minPerSecond: track.minPerSecond, maxPerSecond: track.maxPerSecond, hand, home, right, ...tail }
  }
  if (level <= 2) {
    low = home.low
    high = home.high
    // Level 2 may reach an octave over the home (two positions).
    if (level === 2) high = Math.min(96, home.keys[0] + 19)
  } else {
    const lo = s.low ?? 60, hi = s.high ?? 72
    low = Math.max(36, lo - 7)
    high = Math.min(96, hi + 12)
    // Two octaves and a third at most (a take that wandered doesn't license the whole piano).
    if (high - low > 28) {
      const mid = Math.round((lo + hi) / 2)
      low = Math.max(low, mid - 14)
      high = Math.min(high, low + 28)
    }
    if (high - low < 14) high = Math.min(96, low + 14)
  }
  return { scale: r.backing.scale, scaleName: r.backing.scaleName, low, high, shuffle: r.backing.feel === 'shuffle', minPerSecond: track.minPerSecond, maxPerSecond: track.maxPerSecond, hand, home, right, ...tail }
}

const barOf = (t: number, tpb: number) => Math.floor(t / tpb) + 1
const beatOf = (t: number, tpb: number) => {
  const b = (t % tpb) / 12 + 1
  return Number.isInteger(b) ? `${b}` : b.toFixed(2).replace(/0$/, '')
}
const list = (xs: number[]) => (xs.length > 8 ? `${xs.slice(0, 8).join(', ')} and ${xs.length - 8} more` : xs.join(', '))

/** Every problem the app would have with the solo as written, in the model's own terms; empty
 *  when it is sound. `idea` is the phrase it must grow from. */
export function checkSolo(song: SongFile, rules: SoloRules, idea: Idea): string[] {
  const problems: string[] = []
  const tpb = ticksPerBar(song)
  const bars = musicBars(song)
  const end = bars * tpb
  const notes = sortedNotes(song.song.parts.melody?.notes ?? [])
  if (!notes.length) return ['the solo has no notes']
  const seconds = (bars * song.beatsPerBar * 60) / song.song.tempo

  // Two notes at once: a line, never chords.
  const together = [...new Set(notes.filter((n, i) => i > 0 && notes[i - 1].t === n.t).map((n) => n.t))]
  if (together.length) problems.push(`two notes at once at ${list(together.map((t) => barOf(t, tpb)))} (bars): it is a line, one note at a time`)

  // The grid and the lengths.
  const offGrid = notes.filter((n) => !(n.t % (rules.sixteenths ? 3 : 6) === 0 || (rules.shuffle && n.t % 4 === 0)))
  if (offGrid.length) problems.push(`off the grid (beats and halves${rules.sixteenths ? ' and sixteenths' : ''}${rules.shuffle ? ', or the shuffle\'s 8 + 4' : ''}): ${list(offGrid.map((n) => Number(`${barOf(n.t, tpb)}.${n.t % tpb}`)))} (bar.tick)`)
  const minLen = rules.sixteenths ? 3 : rules.shuffle ? 4 : 6
  const short = notes.filter((n) => n.len < minLen)
  if (short.length) problems.push(`notes shorter than an eighth (${minLen} ticks) at bars ${list(short.map((n) => barOf(n.t, tpb)))}`)
  const long = notes.filter((n) => n.len > 2 * tpb)
  if (long.length) problems.push(`notes longer than two bars at bars ${list(long.map((n) => barOf(n.t, tpb)))}`)
  const past = notes.filter((n) => n.t + n.len > end + tpb / 2)
  if (past.length) problems.push('a note rings past the end of the song')

  // Pitches: the notes allowed, the range.
  if (rules.scale) {
    const off = notes.filter((n) => !rules.scale!.includes(((n.n % 12) + 12) % 12))
    if (off.length) problems.push(`not among the notes allowed (${rules.scaleName || rules.scale.map((p) => NAMES[p]).join(' ')}): ${list(off.map((n) => Number(`${barOf(n.t, tpb)}`)))} (bars; ${[...new Set(off.map((n) => noteName(n.n)))].slice(0, 6).join(', ')})`)
  }
  const out = notes.filter((n) => n.n < rules.low || n.n > rules.high)
  if (out.length) problems.push(`out of range: keep every note between ${noteName(rules.low)} (${rules.low}) and ${noteName(rules.high)} (${rules.high}); bars ${list(out.map((n) => barOf(n.t, tpb)))}`)
  // A leap wider than an octave inside a phrase (the next note within two beats); after a
  // rest a new phrase may start anywhere.
  const leaps = notes.filter((n, i) => i > 0 && Math.abs(n.n - notes[i - 1].n) > 12 && n.t - notes[i - 1].t <= 24)
  if (leaps.length) problems.push(`leaps wider than an octave at bars ${list(leaps.map((n) => barOf(n.t, tpb)))}`)

  // Not too hard: the density, runs of eighths, silences.
  const onsets = [...new Set(notes.map((n) => n.t))].sort((a, b) => a - b)
  const perSecond = onsets.length / seconds
  if (perSecond < rules.minPerSecond) problems.push(`too sparse: ${onsets.length} notes over ${bars} bars is ${perSecond.toFixed(2)} a second; write at least ${Math.ceil(rules.minPerSecond * seconds)} (about ${(rules.minPerSecond * seconds / bars).toFixed(1)} a bar)`)
  if (perSecond > rules.maxPerSecond) problems.push(`too busy: ${onsets.length} notes over ${bars} bars is ${perSecond.toFixed(2)} a second; keep it under ${Math.floor(rules.maxPerSecond * seconds)} (about ${(rules.maxPerSecond * seconds / bars).toFixed(1)} a bar)`)
  const runs: number[] = []
  let run = 1
  for (let i = 1; i < onsets.length; i++) {
    if (onsets[i] - onsets[i - 1] <= 8) run++
    else run = 1
    if (run === rules.run + 1) runs.push(barOf(onsets[i - rules.run], tpb))
  }
  if (runs.length) problems.push(`runs of ${rules.run + 1} or more quick notes (an eighth or less apart) in a row from bars ${list(runs)}: at most ${rules.run} together, as in their take, then a longer note or a rest`)
  const silences: string[] = []
  if (onsets[0] > tpb + 12) silences.push(`bars 1–${barOf(onsets[0], tpb) - 1}`)
  for (let i = 1; i < onsets.length; i++) {
    const prev = notes.filter((n) => n.t === onsets[i - 1]).reduce((m, n) => Math.max(m, n.t + n.len), 0)
    if (onsets[i] - prev > 2 * tpb) silences.push(`bars ${barOf(prev, tpb)}–${barOf(onsets[i], tpb)}`)
  }
  if (end - onsets[onsets.length - 1] > 3 * tpb) silences.push(`bars ${barOf(onsets[onsets.length - 1], tpb) + 1}–${bars} (finish the track: the last phrase lands in the last bars)`)
  if (silences.length) problems.push(`more than two bars without a note: ${silences.slice(0, 6).join('; ')}`)

  // The changes: on a bar whose chord differs from the last, the first note heard in it is a
  // tone of the new chord (a rest first is fine; an empty bar is fine).
  const misses: string[] = []
  let changes = 0
  for (let b = 1; b < bars; b++) {
    const tones = tonesAllowed(song.form[b], rules.scale)
    if (!tones || song.form[b] === song.form[b - 1]) continue
    const start = b * tpb
    const ringing = notes.filter((n) => n.t < start && n.t + n.len > start + 2).sort((x, y) => y.t - x.t)[0]
    const first = notes.find((n) => n.t >= start && n.t < start + tpb)
    const heard = ringing && (!first || first.t > start) ? ringing : first
    if (!heard) continue
    changes++
    if (!tones.includes(((heard.n % 12) + 12) % 12)) misses.push(`bar ${b + 1} (${song.form[b]}: ${noteName(heard.n)} on ${beatOf(heard.t, tpb)}; its tones ${tones.map((p) => NAMES[p]).join(' ')})`)
  }
  if (changes && misses.length / changes > 0.34) problems.push(`the changes: the first note heard in a bar where the chord changes should be a tone of that chord, and ${misses.length} of ${changes} such bars miss it: ${misses.slice(0, 8).join('; ')}`)

  // The idea is in it: its first notes, in order (the same keys, or the same shape moved up or
  // down), at least twice; and the line does not just loop.
  const seq = [...idea.notes].sort((a, b) => a.t - b.t || a.n - b.n).map((n) => n.n)
  const head = seq.slice(0, Math.min(4, seq.length))
  if (head.length >= 3) {
    const pcs = notes.map((n) => ((n.n % 12) + 12) % 12)
    const ivs = notes.map((n, i) => (i ? n.n - notes[i - 1].n : 0))
    const headPcs = head.map((n) => ((n % 12) + 12) % 12)
    const headIvs = head.map((n, i) => (i ? n - head[i - 1] : 0))
    let quotes = 0
    for (let i = 0; i + head.length <= notes.length; i++) {
      const samePcs = headPcs.every((p, k) => pcs[i + k] === p)
      const sameShape = headIvs.every((d, k) => k === 0 || ivs[i + k] === d)
      if (samePcs || sameShape) quotes++
    }
    if (quotes < 2) problems.push(`the idea is not in it: its first notes (${head.map((n) => noteName(n)).join(' ')}) in that order, on those keys or moved as a shape, should come at least twice (found ${quotes}); the first chorus states it, a later one brings it back`)
  }
  const formBars = firstRepeat(song.form.slice(0, bars))
  if (formBars < bars) {
    const key = (b: number) => notes.filter((n) => barOf(n.t, tpb) === b).map((n) => `${n.t % tpb}:${n.n}:${n.len}`).join(',')
    let later = 0, same = 0
    for (let b = formBars + 1; b <= bars; b++) {
      const k = key(b)
      if (!k) continue
      later++
      if (k === key(b - formBars)) same++
    }
    if (later && same / later > 0.5) problems.push(`it loops: ${same} of the ${later} bars after the first chorus repeat the bar one chorus earlier note for note; vary the line from chorus to chorus (move the idea onto the changes, answer it, stretch it, go up for the peak, come home at the end)`)
  }

  // The hand (LEVELING.md): fingered as the Stage will finger it, the line keeps to the
  // level's budget of moves, places, positions and width.
  if (!together.length) {
    const figures = handFigures(notes, rules.right, 12)
    problems.push(...handProblems(notes, figures, rules.hand, tpb))
  }

  // The weights, for the game's levels under Solo.
  const barsWithNotes = new Set(notes.map((n) => barOf(n.t, tpb)))
  const anchored = new Set(notes.filter((n) => n.lv === 1).map((n) => barOf(n.t, tpb)))
  if (anchored.size < barsWithNotes.size * 0.6) problems.push(`lv 1 (the anchor) is missing in ${barsWithNotes.size - anchored.size} of the ${barsWithNotes.size} bars that have notes: one anchor a bar, the note held on a strong beat`)
  return problems
}

/** The length of the form's repeating chorus (12 for a blues; the last bar's final chord may
 *  differ), or the whole when it never repeats. */
function firstRepeat(form: string[]): number {
  for (let n = 2; n <= form.length / 2; n++) {
    const same = form.filter((c, i) => i >= n && c === form[i - n]).length
    if (same >= (form.length - n) * 0.9) return n
  }
  return form.length
}

// MARK: The teacher

function system(): string {
  return `You are the improv teacher inside Takt, a piano course for grown-ups. You just listened to a student's improvised take over a backing track and sent them a review with ONE idea: a short phrase made from their best moment, a little better. Now you write THE WHOLE TRACK for them: a solo line over every bar of the song, which the app puts on the Stage (the game: the notes come down a highway onto the keys while the band plays) as a level called Solo under that song. The student asked for exactly this: when the teacher suggests an improvement to my jam, make a full version of the track I can play, where the improvisation changes across the song, stays interesting and follows the chord changes; not too hard.

What it is: their idea, grown into a whole solo. The first chorus states the idea plainly with room around it, call and answer: the idea, a breath, an answer that lands on a chord tone. Each chorus after that does one new thing with it: moves it onto the iv, turns its ending up instead of down, stretches its rhythm, starts it a beat later, climbs to the top of the range for the peak (the chorus before the last), and the last chorus brings it home: the idea again, longer notes, ending on the tonic held into the last bar. Use what they played (phrases from their take) wherever it fits: it should sound like them on a good night. Follow the sections the song names.

The changes: the solo must say the chords. On a bar where the chord changes, the first note heard in it (or the note still ringing into it) is a tone of the new chord; the message lists every chord's tones among the notes allowed. Phrases land on chord tones; passing notes go between them.

THE HAND FIRST. This is the rule the student cares most about: a beginner's whole difficulty is knowing where their hand is. The message names their HOME POSITION (five neighbouring keys of the scale, one finger each, where their own take sat) and their level's HAND BUDGET: how many times in the WHOLE SONG the hand may move at all. Write every bar inside the home position. The few figures that leave it are the interest of the track: a short climb or a reach over the top note, a bar or two, and the hand comes straight home. Never settle in a new position for a chorus; never move the hand twice in one bar; never ask for a thumb-under or a jump where the line could stay put. The app fingers your line the way the Stage will (a dynamic program over the five fingers) and counts the moves; over the budget it comes back with the bars named. Interest at this level comes from rhythm, repetition and variation, space, and landing on the chord tones, not from range.

At their level, and interesting: the student plays this with one hand while reading the notes coming down, and the track is exactly as hard as their own take, neither harder nor easier (the message measures the take: notes a second, their quickest notes, their longest run of quick notes, how often their hand moved). Keep to the density band the message gives, no note values quicker than theirs (sixteenths only when the message allows them), runs of quick notes no longer than theirs, never two notes at once, steps and small leaps (a fifth at most; nothing wider than the range given). Rests are music: at least one bar in four is mostly silence or one held note, and never more than two bars without a note. Hold back where a beginner's take was simple: mostly quarter notes and held notes then.

The format (the app checks every rule and sends the solo back with what to fix): bar is 1-based; tick is counted inside the bar from 0, 12 a beat, 48 a bar, on the grid: beats (0, 12, 24, 36) and halves (6, 18, 30, 42), and in a shuffle the short eighth on 8, 20, 32, 44; n is a MIDI number (60 = middle C), only the notes allowed, inside the range given; len in ticks, 6 or more (a quarter is 12, a half 24, a whole bar 48; a note may ring over the bar line, up to two bars); lv is the weight for the game's levels under Solo: 1 for one anchor a bar (the note held on a strong beat, a chord tone), 2 the rest of the line, 3 pickups and ornaments. No fingers: the app fingers it.

Write every bar from the first to the last with write_notes, in order, in the parts the message names (24 bars at most a call), then call finish with a title (at most 40 characters, like "Lantern climb") and one sentence for the song's card: what this solo is and where it came from, at most 160 characters, plain words, no markdown. If finish comes back with problems, rewrite the bars it names with write_notes and call finish again.`
}

/** The parts the track is written in: two halves up to 48 bars (a blues of four choruses, as
 *  before), else even parts of at most 24 bars (a whole techno track, a Stage jam's Solo). */
function chunks(bars: number): [number, number][] {
  const n = Math.max(2, Math.ceil(bars / 24))
  const size = Math.ceil(bars / n)
  const out: [number, number][] = []
  for (let a = 1; a <= bars; a += size) out.push([a, Math.min(bars, a + size - 1)])
  return out
}

function userMessage(r: ImprovRequest, review: Review, song: SongFile, rules: SoloRules): string {
  const bars = musicBars(song)
  const tpb = ticksPerBar(song)
  const seconds = (bars * song.beatsPerBar * 60) / song.song.tempo
  const perBar = (x: number) => ((x * seconds) / bars).toFixed(1)
  const sections = song.song.sections.map((x, i) => `bars ${x.bar + 1}–${(song.song.sections[i + 1]?.bar ?? bars)} ${x.name}`).join(' · ')
  const allowed = rules.scale
    ? `Notes allowed: ${rules.scaleName ? `${rules.scaleName}: ` : ''}${rules.scale.map((p) => NAMES[p]).join(' ')} (any octave).`
    : 'Notes allowed: any (the key is the guide).'
  const tune = sortedNotes(song.song.parts.melody?.notes ?? [])
  const tuneLines: string[] = []
  for (let b = 0; b < Math.min(bars, firstRepeat(song.form.slice(0, bars))); b++) {
    const inBar = tune.filter((n) => Math.floor(n.t / tpb) === b)
    if (!inBar.length) continue
    tuneLines.push(`Bar ${b + 1}, ${song.form[b]}: ${inBar.map((n) => `${noteName(n.n)} on ${beatOf(n.t, tpb)} for ${(n.len / 12).toFixed(2).replace(/\.?0+$/, '')}`).join(', ')}`)
  }
  const ideaBeats = [...review.idea.notes].sort((a, b) => a.t - b.t).map((n) => `${noteName(n.n)} on ${(n.t / 12 + 1).toFixed(2).replace(/\.?0+$/, '')} for ${(n.len / 12).toFixed(2).replace(/\.?0+$/, '')}`).join(', ')
  const s = stats(r)
  return `The song: ${song.song.title}, ${song.song.style} in ${song.song.key}, ${song.song.tempo} bpm, ${rules.shuffle ? 'a shuffle (swung eighths: long 8 ticks, short 4)' : 'straight eighths'}, ${bars} bars (${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}). The band plays the drums, the bass and the ${song.instruments.keys}; your solo takes the ${song.instruments.horns}'s place.
Sections: ${sections}.
Chords by bar: ${formRuns(song.form, bars)}.
Chord tones among the notes allowed: ${chordLine(song.form.slice(0, bars), rules.scale)}.
${allowed}
Their level, measured from the take: ${shapeLine(rules.shape)}; their longest run of quick notes ${rules.shape.longestRun}.
Home position (${r.context.hand} hand): ${homeLine(rules.home, rules.right)}; the range is ${noteNameSharp(rules.low)} to ${noteNameSharp(rules.high)} (MIDI ${rules.low}–${rules.high}), and nothing outside that. Hand budget for the whole song, from their take: ${budgetLine(rules.hand)}. They played ${s.low != null ? noteName(s.low) : '-'} to ${s.high != null ? noteName(s.high) : '-'}.
Density, from their take: ${rules.minPerSecond} to ${rules.maxPerSecond} notes a second is ${perBar(rules.minPerSecond)} to ${perBar(rules.maxPerSecond)} notes a bar at ${song.song.tempo} bpm, about ${Math.round(rules.minPerSecond * seconds)} to ${Math.round(rules.maxPerSecond * seconds)} notes in all. ${rules.sixteenths ? 'They played sixteenths: ticks on multiples of 3 and lengths of 3 or more are allowed.' : 'No sixteenths: they played none.'} At most ${rules.run} quick notes (an eighth or less apart) in a row.
Hand: ${r.context.hand}.
${tuneLines.length ? `
The record's own line, the tune the ${song.instruments.horns} plays (one chorus), for reference; the solo is new, in the student's voice, but may nod to it:
${tuneLines.join('\n')}
` : ''}
Their take (the transcript you reviewed), ${s.bars} bars, ${s.notes} notes:
${transcript(r)}

Your review: "${review.headline}" ${review.notes.join(' ')}
Your idea, "${review.idea.title}" (${review.idea.bars} bar${review.idea.bars === 1 ? '' : 's'}): ${review.idea.why} Its notes, beats from its start: ${ideaBeats}.

Write the whole track now: ${chunks(bars).map(([a, b]) => `bars ${a}–${b}`).join(', then ')}, then finish.`
}

const NOTE = {
  type: 'object',
  properties: {
    bar: { type: 'integer', description: 'The bar, 1-based.' },
    tick: { type: 'integer', description: 'Tick inside the bar: 0 the downbeat, 12 a beat, 6 the "and".' },
    n: { type: 'integer', description: 'MIDI note, 60 = middle C.' },
    len: { type: 'integer', description: 'Length in ticks, 6 or more.' },
    lv: { type: 'integer', description: '1 the anchor of the bar, 2 the line, 3 a pickup or ornament.' },
  },
  required: ['bar', 'tick', 'n', 'len', 'lv'],
}

const TOOLS = [
  {
    name: 'write_notes',
    description: 'Write the solo into a range of bars (1-based, inclusive), replacing whatever the range held. Write the track in order, in the parts the message names; a call may hold at most 24 bars. The app validates the notes and keeps the band in step.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from_bar: { type: 'integer' },
        to_bar: { type: 'integer' },
        notes: { type: 'array', items: NOTE },
      },
      required: ['from_bar', 'to_bar', 'notes'],
    },
  },
  {
    name: 'finish',
    description: 'When every bar is written: name the track and describe it in one sentence. The app checks the whole solo and answers with anything to fix, or accepts it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'At most 40 characters.' },
        line: { type: 'string', description: 'One sentence for the card, at most 160 characters: what this solo is and where it came from.' },
      },
      required: ['title', 'line'],
    },
  },
]

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '')

/** The section a bar is in, for the working steps. */
function sectionOf(song: SongFile, bar: number): string {
  return song.song.sections.filter((x) => x.bar + 1 <= bar).pop()?.name ?? ''
}

/** Writes the solo into `song` (its melody part and the band channel it replaces), streaming
 *  the steps; returns the finished solo. Throws on a failure the caller reports. Pure of the
 *  database: `runSoloTrack` saves it. */
export async function writeSolo(r: ImprovRequest, review: Review, base: SongFile, charting: Charting, override: SongOverride | null, emit: (e: SoloEvent) => void): Promise<Solo> {
  const song = cloneSong(base)
  if (!song.song.parts.melody) {
    // A song with no melody part: the solo takes the horns, titled as a part of its own.
    song.song.parts.melody = { title: 'Solo', monitor: song.instruments.monitor ?? 'piano', channel: 'horns', notes: [] }
  }
  const draft: Draft = { song, override, title: song.song.title, mutated: false }
  const rules = rulesFor(r, musicBars(song))
  const bars = musicBars(song)
  const tpb = ticksPerBar(song)
  emit({ type: 'status', text: 'Reading your take and the changes' })
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const anthropic = new AnthropicSDK({ apiKey })
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: [{ type: 'text', text: userMessage(r, review, song, rules), cache_control: { type: 'ephemeral' } }] },
  ]
  const written = new Array<boolean>(bars).fill(false)
  let title = '', line = ''
  let fixes = 0
  let nudges = 0
  for (let turn = 0; turn < 16; turn++) {
    const stream = anthropic.messages.stream({
      model: SOLO_MODEL,
      max_tokens: 24000,
      system: [{ type: 'text', text: system(), cache_control: { type: 'ephemeral' } }],
      tools: TOOLS as Anthropic.Tool[],
      messages,
    })
    let said = false
    for await (const ev of stream) {
      if (ev.type !== 'content_block_start') continue
      if (ev.content_block.type === 'thinking' && !said && turn === 0) {
        said = true
        emit({ type: 'status', text: 'Hearing where your idea can go' })
      }
    }
    const res = await stream.finalMessage()
    if (res.stop_reason === 'max_tokens') {
      if (++nudges > 2) throw new Error('the teacher ran out of room writing the track')
      messages.push({ role: 'assistant', content: [{ type: 'text', text: '(cut off at the length limit)' }] })
      messages.push({ role: 'user', content: [{ type: 'text', text: 'That was cut off at the length limit and nothing of it was kept. Write fewer bars per call (12 at a time) and keep your thinking short.' }] })
      continue
    }
    if (res.stop_reason === 'refusal') throw new Error('the teacher declined to write this track')
    messages.push({ role: 'assistant', content: res.content })
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!calls.length) {
      if (++nudges > 3) throw new Error('the teacher stopped before the track was done')
      messages.push({ role: 'user', content: [{ type: 'text', text: written.every(Boolean) ? 'Call finish with the title and the line, please.' : `Bars ${firstGap(written)} are not written yet: write them with write_notes, then call finish.` }] })
      continue
    }
    const results: Anthropic.ToolResultBlockParam[] = []
    let done = false
    for (const call of calls) {
      const input = (call.input ?? {}) as Record<string, unknown>
      if (call.name === 'write_notes') {
        const a = Number(input.from_bar), b = Number(input.to_bar)
        emit({ type: 'status', text: `Writing bars ${a}–${b}${Number.isFinite(a) && sectionOf(song, a) ? ` (${sectionOf(song, a)})` : ''}` })
        const out = runTool(draft, charting, 'write_notes', { part: 'melody', from_bar: a, to_bar: b, notes: input.notes })
        if (!out.startsWith('Error')) for (let x = Math.max(1, a); x <= Math.min(bars, b); x++) written[x - 1] = true
        // The ladder figures are noise here: the whole solo is the level.
        results.push({ type: 'tool_result', tool_use_id: call.id, content: out.split('\nLadder of')[0] })
        continue
      }
      if (call.name === 'finish') {
        emit({ type: 'status', text: 'Checking it against the changes' })
        const problems: string[] = []
        if (!written.every(Boolean)) problems.push(`bars ${firstGap(written)} are not written yet`)
        const t = str(input.title, 60).trim(), l = str(input.line, 200).trim()
        if (!t || t.length > 40) problems.push('title: 1 to 40 characters')
        if (!l || l.length > 160) problems.push('line: one sentence, 1 to 160 characters')
        if (written.every(Boolean)) problems.push(...checkSolo(draft.song, rules, review.idea))
        if (problems.length) {
          fixes++
          console.warn(`[takt/solo] sent back (fix ${fixes}): ${problems.join('; ')}`)
          if (fixes > 4) throw new Error(`the teacher could not write a track the app can play: ${problems[0]}`)
          emit({ type: 'status', text: `Fixing: ${problems[0].split(':')[0]}` })
          results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Not yet: ${problems.join('; ')}. Rewrite the bars concerned with write_notes (the whole range you rewrite, every note in it), then call finish again.` })
          continue
        }
        title = t
        line = l
        done = true
        results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Accepted.' })
        continue
      }
      results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `no tool named ${call.name}` })
    }
    messages.push({ role: 'user', content: results })
    if (done) break
  }
  if (!title) throw new Error('the teacher ran out of turns writing the track')
  const notes = sortedNotes(draft.song.song.parts.melody!.notes)
  draft.song.song.line = line
  void tpb
  return { song: draft.song, title, line, notes }
}

function firstGap(written: boolean[]): string {
  const missing = written.map((w, i) => (w ? -1 : i + 1)).filter((x) => x > 0)
  if (!missing.length) return ''
  const runs: string[] = []
  let a = missing[0], b = missing[0]
  for (const x of missing.slice(1)) {
    if (x === b + 1) b = x
    else {
      runs.push(a === b ? `${a}` : `${a}–${b}`)
      a = b = x
    }
  }
  runs.push(a === b ? `${a}` : `${a}–${b}`)
  return runs.join(', ')
}

/** The whole thing: writes the solo, saves it as the user's solo of `base` (a new row, or the
 *  next version of the one they have), emits `track` with the bundle. With no user the solo is
 *  written and emitted unsaved (the checks). */
export async function runSoloTrack(
  r: ImprovRequest,
  review: Review,
  base: string,
  baseTitle: string,
  file: SongFile,
  charting: Charting,
  override: SongOverride | null,
  userId: string | null,
  emit: (e: SoloEvent) => void,
): Promise<Solo> {
  const solo = await writeSolo(r, review, file, charting, override, emit)
  if (!userId) {
    emit({ type: 'track', mod: null, title: solo.title, line: solo.line })
    return solo
  }
  emit({ type: 'status', text: 'Putting it on the Stage' })
  const now = new Date().toISOString()
  const ask = `from their take over ${r.backing.title}: "${review.headline}" The idea: ${review.idea.title}.`
  let row: ModRow | null = await findSolo(userId, base)
  if (!row) row = await createMod(userId, base, baseTitle, file, override, 'solo')
  const song = cloneSong(solo.song)
  song.name = row.name
  song.song.title = row.title
  song.song.line = solo.line
  row.song = song
  row.charting = override
  row.version += 1
  row.messages = [...row.messages, { role: 'user', text: ask, at: now }, { role: 'agent', text: `${solo.title}: ${solo.line}`, at: now }]
  await saveMod(row, `${solo.title} — ${ask}`)
  emit({ type: 'track', mod: await bundle(row), title: solo.title, line: solo.line })
  return solo
}

/** The app's review as it came back from the improv teacher (ticks already), checked. */
export function parseReview(x: unknown): Review | string {
  if (!x || typeof x !== 'object') return 'review required.'
  const v = x as Record<string, unknown>
  const headline = str(v.headline, 120).trim()
  const notes = Array.isArray(v.notes) ? v.notes.filter((n): n is string => typeof n === 'string').map((n) => n.slice(0, 600)) : []
  const idea = (v.idea ?? {}) as Record<string, unknown>
  const list = Array.isArray(idea.notes) ? (idea.notes as Record<string, unknown>[]) : []
  if (!headline || !notes.length) return 'review: headline and notes.'
  if (!(idea.bars === 1 || idea.bars === 2 || idea.bars === 4) || list.length < 3 || list.length > 16) return 'review: an idea of 1, 2 or 4 bars with 3 to 16 notes.'
  const out: Idea = { title: str(idea.title, 60).trim() || 'Your idea', why: str(idea.why, 600), bars: idea.bars, notes: [] }
  for (const n of list) {
    if (!n || typeof n !== 'object') return 'review: a note of the idea is not { t, n, len, f }.'
    const t = Number(n.t), p = Number(n.n), len = Number(n.len), f = Number(n.f ?? 0)
    if (!Number.isInteger(t) || !Number.isInteger(p) || !Number.isInteger(len) || t < 0 || p < 0 || p > 127 || len < 1) return 'review: a note of the idea is out of bounds.'
    out.notes.push({ t, n: p, len, f: Number.isInteger(f) ? f : 0 })
  }
  return { headline, notes, idea: out }
}

export type { Backing }
