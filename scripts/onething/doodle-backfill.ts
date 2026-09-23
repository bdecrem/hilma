// Draw the doodle for every entry that has none (or every entry, with --redo).
// One Opus 5.5 call per entry, a few seconds each; prints what was drawn.
//   set -a; source ./.env.local; set +a; npx tsx scripts/onething/doodle-backfill.ts [--redo] [--user <id>] [--limit n]
import { f2Supabase } from '../../src/lib/f2/supabase'
import { doodleEntry } from '../../src/lib/onething/doodle'

async function main() {
  const args = process.argv.slice(2)
  const redo = args.includes('--redo')
  const user = args.includes('--user') ? args[args.indexOf('--user') + 1] : null
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 1000
  let q = f2Supabase().from('onething_entries').select('id, user_id, day, text, doodle').order('day', { ascending: true })
  if (user) q = q.eq('user_id', user)
  if (!redo) q = q.is('doodle', null)
  const { data, error } = await q.limit(limit)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as { id: string; user_id: string; day: string; text: string }[]
  console.log(`${rows.length} to draw`)
  let n = 0
  for (const r of rows) {
    const t0 = Date.now()
    try {
      const d = await doodleEntry(r.id)
      if (!d) { console.log(`${r.day} ${r.user_id.slice(0, 8)} skipped (doodles off)`); continue }
      n++
      console.log(`${r.day} ${r.user_id.slice(0, 8)} ${((Date.now() - t0) / 1000).toFixed(1)}s  "${r.text.split('\n')[0].slice(0, 60)}"\n   → ${d.alt}${d.word ? `  [word: ${d.word}]` : ''}`)
    } catch (e) {
      console.log(`${r.day} ${r.user_id.slice(0, 8)} FAILED: ${(e as Error).message}`)
    }
  }
  console.log(`drew ${n}/${rows.length}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
