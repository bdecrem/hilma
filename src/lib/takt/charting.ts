// The Stage's charter, ported line for line from apps/takt/Takt/Game/Charting.swift (CHARTING.md
// is the guide): how a part becomes a level. Agent mode runs it on the server so the agent
// measures exactly what the app will play — onsets a second per tier, the rung a request lands
// on — before it answers. The app's charting.json comes in from the client with every request
// (the app's copy is the truth; nothing here is content), and a mod carries its own per-song
// override in the same shape as charting.json's `songs.<name>`.
//
// `scripts/takt/charting-check.ts` proves the port: every song, part and tier charts to the same
// mask the app's `-DumpCharts` writes.

import { type PartKey, type PartNote, type SongFile, musicBars, seconds as songSeconds, sortedNotes, ticksPerBar } from './songfile'
import { type HandFigures, handFigures, handLine } from './fingering'

export type Tier = {
  line: string
  notes: number | null
  hits: number
  gap: number
  space: number | null
  bonus: number
  phrase?: number | null
  fromAbove?: boolean | null
  minBeats?: number | null
}

export type TierPatch = { gap?: number | null; space?: number | null; minBeats?: number | null }

export type PartOverride = {
  beginner?: number | null
  easy?: number | null
  'easy+'?: number | null
  medium?: number | null
  hard?: number | null
  phrase?: number | null
  tiers?: Record<string, TierPatch> | null
}

export type SongOverride = Partial<Record<PartKey, PartOverride>>

export type Ladder = {
  keep: string[] | null
  phrase?: number | null
  beginner: number
  easy: number
  /** The rung between Easy and Medium (0.1 (109)); an older app's charting.json has none. */
  'easy+'?: number | null
  medium: number
  hard: number
  tiers: Tier[]
}

/** When Adaptive puts rungs of its own between two tiers (`rungs`): a step adding at least
 *  `share` of the lower tier's notes or `keys` new keys gets one, a step adding `twoShare` or
 *  `twoKeys` gets two. */
export type Ghosts = { share: number; keys: number; twoShare: number; twoKeys: number }

export type Adaptive = { start: number; window: number; ahead: number; ghosts?: Ghosts | null } & Record<string, unknown>

export type Charting = {
  chords: Ladder
  melody: Ladder
  adaptive: Adaptive
  songs: Record<string, SongOverride>
}

export type Difficulty = 'beginner' | 'easy' | 'easy+' | 'medium' | 'hard' | 'adaptive'
export type FixedDifficulty = Exclude<Difficulty, 'adaptive'>
export const DIFFICULTIES: FixedDifficulty[] = ['beginner', 'easy', 'easy+', 'medium', 'hard']

export function looksLikeCharting(x: unknown): x is Charting {
  if (!x || typeof x !== 'object') return false
  const c = x as Partial<Charting>
  const ladder = (l: unknown) =>
    !!l && typeof l === 'object' && Array.isArray((l as Ladder).tiers) && (l as Ladder).tiers.length >= 1 &&
    ['beginner', 'easy', 'medium', 'hard'].every((k) => typeof (l as Record<string, unknown>)[k] === 'number')
  return ladder(c.chords) && ladder(c.melody) && !!c.adaptive && typeof c.adaptive.start === 'number'
}

export function ladder(c: Charting, part: PartKey): Ladder {
  return part === 'chords' ? c.chords : c.melody
}

function patched(t: Tier, p: TierPatch): Tier {
  return {
    ...t,
    gap: p.gap ?? t.gap,
    space: p.space != null ? (p.space > 0 ? p.space : null) : t.space,
    minBeats: p.minBeats != null ? (p.minBeats > 0 ? p.minBeats : null) : t.minBeats,
  }
}

/** The phrase (bars) the song's part keeps every key in: the song's own, or the ladder's. */
export function phraseOf(c: Charting, override: SongOverride | null, part: PartKey): number | null {
  const own = override?.[part]?.phrase
  if (own != null) return Math.max(1, own)
  return ladder(c, part).phrase ?? null
}

/** The ladder's tiers as the song plays them: the song's patches applied. */
export function tiersOf(c: Charting, override: SongOverride | null, part: PartKey): Tier[] {
  const l = ladder(c, part)
  const patches = override?.[part]?.tiers
  if (!patches) return l.tiers
  return l.tiers.map((t, i) => (patches[String(i + 1)] ? patched(t, patches[String(i + 1)]) : t))
}

/** The tier a fixed difficulty plays (null on adaptive). */
export function tierFor(c: Charting, override: SongOverride | null, part: PartKey, d: Difficulty): number | null {
  const l = ladder(c, part)
  const own = d !== 'adaptive' ? override?.[part]?.[d] : null
  if (own != null) return Math.max(1, Math.min(l.tiers.length, own))
  switch (d) {
    case 'beginner': return l.beginner
    case 'easy': return l.easy
    case 'easy+': return l['easy+'] ?? l.easy
    case 'medium': return l.medium
    case 'hard': return l.hard
    default: return null
  }
}

/** Charting.swift's `validate`, for one song's override: tiers in range, phrase ≥ 1, patches
 *  ≥ 0, and the patched ladder still loosens going up. The message, or null. */
export function validateOverride(c: Charting, override: SongOverride): string | null {
  for (const part of ['chords', 'melody'] as PartKey[]) {
    const o = override[part]
    if (!o) continue
    const l = ladder(c, part)
    const n = l.tiers.length
    for (const d of DIFFICULTIES) {
      const v = o[d]
      if (v != null && !(Number.isInteger(v) && v >= 1 && v <= n)) return `${part}.${d}: tier ${v} is not 1…${n}`
    }
    if (o.phrase != null && !(Number.isInteger(o.phrase) && o.phrase >= 1)) return `${part}.phrase must be a whole number of bars, 1 or more`
    for (const [k, p] of Object.entries(o.tiers ?? {})) {
      const i = Number(k)
      if (!(Number.isInteger(i) && i >= 1 && i <= n)) return `${part}.tiers: ${k} is not a tier (1…${n})`
      if (p.gap != null && !(p.gap >= 0)) return `${part}.tiers.${k}.gap must be 0 or more`
      if (p.space != null && !(p.space >= 0)) return `${part}.tiers.${k}.space must be 0 or more (0 = never borrows)`
      if (p.minBeats != null && !(p.minBeats >= 0)) return `${part}.tiers.${k}.minBeats must be 0 or more (0 = any length)`
    }
    const tiers = tiersOf(c, override, part)
    const ladderPhrase = l.phrase ?? 1
    for (let i = 1; i < tiers.length; i++) {
      const lo = tiers[i - 1], hi = tiers[i]
      const ok =
        hi.gap <= lo.gap &&
        hi.hits >= lo.hits &&
        (hi.notes ?? Infinity) >= (lo.notes ?? Infinity) &&
        (hi.phrase ?? ladderPhrase) <= (lo.phrase ?? ladderPhrase) &&
        (hi.minBeats ?? 0) <= (lo.minBeats ?? 0) &&
        (hi.space ?? Infinity) > hi.gap
      if (!ok) return `${part}: tier ${i + 1} tightens a rule over tier ${i} (gap, hits, notes and phrase may only loosen; space must exceed the gap)`
    }
  }
  return null
}

type Onset = { t: number; lv: number; idx: number[] }

/** Which of `notes` (the whole part, in time order) play at each tier: `[tier - 1][i]`. */
export function masks(
  c: Charting,
  override: SongOverride | null,
  notes: PartNote[],
  part: PartKey,
  tempo: number,
  ticksPerBeat: number,
  tpb: number,
): boolean[][] {
  const l = ladder(c, part)
  const ladderPhrase = phraseOf(c, override, part)
  const tiers = tiersOf(c, override, part)
  const secondsPerTick = 60 / (tempo * ticksPerBeat)
  // Onsets: the notes that start on one tick, with the lightest weight among them.
  const onsets: Onset[] = []
  notes.forEach((n, i) => {
    const last = onsets[onsets.length - 1]
    if (last && last.t === n.t) {
      last.idx.push(i)
      last.lv = Math.min(last.lv, n.lv)
    } else {
      onsets.push({ t: n.t, lv: n.lv, idx: [i] })
    }
  })
  // The part's usual weight-1 length: the median (the longest of a tie).
  const anchors = notes.filter((n) => n.lv === 1).map((n) => n.len).sort((a, b) => a - b)
  const usualLength = anchors.length ? anchors[Math.floor(anchors.length / 2)] : Number.MAX_SAFE_INTEGER
  const rank = (n: PartNote): number => {
    if (!l.keep) return 0
    const i = l.keep.indexOf(n.r ?? '')
    return i >= 0 ? i : l.keep.length
  }
  let seed = new Set<number>()
  let preferred = new Set<number>()
  let aboveRule = new Set<number>()

  return tiers.map((tier, ti) => {
    let mask: boolean[] = new Array(notes.length).fill(false)
    // What this tier sees at all: a note with `from` is on no chart under that tier, in any
    // pass (the phrase cover too), so a figure's new keys don't leak into the levels under it.
    // An onset keeps the notes the tier sees, the lightest weight among them. Same as Charting.swift.
    const seen = (tierNumber: number): Onset[] =>
      onsets.flatMap((o) => {
        const idx = o.idx.filter((i) => (notes[i].from ?? 1) <= tierNumber)
        return idx.length ? [{ t: o.t, lv: Math.min(...idx.map((i) => notes[i].lv)), idx }] : []
      })
    const visible = seen(ti + 1)
    let gapTicks = tier.gap / secondsPerTick
    let taken: number[] = []
    let isTaken = new Set<number>()
    const prefer = preferred
    let preferNext = new Set<number>()

    const lowerBound = (t: number): number => {
      let lo = 0, hi = taken.length
      while (lo < hi) {
        const m = (lo + hi) >> 1
        if (taken[m] < t) lo = m + 1
        else hi = m
      }
      return lo
    }
    const fits = (t: number): boolean => {
      const lo = lowerBound(t)
      if (lo < taken.length && taken[lo] - t < gapTicks - 0.001) return false
      if (lo > 0 && t - taken[lo - 1] < gapTicks - 0.001) return false
      return true
    }
    const take = (o: Onset) => {
      taken.splice(lowerBound(o.t), 0, o.t)
      isTaken.add(o.t)
      let kept = o.idx
      const cap = tier.notes
      if (cap != null && kept.length > cap) {
        // By the keep order, low first; a role already kept (the root an octave up) goes last,
        // so two notes are root and third (or fifth), never an octave. Same as Charting.swift.
        const sorted = [...kept].sort((a, b) => rank(notes[a]) - rank(notes[b]) || notes[a].n - notes[b].n)
        const seen = new Set<string>()
        const firsts: number[] = [], repeats: number[] = []
        for (const i of sorted) {
          const r = notes[i].r ?? ''
          if (seen.has(r)) repeats.push(i)
          else { seen.add(r); firsts.push(i) }
        }
        kept = [...firsts, ...repeats].slice(0, cap)
      }
      for (const i of kept) mask[i] = true
    }
    const untake = (o: Onset) => {
      const at = taken.indexOf(o.t)
      if (at >= 0) taken.splice(at, 1)
      isTaken.delete(o.t)
      for (const i of o.idx) mask[i] = false
    }
    const phrasePass = (pool: Onset[], span: number, slot: number | null, prefer: Set<number>) => {
      if (!pool.length) return
      const last = pool[pool.length - 1].t
      for (let p = 0; p <= Math.floor(last / span); p++) {
        const window = pool.filter((o) => o.t >= p * span && o.t < (p + 1) * span).sort((a, b) => a.lv - b.lv || a.t - b.t)
        const keys: number[] = []
        for (const o of window) for (const i of o.idx) if (!keys.includes(notes[i].n)) keys.push(notes[i].n)
        const open = keys.filter((key) => !window.some((o) => isTaken.has(o.t) && o.idx.some((i) => notes[i].n === key)))
        let chosen: number[] = []
        let best: number[] = []
        // The app's budget (Charting.swift): a phrase whose keys can't all fit would try every
        // subset; past it the widest cover found so far stands.
        let steps = 0
        const budget = 200_000
        const search = (k: number): boolean => {
          if (k === open.length) {
            if (chosen.length > best.length) best = [...chosen]
            return chosen.length === open.length
          }
          steps += 1
          if (steps > budget) return false
          if (chosen.length + (open.length - k) <= best.length) return false
          const cands = window
            .map((_, wi) => wi)
            .filter((wi) => {
              const o = window[wi]
              return !isTaken.has(o.t) && o.idx.some((i) => notes[i].n === open[k]) && fits(o.t)
            })
          const used = new Set(chosen.map((wi) => (slot != null ? Math.floor((window[wi].t - p * span) / slot) : 0)))
          const key = (wi: number) => {
            const o = window[wi]
            const pa = prefer.has(o.t) ? 0 : 1
            const ua = slot != null ? (used.has(Math.floor((o.t - p * span) / slot)) ? 1 : 0) : 0
            return [pa, o.lv, ua, o.t]
          }
          cands.sort((a, b) => {
            const ka = key(a), kb = key(b)
            for (let i = 0; i < 4; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
            return 0
          })
          for (const wi of cands) {
            const o = window[wi]
            take(o)
            chosen.push(wi)
            if (search(k + 1)) return true
            untake(o)
            chosen.pop()
          }
          return search(k + 1)
        }
        if (!search(0)) for (const wi of best) take(window[wi])
      }
    }
    const difference = (a: Set<number>, b: Set<number>): Set<number> => {
      const out = new Set<number>()
      for (const x of a) if (!b.has(x)) out.add(x)
      return out
    }
    const chart = (t: Tier, pool: Onset[], prefer: Set<number>): { picks: Set<number>; rule: Set<number> } => {
      gapTicks = t.gap / secondsPerTick
      const before = new Set(isTaken)
      const phrase = t.phrase ?? ladderPhrase
      if (phrase != null) {
        const span = phrase * tpb
        const slotRaw = ladderPhrase != null ? ladderPhrase * tpb : null
        const slot = slotRaw != null && slotRaw < span ? slotRaw : null
        phrasePass(pool, span, slot, prefer)
      }
      const byPhrase = difference(isTaken, before)
      for (const o of [...pool].sort((a, b) => a.lv - b.lv || a.t - b.t)) {
        if (o.lv <= t.hits && !isTaken.has(o.t) && fits(o.t)) take(o)
      }
      const picks = phrase != null ? byPhrase : difference(isTaken, before)
      const rule = difference(isTaken, before)
      if (t.space != null) {
        const spaceTicks = t.space / secondsPerTick
        let changed = true
        while (changed) {
          changed = false
          let holes: [number, number][] = []
          for (let i = 1; i < taken.length; i++) if (taken[i] - taken[i - 1] > spaceTicks + 0.001) holes.push([taken[i - 1], taken[i]])
          if (taken.length && visible.length) {
            const f = taken[0], o = visible[0]
            if (f - o.t > spaceTicks) holes.unshift([o.t - 1, f])
            const lt = taken[taken.length - 1], oz = visible[visible.length - 1]
            if (oz.t - lt > spaceTicks) holes.push([lt, oz.t + 1])
          }
          if (!taken.length && visible.length) holes = [[visible[0].t - 1, visible[visible.length - 1].t + 1]]
          for (const [a, z] of holes) {
            const mid = (a + z) / 2
            let pick: Onset | null = null
            for (const o of pool) {
              if (!(o.t > a && o.t < z && !isTaken.has(o.t) && fits(o.t))) continue
              if (!pick || o.lv < pick.lv || (o.lv === pick.lv && Math.abs(o.t - mid) < Math.abs(pick.t - mid))) pick = o
            }
            if (pick) {
              take(pick)
              changed = true
            }
          }
        }
      }
      return { picks, rule }
    }
    // The tier below, whole (its onsets fit this tier's gap: the ladder only loosens).
    for (const o of visible) if (seed.has(o.t)) take(o)
    if (ti === 1 && tiers[0].fromAbove === true) {
      for (const o of visible) if (aboveRule.has(o.t) && !isTaken.has(o.t) && fits(o.t)) take(o)
    }
    const allowed = (t: Tier, pool: Onset[]): Onset[] => {
      const beats = t.minBeats
      if (beats == null || !(beats > 0)) return pool
      const minLen = Math.min(Math.round(beats * ticksPerBeat), usualLength)
      return pool.filter((o) => o.idx.some((i) => notes[i].len >= minLen))
    }
    let pool = visible
    if (ti === 0 && tier.fromAbove === true) {
      const saved = { taken: [...taken], isTaken: new Set(isTaken), mask: [...mask] }
      const above = chart(tiers[1], allowed(tiers[1], seen(2)), new Set())
      taken = saved.taken
      isTaken = saved.isTaken
      mask = saved.mask
      preferNext = above.picks
      aboveRule = above.rule
      pool = visible.filter((o) => above.rule.has(o.t))
    }
    chart(tier, allowed(tier, pool), prefer)
    seed = isTaken
    preferred = preferNext
    return mask
  })
}

/** A rung of Adaptive's ladder: a tier (`step` 0), or one of the `steps` rungs Adaptive puts
 *  between it and the tier above (`step` 1…steps), never offered as a difficulty. */
export type Rung = { tier: number; step: number; steps: number; mask: boolean[] }

/** Adaptive's ladder (Bart, 2026-11-13, on Restlicht's melody: Easy "just two notes", Medium
 *  "5 notes / fingers, quite spread out", Adaptive toggling between them; he asked for "a little
 *  algorithm that can make up a difficulty in between… or 'ghost difficulties' not shown in the
 *  ui that are used for adaptive mode"). Every tier, and between two neighbours whose step is big
 *  (`Ghosts`), one or two rungs made from the two: the lower tier plus part of what the upper one
 *  adds, in this order: the notes it adds on the lower tier's own onsets (a chord's next note);
 *  then, on a melody, each new key with every note of it, nearest the lower tier's keys first,
 *  then the new onsets on the keys the hand already has (more of the tune); on a chords part the
 *  new onsets by weight, the heaviest first; each group of new onsets those on a beat before
 *  those between. A rung is cut where the notes added so far come nearest an even share, at a
 *  group's edge (a key never arrives half), and only where every rung adds 15% of the step. Each
 *  rung holds the one below and sits inside the one above, so the gap, the silence rule and
 *  Rock Band's rule (a climb never takes a note away) hold on every rung as on the tiers. The
 *  Swift (`Charting.rungs`) is the same; `charting-check.ts` compares them. */
export function rungs(c: Charting, notes: PartNote[], ms: boolean[][], part: PartKey, ticksPerBeat: number): Rung[] {
  const g = c.adaptive.ghosts ?? null
  const out: Rung[] = []
  ms.forEach((m, ti) => {
    out.push({ tier: ti + 1, step: 0, steps: 0, mask: m })
    const up = ms[ti + 1]
    if (!up || !g) return
    const all = notes.map((_, i) => i)
    const extra = all.filter((i) => up[i] && !m[i])
    const below = all.filter((i) => m[i])
    if (!extra.length) return
    const ticks = new Set(below.map((i) => notes[i].t))
    const keys = new Set(below.map((i) => notes[i].n))
    const newKeys = [...new Set(extra.map((i) => notes[i].n))].filter((k) => !keys.has(k))
    const room = Math.max(1, below.length)
    if (extra.length < g.share * room && newKeys.length < g.keys) return
    // A group of new onsets: the ones on a beat, then the ones between.
    const beats = (group: number[]) => [group.filter((i) => notes[i].t % ticksPerBeat === 0), group.filter((i) => notes[i].t % ticksPerBeat !== 0)]
    const units: number[][] = [extra.filter((i) => ticks.has(notes[i].t))]
    const fresh = extra.filter((i) => !ticks.has(notes[i].t))
    if (part === 'melody') {
      const near = (k: number) => (keys.size ? Math.min(...[...keys].map((a) => Math.abs(a - k))) : 0)
      const count = (k: number) => fresh.filter((i) => notes[i].n === k).length
      newKeys.sort((a, b) => near(a) - near(b) || count(b) - count(a) || a - b)
      for (const k of newKeys) units.push(fresh.filter((i) => notes[i].n === k))
      units.push(...beats(fresh.filter((i) => keys.has(notes[i].n))))
    } else {
      const weight = new Map<number, number>()
      for (const i of fresh) weight.set(notes[i].t, Math.min(weight.get(notes[i].t) ?? 9, notes[i].lv))
      for (const lv of [1, 2, 3]) units.push(...beats(fresh.filter((i) => weight.get(notes[i].t) === lv)))
    }
    const us = units.filter((u) => u.length)
    const cum = [0]
    for (const u of us) cum.push(cum[cum.length - 1] + u.length)
    // The cuts for `steps` rungs, each where the notes added come nearest an even share; none
    // when a rung would add under `least` of the step (a rung next to a tier is no rung).
    const least = 0.15 * extra.length
    const cutsFor = (steps: number): number[] | null => {
      const cuts: number[] = []
      let prev = 0
      for (let j = 1; j <= steps; j++) {
        const target = (j * extra.length) / (steps + 1)
        let best = -1
        for (let cut = prev + 1; cut <= us.length - (steps - j) - 1; cut++) {
          if (best < 0 || Math.abs(cum[cut] - target) < Math.abs(cum[best] - target)) best = cut
        }
        if (best < 0) return null
        cuts.push(best)
        prev = best
      }
      const edges = [0, ...cuts, us.length]
      return edges.slice(1).every((e, k) => cum[e] - cum[edges[k]] >= least) ? cuts : null
    }
    const two = extra.length >= g.twoShare * room || newKeys.length >= g.twoKeys
    const cuts = (two ? cutsFor(2) : null) ?? cutsFor(1)
    if (!cuts) return
    cuts.forEach((cut, j) => {
      const mask = m.slice()
      for (const u of us.slice(0, cut)) for (const i of u) mask[i] = true
      out.push({ tier: ti + 1, step: j + 1, steps: cuts.length, mask })
    })
  })
  return out
}

/** A rung's name: the tier's number, a ghost's with its share of the way up ("4.5", "4.3"). */
export function rungName(r: Rung): string {
  return r.step === 0 ? `${r.tier}` : (r.tier + r.step / (r.steps + 1)).toFixed(1)
}

/** One tier's figures, the `-LessonCheck` ladder line's: onsets a second over the song, and
 *  the quietest and busiest eight bars the part plays in. */
export type TierFigure = { tier: number; notes: number; onsets: number; perSecond: number; quietest: number; busiest: number; hand?: HandFigures; silence?: SilenceFigure }

/** The silences a level leaves the player (Bart, 2026-11-12: "15 seconds or so should be the
 *  longest break ever, and not more than once a game, at any level of difficulty"; CHARTING.md
 *  rule 24): at every tier none over LONGEST_SILENCE seconds, and at most one of BREAK_SILENCE
 *  or more. Measured from the start to the first onset, onset to onset, and from the last note's
 *  end to where the game ends (half a bar into the tail, `Song.endTick`). LessonCheck asserts it. */
export const LONGEST_SILENCE = 15
export const BREAK_SILENCE = 10
export type Silence = { seconds: number; fromTick: number; toTick: number }
export type SilenceFigure = { longest: number; bar: number; breaks: number; ok: boolean }

export function silences(s: SongFile, line: PartNote[]): Silence[] {
  const spt = 60 / (s.song.tempo * s.ticksPerBeat)
  const tpb = ticksPerBar(s)
  const end = musicBars(s) * tpb + tpb / 2
  const on: { t: number; end: number }[] = []
  for (const n of [...line].sort((a, b) => a.t - b.t)) {
    const last = on[on.length - 1]
    if (last && last.t === n.t) last.end = Math.max(last.end, n.t + n.len)
    else on.push({ t: n.t, end: n.t + n.len })
  }
  if (!on.length) return [{ seconds: end * spt, fromTick: 0, toTick: end }]
  const out: Silence[] = [{ seconds: on[0].t * spt, fromTick: 0, toTick: on[0].t }]
  for (let i = 1; i < on.length; i++) out.push({ seconds: (on[i].t - on[i - 1].t) * spt, fromTick: on[i - 1].t, toTick: on[i].t })
  const last = on[on.length - 1]
  const from = Math.max(last.end, last.t)
  out.push({ seconds: Math.max(0, end - from) * spt, fromTick: from, toTick: end })
  return out.sort((a, b) => b.seconds - a.seconds)
}

export function silenceFigure(s: SongFile, line: PartNote[]): SilenceFigure {
  const all = silences(s, line)
  const breaks = all.filter((x) => x.seconds >= BREAK_SILENCE).length
  return { longest: all[0].seconds, bar: Math.floor(all[0].fromTick / ticksPerBar(s)) + 1, breaks, ok: line.length > 0 && all[0].seconds <= LONGEST_SILENCE && breaks <= 1 }
}

export function silenceLine(f: SilenceFigure): string {
  return `longest silence ${f.longest.toFixed(1)} s from bar ${f.bar}${f.ok ? '' : ` — TOO LONG (at most ${LONGEST_SILENCE} s, and only one of ${BREAK_SILENCE} s or more: ${f.breaks})`}`
}

export function figures(c: Charting, override: SongOverride | null, s: SongFile, part: PartKey): TierFigure[] {
  const all = sortedNotes(s.song.parts[part]!.notes)
  const tpb = ticksPerBar(s)
  const ms = masks(c, override, all, part, s.song.tempo, s.ticksPerBeat, tpb)
  const secondsPerTick = 60 / (s.song.tempo * s.ticksPerBeat)
  const total = songSeconds(s)
  const window = 8 * tpb, windowSeconds = window * secondsPerTick
  const partWindows = new Set(all.map((n) => Math.floor(n.t / window)))
  return ms.map((m, ti) => {
    const ticks = new Set<number>()
    let count = 0
    all.forEach((n, i) => {
      if (m[i]) {
        ticks.add(n.t)
        count++
      }
    })
    const rates = [...partWindows].map((w) => [...ticks].filter((t) => Math.floor(t / window) === w).length / windowSeconds)
    return {
      tier: ti + 1,
      notes: count,
      onsets: ticks.size,
      perSecond: ticks.size / total,
      quietest: rates.length ? Math.min(...rates) : 0,
      busiest: rates.length ? Math.max(...rates) : 0,
      // The hand (LEVELING.md): a melody tier's line fingered as the Stage fingers it.
      hand: part === 'melody' ? handFigures(all.filter((_, i) => m[i]), true, s.ticksPerBeat) : undefined,
      silence: silenceFigure(s, all.filter((_, i) => m[i])),
    }
  })
}

/** The ladder as a line the agent (and the check) reads: "0.29 · 0.43 · 0.84 …", with the
 *  difficulty names on their tiers. */
export function ladderLine(c: Charting, override: SongOverride | null, s: SongFile, part: PartKey): string {
  const figs = figures(c, override, s, part)
  const tiers = tiersOf(c, override, part)
  const names = new Map<number, string[]>()
  for (const d of DIFFICULTIES) {
    const t = tierFor(c, override, part, d)
    if (t != null) names.set(t, [...(names.get(t) ?? []), d])
  }
  return figs
    .map((f) => {
      const tag = names.get(f.tier)?.join('/') ?? ''
      return `L${f.tier}${tag ? ` (${tag})` : ''}: ${f.perSecond.toFixed(2)}/s [${f.quietest.toFixed(1)}–${f.busiest.toFixed(1)}], ${f.notes} notes${f.hand ? `, ${handLine(f.hand)}` : ''}${f.silence ? `, ${silenceLine(f.silence)}` : ''} — ${tiers[f.tier - 1].line}`
    })
    .join('\n')
}

export { musicBars }
