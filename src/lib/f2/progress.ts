import { f2Supabase } from './supabase'

// Levels are tied to the number of topics the user has at least 1 star on.
// Triangular thresholds: L1 needs 1, L2 needs 3, L3 needs 6, L4 needs 10, ...
// Level N requires N*(N+1)/2 starred topics.
export function levelForStarredCount(count: number): number {
  if (count < 1) return 0
  // Largest N where N*(N+1)/2 <= count.
  // Closed form: N = floor((sqrt(8*count + 1) - 1) / 2)
  return Math.floor((Math.sqrt(8 * count + 1) - 1) / 2)
}

export function starredCountForLevel(level: number): number {
  if (level < 1) return 0
  return (level * (level + 1)) / 2
}

export type F2Progress = {
  level: number
  starred_topic_count: number
  total_stars: number
  mastered_topic_count: number // topics with 3 stars
  current_level_at: number // starred topics needed for current level
  next_level_at: number // starred topics needed for next level
  to_next_level: number // how many more starred topics to level up
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
      next_level_at: starredCountForLevel(1),
      to_next_level: 1,
    }
  }

  const rows = (data ?? []) as { stars: number }[]
  const starred_topic_count = rows.length
  const total_stars = rows.reduce((sum, r) => sum + (r.stars ?? 0), 0)
  const mastered_topic_count = rows.filter((r) => r.stars >= 3).length
  const level = levelForStarredCount(starred_topic_count)
  const current_level_at = starredCountForLevel(level)
  const next_level_at = starredCountForLevel(level + 1)

  return {
    level,
    starred_topic_count,
    total_stars,
    mastered_topic_count,
    current_level_at,
    next_level_at,
    to_next_level: Math.max(0, next_level_at - starred_topic_count),
  }
}
