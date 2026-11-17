#!/usr/bin/env node
// The issue tracker behind app.kochitolabs.com (tables venture_issues and venture_commits, schema 011).
// One issue per piece of work; the lead and every builder keep it current with this, and the board,
// the 10 am text and the plate read it. Titles in plain words for Bart, never internal names.
//
//   node scripts/venture/issues.mjs add "title" --area web --pri P1 [--what "why, one or two sentences"]
//                                   [--who lead] [--week 1] [--start] [--link "label=https://…"] [--doc slug]
//   node scripts/venture/issues.mjs start <id> [--who name]
//   node scripts/venture/issues.mjs done <id> --proof "402 checks" [--commit <hash>]… [--day YYYY-MM-DD]
//   node scripts/venture/issues.mjs wait <id> [--what "what Bart has to do"]      waiting on Bart
//   node scripts/venture/issues.mjs open <id>                                    back to open (next up)
//   node scripts/venture/issues.mjs drop <id> [--why "…"]
//   node scripts/venture/issues.mjs edit <id> [--title …] [--what …] [--area …] [--pri …] [--who …] [--week …] [--proof …]
//   node scripts/venture/issues.mjs commit <id> <hash>…                          attach commits by hand
//   node scripts/venture/issues.mjs list [--day yesterday|today|YYYY-MM-DD] [--status done,in_progress] [--area web]
//   node scripts/venture/issues.mjs show <id>
//   node scripts/venture/issues.mjs plate                                         the plate, as the board shows it
//   node scripts/venture/issues.mjs unsorted                                      Ola commits that name no issue
//   node scripts/venture/issues.mjs place <sha> <id|none>                         file one under an issue, or mark it as needing none
//   node scripts/venture/issues.mjs import <file.json>                            many at once (the backfill; a private file)
//
// Commits find their issue by themselves when the message names it: put [OLA-142] in the subject or the
// body, and the cron /api/venture/commits/sync attaches it within 30 minutes. Areas: web (the web app),
// apps (Mac and phone apps), model (the model and skills), security, ops (operations), voice, design,
// board (this board). Statuses: open, in_progress, waiting (on Bart), done, dropped. Days are Pacific.
// Prints no secrets: the database key is read from .env.local and used, never shown.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

export const AREAS = { web: 'Web app', apps: 'Mac and phone apps', model: 'Model and skills', security: 'Security', ops: 'Operations', voice: 'Voice', design: 'Design', board: 'The board' }
const STATUSES = ['open', 'in_progress', 'waiting', 'done', 'dropped']
const PREFIX = 'OLA'
const pacificDay = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const shiftDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)

const argv = process.argv.slice(2)
const cmd = argv[0]
const pos = []
const opt = {}
for (let i = 1; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const k = a.slice(2)
    const v = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[++i]
    opt[k] = opt[k] === undefined ? v : [].concat(opt[k], v)
  } else pos.push(a)
}
const one = (k) => (Array.isArray(opt[k]) ? opt[k][opt[k].length - 1] : opt[k])
const many = (k) => (opt[k] === undefined ? [] : [].concat(opt[k]))
const die = (m) => {
  console.error(m)
  process.exit(1)
}
const check = (r, what) => {
  if (r.error) die(`${what}: ${r.error.message}`)
  return r.data
}
const normId = (s) => {
  const m = String(s ?? '').match(/^(?:OLA-)?(\d+)$/i)
  if (!m) die(`not an issue id: ${s} (like OLA-142)`)
  return `${PREFIX}-${Number(m[1])}`
}
async function get(id) {
  const row = check(await db.from('venture_issues').select('*').eq('id', id).maybeSingle(), 'read')
  if (!row) die(`no issue ${id}`)
  return row
}
async function patch(id, fields) {
  const row = check(await db.from('venture_issues').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single(), 'update')
  console.log(line(row))
  return row
}
function validate(f) {
  if (f.area !== undefined && !AREAS[f.area]) die(`area must be one of: ${Object.keys(AREAS).join(', ')}`)
  if (f.priority !== undefined && !/^P[012]$/.test(f.priority)) die('priority must be P0, P1 or P2')
  if (f.status !== undefined && !STATUSES.includes(f.status)) die(`status must be one of: ${STATUSES.join(', ')}`)
  if (f.week !== undefined && f.week !== null && !(f.week >= 1 && f.week <= 4)) die('week must be 1 to 4')
}

// A commit by hash: the full sha, subject, body and date from this checkout's git.
function gitCommit(hash) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%H%x1f%s%x1f%aI%x1f%b', hash], { cwd: root, encoding: 'utf8' })
    const [sha, subject, at, body] = out.split('\x1f')
    return { sha, subject, at, body: (body ?? '').trim().slice(0, 4000) }
  } catch {
    die(`no commit ${hash} in this checkout (git fetch first?)`)
  }
}
async function attach(id, hashes) {
  for (const h of hashes) {
    const c = gitCommit(h)
    check(await db.from('venture_commits').upsert({ ...c, issue_id: id, ignored: false }), 'commit')
    console.log(`  ${c.sha.slice(0, 8)} ${c.subject}`)
  }
}

const label = { open: 'next', in_progress: 'doing', waiting: 'waiting on Bart', done: 'done', dropped: 'dropped' }
const line = (r) => `${r.id.padEnd(8)} ${r.priority} ${(label[r.status] ?? r.status).padEnd(15)} ${r.area.padEnd(8)} ${(r.who ?? '').padEnd(10)} ${r.title}${r.status === 'done' && r.proof ? `  [${r.proof}]` : ''}`

if (cmd === 'add') {
  const title = pos[0]
  if (!title) die('usage: issues.mjs add "title" --area web --pri P1 [--what …] [--who lead] [--week 1] [--start]')
  const area = one('area')
  if (!area) die(`--area is required: ${Object.keys(AREAS).join(', ')}`)
  const last = check(await db.from('venture_issues').select('num').eq('project', 'ola').order('num', { ascending: false }).limit(1), 'read')
  const num = (last[0]?.num ?? 0) + 1
  const now = new Date().toISOString()
  const links = [...many('link').map((l) => ({ label: l.split('=')[0], url: l.slice(l.indexOf('=') + 1) })), ...many('doc').map((d) => ({ label: 'note', doc: d }))]
  const row = { id: `${PREFIX}-${num}`, num, project: 'ola', title, what: one('what') ?? '', area, priority: one('pri') ?? 'P1', who: one('who') ?? 'lead', week: one('week') ? Number(one('week')) : null, status: one('start') ? 'in_progress' : 'open', started_at: one('start') ? now : null, links }
  validate(row)
  console.log(line(check(await db.from('venture_issues').insert(row).select().single(), 'add')))
} else if (cmd === 'start') {
  const id = normId(pos[0])
  const r = await get(id)
  await patch(id, { status: 'in_progress', started_at: r.started_at ?? new Date().toISOString(), ...(one('who') ? { who: one('who') } : {}) })
} else if (cmd === 'done') {
  const id = normId(pos[0])
  const proof = one('proof')
  if (!proof || proof === true) die('done needs --proof "what proved it" (e.g. "402 checks", "his phone, by hand")')
  const r = await get(id)
  const now = new Date().toISOString()
  await patch(id, { status: 'done', proof, finished_at: now, started_at: r.started_at ?? now, day: one('day') ?? pacificDay() })
  await attach(id, many('commit'))
} else if (cmd === 'wait') {
  const id = normId(pos[0])
  await patch(id, { status: 'waiting', ...(one('what') ? { what: one('what') } : {}) })
} else if (cmd === 'open') {
  await patch(normId(pos[0]), { status: 'open' })
} else if (cmd === 'drop') {
  const id = normId(pos[0])
  const r = await get(id)
  await patch(id, { status: 'dropped', finished_at: new Date().toISOString(), day: pacificDay(), ...(one('why') ? { proof: `dropped: ${one('why')}` } : {}), what: r.what })
} else if (cmd === 'edit') {
  const id = normId(pos[0])
  const f = {}
  for (const [k, col] of [['title', 'title'], ['what', 'what'], ['area', 'area'], ['pri', 'priority'], ['who', 'who'], ['proof', 'proof'], ['day', 'day']]) if (one(k) !== undefined) f[col] = one(k)
  if (one('week') !== undefined) f.week = one('week') === 'none' ? null : Number(one('week'))
  validate(f)
  await patch(id, f)
} else if (cmd === 'commit') {
  const id = normId(pos[0])
  await get(id)
  await attach(id, pos.slice(1))
} else if (cmd === 'list') {
  let q = db.from('venture_issues').select('*').eq('project', 'ola')
  const d = one('day')
  if (d) q = q.eq('day', d === 'today' ? pacificDay() : d === 'yesterday' ? shiftDay(pacificDay(), -1) : d)
  if (one('status')) q = q.in('status', String(one('status')).split(','))
  if (one('area')) q = q.eq('area', one('area'))
  const rows = check(await q.order('num'), 'list')
  for (const r of rows) console.log(line(r))
  console.log(`${rows.length} issue(s)`)
} else if (cmd === 'show') {
  const r = await get(normId(pos[0]))
  const commits = check(await db.from('venture_commits').select('sha, subject, at').eq('issue_id', r.id).order('at'), 'commits')
  console.log(`${r.id}  ${r.title}\n${r.what}\n`)
  console.log(`area ${AREAS[r.area]} · ${r.priority} · ${label[r.status]} · ${r.who}${r.week ? ` · plan week ${r.week}` : ''}`)
  console.log(`opened ${r.opened_at}${r.started_at ? `, started ${r.started_at}` : ''}${r.finished_at ? `, finished ${r.finished_at}` : ''}${r.day ? ` (counts for ${r.day})` : ''}`)
  if (r.proof) console.log(`proof: ${r.proof}`)
  for (const l of r.links ?? []) console.log(`link: ${l.label} ${l.url ?? `note ${l.doc}`}`)
  for (const c of commits) console.log(`commit ${c.sha.slice(0, 8)} ${c.subject}`)
} else if (cmd === 'plate') {
  const rows = check(await db.from('venture_issues').select('*').eq('project', 'ola').in('status', ['in_progress', 'open', 'waiting']), 'plate')
  const order = { in_progress: 0, open: 1, waiting: 2 }
  rows.sort((a, b) => order[a.status] - order[b.status] || a.priority.localeCompare(b.priority) || a.num - b.num)
  for (const r of rows) console.log(line(r))
} else if (cmd === 'unsorted') {
  const rows = check(await db.from('venture_commits').select('sha, subject, at').is('issue_id', null).eq('ignored', false).order('at', { ascending: false }).limit(200), 'unsorted')
  for (const c of rows) console.log(`${c.sha.slice(0, 8)} ${c.at.slice(0, 16)} ${c.subject}`)
  console.log(`${rows.length} unsorted commit(s); place each: issues.mjs place <sha> <OLA-n | none>`)
} else if (cmd === 'place') {
  const [sha, where] = pos
  if (!sha || !where) die('usage: issues.mjs place <sha> <OLA-n | none>')
  const found = check(await db.from('venture_commits').select('sha').like('sha', `${sha}%`), 'find')
  if (found.length !== 1) die(`${found.length} commits start with ${sha}`)
  const fields = where === 'none' ? { issue_id: null, ignored: true } : { issue_id: (await get(normId(where))).id, ignored: false }
  check(await db.from('venture_commits').update(fields).eq('sha', found[0].sha), 'place')
  console.log(`${found[0].sha.slice(0, 8)} → ${where}`)
} else if (cmd === 'import') {
  // [{ num?, title, what, area, priority, status, who, week?, opened_at?, started_at?, finished_at?, day?, links?, proof?, commits?: [hash] }]
  const items = JSON.parse(readFileSync(pos[0], 'utf8'))
  const last = check(await db.from('venture_issues').select('num').eq('project', 'ola').order('num', { ascending: false }).limit(1), 'read')
  let next = (last[0]?.num ?? 0) + 1
  for (const it of items) {
    const num = it.num ?? next++
    const { commits = [], ...rest } = it
    const row = { project: 'ola', links: [], proof: '', what: '', who: 'lead', priority: 'P1', status: 'done', ...rest, id: `${PREFIX}-${num}`, num, updated_at: new Date().toISOString() }
    validate(row)
    check(await db.from('venture_issues').upsert(row), `import ${row.id}`)
    for (const h of commits) check(await db.from('venture_commits').upsert({ ...gitCommit(h), issue_id: row.id, ignored: false }), `commit ${h}`)
    console.log(line(row))
  }
  console.log(`${items.length} imported`)
} else {
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 22).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(cmd ? 1 : 0)
}
