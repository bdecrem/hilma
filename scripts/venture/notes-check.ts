// What the voice call and the text replies will carry, read from the live venture_docs:
// which documents load in full, which are only listed, and the real token count of the
// result (from what the model counted on the last answer written with them). Fails when the notes come
// within 40% of the model's context, so a large file is caught at the push that brought
// it, not by Bart talking to a dead line (2026-11-15).
//   npx tsx scripts/venture/notes-check.ts [--quiet]
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { NOTES_BUDGET, notesText, pickNotes, type Doc } from '../../src/lib/venture/notes'

const LIMIT = 1_000_000 // the model's context, tokens
const CEILING = 600_000 // the notes alone may not pass this
const quiet = process.argv.includes('--quiet')
const env = Object.fromEntries(
  readFileSync(path.join(__dirname, '../../.env.local'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
async function main() {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  const { data, error } = await db.from('venture_docs').select('slug, title, body, updated_at')
  if (error) throw new Error(error.message)
  const picked = pickNotes((data ?? []) as Doc[])
  const text = notesText(picked)
  if (!quiet) {
    for (const d of picked.loaded) console.log(`loaded  ${String(d.body.length).padStart(7)}  ${d.slug}`)
    for (const d of picked.listed) console.log(`listed  ${String(d.body.length).padStart(7)}  ${d.slug}`)
  }
  // No API key (2026-11-19, OLA-187; Bart: "whatever we CAN switch"). The count is the characters
  // times the tokens-per-character of the last real answer written with these notes: the job that
  // answers his texts on the Claude login records what the model counted (venture_state
  // "notes_size"). Without a measurement of the last two weeks, the ratio measured on 2026-11-15.
  const { data: m } = await db.from('venture_state').select('value, at').eq('key', 'notes_size').maybeSingle()
  const v = m?.value as { chars?: number; tokens?: number } | undefined
  const fresh = v?.chars && v?.tokens && Date.now() - new Date(m!.at).getTime() < 14 * 86400e3
  const tokens = Math.round(text.length * (fresh ? v!.tokens! / v!.chars! : 1 / 2.69))
  const how = fresh ? `by the ratio of the answer written ${String(m!.at).slice(0, 10)}` : 'an estimate at 2.69 characters a token'
  console.log(
    `voice and text notes: ${picked.loaded.length} documents loaded, ${picked.listed.length} listed only, ${text.length.toLocaleString('en-US')} characters (budget ${NOTES_BUDGET.toLocaleString('en-US')}), ${tokens.toLocaleString('en-US')} tokens of ${LIMIT.toLocaleString('en-US')} (${how})`,
  )
  if (tokens > CEILING) {
    console.error(`FAIL: the notes are over ${CEILING.toLocaleString('en-US')} tokens. Lower NOTES_BUDGET in src/lib/venture/notes.ts or shorten the always-loaded files (the FIRST list there).`)
    process.exit(1)
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
