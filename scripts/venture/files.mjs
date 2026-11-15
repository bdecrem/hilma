#!/usr/bin/env node
// The files customers sent us, and the promise made about them on the service
// page: "deleted 30 days after delivery, or sooner on request". Every file we
// receive has a row in kochito_files (schema 009) and a copy in the private
// bucket `kochito-files`; mailed attachments are put there by the mail webhook.
//
//   node scripts/venture/files.mjs                 what is held: id, from, name, size, delivered, due
//   node scripts/venture/files.mjs add <file> <from-address> [link|watch]
//                                                  record a file that came another way (fetched from a
//                                                  link they gave, or found on a page we watch for them)
//   node scripts/venture/files.mjs get <id> [dir]  download it (default apps/venture/private/customers/<id>/)
//   node scripts/venture/files.mjs delivered <id>  the fixed file went back today: deletion is due in 30 days
//   node scripts/venture/files.mjs forget <id>     delete now (the customer asked)
//   node scripts/venture/files.mjs purge [--dry]   delete everything that is due: the copy in the bucket and
//                                                  the working folder apps/venture/private/customers/<id>/
//                                                  on this machine (run `sync.mjs push` after, which removes
//                                                  the backup's copy of that folder). Run on every work block.
//
// purge also names anything held more than 60 days without a delivery date, so a
// file can never sit forgotten: deliver it, or forget it.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = Object.fromEntries(
  readFileSync(root + '.env.local', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const BUCKET = 'kochito-files'
const KEEP_DAYS = 30
const DAY = 864e5
const work = (id) => join(root, 'apps/venture/private/customers', String(id))
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : '-') // this machine's date
const fail = (m) => { console.error(m); process.exit(1) }

async function bucket() {
  const { data } = await db.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await db.storage.createBucket(BUCKET, { public: false })
  if (error && !/exists/i.test(error.message)) throw new Error(`bucket: ${error.message}`)
}
async function one(id) {
  const { data, error } = await db.from('kochito_files').select('*').eq('id', Number(id)).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) fail(`no file ${id}`)
  return data
}
// remove every copy we hold of one file, then say so in its row
async function erase(f, dry) {
  if (dry) return console.log(`would delete ${f.id}  ${f.name}  (from ${f.from_addr ?? '?'}, due ${day(f.delete_after)})`)
  if (f.path) {
    const { error } = await db.storage.from(BUCKET).remove([f.path])
    if (error) throw new Error(`remove ${f.path}: ${error.message}`)
  }
  if (existsSync(work(f.id))) rmSync(work(f.id), { recursive: true, force: true })
  const { error } = await db.from('kochito_files').update({ path: null, deleted_at: new Date().toISOString() }).eq('id', f.id)
  if (error) throw new Error(error.message)
  console.log(`deleted ${f.id}  ${f.name}`)
}

const [cmd, a, b, c] = process.argv.slice(2)
if (!cmd || cmd === 'list') {
  const { data, error } = await db.from('kochito_files').select('*').order('id')
  if (error) throw new Error(error.message)
  if (!data.length) console.log('no files received yet')
  for (const f of data) console.log(`${f.id}  ${day(f.at)}  ${f.source}  ${f.from_addr ?? '?'}  ${f.name}  ${(f.bytes / 1024).toFixed(0)} KB  delivered ${day(f.delivered_at)}  ${f.deleted_at ? `deleted ${day(f.deleted_at)}` : `delete by ${day(f.delete_after)}`}${f.path || f.deleted_at ? '' : '  (NOT KEPT: the upload failed)'}`)
} else if (cmd === 'add') {
  if (!a || !b || !existsSync(a)) fail('usage: files.mjs add <file> <from-address> [link|watch]')
  await bucket()
  const buf = readFileSync(a)
  const { data: row, error } = await db.from('kochito_files').insert({ source: c ?? 'link', from_addr: b.toLowerCase(), name: basename(a), bytes: buf.length, content_type: 'application/pdf' }).select('id').single()
  if (error) throw new Error(error.message)
  const path = `${c ?? 'link'}/${row.id}/${basename(a).replace(/[^\w.\-]+/g, '_')}`
  const up = await db.storage.from(BUCKET).upload(path, buf, { contentType: 'application/pdf', upsert: true })
  if (up.error) throw new Error(`upload: ${up.error.message}`)
  await db.from('kochito_files').update({ path }).eq('id', row.id)
  console.log(`recorded as file ${row.id}`)
} else if (cmd === 'get') {
  const f = await one(a)
  if (!f.path) fail(f.deleted_at ? `file ${f.id} was deleted on ${day(f.deleted_at)}` : `file ${f.id} was never kept`)
  const { data, error } = await db.storage.from(BUCKET).download(f.path)
  if (error) throw new Error(`download: ${error.message}`)
  const dir = b ?? work(f.id)
  mkdirSync(dir, { recursive: true })
  const out = join(dir, basename(f.path).replace(/^\d+-/, ''))
  writeFileSync(out, Buffer.from(await data.arrayBuffer()))
  console.log(out)
} else if (cmd === 'delivered') {
  const f = await one(a)
  const now = new Date()
  const { error } = await db.from('kochito_files').update({ delivered_at: now.toISOString(), delete_after: new Date(now.getTime() + KEEP_DAYS * DAY).toISOString() }).eq('id', f.id)
  if (error) throw new Error(error.message)
  console.log(`file ${f.id} delivered ${day(now)}; to be deleted by ${day(new Date(now.getTime() + KEEP_DAYS * DAY))}`)
} else if (cmd === 'forget') {
  await erase(await one(a), false)
} else if (cmd === 'purge') {
  const dry = a === '--dry'
  const { data, error } = await db.from('kochito_files').select('*').is('deleted_at', null).order('id')
  if (error) throw new Error(error.message)
  const due = data.filter((f) => f.delete_after && new Date(f.delete_after).getTime() <= Date.now())
  for (const f of due) await erase(f, dry)
  for (const f of data.filter((f) => !f.delivered_at && Date.now() - new Date(f.at).getTime() > 60 * DAY)) console.log(`HELD TOO LONG: ${f.id}  ${f.name} from ${f.from_addr ?? '?'}, received ${day(f.at)} and never delivered: deliver it or forget it`)
  if (!due.length) console.log('nothing is due')
} else {
  fail('usage: files.mjs [list] | add <file> <from> [link|watch] | get <id> [dir] | delivered <id> | forget <id> | purge [--dry]')
}
