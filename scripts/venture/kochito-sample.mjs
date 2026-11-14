#!/usr/bin/env node
// Puts one fixed document on kochitolabs.com/s/<slug>: uploads the fixed PDF to
// the public bucket kochito-samples and writes the row the page reads
// (schema 005). The files come from the private folder a fixing run leaves:
// apps/venture/private/pdf-desk/<slug>/{fixed.pdf,transcript.txt}, results.json
// (the checker's numbers) and titles.json (what to call each document).
//   node scripts/venture/kochito-sample.mjs put <slug> [--publish]   upload; the page shows only once published
//   node scripts/venture/kochito-sample.mjs unpublish <slug>
//   node scripts/venture/kochito-sample.mjs list
// It refuses a document that does not pass the checker with 0 failed checks.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const root = new URL('../../', import.meta.url)
const dir = new URL('apps/venture/private/pdf-desk/', root)
const env = Object.fromEntries(
  readFileSync(new URL('.env.local', root), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const BUCKET = 'kochito-samples'
const [cmd, slug, flag] = process.argv.slice(2)

if (cmd === 'list') {
  const { data, error } = await db.from('kochito_samples').select('slug, org, title, pages, published, created_at').order('created_at')
  if (error) throw new Error(error.message)
  for (const s of data) console.log(`${s.published ? 'public ' : 'hidden '} ${s.slug.padEnd(16)} ${s.org}: ${s.title} (${s.pages} pages)`)
} else if (cmd === 'unpublish' && slug) {
  const { error } = await db.from('kochito_samples').update({ published: false }).eq('slug', slug)
  if (error) throw new Error(error.message)
  console.log(`${slug} hidden`)
} else if (cmd === 'put' && slug) {
  const r = JSON.parse(readFileSync(new URL('results.json', dir), 'utf8'))[slug]
  const title = JSON.parse(readFileSync(new URL('titles.json', dir), 'utf8'))[slug]
  if (!r) throw new Error(`no result for ${slug} in results.json`)
  if (!title) throw new Error(`no title for ${slug} in titles.json`)
  if (!r.after_pass || r.after.failedChecks !== 0) throw new Error(`${slug} does not pass the checker (${r.after?.failedChecks} failed checks); not publishing it`)
  const transcript = readFileSync(new URL(`${slug}/transcript.txt`, dir), 'utf8').trim()
  if (transcript.split('\n').length < 5) throw new Error(`${slug}: the transcript is nearly empty; a screen reader would read nothing`)
  const { data: b } = await db.storage.getBucket(BUCKET)
  if (!b) {
    const { error } = await db.storage.createBucket(BUCKET, { public: true })
    if (error && !/exists/i.test(error.message)) throw new Error(`bucket: ${error.message}`)
  }
  const name = `${slug}/${r.org.replace(/[^A-Za-z0-9]+/g, '-')}-${title.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '')}-fixed.pdf`
  const up = await db.storage.from(BUCKET).upload(name, readFileSync(new URL(`${slug}/fixed.pdf`, dir)), { upsert: true, contentType: 'application/pdf' })
  if (up.error) throw new Error(`upload: ${up.error.message}`)
  const fixed_url = db.storage.from(BUCKET).getPublicUrl(name).data.publicUrl
  const lean = (v) => ({ failedChecks: v.failedChecks, failedRules: v.failedRules, rules: (v.rules || []).map((x) => ({ clause: x.clause, failedChecks: x.failedChecks, description: x.description })) })
  const row = { slug, org: r.org, title, pages: r.pages, original_url: r.url, fixed_url, before: lean(r.before), after: lean(r.after), transcript, published: flag === '--publish' }
  const { error } = await db.from('kochito_samples').upsert(row)
  if (error) throw new Error(error.message)
  console.log(`${slug}: ${row.published ? 'public at' : 'stored, hidden; publish to show it at'} https://kochitolabs.com/s/${slug}`)
} else {
  console.error('usage: kochito-sample.mjs put <slug> [--publish] | unpublish <slug> | list')
  process.exit(1)
}
