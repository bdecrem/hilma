// Set someone's place in a Takt module by hand: lessons 1…n done, the next one's intro
// reached, stamped `setAt` so it wins over every older copy (AccountStore.merge in the app,
// keepHandSet in /api/takt/progress). Use it to correct a record, e.g. one that map goals
// pushed ahead before 0.1 (95). Dry run unless --apply.
//   set -a; source ./.env.local; set +a
//   npx tsx scripts/takt/set-lessons.ts <email> <module>=<n>[,<module>=<n>…] [--apply]
//   e.g. npx tsx scripts/takt/set-lessons.ts bdecrem@gmail.com S1=4,S1m=4
import { readFileSync } from 'node:fs'
import { f2Supabase } from '../../src/lib/f2/supabase'

type Record_ = { reachedStep?: number; lessonsDone?: number; completed?: string; setAt?: string; [k: string]: unknown }

/// Lesson `n`'s first step, 1-based: the step a record that has n lessons done has reached.
function reachedFor(code: string, n: number): number {
  const lesson = JSON.parse(readFileSync(`apps/takt/Takt/Content/lesson-${code}.json`, 'utf8')) as { lessons: { steps: string[] }[] }
  if (n < 0 || n > lesson.lessons.length) throw new Error(`${code} has ${lesson.lessons.length} lessons, not ${n}`)
  const steps = lesson.lessons.reduce((sum, l) => sum + l.steps.length, 0)
  return Math.min(steps, lesson.lessons.slice(0, n).reduce((sum, l) => sum + l.steps.length, 0) + 1)
}

async function main() {
  const [email, list, flag] = process.argv.slice(2)
  if (!email || !list) throw new Error('usage: set-lessons.ts <email> <module>=<n>[,…] [--apply]')
  const db = f2Supabase()
  const { data: user } = await db.from('takt_users').select('id').eq('email', email).maybeSingle()
  if (!user) throw new Error(`no Takt account ${email}`)
  const { data: row } = await db.from('takt_progress').select('snapshot').eq('user_id', user.id).maybeSingle()
  if (!row) throw new Error(`${email} has no progress yet`)
  const snapshot = row.snapshot as { lessons: Record<string, Record_> }
  // ISO 8601 without fractions, the way the app's encoder writes dates.
  const setAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  for (const part of list.split(',')) {
    const [code, n] = part.split('=')
    const was = snapshot.lessons[code] ?? {}
    const now = { ...was, lessonsDone: Number(n), reachedStep: reachedFor(code, Number(n)), setAt }
    console.log(`${code}: lessonsDone ${was.lessonsDone ?? 0} → ${now.lessonsDone}, reachedStep ${was.reachedStep ?? 1} → ${now.reachedStep}${was.completed ? `, completed ${was.completed} kept` : ''}`)
    snapshot.lessons[code] = now
  }
  if (flag !== '--apply') return console.log('dry run; add --apply to write it')
  const { error } = await db.from('takt_progress').update({ snapshot, updated_at: new Date().toISOString() }).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  console.log(`applied, stamped ${setAt}`)
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
