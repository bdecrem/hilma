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
import { aheadLine, noteAhead } from './_clock.mjs'

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
// History (2026-11-19). Bart: "how / where do you store things you learn and how solid a system is
// that ?" A push used to replace a document's row and a data file's copy, so a note overwritten by
// mistake (or by a machine holding an older folder) was gone. Now the version being replaced is
// kept first, in its own bucket, one per file per hour (the file as it stood when that hour's
// first change arrived): docs/<FILE.md>/<YYYY-MM-DDTHH> and data/<path>/<YYYY-MM-DDTHH>, UTC.
//   node scripts/venture/sync.mjs history RULES.md                  the versions kept
//   node scripts/venture/sync.mjs history RULES.md 2026-11-19T14    print that version
const HISTORY = 'venture-history'
const HISTORY_MAX = 400 * 1024 // bytes; larger data files (lead lists, scans) are not kept
let historyReady = false
async function keep(path, body) {
  if (!historyReady) {
    const { data } = await db.storage.getBucket(HISTORY)
    if (!data) {
      const { error } = await db.storage.createBucket(HISTORY, { public: false })
      if (error && !/exists/i.test(error.message)) throw new Error(`history bucket: ${error.message}`)
    }
    historyReady = true
  }
  const { error } = await db.storage.from(HISTORY).upload(`${path}/${new Date().toISOString().slice(0, 13)}`, Buffer.from(body), { upsert: false, contentType: 'text/plain' })
  if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`history ${path}: ${error.message}`) // no history, no overwrite
  return !error
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

// The times the journal gives for today (the "Now" line, "*Wednesday, 5:15 pm.*", and today's day
// notes, "- **10:05 am** …") that are more than three minutes ahead of the clock, Pacific.
function journalAhead(body) {
  const P = (o) => new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', ...o })
  const weekday = P({ weekday: 'long' })
  const heading = `## ${weekday}, ${P({ month: 'long' })} ${P({ day: 'numeric' })}`
  const nowMin = Number(P({ hour: 'numeric', hourCycle: 'h23' })) * 60 + Number(P({ minute: 'numeric' }))
  const mins = (h, m, ap) => ((Number(h) % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0)) * 60 + Number(m)
  const found = []
  const now = body.match(/^## Now\n+\*([A-Za-z]+), (\d{1,2}):(\d{2}) ([ap]m)/m)
  if (now && now[1] === weekday) found.push([`Now: ${now[2]}:${now[3]} ${now[4]}`, mins(now[2], now[3], now[4])])
  const i = body.indexOf(`\n${heading}\n`)
  if (i >= 0) {
    const sec = body.slice(i + heading.length + 2).split(/\n## /)[0]
    for (const m of sec.matchAll(/^- \*\*(\d{1,2}):(\d{2}) ([ap]m)/gm)) found.push([`${m[1]}:${m[2]} ${m[3]}`, mins(m[1], m[2], m[3])])
  }
  return found.filter(([, t]) => t > nowMin + 3).map(([s]) => s)
}

const cmd = process.argv[2]
if (cmd === 'push') {
  // A copy of the notes (VENTURE_PRIVATE, for tests) never reaches the live store (OLA-262): this push
  // reads the real folder, but the learning.mjs it runs would read the copy.
  const { refuseOnCopy } = await import('./_weak.mjs')
  refuseOnCopy('sync.mjs push (it runs learning.mjs, which stores the Learning numbers)')
  const have = new Map((await rows()).map((r) => [r.slug, r]))
  // `push --only <file.md>`: that one document and nothing else (the terminal conversation, after
  // every message: scripts/venture/chat-export.py).
  const only = process.argv[3] === '--only' ? process.argv[4] : null
  // A time in today's journal that is later than the clock was written from memory (2026-11-18: a
  // note said "5:10 pm" at 4:33 pm). The push refuses it: read the time with `date`, then write it.
  // The rules must fit in a session's context (2026-11-19: the start-of-session hook printed all of
  // RULES.md, Claude Code cut it to its first 2,000 characters, and sessions started without the
  // rules). The hook now prints a digest; a push is refused when the digest no longer fits or a
  // rule has no lead sentence to put in it.
  if (!only) {
    const fit = spawnSync('python3', [fileURLToPath(new URL('.claude/hooks/venture-rules.py', root)), '--size'], { encoding: 'utf8' })
    if (fit.status !== 0) {
      console.error(`RULES.md does not fit a session's context: ${fit.stderr.trim() || fit.stdout.trim()}`)
      process.exit(1)
    }
  }
  if (!only) {
    const late = journalAhead(readFileSync(new URL('JOURNAL.md', dir), 'utf8'))
    if (late.length) {
      console.error(`JOURNAL.md has a time later than the clock (${late.join(', ')}; it is ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })} Pacific). Read the time with \`date\` and correct it; nothing was pushed.`)
      process.exit(1)
    }
    // OLA-324 (Nov 20: log lines said 6:25 pm for work recorded at 6:09 pm): the typed write times of
    // the log's headings, NOW.md's "updated" line and each handoff's first line are not ahead of the clock
    const now = Date.now()
    for (const f of ['LOG.md', 'NOW.md', ...readdirSync(dir).filter((x) => /^HANDOFF-.*\.md$/.test(x))]) {
      const u = new URL(f, dir)
      if (!existsSync(u)) continue
      const found = noteAhead(f, readFileSync(u, 'utf8'), now)
      if (found.length) {
        console.error(`${aheadLine(found, f, now)} Nothing was pushed.`)
        process.exit(1)
      }
    }
  }
  // What the dashboard's Home shows Bart to act on comes from the journal: the check-in agenda
  // ("## Check-in list") and "## To be decided". Bart, Nov 19, 2026, at the check-in: "it should
  // have a link to each item so I can read up on it during the call" and "everything needs to
  // have clickable stuff in it". A line there with no link and no ticket number is refused, and
  // so is an agenda whose tickets differ from the ones the voice call is given (call-checkin.md).
  if (!only) {
    const journal = readFileSync(new URL('JOURNAL.md', dir), 'utf8')
    const section = (t) => (journal.split(/^## /m).find((x) => x.startsWith(t + '\n')) ?? '').split('\n').filter((l) => l.startsWith('- '))
    const bare = [...section('Check-in list'), ...section('To be decided')].filter((l) => !/^- nothing/i.test(l) && !/\bOLA-\d+\b|\]\(https?:\/\//.test(l))
    if (bare.length) {
      console.error(`JOURNAL.md: ${bare.length} line(s) under "Check-in list" or "To be decided" have nothing to click on Home. Give each its ticket number (OLA-n) or a link:\n${bare.map((l) => '  ' + l.slice(0, 110)).join('\n')}`)
      process.exit(1)
    }
    const idsOf = (text) => [...new Set(text.match(/\bOLA-\d+\b/g) ?? [])].sort()
    const call = existsSync(new URL('call-checkin.md', dir)) ? readFileSync(new URL('call-checkin.md', dir), 'utf8').split(/^## For information/m)[0] : null
    if (call !== null) {
      const a = idsOf(section('Check-in list').join('\n'))
      const b = idsOf(call)
      if (a.join() !== b.join()) {
        console.error(`The check-in agenda on Home (JOURNAL.md, "Check-in list": ${a.join(', ') || 'no tickets'}) and the agenda the voice call is given (call-checkin.md: ${b.join(', ') || 'no tickets'}) name different tickets. Make them match, then publish the call's: node scripts/venture/put.mjs call checkin apps/venture/private/call-checkin.md`)
        process.exit(1)
      }
    }
  }
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
    // the terminal conversation (--only, after every message) is a transcript, not a note: no history
    if (!only && have.get(slug)?.body) await keep(`docs/${f}`, have.get(slug).body)
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
    if (remote[rel] && buf.length <= HISTORY_MAX) {
      const was = await db.storage.from(BUCKET).download(rel)
      if (!was.error && was.data.size <= HISTORY_MAX) await keep(`data/${rel}`, Buffer.from(await was.data.arrayBuffer()))
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
    // What Bart typed on this machine, for the steer count on the other machines (steers.mjs --export).
    const typed = spawnSync('node', [fileURLToPath(new URL('scripts/venture/steers.mjs', root)), '--export'], { encoding: 'utf8' })
    if (typed.status !== 0) console.log(`typed messages NOT exported: ${(typed.stderr || typed.stdout || '').trim().split('\n').pop()}`)
    // The lead's model use on this machine, for the evening review on any machine (delegable.mjs --export, OLA-261).
    const del = spawnSync('node', [fileURLToPath(new URL('scripts/venture/delegable.mjs', root)), '--export'], { encoding: 'utf8' })
    if (del.status !== 0) console.log(`model use NOT exported: ${(del.stderr || del.stdout || '').trim().split('\n').pop()}`)
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
} else if (cmd === 'history') {
  const [file, stamp] = process.argv.slice(3)
  if (!file) { console.error('usage: sync.mjs history <FILE.md | data/path> [YYYY-MM-DDTHH]'); process.exit(1) }
  const path = file.endsWith('.md') && !file.includes('/') ? `docs/${file}` : `data/${file}` // a data file is named as under private/: data/weaknesses.json
  if (stamp) {
    const { data, error } = await db.storage.from(HISTORY).download(`${path}/${stamp}`)
    if (error) { console.error(`no version ${stamp} of ${file}`); process.exit(1) }
    process.stdout.write(Buffer.from(await data.arrayBuffer()))
  } else {
    const { data, error } = await db.storage.from(HISTORY).list(path, { limit: 1000, sortBy: { column: 'name', order: 'desc' } })
    if (error) throw new Error(error.message)
    if (!data.length) console.log(`no earlier version of ${file} is kept (history started 2026-11-19)`)
    for (const o of data) console.log(`${o.name}  ${(((o.metadata?.size ?? 0)) / 1024).toFixed(0)} KB`)
  }
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
  console.error('usage: sync.mjs push | pull | status | history <file> [stamp]')
  process.exit(1)
}
