import { omniSupabase } from './supabase'
import { applyXp, xpThreshold } from './xp'
import { levelName } from './languages'

export type ProgressRow = { level: number; xp: number }

export type ProgressPayload = {
  level: number
  level_name: string
  xp: number
  next_level_xp: number
}

export function progressPayload(p: ProgressRow): ProgressPayload {
  return {
    level: p.level,
    level_name: levelName(p.level),
    xp: p.xp,
    next_level_xp: xpThreshold(p.level),
  }
}

export async function getOrCreateProgress(
  userId: string,
  language: string,
  startLevel = 1,
): Promise<ProgressRow> {
  const sb = omniSupabase()
  const { data } = await sb
    .from('omni_progress')
    .select('level, xp')
    .eq('user_id', userId)
    .eq('language', language)
    .maybeSingle()
  if (data) return data as ProgressRow

  const { data: created, error } = await sb
    .from('omni_progress')
    .insert({ user_id: userId, language, level: startLevel })
    .select('level, xp')
    .single()
  if (created) return created as ProgressRow

  // Insert can race with a concurrent request; re-read before giving up.
  const { data: again } = await sb
    .from('omni_progress')
    .select('level, xp')
    .eq('user_id', userId)
    .eq('language', language)
    .maybeSingle()
  if (again) return again as ProgressRow
  throw new Error(`getOrCreateProgress failed: ${error?.message}`)
}

export type XpResult = {
  earned: number
  leveled_up: boolean
} & ProgressPayload

export async function awardXp(
  userId: string,
  language: string,
  earned: number,
): Promise<XpResult> {
  const current = await getOrCreateProgress(userId, language)
  if (earned <= 0) {
    return { earned: 0, leveled_up: false, ...progressPayload(current) }
  }
  const next = applyXp(current.level, current.xp, earned)
  const { error } = await omniSupabase()
    .from('omni_progress')
    .update({
      level: next.level,
      xp: next.xp,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('language', language)
  if (error) throw new Error(`awardXp failed: ${error.message}`)
  return {
    earned,
    leveled_up: next.leveledUp,
    ...progressPayload({ level: next.level, xp: next.xp }),
  }
}
