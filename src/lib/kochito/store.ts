// kochitolabs.com's landing pages: what visitors did, and who signed up.
// Tables in apps/venture/schema/004_kochito.sql. Read the numbers with
// `node scripts/venture/leads.mjs`.
import { f2Supabase } from '@/lib/f2/supabase'

export const PAGES = ['home', 'pdf', 'apps'] as const
export type Page = (typeof PAGES)[number]
// a sample page, kochitolabs.com/s/<slug>, counts under its own name: 's/killeen'
const isPage = (p: unknown): p is string => typeof p === 'string' && ((PAGES as readonly string[]).includes(p) || /^s\/[a-z0-9-]{1,60}$/.test(p))
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
  const page = body.page
  const kind = body.kind as (typeof KINDS)[number]
  if (!isPage(page) || !KINDS.includes(kind)) throw new Error('bad event')
  const { error } = await f2Supabase()
    .from('kochito_events')
    .insert({ page, kind, ...origin(body), ref: clip(body.ref, 120), ua: clip(ua, 300), bot: !ua || BOT.test(ua) })
  if (error) throw new Error(`kochito event: ${error.message}`)
}

export async function recordLead(body: Record<string, unknown>, ua: string | null) {
  const page = body.page
  const email = clip(body.email, 200)
  if (!isPage(page)) throw new Error('bad page')
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email address does not look right.')
  const from = origin(body)
  const db = f2Supabase()
  const { error } = await db.from('kochito_leads').insert({ page, email, detail: clip(body.detail, 1000), note: clip(body.note, 4000), ...from })
  if (error) throw new Error(`kochito lead: ${error.message}`)
  // the sign-up is also an event, so one table answers "views, clicks, sign-ups"
  await db.from('kochito_events').insert({ page, kind: 'lead', ...from, ua: clip(ua, 300), bot: !ua || BOT.test(ua) })
}

// One fixed document shown to its owner (kochitolabs.com/s/<slug>); schema 005.
export type Sample = {
  slug: string
  org: string
  title: string
  pages: number
  original_url: string
  fixed_url: string
  before: { failedChecks: number; failedRules: number; rules?: { clause: string; failedChecks: number; description: string }[] }
  after: { failedChecks: number; failedRules: number }
  transcript: string
}

export async function getSample(slug: string): Promise<Sample | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null
  const { data, error } = await f2Supabase().from('kochito_samples').select('*').eq('slug', slug).eq('published', true).maybeSingle()
  if (error) throw new Error(`kochito sample: ${error.message}`)
  return (data as Sample) ?? null
}
