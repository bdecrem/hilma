// XP and ranks. XP is a ledger (dolly_xp): every award is a row unique on
// (kind, ref), so paying for the same thing twice is impossible and the
// total is a sum. The rank is a threshold on the total — birds that talk
// and sing, Hatchling to Lyrebird — independent of the CEFR level, and it
// never goes down.
import { supabase } from './core'

export type Rank = { n: number; name: string; at: number }

/** Each step roughly doubles: the first ranks come in days, the last in a year. */
export const RANKS: Rank[] = [
  { n: 1, name: 'Hatchling', at: 0 },
  { n: 2, name: 'Fledgling', at: 100 },
  { n: 3, name: 'Chirper', at: 300 },
  { n: 4, name: 'Songbird', at: 700 },
  { n: 5, name: 'Mockingbird', at: 1500 },
  { n: 6, name: 'Parrot', at: 3000 },
  { n: 7, name: 'Nightingale', at: 6000 },
  { n: 8, name: 'Lyrebird', at: 12000 },
]

export type XpKind =
  | 'talk' // the day's call
  | 'things' // the three things said back
  | 'card' // one card right (the day's or a star round's)
  | 'cards_clean' // every card of the day right
  | 'day' // the day complete
  | 'streak' // a streak milestone
  | 'more' // an extra call (the first three a day)
  | 'star' // a star round finished
  | 'cando' // an objective earned
  | 'level' // a level completed
  | 'refresh' // a refresher passed
  | 'flash' // a flash set (per card right, plus the clean bonus)

export const XP: Record<XpKind, number> = {
  talk: 10,
  things: 5,
  card: 1,
  cards_clean: 5,
  day: 10,
  streak: 25,
  more: 10,
  star: 15,
  cando: 5,
  level: 100,
  refresh: 50,
  flash: 1,
}

export const FLASH_CLEAN_BONUS = 5
/** Flash sets that pay XP per day; later ones are practice. */
export const FLASH_PAID_SETS_PER_DAY = 5
/** Extra calls that pay XP per day. */
export const MORE_PAID_CALLS_PER_DAY = 3
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365]

export const XP_LABELS: Record<XpKind, string> = {
  talk: 'The call',
  things: 'Three things',
  card: 'Cards',
  cards_clean: 'All ten right',
  day: 'Day complete',
  streak: 'Streak',
  more: 'Talk more',
  star: 'Star round',
  cando: 'Objectives',
  level: 'Level complete',
  refresh: 'Refresher',
  flash: 'Flash cards',
}

export function rankFor(total: number): Rank {
  let r = RANKS[0]
  for (const rank of RANKS) if (total >= rank.at) r = rank
  return r
}

export function nextRank(total: number): Rank | null {
  return RANKS.find((r) => r.at > total) ?? null
}

export type XpRow = { id: string; user_id: string; day: string; kind: XpKind; ref: string; amount: number; created_at: string }

/** Pay once: a second award with the same kind and ref is a no-op. Returns
 *  what was paid now (0 when it had been). */
export async function award(userId: string, day: string, kind: XpKind, ref: string, amount: number): Promise<number> {
  if (amount <= 0) return 0
  const { data, error } = await supabase()
    .from('dolly_xp')
    .upsert({ user_id: userId, day, kind, ref, amount }, { onConflict: 'user_id,kind,ref', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error(`dolly: xp award failed: ${error.message}`)
  return data && data.length > 0 ? amount : 0
}

export async function listXp(userId: string): Promise<XpRow[]> {
  const { data, error } = await supabase().from('dolly_xp').select('*').eq('user_id', userId).order('created_at')
  if (error) throw new Error(`dolly: list xp failed: ${error.message}`)
  return (data ?? []) as XpRow[]
}

export async function countXp(userId: string, kind: XpKind, day: string): Promise<number> {
  const { count, error } = await supabase().from('dolly_xp').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', kind).eq('day', day)
  if (error) throw new Error(`dolly: count xp failed: ${error.message}`)
  return count ?? 0
}

/** What the app draws: the total, the rank and the road to the next one,
 *  today's awards (the finish screens sum the ones they are about), and
 *  whether today's awards crossed a rank. */
export type XpView = {
  total: number
  today: number
  rank: Rank
  next: Rank | null
  /** 0–1 from this rank's floor to the next; 1 at the top. */
  progress: number
  /** The rank today's XP lifted the learner to, when it did. */
  ranked_up: Rank | null
  awards_today: { kind: XpKind; label: string; amount: number }[]
  ranks: Rank[]
}

export function xpView(rows: XpRow[], today: string): XpView {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const todays = rows.filter((r) => r.day === today)
  const todayXp = todays.reduce((s, r) => s + r.amount, 0)
  const rank = rankFor(total)
  const next = nextRank(total)
  const before = rankFor(total - todayXp)
  return {
    total,
    today: todayXp,
    rank,
    next,
    progress: next ? (total - rank.at) / (next.at - rank.at) : 1,
    ranked_up: before.n < rank.n ? rank : null,
    awards_today: todays.map((r) => ({ kind: r.kind, label: XP_LABELS[r.kind], amount: r.amount })),
    ranks: RANKS,
  }
}
