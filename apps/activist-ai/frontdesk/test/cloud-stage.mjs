#!/usr/bin/env node
// A small made-up Ola for the apps' one-cloud check (OLA-150), run on the machine that hosts the
// workspaces (the Mac mini for now), from a copy of this branch:
//
//   node frontdesk/test/cloud-stage.mjs
//
// It starts its own model gateway (the scripted fake model, port 4186), a fresh platform database,
// one made-up admin ("cloudadmin") with a made-up password and one small sealed project, and the
// front desk on 127.0.0.1:4796 (origin http://localhost:4796). It prints the password file's path
// and READY, then waits; Ctrl-C (or SIGTERM) stops everything and destroys the project. From the
// iMac, through `ssh -L 4796:127.0.0.1:4796`:
//
//   OLA_CLOUD_CHECK=1 OLA_ACCOUNT_BASE=http://localhost:4796 OLA_HANDLE=cloudadmin \
//   OLA_ACCOUNT_PASSWORD_FILE=<copy of the file> swift run olakit-selftest      (apple/OlaKit)
//
// Only made-up data; nothing of the staging machine's own (its database, its projects) is touched.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeModel } from '../../web/server/fake-model.mjs'

const AI = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PORT = Number(process.env.OLA_CLOUD_FD_PORT || 4796)
const GW_PORT = Number(process.env.OLA_CLOUD_GW_PORT || 4186)
const ORIGIN = `http://localhost:${PORT}`
const WS = 'cc-cloud'
const run = mkdtempSync(path.join(tmpdir(), 'ola-cloudstage-'))
const env = {
  ...process.env,
  OLA_HOME: path.join(homedir(), '.ola-cloudcheck'),
  OLA_GATEWAY_PORT: String(GW_PORT),
  OLA_MAX_RUNNING: '1',
  OLA_RUNNING_SCOPE: 'home',
  OLA_FD_DATA: path.join(run, 'frontdesk'),
  OLA_FD_ORIGIN: ORIGIN,
  OLA_FD_PORT: String(PORT),
  OLA_GATE_PASS_KEY: randomBytes(32).toString('hex'),
}
const node = (script, argv) => spawnSync(process.execPath, [path.join(AI, script), ...argv], { env, encoding: 'utf8' })
const admin = (...a) => {
  const r = node('frontdesk/admin.mjs', a)
  if (r.status !== 0) throw new Error(`admin ${a[0]}: ${r.stderr.trim().split('\n').pop()}`)
  return r.stdout.trim()
}
const children = []
const start = (script, extra = {}) => {
  const p = spawn(process.execPath, [path.join(AI, script)], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  p.log = ''
  p.stdout.on('data', (d) => (p.log = (p.log + d).slice(-20000)))
  p.stderr.on('data', (d) => (p.log = (p.log + d).slice(-20000)))
  children.push(p)
  return p
}
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const p of children) p.kill('SIGTERM')
  node('workspace/ws.mjs', ['destroy', WS, '--confirm', WS])
  rmSync(run, { recursive: true, force: true })
  console.log('stopped; the made-up project is destroyed')
  process.exit(code)
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
process.on('SIGHUP', () => stop(0)) // the ssh session that started it ended
const until = async (fn, ms, what) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if (await fn()) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`${what} did not happen`)
}

try {
  node('workspace/ws.mjs', ['destroy', WS, '--confirm', WS]) // a leftover from an earlier run
  admin('add-person', 'cloudadmin', '--name', 'Cloud Admin (made up)', '--admin')
  admin('create-workspace', WS, '--name', 'Made-up cloud project', '--team', 'cc-team', '--team-name', 'Made-up team', '--owner', 'cloudadmin', '--memory', '1g', '--disk', '1g', '--cpus', '1')
  const fake = await startFakeModel()
  fake.server.unref()
  const gw = start('gateway/server.mjs', {
    HOME: homedir(),
    UPSTREAM_BASE_URL: `http://127.0.0.1:${fake.port}/v1`,
    UPSTREAM_API_KEY: 'fake-model-key-not-a-secret',
    GATEWAY_MODELS: 'general=fake',
    GATEWAY_TOKENS_FILE: path.join(env.OLA_HOME, 'gateway-tokens'),
    GATEWAY_DOOR_DIR: path.join(env.OLA_HOME, 'gw'),
    GATEWAY_PORT: String(GW_PORT),
    GATEWAY_DB: path.join(run, 'usage.db'),
    GATEWAY_PEOPLE_TOKENS_FILE: path.join(env.OLA_HOME, 'gateway-people'),
  })
  await until(() => gw.log.includes('"event":"start"'), 10_000, 'the gateway start')
  start('frontdesk/server.mjs')
  await until(async () => (await fetch(`${ORIGIN}/api/health`)).ok, 10_000, 'the front desk start')
  // The made-up admin chooses a made-up password from the invitation, as a person would.
  const invite = admin('invite', 'cloudadmin').split('/').pop().replace(/^.*[#?=]/, '')
  const password = `made up ${randomBytes(6).toString('hex')}`
  const r = await fetch(`${ORIGIN}/api/auth/invite/password`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ invite, password }) })
  if (r.status !== 200) throw new Error(`the made-up password was not taken: ${r.status}`)
  const file = path.join(run, 'password')
  writeFileSync(file, password, { mode: 0o600 })
  console.log(`password file: ${file}`)
  console.log(`READY ${ORIGIN} handle cloudadmin project ${WS}`)
} catch (e) {
  console.error(`FAIL  ${e.message}`)
  stop(1)
}
