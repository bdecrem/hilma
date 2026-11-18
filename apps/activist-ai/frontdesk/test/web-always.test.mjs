// OLA-142: a project that said "Always in this project" to web search is not asked again, in any
// conversation, whatever its "Lots of permissions" switch. Before, a conversation under "Ask
// before each step" asked again at its next search: its opencode rules were written when it
// started, before the yes, and only "Lots of permissions" conversations were answered by the
// watcher. A fake opencode on the desk socket asks a wrapped web search and a plain command; the
// front desk's watcher must answer the search (through onGoWeb, a grant first) and leave the
// command to the person. No VM is needed: the front desk only ever sees the socket.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'

// workspace/ws.mjs reads OLA_HOME once, when first imported: one for the whole file.
const home = mkdtempSync(path.join(tmpdir(), 'ola-web-always-'))
process.env.OLA_HOME = path.join(home, 'ola')
// The watcher keeps trying the closed socket; nothing else is left to wait for.
after(() => setTimeout(() => process.exit(), 100))

async function watch(webMode) {
  const tmp = mkdtempSync(path.join(home, `fd-${webMode}-`))
  const slug = `wa-${webMode}`
  const dir = path.join(process.env.OLA_HOME, 'ws', slug)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(path.join(dir, 'secrets.env'), 'OPENCODE_PASSWORD=made-up\n', { mode: 0o600 })
  const fake = http.createServer((req, res) => {
    if (req.url.startsWith('/api/event')) {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      setTimeout(() => {
        const ev = (id, resources) => `data: ${JSON.stringify({ type: 'permission.asked', data: { id, sessionID: 'ses_one', action: 'shell', resources } })}\n\n`
        res.write(ev('per_web', ['ola-search "made-up flood maps" 2>&1', 'head -20']) + ev('per_cmd', ['rm -rf notes']))
      }, 200)
      return
    }
    req.resume()
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
  })
  await new Promise((r) => fake.listen(path.join(dir, 'opencode.sock'), r))
  const { openDb, loadKeys } = await import('../db.mjs')
  const { makeWorkspaces } = await import('../workspaces.mjs')
  const db = openDb(path.join(tmp, 'fd'))
  const keys = loadKeys(path.join(tmp, 'fd'))
  db.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('wa-team', 'Team', 0)").run()
  db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at) VALUES ('wa-person', 'Person P.', 'active', x'01', 0)").run()
  const wsId = Number(db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES (?, 'Web always', 1, 'active', 0)").run(slug).lastInsertRowid)
  const answered = []
  const workspaces = makeWorkspaces({ db, keys, log: () => {}, webModeOf: () => webMode, onGoWeb: async (_s, _w, sessionID, requestID) => answered.push(`${sessionID} ${requestID}`) })
  const front = http.createServer((req, res) => workspaces.forward(slug, wsId, 1, req, res, new URL(req.url, 'http://x').pathname, ''))
  await new Promise((r) => front.listen(0, '127.0.0.1', r))
  // A prompt (no autonomy given: the conversation is not known to be under Lots).
  await (await fetch(`http://127.0.0.1:${front.address().port}/api/session/ses_one/prompt`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).text()
  await new Promise((r) => setTimeout(r, 1500))
  workspaces.close()
  front.close()
  fake.close()
  return answered
}

test('Always in this project: a wrapped web search in a conversation under Ask is answered, a command is not', async () => {
  assert.deepEqual(await watch('always'), ['ses_one per_web'])
})

test('without Always, a conversation under Ask is asked as before', async () => {
  assert.deepEqual(await watch('ask'), [])
})
