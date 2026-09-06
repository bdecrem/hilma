// Jam — per-user daily token accounting for /api/jam/llm.
//
// Every signed-up account can drive Claude through the LLM route, so each
// account gets a daily token budget (JAM_DAILY_TOKENS, default 3,000,000).
// Usage lives in jam_usage (apps/jam/schema/003_jam_usage.sql): one row per
// user per UTC day, incremented atomically through the jam_add_usage()
// function after each Messages call.
//
// Missing table / function is a deployment error, not a soft condition: the
// callers fail the request loudly (500) instead of running unmetered.

import { jamDb } from './db'

export const DEFAULT_DAILY_TOKENS = 3_000_000

/** The daily budget: JAM_DAILY_TOKENS if set, else the default. */
export function dailyTokenLimit(): number {
  const raw = process.env.JAM_DAILY_TOKENS
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_TOKENS
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`JAM_DAILY_TOKENS must be a positive number, got "${raw}"`)
  return Math.floor(n)
}

/** The usage day (UTC calendar date, YYYY-MM-DD). */
export function usageDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export type DailyUsage = { day: string; input_tokens: number; output_tokens: number; total: number }

export type AnthropicUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)

/**
 * What one response costs against the budget. Input counts the uncached
 * prompt plus cache writes (billed at full price or more); cache reads are
 * a tenth of the price and are left out so a long, well-cached Jambot turn
 * isn't charged like a fresh one.
 */
export function countedTokens(usage: AnthropicUsage | null | undefined): { input: number; output: number } {
  if (!usage || typeof usage !== 'object') return { input: 0, output: 0 }
  return {
    input: n(usage.input_tokens) + n(usage.cache_creation_input_tokens),
    output: n(usage.output_tokens),
  }
}

/** Today's totals for a user (zero row when there is none). Throws if the table is unreachable. */
export async function getDailyUsage(userId: string, day: string = usageDay()): Promise<DailyUsage> {
  const { data, error } = await jamDb()
    .from('jam_usage')
    .select('input_tokens, output_tokens')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle()
  if (error) throw new Error(`jam_usage read failed: ${error.message}`)
  const input = Number(data?.input_tokens ?? 0) || 0
  const output = Number(data?.output_tokens ?? 0) || 0
  return { day, input_tokens: input, output_tokens: output, total: input + output }
}

/** Add one response's usage to today's row (atomic upsert-increment). Throws if it can't be recorded. */
export async function recordUsage(userId: string, usage: AnthropicUsage | null | undefined, day: string = usageDay()): Promise<void> {
  const { input, output } = countedTokens(usage)
  if (input === 0 && output === 0) return
  const { error } = await jamDb().rpc('jam_add_usage', {
    p_user_id: userId,
    p_day: day,
    p_input: input,
    p_output: output,
  })
  if (error) throw new Error(`jam_usage write failed: ${error.message}`)
}
