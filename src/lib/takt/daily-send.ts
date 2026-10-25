import { randomInt } from 'node:crypto'
import { f2Supabase } from '@/lib/f2/supabase'
import { sendIMessage } from '@/lib/f2/bluebubbles'
import { composeText, isDue, localDate, practicedToday, type DailyRow, type TaktSnapshot } from './daily'

// The server side of Takt's daily text: settings in the shape the app reads, the one sender
// (Dodo's imsghttp / BlueBubbles path), and the hourly tick. TAKT_IMESSAGE_DRY=1 makes the
// sender log instead of texting (local checks; this repo's laptops lack F2_IMESSAGE_*).

export type DailySettings = { phone: string | null; verified: boolean; enabled: boolean; hour: number; tz: string }

export const SETTINGS_COLUMNS = 'phone, phone_verified_at, daily_enabled, daily_hour, daily_tz'

export function toSettings(r: {
  phone: string | null
  phone_verified_at: string | null
  daily_enabled: boolean
  daily_hour: number
  daily_tz: string
}): DailySettings {
  return { phone: r.phone, verified: !!r.phone_verified_at, enabled: r.daily_enabled, hour: r.daily_hour, tz: r.daily_tz }
}

export async function readSettings(userId: string): Promise<DailySettings> {
  const { data, error } = await f2Supabase().from('takt_users').select(SETTINGS_COLUMNS).eq('id', userId).single()
  if (error || !data) throw new Error(`takt_users settings: ${error?.message ?? 'no row'}`)
  return toSettings(data as Parameters<typeof toSettings>[0])
}

export async function sendTaktText(phone: string, text: string): Promise<void> {
  if (process.env.TAKT_IMESSAGE_DRY === '1') {
    console.log(`[takt/daily] DRY send to ${phone}: ${text}`)
    return
  }
  await sendIMessage({ addresses: [phone], text })
}

export function newCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, '0')
}

type TickUser = DailyRow & { id: string; phone: string | null }

export type TickResult = {
  id: string
  status: 'sent' | 'dry' | 'practiced' | 'failed'
  text?: string
  error?: string
}

/// One tick. Normally: every verified, enabled user whose local hour is now and who has not
/// had today's text. `force` + `userId`: that one user, now, ignoring the hour and sent-on.
/// `dry`: compose only, send nothing, mark nothing.
export async function runTick(opts: { now: Date; userId?: string; force?: boolean; dry?: boolean }): Promise<TickResult[]> {
  const sb = f2Supabase()
  let q = sb
    .from('takt_users')
    .select('id, phone, phone_verified_at, daily_enabled, daily_hour, daily_tz, daily_sent_on')
  if (opts.userId) q = q.eq('id', opts.userId)
  else q = q.not('phone_verified_at', 'is', null).eq('daily_enabled', true)
  const { data, error } = await q
  if (error) throw new Error(`takt_users tick query: ${error.message}`)
  const users = ((data ?? []) as TickUser[]).filter((u) => (opts.force ? true : isDue(opts.now, u)))
  if (users.length === 0) return []

  const { data: progress, error: pErr } = await sb
    .from('takt_progress')
    .select('user_id, snapshot')
    .in('user_id', users.map((u) => u.id))
  if (pErr) throw new Error(`takt_progress tick query: ${pErr.message}`)
  const snaps = new Map((progress ?? []).map((p) => [p.user_id as string, p.snapshot as TaktSnapshot]))

  const out: TickResult[] = []
  for (const u of users) {
    const today = localDate(opts.now, u.daily_tz)
    const snap = snaps.get(u.id) ?? null
    if (practicedToday(snap?.days, today)) {
      out.push({ id: u.id, status: 'practiced' })
      continue
    }
    const text = composeText(snap, opts.now, u.daily_tz)
    if (opts.dry) {
      out.push({ id: u.id, status: 'dry', text })
      continue
    }
    if (!u.phone || !u.phone_verified_at) {
      out.push({ id: u.id, status: 'failed', text, error: 'no verified phone' })
      continue
    }
    try {
      await sendTaktText(u.phone, text)
    } catch (e) {
      console.error('[takt/daily] send failed:', u.id, e)
      out.push({ id: u.id, status: 'failed', text, error: e instanceof Error ? e.message.slice(0, 160) : String(e) })
      continue
    }
    const { error: mErr } = await sb.from('takt_users').update({ daily_sent_on: today }).eq('id', u.id)
    if (mErr) console.error('[takt/daily] daily_sent_on update failed:', u.id, mErr)
    out.push({ id: u.id, status: 'sent', text })
  }
  return out
}
