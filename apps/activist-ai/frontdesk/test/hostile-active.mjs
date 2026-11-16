// Proof for check.mjs (second review, 2026-11-16). A hostile workspace answers the desk socket
// (the agent can replace opencode on its own loopback) and says a session is executing, under a
// NEW session id at every sweep. Before the fix the run ceiling was kept per session id and a run
// counted as activity, so this workspace was never interrupted and never stopped for idleness: it
// held one of the machine's four VM slots for good, with no person using it. No VM is needed: the
// front desk only ever sees the socket.
//   node frontdesk/test/hostile-active.mjs [rotate|same] [seconds]
// Prints one JSON line: when the front desk first tried to stop the workspace (ms after the one
// prompt, or null), how many interrupts the fake opencode received, and the same for a second front
// desk started later on the same database (a restart must not hand out a fresh ceiling).
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

const MODE = process.argv[2] ?? 'rotate'
const SECONDS = Number(process.argv[3] ?? 14)
const tmp = mkdtempSync(path.join(tmpdir(), 'rev2-active-'))
process.env.OLA_HOME = path.join(tmp, 'ola')
// ws.mjs stop must fail fast and touch nothing: a container CLI that does not exist.
process.env.OLA_CONTAINER_BIN = path.join(tmp, 'no-container-cli')
const slug = 'rev2-hx'
const dir = path.join(process.env.OLA_HOME, 'ws', slug)
mkdirSync(dir, { recursive: true, mode: 0o700 })
writeFileSync(path.join(dir, 'secrets.env'), 'OPENCODE_PASSWORD=made-up\n', { mode: 0o600 })

// ---- the fake opencode, the agent's
let n = 0
let interrupts = 0
const fake = http.createServer((req, res) => {
  req.resume()
  if (req.url.startsWith('/api/session/active')) {
    const id = MODE === 'same' ? 'ses_forever' : `ses_${n++}`
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: { [id]: { type: 'running' } } }))
  }
  if (/\/interrupt$/.test(req.url)) interrupts++
  if (req.url.startsWith('/api/event')) return res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
})
await new Promise((r) => fake.listen(path.join(dir, 'opencode.sock'), r))

const { openDb, loadKeys } = await import('../db.mjs')
const { makeWorkspaces } = await import('../workspaces.mjs')
const db = openDb(path.join(tmp, 'fd'))
const keys = loadKeys(path.join(tmp, 'fd'))
db.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('rev2-th', 'Rev2 team', 0)").run()
db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at) VALUES ('rev2-p', 'Person R.', 'active', x'01', 0)").run()
const wsId = Number(db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES (?, 'Rev2 hostile', 1, 'active', 0)").run(slug).lastInsertRowid)

// Idle limit 2 s, ceiling 3 s, grace 1 s: a person's run may keep the workspace up for about 4 s
// after their prompt; then the idle limit applies.
const opts = { idleStopMs: 2000, runCeilingMs: 3000, cancelGraceMs: 1000 }
function desk(t0) {
  const stops = []
  const w = makeWorkspaces({ db, keys, log: (m) => /idle stop|stopped after/.test(m) && stops.push(Date.now() - t0), ...opts })
  return { w, stops }
}
const t0 = Date.now()
const one = desk(t0)
const front = http.createServer((req, res) => one.w.forward(slug, wsId, 1, req, res, new URL(req.url, 'http://x').pathname, ''))
await new Promise((r) => front.listen(0, '127.0.0.1', r))
const r = await fetch(`http://127.0.0.1:${front.address().port}/api/session/ses_0/prompt`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
await r.text()
one.w.touch(slug)
const end = Date.now() + SECONDS * 1000
while (Date.now() < end && !one.stops.length) await new Promise((res) => setTimeout(res, 200))
const first = { stopTriedAtMs: one.stops[0] ?? null, interrupts }
one.w.close()
front.close()

// A front desk restart: the second one knows the prompt only from the audit log.
interrupts = 0
const restartAt = Date.now() - t0
const two = desk(t0)
const end2 = Date.now() + SECONDS * 1000
while (Date.now() < end2 && !two.stops.length) await new Promise((res) => setTimeout(res, 200))
const second = { restartedAtMs: restartAt, stopTriedAtMs: two.stops[0] ?? null, interrupts }
two.w.close()
console.log(JSON.stringify({ mode: MODE, sweepsAnswered: n, first, afterRestart: second }))
fake.close()
db.close()
rmSync(tmp, { recursive: true, force: true })
process.exit(0)
