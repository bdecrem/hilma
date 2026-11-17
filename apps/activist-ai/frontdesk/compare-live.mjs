#!/usr/bin/env node
// "Compare with Claude", live, once, by hand: a made-up project owned by an admin (so the
// subscription is the credential, as the rules say), a small made-up task done by Ola's own model,
// a made-up copy of it made in the sealed VM with that model, both doing the copy in scratch VMs,
// the judge twice, and the record the Quality page reads.
//
//   CLAUDE_OAUTH_TOKEN_FILE=~/.ola/claude-oauth-token node frontdesk/compare-live.mjs
//
// Its own everything: gateway on 4686 (Ola's model live on Together: GLM-5.3-Flash; Claude through
// the subscription), state in ~/.ola-cq-live, the front desk's code in this process (no port, no
// sign-in), one 1 GiB project `cqlive-a`, destroyed at the end. At most four Claude requests in all
// (OLA_FD_COMPARE_CLAUDE_REQUESTS=4: Claude Code's and the judge's together, by the gateway's count).
// The token is read by the gateway only (from its file); nothing here prints it, and the run fails if
// it appears in the gateway's output, the record or the VM. Prints where the record is, for the page.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const tokenFile = process.env.CLAUDE_OAUTH_TOKEN_FILE
if (!tokenFile) throw new Error('CLAUDE_OAUTH_TOKEN_FILE (a file, mode 600)')
const secret = readFileSync(tokenFile, 'utf8').trim()
const together = () => {
  const line = readFileSync(path.join(homedir(), 'Documents/code/hilma/.env.local'), 'utf8').split('\n').find((l) => l.startsWith('TOGETHER_API_KEY='))
  return line.slice('TOGETHER_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
}
const ID = 'cqlive-a'
const HOME = path.join(homedir(), '.ola-cq-live')
mkdirSync(HOME, { recursive: true, mode: 0o700 })
const usageToken = `usage-${randomBytes(16).toString('hex')}`
Object.assign(process.env, {
  OLA_HOME: HOME,
  OLA_GATEWAY_PORT: '4686',
  OLA_MAX_RUNNING: '2',
  OLA_RUNNING_SCOPE: 'home',
  OLA_FD_DATA: path.join(HOME, 'fd'),
  OLA_FD_ORIGIN: 'http://localhost:4991',
  OLA_FD_PORT: '4991',
  OLA_FD_GATEWAY_USAGE_TOKEN: usageToken,
  OLA_FD_COMPARE_PREFIX: 'cqlc',
  OLA_FD_CANDIDATES_DIR: path.join(HOME, 'candidates'),
  OLA_FD_COMPARE_CLAUDE_REQUESTS: '4',
  OLA_FD_COMPARE_ENGINE_MIN: '8',
  OLA_FD_COMPARE_TICK_MS: '86400000',
  OLA_FD_MODEL_LABEL: 'GLM-5.3-Flash',
})
delete process.env.CLAUDE_OAUTH_TOKEN_FILE
const say = (s) => console.log(`${new Date().toISOString().slice(11, 19)}  ${s}`)
const node = (script, argv) => spawnSync(process.execPath, [path.join(AI, script), ...argv], { env: process.env, encoding: 'utf8' })
const admin = (...a) => {
  const r = node('frontdesk/admin.mjs', a)
  if (r.status !== 0) throw new Error(`admin ${a[0]}: ${r.stderr.trim().split('\n').pop()}`)
  return r.stdout.trim()
}
let gwLog = ''
const gw = spawn(process.execPath, [path.join(AI, 'gateway/server.mjs')], {
  env: { HOME: homedir(), PATH: process.env.PATH, UPSTREAM_BASE_URL: 'https://api.together.xyz/v1', UPSTREAM_API_KEY: together(), GATEWAY_MODELS: 'general=zai-org/GLM-5.3-Flash', GATEWAY_PORT: '4686', GATEWAY_TOKENS_FILE: path.join(HOME, 'gateway-tokens'), GATEWAY_DOOR_DIR: path.join(HOME, 'gw'), GATEWAY_DB: path.join(HOME, 'usage.db'), GATEWAY_CLAUDE_FILE: path.join(HOME, 'gateway-claude'), CLAUDE_OAUTH_TOKEN_FILE: tokenFile, GATEWAY_USAGE_TOKEN: usageToken, GATEWAY_HOSTED_FILE: path.join(HOME, 'gateway-hosted') },
  stdio: ['ignore', 'pipe', 'pipe'],
})
gw.stdout.on('data', (d) => (gwLog += d))
gw.stderr.on('data', (d) => (gwLog += d))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 40 && !gwLog.includes('"event":"start"'); i++) await sleep(250)
if (!gwLog.includes('"event":"start"')) throw new Error('the gateway did not start')

let fd = null
let made = false
const claudeLines = () => gwLog.split('\n').filter((l) => l.includes('"route":"claude"'))
try {
  if (!existsSync(path.join(HOME, 'fd', 'platform.db'))) {
    admin('add-person', 'cqlive', '--name', 'Made-up Admin', '--admin')
  }
  admin('create-workspace', ID, '--name', 'Made-up volunteer roster', '--team', 'cqlive-team', '--team-name', 'Made-up Food Bank', '--owner', 'cqlive', '--memory', '1g', '--disk', '1g', '--cpus', '1')
  made = true
  const { makeFrontDesk } = await import('./server.mjs')
  fd = makeFrontDesk()
  const db = fd.db
  const ws = db.prepare("SELECT id, slug, name, status, 'owner' AS role FROM workspaces WHERE slug = ?").get(ID)
  const owner = db.prepare("SELECT id FROM people WHERE handle = 'cqlive'").get().id
  await fd.workspaces.ensureRunning(ID)
  // A small made-up roster with two repeated people and a blank.
  const csv = 'name,shift,hours\nTova Prell,Monday,3\nRun Okabe,Tuesday,5\ntova prell ,Monday,3\nSai Mbeki,Friday,\nLeda Voss,Monday,4\nRun Okabe,Tuesday,5\nIra Quill,Sunday,2\n'
  spawnSync('/usr/local/bin/container', ['exec', '-i', `ola-${ID}`, 'sh', '-c', 'cat > /work/roster.csv'], { input: csv })
  // Ola does the real (made-up) request in the project.
  const s = await fd.workspaces.oc(ID, 'POST', '/api/session', { title: 'live', location: { directory: '/work' }, metadata: { autonomy: 'go' }, permissions: [{ action: '*', resource: '*', effect: 'allow' }] })
  const sid = (s.json?.data ?? s.json).id
  await fd.workspaces.oc(ID, 'POST', `/api/session/${sid}/prompt`, { text: 'How many different people are in roster.csv? Some rows repeat (spelling and spaces can differ). Write the cleaned list to clean.csv and answer in one sentence.' })
  let list = []
  for (let i = 0; i < 120; i++) {
    await sleep(3000)
    const m = await fd.workspaces.oc(ID, 'GET', `/api/session/${sid}/message?limit=200`)
    list = Array.isArray(m.json?.data) ? m.json.data : Array.isArray(m.json) ? m.json : []
    if (list.some((x) => x.type === 'idle')) break
  }
  const message = list.find((x) => x.type === 'user')?.id
  say(`Ola answered the made-up request in the project (${list.filter((x) => x.type === 'assistant').length} steps)`)
  const st = await fd.compare.start(ws, owner, { conversation: sid, message, mode: 'twin' })
  say(`the made-up copy: ${JSON.stringify(st.body)}`)
  if (st.body.state === 'held') {
    const it = await fd.compare.show(ws, st.body.id)
    say(`held for the owner: ${JSON.stringify(it.body.findings)}; as the made-up owner, read and released`)
    await fd.compare.send(ws, owner, { id: st.body.id, release: true })
  } else if (st.body.state === 'ready') await fd.compare.send(ws, owner, { id: st.body.id })
  else throw new Error(`no copy to send: ${JSON.stringify(st.body)}`)
  const id = st.body.id
  let it = null
  for (let i = 0; i < 200; i++) {
    await sleep(5000)
    it = (await fd.compare.show(ws, id)).body
    if (['done', 'failed'].includes(it.state)) break
  }
  const row = db.prepare('SELECT * FROM comparisons WHERE id = ?').get(id)
  const record = existsSync(path.join(HOME, 'compare', id, 'result.json')) ? readFileSync(path.join(HOME, 'compare', id, 'result.json'), 'utf8') : ''
  const vm = spawnSync('/usr/local/bin/container', ['exec', `ola-${ID}`, 'sh', '-c', 'grep -rl -- "$0" /work 2>/dev/null | head -1', secret.slice(0, 24)], { encoding: 'utf8' }).stdout.trim()
  const leaked = [gwLog, record, JSON.stringify(row)].some((t) => t.includes(secret)) || Boolean(vm)
  say(`state ${it.state}; outcome ${it.outcome}; Ola ${row.ola_passed}/${row.ola_total}, Claude ${row.claude_passed}/${row.claude_total}; judge ${row.judged}; ${row.judge_tokens} judge tokens; Claude ${row.claude_tokens} tokens`)
  say(`the made-up request: ${it.twin?.request}`)
  say(`the difference: ${it.result?.judge?.difference}`)
  say(`Claude requests at the gateway: ${claudeLines().length} (mode ${claudeLines().every((l) => l.includes('"mode":"oauth"')) ? 'oauth' : '?'}); Ola's model requests: ${gwLog.split('\n').filter((l) => l.includes('"route":"chat"')).length}`)
  say(`the token anywhere it must not be: ${leaked ? 'YES' : 'no'}`)
  writeFileSync(path.join(HOME, 'last.json'), JSON.stringify({ id, fd: path.join(HOME, 'fd'), compare: path.join(HOME, 'compare') }) + '\n')
  say(`record for the Quality page: OLA_DEV_QUALITY_FROM=${path.join(HOME, 'fd')} OLA_DEV_QUALITY_DIR=${path.join(HOME, 'compare')}`)
  if (leaked) process.exitCode = 1
} finally {
  fd?.close()
  if (made) node('workspace/ws.mjs', ['destroy', ID, '--confirm', ID])
  gw.kill('SIGTERM')
}
