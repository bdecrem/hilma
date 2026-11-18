// "Compare with Claude", stood in for the dev server (dev.mjs), so the page's flow can be checked in
// Chromium and WebKit without sealed VMs: the same routes and replies as frontdesk/compare.mjs, a
// made-up copy that is ready (or held, after POST /__dev/compare?held=1) a moment after it is asked
// for, a canned result a moment after it is sent, and the Quality page from the front desk's own
// quality() over a database this stand-in keeps. The real thing, in the sealed VMs, is
// frontdesk/check.mjs's. Owner only, as there: a member gets { canCompare: false } and 403s.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { openDb } from '../../frontdesk/db.mjs'
import { CONSENT_REAL, compareConfig, quality, weekly } from '../../frontdesk/compare.mjs'

const CHECKS = [
  { name: 'has_clean', type: 'file', path: 'clean.csv' },
  { name: 'clean_rows', type: 'csv_rows', path: 'clean.csv' },
  { name: 'no_repeats', type: 'csv_unique', path: 'clean.csv', column: 'name' },
  { name: 'says_repeats', type: 'says_number' },
]
const DATA = 'id,name,region,hours\n1,Avel Pell,North,7\n2,Brin Quor,South,12\n3,Cosa Rask,East,3\n4,dree sumo ,North,9\n5,Elko Tavi,South,14\n6,Avel Pell,North,7\n7,Fenn Ulme,East,5\n'
const TWIN = { request: 'Remove the repeated rows from data.csv into clean.csv and tell me how many repeats you removed.', kind: 'clean', checks: CHECKS, files: [{ name: 'data.csv', size: 612, text: DATA }] }
const score = (pass) => ({ passed: pass.filter(Boolean).length, total: pass.length, all: pass.every(Boolean), checks: CHECKS.map((c, i) => ({ name: c.name, ok: pass[i], label: pass[i] ? 'success' : 'numbers_wrong' })) })
const RESULT = (mode) => ({
  engines: {
    ola: { final: 'The export has 30 data rows, counted by a short program.', end: 'done', ms: 9100, model: 'general', score: mode === 'twin' ? score([false, false, false, false]) : null, outputs: [{ name: 'rows.md', size: 88, text: null }] },
    claude: { final: 'I removed 4 repeated rows. clean.csv has 26 people.', end: 'done', ms: 14200, model: 'claude-opus-5-5', score: mode === 'twin' ? score([true, true, true, true]) : null, outputs: [{ name: 'clean.csv', size: 540, text: null }] },
  },
  judge: { verdict: 'y', difference: 'Claude removed the repeated rows into clean.csv and said how many; Ola only counted the rows.' },
  outcome: 'claude_better',
  label: 'stopped_early',
})

export function makeCompareStandin({ dir, role }) {
  mkdirSync(dir, { recursive: true })
  const db = openDb(path.join(dir, 'fd'))
  const xc = compareConfig({ OLA_HOME: dir, OLA_FD_COMPARE_DIR: path.join(dir, 'compare') })
  mkdirSync(xc.dir, { recursive: true })
  db.prepare("INSERT OR IGNORE INTO teams (id, slug, name, created_at) VALUES (1, 'dev', 'Dev', 0)").run()
  db.prepare("INSERT OR IGNORE INTO workspaces (id, slug, name, team_id, status, created_at) VALUES (1, 'dev', 'Dev', 1, 'active', 0)").run()
  const st = { real: false, auto: 'ask', perDay: 2, cap: 3, nextHeld: false, items: new Map() }
  const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
  const read = async (req) => {
    let raw = ''
    for await (const c of req) raw += c
    try {
      return JSON.parse(raw || '{}')
    } catch {
      return null
    }
  }
  const used = () => [...st.items.values()].filter((x) => x.state === 'done').length * 0.021
  const info = (conversation) => ({
    canCompare: true,
    configured: true,
    unavailable: null,
    mode: 'oauth',
    real: st.real,
    consent: CONSENT_REAL,
    auto: st.auto,
    perDay: st.perDay,
    month: { usedUsd: used(), capUsd: st.cap },
    realSent: [...st.items.values()].filter((x) => x.mode === 'real').reverse().map((x) => ({ at: Date.now(), state: x.state, outcome: x.state === 'done' ? 'claude_better' : null })),
    results: Object.fromEntries([...st.items.values()].filter((x) => x.conversation === conversation).map((x) => [x.message, { id: x.id, mode: x.mode, state: x.state, verdict: x.verdict, outcome: x.state === 'done' ? 'claude_better' : null, sentence: x.state === 'done' ? RESULT(x.mode).judge.difference : null }])),
  })
  const later = (ms, f) => setTimeout(f, ms).unref()
  const finish = (x) => {
    x.state = 'done'
    db.prepare("UPDATE comparisons SET state = 'done', kind = 'clean', outcome = 'claude_better', label = 'stopped_early', ola_passed = ?, ola_total = ?, claude_passed = ?, claude_total = ?, cost_micro_usd = 21000, finished_at = ?, claude_model = 'claude-opus-5-5' WHERE id = ?").run(x.mode === 'twin' ? 0 : null, x.mode === 'twin' ? 4 : null, x.mode === 'twin' ? 4 : null, x.mode === 'twin' ? 4 : null, Date.now(), x.id)
    if (x.mode === 'twin') {
      mkdirSync(path.join(xc.dir, x.id), { recursive: true })
      writeFileSync(path.join(xc.dir, x.id, 'result.json'), JSON.stringify({ twin: TWIN, ...RESULT('twin') }))
    }
  }
  const run = (x) => ((x.state = 'running'), db.prepare("UPDATE comparisons SET state = 'running' WHERE id = ?").run(x.id), later(1500, () => finish(x)))

  async function handle(req, res, p, url) {
    if (p === '/__dev/compare' && req.method === 'POST' && process.env.OLA_DEV_CONTROLS === '1') {
      st.nextHeld = url.searchParams.get('held') === '1'
      // ?refuse=1: the next start is refused as the front desk refuses one whose conversation it could not read.
      st.nextRefused = url.searchParams.get('refuse') === '1'
      return json(res, 200, { ok: true, items: st.items.size }), true
    }
    if (p === '/api/quality' || p === '/api/quality/weekly') {
      if (role() !== 'owner') return json(res, 404, { error: 'not_found' }), true
      // OLA_DEV_QUALITY_FROM=<a front desk's data folder> (and OLA_DEV_QUALITY_DIR, its compare
      // folder): the page shows that machine's real records, read-only (the live proof's).
      if (process.env.OLA_DEV_QUALITY_FROM) {
        const real = new DatabaseSync(path.join(process.env.OLA_DEV_QUALITY_FROM, 'platform.db'), { readOnly: true })
        try {
          const rxc = { ...xc, dir: process.env.OLA_DEV_QUALITY_DIR ?? xc.dir }
          return json(res, 200, p === '/api/quality' ? quality(real, rxc) : weekly(real)), true
        } finally {
          real.close()
        }
      }
      return json(res, 200, p === '/api/quality' ? quality(db, xc) : weekly(db)), true
    }
    if (role() !== 'owner') return json(res, p === '/api/compare' ? 200 : 403, p === '/api/compare' ? { canCompare: false } : { error: 'owner_only', message: 'Only the project’s owner can compare with Claude.' }), true
    if (p === '/api/compare' && req.method === 'GET') return json(res, 200, info(url.searchParams.get('conversation'))), true
    if (p === '/api/compare/item' && req.method === 'GET') {
      const x = st.items.get(url.searchParams.get('id'))
      if (!x) return json(res, 404, { error: 'not_found' }), true
      const showTwin = x.mode === 'twin' && x.state !== 'making' && x.state !== 'refused'
      return json(res, 200, { id: x.id, mode: x.mode, state: x.state, verdict: x.verdict, kind: 'clean', outcome: x.state === 'done' ? 'claude_better' : null, twin: showTwin ? TWIN : null, findings: x.state === 'held' ? [{ severity: 'unsure', kind: 'word', text: 'thaw', where: 'request' }] : null, result: x.state === 'done' ? RESULT(x.mode) : null }), true
    }
    if (!p.startsWith('/api/compare/') || req.method !== 'POST') return false
    const body = await read(req)
    if (!body) return json(res, 400, { error: 'bad_json' }), true
    const what = p.slice('/api/compare/'.length)
    if (what === 'settings') {
      if (typeof body.real === 'boolean') {
        if (body.real && body.consent !== true) return json(res, 400, { error: 'consent', message: 'Read the note and confirm to turn this on.' }), true
        st.real = body.real
      }
      if (body.auto) st.auto = body.auto
      if (body.perDay) st.perDay = body.perDay
      if (typeof body.capUsd === 'number') st.cap = body.capUsd
      return json(res, 200, info(null)), true
    }
    if (what === 'start') {
      const mode = body.mode === 'real' ? 'real' : 'twin'
      if (mode === 'real' && !st.real && body.once !== true) return json(res, 403, { error: 'real_off', message: 'Comparing the real task is off for this project. A made-up copy of this task can be compared instead.' }), true
      if (mode === 'real' && !st.real && body.consent !== true) return json(res, 400, { error: 'consent', message: 'Read the note and confirm to send this once.' }), true
      if (st.nextRefused) return (st.nextRefused = false), json(res, 502, { error: 'unreadable', message: 'Ola could not read this conversation just now, so nothing was sent. Try again in a moment.' }), true
      const x = { id: randomBytes(6).toString('hex'), conversation: body.conversation, message: body.message, mode, state: mode === 'real' ? 'ready' : 'making', verdict: null }
      st.items.set(x.id, x)
      db.prepare("INSERT INTO comparisons (id, workspace_id, session, message, mode, trigger, state, created_at, ola_model) VALUES (?, 1, ?, ?, ?, 'asked', ?, ?, 'general')").run(x.id, String(body.conversation).slice(0, 80), String(body.message).slice(0, 80), mode, x.state, Date.now())
      if (mode === 'real') run(x)
      else {
        const held = st.nextHeld
        st.nextHeld = false
        later(1200, () => ((x.state = held ? 'held' : 'ready'), (x.verdict = held ? 'unsure' : 'clean')))
      }
      return json(res, 200, { id: x.id, state: x.state }), true
    }
    const x = st.items.get(body.id)
    if (!x) return json(res, 404, { error: 'not_found' }), true
    if (what === 'send') {
      if (x.state === 'held' && body.release !== true) return json(res, 400, { error: 'release' }), true
      if (!['ready', 'held'].includes(x.state)) return json(res, 409, { error: 'state' }), true
      run(x)
      return json(res, 200, { id: x.id, state: 'queued' }), true
    }
    if (what === 'discard') {
      x.state = 'declined'
      return json(res, 200, { ok: true }), true
    }
    return json(res, 404, { error: 'not_found' }), true
  }
  return handle
}
