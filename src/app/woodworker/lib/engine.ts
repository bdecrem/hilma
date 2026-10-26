// The Woodworker — one breadth-first solver for every room.
// Each mechanic describes its rules once (moves, apply, solved, key). The same
// rules find a level's par in scripts/woodworker/gen.ts, prove it in
// scripts/woodworker/check.ts, and give the Hint button a move on a shortest path.

export interface Rules<S, M> {
  /** Every move worth trying from s (apply may still refuse some). */
  moves(s: S): M[]
  /** The state after m, or null when Gerrit's woodwork won't allow it. */
  apply(s: S, m: M): S | null
  solved(s: S): boolean
  key(s: S): string
}

/** A shortest solution from start, or null when there is none. */
export function solve<S, M>(r: Rules<S, M>, start: S, limit = 2_000_000): M[] | null {
  if (r.solved(start)) return []
  const prev = new Map<string, { from: string; move: M } | null>([[r.key(start), null]])
  let frontier: S[] = [start]
  while (frontier.length && prev.size < limit) {
    const next: S[] = []
    for (const s of frontier) {
      const k = r.key(s)
      for (const m of r.moves(s)) {
        const n = r.apply(s, m)
        if (!n) continue
        const nk = r.key(n)
        if (prev.has(nk)) continue
        prev.set(nk, { from: k, move: m })
        if (r.solved(n)) {
          const path: M[] = []
          let cur = nk
          for (let step = prev.get(cur); step; step = prev.get(cur)) {
            path.unshift(step.move)
            cur = step.from
          }
          return path
        }
        next.push(n)
      }
    }
    frontier = next
  }
  return null
}

/**
 * For rules whose every move can be undone by another move (slide, swing,
 * linked, box): every state reachable from start, with its distance to the
 * nearest solved state. The generator picks a start this many moves out.
 */
export function distances<S, M>(r: Rules<S, M>, start: S, limit = 400_000): Map<string, { s: S; d: number }> | null {
  const all = new Map<string, S>([[r.key(start), start]])
  const queue: S[] = [start]
  for (let h = 0; h < queue.length; h++) {
    if (all.size > limit) return null
    for (const m of r.moves(queue[h])) {
      const n = r.apply(queue[h], m)
      if (!n) continue
      const k = r.key(n)
      if (!all.has(k)) {
        all.set(k, n)
        queue.push(n)
      }
    }
  }
  const out = new Map<string, { s: S; d: number }>()
  let frontier: S[] = []
  for (const [k, s] of all) if (r.solved(s)) (out.set(k, { s, d: 0 }), frontier.push(s))
  for (let d = 1; frontier.length; d++) {
    const next: S[] = []
    for (const s of frontier)
      for (const m of r.moves(s)) {
        const n = r.apply(s, m)
        if (!n) continue
        const k = r.key(n)
        if (!out.has(k)) (out.set(k, { s: n, d }), next.push(n))
      }
    frontier = next
  }
  return out
}
