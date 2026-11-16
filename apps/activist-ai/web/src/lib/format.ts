// Numbers and dates the way a person says them.

export function bytes(n: number): string {
  if (n < 1000) return `${n} bytes`
  if (n < 1000 * 1000) return `${Math.round(n / 1000)} KB`
  if (n < 1000 * 1000 * 1000) return `${(n / 1000 / 1000).toFixed(1)} MB`
  return `${(n / 1000 / 1000 / 1000).toFixed(1)} GB`
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** "9:12 pm" today, "Nov 3" this year, "Nov 3, 2025" before. */
export function when(input: string | number, now = new Date()): string {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  if (sameDay(d, now)) return clock(d)
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }
  return d.toLocaleDateString('en-US', opts)
}

export function clock(d: Date | number): string {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' AM', ' am').replace(' PM', ' pm')
}

export function count(n: number, one: string, many = `${one}s`): string {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
  return `${n < 10 ? words[n] : n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "you and Dana", "you, Dana and Ruth" */
export function people(list: string[]): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}
