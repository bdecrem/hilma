// Rock Paper Anything — the global daily cap on Jev calls. The game has no
// accounts, so the budget is one row per UTC day (rpa_usage,
// apps/rpa/schema/001_rpa_usage.sql) incremented through rpa_add_usage().
// 20,000 calls a day is about a dollar at the size of a full-screen shot.
//
// A missing table is a deployment error: the route fails loudly rather than
// running unmetered.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_DAILY_CALLS = 20_000

let _client: SupabaseClient | null = null
function db(): SupabaseClient {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY is not set')
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _client
}

export function dailyCallLimit(): number {
  const raw = process.env.RPA_DAILY_CALLS
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_CALLS
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`RPA_DAILY_CALLS must be a positive number, got "${raw}"`)
  return Math.floor(n)
}

const usageDay = (now = new Date()) => now.toISOString().slice(0, 10)

// The cap is read at most every 30 s per server instance, so a shot never
// waits on the database twice; overshoot is bounded by that window.
let seen: { day: string; calls: number; at: number } | null = null

/** True when today's calls are spent. Throws if the table is unreachable. */
export async function overDailyCap(): Promise<boolean> {
  const day = usageDay()
  if (!seen || seen.day !== day || Date.now() - seen.at > 30_000) {
    const { data, error } = await db().from('rpa_usage').select('calls').eq('day', day).maybeSingle()
    if (error) throw new Error(`rpa_usage read failed: ${error.message}`)
    seen = { day, calls: Number(data?.calls ?? 0) || 0, at: Date.now() }
  }
  return seen.calls >= dailyCallLimit()
}

/** Add one Jev call to today's row (atomic upsert-increment). */
export async function recordCall(inputTokens: number): Promise<void> {
  if (seen && seen.day === usageDay()) seen.calls += 1
  const { error } = await db().rpc('rpa_add_usage', { p_day: usageDay(), p_calls: 1, p_input: Math.round(inputTokens) })
  if (error) throw new Error(`rpa_usage write failed: ${error.message}`)
}
