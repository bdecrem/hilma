// Fingers and hand positions for a one-note-at-a-time line, by hand position rather than by
// pitch: a port of the app's Game/Fingering.swift (0.1 (104)), so the server can judge a line
// the improv teacher or Agent mode wrote the way the Stage will finger it, and count how often
// the hand has to move (apps/takt/LEVELING.md: hand moves are an axis of difficulty beside
// onsets a second). Keep the two in step: the Swift is the original; `-LessonCheck` prints the
// moves per tier the app computes, and scripts/takt/solo-check.ts checks this port against the
// figures listed there.

export type FingeredNote = { t: number; n: number }

export const NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/** What two fingers of the right hand reach going up (the lower finger on the lower key), in
 *  semitones: comfortable, and the most they stretch. Keyed `lower * 10 + upper`. */
const REACH: Record<number, { easy: number; max: number }> = {
  12: { easy: 5, max: 7 }, 13: { easy: 7, max: 9 }, 14: { easy: 9, max: 11 }, 15: { easy: 12, max: 14 },
  23: { easy: 3, max: 4 }, 24: { easy: 5, max: 6 }, 25: { easy: 7, max: 9 },
  34: { easy: 3, max: 4 }, 35: { easy: 5, max: 7 },
  45: { easy: 3, max: 4 },
}

const crossCost = (a: number) => ({ 3: 1.4, 4: 1.6, 2: 2.0 } as Record<number, number>)[a] ?? 3.0
/** A crossing covers a fourth at most; past that the hand jumps. */
export const CROSS_MAX = 5

const shiftCost = (gapBeats: number) => (gapBeats >= 2 ? 1 : gapBeats >= 1 ? 2.5 : 5)

export const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12)

const fingersApart = (s: number) => Math.max(1, Math.min(4, Math.round(s / 2)))

function cost(a: number, b: number, d: number, gap: number): number {
  const shift = shiftCost(gap)
  if (d === 0) return a === b ? 0 : 1
  if (gap <= 0) {
    const r = REACH[Math.min(a, b) * 10 + Math.max(a, b)]
    if (!((d > 0) === (b > a)) || a === b || !r || Math.abs(d) > r.max) return 50
    return Math.abs(d) <= r.easy ? 0 : (Math.abs(d) - r.easy) * 1.5
  }
  // Inside a beat there is no time to move the hand (0.1 (115), Halsted): no finger slides to
  // another key within the octave, and within a fifth nothing crosses but the thumb under 2–4
  // (or 2–4 over it) and no pair stretches past its reach.
  if (gap <= 1 && Math.abs(d) <= 12) {
    if (a === b) return 50
    if (Math.abs(d) <= 7) {
      if ((d > 0) === b > a) {
        if (Math.abs(d) > REACH[Math.min(a, b) * 10 + Math.max(a, b)]!.max) return 50
      } else {
        const thumbCross = d > 0 ? b === 1 && a >= 2 && a <= 4 : a === 1 && b >= 2 && b <= 4
        if (!(thumbCross && Math.abs(d) <= CROSS_MAX)) return 50
      }
    }
  }
  if (a === b) return Math.abs(d) <= 2 && gap >= 1.5 ? 1 : shift + 0.5
  const up = d > 0
  const s = Math.abs(d)
  if (up === b > a) {
    const k = Math.abs(b - a)
    const r = REACH[Math.min(a, b) * 10 + Math.max(a, b)]!
    if (s <= r.easy) return 0.3 * Math.abs(k - fingersApart(s))
    if (s <= r.max) return 1.5 * (s - r.easy)
    return shift
  }
  if (up && b === 1 && s <= CROSS_MAX) return Math.min(crossCost(a) + 0.1 * s, shift)
  if (!up && a === 1 && s <= CROSS_MAX) return Math.min(crossCost(b) + 0.1 * s, shift)
  return shift + 1
}

const unary = (f: number, n: number) => (isBlack(n) ? (f === 1 ? 0.5 : f === 5 ? 0.3 : 0) : 0)

/** The fingers (1–5) of `notes` in time order, one each, for the right hand or, mirrored, the
 *  left: the same dynamic program as the app's. */
export function plan(notes: FingeredNote[], right = true, ticksPerBeat = 12): number[] {
  const n = notes.length
  if (!n) return []
  const best: number[][] = Array.from({ length: n }, () => new Array<number>(5).fill(0))
  const from: number[][] = Array.from({ length: n }, () => new Array<number>(5).fill(0))
  const key = (i: number) => (right ? notes[i].n : -notes[i].n)
  for (let f = 0; f < 5; f++) best[0][f] = unary(f + 1, notes[0].n)
  for (let i = 1; i < n; i++) {
    const d = key(i) - key(i - 1)
    const gap = (notes[i].t - notes[i - 1].t) / ticksPerBeat
    for (let b = 0; b < 5; b++) {
      let low = Infinity, arg = 0
      for (let a = 0; a < 5; a++) {
        const c = best[i - 1][a] + cost(a + 1, b + 1, d, gap)
        if (c < low) {
          low = c
          arg = a
        }
      }
      best[i][b] = low + unary(b + 1, notes[i].n)
      from[i][b] = arg
    }
  }
  let f = 0
  for (let b = 1; b < 5; b++) if (best[n - 1][b] < best[n - 1][f]) f = b
  const out = new Array<number>(n)
  for (let i = n - 1; i >= 0; i--) {
    out[i] = f + 1
    f = from[i][f]
  }
  return out
}

// MARK: Hand positions

/** The white-key index of a MIDI note (a black key counts as the white key under it), so a
 *  hand position can be read as "where the thumb sits" in keys, the way a hand lies. */
export function whiteIndex(n: number): number {
  const pc = ((n % 12) + 12) % 12
  const oct = Math.floor(n / 12)
  return oct * 7 + [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pc]
}

/** Where the hand sits for a note under a finger: the white key the thumb lies on (right
 *  hand; mirrored for the left, the pinky's key), with finger f sitting f − 1 keys over it. */
export function thumbKey(n: number, finger: number, right = true): number {
  return right ? whiteIndex(n) - (finger - 1) : whiteIndex(n) + (finger - 1)
}

export type HandMove = {
  /** Index into the notes of the note the hand moves onto. */
  index: number
  /** Keys moved (white keys), signed. */
  by: number
  /** A thumb-under or a finger over the thumb (the hand turns), or a jump. */
  kind: 'tuck' | 'over' | 'jump'
}

/** How often the hand moves over a fingered line. The hand sits where its thumb lies; a note
 *  under finger f says the thumb is f − 1 white keys under it. A hand in one position reads
 *  within a key of itself (a stretch, 1 on F and 5 on D; the thumb on F reaching down to E),
 *  so the position is the span of thumb keys read since the last move, and a note that would
 *  widen that span past two keys is a move. A thumb-under going up or a finger over the thumb
 *  coming down is a move too (the hand turns onto a new position). Rests don't matter: a hand
 *  that jumps a fifth after a two-bar rest still had to find the new place. */
export function handMoves(notes: FingeredNote[], fingers: number[], right = true): HandMove[] {
  const moves: HandMove[] = []
  if (notes.length < 2) return moves
  let lo = thumbKey(notes[0].n, fingers[0], right), hi = lo
  for (let i = 1; i < notes.length; i++) {
    const d = (right ? 1 : -1) * (notes[i].n - notes[i - 1].n)
    const fa = fingers[i - 1], fb = fingers[i]
    const here = thumbKey(notes[i].n, fb, right)
    const tuck = d > 0 && fb === 1 && fa > 1
    const over = d < 0 && fa === 1 && fb > 1
    if (tuck || over || Math.max(hi, here) - Math.min(lo, here) > 2) {
      moves.push({ index: i, by: here - Math.round((lo + hi) / 2), kind: tuck ? 'tuck' : over ? 'over' : 'jump' })
      lo = hi = here
    } else {
      lo = Math.min(lo, here)
      hi = Math.max(hi, here)
    }
  }
  return moves
}

/** The distinct hand positions a fingered line sits in: one per move that lands somewhere the
 *  hand has not sat before (within a key). */
export function handPositions(notes: FingeredNote[], fingers: number[], right = true): number[] {
  if (!notes.length) return []
  const out: number[] = [thumbKey(notes[0].n, fingers[0], right)]
  for (const m of handMoves(notes, fingers, right)) {
    const k = thumbKey(notes[m.index].n, fingers[m.index], right)
    if (!out.some((p) => Math.abs(p - k) <= 1)) out.push(k)
  }
  return out.sort((a, b) => a - b)
}

/** Moves within two bars of each other are one moment to the player (a tuck up into a figure
 *  and the hand coming back): how many such moments a line has. */
export function handMoments(notes: FingeredNote[], moves: HandMove[], ticksPerBar = 48): number {
  let count = 0, last = -Infinity
  for (const m of moves) {
    const t = notes[m.index].t
    if (t - last >= 2 * ticksPerBar) count++
    last = t
  }
  return count
}

/** The hand's figures: a line's moves, fingered by the app's rule, as the leveling sheet counts
 *  them: moves, positions, the widest span in semitones. */
export type HandFigures = { moves: HandMove[]; moments: number; positions: number; span: number; fingers: number[] }

export function handFigures(notes: FingeredNote[], right = true, ticksPerBeat = 12): HandFigures {
  const fingers = plan(notes, right, ticksPerBeat)
  const moves = handMoves(notes, fingers, right)
  const positions = handPositions(notes, fingers, right).length
  const pitches = notes.map((n) => n.n)
  const span = pitches.length ? Math.max(...pitches) - Math.min(...pitches) : 0
  return { moves, moments: handMoments(notes, moves, ticksPerBeat * 4), positions, span, fingers }
}

/** "3 hand moves (2 moments), 2 positions, a tenth": the figures as a phrase. */
export function handLine(f: HandFigures): string {
  const span = f.span <= 9 ? 'inside a sixth' : f.span <= 12 ? 'inside an octave' : f.span <= 16 ? 'inside a tenth' : `${f.span} semitones wide`
  return `${f.moves.length} hand move${f.moves.length === 1 ? '' : 's'}${f.moves.length ? ` (${f.moments} moment${f.moments === 1 ? '' : 's'})` : ''}, ${f.positions} position${f.positions === 1 ? '' : 's'}, ${span}`
}
