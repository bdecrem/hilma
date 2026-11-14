// kochitolabs.com's landing pages: what visitors did, and who signed up.
// Tables in apps/venture/schema/004_kochito.sql. Read the numbers with
// `node scripts/venture/leads.mjs`.
import { f2Supabase } from '@/lib/f2/supabase'

export const PAGES = ['home', 'pdf', 'apps'] as const
export type Page = (typeof PAGES)[number]
const KINDS = ['view', 'cta'] as const

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|scrapy|facebookexternalhit|whatsapp|telegram|discord|slack/i
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

// Where a visit came from, as the page read it from its own URL.
function origin(body: Record<string, unknown>) {
  return {
    sid: clip(body.sid, 40),
    src: clip(body.src, 40) ?? 'direct',
    campaign: clip(body.campaign, 80),
    term: clip(body.term, 120),
  }
}

export async function recordEvent(body: Record<string, unknown>, ua: string | null) {
  const page = body.page as Page
  const kind = body.kind as (typeof KINDS)[number]
  if (!PAGES.includes(page) || !KINDS.includes(kind)) throw new Error('bad event')
  const { error } = await f2Supabase()
    .from('kochito_events')
    .insert({ page, kind, ...origin(body), ref: clip(body.ref, 120), ua: clip(ua, 300), bot: !ua || BOT.test(ua) })
  if (error) throw new Error(`kochito event: ${error.message}`)
}

export async function recordLead(body: Record<string, unknown>, ua: string | null) {
  const page = body.page as Page
  const email = clip(body.email, 200)
  if (!PAGES.includes(page)) throw new Error('bad page')
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email address does not look right.')
  const from = origin(body)
  const db = f2Supabase()
  const { error } = await db.from('kochito_leads').insert({ page, email, detail: clip(body.detail, 1000), note: clip(body.note, 4000), ...from })
  if (error) throw new Error(`kochito lead: ${error.message}`)
  // the sign-up is also an event, so one table answers "views, clicks, sign-ups"
  await db.from('kochito_events').insert({ page, kind: 'lead', ...from, ua: clip(ua, 300), bot: !ua || BOT.test(ua) })
}
