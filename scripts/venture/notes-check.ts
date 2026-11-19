// What the voice call and the text replies will carry, read from the live venture_docs:
// which documents load in full, which are only listed, and the real token count of the
// result (Anthropic's count, for the model the call uses). Fails when the notes come
// within 40% of the model's context, so a large file is caught at the push that brought
// it, not by Bart talking to a dead line (2026-11-15).
//   npx tsx scripts/venture/notes-check.ts [--quiet]
import { readFileSync } from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
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
  // The exact count comes from the API. When the API refuses the key (2026-11-18: the monthly
  // spending limit was reached), the check must not stop every notes checkpoint: it estimates from
  // the characters (the measured ratio is about 2.7 characters a token) and says so.
  let tokens: number
  try {
    const count = await new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }).messages.countTokens({
      model: 'claude-opus-5-5',
      system: text,
      messages: [{ role: 'user', content: 'x' }],
    })
    tokens = count.input_tokens
  } catch (e) {
    tokens = Math.round(text.length / 2.69)
    console.log(`token count is an estimate: the API did not answer (${String((e as Error).message).slice(0, 110)})`)
  }
  console.log(
    `voice and text notes: ${picked.loaded.length} documents loaded, ${picked.listed.length} listed only, ${text.length.toLocaleString('en-US')} characters (budget ${NOTES_BUDGET.toLocaleString('en-US')}), ${tokens.toLocaleString('en-US')} tokens of ${LIMIT.toLocaleString('en-US')}`,
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
