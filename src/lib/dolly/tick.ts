// The hourly tick (Vercel cron at :05): each user's daily text at their
// hour, in their zone, and one reminder at 8 pm if the day is not done —
// never within four hours of the daily text itself (Onething's rule).
import { dailyText, reminderText, welcomeText } from './copy'
import { findDay, listUsers, localClock, localDay, updateUser, type User } from './core'
import { ensureToday } from './day'
import { isTestPhone, sendText } from './send'

export const REMIND_HOUR = 20
export const REMIND_MIN_GAP_MS = 4 * 60 * 60 * 1000

/** Pure, so it can be checked across zones. */
export function dueFor(user: Pick<User, 'tz' | 'daily_hour' | 'prompt_day' | 'prompted_at' | 'reminder_day'>, now = new Date()): 'prompt' | 'reminder' | null {
  const { day: today, hour } = localClock(now, user.tz)
  if (hour >= user.daily_hour && hour < REMIND_HOUR && user.prompt_day !== today) return 'prompt'
  if (hour >= REMIND_HOUR && user.prompt_day === today && user.reminder_day !== today) {
    const askedAt = user.prompted_at ? new Date(user.prompted_at).getTime() : 0
    if (now.getTime() - askedAt < REMIND_MIN_GAP_MS) return null
    return 'reminder'
  }
  return null
}

export async function tick(now = new Date()): Promise<{ prompted: string[]; reminded: string[]; failed: string[] }> {
  const prompted: string[] = []
  const reminded: string[] = []
  const failed: string[] = []
  for (const user of await listUsers()) {
    if (isTestPhone(user.phone)) continue
    try {
      const due = dueFor(user, now)
      if (!due) continue
      const today = localDay(now, user.tz)
      if (due === 'prompt') {
        const day = await ensureToday(user, now)
        await sendText(user.phone, dailyText(day.n, day.topic))
        await updateUser(user.id, { prompt_day: today, prompted_at: now.toISOString() })
        prompted.push(user.phone)
        continue
      }
      const day = await findDay(user.id, today)
      if (day && day.state !== 'done') {
        await sendText(user.phone, reminderText(day.n, day.topic))
        reminded.push(user.phone)
      }
      await updateUser(user.id, { reminder_day: today })
    } catch (e) {
      console.error(`[dolly] tick failed for ${user.phone}:`, e)
      failed.push(user.phone)
    }
  }
  return { prompted, reminded, failed }
}

/** A new account: day 1 exists now and the hello goes out; today's daily
 *  text is thereby spent, so the tick does not text again today. */
export async function welcome(user: User, now = new Date()): Promise<void> {
  const day = await ensureToday(user, now)
  await updateUser(user.id, { prompt_day: localDay(now, user.tz), prompted_at: now.toISOString() })
  await sendText(user.phone, welcomeText(day.topic, user.daily_hour))
}
