#!/usr/bin/env node
// Publish a private document or a call agenda (the repo is public, so both
// live in the database; the source files stay in apps/venture/private/).
//   node scripts/venture/put.mjs doc  <slug> <file.md>              title = the file's first "# " line
//   node scripts/venture/put.mjs call <slug> <file.md>              first "# " line = title, the next
//                                                                    paragraph = the blurb on the page, the rest = the agenda
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const [kind, slug, file] = process.argv.slice(2)
if (!['doc', 'call'].includes(kind) || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug ?? '') || !file) {
  console.error('usage: put.mjs doc|call <slug> <file.md>')
  process.exit(1)
}
const text = readFileSync(file, 'utf8').trim()
const m = text.match(/^# (.+)\n/)
if (!m) throw new Error('the file must start with "# Title"')
const title = m[1].trim()

if (kind === 'doc') {
  const { error } = await db.from('venture_docs').upsert({ slug, title, body: text, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  console.log(`doc ${slug}: "${title}", ${text.length} chars → /venture/doc/${slug}`)
} else {
  const rest = text.slice(m[0].length).trim()
  const cut = rest.indexOf('\n\n')
  if (cut < 0) throw new Error('a call needs a blurb paragraph, a blank line, then the agenda')
  const blurb = rest.slice(0, cut).replace(/\s+/g, ' ').trim()
  const brief = rest.slice(cut).trim()
  const { error } = await db.from('venture_calls').upsert({ slug, title, blurb, brief })
  if (error) throw new Error(error.message)
  console.log(`call ${slug}: "${title}", agenda ${brief.length} chars → /venture/call/${slug}`)
}
