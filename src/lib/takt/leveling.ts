// The leveling sheet's numbers (apps/takt/LEVELING.md §2) for the agents: what a hand may be
// asked to do at a map level, and the home position a Level 1 line is written in. The sheet
// is the source; change it there first, then here, then Game/Fingering.swift + LessonCheck.

import { type FingeredNote, type HandFigures, NAMES_SHARP, handFigures, handLine, whiteIndex } from './fingering'

export type HandBudget = {
  level: number
  positions: number
  moves: number
  moments: number
  /** Semitones, the widest interval of the line. */
  span: number
}

/** The budget of a map level (LEVELING.md §2). `solo` tightens Level 1 for the improv
 *  teacher's whole track (Bart: "maybe 4 times"). */
export function handBudget(level: number, solo = false): HandBudget {
  const l = Math.max(1, Math.round(level))
  if (l <= 1) return solo ? { level: 1, positions: 2, moves: 4, moments: 2, span: 12 } : { level: 1, positions: 3, moves: 6, moments: 3, span: 13 }
  if (l === 2) return { level: 2, positions: 3, moves: 12, moments: 6, span: 24 }
  if (l === 3) return { level: 3, positions: 4, moves: 20, moments: 10, span: 24 }
  if (l <= 6) return { level: l, positions: 5, moves: 30, moments: 15, span: 24 }
  return { level: l, positions: 99, moves: 999, moments: 999, span: 48 }
}

/** "at most 4 hand moves in 2 places, 2 positions, inside an octave" */
export function budgetLine(b: HandBudget): string {
  if (b.moves >= 999) return 'no cap on hand moves at this level (the figure is still printed)'
  const span = b.span <= 10 ? 'a seventh' : b.span <= 12 ? 'an octave' : b.span <= 13 ? 'an octave and a step' : b.span <= 16 ? 'a tenth' : 'two octaves'
  return `at most ${b.moves} hand moves in the whole piece, in at most ${b.moments} place${b.moments === 1 ? '' : 's'}, at most ${b.positions} hand position${b.positions === 1 ? '' : 's'}, the line inside ${span} (${b.span} semitones)`
}

export type HomePosition = {
  /** The keys of the position, lowest first (MIDI). */
  keys: number[]
  /** The lowest and highest note the line may use: the position and a scale step either side. */
  low: number
  high: number
}

/** The hand's home for a line on `scale` (pitch classes; the white keys when null) near
 *  `notes`: the window of `width` consecutive scale keys that holds most of the notes played
 *  (the lowest such window on a tie, so the thumb sits where they already play), with one step
 *  either side as the reach the figures may use. */
export function homePosition(notes: FingeredNote[], scale: number[] | null, width = 5, lowest = 48, highest = 96): HomePosition {
  const pcs = scale ?? [0, 2, 4, 5, 7, 9, 11]
  const keys: number[] = []
  for (let n = lowest; n <= highest; n++) if (pcs.includes(((n % 12) + 12) % 12)) keys.push(n)
  const counts = new Map<number, number>()
  for (const x of notes) counts.set(x.n, (counts.get(x.n) ?? 0) + 1)
  let best = 0, at = keys.findIndex((k) => k >= 60)
  if (at < 0) at = 0
  for (let i = 0; i + width <= keys.length; i++) {
    const window = keys.slice(i, i + width)
    const c = window.reduce((s, k) => s + (counts.get(k) ?? 0), 0)
    if (c > best) {
      best = c
      at = i
    }
  }
  const pos = keys.slice(at, at + width)
  const low = keys[Math.max(0, at - 1)], high = keys[Math.min(keys.length - 1, at + width)]
  return { keys: pos, low, high }
}

export const noteNameSharp = (n: number) => `${NAMES_SHARP[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`

/** "thumb on D4, then E4 F4 G4, pinky on A4" (right hand). */
export function homeLine(h: HomePosition, right = true): string {
  const k = right ? h.keys : [...h.keys].reverse()
  const inner = k.slice(1, -1).map(noteNameSharp).join(' ')
  return `${right ? 'thumb' : 'pinky'} on ${noteNameSharp(k[0])}, then ${inner}, ${right ? 'pinky' : 'thumb'} on ${noteNameSharp(k[k.length - 1])}`
}

/** The hand problems of a fingered line against a budget, in the model's own terms, each
 *  naming the bars concerned; empty when inside it. */
export function handProblems(notes: FingeredNote[], f: HandFigures, b: HandBudget, ticksPerBar: number): string[] {
  const out: string[] = []
  const barOf = (t: number) => Math.floor(t / ticksPerBar) + 1
  const bars = f.moves.map((m) => `${barOf(notes[m.index].t)}${m.kind === 'tuck' ? ' (thumb under)' : m.kind === 'over' ? ' (over the thumb)' : ''}`)
  const list = (xs: string[]) => (xs.length > 10 ? `${xs.slice(0, 10).join(', ')} and ${xs.length - 10} more` : xs.join(', '))
  if (f.moves.length > b.moves || f.moments > b.moments) {
    out.push(`the hand moves ${f.moves.length} times in ${f.moments} place${f.moments === 1 ? '' : 's'} (fingered as the app will: ${handLine(f)}); a Level ${b.level} line allows ${budgetLine(b)}. The moves are at bars ${list(bars)}. Keep the whole line inside one hand position and leave it only for the figures allowed, each coming straight back`)
  } else if (f.positions > b.positions) {
    out.push(`the line sits in ${f.positions} hand positions; a Level ${b.level} line allows ${b.positions}. Moves at bars ${list(bars)}`)
  }
  if (f.span > b.span) {
    const ps = notes.map((n) => n.n)
    out.push(`the line is ${f.span} semitones wide (${noteNameSharp(Math.min(...ps))} to ${noteNameSharp(Math.max(...ps))}); a Level ${b.level} line stays inside ${b.span} semitones`)
  }
  return out
}

/** Convenience: finger and judge in one go. */
export function judgeHand(notes: FingeredNote[], level: number, right: boolean, ticksPerBar: number, solo = false): { figures: HandFigures; problems: string[] } {
  const figures = handFigures(notes, right, ticksPerBar / 4)
  return { figures, problems: handProblems(notes, figures, handBudget(level, solo), ticksPerBar) }
}

export { whiteIndex }
