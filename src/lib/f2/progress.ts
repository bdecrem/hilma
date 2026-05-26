import { f2Supabase } from './supabase'

// Levels are tied to the user's TOTAL stars (sum across all topics).
// Same triangular thresholds as before — level N needs N*(N+1)/2 stars.
// L1 = 1, L2 = 3, L3 = 6, L4 = 10, L5 = 15, ...
export function levelForStars(totalStars: number): number {
  if (totalStars < 1) return 0
  // Largest N where N*(N+1)/2 <= totalStars.
  // Closed form: N = floor((sqrt(8*x + 1) - 1) / 2)
  return Math.floor((Math.sqrt(8 * totalStars + 1) - 1) / 2)
}

export function starsForLevel(level: number): number {
  if (level < 1) return 0
  return (level * (level + 1)) / 2
}

/// Italic flavor word that sits next to the level number ("Level 4 · Apprentice").
/// Names get steeper as you climb so the title feels earned.
export function levelTitle(level: number): string {
  if (level <= 0) return 'Newcomer'
  if (level === 1) return 'Beginner'
  if (level === 2) return 'Curious'
  if (level === 3) return 'Student'
  if (level === 4) return 'Apprentice'
  if (level === 5) return 'Scholar'
  if (level === 6) return 'Adept'
  if (level === 7) return 'Practitioner'
  if (level === 8) return 'Expert'
  if (level === 9) return 'Master'
  return 'Sage'
}

export type F2Progress = {
  level: number
  starred_topic_count: number
  total_stars: number
  mastered_topic_count: number // topics with 3 stars
  current_level_at: number // total stars needed for current level
  next_level_at: number // total stars needed for next level
  to_next_level: number // how many more stars to level up
}

export async function getUserProgress(userId: string): Promise<F2Progress> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .select('stars')
    .eq('user_id', userId)
    .gt('stars', 0)

  if (error) {
    console.error('[f2] getUserProgress failed:', error)
    return {
      level: 0,
      starred_topic_count: 0,
      total_stars: 0,
      mastered_topic_count: 0,
      current_level_at: 0,
      next_level_at: starsForLevel(1),
      to_next_level: 1,
    }
  }

  const rows = (data ?? []) as { stars: number }[]
  const starred_topic_count = rows.length
  const total_stars = rows.reduce((sum, r) => sum + (r.stars ?? 0), 0)
  const mastered_topic_count = rows.filter((r) => r.stars >= 3).length
  const level = levelForStars(total_stars)
  const current_level_at = starsForLevel(level)
  const next_level_at = starsForLevel(level + 1)

  return {
    level,
    starred_topic_count,
    total_stars,
    mastered_topic_count,
    current_level_at,
    next_level_at,
    to_next_level: Math.max(0, next_level_at - total_stars),
  }
}
