#!/usr/bin/env node
// The private files (apps/venture/private/*.md, gitignored because this repo
// is public) and their copies in Supabase (venture_docs), both ways.
//   node scripts/venture/sync.mjs push    every .md there → a venture_docs row (slug from the file name)
//   node scripts/venture/sync.mjs pull    every row that came from a file → back into the folder
//                                         (a new machine, or a lost folder; never overwrites a newer file)
//   node scripts/venture/sync.mjs status  which side is newer, file by file
// Call agendas (call-*.md) are not documents; publish those with put.mjs.
// Every other file under private/ (data/ lead lists and scans, pdf-proof/ samples; not the KEY)
// goes to the private storage bucket `venture-private` at the same relative path: push uploads
// what changed (sha-256, remembered in private/.sync-manifest.json) and removes what was deleted here
// since the last push; pull downloads what is missing (a new machine, a lost folder) and what
// another machine changed. Two machines write here (a terminal session and the runner on the
// Mac mini), so the bucket keeps its own list, `.manifest.json` (path → sha-256 of what it holds):
// a file that is unchanged here since this machine last synced and differs there is replaced by
// pull; a file changed both here and there is never overwritten in either direction, it is
// printed as a conflict and left for a person to settle.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const BUCKET = 'venture-private'
const dirPath = fileURLToPath(dir)
const manifestPath = join(dirPath, '.sync-manifest.json')
const SKIP = new Set(['KEY', '.sync-manifest.json', '.DS_Store'])
// every non-document file below private/, as paths relative to it
const dataFiles = (d = dirPath) =>
  existsSync(d)
    ? readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = join(d, e.name)
        if (e.isDirectory()) return e.name.startsWith('.') || ['node_modules', '__pycache__', 'venv'].includes(e.name) ? [] : dataFiles(p)
        const rel = relative(dirPath, p)
        if (SKIP.has(e.name) || e.name.startsWith('.') || (d === dirPath && e.name.endsWith('.md'))) return []
        return [rel]
      })
    : []
async function bucket() {
  const { data } = await db.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await db.storage.createBucket(BUCKET, { public: false })
  if (error && !/exists/i.test(error.message)) throw new Error(`bucket: ${error.message}`)
}
async function listAll(prefix = '') {
  const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw new Error(`list ${prefix}: ${error.message}`)
  const out = []
  for (const o of data) {
    const p = prefix ? `${prefix}/${o.name}` : o.name
    if (o.id === null) out.push(...(await listAll(p))) // a folder
    else out.push(p)
  }
  return out
}
const REMOTE_MANIFEST = '.manifest.json'
async function remoteManifest() {
  const found = await db.storage.from(BUCKET).list('', { limit: 1000 })
  if (found.error) throw new Error(`list: ${found.error.message}`)
  if (!found.data.some((o) => o.name === REMOTE_MANIFEST)) return null // not written yet
  const { data, error } = await db.storage.from(BUCKET).download(REMOTE_MANIFEST)
  if (error) throw new Error(`manifest: ${error.message}`) // never treat a failed read as "empty"
  return JSON.parse(await data.text())
}
async function putRemoteManifest(m) {
  const { error } = await db.storage.from(BUCKET).upload(REMOTE_MANIFEST, Buffer.from(JSON.stringify(m)), { upsert: true, contentType: 'application/json' })
  if (error) throw new Error(`manifest: ${error.message}`)
}

const cmd = process.argv[2]
if (cmd === 'push') {
  const have = new Map((await rows()).map((r) => [r.slug, r]))
  // `push --only <file.md>`: that one document and nothing else (the terminal conversation, after
  // every message: scripts/venture/chat-export.py).
  const only = process.argv[3] === '--only' ? process.argv[4] : null
  for (const f of files().filter((f) => !only || f === only)) {
    const body = readFileSync(new URL(f, dir), 'utf8').trim()
    if (!body) {
      console.log(`skipped ${f}: empty (a report still being written?)`) // an agent's placeholder must not block every other note
      continue
    }
    const title = body.match(/^# (.+)\n/)?.[1].trim()
    if (!title) throw new Error(`${f} must start with "# Title"`)
    const slug = slugOf(f)
    if (have.get(slug)?.body === body && have.get(slug)?.source === f) continue
    const { error } = await db.from('venture_docs').upsert({ slug, title, body, source: f, updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
    console.log(`pushed ${f} → ${slug}`)
  }
  if (only) process.exit(0)
  await bucket()
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
  // what the bucket holds; the first time, this machine's own record of what it uploaded
  const remote = (await remoteManifest()) ?? { ...manifest }
  for (const rel of dataFiles()) {
    const buf = readFileSync(join(dirPath, rel))
    const sha = createHash('sha256').update(buf).digest('hex')
    if (remote[rel] === sha) { manifest[rel] = sha; continue } // the bucket already has exactly this
    if (manifest[rel] === sha) continue // unchanged here; the bucket has a newer one, pull brings it
    if (remote[rel] && remote[rel] !== manifest[rel]) {
      console.log(`conflict ${rel}: changed here and on another machine; not uploaded (compare by hand, then delete one side)`)
      continue
    }
    const { error } = await db.storage.from(BUCKET).upload(rel, buf, { upsert: true, contentType: 'application/octet-stream' })
    if (error) throw new Error(`upload ${rel}: ${error.message}`)
    manifest[rel] = remote[rel] = sha
    console.log(`uploaded ${rel} (${(buf.length / 1024).toFixed(0)} KB)`)
  }
  // a file pushed from here before and deleted here since: remove its copy too, or pull would bring it back
  // (only when the bucket still holds the version this machine last saw)
  const here = new Set(dataFiles())
  const gone = Object.keys(manifest).filter((rel) => !here.has(rel))
  const removable = gone.filter((rel) => !remote[rel] || remote[rel] === manifest[rel])
  if (removable.length) {
    const { error } = await db.storage.from(BUCKET).remove(removable)
    if (error) throw new Error(`remove: ${error.message}`)
    for (const rel of removable) delete remote[rel], console.log(`removed ${rel} (deleted here)`)
  }
  for (const rel of gone) delete manifest[rel]
  await putRemoteManifest(remote)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
  console.log('push done')
  // What was just pushed is what the voice call and the text replies load. Say how big it
  // is, and fail here when it nears the model's limit (2026-11-15: research files pushed
  // the notes past it and both lines went dead until Bart spoke to one).
  const check = spawnSync('npx', ['tsx', fileURLToPath(new URL('scripts/venture/notes-check.ts', root)), '--quiet'], { stdio: 'inherit' })
  if (check.status !== 0) process.exit(check.status ?? 1)
  // Every checkpoint also refreshes the two "Agent learning" figures the dashboard shows
  // (corrections that were new; Ola's score against Claude's). A failure here is said, not fatal.
  if (!only) {
    const learn = spawnSync('node', [fileURLToPath(new URL('scripts/venture/learning.mjs', root))], { encoding: 'utf8' })
    console.log(learn.status === 0 ? 'learning numbers refreshed' : `learning numbers NOT refreshed: ${(learn.stderr || learn.stdout || '').trim().split('\n').pop()}`)
  }
} else if (cmd === 'drop') {
  // `drop <slug>`: removes one document's row (a note that was renamed or replaced). The file is yours to delete.
  const slug = process.argv[3]
  if (!slug) throw new Error('usage: sync.mjs drop <slug>')
  const { error } = await db.from('venture_docs').delete().eq('slug', slug)
  if (error) throw new Error(error.message)
  console.log(`dropped ${slug}`)
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
  await bucket()
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
  const remote = await remoteManifest()
  const listed = remote ? Object.keys(remote) : (await listAll()).filter((rel) => rel !== REMOTE_MANIFEST)
  for (const rel of listed) {
    const path = join(dirPath, rel)
    if (existsSync(path)) {
      if (!remote) continue // an old bucket without a list: only what is missing
      const sha = createHash('sha256').update(readFileSync(path)).digest('hex')
      if (sha === remote[rel]) { manifest[rel] = sha; continue }
      if (sha !== manifest[rel]) { console.log(`kept ${rel} (changed here; the bucket has another version)`); continue }
    }
    const { data, error } = await db.storage.from(BUCKET).download(rel)
    if (error) throw new Error(`download ${rel}: ${error.message}`)
    const buf = Buffer.from(await data.arrayBuffer())
    mkdirSync(dirname(path), { recursive: true })
    console.log(`${existsSync(path) ? 'updated' : 'downloaded'} ${rel}`)
    writeFileSync(path, buf)
    manifest[rel] = createHash('sha256').update(buf).digest('hex')
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
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
