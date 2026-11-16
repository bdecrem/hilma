#!/usr/bin/env node
// Ola's services as launchd user agents (no sudo), and one status command.
//
//   node ops/ola.mjs install          write and load the jobs below (needs the two env files)
//   node ops/ola.mjs status           every job (state, pid, last exit), the front desk, the
//                                     gateway, each workspace and its door and desk
//   node ops/ola.mjs prove-restarts   kickstart -k each job in turn; after each, a signed-in
//                                     session still works end to end (made-up account stage-kim)
//   node ops/ola.mjs uninstall        unload and remove the jobs (the env files and data stay)
//   node ops/ola.mjs container-up     what cx.ola.container runs: start Apple's container
//                                     system if it is not running (after a reboot it is not)
//
// The jobs, in ~/Library/LaunchAgents (loaded at login, restarted when they exit, ThrottleInterval
// 5 s, logs in ~/Library/Logs/ola/):
//   cx.ola.container   container-up, once at load
//   cx.ola.gateway     ops/run.mjs ~/.ola/gateway.env gateway/server.mjs     127.0.0.1:4180
//   cx.ola.frontdesk   ops/run.mjs ~/.ola/frontdesk.env frontdesk/server.mjs 127.0.0.1:4700
// and, while a workspace runs, its door and desk (cx.ola.door.<id>, cx.ola.desk.<id>), loaded and
// unloaded by workspace/ws.mjs start/stop under OLA_LAUNCHD=1 (set in frontdesk.env), with their
// plists in ~/.ola/launchd/ (not loaded at login: after a reboot no workspace runs).
//
// Everything listens on loopback only; nothing here opens a port to the network or needs root.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.join(HERE, '..')
const HOME = homedir()
const OLA = process.env.OLA_HOME || path.join(HOME, '.ola')
const AGENTS = path.join(HOME, 'Library/LaunchAgents')
const LOGS = path.join(HOME, 'Library/Logs/ola')
const UID = process.getuid()
const DOMAIN = `gui/${UID}`
const CONTAINER = process.env.OLA_CONTAINER_BIN || '/usr/local/bin/container'
const PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
const ENV = { gateway: path.join(OLA, 'gateway.env'), frontdesk: path.join(OLA, 'frontdesk.env') }

const fail = (m) => {
  console.error(`ola: ${m}`)
  process.exit(1)
}
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })
const xml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function readEnv(file) {
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const at = line.indexOf('=')
    if (at > 0 && !line.trim().startsWith('#')) out[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return out
}

const JOBS = [
  { label: 'cx.ola.container', args: [process.execPath, path.join(HERE, 'ola.mjs'), 'container-up'], keepAlive: false, log: 'container' },
  { label: 'cx.ola.gateway', args: [process.execPath, path.join(HERE, 'run.mjs'), ENV.gateway, 'gateway/server.mjs'], keepAlive: true, log: 'gateway' },
  { label: 'cx.ola.frontdesk', args: [process.execPath, path.join(HERE, 'run.mjs'), ENV.frontdesk, 'frontdesk/server.mjs'], keepAlive: true, log: 'frontdesk' },
]
function plist(job) {
  const log = path.join(LOGS, `${job.log}.log`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(job.label)}</string>
  <key>ProgramArguments</key><array>${job.args.map((a) => `<string>${xml(a)}</string>`).join('')}</array>
  <key>WorkingDirectory</key><string>${xml(AI)}</string>
  <key>EnvironmentVariables</key><dict><key>HOME</key><string>${xml(HOME)}</string><key>PATH</key><string>${PATH}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>${job.keepAlive ? '<true/>' : '<false/>'}
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ProcessType</key><string>Standard</string>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`
}

/** launchctl's view of one job: loaded or not, state, pid, last exit code. */
function job(label) {
  const r = sh('/bin/launchctl', ['print', `${DOMAIN}/${label}`])
  if (r.status !== 0) return { label, loaded: false }
  const get = (k) => new RegExp(`^\\s*${k} = (.+)$`, 'm').exec(r.stdout)?.[1]
  return { label, loaded: true, state: get('state'), pid: Number(get('pid')) || null, lastExit: get('last exit code') ?? null, runs: Number(get('runs')) || 0 }
}

function request(port, p, { headers = {}, method = 'GET', body, socketPath } = {}) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, socketPath, path: p, method, headers, timeout: 15_000 }, (res) => {
      let t = ''
      res.on('data', (d) => (t += d))
      res.on('end', () => {
        let json = null
        try {
          json = JSON.parse(t)
        } catch {}
        resolve({ status: res.statusCode, json, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] })
      })
    })
    r.on('error', () => resolve({ status: 0 }))
    r.on('timeout', () => (r.destroy(), resolve({ status: 0 })))
    r.end(body)
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- commands
const cmd = process.argv[2]
if (cmd === 'container-up') {
  const s = sh(CONTAINER, ['system', 'status'])
  if (s.status === 0 && /running/i.test(s.stdout)) console.log(`${new Date().toISOString()} container system already running`)
  else {
    const r = sh(CONTAINER, ['system', 'start'], { stdio: 'inherit' })
    console.log(`${new Date().toISOString()} container system start: exit ${r.status}`)
    process.exit(r.status ?? 1)
  }
} else if (cmd === 'install') {
  for (const [name, file] of Object.entries(ENV)) {
    if (!existsSync(file)) fail(`${file} is missing: write the ${name}'s settings there (mode 600; see the README, "Start at boot")`)
    const st = statSync(file)
    if ((st.mode & 0o077) !== 0) fail(`${file} must be mode 600`)
  }
  const fd = readEnv(ENV.frontdesk)
  if (fd.OLA_LAUNCHD !== '1') fail(`${ENV.frontdesk} must set OLA_LAUNCHD=1 (doors and desks as launchd jobs)`)
  if (!existsSync(path.join(AI, 'web/dist/index.html'))) fail('web/dist is not built: cd web && npm ci && npm run build')
  mkdirSync(AGENTS, { recursive: true })
  mkdirSync(LOGS, { recursive: true, mode: 0o700 })
  for (const j of JOBS) {
    const file = path.join(AGENTS, `${j.label}.plist`)
    writeFileSync(file, plist(j), { mode: 0o644 })
    sh('/bin/launchctl', ['bootout', `${DOMAIN}/${j.label}`])
    const b = sh('/bin/launchctl', ['bootstrap', DOMAIN, file])
    if (b.status !== 0) fail(`could not load ${j.label}: ${b.stderr.trim()}`)
    console.log(`loaded ${j.label}`)
  }
} else if (cmd === 'uninstall') {
  for (const j of JOBS) {
    sh('/bin/launchctl', ['bootout', `${DOMAIN}/${j.label}`])
    rmSync(path.join(AGENTS, `${j.label}.plist`), { force: true })
    console.log(`unloaded ${j.label}`)
  }
} else if (cmd === 'status') {
  let bad = 0
  for (const j of JOBS) {
    const s = job(j.label)
    const good = s.loaded && (j.keepAlive ? s.state === 'running' : true)
    if (!good) bad++
    console.log(`${good ? 'ok  ' : 'DOWN'}  ${j.label.padEnd(20)} ${s.loaded ? `${s.state}${s.pid ? `, pid ${s.pid}` : ''}, runs ${s.runs}, last exit ${s.lastExit}` : 'not loaded'}`)
  }
  const fdEnv = existsSync(ENV.frontdesk) ? readEnv(ENV.frontdesk) : {}
  const origin = new URL(fdEnv.OLA_FD_ORIGIN || 'http://localhost:4700')
  const fdPort = Number(fdEnv.OLA_FD_PORT || origin.port || 4700)
  const h = await request(fdPort, '/api/health', { headers: { host: origin.host } })
  if (h.status !== 200) bad++
  console.log(`${h.status === 200 ? 'ok  ' : 'DOWN'}  front desk           127.0.0.1:${fdPort} /api/health ${h.status || 'no answer'}`)
  const gwEnv = existsSync(ENV.gateway) ? readEnv(ENV.gateway) : {}
  const gwPort = Number(gwEnv.GATEWAY_PORT || 4180)
  const u = gwEnv.GATEWAY_USAGE_TOKEN ? await request(gwPort, '/v1/usage', { headers: { authorization: `Bearer ${gwEnv.GATEWAY_USAGE_TOKEN}` } }) : { status: -1 }
  if (u.status !== 200) bad++
  console.log(`${u.status === 200 ? 'ok  ' : 'DOWN'}  gateway              127.0.0.1:${gwPort} ${u.status === 200 ? `${u.json.data.length} caller(s), ${u.json.inflight} in flight, ${u.json.queued} waiting` : u.status === -1 ? '(no GATEWAY_USAGE_TOKEN to ask with)' : `/v1/usage ${u.status || 'no answer'}`}`)
  const ws = sh(process.execPath, [path.join(AI, 'workspace/ws.mjs'), 'status', '--json'], { env: { ...process.env, OLA_HOME: OLA } })
  let rows = []
  try {
    rows = JSON.parse(ws.stdout)
  } catch {}
  const ids = new Set(existsSync(path.join(OLA, 'ws')) ? sh('/bin/ls', [path.join(OLA, 'ws')]).stdout.split('\n').filter(Boolean) : [])
  for (const r of rows.filter((r) => ids.has(r.id))) {
    const d = job(`cx.ola.door.${r.id}`)
    const k = job(`cx.ola.desk.${r.id}`)
    const good = r.state !== 'running' || (r.door === 'open' && r.desk === 'open' && r.opencode === 200)
    if (!good) bad++
    console.log(`${good ? 'ok  ' : 'DOWN'}  workspace ${r.id.padEnd(10)} ${r.state}${r.state === 'running' ? `, opencode ${r.opencode}, door ${r.door} (${d.loaded ? `job pid ${d.pid}` : 'no job'}), desk ${r.desk} (${k.loaded ? `job pid ${k.pid}` : 'no job'})` : ''}, network ${r.network}`)
  }
  console.log(`logs: ${LOGS}/`)
  process.exit(bad ? 1 : 0)
} else if (cmd === 'prove-restarts') {
  await proveRestarts()
} else {
  console.error('usage: node ops/ola.mjs install | status | prove-restarts | uninstall | container-up')
  process.exit(2)
}

// ---------------------------------------------------------------- the restart proof
//
// A made-up person (stage-kim) owns a made-up 1 GiB workspace (stage-a) on the installed front
// desk; their passkey is a software one kept in ~/.ola/stage-key.json (600). One session, signed
// in once, must keep working after each job is killed and restarted by launchd.
async function proveRestarts() {
  const { SoftAuthn } = await import('../frontdesk/review/softauthn.mjs')
  const fdEnv = readEnv(ENV.frontdesk)
  const env = { ...process.env, ...fdEnv, OLA_HOME: OLA, PATH }
  const origin = new URL(fdEnv.OLA_FD_ORIGIN)
  const port = Number(fdEnv.OLA_FD_PORT || origin.port)
  const H = { host: origin.host, origin: origin.origin, 'content-type': 'application/json' }
  const admin = (...a) => {
    const r = sh(process.execPath, [path.join(AI, 'frontdesk/admin.mjs'), ...a], { env })
    if (r.status !== 0) throw new Error(`admin ${a[0]}: ${r.stderr.trim().split('\n').pop()}`)
    return r.stdout.trim()
  }
  const listed = admin('list')
  if (!/^person stage-kim /m.test(listed)) admin('add-person', 'stage-kim', '--name', 'Kim (staging, made up)')
  if (!/^workspace stage-a /m.test(listed)) admin('create-workspace', 'stage-a', '--name', 'Staging made-up project', '--team', 'stage', '--team-name', 'Staging (made up)', '--owner', 'stage-kim', '--memory', '1g', '--disk', '1g', '--cpus', '1')
  const keyFile = path.join(OLA, 'stage-key.json')
  let key
  if (existsSync(keyFile)) key = new SoftAuthn({ rpId: origin.hostname, origin: origin.origin, saved: JSON.parse(readFileSync(keyFile, 'utf8')) })
  else {
    key = new SoftAuthn({ rpId: origin.hostname, origin: origin.origin })
    const invite = admin('invite', 'stage-kim').split('/').pop()
    const o = await request(port, '/api/auth/register/options', { method: 'POST', headers: H, body: JSON.stringify({ invite }) })
    const v = await request(port, '/api/auth/register/verify', { method: 'POST', headers: H, body: JSON.stringify({ ceremony: o.json?.ceremony, response: key.create(o.json.options) }) })
    if (v.status !== 200) fail(`registering stage-kim's passkey: ${v.status}`)
  }
  const save = () => writeFileSync(keyFile, JSON.stringify(key.save()), { mode: 0o600 })
  save()
  const lo = await request(port, '/api/auth/login/options', { method: 'POST', headers: H, body: '{}' })
  const lv = await request(port, '/api/auth/login/verify', { method: 'POST', headers: H, body: JSON.stringify({ ceremony: lo.json?.ceremony, response: key.get(lo.json.options) }) })
  save()
  if (lv.status !== 200) fail(`signing in: ${lv.status}`)
  const cookie = lv.cookie
  const S = { ...H, cookie, 'x-ola-workspace': 'stage-a' }
  const secrets = () => readEnv(path.join(OLA, 'ws/stage-a/secrets.env'))
  const PROBE = 'import sys, urllib.request\nreq = urllib.request.Request("http://127.0.0.1:4180/v1/models", headers={"Authorization": "Bearer " + sys.stdin.read().strip()})\ntry:\n    print(urllib.request.urlopen(req, timeout=10).status)\nexcept urllib.error.HTTPError as e:\n    print(e.code)\nexcept Exception:\n    print("error")\n'

  // The whole path, with the one session: who am I, the project (wakes the workspace: ws.mjs
  // start, door and desk jobs), opencode through the desk, the gateway through the door.
  async function works() {
    const me = await request(port, '/api/me', { headers: S })
    if (me.status !== 200) return `me ${me.status}`
    let pr
    for (let i = 0; i < 60; i++) {
      pr = await request(port, '/api/project', { headers: S })
      if (pr.status !== 503 || pr.json?.error !== 'waking') break
      await sleep(1000)
    }
    if (pr.status !== 200) return `project ${pr.status}`
    const oc = await request(port, '/oc/api/session', { headers: S })
    if (oc.status !== 200) return `opencode ${oc.status}`
    const gw = sh(CONTAINER, ['exec', '-i', 'ola-stage-a', 'python3', '-I', '-c', PROBE], { input: secrets().BOX_API_KEY }).stdout.trim()
    if (gw !== '200') return `gateway through the door ${gw}`
    return null
  }
  const first = await works()
  if (first) fail(`before any restart: ${first}`)
  console.log('signed in as stage-kim; me, project, opencode and the gateway through the door all answer')
  const labels = ['cx.ola.container', 'cx.ola.gateway', 'cx.ola.frontdesk', 'cx.ola.door.stage-a', 'cx.ola.desk.stage-a']
  let failed = 0
  for (const label of labels) {
    const before = job(label)
    if (!before.loaded) {
      console.log(`FAIL  ${label}: not loaded`)
      failed++
      continue
    }
    const t0 = Date.now()
    const k = sh('/bin/launchctl', ['kickstart', '-k', `${DOMAIN}/${label}`])
    if (k.status !== 0) {
      console.log(`FAIL  ${label}: kickstart -k: ${k.stderr.trim()}`)
      failed++
      continue
    }
    let problem = 'not tried'
    let after = job(label)
    for (let i = 0; i < 90; i++) {
      await sleep(500)
      after = job(label)
      if (label !== 'cx.ola.container' && (!after.pid || after.pid === before.pid)) continue
      problem = await works()
      if (!problem) break
    }
    const ms = Date.now() - t0
    if (problem) failed++
    console.log(`${problem ? 'FAIL' : 'pass'}  ${label}: pid ${before.pid ?? '-'} -> ${after.pid ?? '-'}, ${problem ? problem : `the session works again after ${(ms / 1000).toFixed(1)} s`}`)
  }
  // Leave the staging workspace stopped (the checks count running workspaces machine-wide).
  sh(process.execPath, [path.join(AI, 'workspace/ws.mjs'), 'stop', 'stage-a'], { env })
  console.log(failed ? `${failed} of ${labels.length} restarts failed` : `all ${labels.length} restarts passed; stage-a stopped again`)
  process.exit(failed ? 1 : 0)
}
