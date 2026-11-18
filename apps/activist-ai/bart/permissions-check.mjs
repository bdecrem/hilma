#!/usr/bin/env node
// "Lots of permissions" applied on the machine (approver.mjs in the phone door), with no app open:
//
//   OLA_BART_STATE=<scratch>/state OLA_BART_PROJECT=<scratch>/project bart/ola-bart.sh files
//   node bart/permissions-check.mjs --opencode <bin> --state <scratch>/state --project <scratch>/project
//
// Starts the scripted model (web/server/fake-model.mjs), opencode 2.3.0 serve on loopback with the
// config `ola-bart.sh files` wrote (its model address pointed at the scripted model), and the phone
// door with its approver, the choice in a scratch file. Then, as Bart's phone would meet it:
//   - the choice reads `lots` with no file; GET and PUT /ola/permissions need opencode's password;
//   - Lots: a request that lists, reads, runs a command and writes a file finishes with every
//     question answered by the machine; a web search (`ola-search`) goes ahead too;
//   - Ask: the command waits for a person (still waiting after 4 s);
//   - switching back to Lots answers the waiting one at once; a refused step stays refused.
// Only made-up data. Exits 0 only if every line passes.
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeModel } from '../web/server/fake-model.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = {}
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i]
const state = path.resolve(args.state), project = path.resolve(args.project), bin = args.opencode
let bad = 0
const line = (ok, what, note = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && note ? `  (${note})` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const fake = await startFakeModel()
// The scripted model answers whole replies (the gateway streams them to opencode); this small
// front turns each into the stream opencode reads.
const model = await new Promise((ok) => {
  const srv = http.createServer(async (req, res) => {
    const c = []
    for await (const x of req) c.push(x)
    const body = JSON.parse(Buffer.concat(c).toString() || '{}')
    const r = await fetch(`http://127.0.0.1:${fake.port}${req.url}`, { method: req.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, stream: false }) })
    const j = await r.json()
    if (!body.stream || r.status !== 200) { res.writeHead(r.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify(j)) }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const msg = j.choices?.[0]?.message ?? {}
    const base = { id: j.id ?? 'c', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'general' }
    const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`)
    send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: msg.content ?? '' }, finish_reason: null }] })
    if (msg.tool_calls?.length) send({ ...base, choices: [{ index: 0, delta: { tool_calls: msg.tool_calls.map((t, i) => ({ index: i, ...t })) }, finish_reason: null }] })
    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: j.choices?.[0]?.finish_reason ?? 'stop' }], usage: j.usage ?? { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    res.end('data: [DONE]\n\n')
  })
  srv.listen(0, '127.0.0.1', () => ok({ server: srv, port: srv.address().port }))
})
// The config ola-bart.sh wrote, with the model address moved to the scripted model.
const cfgDir = path.join(state, 'check-config/opencode')
mkdirSync(cfgDir, { recursive: true })
const cfg = readFileSync(path.join(state, 'config/opencode/opencode.jsonc'), 'utf8').replace('http://127.0.0.1:4180/v1', `http://127.0.0.1:${model.port}/v1`)
writeFileSync(path.join(cfgDir, 'opencode.jsonc'), cfg)
for (const f of ['ola-reactions.md']) writeFileSync(path.join(cfgDir, f), readFileSync(path.join(state, 'config/opencode', f)))
// A stand-in ola-search first on the PATH: the check is about the question, not the web.
const fakeBin = path.join(state, 'check-bin')
mkdirSync(fakeBin, { recursive: true })
writeFileSync(path.join(fakeBin, 'ola-search'), '#!/bin/sh\necho "1. A made-up result for: $*"\n')
chmodSync(path.join(fakeBin, 'ola-search'), 0o755)
writeFileSync(path.join(project, 'survey.csv'), 'name,city\nAnn,Springfield\nBo,Shelbyville\nCy,Ogdenville\n')
rmSync(path.join(project, 'rows.md'), { force: true })
const permFile = path.join(state, 'check-permissions')
rmSync(permFile, { force: true })

const OC = 4900 + Math.floor(Math.random() * 40), DOOR = OC + 50
const PASSWORD = 'check-only-password'
const env = { PATH: `${fakeBin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`, HOME: process.env.HOME, OPENCODE_PASSWORD: PASSWORD, BOX_API_KEY: 'none',
  OPENCODE_DISABLE_CLAUDE_CODE: '1', OPENCODE_DISABLE_PROJECT_CONFIG: '1',
  XDG_CONFIG_HOME: path.join(state, 'check-config'), XDG_DATA_HOME: path.join(state, 'check-data'), XDG_STATE_HOME: path.join(state, 'check-state'), XDG_CACHE_HOME: path.join(state, 'cache') }
const oc = spawn(bin, ['serve', '--hostname', '127.0.0.1', '--port', String(OC)], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] })
let ocLog = ''
oc.stdout.on('data', (d) => (ocLog += d)); oc.stderr.on('data', (d) => (ocLog += d))
const door = spawn(process.execPath, [path.join(HERE, 'phone-door.mjs'), '127.0.0.1', String(DOOR), `127.0.0.1:${OC}`], { env: { ...env, OLA_BART_PERMISSIONS: permFile, OLA_ACCOUNT_BASE: 'http://127.0.0.1:9' }, stdio: ['ignore', 'pipe', 'pipe'] })
let doorLog = ''
door.stdout.on('data', (d) => (doorLog += d)); door.stderr.on('data', (d) => (doorLog += d))
const end = (code) => { oc.kill(); door.kill(); model.server.close(); fake.server.close(); process.exit(code) }

const BASIC = 'Basic ' + Buffer.from(`opencode:${PASSWORD}`).toString('base64')
function req(port, method, p, body, auth = BASIC) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(auth ? { authorization: auth } : {}), accept: 'application/json', ...(data ? { 'content-type': 'application/json', 'content-length': String(data.length) } : {}) } }, (res) => {
      const c = []
      res.on('data', (x) => c.push(x))
      res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(c).toString() || 'null') } catch {} resolve({ status: res.statusCode, json }) })
    })
    r.on('error', () => resolve({ status: 0, json: null }))
    if (data) r.write(data)
    r.end()
  })
}
const ocCall = (m, p, b) => req(OC, m, p, b)

for (let i = 0; i < 60; i++) { if ((await ocCall('GET', '/api/session')).status === 200) break; await sleep(500) }
await sleep(800) // the door's approver connects to the event stream

// Every question opencode asks and every answer, from our own subscription.
const asked = [], replied = []
const evReq = http.request({ host: '127.0.0.1', port: OC, path: '/api/event', headers: { authorization: BASIC, accept: 'text/event-stream' } }, (res) => {
  let buf = ''
  res.setEncoding('utf8')
  res.on('data', (c) => {
    buf += c
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
      if (!l.startsWith('data:')) continue
      try { const e = JSON.parse(l.slice(5)); if (e.type === 'permission.asked') asked.push(e.data); if (e.type === 'permission.replied') replied.push(e.data) } catch {}
    }
  })
})
evReq.on('error', () => {}); evReq.end()
await sleep(500)

async function run(text) {
  const s = await ocCall('POST', '/api/session', { title: 'permissions check', location: { directory: project } })
  const sid = s.json?.id ?? s.json?.data?.id
  await ocCall('POST', `/api/session/${sid}/prompt`, { text })
  return sid
}
async function idle(sid, ms = 60_000) {
  const t = Date.now() + ms
  while (Date.now() < t) {
    const a = await ocCall('GET', '/api/session/active')
    // opencode answers { data: { <session id>: … } } for the sessions still running.
    if (a.status === 200 && !Object.keys(a.json?.data ?? {}).includes(sid)) return true
    await sleep(400)
  }
  return false
}
const pending = async (sid) => { const r = await ocCall('GET', `/api/session/${sid}/permission`); return Array.isArray(r.json) ? r.json : r.json?.data ?? [] }

try {
  line((await req(DOOR, 'GET', '/ola/permissions', null, null)).status === 401, 'the choice needs a credential (401 without)')
  line((await req(DOOR, 'GET', '/ola/permissions', null, 'Basic ' + Buffer.from('opencode:wrong').toString('base64'))).status === 401, 'a wrong password is refused')
  line((await req(DOOR, 'GET', '/ola/permissions')).json?.mode === 'lots', 'no file: Lots of permissions, the default')
  line((await req(DOOR, 'PUT', '/ola/permissions', { mode: 'yes' })).status === 400, 'only lots or ask is taken')

  // Lots: the scripted task (list, read, run a command, write rows.md), nobody watching.
  let n = asked.length
  let sid = await run('How many rows are in survey.csv? Write the number to rows.md.')
  const finished = await idle(sid)
  const mine = asked.slice(n).filter((a) => a.sessionID === sid)
  line(finished && existsSync(path.join(project, 'rows.md')), 'Lots: the request ran to the end and wrote rows.md with no app open', ocLog.slice(-400))
  line(mine.length >= 2 && mine.every((a) => replied.some((r) => r.requestID === a.id && r.reply === 'once')), `Lots: every question (${mine.map((a) => a.action).join(', ')}) answered "once" by the machine`)
  line((await pending(sid)).length === 0, 'Lots: nothing left waiting')

  n = asked.length
  sid = await run('Please search the web for made-up rent strike news')
  await idle(sid)
  const web = asked.slice(n).filter((a) => a.sessionID === sid)
  line(web.some((a) => (a.resources ?? []).some((r) => r.includes('ola-search'))) && web.every((a) => replied.some((r) => r.requestID === a.id && r.reply === 'once')), 'Lots: a web search goes ahead too')

  // Ask: the command waits for a person.
  line((await req(DOOR, 'PUT', '/ola/permissions', { mode: 'ask' })).json?.mode === 'ask' && readFileSync(permFile, 'utf8').trim() === 'ask', 'PUT ask: kept on the machine')
  rmSync(path.join(project, 'rows.md'), { force: true })
  n = asked.length
  sid = await run('How many rows are in survey.csv? Write the number to rows.md.')
  let waiting = []
  for (let i = 0; i < 40 && !waiting.length; i++) { await sleep(500); waiting = await pending(sid) }
  await sleep(4000)
  waiting = await pending(sid)
  line(waiting.length === 1 && !replied.some((r) => r.requestID === waiting[0].id), `Ask: the ${waiting[0]?.action ?? 'step'} is still waiting for a person after 4 s`)

  // Back to Lots: the waiting step is answered at once, and the run finishes.
  line((await req(DOOR, 'PUT', '/ola/permissions', { mode: 'lots' })).json?.mode === 'lots', 'PUT lots')
  await sleep(1500)
  line(waiting[0] && replied.some((r) => r.requestID === waiting[0].id && r.reply === 'once'), 'switching to Lots answered the step that was waiting')
  line(await idle(sid) && existsSync(path.join(project, 'rows.md')), 'and the request finished')

  // A garbled file is not Lots.
  writeFileSync(permFile, 'sure\n')
  line((await req(DOOR, 'GET', '/ola/permissions')).json?.mode === 'ask', 'a file that says neither word means Ask')
  rmSync(permFile, { force: true })
} catch (e) {
  line(false, 'the check itself', e.stack)
}
evReq.destroy()
console.log(bad ? `FAILED (${bad})` : 'ALL PASSED')
if (bad) console.log(doorLog.slice(-800))
end(bad ? 1 : 0)
