// Backfill for schema 006 (2026-10-11): every day, extra call, star round,
// objective, level and refresher from before the XP ledger existed gets its
// rows, with the same kinds and refs the live code writes, so nobody starts
// at zero and a later award of the same thing is a no-op. Idempotent.
//
//   npx tsx scripts/dolly/backfill-xp.ts [--dry] [--user <id>]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { FLASH_CLEAN_BONUS, MORE_PAID_CALLS_PER_DAY, STREAK_MILESTONES, XP, rankFor, type XpKind } from '../../src/lib/dolly/xp'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const only = args.includes('--user') ? args[args.indexOf('--user') + 1] : null
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } })

type Row = { user_id: string; day: string; kind: XpKind; ref: string; amount: number }
type DayRow = { id: string; day: string; state: string; answers: { ok: boolean; q: number }[]; questions: unknown[] | null; extra_calls: number; extra_things: unknown[][]; star_state: string | null; star_answers: { ok: boolean; q: number }[]; star_level_done: number | null }

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function localDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

async function main() {
  const { data: users, error } = await sb.from('dolly_users').select('id, phone, language, tz').order('created_at')
  if (error) throw new Error(error.message)
  for (const user of users ?? []) {
    if (only && user.id !== only) continue
    const rows: Row[] = []
    const add = (day: string, kind: XpKind, ref: string, amount: number) => rows.push({ user_id: user.id, day, kind, ref, amount })
    const { data: days } = await sb.from('dolly_days').select('id, day, state, answers, questions, extra_calls, extra_things, star_state, star_answers, star_level_done').eq('user_id', user.id).order('day')
    let streak = 0
    let last: string | null = null
    for (const d of (days ?? []) as DayRow[]) {
      if (d.state === 'done') {
        add(d.day, 'talk', d.id, XP.talk)
        add(d.day, 'things', d.id, XP.things)
        add(d.day, 'day', d.id, XP.day)
        for (const a of d.answers) if (a.ok) add(d.day, 'card', `${d.id}:${a.q}`, XP.card)
        if (d.answers.length > 0 && d.answers.every((a) => a.ok)) add(d.day, 'cards_clean', d.id, XP.cards_clean)
        streak = last && addDays(last, 1) === d.day ? streak + 1 : 1
        last = d.day
        if (STREAK_MILESTONES.includes(streak)) add(d.day, 'streak', `${d.id}:${streak}`, XP.streak)
      }
      // Extra calls: the ones that produced things were spoken (the first three pay).
      const spoken = (d.extra_things ?? []).map((t, i) => (t.length > 0 ? i + 1 : 0)).filter((n) => n > 0)
      for (const n of spoken.slice(0, MORE_PAID_CALLS_PER_DAY)) add(d.day, 'more', `${d.id}:${n}`, XP.more)
      if (d.star_state === 'done') {
        add(d.day, 'star', d.id, XP.star)
        for (const a of d.star_answers) if (a.ok) add(d.day, 'card', `${d.id}:star:${a.q}`, XP.card)
      }
    }
    const { data: candos } = await sb.from('dolly_cando').select('cando_id, earned_at').eq('user_id', user.id)
    for (const c of candos ?? []) add(localDay(c.earned_at, user.tz), 'cando', c.cando_id, XP.cando)
    const { data: levels } = await sb.from('dolly_levels').select('language, level, completed_day').eq('user_id', user.id)
    for (const l of levels ?? []) add(l.completed_day, 'level', `${l.language}:${l.level}`, XP.level)
    const { data: refreshers } = await sb.from('dolly_refreshers').select('id, day, passed').eq('user_id', user.id).eq('passed', true)
    for (const r of refreshers ?? []) add(r.day, 'refresh', r.id, XP.refresh)
    const { data: sets } = await sb.from('dolly_flash_sets').select('id, day, xp').eq('user_id', user.id).eq('state', 'done').gt('xp', 0)
    for (const s of sets ?? []) add(s.day, 'flash', s.id, s.xp)
    void FLASH_CLEAN_BONUS

    const total = rows.reduce((s, r) => s + r.amount, 0)
    let written = 0
    if (!dry && rows.length > 0) {
      const { data, error: e } = await sb.from('dolly_xp').upsert(rows, { onConflict: 'user_id,kind,ref', ignoreDuplicates: true }).select('id')
      if (e) throw new Error(e.message)
      written = data?.length ?? 0
    }
    const { data: all } = await sb.from('dolly_xp').select('amount').eq('user_id', user.id)
    const have = (all ?? []).reduce((s, r) => s + r.amount, 0)
    console.log(`${user.phone}: ${rows.length} rows worth ${total} XP${dry ? ' (dry)' : `, ${written} new`}; ledger now ${have} XP → ${rankFor(have).name}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
