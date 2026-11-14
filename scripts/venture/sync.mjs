#!/usr/bin/env node
// The private files (apps/venture/private/*.md, gitignored because this repo
// is public) and their copies in Supabase (venture_docs), both ways.
//   node scripts/venture/sync.mjs push    every .md there → a venture_docs row (slug from the file name)
//   node scripts/venture/sync.mjs pull    every row that came from a file → back into the folder
//                                         (a new machine, or a lost folder; never overwrites a newer file)
//   node scripts/venture/sync.mjs status  which side is newer, file by file
// Call agendas (call-*.md) are not documents; publish those with put.mjs.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const root = new URL('../../', import.meta.url)
const dir = new URL('apps/venture/private/', root)
const env = Object.fromEntries(
  readFileSync(new URL('.env.local', root), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const slugOf = (file) => file.replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const files = () => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('call-')) : [])
const rows = async () => {
  const { data, error } = await db.from('venture_docs').select('*')
  if (error) throw new Error(error.message)
  return data
}

const cmd = process.argv[2]
if (cmd === 'push') {
  const have = new Map((await rows()).map((r) => [r.slug, r]))
  for (const f of files()) {
    const body = readFileSync(new URL(f, dir), 'utf8').trim()
    const title = body.match(/^# (.+)\n/)?.[1].trim()
    if (!title) throw new Error(`${f} must start with "# Title"`)
    const slug = slugOf(f)
    if (have.get(slug)?.body === body && have.get(slug)?.source === f) continue
    const { error } = await db.from('venture_docs').upsert({ slug, title, body, source: f, updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
    console.log(`pushed ${f} → ${slug}`)
  }
  console.log('push done')
} else if (cmd === 'pull') {
  mkdirSync(dir, { recursive: true })
  for (const r of await rows()) {
    if (!r.source) continue
    const path = new URL(r.source, dir)
    if (existsSync(path)) {
      if (readFileSync(path, 'utf8').trim() === r.body) continue
      if (statSync(path).mtimeMs > new Date(r.updated_at).getTime()) {
        console.log(`kept ${r.source} (the file is newer than the row)`)
        continue
      }
    }
    writeFileSync(path, r.body + '\n')
    console.log(`pulled ${r.slug} → ${r.source}`)
  }
  console.log('pull done')
} else if (cmd === 'status') {
  const have = new Map((await rows()).map((r) => [r.source, r]))
  for (const f of files()) {
    const r = have.get(f)
    const same = r && readFileSync(new URL(f, dir), 'utf8').trim() === r.body
    console.log(`${same ? 'same  ' : r ? 'differs' : 'file only'}  ${f}`)
    have.delete(f)
  }
  for (const [source, r] of have) console.log(`row only   ${source ?? '(no source)'}  [${r.slug}]`)
} else {
  console.error('usage: sync.mjs push | pull | status')
  process.exit(1)
}
