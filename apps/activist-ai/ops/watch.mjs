#!/usr/bin/env node
// The alarm: a short check of the machine every 2 minutes (launchd cx.ola.watch, StartInterval 120,
// installed by ops/ola.mjs install), and a text to the owner when something is wrong.
//
//   node ops/watch.mjs                 one run: check, update ~/.ola/watch-state.json, text if needed
//   node ops/watch.mjs --once          the same (the name tests and people use)
//   node ops/watch.mjs --dry           check and print what it would send; sends nothing, saves nothing
//   node ops/watch.mjs --only disk,web check only these (ids below; "none" for no real check)
//   node ops/watch.mjs --force <id>    pretend <id> is in alarm this run (a test of the path to the
//                                      phone); --force test sends exactly "Ola: test of the new alarm.
//                                      Nothing is wrong."
//   node ops/watch.mjs mute <hours>    send nothing for that long (alarms are still tracked and go
//                                      out when the mute ends if they still hold); unmute ends it
//   node ops/watch.mjs show            the state file, readable
//
// What it checks (ids; item numbers as in the README's "When something breaks"):
//   1 disk      free space on the data volume (warn under 20 GB, alarm under 8 GB); the container
//               store and the ~/ola-* clones are measured hourly and reported, never alarmed
//   2 memory    the system's memory pressure is critical, or swap is 90% used, two runs in a row
//   3 web       the front desk's /api/health, the gateway's port, the TLS front (/api/health from
//               loopback) and the tunnel job (only where tunnel.env exists), each two runs in a row
//   4 public    https://app.ola.cx resolved through public resolvers and reached at that address
//               (not this machine's shortcut): 401 with a Basic challenge (no passcode is sent) and a
//               certificate that verifies and has more than 14 days left, two runs in a row
//   5 almanac   http://127.0.0.1:3920/almanac/ answers 200, two runs in a row (one GET, read-only)
//   6 vms       how many sealed VMs run; when every one stops at once (2 or more before, 0 now)
//               while no deploy runs: what ran before and after, the container system's status and
//               log tail, memory pressure, saved to ~/Library/Logs/ola/watch-vm-drop-<time>.txt and
//               a warning
//   7 nightly   the certificate's days left as served (warn at 21 or fewer: renewal is failing) and
//               each status file that exists (cert.json, backup.json ... {at, ok}); read, never run
//
// The board: every PUSH_EVERY_MIN minutes (10; 0 turns it off) a run also posts a compact status to
// <base>/api/venture/status for app.kochitolabs.com (Bart, 2026-11-17: "make sure it is updated at
// least every few hours"): the deployed version, when and its suites' counts (~/ola-staging/
// deployed.json), the alarm's state in the words of its texts, free disk, memory, how many projects
// run, and which parts answer. No file names, no project names, no keys; the board marks it stale
// after 30 minutes. A failed push is retried at the next run and noted in `show`.
//
// Noise: an alarm is texted once when it starts, again at most every 2 hours while it lasts, and a
// short "back to normal" once when it clears. Warnings are not texted one by one: they go into one
// daily note (at 9 am Pacific, only on a day there were any). Between 11 pm and 7 am Pacific nothing
// is sent unless it is about items 1, 3, 4 or 5; the rest waits for 7 am. One text per run at most.
//
// How it texts: an HTTPS POST to <base>/api/venture/imsg with the Venture key, both read at each run
// from the checkout the morning text runs from (KEY_FROM, default ~/hilma-venture/.env.local:
// VENTURE_KEY, VENTURE_BASE or https://ola.cx). The key is never copied, printed or saved.
//
// Settings: DEFAULTS below; ~/.ola/watch.env (KEY=VALUE, mode 600) overrides them; OLA_WATCH_<KEY>
// in the environment overrides both (tests). OLA_HOME moves ~/.ola, OLA_WATCH_LOGS the log folder,
// OLA_WATCH_NOW fakes the clock (tests).
import { execFile } from 'node:child_process'
import dns from 'node:dns'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'

const HOME = homedir()
const OLA = process.env.OLA_HOME || path.join(HOME, '.ola')
const LOGS = process.env.OLA_WATCH_LOGS || path.join(HOME, 'Library/Logs/ola')
const STATE = process.env.OLA_WATCH_STATE || path.join(OLA, 'watch-state.json')
const ENV_FILE = path.join(OLA, 'watch.env')

export const DEFAULTS = {
  // 1 disk
  DISK_VOLUME: '/System/Volumes/Data',
  DISK_WARN_GB: 20,
  DISK_ALARM_GB: 8,
  // Bart, Nov 17: "I get constant texts about the mini drive being full and then not. Stop sending
  // those to me." Disk is measured and shown on the status page and the board, never texted; the
  // lead keeps it clear (OLA-135).
  DISK_TEXTS: false,
  SIZES_EVERY_MIN: 60,
  CONTAINER_STORE: path.join(HOME, 'Library/Application Support/com.apple.container'),
  // 2 memory
  SWAP_ALARM_PCT: 90,
  // 3 the web app's parts (ports come from ~/.ola/frontdesk.env, gateway.env, tls.env when set)
  FD_PORT: 4700,
  GW_PORT: 4180,
  TLS_LISTEN: '127.0.0.1:4743',
  // 4 the public address
  PUBLIC_HOST: 'app.ola.cx',
  PUBLIC_PORT: 443,
  PUBLIC_RESOLVERS: '1.1.1.1,8.8.8.8,9.9.9.9',
  PUBLIC_IP: '', // tests only: skip DNS
  PUBLIC_CA: '', // tests only: a CA file to trust instead of the system's
  CERT_ALARM_DAYS: 14,
  // 5 the Almanac
  ALMANAC_URL: 'http://127.0.0.1:3920/almanac/',
  // 6 sealed VMs
  VM_DROP_MIN: 2,
  STAGING: process.env.OLA_STAGING || path.join(HOME, 'ola-staging'),
  SUITE_LOCK: path.join(HOME, 'ola-suite.lock'),
  // 7 nightly
  CERT_WARN_DAYS: 21,
  STATUS_FILES: 'cert.json,backup.json,snapshot.json', // in the log folder, {at, ok, error?}
  STATUS_MAX_AGE_H: 36,
  // noise
  TWO_IN_A_ROW: 2,
  REPEAT_HOURS: 2,
  QUIET_FROM: 23,
  QUIET_TO: 7,
  DIGEST_HOUR: 9,
  TZ: 'America/Los_Angeles',
  OFF: '', // ids not to check at all, e.g. OFF=public,almanac
  // the board
  PUSH_EVERY_MIN: 10,
  // the text
  KEY_FROM: path.join(HOME, 'hilma-venture/.env.local'),
  SEND_BASE: '', // default: VENTURE_BASE from KEY_FROM, else https://ola.cx
  // the programs it reads (tests point these at fakes)
  DF_BIN: '/bin/df',
  DU_BIN: '/usr/bin/du',
  SYSCTL_BIN: '/usr/sbin/sysctl',
  LAUNCHCTL_BIN: '/bin/launchctl',
  CONTAINER_BIN: process.env.OLA_CONTAINER_BIN || '/usr/local/bin/container',
}
/** Items that may wake someone: disk, the web app, the public address, the Almanac. */
const NIGHT_ITEMS = new Set([1, 3, 4, 5])
const IDS = ['disk', 'memory', 'web', 'public', 'almanac', 'vms', 'nightly']

// ---------------------------------------------------------------- small helpers
function readEnv(file) {
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    const at = t.indexOf('=')
    if (at > 0 && !t.startsWith('#')) out[t.slice(0, at).trim()] = t.slice(at + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}
const envIf = (f) => (existsSync(f) ? readEnv(f) : {})

export function settings() {
  const S = { ...DEFAULTS }
  if (existsSync(ENV_FILE)) {
    const st = statSync(ENV_FILE)
    if (st.uid !== process.getuid() || (st.mode & 0o077) !== 0) throw new Error(`${ENV_FILE} must be this account's with mode 600`)
    for (const [k, v] of Object.entries(readEnv(ENV_FILE))) if (k in DEFAULTS) S[k] = v
  }
  for (const k of Object.keys(DEFAULTS)) if (process.env[`OLA_WATCH_${k}`] !== undefined) S[k] = process.env[`OLA_WATCH_${k}`]
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof v === 'number') S[k] = Number(S[k])
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof v === 'boolean') S[k] = S[k] === true || S[k] === '1' || S[k] === 'true'
  // The services' own ports, from their settings (only the port numbers are taken).
  const fd = envIf(path.join(OLA, 'frontdesk.env'))
  const origin = new URL(fd.OLA_FD_ORIGIN || 'http://localhost:4700')
  if (!process.env.OLA_WATCH_FD_PORT) S.FD_PORT = Number(fd.OLA_FD_PORT || origin.port || S.FD_PORT)
  S.FD_HOST = origin.host
  S.FD_PROXY = fd.OLA_FD_PROXY_PROTOCOL === '1'
  const gw = envIf(path.join(OLA, 'gateway.env'))
  if (!process.env.OLA_WATCH_GW_PORT && gw.GATEWAY_PORT) S.GW_PORT = Number(gw.GATEWAY_PORT)
  const tlsEnv = path.join(OLA, 'tls.env')
  S.TLS_ON = existsSync(tlsEnv)
  const te = envIf(tlsEnv)
  if (!process.env.OLA_WATCH_TLS_LISTEN && te.OLA_TLS_LISTEN) S.TLS_LISTEN = te.OLA_TLS_LISTEN
  S.TLS_PROXY_IN = (te.OLA_TLS_PROXY_IN ?? '1') === '1'
  S.TLS_NAME = te.OLA_TLS_SERVERNAME || S.PUBLIC_HOST
  S.TUNNEL_ON = existsSync(path.join(OLA, 'tunnel.env'))
  return S
}

function run(bin, args, timeout = 15_000) {
  return new Promise((resolve) => {
    execFile(bin, args, { encoding: 'utf8', timeout, maxBuffer: 4 << 20 }, (err, stdout, stderr) => resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, out: stdout || '', err: stderr || '' }))
  })
}

/** One HTTP GET on loopback (a PROXY v1 line first when the front desk wants one). */
function httpGet({ port, host = '127.0.0.1', p = '/', headers = {}, proxy = false, timeout = 10_000 }) {
  return new Promise((resolve) => {
    const createConnection = proxy
      ? (_o, cb) => {
          const s = net.connect(port, host, () => (s.write(`PROXY TCP4 127.0.0.1 127.0.0.1 1 ${port}\r\n`), cb(null, s)))
          s.once('error', cb)
        }
      : undefined
    const r = http.request({ host, port, path: p, headers, timeout, createConnection }, (res) => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    r.on('error', (e) => resolve({ status: 0, error: e.code || 'error' }))
    r.on('timeout', () => (r.destroy(), resolve({ status: 0, error: 'timeout' })))
    r.end()
  })
}

/**
 * A TLS connection, then one GET. Returns the status, the Basic challenge, and the certificate's
 * end. `verify` checks the chain and the name (the public check); the loopback check does not.
 */
function tlsGet({ host, port, servername, p, proxy = false, verify = false, ca, timeout = 10_000 }) {
  return new Promise((resolve) => {
    let settled = false
    const done = (r) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      raw?.destroy()
      resolve(r)
    }
    const timer = setTimeout(() => done({ status: 0, error: 'timeout' }), timeout)
    let raw
    const start = (socket) => {
      const s = tls.connect({ socket, host: socket ? undefined : host, port: socket ? undefined : port, servername, rejectUnauthorized: verify, ca, ALPNProtocols: ['http/1.1'] }, () => {
        const c = s.getPeerX509Certificate()
        const notAfter = c ? new Date(c.validTo).toISOString() : null
        s.write(`GET ${p} HTTP/1.1\r\nHost: ${servername}\r\nUser-Agent: ola-watch\r\nConnection: close\r\n\r\n`)
        let t = ''
        s.on('data', (d) => (t += d.toString('latin1')).length > 65536 && s.destroy())
        const fin = () => done({ status: Number(/^HTTP\/1\.[01] (\d{3})/.exec(t)?.[1]) || 0, basic: /^www-authenticate:\s*basic/im.test(t), notAfter })
        s.on('end', fin)
        s.on('close', fin)
      })
      s.on('error', (e) => done({ status: 0, error: e.code || 'tls error' }))
      if (!socket) raw = s
    }
    if (proxy) {
      raw = net.connect(port, host, () => (raw.write(`PROXY TCP4 127.0.0.1 127.0.0.1 1 ${port}\r\n`), start(raw)))
      raw.on('error', (e) => done({ status: 0, error: e.code || 'no answer' }))
    } else start(null)
  })
}

const daysLeft = (iso, now) => (iso ? Math.floor((Date.parse(iso) - now) / 86_400_000) : null)
const gb = (kb) => Math.round(kb / 1024 / 1024)

/** Removes anything that looks like a secret from text kept as evidence. */
export function redact(text) {
  return String(text)
    .replace(/([A-Z0-9_]*(KEY|TOKEN|PASSWORD|SECRET|PASSCODE)[A-Z0-9_]*\s*[=:]\s*)\S+/gi, '$1[removed]')
    .replace(/\b(Bearer|Basic)\s+\S+/gi, '$1 [removed]')
    .replace(/[A-Za-z0-9+/_-]{24,}={0,2}/g, '[removed]')
}

// ---------------------------------------------------------------- the probes
const probes = {
  async disk(S) {
    const r = await run(S.DF_BIN, ['-k', S.DISK_VOLUME])
    const last = r.out.trim().split('\n').pop()?.trim().split(/\s+/) ?? []
    const freeKb = Number(last[3])
    return r.ok && Number.isFinite(freeKb) ? { freeGB: gb(freeKb), freeKb } : { error: (r.err || 'df gave nothing').trim().slice(0, 120) }
  },
  async sizes(S) {
    const dirs = [S.CONTAINER_STORE]
    try {
      for (const d of readdirSync(HOME)) if (/^ola-/.test(d) && !d.endsWith(".lock") && statSync(path.join(HOME, d)).isDirectory()) dirs.push(path.join(HOME, d))
    } catch {}
    const there = dirs.filter(existsSync)
    if (!there.length) return {}
    const r = await run(S.DU_BIN, ['-sk', ...there], 90_000)
    const out = {}
    for (const line of r.out.split('\n')) {
      const m = /^(\d+)\s+(.+)$/.exec(line.trim())
      if (m) out[m[2] === S.CONTAINER_STORE ? 'container store' : path.basename(m[2])] = Math.round(Number(m[1]) / 1024 / 1024 * 10) / 10
    }
    return out
  },
  async memory(S) {
    const [lv, sw] = await Promise.all([run(S.SYSCTL_BIN, ['-n', 'kern.memorystatus_vm_pressure_level']), run(S.SYSCTL_BIN, ['-n', 'vm.swapusage'])])
    const level = Number(lv.out.trim()) || null // 1 normal, 2 warning, 4 critical
    const num = (k) => {
      const m = new RegExp(`${k} = ([\\d.]+)([MG])`).exec(sw.out)
      return m ? Number(m[1]) * (m[2] === 'G' ? 1024 : 1) : null
    }
    const total = num('total')
    const used = num('used')
    return { level, pressure: { 1: 'normal', 2: 'warning', 4: 'critical' }[level] ?? `level ${level}`, swapPct: total ? Math.round((used / total) * 100) : 0, swapUsedMB: used, swapTotalMB: total }
  },
  async web(S) {
    const tasks = {
      fd: httpGet({ port: S.FD_PORT, p: '/api/health', headers: { host: S.FD_HOST }, proxy: S.FD_PROXY }).then((r) => ({ ok: r.status === 200, got: r.status || r.error })),
      gw: httpGet({ port: S.GW_PORT, p: '/v1/models' }).then((r) => ({ ok: r.status > 0, got: r.status || r.error })),
    }
    if (S.TLS_ON) {
      const [host, port] = S.TLS_LISTEN.split(/:(?=\d+$)/)
      tasks.tls = tlsGet({ host, port: Number(port), servername: S.TLS_NAME, p: '/api/health', proxy: S.TLS_PROXY_IN }).then((r) => ({ ok: r.status === 200 || r.status === 421, got: r.status || r.error, notAfter: r.notAfter }))
    }
    if (S.TUNNEL_ON) {
      tasks.tunnel = run(S.LAUNCHCTL_BIN, ['print', `gui/${process.getuid()}/cx.ola.tunnel`]).then((r) => {
        const state = /^\s*state = (\S+)/m.exec(r.out)?.[1] ?? (r.ok ? 'unknown' : 'not loaded')
        return { ok: r.ok && state === 'running', got: state }
      })
    }
    const out = {}
    for (const [k, p] of Object.entries(tasks)) out[k] = await p
    return out
  },
  async public(S) {
    let ip = S.PUBLIC_IP
    if (!ip) {
      try {
        const r = new dns.promises.Resolver({ timeout: 4000, tries: 2 })
        r.setServers(S.PUBLIC_RESOLVERS.split(',').map((s) => s.trim()).filter(Boolean))
        ip = (await r.resolve4(S.PUBLIC_HOST))[0]
      } catch (e) {
        return { ok: false, error: `no public address for ${S.PUBLIC_HOST} (${e.code || e.message})` }
      }
    }
    const r = await tlsGet({ host: ip, port: S.PUBLIC_PORT, servername: S.PUBLIC_HOST, p: '/', verify: true, ca: S.PUBLIC_CA ? [readFileSync(S.PUBLIC_CA)] : undefined, timeout: 15_000 })
    return { ip, status: r.status, basic: r.basic, notAfter: r.notAfter, error: r.error }
  },
  async almanac(S) {
    const u = new URL(S.ALMANAC_URL)
    const r = await httpGet({ host: u.hostname, port: Number(u.port || 80), p: u.pathname + u.search, headers: { host: u.host } })
    return { status: r.status, error: r.error }
  },
  async vms(S) {
    const r = await run(S.CONTAINER_BIN, ['list', '-q'])
    if (!r.ok) return { running: null, error: (r.err || `exit ${r.code}`).trim().slice(0, 200) }
    return { running: r.out.split('\n').map((s) => s.trim()).filter((s) => /^ola-/.test(s)).sort() }
  },
  nightly(S, now) {
    const files = []
    for (const name of S.STATUS_FILES.split(',').map((s) => s.trim()).filter(Boolean)) {
      const f = path.isAbsolute(name) ? name : path.join(LOGS, name)
      if (!existsSync(f)) continue
      try {
        const j = JSON.parse(readFileSync(f, 'utf8'))
        const ageH = j.at ? (now - Date.parse(j.at)) / 3_600_000 : null
        files.push({ name: path.basename(f, '.json'), ok: j.ok !== false, ageH: ageH === null ? null : Math.round(ageH), error: j.ok === false ? redact(String(j.error ?? '')).slice(0, 120) : undefined })
      } catch {
        files.push({ name: path.basename(f, '.json'), ok: false, error: 'unreadable' })
      }
    }
    return { files }
  },
}

// ---------------------------------------------------------------- one run
/**
 * Turns the probes' readings into conditions: { id, item, level: 'ok' | 'warn' | 'alarm',
 * two (needs two runs in a row), say (the alarm sentence), clear (the back-to-normal sentence),
 * note (the digest's words for a warning), detail (the log) }.
 */
function judge(S, r, now, prev) {
  const c = []
  if (r.disk) {
    const d = r.disk
    if (d.error) c.push({ id: 'disk', item: 1, level: 'warn', note: 'the disk could not be measured', detail: `disk: ${d.error}` })
    else
      c.push({
        id: 'disk',
        item: 1,
        level: d.freeGB < S.DISK_ALARM_GB ? 'alarm' : d.freeGB < S.DISK_WARN_GB ? 'warn' : 'ok',
        say: `the mini's disk is almost full (${d.freeGB} GB left).`,
        clear: `Disk has ${d.freeGB} GB free.`,
        note: `the disk was under ${S.DISK_WARN_GB} GB free`,
        low: d.freeGB,
        unit: 'GB',
        detail: `disk ${d.freeGB} GB free`,
      })
  }
  if (r.memory) {
    const m = r.memory
    const bad = m.level === 4 || m.swapPct >= S.SWAP_ALARM_PCT
    c.push({ id: 'memory', item: 2, level: bad ? 'alarm' : m.level === 2 ? 'warn' : 'ok', two: true, say: 'the mini is running out of memory and will be slow.', clear: 'Memory is fine again.', note: 'memory ran low for a while', detail: `memory ${m.pressure}, swap ${m.swapPct}%` })
  }
  if (r.web) {
    const words = {
      fd: ['the web app is not answering.', 'The web app answers again.'],
      gw: ['the model connection is not answering, so projects cannot think.', 'The model connection answers again.'],
      tls: ["the site's address cannot reach the web app.", "The site's address reaches the web app again."],
      tunnel: ["the site's address is cut off from the internet.", "The site's address is back on the internet."],
    }
    for (const [k, v] of Object.entries(r.web)) c.push({ id: k, item: 3, level: v.ok ? 'ok' : 'alarm', two: true, say: words[k][0], clear: words[k][1], detail: `${k} ${v.got}` })
    if (r.web.tls?.notAfter) {
      const left = daysLeft(r.web.tls.notAfter, now)
      c.push({ id: 'renewal', item: 7, level: left <= S.CERT_WARN_DAYS ? 'warn' : 'ok', note: `the site's certificate has not renewed (${left} days left)`, detail: `certificate ${left} days left` })
    }
  }
  if (r.public) {
    const p = r.public
    const left = daysLeft(p.notAfter, now)
    // The site answers: 200 since the site password came off (2026-11-17), or 401 with a Basic
    // challenge if it is ever put back.
    const answers = p.status === 200 || (p.status === 401 && p.basic)
    c.push({ id: 'public', item: 4, level: answers ? 'ok' : 'alarm', two: true, say: `the site (${S.PUBLIC_HOST}) does not answer from the internet.`, clear: 'The site answers from the internet again.', detail: `public ${p.ip ?? '-'} ${p.status || p.error}${p.basic ? ' basic' : ''}` })
    if (answers) c.push({ id: 'cert', item: 4, level: left !== null && left > S.CERT_ALARM_DAYS ? 'ok' : 'alarm', two: true, say: `the site's certificate runs out in ${left} days and has not renewed.`, clear: "The site's certificate is renewed.", detail: `public certificate ${left} days left` })
  }
  if (r.almanac) {
    const a = r.almanac
    c.push({ id: 'almanac', item: 5, level: a.status === 200 ? 'ok' : 'alarm', two: true, say: "Frances's service is not answering.", clear: "Frances's service answers again.", detail: `almanac ${a.status || a.error}` })
  }
  if (r.vms) {
    const v = r.vms
    const before = prev.vms?.running ?? null
    const deploying = existsSync(path.join(S.STAGING, 'deploy.lock'))
    const suite = existsSync(S.SUITE_LOCK)
    const ours = new Set(existsSync(path.join(OLA, 'ws')) ? readdirSync(path.join(OLA, 'ws')).map((id) => `ola-${id}`) : [])
    const now0 = v.running === null ? [] : v.running
    // Every VM stopped at once: explained by a deploy now or at the last run, or by a check suite
    // when none of them belonged to staging (suites stop only their own).
    let drop = null
    if (before && before.length >= S.VM_DROP_MIN && now0.length === 0) {
      const explained = deploying || prev.vms?.deploying || ((suite || prev.vms?.suite) && !before.some((id) => ours.has(id)))
      drop = { before, explained, deploying, suite }
    }
    c.push({ id: 'vms', item: 6, level: v.running === null ? 'warn' : 'ok', note: 'the system that runs projects did not answer', detail: v.running === null ? `vms: ${v.error}` : `${now0.length} VM(s) running` })
    if (drop && !drop.explained) c.push({ id: 'vm-drop', item: 6, level: 'warn', event: true, note: `every running project stopped at once (${drop.before.length} of them, at ${clock(S, now)})`, detail: `vm drop: ${drop.before.join(' ')} -> none`, drop })
    else if (drop) c.push({ id: 'vm-drop', item: 6, level: 'ok', detail: `vm drop explained (${drop.deploying ? 'deploy' : 'check suite'})` })
    r.vms.deploying = deploying || undefined
    r.vms.suite = suite || undefined
  }
  if (r.nightly) {
    for (const f of r.nightly.files) {
      const stale = f.ageH !== null && f.ageH > S.STATUS_MAX_AGE_H
      c.push({ id: `nightly-${f.name}`, item: 7, level: !f.ok || stale ? 'warn' : 'ok', note: !f.ok ? `the nightly ${f.name} job failed` : `the nightly ${f.name} job has not run for ${f.ageH} hours`, detail: `${f.name}: ${f.ok ? 'ok' : `failed (${f.error})`}${f.ageH !== null ? `, ${f.ageH} h ago` : ''}` })
    }
  }
  return c
}

const fmt = (S, t, opts) => new Intl.DateTimeFormat('en-US', { timeZone: S.TZ, ...opts }).format(new Date(t))
const localHour = (S, t) => Number(fmt(S, t, { hour: 'numeric', hourCycle: 'h23' })) % 24
const localDay = (S, t) => new Intl.DateTimeFormat('en-CA', { timeZone: S.TZ }).format(new Date(t))
/** The day the daily note belongs to: it turns over at DIGEST_HOUR (9 am), not at midnight. */
const digestDay = (S, t) => localDay(S, t - S.DIGEST_HOUR * 3_600_000)
const clock = (S, t) => fmt(S, t, { hour: 'numeric', minute: '2-digit' }).replace(' AM', ' am').replace(' PM', ' pm')
const cap = (s) => s[0].toUpperCase() + s.slice(1)
function quiet(S, t) {
  const h = localHour(S, t)
  return S.QUIET_FROM > S.QUIET_TO ? h >= S.QUIET_FROM || h < S.QUIET_TO : h >= S.QUIET_FROM && h < S.QUIET_TO
}

/**
 * The state machine: what is in alarm, what to text now. Pure apart from the clock it is given.
 * Returns { text | null, after(sent) } where after() records what was sent.
 */
export function decide(S, state, conds, now, { muted = false } = {}) {
  state.streak ??= {}
  state.active ??= {}
  state.clears ??= {}
  state.warnings ??= {}
  // A warning counts once per episode, not once per run.
  const prevWarns = new Set(state.lastRun?.warns ?? [])
  const addWarning = (c, note) => {
    const w = (state.warnings[c.id] ??= { note, first: new Date(now).toISOString(), count: 0 })
    w.note = note
    if (c.event || !prevWarns.has(c.id)) w.count++
    if (c.low !== undefined) w.low = Math.min(w.low ?? Infinity, c.low)
    if (c.unit) w.unit = c.unit
    w.last = new Date(now).toISOString()
  }
  const isQuiet = quiet(S, now)
  const may = (item) => !muted && (!isQuiet || NIGHT_ITEMS.has(item))
  const fresh = []
  const repeat = []
  const cleared = []
  const marks = []
  for (const c of conds) {
    if (c.level === 'alarm') {
      state.streak[c.id] = (state.streak[c.id] || 0) + 1
      if (state.streak[c.id] < (c.two ? S.TWO_IN_A_ROW : 1)) continue
      delete state.clears[c.id] // it came back before its all-clear went out: the alarm continues
      const a = (state.active[c.id] ??= { since: now, item: c.item, sentAt: null, lastSentAt: null })
      a.say = c.say
      if (!may(c.item)) continue
      if (!a.sentAt) (fresh.push(c.say), marks.push(c.id))
      else if (now - a.lastSentAt >= S.REPEAT_HOURS * 3_600_000) (repeat.push(`Still, since ${clock(S, a.since)}: ${c.say}`), marks.push(c.id))
    } else {
      state.streak[c.id] = 0
      const a = state.active[c.id]
      if (a) {
        if (a.sentAt) state.clears[c.id] = { item: c.item, clear: c.clear }
        else addWarning({ id: `${c.id}-brief`, event: true }, `${c.say.replace(/\.$/, '')} for a short while (not texted)`)
        delete state.active[c.id]
      }
      if (c.level === 'warn') addWarning(c, c.note)
    }
  }
  // All-clears due now (at night only for the items allowed then).
  const clearIds = []
  for (const [id, cl] of Object.entries(state.clears)) if (may(cl.item)) (cleared.push(cl.clear), clearIds.push(id))
  let text = null
  let digest = false
  if (fresh.length || repeat.length) {
    text = `Ola alarm: ${[...fresh, ...repeat].map(cap).join(' ')}${cleared.length ? ` Back to normal: ${cleared.join(' ')}` : ''}`
  } else if (cleared.length) {
    text = `Ola: back to normal. ${cleared.join(' ')}`
  } else if (!state.lastDigest) {
    state.lastDigest = digestDay(S, now) // the first run: the first note comes at the next DIGEST_HOUR
  } else if (!muted && !isQuiet && state.lastDigest !== digestDay(S, now)) {
    const notes = Object.values(state.warnings)
    if (notes.length) {
      text = `Ola: a daily note, nothing urgent. Since yesterday ${notes.map((w) => `${w.note}${w.low !== undefined ? ` (lowest ${w.low} ${w.unit})` : ''}${w.count > 1 ? ` (${w.count} times)` : ''}`).join('; ')}.`
      digest = true
    } else state.lastDigest = digestDay(S, now)
  }
  return {
    text,
    after(sent) {
      if (!sent) return
      for (const id of marks) {
        const a = state.active[id]
        a.sentAt ??= now
        a.lastSentAt = now
      }
      if (text?.includes('back to normal') || text?.includes('Back to normal')) for (const id of clearIds) delete state.clears[id]
      if (digest) {
        state.warnings = {}
        state.lastDigest = digestDay(S, now)
      }
      state.lastSent = { at: new Date(now).toISOString(), text }
    },
  }
}

// ---------------------------------------------------------------- the text
/** POSTs the text the way scripts/venture/imsg.mjs does; the key is read here and goes nowhere else. */
async function send(S, text) {
  if (!existsSync(S.KEY_FROM)) return { ok: false, why: `no ${S.KEY_FROM} to read the key from` }
  const env = readEnv(S.KEY_FROM)
  if (!env.VENTURE_KEY) return { ok: false, why: `no VENTURE_KEY in ${S.KEY_FROM}` }
  const base = S.SEND_BASE || env.VENTURE_BASE || 'https://ola.cx'
  try {
    const res = await fetch(`${base}/api/venture/imsg`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: env.VENTURE_KEY, text }), signal: AbortSignal.timeout(20_000) })
    return res.ok ? { ok: true } : { ok: false, why: `the text service answered ${res.status}` }
  } catch (e) {
    return { ok: false, why: `the text service did not answer (${e.cause?.code || e.name})` }
  }
}

// ---------------------------------------------------------------- the board
/** The compact status the board shows; nothing in it names a person, a project or a file. */
export function boardStatus(S, state, r, conds, now) {
  let deployed = null
  try {
    const d = JSON.parse(readFileSync(path.join(S.STAGING, 'deployed.json'), 'utf8'))
    deployed = { commit: String(d.commit ?? ''), at: d.at ?? null, suites: d.suites ?? {} }
  } catch {}
  const alarms = Object.values(state.active ?? {}).filter((a) => a.say)
  const warns = conds.filter((c) => c.level === 'warn').map((c) => c.note).filter(Boolean)
  const parts = {}
  const names = { fd: 'web app', gw: 'model connection', tls: 'secure front', tunnel: 'tunnel' }
  for (const [k, v] of Object.entries(r.web ?? {})) parts[names[k] ?? k] = !!v.ok
  if (r.public) parts['public address'] = r.public.status === 200 || (r.public.status === 401 && !!r.public.basic)
  if (r.almanac) parts['Almanac'] = r.almanac.status === 200
  return {
    host: 'mini',
    deployed,
    alarm: { state: alarms.length ? 'alarm' : warns.length ? 'warn' : 'ok', says: alarms.map((a) => a.say), warns, runAt: new Date(now).toISOString() },
    disk: r.disk && !r.disk.error ? { freeGB: r.disk.freeGB } : null,
    memory: r.memory ? `${r.memory.pressure}, swap ${r.memory.swapPct}%` : null,
    projects: Array.isArray(r.vms?.running) ? { running: r.vms.running.length } : null,
    parts,
  }
}
async function pushStatus(S, status) {
  if (!existsSync(S.KEY_FROM)) return { ok: false, why: `no ${S.KEY_FROM} to read the key from` }
  const env = readEnv(S.KEY_FROM)
  if (!env.VENTURE_KEY) return { ok: false, why: `no VENTURE_KEY in ${S.KEY_FROM}` }
  const base = S.SEND_BASE || env.VENTURE_BASE || 'https://ola.cx'
  try {
    const res = await fetch(`${base}/api/venture/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: env.VENTURE_KEY, status }), signal: AbortSignal.timeout(20_000) })
    return res.ok ? { ok: true } : { ok: false, why: `the board answered ${res.status}` }
  } catch (e) {
    return { ok: false, why: `the board did not answer (${e.cause?.code || e.name})` }
  }
}

// ---------------------------------------------------------------- state
export function loadState() {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'))
  } catch {
    return { version: 1 }
  }
}
function saveState(state) {
  mkdirSync(path.dirname(STATE), { recursive: true, mode: 0o700 })
  const tmp = `${STATE}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
  renameSync(tmp, STATE)
}

/** What ran before and after, the container system's own words, memory: for finding the cause. */
async function saveDropEvidence(S, drop, readings, now) {
  const [status, logs] = await Promise.all([run(S.CONTAINER_BIN, ['system', 'status']), run(S.CONTAINER_BIN, ['system', 'logs', '--last', '10m'], 30_000)])
  const m = readings.memory
  // The front desk stops idle projects itself (OLA_FD_IDLE_STOP_MIN): its recent lines about
  // stopping tell an ordinary rest from the unexplained event.
  let fdLines = ''
  try {
    fdLines = readFileSync(path.join(LOGS, 'frontdesk.log'), 'utf8').split('\n').slice(-400).filter((l) => /stop|idle|rest|start|wak/i.test(l)).slice(-30).join('\n')
  } catch {}
  const text = [
    `Every running sealed VM stopped at once, seen at ${new Date(now).toISOString()} (between this run and the one before).`,
    `Running at the run before: ${drop.before.join(' ')}`,
    `Running now: none`,
    `Deploy in progress: ${drop.deploying ? 'yes' : 'no'}; a check suite held the lock: ${drop.suite ? 'yes' : 'no'}`,
    `Memory now: ${m ? `${m.pressure}, swap ${m.swapPct}% of ${m.swapTotalMB} MB` : 'not read'}; at the run before: ${readings.prevMemory ?? 'not read'}`,
    `Disk free: ${readings.disk?.freeGB ?? '?'} GB`,
    '',
    '--- container system status',
    redact(status.out || status.err).trim(),
    '',
    '--- container system logs, last 10 minutes (tail)',
    redact((logs.out || logs.err).trim().split('\n').slice(-80).join('\n')),
    '',
    '--- the front desk log, recent lines about starting and stopping',
    redact(fdLines) || '(none)',
  ].join('\n')
  mkdirSync(LOGS, { recursive: true, mode: 0o700 })
  const file = path.join(LOGS, `watch-vm-drop-${new Date(now).toISOString().replace(/[:.]/g, '-')}.txt`)
  writeFileSync(file, text + '\n', { mode: 0o600 })
  return file
}

// ---------------------------------------------------------------- main
export async function runOnce({ dry = false, only = null, force = [] } = {}) {
  const S = settings()
  const now = process.env.OLA_WATCH_NOW ? Date.parse(process.env.OLA_WATCH_NOW) : Date.now()
  const state = loadState()
  const off = new Set(S.OFF.split(',').map((s) => s.trim()).filter(Boolean))
  const want = (id) => !off.has(id) && (!only || only.includes(id))
  const t0 = Date.now()
  const r = {}
  const sizesDue = !state.sizes || now - Date.parse(state.sizes.at) >= S.SIZES_EVERY_MIN * 60_000
  await Promise.all([
    want('disk') && probes.disk(S).then((v) => (r.disk = v)),
    want('disk') && sizesDue && !dry && probes.sizes(S).then((v) => (state.sizes = { at: new Date(now).toISOString(), gb: v })),
    (want('memory') || want('vms')) && probes.memory(S).then((v) => (r.memory = v)),
    want('web') && probes.web(S).then((v) => (r.web = v)),
    want('public') && probes.public(S).then((v) => (r.public = v)),
    want('almanac') && probes.almanac(S).then((v) => (r.almanac = v)),
    want('vms') && probes.vms(S).then((v) => (r.vms = v)),
  ])
  if (want('nightly')) r.nightly = probes.nightly(S, now)
  if (!want('memory')) r.memoryForEvidence = r.memory
  const readings = { ...r }
  if (!want('memory')) delete r.memory
  const conds = judge(S, r, now, state)
  for (const id of force) {
    if (id === 'test') conds.push({ id: 'test', item: 1, level: 'test' })
    else conds.push({ id, item: 1, level: 'alarm', say: `this is a forced test of the alarm for "${id}". Nothing is wrong.`, clear: `The forced test of "${id}" is over.`, detail: `${id} forced` })
  }
  // A VM drop: the evidence, saved once.
  const drop = conds.find((c) => c.id === 'vm-drop' && c.drop && c.level === 'warn')
  if (drop && !dry) drop.evidence = await saveDropEvidence(S, drop.drop, { ...readings, memory: readings.memory ?? readings.memoryForEvidence, prevMemory: state.memory }, now)
  const muted = state.muteUntil && Date.parse(state.muteUntil) > now
  const d = decide(S, state, conds.filter((c) => c.level !== 'test' && !(c.id === 'disk' && !S.DISK_TEXTS)), now, { muted })
  let text = d.text
  if (force.includes('test')) text = 'Ola: test of the new alarm. Nothing is wrong.'
  let sent = null
  if (text && !dry) sent = await send(S, text)
  if (!force.includes('test')) d.after(sent?.ok)
  // Remember this run.
  // A listing that failed (the container system not answering) counts as none running, so a drop
  // it caused is recorded once, not at every run while it lasts.
  if (r.vms) state.vms = { running: r.vms.running ?? [], at: new Date(now).toISOString(), deploying: r.vms.deploying, suite: r.vms.suite, listed: r.vms.running !== null }
  if (readings.memory) state.memory = `${readings.memory.pressure}, swap ${readings.memory.swapPct}%`
  const alarms = Object.keys(state.active)
  const warns = conds.filter((c) => c.level === 'warn').map((c) => c.id)
  const line = conds.map((c) => c.detail).filter(Boolean).join('; ')
  state.lastRun = { at: new Date(now).toISOString(), ms: Date.now() - t0, alarms, warns, line, ...(sent && !sent.ok ? { sendFailed: sent.why } : {}) }
  // The board, every PUSH_EVERY_MIN minutes, from full runs only (not --only, --force or --dry).
  let pushed = null
  if (!dry && !only && !force.length && S.PUSH_EVERY_MIN > 0 && (!state.push?.okAt || now - Date.parse(state.push.okAt) >= S.PUSH_EVERY_MIN * 60_000)) {
    pushed = await pushStatus(S, boardStatus(S, state, r, conds, now))
    state.push = { ...(state.push ?? {}), triedAt: new Date(now).toISOString(), ...(pushed.ok ? { okAt: new Date(now).toISOString(), failed: undefined } : { failed: pushed.why }) }
  }
  if (!dry) saveState(state)
  const out = [`${new Date(now).toISOString()} ${alarms.length ? `ALARM ${alarms.join(',')}` : 'ok'}${warns.length ? `; warn ${warns.join(',')}` : ''}${muted ? `; muted until ${state.muteUntil}` : ''}: ${line || 'nothing checked'}`]
  if (state.sizes?.gb && sizesDue && !dry) out.push(`  sizes (GB): ${Object.entries(state.sizes.gb).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  if (drop?.evidence) out.push(`  every VM stopped at once; evidence in ${drop.evidence}`)
  if (text) out.push(dry ? `  would send: ${text}` : sent.ok ? `  sent: ${text}` : `  NOT SENT (${sent.why}), will retry: ${text}`)
  if (pushed) out.push(pushed.ok ? '  status pushed to the board' : `  status NOT pushed to the board (${pushed.why}), will retry`)
  return { out: out.join('\n'), state, text, sent, conds }
}

/** One line for ops/ola.mjs status. */
export function statusLine(now = Date.now()) {
  const st = loadState()
  if (!st.lastRun) return { ok: false, text: 'has not run yet' }
  const ago = Math.round((now - Date.parse(st.lastRun.at)) / 60_000)
  const stale = ago > 6
  const muted = st.muteUntil && Date.parse(st.muteUntil) > now ? `; muted until ${st.muteUntil}` : ''
  const sendFail = st.lastRun.sendFailed ? `; last text NOT sent: ${st.lastRun.sendFailed}` : ''
  return { ok: !stale && !st.lastRun.sendFailed, text: `last run ${ago} min ago${stale ? ' (it should run every 2 minutes)' : ''}: ${st.lastRun.alarms.length ? `ALARM ${st.lastRun.alarms.join(', ')}` : 'no alarm'}${st.lastRun.warns.length ? `, warnings ${st.lastRun.warns.join(', ')}` : ''}${muted}${sendFail}` }
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (isMain) {
  const argv = process.argv.slice(2)
  const val = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
  try {
    if (argv[0] === 'mute' || argv[0] === 'unmute') {
      const st = loadState()
      const hours = Number(argv[1] ?? 0)
      if (argv[0] === 'mute' && !(hours > 0)) throw new Error('usage: node ops/watch.mjs mute <hours>')
      if (argv[0] === 'mute') st.muteUntil = new Date(Date.now() + hours * 3_600_000).toISOString()
      else delete st.muteUntil
      saveState(st)
      console.log(st.muteUntil ? `no texts until ${st.muteUntil} (alarms still tracked)` : 'texts on again')
    } else if (argv[0] === 'show') {
      console.log(JSON.stringify(loadState(), null, 2))
    } else {
      const only = val('--only') ? val('--only').split(',').filter((s) => s && s !== 'none') : null
      const unknown = (only ?? []).filter((id) => !IDS.includes(id))
      if (unknown.length) throw new Error(`unknown check(s): ${unknown.join(', ')} (known: ${IDS.join(', ')})`)
      const force = argv.flatMap((a, i) => (a === '--force' ? [argv[i + 1]] : []))
      const r = await runOnce({ dry: argv.includes('--dry'), only, force })
      console.log(r.out)
      process.exitCode = r.sent && !r.sent.ok ? 1 : 0
    }
  } catch (e) {
    console.error(`watch: ${e.message}`)
    process.exitCode = 1
  }
}
