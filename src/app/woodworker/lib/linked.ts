// Room 4, Linked: the cutlery rack. Five trays slide left and right, each with
// one hole drilled in it; the spoon drops through when every hole lines up over
// the bowl. Gerrit "saved string" by tying trays together: pulling a tray drags
// the trays its strings lead to (the same way, or the opposite way over a
// pulley), and they drag theirs. Strings only pull one way. A move is blocked
// when any tray in the chain would hit its stop. One move is one tray, one notch.
import type { Rules } from './engine'

export interface LinkedTray {
  label: string
  /** The hole's leftmost and rightmost column (its stops). */
  lo: number
  hi: number
}
export interface LinkedLevel {
  cols: number
  trays: LinkedTray[]
  /** Pulling tray a moves tray b by k times as much (k = 1 same way, -1 over a pulley). */
  links: { a: number; b: number; k: 1 | -1 }[]
  /** The column of the spoon above and the bowl below. */
  shaft: number
}
/** The hole column of each tray. */
export type LinkedState = number[]
export type LinkedMove = { tray: number; d: 1 | -1 }

export interface Pull {
  state: LinkedState | null
  /** How far each tray moves (0 = not in the chain). */
  delta: number[]
  /** The tray that hit its stop, or the one two strings fight over. */
  stuck: number | null
}

export function pull(L: LinkedLevel, s: LinkedState, m: LinkedMove): Pull {
  const delta = s.map(() => 0)
  delta[m.tray] = m.d
  const queue = [m.tray]
  for (let h = 0; h < queue.length; h++) {
    const a = queue[h]
    for (const l of L.links) {
      if (l.a !== a) continue
      const want = delta[a] * l.k
      if (delta[l.b] === 0 && l.b !== m.tray) {
        delta[l.b] = want
        queue.push(l.b)
      } else if (delta[l.b] !== want) return { state: null, delta, stuck: l.b }
    }
  }
  const n = s.map((c, i) => c + delta[i])
  for (let i = 0; i < n.length; i++)
    if (n[i] < L.trays[i].lo || n[i] > L.trays[i].hi) return { state: null, delta, stuck: i }
  return { state: n, delta, stuck: null }
}

/** How many trays from the top the spoon has dropped through. */
export function spoonDepth(L: LinkedLevel, s: LinkedState): number {
  let k = 0
  while (k < s.length && s[k] === L.shaft) k++
  return k
}

export function linkedRules(L: LinkedLevel): Rules<LinkedState, LinkedMove> {
  return {
    moves: (s) => s.flatMap((_, tray) => [{ tray, d: -1 as const }, { tray, d: 1 as const }]),
    apply: (s, m) => pull(L, s, m).state,
    solved: (s) => s.every((c) => c === L.shaft),
    key: (s) => s.join(''),
  }
}
