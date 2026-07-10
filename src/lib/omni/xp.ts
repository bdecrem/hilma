import { MAX_LEVEL } from './languages'

/** XP needed to go from `level` to `level + 1`. */
export function xpThreshold(level: number): number {
  return level * 100
}

export type XpAward = {
  level: number
  xp: number
  leveledUp: boolean
}

/**
 * Add XP to (level, xp-within-level), rolling over level boundaries.
 * At MAX_LEVEL, xp keeps accumulating but the level stays put.
 */
export function applyXp(level: number, xp: number, earned: number): XpAward {
  let l = level
  let x = xp + earned
  let leveledUp = false
  while (l < MAX_LEVEL && x >= xpThreshold(l)) {
    x -= xpThreshold(l)
    l += 1
    leveledUp = true
  }
  return { level: l, xp: x, leveledUp }
}

/** XP for a finished conversation: base + per user turn, capped. */
export function conversationXp(userTurns: number): number {
  if (userTurns === 0) return 0
  return Math.min(20 + userTurns * 2, 50)
}

/** XP for a flash-card review session: 1 per card + 1 per known, capped. */
export function reviewXp(total: number, known: number): number {
  return Math.min(total + known, 30)
}
