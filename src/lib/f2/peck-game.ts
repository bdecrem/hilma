import { f2Supabase } from './supabase'

// Peck or Perish — the minigame at Peck's rest stops (5, 15, 25, …). The
// score is the year the dodo went extinct; the board for a rest stop lists
// everyone who has played it, best year first. Table: f2_peck_game_scores
// (apps/f2/schema/053_f2_peck_game.sql).

export const PECK_GAME_FIRST_YEAR = 1598

/** Rest stops are the fives that are not region gates (10, 20 are gates). */
export function isRestStop(level: number): boolean {
  return Number.isInteger(level) && level > 0 && level % 5 === 0 && level % 10 !== 0
}

/** What the board shows for a player: never a full email address. */
export function boardHandle(username: string, isGuest: boolean): string {
  if (isGuest || username.startsWith('guest-')) {
    return `guest ${username.replace(/^guest-/, '').slice(0, 4)}`
  }
  const at = username.indexOf('@')
  return at > 0 ? username.slice(0, at) : username
}

export type PeckGameRow = { rank: number; handle: string; year: number; me: boolean }
export type PeckGameBoard = {
  level: number
  /** The caller's best year here, or null before their first round. */
  best: number | null
  plays: number
  /** Top ten, plus the caller's row when it falls below them. */
  board: PeckGameRow[]
  players: number
}

type ScoreRow = {
  user_id: string
  best_year: number
  plays: number
  f2_users: { username: string; is_guest: boolean | null } | null
}

export async function getPeckGameBoard(userId: string, level: number): Promise<PeckGameBoard> {
  const { data, error } = await f2Supabase()
    .from('f2_peck_game_scores')
    .select('user_id, best_year, plays, f2_users(username, is_guest)')
    .eq('level', level)
    .order('best_year', { ascending: false })
    .order('best_at', { ascending: true })
    .limit(500)
  if (error) throw new Error(`peck board read failed: ${error.message}`)
  const rows = (data ?? []) as unknown as ScoreRow[]

  // Competition ranking: equal years share a rank (1, 2, 2, 4).
  const ranked: PeckGameRow[] = []
  let mine: ScoreRow | null = null
  rows.forEach((r, i) => {
    const rank = i > 0 && rows[i - 1].best_year === r.best_year ? ranked[i - 1].rank : i + 1
    const me = r.user_id === userId
    if (me) mine = r
    ranked.push({
      rank,
      handle: r.f2_users ? boardHandle(r.f2_users.username, Boolean(r.f2_users.is_guest)) : 'someone',
      year: r.best_year,
      me,
    })
  })
  const board = ranked.slice(0, 10)
  const meRow = ranked.find(r => r.me)
  if (meRow && !board.includes(meRow)) board.push(meRow)
  const m = mine as ScoreRow | null
  return { level, best: m?.best_year ?? null, plays: m?.plays ?? 0, board, players: rows.length }
}

/** Records one finished round. Returns whether it beat the player's best. */
export async function recordPeckGameRound(userId: string, level: number, year: number): Promise<boolean> {
  const sb = f2Supabase()
  const { data: cur, error } = await sb
    .from('f2_peck_game_scores')
    .select('best_year, plays')
    .eq('user_id', userId)
    .eq('level', level)
    .maybeSingle()
  if (error) throw new Error(`peck score read failed: ${error.message}`)
  const now = new Date().toISOString()
  if (!cur) {
    const { error: e } = await sb
      .from('f2_peck_game_scores')
      .insert({ user_id: userId, level, best_year: year, plays: 1, best_at: now, updated_at: now })
    if (e) throw new Error(`peck score insert failed: ${e.message}`)
    return true
  }
  const better = year > cur.best_year
  const { error: e } = await sb
    .from('f2_peck_game_scores')
    .update({ plays: cur.plays + 1, updated_at: now, ...(better ? { best_year: year, best_at: now } : {}) })
    .eq('user_id', userId)
    .eq('level', level)
  if (e) throw new Error(`peck score update failed: ${e.message}`)
  return better
}
