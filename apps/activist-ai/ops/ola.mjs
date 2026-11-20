#!/usr/bin/env node
// Ola's services as launchd user agents (no sudo), one deploy command, and one status command.
//
//   node ops/ola.mjs deploy [<commit> | origin/main] [--unsigned] [--all]   (default origin/main; the commit
//                                     must be signed by a key in ~/.ola/allowed-signers, or
//                                     --unsigned, which is logged) the only way staging
//                                     changes: fetch, unpack that commit as a new release, npm ci
//                                     where the lockfile changed, build web/dist, run the --no-live
//                                     suites, and only if all pass point `current` at it and
//                                     restart the jobs whose code changed (the front desk always;
//                                     it drains, and the TLS front holds requests meanwhile, so a
//                                     deploy drops none: OLA-94); on a failed suite the running version is
//                                     left alone and the release is kept for a look
//                                     The suites run are those the change since the deployed
//                                     commit can affect, side by side (ops/select.mjs, OLA-283);
//                                     --all runs every one; the log and deploys.log name the skipped
//   node ops/ola.mjs check [<commit>] [--base <commit>] [--all] [--no-apps]
//                                     the deploy's steps and suites for one commit (default
//                                     origin/main) without serving it (OLA-84), the suites picked
//                                     against --base (default: the deployed commit): unpacked into
//                                     checks/<commit12>, the turn taken as a builder (a deploy that
//                                     arrives meanwhile goes first: the check gives the turn back
//                                     between suites and is retried later), no signature needed
//                                     (nothing is served); the result in checks.json and checks.log,
//                                     the folder removed when it passed
//   node ops/ola.mjs ci [--dry]       what cx.ola.ci runs every 10 minutes (ops/ci.mjs): every
//                                     change to main is checked automatically, once
//   node ops/ola.mjs install          write and load the jobs below, pointed at the deployed release
//                                     (needs the two env files and a deploy)
//   node ops/ola.mjs status           every job (state, pid, last exit), the front desk, the
//                                     gateway, each workspace and its door and desk
//   node ops/ola.mjs prove-restarts   kickstart -k each job in turn; after each, a signed-in
//                                     session still works end to end (made-up account stage-kim)
//   node ops/ola.mjs uninstall        unload and remove the jobs (the env files and data stay)
//   node ops/ola.mjs container-up     what cx.ola.container runs: start Apple's container
//                                     system if it is not running (after a reboot it is not)
//   node ops/ola.mjs clean [--dry]    what a deploy runs after it serves (ops/clean.mjs): old
//                                     workspace images, old releases, an oversized image builder,
//                                     and builders' leftovers on a written allowlist; prints
//                                     what it freed (--dry: what it would delete, nothing deleted)
//
// The jobs, in ~/Library/LaunchAgents (loaded at login, restarted when they exit, ThrottleInterval
// 5 s, logs in ~/Library/Logs/ola/):
//   cx.ola.container   container-up, once at load
//   cx.ola.gateway     ops/run.mjs ~/.ola/gateway.env gateway/server.mjs     127.0.0.1:4180
//   cx.ola.frontdesk   ops/run.mjs ~/.ola/frontdesk.env frontdesk/server.mjs 127.0.0.1:4700
//   cx.ola.tls         ops/run.mjs ~/.ola/tls.env ops/tls.mjs                127.0.0.1:4743 (only where tls.env exists)
//   cx.ola.tunnel      ops/run.mjs ~/.ola/tunnel.env ops/tunnel.mjs          ngrok, stage 2 (only where tunnel.env exists)
//   cx.ola.watch       ops/watch.mjs, every 2 minutes (StartInterval, not kept alive): the alarm
//                      (disk, memory, the web app's parts, the public address, the Almanac, the
//                      VMs, the nightly status files); texts the owner; settings ~/.ola/watch.env
//   cx.ola.ci          ops/ola.mjs ci, every 10 minutes (StartInterval, not kept alive): the
//                      automatic checks on every change to main (ops/ci.mjs, OLA-84)
//   cx.ola.backup      ops/backup.mjs run, nightly at 3:30 (only where ~/.ola/backup/key exists)
//   cx.ola.restoretest ops/backup.mjs restore-test, Sundays at 5:00 (same)
// and, while a workspace runs, its door and desk (cx.ola.door.<id>, cx.ola.desk.<id>), loaded and
// unloaded by workspace/ws.mjs start/stop under OLA_LAUNCHD=1 (set in frontdesk.env), with their
// plists in ~/.ola/launchd/ (not loaded at login: after a reboot no workspace runs).
//
// Staging runs from its own clone, ~/ola-staging (OLA_STAGING), which nothing else works in or
// pulls: a clone with no working tree of its own (git clone --no-checkout), holding
//   releases/<commit12>/apps/activist-ai   one unpacked commit each (git archive), with its own
//                                          node_modules and web/dist
//   current -> releases/<commit12>         what the jobs run (switched by rename, atomically)
//   deployed.json                          the deployed commit, when, the suites' counts, and the skills
//                                          version installed (skills/version.mjs; release.json too)
//   deploys.log                            one line per deploy, passed or refused
// State never lives in a release: the platform database in ~/.ola-frontdesk, workspaces, tokens
// and env files in ~/.ola, the gateway's usage in ~/.local/state/ola-gateway, logs in
// ~/Library/Logs/ola.
//
// Everything listens on loopback only; nothing here opens a port to the network or needs root.
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'
import { clean } from './clean.mjs'
import { deployable } from './signers.mjs'
import { unchanged } from './restart.mjs'
import { changedFiles, lanes, plan } from './select.mjs'
import { acquire as acquireTurn, holder as turnHolder, turnPaths } from './turn.mjs'

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
// The TLS front's settings (ops/tls.mjs); its job is installed only where this file exists.
const TLS_ENV = path.join(OLA, 'tls.env')
const TUNNEL_ENV = path.join(OLA, 'tunnel.env')
const BACKUP_KEY = path.join(OLA, 'backup', 'key')
const STAGING = process.env.OLA_STAGING || path.join(HOME, 'ola-staging')
const CURRENT = path.join(STAGING, 'current')
const SERVED = path.join(CURRENT, 'apps/activist-ai') // what the jobs run, through the symlink
const DEPLOYED = path.join(STAGING, 'deployed.json')
// A check's results (OLA-84), read by ops/ci.mjs and the alarm. Up here: the commands below run
// before the rest of the module is evaluated, so a constant declared further down is not yet set.
const CHECKS_JSON = 'checks.json'
// Homebrew's stable link, not the versioned Cellar path process.execPath resolves to (a brew
// upgrade removes that one, and every job with it).
const NODE = existsSync('/opt/homebrew/bin/node') ? '/opt/homebrew/bin/node' : process.execPath
// status and prove-restarts use the deployed code (its admin CLI and ws.mjs match the running
// services and the database's migrations), wherever this script was started from. By its real
// path: ws.mjs and admin.mjs run as a command only when argv[1] is their own (resolved) file, so
// through the `current` symlink they would load, do nothing and exit 0.
const CODE = existsSync(path.join(SERVED, 'ops/ola.mjs')) ? realpathSync(SERVED) : AI

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
  { label: 'cx.ola.container', args: [NODE, path.join(SERVED, 'ops/ola.mjs'), 'container-up'], keepAlive: false, log: 'container' },
  { label: 'cx.ola.gateway', args: [NODE, path.join(SERVED, 'ops/run.mjs'), ENV.gateway, 'gateway/server.mjs'], keepAlive: true, log: 'gateway' },
  { label: 'cx.ola.frontdesk', args: [NODE, path.join(SERVED, 'ops/run.mjs'), ENV.frontdesk, 'frontdesk/server.mjs'], keepAlive: true, log: 'frontdesk' },
  { label: 'cx.ola.tls', args: [NODE, path.join(SERVED, 'ops/run.mjs'), TLS_ENV, 'ops/tls.mjs'], keepAlive: true, log: 'tls', optional: TLS_ENV },
  // Stage 2 only: the public tunnel. Installed by `install` once ~/.ola/tunnel.env exists, never before.
  { label: 'cx.ola.tunnel', args: [NODE, path.join(SERVED, 'ops/run.mjs'), TUNNEL_ENV, 'ops/tunnel.mjs'], keepAlive: true, log: 'tunnel', optional: TUNNEL_ENV },
  // The alarm: a short run every 2 minutes. Not kept alive and never kickstarted by a deploy (each
  // run reads the code through `current`, so a deploy changes it without a restart).
  { label: 'cx.ola.watch', args: [NODE, path.join(SERVED, 'ops/watch.mjs')], keepAlive: false, interval: 120, log: 'watch' },
  // The automatic checks (OLA-84, ops/ci.mjs): every 10 minutes, the newest change to main that no
  // deploy or check has covered yet goes through the deploy's suites without being served.
  { label: 'cx.ola.ci', args: [NODE, path.join(SERVED, 'ops/ola.mjs'), 'ci'], keepAlive: false, interval: 600, log: 'ci' },
  // Encrypted backups (OLA-86, ops/backup.mjs): the nightly copy at 3:30 and the restore test on
  // Sundays at 5:00, local time. Only where the backup key exists; never run at load or by a deploy.
  { label: 'cx.ola.backup', args: [NODE, path.join(SERVED, 'ops/backup.mjs'), 'run'], keepAlive: false, calendar: { Hour: 3, Minute: 30 }, log: 'backup', optional: BACKUP_KEY },
  { label: 'cx.ola.restoretest', args: [NODE, path.join(SERVED, 'ops/backup.mjs'), 'restore-test'], keepAlive: false, calendar: { Weekday: 0, Hour: 5, Minute: 0 }, log: 'restoretest', optional: BACKUP_KEY },
]
/** The jobs this machine runs: the TLS front and the tunnel only where their env files exist. */
const jobsHere = () => JOBS.filter((j) => !j.optional || existsSync(j.optional))
function plist(job) {
  const log = path.join(LOGS, `${job.log}.log`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(job.label)}</string>
  <key>ProgramArguments</key><array>${job.args.map((a) => `<string>${xml(a)}</string>`).join('')}</array>
  <key>WorkingDirectory</key><string>${xml(SERVED)}</string>
  <key>EnvironmentVariables</key><dict><key>HOME</key><string>${xml(HOME)}</string><key>PATH</key><string>${PATH}</string></dict>
  <key>RunAtLoad</key>${job.calendar ? '<false/>' : '<true/>'}
  <key>KeepAlive</key>${job.keepAlive ? '<true/>' : '<false/>'}
${job.interval ? `  <key>StartInterval</key><integer>${job.interval}</integer>\n` : ''}${job.calendar ? `  <key>StartCalendarInterval</key><dict>${Object.entries(job.calendar).map(([k, v]) => `<key>${k}</key><integer>${v}</integer>`).join('')}</dict>\n` : ''}  <key>ThrottleInterval</key><integer>5</integer>
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

/**
 * With OLA_FD_PROXY_PROTOCOL=1 the front desk refuses a connection that does not start with a PROXY
 * line, so requests to its port send one (naming loopback) when that is set.
 */
function fdProxied(port) {
  if (!existsSync(ENV.frontdesk)) return false
  const e = readEnv(ENV.frontdesk)
  return e.OLA_FD_PROXY_PROTOCOL === '1' && port === Number(e.OLA_FD_PORT || new URL(e.OLA_FD_ORIGIN || 'http://localhost:4700').port || 4700)
}
function request(port, p, { headers = {}, method = 'GET', body, socketPath } = {}) {
  const createConnection = !socketPath && fdProxied(port)
    ? (_o, cb) => {
        const s = net.connect(port, '127.0.0.1', () => (s.write(`PROXY TCP4 127.0.0.1 127.0.0.1 1 ${port}\r\n`), cb(null, s)))
        s.once('error', cb)
      }
    : undefined
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, socketPath, path: p, method, headers, timeout: 15_000, createConnection }, (res) => {
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

/** Through the TLS front from loopback: the certificate it serves and /api/health's status. */
function tlsHealth(env) {
  const [host, port] = (env.OLA_TLS_LISTEN || '127.0.0.1:4743').split(/:(?=\d+$)/)
  const name = env.OLA_TLS_SERVERNAME || 'app.ola.cx'
  return new Promise((resolve) => {
    const done = (r) => (clearTimeout(timer), resolve({ listen: `${host}:${port}`, ...r }))
    const timer = setTimeout(() => (raw.destroy(), done({ error: 'timeout' })), 10_000)
    const raw = net.connect(+port, host, () => {
      if ((env.OLA_TLS_PROXY_IN ?? '1') === '1') raw.write(`PROXY TCP4 127.0.0.1 127.0.0.1 1 ${port}\r\n`)
      const s = tls.connect({ socket: raw, servername: name, rejectUnauthorized: false, ALPNProtocols: ['http/1.1'] }, () => {
        const c = s.getPeerX509Certificate()
        const info = { notAfter: c ? new Date(c.validTo).toISOString() : null, serial: c?.serialNumber ?? '' }
        s.write(`GET /api/health HTTP/1.1\r\nHost: ${name}\r\nConnection: close\r\n\r\n`)
        let t = ''
        s.on('data', (d) => (t += d))
        s.on('end', () => done({ ...info, status: Number(/^HTTP\/1\.1 (\d{3})/.exec(t)?.[1]) || 0 }))
        s.on('error', () => done({ ...info, status: 0 }))
      })
      s.on('error', (e) => done({ error: e.code || 'tls error' }))
    })
    raw.on('error', (e) => done({ error: e.code || 'no answer' }))
  })
}

/**
 * Writes the jobs' plists (pointed at SERVED) and loads them. A job whose plist is unchanged and
 * loaded is restarted with kickstart -k when `restart` (the container job never is: it only starts
 * Apple's container system), unless its code is the same in the release it runs from (the gateway,
 * the TLS front, the tunnel: ops/restart.mjs, OLA-94); any other is unloaded and loaded again.
 */
function install({ restart }) {
  for (const [name, file] of Object.entries(ENV)) {
    if (!existsSync(file)) fail(`${file} is missing: write the ${name}'s settings there (mode 600; see the README, "Start at boot")`)
    const st = statSync(file)
    if ((st.mode & 0o077) !== 0) fail(`${file} must be mode 600`)
  }
  const fd = readEnv(ENV.frontdesk)
  if (fd.OLA_LAUNCHD !== '1') fail(`${ENV.frontdesk} must set OLA_LAUNCHD=1 (doors and desks as launchd jobs)`)
  if (!existsSync(path.join(SERVED, 'web/dist/index.html'))) fail(`nothing is deployed in ${STAGING}: node ops/ola.mjs deploy (see the README, "Deploying staging")`)
  for (const f of [TLS_ENV, TUNNEL_ENV]) if (existsSync(f) && (statSync(f).mode & 0o077) !== 0) fail(`${f} must be mode 600`)
  mkdirSync(AGENTS, { recursive: true })
  mkdirSync(LOGS, { recursive: true, mode: 0o700 })
  for (const j of jobsHere()) {
    const file = path.join(AGENTS, `${j.label}.plist`)
    const text = plist(j)
    const same = existsSync(file) && readFileSync(file, 'utf8') === text && job(j.label).loaded
    if (same && !restart) {
      console.log(`${j.label} already loaded`)
      continue
    }
    if (same) {
      if (j.keepAlive) {
        // A job whose code did not change keeps running, and keeps open what passes through it
        // (OLA-94, ops/restart.mjs): it works in the release it started from.
        const s = job(j.label)
        const from = s.state === 'running' && s.pid ? cwdOf(s.pid) : null
        if (from && unchanged(j.label, from, realpathSafe(SERVED))) {
          console.log(`${j.label} unchanged, left running (pid ${s.pid}, from ${path.relative(STAGING, from).split('/').slice(0, 2).join('/')})`)
          continue
        }
        const k = sh('/bin/launchctl', ['kickstart', '-k', `${DOMAIN}/${j.label}`])
        if (k.status !== 0) fail(`could not restart ${j.label}: ${k.stderr.trim()}`)
        console.log(`restarted ${j.label}`)
      }
      continue
    }
    writeFileSync(file, text, { mode: 0o644 })
    sh('/bin/launchctl', ['bootout', `${DOMAIN}/${j.label}`])
    let b
    for (let i = 0; i < 10; i++) {
      b = sh('/bin/launchctl', ['bootstrap', DOMAIN, file])
      if (b.status === 0) break
      spawnSync('/bin/sleep', ['0.5']) // bootout returns before the old job is gone
    }
    if (b.status !== 0) fail(`could not load ${j.label}: ${b.stderr.trim()}`)
    console.log(`loaded ${j.label}`)
  }
}

// ---------------------------------------------------------------- commands
const cmd = process.argv[2]
/** The value after a flag (--base <commit>), or null. */
function optArg(flag) {
  const i = process.argv.indexOf(flag)
  return i > 2 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null
}
/** The commit to deploy or check: the first word that is no flag and no flag's value. */
function refArg() {
  const a = process.argv.slice(3)
  return a.find((x, i) => !x.startsWith('--') && a[i - 1] !== '--base') || 'origin/main'
}
if (cmd === 'container-up') {
  const s = sh(CONTAINER, ['system', 'status'])
  if (s.status === 0 && /running/i.test(s.stdout)) console.log(`${new Date().toISOString()} container system already running`)
  else {
    const r = sh(CONTAINER, ['system', 'start'], { stdio: 'inherit' })
    console.log(`${new Date().toISOString()} container system start: exit ${r.status}`)
    process.exit(r.status ?? 1)
  }
} else if (cmd === 'install') {
  install({ restart: false })
} else if (cmd === 'deploy') {
  await deploy(refArg(), { unsigned: process.argv.includes('--unsigned'), all: process.argv.includes('--all') })
} else if (cmd === 'check') {
  const r = await deploy(refArg(), { check: true, all: process.argv.includes('--all'), base: optArg('--base'), noApps: process.argv.includes('--no-apps') })
  if (!r?.ok) process.exitCode = r?.yielded ? 3 : 1
} else if (cmd === 'ci') {
  const { ciOnce } = await import('./ci.mjs')
  process.exitCode = await ciOnce({ STAGING, check: (ref) => deploy(ref, { check: true }), dry: process.argv.includes('--dry') })
} else if (cmd === 'uninstall') {
  for (const j of JOBS) {
    sh('/bin/launchctl', ['bootout', `${DOMAIN}/${j.label}`])
    rmSync(path.join(AGENTS, `${j.label}.plist`), { force: true })
    console.log(`unloaded ${j.label}`)
  }
} else if (cmd === 'status') {
  let bad = 0
  const dep = existsSync(DEPLOYED) ? JSON.parse(readFileSync(DEPLOYED, 'utf8')) : null
  let target = null
  try {
    target = readlinkSync(CURRENT)
  } catch {}
  const depOk = dep && target === `releases/${dep.commit.slice(0, 12)}`
  if (!depOk) bad++
  console.log(`${depOk ? 'ok  ' : 'DOWN'}  deployed             ${dep ? `${dep.commit.slice(0, 12)} (${dep.ref}) at ${dep.at}; suites ${Object.entries(dep.suites).map(([k, v]) => `${k} ${v}`).join(', ')}` : 'nothing'}; current -> ${target ?? 'missing'} in ${STAGING}`)
  const th = turnHolder()
  console.log(`ok    test turn            ${th ? `${th.label}${th.pid ? ` (pid ${th.pid})` : ' (a shell script)'} for ${Math.round((Date.now() - th.since) / 60000)} min` : 'free'} (node ops/turn.mjs status)`)
  // Every Ola job must run from the staging clone: the three fixed jobs and each workspace's door
  // and desk (whose plists ws.mjs writes at each start).
  const plists = JOBS.map((j) => path.join(AGENTS, `${j.label}.plist`)).filter(existsSync)
  if (existsSync(path.join(OLA, 'launchd'))) for (const f of readdirSync(path.join(OLA, 'launchd'))) if (f.endsWith('.plist')) plists.push(path.join(OLA, 'launchd', f))
  const outside = plists.filter((f) => readFileSync(f, 'utf8').includes('/apps/activist-ai/') && !readFileSync(f, 'utf8').includes(`${STAGING}/`))
  if (outside.length) bad++
  console.log(`${outside.length ? 'DOWN' : 'ok  '}  jobs run from        ${outside.length ? `outside ${STAGING}: ${outside.map((f) => path.basename(f)).join(', ')}` : `${STAGING} (${plists.length} plists)`}`)
  const elsewhere = sh('/bin/ps', ['-axww', '-o', 'pid=,command=']).stdout.split('\n').filter((l) => /apps\/activist-ai\/(ops\/run|workspace\/(door|desk)|gateway\/server|frontdesk\/server)\.mjs/.test(l) && !l.includes(`${STAGING}/`))
  for (const l of elsewhere) console.log(`note  an Ola process outside ${STAGING} (a check or a dev run?): ${l.trim().slice(0, 160)}`)
  for (const j of jobsHere()) {
    const s = job(j.label)
    const good = s.loaded && (j.keepAlive ? s.state === 'running' : true)
    if (!good) bad++
    console.log(`${good ? 'ok  ' : 'DOWN'}  ${j.label.padEnd(20)} ${s.loaded ? `${s.state}${s.pid ? `, pid ${s.pid}` : ''}, runs ${s.runs}, last exit ${s.lastExit}` : 'not loaded'}`)
  }
  // The alarm's last run, from its state file (DOWN when it has not run for 6 minutes or its last
  // text did not go out).
  if (existsSync(path.join(CODE, 'ops/watch.mjs'))) {
    const { statusLine } = await import(path.join(CODE, 'ops/watch.mjs'))
    const w = statusLine()
    if (!w.ok) bad++
    console.log(`${w.ok ? 'ok  ' : 'DOWN'}  alarm                ${w.text}`)
  }
  const fdEnv = existsSync(ENV.frontdesk) ? readEnv(ENV.frontdesk) : {}
  const origin = new URL(fdEnv.OLA_FD_ORIGIN || 'http://localhost:4700')
  const fdPort = Number(fdEnv.OLA_FD_PORT || origin.port || 4700)
  const h = await request(fdPort, '/api/health', { headers: { host: origin.host } })
  if (h.status !== 200) bad++
  console.log(`${h.status === 200 ? 'ok  ' : 'DOWN'}  front desk           127.0.0.1:${fdPort} /api/health ${h.status || 'no answer'}`)
  if (existsSync(TLS_ENV)) {
    // The TLS front: what certificate it serves (DOWN with 21 days or fewer left: renewal from the
    // iMac starts at 30) and what /api/health answers through it (from loopback, past the gate).
    const t = await tlsHealth(readEnv(TLS_ENV))
    const left = t.notAfter ? Math.floor((Date.parse(t.notAfter) - Date.now()) / 86_400_000) : null
    const certOk = left !== null && left > 21
    if (!certOk) bad++
    console.log(`${certOk ? 'ok  ' : 'DOWN'}  certificate          ${t.notAfter ? `${left} days left (until ${t.notAfter}), serial ${t.serial.slice(0, 12)}…${left <= 21 ? '; renewal is failing: on the iMac, cat ~/Library/Logs/ola/cert.log' : ''}` : `none served (${t.error})`}`)
    const hOk = t.status === 200 || t.status === 421
    if (!hOk) bad++
    console.log(`${hOk ? 'ok  ' : 'DOWN'}  tls front            ${t.listen} /api/health ${t.status || 'no answer'}${t.status === 421 ? ' (the front desk\'s origin is not this name yet)' : ''}`)
  }
  const gwEnv = existsSync(ENV.gateway) ? readEnv(ENV.gateway) : {}
  const gwPort = Number(gwEnv.GATEWAY_PORT || 4180)
  const u = gwEnv.GATEWAY_USAGE_TOKEN ? await request(gwPort, '/v1/usage', { headers: { authorization: `Bearer ${gwEnv.GATEWAY_USAGE_TOKEN}` } }) : { status: -1 }
  if (u.status !== 200) bad++
  console.log(`${u.status === 200 ? 'ok  ' : 'DOWN'}  gateway              127.0.0.1:${gwPort} ${u.status === 200 ? `${u.json.data.length} caller(s), ${u.json.inflight} in flight, ${u.json.queued} waiting` : u.status === -1 ? '(no GATEWAY_USAGE_TOKEN to ask with)' : `/v1/usage ${u.status || 'no answer'}`}`)
  {
    // Device sign-in (frontdesk/devices.mjs, ops/pass.mjs): on when the pass key is in the front
    // desk's and the TLS front's env files, the same value in both, the front desk reads the front's
    // X-Ola-Pass (the PROXY protocol), and the gateway reads the people file the front desk keeps.
    // Off when neither file has the key. Nothing here prints a value.
    const tlsEnv = existsSync(TLS_ENV) ? readEnv(TLS_ENV) : {}
    const kFd = fdEnv.OLA_GATE_PASS_KEY || ''
    const kTls = tlsEnv.OLA_GATE_PASS_KEY || ''
    const peopleFd = fdEnv.OLA_FD_PEOPLE_TOKENS_FILE || path.join(OLA, 'gateway-people')
    const peopleGw = gwEnv.GATEWAY_PEOPLE_TOKENS_FILE || ''
    const why = []
    if (!kFd && !kTls) console.log('ok    device sign-in       off (no OLA_GATE_PASS_KEY in frontdesk.env or tls.env)')
    else {
      if (!/^[0-9a-f]{64}$/i.test(kFd)) why.push('OLA_GATE_PASS_KEY missing or not 64 hex characters in frontdesk.env')
      if (existsSync(TLS_ENV) && !/^[0-9a-f]{64}$/i.test(kTls)) why.push('OLA_GATE_PASS_KEY missing or not 64 hex characters in tls.env')
      if (kFd && kTls && kFd.toLowerCase() !== kTls.toLowerCase()) why.push('OLA_GATE_PASS_KEY differs between frontdesk.env and tls.env')
      if (existsSync(TLS_ENV) && fdEnv.OLA_FD_PROXY_PROTOCOL !== '1') why.push('the front desk is not on the PROXY protocol, so it would not read the TLS front’s X-Ola-Pass')
      if (path.resolve(peopleGw || '/nowhere') !== path.resolve(peopleFd)) why.push(`GATEWAY_PEOPLE_TOKENS_FILE in gateway.env is not ${peopleFd}`)
      let people = 0
      try {
        const st = statSync(peopleFd)
        if ((st.mode & 0o077) !== 0) why.push('the people file is not mode 600')
        people = (readFileSync(peopleFd, 'utf8').match(/(^|[=,])p-\d+:/g) ?? []).length
      } catch {}
      if (why.length) bad++
      console.log(`${why.length ? 'DOWN' : 'ok  '}  device sign-in       ${why.length ? why.join('; ') : `on; ${people} person(s) with a signed-in device (node frontdesk/admin.mjs devices)`}`)
    }
  }
  const ws = sh(process.execPath, [path.join(CODE, 'workspace/ws.mjs'), 'status', '--json'], { env: { ...process.env, OLA_HOME: OLA } })
  let rows = []
  try {
    rows = JSON.parse(ws.stdout)
  } catch {}
  const ids = new Set(existsSync(path.join(OLA, 'ws')) ? sh('/bin/ls', [path.join(OLA, 'ws')]).stdout.split('\n').filter(Boolean) : [])
  for (const r of rows.filter((r) => ids.has(r.id))) {
    const d = job(`cx.ola.door.${r.id}`)
    const k = job(`cx.ola.desk.${r.id}`)
    // A closed workspace (a rotation could not make it safe) or an unfinished rotation needs a person.
    const good = !r.closed && !r.rotation && (r.state !== 'running' || (r.door === 'open' && r.desk === 'open' && r.opencode === 200))
    if (!good) bad++
    console.log(`${good ? 'ok  ' : 'DOWN'}  workspace ${r.id.padEnd(10)} ${r.state}${r.closed ? ' CLOSED (node frontdesk/admin.mjs reopen ' + r.id + ')' : ''}${r.rotation ? ' rotation pending (node frontdesk/admin.mjs rotate ' + r.id + ')' : ''}${r.state === 'running' ? `, opencode ${r.opencode}, door ${r.door} (${d.loaded ? `job pid ${d.pid}` : 'no job'}), desk ${r.desk} (${k.loaded ? `job pid ${k.pid}` : 'no job'})` : ''}${r.network ? `, network ${r.network}` : ''}`)
  }
  console.log(`logs: ${LOGS}/`)
  process.exit(bad ? 1 : 0)
} else if (cmd === 'prove-restarts') {
  await proveRestarts()
} else if (cmd === 'clean') {
  clean({ dry: process.argv.includes('--dry') })
} else {
  console.error('usage: node ops/ola.mjs deploy [<commit> | origin/main] | check [<commit>] | ci [--dry] | install | status | prove-restarts | uninstall | container-up | clean [--dry]')
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
    const r = sh(process.execPath, [path.join(CODE, 'frontdesk/admin.mjs'), ...a], { env })
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
  const stop = sh(process.execPath, [path.join(CODE, 'workspace/ws.mjs'), 'stop', 'stage-a'], { env })
  const st = JSON.parse(sh(process.execPath, [path.join(CODE, 'workspace/ws.mjs'), 'status', 'stage-a', '--json'], { env }).stdout || '[]')[0]?.state
  if (stop.status !== 0 || st === 'running') (failed++, console.log(`FAIL  stopping stage-a again: exit ${stop.status}, state ${st}`))
  console.log(failed ? `${failed} check(s) failed` : `all ${labels.length} restarts passed; stage-a stopped again (${st})`)
  process.exit(failed ? 1 : 0)
}

// ---------------------------------------------------------------- deploy
//
function runLogged(cmd, args, { cwd, out, env = {} }) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { cwd, env: { ...process.env, PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const take = (d) => {
      out.write(d)
      tail = (tail + d).slice(-4000)
    }
    c.stdout.on('data', take)
    c.stderr.on('data', take)
    c.on('close', (code) => resolve({ code, tail }))
  })
}
/** "20 of 20" from a suite's output (node:test's pass/fail lines, or a check's last count). */
function counts(tail) {
  const pass = /^(?:ℹ|#) pass (\d+)$/m.exec(tail)
  const failN = /^(?:ℹ|#) fail (\d+)$/m.exec(tail)
  if (pass && failN) return `${pass[1]} of ${Number(pass[1]) + Number(failN[1])}`
  // XCTest's summary (swift test): "Executed 104 tests, with 1 test skipped and 0 failures"
  const xc = [...tail.matchAll(/Executed (\d+) tests?, with (\d+) tests? skipped and (\d+) failures?/g)].at(-1)
  if (xc) return `${Number(xc[1]) - Number(xc[2]) - Number(xc[3])} of ${Number(xc[1]) - Number(xc[2])}`
  const all = [...tail.matchAll(/(\d+) of (\d+)( checks)? passed/g)]
  return all.length ? `${all.at(-1)[1]} of ${all.at(-1)[2]}` : '?'
}

// A check (OLA-84, `ola.mjs check`, run by ops/ci.mjs) is this same function with check: true: the
// same unpack, dependencies, web build, image and suites, plus the Mac and iPhone apps' shared code
// (OlaKit's swift test, no VM), and nothing is served. It returns { ok, commit, suites, why } (ok
// null and yielded when it gave the turn to a deploy) and records it in checks.json / checks.log.
async function deploy(ref, { unsigned = false, check = false, all = false, base = null, noApps = false } = {}) {
  // The suites a release must pass before it serves: the same four the README counts, without the
  // live model run (deploys must not spend model calls or need a key).
  const SUITES = [
    ['turn', ['--test', 'ops/turn-test.mjs']], // the machine's one test turn (OLA-83), seconds
    ['gateway', ['gateway/test.mjs']],
    ['workspace', ['workspace/check.mjs', '--no-live']],
    ['web', ['web/check.mjs', '--no-live']],
    ['frontdesk', ['frontdesk/check.mjs', '--no-live']],
    ['backup', ['--test', 'ops/backup-test.mjs']], // encrypted backups (OLA-86), seconds, no VM
    ['ci', ['--test', 'ops/ci-test.mjs']], // the automatic checks' decisions (OLA-84), seconds, no VM
    ['signers', ['--test', 'ops/signers-test.mjs']], // who may deploy (OLA-85), seconds, no VM
    ['tls', ['--test', 'ops/tls-test.mjs']], // the TLS front (app.ola.cx's door), about a minute, no VM
    ['restart', ['--test', 'ops/restart-test.mjs']], // a deploy drops no request (OLA-94), seconds, no VM
    ['asks', ['--test', 'evals/asks/test.mjs']], // the asks' own checks, and Ola's instructions match abilities.json (OLA-232), seconds, no VM
    ['select', ['--test', 'ops/select-test.mjs']], // which suites an update runs (OLA-283), seconds, no VM
  ]
  const PKGS = ['.', 'frontdesk', 'web'] // folders with a package-lock.json
  if (!existsSync(path.join(STAGING, '.git'))) fail(`${STAGING} is not a clone: git clone --no-checkout https://github.com/bdecrem/hilma ${STAGING} (see the README, "Deploying staging")`)
  const git = (...a) => sh('/usr/bin/git', ['-C', STAGING, ...a])
  // One deploy at a time.
  const lockFile = path.join(STAGING, check ? 'check.lock' : 'deploy.lock')
  try {
    closeSync(openSync(lockFile, 'wx'))
  } catch {
    const pid = Number(readFileSync(lockFile, 'utf8')) || 0
    let alive = false
    try {
      alive = pid > 0 && process.kill(pid, 0)
    } catch {}
    if (alive) fail(`another ${check ? 'check' : 'deploy'} is running (pid ${pid})`)
  }
  writeFileSync(lockFile, String(process.pid))
  process.on('exit', () => rmSync(lockFile, { force: true }))

  // --tags: an approval is a signed tag ola-deploy/<commit12> (ops/signers.mjs, OLA-85).
  const f = git('fetch', '--quiet', '--tags', '--force', 'origin')
  if (f.status !== 0) fail(`git fetch: ${f.stderr.trim()}`)
  const r = git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
  if (r.status !== 0) fail(`${ref} is not a commit in ${STAGING}`)
  const commit = r.stdout.trim()
  const short = commit.slice(0, 12)
  // What a deploy trusts (second review, 2026-11-16): origin/main of a public repo that unattended
  // agents push to (the Discord bot and the venture runner, from this same machine), under one
  // author name. A commit is deployed only when it, or a tag ola-deploy/<commit12> on it, is signed
  // by a key listed in ~/.ola/allowed-signers (git's ssh allowed-signers format; the key lives off
  // this machine; ops/signers.mjs, OLA-85), or with --unsigned, which deploys.log records.
  const signers = path.join(OLA, 'allowed-signers')
  let signed = false
  let signedHow = ''
  if (check) {
    // A check serves nothing, so no signature is asked for; it runs the same code a deploy would.
  } else if (existsSync(signers)) {
    const v = deployable(git, commit, signers)
    signed = v.ok
    if (signed) console.log(`signature: ${(signedHow = v.how)}`)
    else if (!unsigned) fail(`${short} may not deploy: ${v.why}. On Bart's Mac: node apps/activist-ai/ops/signers.mjs approve ${short}; nothing was changed`)
  } else if (!unsigned) fail(`${signers} is missing, so no commit can be checked: add the deploying key there (see the README, "Deploying staging"), or deploy with --unsigned (recorded in deploys.log)`)
  const before = existsSync(DEPLOYED) ? JSON.parse(readFileSync(DEPLOYED, 'utf8')) : null
  // A check runs even for the deployed commit: ops/ci.mjs asks for one only when the deploy's
  // result is not enough (the commit changed the apps' code, whose swift test only a check runs).
  if (before?.commit === commit && !check) {
    console.log(`${short} is already deployed (${before.at})`)
    return
  }
  const releases = path.join(STAGING, check ? 'checks' : 'releases')
  const rel = path.join(releases, short)
  const code = path.join(rel, 'apps/activist-ai')
  mkdirSync(releases, { recursive: true })
  mkdirSync(LOGS, { recursive: true, mode: 0o700 })
  const logFile = path.join(LOGS, `${check ? 'check' : 'deploy'}-${short}.log`)
  const out = createWriteStream(logFile)
  const say = (m) => (console.log(m), out.write(`${m}\n`))
  const history = (line) => writeFileSync(path.join(STAGING, check ? 'checks.log' : 'deploys.log'), `${new Date().toISOString()} ${line}\n`, { flag: 'a' })
  const suites = {}
  const T0 = Date.now()
  let turnWait = 0 // how long this update stood waiting for the turn (another holder's time)
  const refuse = (m) => {
    if (check) {
      say(`CHECK FAILED: ${m}`)
      say(`${short} stays in ${rel} for a look. Log: ${logFile}`)
      history(`failed ${short} (${ref}): ${m}`)
      turnAbort.abort()
      out.end()
      return recordCheck({ commit, ok: false, suites, why: m, by: 'check', log: logFile })
    }
    say(`REFUSED: ${m}`)
    say(before ? `The running version (${before.commit.slice(0, 12)}) was left alone; ${short} stays in ${rel} for a look. Log: ${logFile}` : `Nothing was deployed. Log: ${logFile}`)
    history(`refused ${short} (${ref}): ${m}`)
    turnAbort.abort()
    out.end()
    process.exitCode = 1
  }
  say(check ? `checking ${short} (${ref}) in ${releases}; nothing is served` : `deploying ${short} (${ref}) to ${STAGING}; currently ${before ? before.commit.slice(0, 12) : 'nothing'}`)
  // The suites start sealed VMs, and the machine runs four (OLA-83): the deploy queues for the
  // machine's one turn now (ops/turn.mjs), ahead of every waiting builder, and its hold keeps any
  // new builder turn from starting while it unpacks and builds; the turn is awaited before the suites.
  const turnAbort = new AbortController()
  const turnP = acquireTurn({ label: `${check ? 'check' : 'deploy'} ${short}`, deploy: !check, signal: turnAbort.signal, on: (m) => say(`turn: ${m}`) })

  // The commit's apps/activist-ai, unpacked fresh (nothing left over from an earlier try).
  if (rel === realpathSafe(CURRENT)) return refuse(`${short} is the release being served`)
  // A check keeps only its own folder: an earlier failed check's is removed now.
  if (check && existsSync(releases)) for (const f of readdirSync(releases)) if (f !== short) rmSync(path.join(releases, f), { recursive: true, force: true })
  rmSync(rel, { recursive: true, force: true })
  mkdirSync(rel, { recursive: true })
  const a = sh('/bin/sh', ['-c', 'git -C "$1" archive "$2" apps/activist-ai | tar -x -C "$3"', 'sh', STAGING, commit, rel])
  if (a.status !== 0 || !existsSync(path.join(code, 'ops/ola.mjs'))) return refuse(`could not unpack ${short}: ${a.stderr.trim()}`)

  // Which suites run (OLA-283, ops/select.mjs): those the change since the last passed commit (the
  // deployed one, or --base) can affect; every suite when it cannot tell, or with --all.
  const baseRef = base ?? before?.commit ?? null
  const baseCommit = baseRef ? git('rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`).stdout.trim() || null : null
  // --no-apps: a check from an ssh session, where the apps' keychain test cannot reach the login keychain.
  const names = [...(check && !noApps ? ['apps'] : []), ...SUITES.map(([n]) => n)]
  const changed = all ? null : changedFiles(git, baseCommit, commit)
  const pick = all
    ? { run: names, skip: [], all: '--all was asked for', why: {} }
    : plan({ root: code, changed, suites: names, before: (f) => (baseCommit ? (git('show', `${baseCommit}:apps/activist-ai/${f}`).stdout ?? null) : null) })
  const since = baseCommit ? ` since ${baseCommit.slice(0, 12)}` : ''
  if (pick.all) say(`suites: all ${names.length} (${pick.all}${changed ? `; ${changed.length} file(s) changed${since}` : ''})`)
  else {
    say(`suites: ${pick.run.length} of ${names.length} for ${changed.length} changed file(s)${since}: ${pick.run.join(', ')}`)
    for (const s of pick.run) say(`  runs ${s}: ${pick.why[s]}`)
    for (const s of pick.skip) say(`  skipped ${s.name}: ${s.why}`)
  }
  const skipped = pick.skip.map((s) => s.name)

  // Dependencies: an APFS clone of the served release's node_modules where the lockfile is the
  // same, npm ci where it changed.
  const served = realpathSafe(SERVED)
  for (const dir of PKGS) {
    const lock = path.join(code, dir, 'package-lock.json')
    if (!existsSync(lock)) continue
    const prev = served && path.join(served, dir)
    if (prev && existsSync(path.join(prev, 'node_modules')) && existsSync(path.join(prev, 'package-lock.json')) && readFileSync(path.join(prev, 'package-lock.json'), 'utf8') === readFileSync(lock, 'utf8')) {
      const c = sh('/bin/cp', ['-c', '-R', path.join(prev, 'node_modules'), path.join(code, dir, 'node_modules')])
      if (c.status === 0) {
        say(`deps ${dir}: lockfile unchanged, node_modules cloned from the served release`)
        continue
      }
    }
    say(`deps ${dir}: npm ci`)
    const n = await runLogged('/opt/homebrew/bin/npm', ['ci', '--no-audit', '--no-fund'], { cwd: path.join(code, dir), out })
    if (n.code !== 0) return refuse(`npm ci in ${dir} failed`)
  }
  say('building web/dist')
  const b = await runLogged('/opt/homebrew/bin/npm', ['run', 'build'], { cwd: path.join(code, 'web'), out })
  if (b.code !== 0 || !existsSync(path.join(code, 'web/dist/index.html'))) return refuse('the web build failed')

  // The workspace image, if this machine does not have the release's yet (2.3.0-16; 2.3.0-7 downloaded
  // Claude Code, about 370 MB): its own step, before the suites, with its own retries, built under
  // a temporary tag (ws.mjs buildImage), so a slow download only makes this step longer and never
  // leaves a half-built image or fails a suite on time.
  // The Mac and iPhone apps' shared code (OlaKit), a check only: no VM, so before the turn.
  if (check && existsSync(path.join(code, 'apple/OlaKit/Package.swift')) && pick.run.includes('apps')) {
    const t0 = Date.now()
    say('suite apps: swift test (apple/OlaKit)')
    const s = await runLogged('/usr/bin/swift', ['test'], { cwd: path.join(code, 'apple/OlaKit'), out })
    suites.apps = counts(s.tail)
    say(`suite apps: ${s.code === 0 ? 'passed' : 'FAILED'}, ${suites.apps}, ${Math.round((Date.now() - t0) / 1000)} s`)
    if (s.code !== 0) return refuse(`suite apps failed (${suites.apps})`)
  }
  // A check whose commit a deploy already passed (often the deploy it would wait behind) ran every
  // suite but the apps', which this check just ran: it ends with both, before or after the turn.
  const covered = async (release) => {
    const { coveredByDeploy } = await import('./ci.mjs')
    const dl = path.join(STAGING, 'deploys.log')
    const cov = existsSync(dl) && coveredByDeploy(readFileSync(dl, 'utf8'), short, suites)
    if (!cov) return null
    const { at, ...all } = cov
    history(`passed ${short} (${ref}); ${Object.entries(all).map(([k, v]) => `${k} ${v}`).join(', ')} (suites but apps from the deploy at ${at})`)
    say(`check passed ${short}: the deploy at ${at} ran the suites; apps ${suites.apps ?? 'not in this commit'} from this check`)
    release()
    out.end()
    rmSync(rel, { recursive: true, force: true })
    return recordCheck({ commit, ok: true, suites: all, why: null, by: 'check+deploy', log: logFile })
  }
  // A check builds the image holding the turn, so it never builds beside a deploy.
  let turn = null
  if (check) {
    const early = await covered(() => turnAbort.abort())
    if (early) return early
    const tq = Date.now()
    turn = await turnP
    turnWait = Date.now() - tq
    if (!turn) return refuse('the turn for the suites was given up')
    process.on('exit', turn.release)
    say('turn: the check holds it')
    const late = await covered(turn.release)
    if (late) return late
  }
  say('workspace image: built if missing (node workspace/ws.mjs image --missing)')
  const img = await runLogged(NODE, ['workspace/ws.mjs', 'image', '--missing'], { cwd: code, out })
  if (img.code !== 0) {
    // The build's own last word (ws.mjs buildImage says why), so the refusal says why too.
    const why = img.tail.trim().split('\n').filter((l) => /^ws: |Error/.test(l)).pop()
    return refuse(`the workspace image could not be built${why ? `: ${why.replace(/^ws: /, '').slice(0, 300)}` : ''} (the log has the build output)`)
  }

  // The skills it installs (skills/version.mjs): the release's skills folder and the image's label
  // must be the same set, and that version is recorded (deployed.json, and release.json for the
  // front desk, which tells signed-in Macs, so the Mac app's bundled skills can be compared).
  const sv = sh(NODE, ['--input-type=module', '-e', `import { CONTAINER, IMAGE, skillsHash } from './workspace/ws.mjs'; import { spawnSync } from 'node:child_process'
    const out = spawnSync(CONTAINER, ['image', 'inspect', IMAGE], { encoding: 'utf8' }).stdout || ''
    console.log(JSON.stringify({ hash: skillsHash(), image: IMAGE, label: (/"ola\\.skills"\\s*:\\s*"([0-9a-f]+)"/.exec(out) || [])[1] ?? null }))`], { cwd: code })
  let skills = null
  try {
    skills = JSON.parse(sv.stdout.trim().split('\n').pop())
  } catch {}
  if (!skills?.hash) return refuse(`the release's skills version could not be read: ${sv.stderr.trim().slice(0, 200)}`)
  if (skills.label !== skills.hash) return refuse(`the workspace image ${skills.image} carries skills ${skills.label ?? '(no label)'}, this release's are ${skills.hash}: a skills change needs a new image tag (workspace/ws.mjs IMAGE)`)
  say(`skills: ${skills.hash} in ${skills.image}`)
  writeFileSync(path.join(code, 'release.json'), JSON.stringify({ commit, skills: { hash: skills.hash, commit } }, null, 2) + '\n')

  // The suites, from the release itself, holding the machine's turn (the suites inherit it).
  const tw = Date.now()
  if (!check) {
    const tq = Date.now()
    turn = await turnP
    turnWait = Date.now() - tq
    if (!turn) return refuse('the turn for the suites was given up')
    process.on('exit', turn.release)
    say(`turn: the deploy holds it${turn.waitedMs > 2000 ? ` (waited ${Math.round((Date.now() - tw) / 1000)} s after building)` : ''}`)
  }
  // Side by side in lanes (ops/select.mjs LANES): the VM suites one after the other, every other
  // suite beside them. Each suite's output goes to the log in one piece when it ends. The front desk
  // (and anything else that starts frontdesk/server.mjs) serves a copy of web/dist taken now, since
  // the web suite builds web/dist again meanwhile. On a failure no new suite starts, the running
  // ones finish, and the update is refused; a check gives the turn back the same way when a deploy
  // waits.
  const fdDist = path.join(rel, 'fd-dist')
  rmSync(fdDist, { recursive: true, force: true })
  if (sh('/bin/cp', ['-c', '-R', path.join(code, 'web/dist'), fdDist]).status !== 0) return refuse('could not copy web/dist for the suites')
  const plannedLanes = lanes(pick.run.filter((n) => n !== 'apps'))
  say(`lanes: ${plannedLanes.map((l) => l.join(' → ')).join(' | ')}`)
  const failures = []
  let yielded = false
  const ts = Date.now()
  const runOne = async (name) => {
    const args = SUITES.find(([n]) => n === name)[1]
    // A suite this commit does not have yet (a check of an older commit, or a deploy back to one).
    const file = args.find((x) => x.endsWith('.mjs'))
    if (file && !existsSync(path.join(code, file))) return say(`suite ${name}: not in this commit (${file}), skipped`)
    const t0 = Date.now()
    say(`suite ${name}: node ${args.join(' ')}`)
    // Each line stamped with the seconds since the suite started, so the log shows where it waits.
    let text = ''
    let atStart = true
    const stamp = (d) => {
      const at = `[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)} s] `
      for (const piece of String(d).split(/(?<=\n)/)) (text += (atStart ? at : '') + piece), (atStart = piece.endsWith('\n'))
    }
    const s = await runLogged(NODE, args, { cwd: code, out: { write: stamp }, env: { OLA_TURN_HELD: String(process.pid), ...(name === 'web' ? {} : { OLA_FD_DIST: fdDist }) } })
    suites[name] = counts(s.tail)
    out.write(`---- suite ${name} output ----\n${text}${text.endsWith('\n') ? '' : '\n'}---- end of ${name} ----\n`)
    say(`suite ${name}: ${s.code === 0 ? 'passed' : 'FAILED'}, ${suites[name]}, ${Math.round((Date.now() - t0) / 1000)} s`)
    if (s.code !== 0) failures.push(`suite ${name} failed (${suites[name]})`)
  }
  await Promise.all(
    plannedLanes.map(async (lane) => {
      for (const name of lane) {
        if (failures.length || yielded) return
        // A deploy waiting for the turn goes first: the check gives it back and is tried again later.
        if (check && deployWaiting()) {
          if (!yielded) say(`a deploy is waiting: the check gives the turn back before suite ${name} (the running suites finish first) and will be tried again`)
          yielded = true
          return
        }
        await runOne(name)
      }
    }),
  )
  const took = Math.round((Date.now() - ts) / 1000)
  if (failures.length) return refuse(`${failures.join('; ')}${skipped.length ? `; skipped ${skipped.join(', ')}` : ''}`)
  if (yielded) {
    turn.release()
    out.end()
    rmSync(rel, { recursive: true, force: true })
    return { ok: null, yielded: true, commit, suites }
  }
  // For deploys.log and checks.log: which ran, which were skipped, how long the suites took.
  // The whole update so far, without the wait for the turn (another holder's time, not this one's).
  const own = Math.round((Date.now() - T0 - turnWait) / 1000)
  const picked = `${pick.all ? `all suites (${pick.all})` : `skipped ${skipped.length ? skipped.join(', ') : 'none'} (nothing they use changed${since})`}; suites ${took} s side by side, ${own} s in all without the wait for the turn`
  say(`suites: ${Object.keys(suites).length} ran in ${took} s; ${skipped.length ? `skipped ${skipped.join(', ')}` : 'none skipped'}; ${own} s since the update started, not counting ${Math.round(turnWait / 1000)} s waiting for the turn`)
  if (check) {
    history(`passed ${short} (${ref}); ${Object.entries(suites).map(([k, v]) => `${k} ${v}`).join(', ')}; ${picked}`)
    say(`check passed ${short}: ${Object.entries(suites).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    turn.release()
    out.end()
    rmSync(rel, { recursive: true, force: true })
    return recordCheck({ commit, ok: true, suites, why: null, by: 'check', log: logFile })
  }

  // Serve it: switch `current` by rename (atomic), restart the jobs, wait for both answers.
  const tmp = `${CURRENT}.new`
  rmSync(tmp, { force: true })
  symlinkSync(`releases/${short}`, tmp)
  renameSync(tmp, CURRENT)
  const record = { commit, ref, at: new Date().toISOString(), release: `releases/${short}`, suites, skipped: Object.fromEntries(pick.skip.map((x) => [x.name, x.why])), base: baseCommit, skills: { hash: skills.hash, image: skills.image, commit }, previous: before?.commit ?? null }
  writeFileSync(DEPLOYED, JSON.stringify(record, null, 2) + '\n')
  if (existsSync(ENV.frontdesk) && existsSync(ENV.gateway)) {
    install({ restart: true })
    const healthy = await answering()
    if (!healthy && before) {
      say('the new release does not answer: switching back')
      const back = `${CURRENT}.new`
      symlinkSync(`releases/${before.commit.slice(0, 12)}`, back)
      renameSync(back, CURRENT)
      writeFileSync(DEPLOYED, JSON.stringify(before, null, 2) + '\n')
      install({ restart: true })
      return refuse(`after the restart the front desk or the gateway did not answer; ${before.commit.slice(0, 12)} is served again (${(await answering()) ? 'answering' : 'NOT answering either'})`)
    }
    if (!healthy) return refuse('after the restart the front desk or the gateway did not answer')
  } else say('no env files in ~/.ola: nothing to restart (node ops/ola.mjs install once they exist)')
  history(`deployed ${short} (${ref})${signed ? ` (${signedHow})` : ' UNSIGNED'}; ${Object.entries(suites).map(([k, v]) => `${k} ${v}`).join(', ')}; ${picked}`)
  say(`deployed ${short}: ${Object.entries(suites).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  // The disk (OLA-135): old images, releases beyond the current and the previous, an oversized
  // builder, builders' leftovers. Still holding the turn, so no suite starts a VM meanwhile. A
  // failure here is reported and never undoes the deploy.
  try {
    clean({ say })
  } catch (e) {
    say(`clean failed (the deploy stands): ${e.message}`)
  }
  turn.release()
  // The asks (OLA-231): people's real requests that once failed, sent again as chat to what is now
  // live, in both runtimes. In the background, after the turn is given back (it takes its own); its
  // result goes to ~/ola-asks and ~/ola-staging/asks.json. OLA_ASKS_AFTER_DEPLOY=0 leaves it out.
  const asks = path.join(code, 'evals/asks/run.mjs')
  if (process.env.OLA_ASKS_AFTER_DEPLOY !== '0' && existsSync(asks)) {
    const dir = path.join(homedir(), 'ola-asks')
    mkdirSync(dir, { recursive: true })
    const fd = openSync(path.join(dir, `run-${short}.log`), 'a')
    spawn(NODE, [asks, '--after-deploy'], { cwd: code, detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, OLA_TURN_HELD: '' } }).unref()
    say(`asks: started in the background, log ~/ola-asks/run-${short}.log`)
  }
  out.end()
}
/** A deploy is waiting for (or holds) the machine's turn: ops/turn.mjs's hold file, with a live pid. */
function deployWaiting() {
  const hold = turnPaths().hold
  if (!existsSync(hold)) return false
  const pid = Number(readFileSync(hold, 'utf8').trim()) || 0
  try {
    return pid > 0 && pid !== process.pid && process.kill(pid, 0)
  } catch {
    return false
  }
}
/** One check's result, newest first in checks.json (the last 50), for ops/ci.mjs and the board. */
function recordCheck(r) {
  const file = path.join(STAGING, CHECKS_JSON)
  let all = []
  try {
    all = JSON.parse(readFileSync(file, 'utf8')).runs ?? []
  } catch {}
  const run = { commit: r.commit, ok: r.ok, suites: r.suites, why: r.why, by: r.by, at: r.at ?? new Date().toISOString(), ...(r.log ? { log: r.log } : {}) }
  all = [run, ...all.filter((x) => x.commit !== r.commit)].slice(0, 50)
  writeFileSync(file, JSON.stringify({ runs: all }, null, 2) + '\n')
  return run
}
/** A process's working folder (launchd starts each job in SERVED, so: the release it runs). */
function cwdOf(pid) {
  const l = (sh('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']).stdout || '').split('\n').find((x) => x.startsWith('n'))
  return l ? l.slice(1) : null
}
function realpathSafe(p) {
  try {
    return realpathSync(p)
  } catch {
    return null
  }
}
/** The front desk's /api/health and the gateway's port, within 30 s. */
async function answering() {
  const fdEnv = readEnv(ENV.frontdesk)
  const origin = new URL(fdEnv.OLA_FD_ORIGIN || 'http://localhost:4700')
  const fdPort = Number(fdEnv.OLA_FD_PORT || origin.port || 4700)
  const gwPort = Number(readEnv(ENV.gateway).GATEWAY_PORT || 4180)
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    const h = await request(fdPort, '/api/health', { headers: { host: origin.host } })
    const g = await request(gwPort, '/v1/models')
    if (h.status === 200 && g.status > 0) return true
  }
  return false
}
