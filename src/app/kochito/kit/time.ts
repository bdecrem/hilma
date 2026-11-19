// Times on the board, always in Pacific time (Bart reads it in California).
const TZ = 'America/Los_Angeles'
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).replace(' AM', ' am').replace(' PM', ' pm')
export const dayLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
export const dayShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
export const pday = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
export const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)
/** "just now", "12 min ago", "3 h ago", "yesterday 9:12 pm", "Mon 9:12 pm", "Nov 12" */
export function ago(iso: string | null | undefined, now: string): string {
  if (!iso) return 'never'
  const ms = Date.parse(now) - Date.parse(iso)
  const min = Math.round(ms / 60e3)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 12 * 60) return `${Math.round(min / 60)} h ago`
  const today = pday(now)
  const d = pday(iso)
  if (d === shiftDay(today, -1)) return `yesterday ${clock(iso)}`
  if (ms < 6 * 86400e3) return `${new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ })} ${clock(iso)}`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })
}
/** "since 3 h", "since yesterday", "since Nov 12" */
export function since(iso: string | null | undefined, now: string): string {
  if (!iso) return ''
  const a = ago(iso, now)
  return a.endsWith(' ago') ? `for ${a.slice(0, -4)}` : `since ${a}`
}
/** "today 3:49 pm", "yesterday 9:12 pm", "Mon, Nov 17, 3:49 pm": a moment, said plainly */
export function at(iso: string, now: string): string {
  const d = pday(iso)
  const today = pday(now)
  if (d === today) return `today ${clock(iso)}`
  if (d === shiftDay(today, -1)) return `yesterday ${clock(iso)}`
  return `${dayShort(d)}, ${clock(iso)}`
}
