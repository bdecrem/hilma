// How hard a take was (Takt, 2026-11-13). Bart: "The key for all agent variants on jams is that
// it should be at the same general complexity / difficulty as what the user did." The improv
// teacher's idea (improv-agent.ts) and its whole track (solo-agent.ts) used fixed beginner
// numbers (one hand position, 0.45–1.2 notes a second, eighths at most); now both read the take
// first and are held to it: about as busy as the player was while playing, no quicker notes
// than theirs, no more notes at once, the hand moving no more than theirs did. IMPROV.md
// "The same level as the take".

import { handFigures, handLine, type HandFigures } from './fingering'

export type ShapeNote = { t: number; n: number; len: number }

export type TakeShape = {
  notes: number
  onsets: number
  /** Bars with at least one onset, and bars from the first onset's bar to the last's. */
  busyBars: number
  spanBars: number
  /** Onsets a second over the bars they played in: how busy they are while playing. */
  perSecond: number
  /** Onsets a second from their first bar to their last, rests included. */
  overall: number
  /** Ticks (12 a beat): a quick step of theirs, the gap between onsets that a sixth of their
   *  gaps inside a phrase (a bar or less) are at or under. 12 = quarters, 6 = eighths. */
  quickest: number
  /** The most keys they struck together on at least a tenth of their onsets (1 = a line). */
  atOnce: number
  low: number | null
  high: number | null
  span: number
  /** Their line (one key an onset: the top for the right hand) as the Stage fingers it. */
  hand: HandFigures
  movesPerBar: number
  /** The most onsets in a row an eighth or less apart (a run). */
  longestRun: number
}

const TPB = 12

/** The shape of a take (ticks 12 a beat, 48 a bar) at `tempo`. */
export function takeShape(notes: ShapeNote[], tempo: number, right = true): TakeShape {
  const sorted = [...notes].sort((a, b) => a.t - b.t || a.n - b.n)
  const byTick = new Map<number, ShapeNote[]>()
  for (const n of sorted) byTick.set(n.t, [...(byTick.get(n.t) ?? []), n])
  const ticks = [...byTick.keys()].sort((a, b) => a - b)
  const bar = 4 * TPB
  const secondsPerBar = (4 * 60) / tempo
  const busy = new Set(ticks.map((t) => Math.floor(t / bar)))
  const spanBars = ticks.length ? Math.floor(ticks[ticks.length - 1] / bar) - Math.floor(ticks[0] / bar) + 1 : 0
  const gaps = ticks.slice(1).map((t, i) => t - ticks[i]).filter((g) => g > 0 && g <= bar).sort((a, b) => a - b)
  const quickest = gaps.length ? gaps[Math.floor((gaps.length - 1) / 6)] : TPB
  const sizes = [...byTick.values()].map((g) => new Set(g.map((n) => n.n)).size)
  let atOnce = 1
  for (let k = 4; k >= 2; k--) if (sizes.filter((s) => s >= k).length >= Math.max(1, sizes.length / 10)) { atOnce = k; break }
  const line = ticks.map((t) => {
    const g = byTick.get(t)!
    return right ? g.reduce((a, b) => (b.n > a.n ? b : a)) : g.reduce((a, b) => (b.n < a.n ? b : a))
  })
  const hand = handFigures(line, right, TPB)
  const pitches = sorted.map((n) => n.n)
  return {
    notes: sorted.length,
    onsets: ticks.length,
    busyBars: busy.size,
    spanBars,
    perSecond: busy.size ? ticks.length / (busy.size * secondsPerBar) : 0,
    overall: spanBars ? ticks.length / (spanBars * secondsPerBar) : 0,
    quickest,
    atOnce,
    low: pitches.length ? Math.min(...pitches) : null,
    high: pitches.length ? Math.max(...pitches) : null,
    span: pitches.length ? Math.max(...pitches) - Math.min(...pitches) : 0,
    hand,
    movesPerBar: spanBars ? hand.moves.length / spanBars : 0,
    longestRun: ticks.reduce((acc, t, i) => {
      const run = i > 0 && t - ticks[i - 1] <= 8 ? acc.run + 1 : 1
      return { run, best: Math.max(acc.best, run) }
    }, { run: 0, best: 0 }).best,
  }
}

const VALUES: [number, string][] = [[3, 'sixteenths'], [4, 'triplet eighths'], [6, 'eighths'], [8, 'quarter triplets'], [12, 'quarters'], [18, 'dotted quarters'], [24, 'half notes']]

/** A gap in ticks as the note value it is nearest ("eighths"). */
export function valueName(ticks: number): string {
  return VALUES.reduce((a, b) => (Math.abs(b[0] - ticks) < Math.abs(a[0] - ticks) ? b : a))[1]
}

/** The take's measure as the teacher reads it. */
export function shapeLine(s: TakeShape): string {
  const together = s.atOnce === 1 ? 'one note at a time' : `up to ${s.atOnce} keys at once`
  return `${s.perSecond.toFixed(2)} notes a second while playing (${s.overall.toFixed(2)} over the take with its rests), their quickest notes ${valueName(s.quickest)}, ${together}, ${handLine(s.hand)} in ${s.spanBars} bar${s.spanBars === 1 ? '' : 's'}`
}

/** What the teacher's idea (a phrase of 1, 2 or 4 bars that loops) may be, from the take: as busy
 *  as they were while playing (0.6× to 1.5×), nothing quicker than three quarters of their quick
 *  step, no more keys at once than theirs (two at most: the idea is a line), and the hand as
 *  theirs: one position when they stayed in one (a stray move in a long take counts as one),
 *  else as many moves a bar as theirs. The density is over the bars that have notes, the
 *  idea's as the take's: a two-bar call that rests its second bar is as busy as its first. */
export type IdeaLimits = { minPerSecond: number; maxPerSecond: number; quickest: number; atOnce: number; moves: number; span: number }

export function ideaLimits(s: TakeShape, bars: number, onePositionSpan: number): IdeaLimits {
  // A move every four bars or more is a hand that moves; a stray one in a long take is not.
  const moves = s.movesPerBar >= 0.25 ? Math.max(1, Math.round(s.movesPerBar * bars)) : Math.round(s.movesPerBar * bars)
  return {
    minPerSecond: s.perSecond * 0.6,
    maxPerSecond: Math.max(s.perSecond * 1.5, 0.5),
    quickest: Math.max(3, s.quickest * 0.75),
    atOnce: Math.min(2, Math.max(1, s.atOnce)),
    moves,
    span: moves === 0 ? onePositionSpan : Math.max(onePositionSpan, s.span),
  }
}

/** The idea against the limits: problems the model gets back, empty when it fits. `notes` in
 *  ticks from the idea's start. */
export function ideaShapeProblems(notes: ShapeNote[], bars: number, tempo: number, s: TakeShape, l: IdeaLimits): string[] {
  const out: string[] = []
  const ticks = [...new Set(notes.map((n) => n.t))].sort((a, b) => a - b)
  const busy = new Set(ticks.map((t) => Math.floor(t / 48))).size
  const seconds = (Math.max(1, busy) * 4 * 60) / tempo
  const per = ticks.length / seconds
  // A take of a handful of notes says little about speed: the band is checked from 8 onsets.
  if (s.onsets >= 8) {
    if (per > l.maxPerSecond) out.push(`busier than they play: ${ticks.length} notes in ${busy} bar${busy === 1 ? '' : 's'} with notes is ${per.toFixed(2)} a second, and they played ${s.perSecond.toFixed(2)} a second while playing; keep it under ${l.maxPerSecond.toFixed(2)} (at most ${Math.floor(l.maxPerSecond * seconds)} notes)`)
    if (per < l.minPerSecond) out.push(`sparser than they play: ${per.toFixed(2)} a second against their ${s.perSecond.toFixed(2)}; at least ${Math.ceil(l.minPerSecond * seconds)} notes in the bars that play, so it is as lively as they were`)
  }
  const gaps = ticks.slice(1).map((t, i) => t - ticks[i])
  const quick = gaps.filter((g) => g < l.quickest)
  if (quick.length) out.push(`quicker than they played: notes ${valueName(Math.min(...quick))} apart, and their quickest were ${valueName(s.quickest)}; nothing quicker than ${valueName(s.quickest)}`)
  const together = Math.max(0, ...[...new Set(notes.map((n) => n.t))].map((t) => notes.filter((n) => n.t === t).length))
  if (together > l.atOnce) out.push(l.atOnce === 1 ? 'they played one note at a time: the idea is a line, one note at a time' : `at most ${l.atOnce} keys at once, as they played`)
  return out
}

/** The whole track's density and hand, from the take (the solo is the take's level over a
 *  whole song): 0.8× to 1.3× their notes a second with the rests (between 0.3 and 2.5), their
 *  quick step for the grid (sixteenths only when they played them), and their hand's moves a
 *  bar over the song, a quarter more, at least 2 (a figure or two for interest). */
export type TrackLimits = { minPerSecond: number; maxPerSecond: number; sixteenths: boolean; moves: number; moments: number; positions: number; span: number }

export function trackLimits(s: TakeShape, bars: number): TrackLimits {
  const base = Math.min(2.5, Math.max(0.45, s.overall))
  let min = Math.max(0.3, base * 0.8), max = Math.min(2.6, base * 1.3)
  if (max - min < 0.3) max = min + 0.3
  const moves = Math.max(2, Math.round(s.movesPerBar * bars * 1.25))
  return {
    minPerSecond: +min.toFixed(2),
    maxPerSecond: +max.toFixed(2),
    sixteenths: s.quickest <= 4,
    moves,
    moments: Math.max(1, Math.ceil(moves / 2)),
    positions: Math.max(s.hand.positions, 2),
    span: Math.max(12, s.span),
  }
}
