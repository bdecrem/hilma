import { mayCarryOver } from './voice-turns'

// Replies in progress on the voice writer (scripts/venture/voice-server.ts), kept so that a few
// more words from Bart do not start a reply over (OLA-204).
//
// Both voice paths ask the writer again when he says more: the phone's engine sends his turn
// again, longer, and the bridge drops the request in flight; the talk page posts his new words.
// Before, the writer stopped the first reply the moment its caller left and wrote a new one from
// nothing, four to six seconds each time. Now a reply whose caller left goes on for `graceMs`,
// and a request for the same call (the same turns before his last line) whose last line is his
// earlier one plus a few words (mayCarryOver) takes that reply over: what is written so far at
// once, then the rest as it comes. Nobody claims it within `graceMs`: it is stopped.

export type Written = { said: boolean; why: string }
/// Writes one reply: calls onText with each piece, resolves when it is complete or stopped.
export type Writer = (onText: (t: string) => void, signal: AbortSignal) => Promise<Written>
export type Reader = { onText: (t: string) => void; onEnd: (w: Written) => void }

type Gen = {
  key: string
  asked: string
  text: string
  end: Written | null
  readers: Set<Reader>
  ac: AbortController
  started: number
  timer: ReturnType<typeof setTimeout> | null
}

export type Opened = {
  /// Another request's reply, taken over.
  carried: boolean
  /// How long that reply had been under way.
  ms: number
  /// Start reading: what is written so far comes at once.
  attach(r: Reader): void
  /// The caller went away before the end.
  leave(): void
}

const unref = (t: ReturnType<typeof setTimeout>) => ((t as { unref?: () => void }).unref?.(), t)

export function carryRegistry(opts: { graceMs: number; now?: () => number }) {
  const gens = new Set<Gen>()
  const now = opts.now ?? Date.now

  const drop = (g: Gen) => {
    if (g.timer) clearTimeout(g.timer)
    gens.delete(g)
  }
  const later = (g: Gen, fn: () => void) => {
    if (g.timer) clearTimeout(g.timer)
    g.timer = unref(setTimeout(fn, opts.graceMs))
  }

  function find(key: string, asked: string): Gen | null {
    let found: Gen | null = null
    for (const g of gens) {
      if (g.key !== key || (g.end && !g.end.said)) continue
      if (g.asked === asked || mayCarryOver(g.asked, asked)) found = g // the newest one wins
    }
    return found
  }

  /// `key` names the call and everything before his last line; `asked` is his last line.
  function open(key: string, asked: string, write: Writer): Opened {
    let g = find(key, asked)
    const carried = !!g
    if (g) {
      if (g.timer && !g.end) clearTimeout(g.timer)
      g.timer = null
      if (g.end) later(g, () => drop(g!))
    } else {
      // An older reply on the same call that nobody reads is no use to anyone now.
      for (const o of gens) if (o.key === key && !o.end && o.readers.size === 0) (o.ac.abort(), drop(o))
      const n: Gen = { key, asked, text: '', end: null, readers: new Set(), ac: new AbortController(), started: now(), timer: null }
      g = n
      gens.add(n)
      write((t) => {
        n.text += t
        for (const r of n.readers) r.onText(t)
      }, n.ac.signal)
        .catch((e): Written => ({ said: false, why: e instanceof Error ? e.message : String(e) }))
        .then((w) => {
          n.end = { said: w.said || !!n.text, why: w.why }
          for (const r of n.readers) r.onEnd(n.end)
          n.readers.clear()
          later(n, () => drop(n))
        })
    }
    const gen = g
    let reader: Reader | null = null
    return {
      carried,
      ms: now() - gen.started,
      attach(r) {
        reader = r
        if (gen.text) r.onText(gen.text)
        if (gen.end) return r.onEnd(gen.end)
        gen.readers.add(r)
      },
      leave() {
        if (!reader || !gen.readers.delete(reader) || gen.end || gen.readers.size) return
        later(gen, () => {
          if (gen.readers.size || gen.end) return
          gen.ac.abort()
          drop(gen)
        })
      },
    }
  }

  return { open, size: () => gens.size }
}

/// The key of a reply: the call (its lead) and every turn before his last line.
export function carryKey(lead: string, messages: { role: string; content: string }[]): string {
  return JSON.stringify([lead, messages.slice(0, -1)])
}
