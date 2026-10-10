// What the app sees of a user.
import { currentStreak, hourLabel, type User } from './core'

export type UserView = {
  id: string
  phone: string
  name: string | null
  language: User['language']
  level: User['level']
  daily_hour: number
  daily_label: string
  tz: string
  streak: number
  best_streak: number
}

export function userView(user: User, now = new Date()): UserView {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    language: user.language,
    level: user.level,
    daily_hour: user.daily_hour,
    daily_label: hourLabel(user.daily_hour),
    tz: user.tz,
    streak: currentStreak(user, now),
    best_streak: user.best_streak,
  }
}
