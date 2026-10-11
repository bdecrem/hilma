// Backfill for schema 005 (2026-10-11): days whose star round moved the rung
// up before the column existed get `star_level_done`, and each such level
// gets its `dolly_levels` row (bright for a week from that day). Idempotent.
//
//   npx tsx scripts/dolly/backfill-levels.ts [--dry]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const dry = process.argv.includes('--dry')
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } })

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const { data: days, error } = await sb.from('dolly_days').select('id, user_id, day, star_level_up, star_level_done').eq('star_level_up', true).order('day')
  if (error) throw new Error(error.message)
  const byUser = new Map<string, typeof days>()
  for (const d of days ?? []) byUser.set(d.user_id, [...(byUser.get(d.user_id) ?? []), d])
  for (const [userId, list] of byUser) {
    const { data: user } = await sb.from('dolly_users').select('phone, language, rung').eq('id', userId).single()
    if (!user) continue
    // The n-th level-up day completed level n (everyone starts at 1).
    let level = 0
    for (const d of list) {
      level += 1
      const patch = d.star_level_done ? null : { star_level_done: level }
      console.log(`${user.phone} ${d.day}: level ${level}${patch ? ' (set)' : ' (already)'}`)
      if (patch && !dry) await sb.from('dolly_days').update(patch).eq('id', d.id)
      const row = { user_id: userId, language: user.language, level, completed_day: d.day, refresh_due: addDays(d.day, 7) }
      if (!dry) {
        const { error: e } = await sb.from('dolly_levels').upsert(row, { onConflict: 'user_id,language,level', ignoreDuplicates: true })
        if (e) throw new Error(e.message)
      }
    }
    if (level + 1 !== user.rung) console.log(`  note: ${user.phone} is on rung ${user.rung}, ${level} level-up day(s) found`)
  }
  console.log(dry ? 'dry run' : 'done')
}
main().catch((e) => { console.error(e); process.exit(1) })
