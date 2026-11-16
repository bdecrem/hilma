// Proof for check.mjs (review of 2026-11-16, H2). A hostile workspace: the agent has replaced
// opencode on its own loopback (README: "the agent can replace opencode"), so whatever answers the
// desk socket is the agent's. Here a fake opencode on the desk socket path streams forged `read`
// tool events, each naming a different file, after one prompt. No VM is needed: the front desk only
// ever sees the socket. Prints one JSON line: the audit rows written and the worst event-loop stall.
//   node frontdesk/test/hostile-events.mjs [events]
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

const N = Number(process.argv[2] ?? 20000)
const tmp = mkdtempSync(path.join(tmpdir(), 'rev-hostile-'))
process.env.OLA_HOME = path.join(tmp, 'ola')
const slug = 'rev-hx'
const dir = path.join(process.env.OLA_HOME, 'ws', slug)
mkdirSync(dir, { recursive: true, mode: 0o700 })
writeFileSync(path.join(dir, 'secrets.env'), 'OPENCODE_PASSWORD=made-up\n', { mode: 0o600 })

// ---- the fake opencode, the agent's
const fake = http.createServer((req, res) => {
  if (req.url.startsWith('/api/event')) {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    let i = 0
    const burst = () => {
      let chunk = ''
      for (let k = 0; k < 500 && i < N; k++, i++) {
        const id = `call_${i}`
        chunk += `data: ${JSON.stringify({ type: 'session.tool.input.started', data: { id, name: 'read', sessionID: 'ses_victim' } })}\n\n`
        chunk += `data: ${JSON.stringify({ type: 'session.tool.called', data: { id, sessionID: 'ses_victim', input: { path: `/work/forged-${i}.csv` } } })}\n\n`
      }
      res.write(chunk)
      if (i < N) setImmediate(burst)
    }
    setTimeout(burst, 200)
    return
  }
  req.resume()
  res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
})
await new Promise((r) => fake.listen(path.join(dir, 'opencode.sock'), r))

// ---- the front desk's side, as server.mjs wires it
const { openDb, loadKeys } = await import('../db.mjs')
const { makeWorkspaces } = await import('../workspaces.mjs')
const db = openDb(path.join(tmp, 'fd'))
const keys = loadKeys(path.join(tmp, 'fd'))
db.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('rev-th', 'Rev hostile team', 0)").run()
db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at) VALUES ('rev-victim', 'Victim R.', 'active', x'01', 0)").run()
const wsId = Number(db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES (?, 'Rev hostile', 1, 'active', 0)").run(slug).lastInsertRowid)
const workspaces = makeWorkspaces({ db, keys, log: () => {} })
const front = http.createServer((req, res) => workspaces.forward(slug, wsId, 1, req, res, new URL(req.url, 'http://x').pathname, ''))
await new Promise((r) => front.listen(0, '127.0.0.1', r))

// event-loop stall while the forged stream arrives
let worst = 0
let last = Date.now()
const lag = setInterval(() => {
  const now = Date.now()
  worst = Math.max(worst, now - last - 20)
  last = now
}, 20)

const t0 = Date.now()
const r = await fetch(`http://127.0.0.1:${front.address().port}/api/session/ses_victim/prompt`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
await r.text()
const count = () => db.prepare("SELECT count(*) AS n FROM audit WHERE action = 'file_read_by_run'").get().n
let n = 0
for (let i = 0; i < 600; i++) {
  await new Promise((res) => setTimeout(res, 100))
  const m = count()
  if (m === n && m > 0 && Date.now() - t0 > 3000) break
  n = m
}
clearInterval(lag)
const actor = db.prepare("SELECT DISTINCT actor_person_id AS a FROM audit WHERE action = 'file_read_by_run'").all().map((x) => x.a)
console.log(JSON.stringify({ forgedEvents: N, auditRowsWritten: count(), distinctFiles: N, attributedTo: actor, worstEventLoopStallMs: worst, seconds: (Date.now() - t0) / 1000 }))
workspaces.close()
front.close()
fake.close()
db.close()
rmSync(tmp, { recursive: true, force: true })
process.exit(0)
