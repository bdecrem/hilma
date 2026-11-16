#!/usr/bin/env node
// ws.mjs: one sealed Linux VM per customer workspace, on Apple `container` 1.7.1.
//
//   node ws.mjs image                      build the workspace image from the Containerfile
//   node ws.mjs create <id> [--memory 6g] [--disk 50g] [--cpus 4]   (limits can only go down)
//   node ws.mjs start <id> | stop <id> | status [id]
//   node ws.mjs rotate <id>                new opencode password and gateway token (restarts it if running)
//   node ws.mjs upload <id> <file>... [--replace]
//   node ws.mjs files <id> [--json]
//   (the front desk also uses putStream / getStream / removeFile / filesAsync, below: ola-put,
//   ola-get, ola-rm and ola-files through `container exec`, without blocking its event loop)
//   node ws.mjs destroy <id> [--confirm <id>]     wipes the volume; asks unless --confirm <id>
//
// The seal. A workspace VM runs with `--network none`: no interface but loopback, so no
// route to the internet, the host, the LAN, the tailnet or another workspace. It has two
// unix sockets and nothing else:
//   - the door (door.mjs): a host socket mounted into the VM, whose listener connects only
//     to the model gateway on 127.0.0.1 (OLA_GATEWAY_PORT, 4180). ola-init bridges it to
//     127.0.0.1:4180 inside the VM.
//   - the desk (desk.mjs): a host socket, ~/.ola/ws/<id>/opencode.sock, where each connection
//     becomes a `container exec` of socat to opencode on the VM's loopback; the front desk
//     talks to `opencode serve` through it with the workspace's Basic-auth password. Nothing
//     is published with --publish-socket, so the image's root stays read-only.
// opencode's own permission settings are not part of the seal (the agent's shell can
// ignore them). Nothing here needs root, and no host firewall rule is involved.
//
// Secrets. Each workspace gets an opencode password and a gateway token, generated here,
// kept in ~/.ola/ws/<id>/secrets.env (mode 600, folder 700), never printed, never on a
// command line (they reach the VM by --env-file). ~/.ola/gateway-tokens (600) holds the
// GATEWAY_TOKENS line the gateway is started with.
//
// Everything the agent keeps lives in the workspace's volume at /work (its history
// included, under /work/.ola), so `files` shows all of it and `destroy` removes all of it.
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, closeSync, createReadStream, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const CONTAINER = process.env.OLA_CONTAINER_BIN || '/usr/local/bin/container'
export const IMAGE = 'ola-workspace:2.3.0-4'
export const HOME = process.env.OLA_HOME || path.join(homedir(), '.ola')
export const GATEWAY_PORT = Number(process.env.OLA_GATEWAY_PORT || 4180)
// The gateway's door sockets, one per workspace (the gateway's GATEWAY_DOOR_DIR): each door
// connects to its own, which is how the gateway binds a workspace's token to its door.
export const GATEWAY_DOORS = process.env.OLA_GATEWAY_DOORS || path.join(HOME, 'gw')
// OLA_LAUNCHD=1: the door and the desk run as launchd jobs (restarted if they die) while the
// workspace runs; otherwise as detached processes (the checks, a development machine).
const LAUNCHD = process.env.OLA_LAUNCHD === '1'
const LAUNCHD_DIR = path.join(HOME, 'launchd')
const GIB = 1024 ** 3
// The ceilings (arch, section B). `create` may set less, never more.
export const LIMITS = { cpus: 4, memory: 6 * GIB, disk: 50 * GIB }
// At most this many workspaces running on the machine at once (arch: 4 on the Studio).
const MAX_RUNNING = Math.min(4, Number(process.env.OLA_MAX_RUNNING || 4))
const ID = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/
// The container's data root, where volume images live (checked by destroy).
const DATA_ROOT = path.join(homedir(), 'Library/Application Support/com.apple.container')

// Every command checks the id before it reaches a path or the container CLI.
export const validId = (id) => (typeof id === 'string' && ID.test(id)) || refuse('a workspace id is 3 to 32 lowercase letters, digits or dashes')
// What ola-put accepts, checked on the host too, before anything reaches `container exec`.
const UPLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._()+,-]{0,199}$/

export const names = (id) => ({ container: `ola-${id}`, volume: `ola-${id}`, caller: `ws-${id}` })
// The runtime's own folders for a workspace: the container's (config, rootfs) and the volume's.
export function runtimeDirs(id) {
  const img = volumeOf(id)?.configuration?.source
  return [path.join(DATA_ROOT, 'containers', names(id).container), ...(img ? [path.dirname(img)] : [])].filter((d) => existsSync(d))
}
export function paths(id) {
  const dir = path.join(HOME, 'ws', id)
  return { dir, secrets: path.join(dir, 'secrets.env'), meta: path.join(dir, 'meta.json'), door: path.join(dir, 'gateway.sock'), opencode: path.join(dir, 'opencode.sock'), doorPid: path.join(dir, 'door.pid'), doorLog: path.join(dir, 'door.log'), deskPid: path.join(dir, 'desk.pid'), deskLog: path.join(dir, 'desk.log') }
}

export class Refusal extends Error {}
const refuse = (m) => {
  throw new Refusal(m)
}

// ---------------------------------------------------------------- container, quietly

// Runs the container CLI. Arguments never carry a secret. Output is returned, not printed.
export function ctr(args, { input, allowFail = false } = {}) {
  const r = spawnSync(CONTAINER, args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 })
  if (r.error) refuse(`could not run ${CONTAINER}: ${r.error.code}`)
  if (r.status !== 0 && !allowFail) refuse(`container ${args[0]} ${args[1] && !args[1].startsWith('-') ? args[1] : ''} failed: ${(r.stderr || '').trim().split('\n').pop()}`)
  return r
}
const json = (args) => JSON.parse(ctr([...args, '--format', 'json']).stdout || '[]')

// The container's facts, without ever printing its config (it holds the env, secrets included).
export function inspect(id) {
  const r = ctr(['inspect', names(id).container], { allowFail: true })
  if (r.status !== 0) return null
  const c = JSON.parse(r.stdout)[0]
  return c || null
}
export function listOla() {
  return json(['ls', '--all']).filter((c) => (c.configuration?.id || c.id || '').startsWith('ola-'))
}
const stateOf = (c) => c?.status?.state ?? c?.status ?? 'unknown'
export const running = () => listOla().filter((c) => stateOf(c) === 'running')
export function volumeOf(id) {
  return json(['volume', 'ls']).find((v) => v.configuration?.name === names(id).volume) || null
}

// ---------------------------------------------------------------- secrets

function readEnvFile(file) {
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const at = line.indexOf('=')
    if (at > 0) out[line.slice(0, at)] = line.slice(at + 1)
  }
  return out
}
export const secrets = (id) => readEnvFile(paths(id).secrets)

// The GATEWAY_TOKENS line for every workspace that exists, written for the gateway's launcher.
export function writeGatewayTokens() {
  const dir = path.join(HOME, 'ws')
  const entries = []
  for (const id of existsSync(dir) ? readdirSync(dir).sort() : []) {
    const f = paths(id).secrets
    if (ID.test(id) && existsSync(f)) entries.push(`${names(id).caller}:${readEnvFile(f).BOX_API_KEY}`)
  }
  const file = path.join(HOME, 'gateway-tokens')
  // Written beside and renamed into place, so the gateway (which reloads it on a change) never
  // reads half a file.
  writeFileSync(`${file}.tmp`, `GATEWAY_TOKENS=${entries.join(',')}\n`, { mode: 0o600 })
  chmodSync(`${file}.tmp`, 0o600)
  renameSync(`${file}.tmp`, file)
  return file
}

// ---------------------------------------------------------------- sizes

function bytes(s, what) {
  const m = /^(\d+)([kmgt]?)i?b?$/i.exec(String(s).trim())
  if (!m) refuse(`${what}: say a size like 6g or 512m`)
  return Number(m[1]) * 1024 ** ' kmgt'.indexOf((m[2] || ' ').toLowerCase())
}
const human = (n) => (n >= GIB ? `${+(n / GIB).toFixed(1)} GiB` : n >= 1024 ** 2 ? `${+(n / 1024 ** 2).toFixed(1)} MiB` : n >= 1024 ? `${+(n / 1024).toFixed(1)} KiB` : `${n} B`)

// ---------------------------------------------------------------- the door

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
// Two host processes per running workspace, both detached and found again by their pid
// file: the door (door.mjs, the VM's way out to the gateway) and the desk (desk.mjs, the
// host's way in to opencode).
const relays = {
  door: (id) => ({ script: 'door.mjs', sock: paths(id).door, args: [path.join(GATEWAY_DOORS, `${names(id).caller}.sock`)], pid: paths(id).doorPid, log: paths(id).doorLog }),
  desk: (id) => ({ script: 'desk.mjs', sock: paths(id).opencode, args: [names(id).container], pid: paths(id).deskPid, log: paths(id).deskLog }),
}
function relayPid(kind, id) {
  const r = relays[kind](id)
  if (!existsSync(r.pid)) return null
  const pid = Number(readFileSync(r.pid, 'utf8'))
  if (!pid || !alive(pid)) return null
  // Make sure the pid is still ours, not a recycled number.
  const ps = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout || ''
  return ps.includes(r.script) && ps.includes(r.sock) ? pid : null
}
// The launchd label of a workspace's door or desk: cx.ola.door.<id> for the machine's own
// ~/.ola, with the folder's name after it for any other OLA_HOME (the checks' homes).
export function relayLabel(kind, id) {
  const tag = path.basename(HOME).replace(/^\./, '')
  return `cx.ola.${kind}.${id}${tag === 'ola' ? '' : `.${tag}`}`
}
const xml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const launchctl = (...a) => spawnSync('/bin/launchctl', a, { encoding: 'utf8' })
const domain = () => `gui/${process.getuid()}`
async function openRelay(kind, id) {
  if (relayPid(kind, id)) return
  const r = relays[kind](id)
  rmSync(r.sock, { force: true })
  const argv = [process.execPath, path.join(here, r.script), r.sock, ...r.args]
  if (LAUNCHD) {
    // A user agent, loaded while the workspace runs (ws.mjs stop unloads it), restarted by launchd
    // if it dies. Its plist lives in ~/.ola/launchd, not ~/Library/LaunchAgents: after a reboot no
    // workspace runs, so no door or desk should either.
    const label = relayLabel(kind, id)
    mkdirSync(LAUNCHD_DIR, { recursive: true, mode: 0o700 })
    const plist = path.join(LAUNCHD_DIR, `${label}.plist`)
    const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', OLA_CONTAINER_BIN: CONTAINER, OLA_PIDFILE: r.pid }
    writeFileSync(
      plist,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key><array>${argv.map((a) => `<string>${xml(a)}</string>`).join('')}</array>
  <key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k, v]) => `<key>${k}</key><string>${xml(v)}</string>`).join('')}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>2</integer>
  <key>StandardOutPath</key><string>${xml(r.log)}</string>
  <key>StandardErrorPath</key><string>${xml(r.log)}</string>
</dict></plist>
`,
      { mode: 0o600 },
    )
    rmSync(r.pid, { force: true })
    launchctl('bootout', `${domain()}/${label}`)
    const b = launchctl('bootstrap', domain(), plist)
    if (b.status !== 0) refuse(`launchd did not load the ${kind}: ${(b.stderr || '').trim().split('\n').pop()}`)
  } else {
    const log = openSync(r.log, 'a', 0o600)
    const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: ['ignore', log, log], env: { PATH: process.env.PATH, OLA_CONTAINER_BIN: CONTAINER } })
    closeSync(log)
    child.unref()
    writeFileSync(r.pid, String(child.pid), { mode: 0o600 })
  }
  for (let i = 0; i < 50; i++) {
    if (existsSync(r.sock) && (!LAUNCHD || existsSync(r.pid))) return
    await new Promise((res) => setTimeout(res, 100))
  }
  refuse(`the ${kind} did not open its socket`)
}
function closeRelay(kind, id) {
  const label = relayLabel(kind, id)
  const plist = path.join(LAUNCHD_DIR, `${label}.plist`)
  // A job loaded earlier is unloaded whatever this process's mode (a front desk under launchd
  // may have started it, and a check stop it).
  if (LAUNCHD || existsSync(plist)) {
    launchctl('bootout', `${domain()}/${label}`)
    rmSync(plist, { force: true })
  }
  const pid = relayPid(kind, id)
  if (pid) process.kill(pid, 'SIGTERM')
  rmSync(relays[kind](id).pid, { force: true })
}
export const doorPid = (id) => relayPid('door', id)
export const deskPid = (id) => relayPid('desk', id)
const openDoor = (id) => openRelay('door', id)
const closeDoor = (id) => closeRelay('door', id)

// ---------------------------------------------------------------- talking to opencode

// One HTTP request to the workspace's opencode through its desk socket.
export function opencodeRequest(id, urlPath, { auth = true } = {}) {
  const { opencode } = paths(id)
  const headers = auth ? { authorization: `Basic ${Buffer.from(`opencode:${secrets(id).OPENCODE_PASSWORD}`).toString('base64')}` } : {}
  return new Promise((resolve) => {
    const req = http.request({ socketPath: opencode, path: urlPath, headers, timeout: 3000 }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', () => resolve(0))
    req.on('timeout', () => (req.destroy(), resolve(0)))
    req.end()
  })
}

// ---------------------------------------------------------------- commands

export async function create(id, opts = {}) {
  validId(id)
  const cpus = opts.cpus === undefined ? LIMITS.cpus : Number(opts.cpus)
  const memory = opts.memory === undefined ? LIMITS.memory : bytes(opts.memory, '--memory')
  const disk = opts.disk === undefined ? LIMITS.disk : bytes(opts.disk, '--disk')
  if (!Number.isInteger(cpus) || cpus < 1 || cpus > LIMITS.cpus) refuse(`--cpus must be 1 to ${LIMITS.cpus}`)
  if (memory < 512 * 1024 ** 2 || memory > LIMITS.memory) refuse(`--memory must be 512m to ${human(LIMITS.memory)}`)
  if (disk < GIB || disk > LIMITS.disk) refuse(`--disk must be 1g to ${human(LIMITS.disk)}`)
  const n = names(id)
  const p = paths(id)
  if (existsSync(p.dir) || inspect(id) || volumeOf(id)) refuse(`workspace ${id} already exists`)

  mkdirSync(path.join(HOME, 'ws'), { recursive: true, mode: 0o700 })
  chmodSync(HOME, 0o700)
  mkdirSync(p.dir, { mode: 0o700 })
  writeFileSync(p.secrets, newSecrets(), { mode: 0o600 })
  writeFileSync(p.meta, JSON.stringify({ id, created: new Date().toISOString(), image: IMAGE, cpus, memory, disk }, null, 2) + '\n', { mode: 0o600 })
  ctr(['volume', 'create', '-s', String(disk), '--label', `ola.workspace=${id}`, n.volume])
  // A new volume's root belongs to root. Hand it to `work` once, in a throwaway VM with no
  // network, so the workspace itself never runs anything as root.
  ctr(['run', '--rm', '--network', 'none', '--user', 'root', '--entrypoint', '/bin/chown', '-v', `${n.volume}:/work`, IMAGE, '1000:1000', '/work'])
  // The mount source must exist when the container is created.
  await openDoor(id)
  ctr(createArgs(id, { cpus, memory }))
  closeDoor(id)
  // The runtime keeps the container's config (the environment, secrets included) in files of
  // mode 644 and the volume image at 644. Close their folders to this account alone, so the
  // secrets and the customer's disk do not rest on ~/Library's mode.
  for (const dir of runtimeDirs(id)) chmodSync(dir, 0o700)
  writeGatewayTokens()
  return { id, cpus, memory, disk }
}

function createArgs(id, { cpus, memory }) {
  const n = names(id)
  const p = paths(id)
  return [
    'create', '--name', n.container,
    '--label', `ola.workspace=${id}`,
    '--init',
    '--network', 'none',
    '--cpus', String(cpus),
    '--memory', `${Math.floor(memory / 1024 ** 2)}M`,
    '--cap-drop', 'ALL',
    // The image's root is read-only: without it the agent wrote 1.5 GiB into a 1 GiB
    // workspace through /var/tmp and /home/work (the rootfs is a 512 GiB sparse image on the
    // host, outside the volume's limit, invisible to `files`, and kept across `stop`). The
    // tmpfs at /tmp lives in the VM's memory, so the memory limit bounds it. Nothing is
    // published with --publish-socket, which needs a writable root (see desk.mjs).
    '--read-only',
    '--tmpfs', '/tmp',
    '--env-file', p.secrets,
    '-v', `${n.volume}:/work`,
    '-v', `${p.door}:/ola/gw/gateway.sock`,
    IMAGE,
  ]
}

const newSecrets = () => `OPENCODE_PASSWORD=${randomBytes(24).toString('base64url')}\nBOX_API_KEY=${randomBytes(32).toString('hex')}\n`

/**
 * New secrets for a workspace: a new opencode password and gateway token. Both reach the VM only
 * through --env-file at `container create`, so the container is made again from the same volume
 * (nothing outside /work survives a stop anyway: the root is read-only). The old container's
 * config, which held the old secrets, goes with it. The gateway picks up the new token from
 * ~/.ola/gateway-tokens without a restart, and the old one stops working at once.
 * A workspace that was running is started again; open connections to it end.
 */
export async function rotate(id) {
  validId(id)
  const c = inspect(id) || refuse(`no workspace ${id}`)
  const meta = JSON.parse(readFileSync(paths(id).meta, 'utf8'))
  const wasRunning = stateOf(c) === 'running'
  ctr(['stop', names(id).container], { allowFail: true })
  closeRelay('desk', id)
  closeDoor(id)
  ctr(['rm', '--force', names(id).container])
  const p = paths(id)
  writeFileSync(`${p.secrets}.tmp`, newSecrets(), { mode: 0o600 })
  renameSync(`${p.secrets}.tmp`, p.secrets)
  writeGatewayTokens()
  await openDoor(id)
  ctr(createArgs(id, { cpus: meta.cpus, memory: meta.memory }))
  closeDoor(id)
  for (const dir of runtimeDirs(id)) chmodSync(dir, 0o700)
  if (wasRunning) await start(id)
  return { id, restarted: wasRunning }
}

export async function start(id) {
  validId(id)
  const c = inspect(id) || refuse(`no workspace ${id}`)
  const t0 = Date.now()
  await openDoor(id) // also reopens a door that died while the VM ran
  if (stateOf(c) !== 'running') {
    const others = running().filter((x) => (x.configuration?.id || x.id) !== names(id).container)
    if (others.length >= MAX_RUNNING) {
      closeDoor(id)
      refuse(`${others.length} workspaces are already running; the machine runs at most ${MAX_RUNNING}`)
    }
    ctr(['start', names(id).container])
  }
  await openRelay('desk', id) // the way in to opencode, through `container exec`
  for (let i = 0; i < 300; i++) {
    if ((await opencodeRequest(id, '/api/info')) === 200) return { ms: Date.now() - t0 }
    if (i % 10 === 9 && stateOf(inspect(id)) !== 'running') refuse(`workspace ${id} stopped while starting; see: container logs ${names(id).container}`)
    await new Promise((r) => setTimeout(r, 100))
  }
  refuse('the workspace started but opencode did not answer within 30 s')
}

export function stop(id) {
  validId(id)
  inspect(id) || refuse(`no workspace ${id}`)
  ctr(['stop', names(id).container], { allowFail: true })
  closeDoor(id)
  closeRelay('desk', id)
}

export async function status(id) {
  if (id !== undefined) validId(id)
  const ids = id ? [id] : listOla().map((c) => (c.configuration?.id || c.id).slice(4))
  const stats = new Map()
  const up = running()
  if (up.length) for (const s of json(['stats', '--no-stream', ...up.map((c) => c.configuration?.id || c.id)])) stats.set(s.id, s)
  const rows = []
  for (const w of ids) {
    const c = inspect(w)
    if (!c) {
      rows.push({ id: w, state: 'missing' })
      continue
    }
    const cfg = c.configuration
    const v = volumeOf(w)
    const s = stats.get(names(w).container)
    const img = v?.configuration?.source
    rows.push({
      id: w,
      state: stateOf(c),
      cpus: cfg.resources?.cpus,
      memory_limit: cfg.resources?.memoryInBytes,
      memory_used: s?.memoryUsageBytes ?? null,
      disk_limit: v?.configuration?.sizeInBytes ?? null,
      disk_on_host: img && existsSync(img) ? spaceOf(img) : null,
      network: (cfg.networks || []).length ? 'ATTACHED (should be none)' : 'none',
      door: doorPid(w) ? 'open' : 'closed',
      desk: deskPid(w) ? 'open' : 'closed',
      opencode: stateOf(c) === 'running' ? await opencodeRequest(w, '/api/info') : null,
    })
  }
  return rows
}
// Blocks the sparse volume image really takes on the host.
function spaceOf(file) {
  return statSync(file).blocks * 512
}

export async function upload(id, files, { replace = false } = {}) {
  validId(id)
  stateOf(inspect(id)) === 'running' || refuse(`workspace ${id} is not running; start it first`)
  const done = []
  for (const f of files) {
    // lstat: a symlink is refused, not followed, so a staged upload cannot point elsewhere on the host.
    const st = lstatSync(f, { throwIfNoEntry: false })
    if (!st?.isFile()) refuse(`${f} is not a plain file (symlinks are refused)`)
    const got = await putStream(id, path.basename(f), createReadStream(f), { replace })
    if (got.size !== st.size) refuse(`${got.name}: the workspace holds a different file than was sent`)
    done.push(got)
  }
  return done
}

// ---------------------------------------------------------------- for the front desk (async)

// A path inside /work as ola-get and ola-rm accept it: plain names, no "..", at most 6 parts.
export const validRel = (rel) => typeof rel === 'string' && rel.length <= 1300 && rel.split('/').length <= 6 && rel.split('/').every((p) => UPLOAD_NAME.test(p) && !p.includes('..'))

// One `container exec` of an /opt/ola/bin tool, without blocking. stdout is returned as a stream.
function execTool(id, tool, args, { stdin = false } = {}) {
  return spawn(CONTAINER, ['exec', ...(stdin ? ['-i'] : []), names(id).container, `/opt/ola/bin/${tool}`, ...args], { stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] })
}
function collect(child, max) {
  return new Promise((resolve) => {
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      out += d
      if (out.length > max) child.kill('SIGKILL')
    })
    child.stderr.on('data', (d) => (err = (err + d).slice(-2000)))
    child.on('error', () => resolve({ code: -1, out, err: 'could not run container exec' }))
    child.on('close', (code) => resolve({ code, out, err }))
  })
}
const lastLine = (s) => s.trim().split('\n').pop() || ''

/**
 * Streams `source` into /work/<name> through ola-put. Counts and hashes on the way; refuses past
 * maxBytes (the VM's temp file is removed by ola-put when its stdin breaks). Resolves to
 * { name, size, sha256 } only when the VM reports the same size and hash.
 */
export async function putStream(id, name, source, { replace = false, maxBytes = Infinity } = {}) {
  validId(id)
  if (!UPLOAD_NAME.test(name)) refuse(`${JSON.stringify(name)}: an upload name is a plain file name (letters, digits, space . _ ( ) + , -), not starting with a dot, at most 200`)
  const child = execTool(id, 'ola-put', [name, ...(replace ? ['--replace'] : [])], { stdin: true })
  const done = collect(child, 64 * 1024)
  // ola-put may exit before reading everything (a refusal): the broken pipe is its answer, not a crash.
  child.stdin.on('error', () => {})
  const sha = createHash('sha256')
  let size = 0
  let tooBig = false
  let broken = null
  try {
    for await (const chunk of source) {
      size += chunk.length
      if (size > maxBytes) {
        tooBig = true
        break
      }
      sha.update(chunk)
      if (!child.stdin.write(chunk)) await new Promise((r) => (child.stdin.once('drain', r), child.once('close', r)))
      if (child.exitCode !== null) break
    }
  } catch (e) {
    broken = e
  } finally {
    // Too big, or the sender went away: kill ola-put rather than end its input, so a partial
    // file is never renamed into place (its hidden temp file may stay in /work).
    if (tooBig || broken) child.kill('SIGKILL')
    else child.stdin.end()
  }
  const r = await done
  if (broken) throw Object.assign(new Refusal(`${name}: the upload did not arrive whole`), { code: 'ABORTED' })
  if (tooBig) throw Object.assign(new Refusal(`${name}: larger than ${human(maxBytes)}`), { code: 'TOO_LARGE' })
  if (r.code === 3) throw Object.assign(new Refusal(`${name}: a file with that name is already in the workspace`), { code: 'EXISTS' })
  if (r.code !== 0) refuse(`${name}: ${(lastLine(r.err) || `ola-put exited ${r.code}`).slice(0, 300)}`)
  let got
  try {
    got = JSON.parse(lastLine(r.out))
  } catch {
    refuse(`${name}: the workspace did not confirm the upload`)
  }
  const want = sha.digest('hex')
  if (got?.sha256 !== want || got?.size !== size) refuse(`${name}: the workspace holds a different file than was sent`)
  return { name, size, sha256: want }
}

/**
 * Opens /work/<rel> for reading through ola-get. Resolves to { size, stream } once the VM has
 * said the file's size, or null when there is no such plain file. The stream ends after exactly
 * `size` bytes; fewer (the file changed while read) ends it with an error.
 */
export async function getStream(id, rel, { headerMs = 15_000, signal } = {}) {
  validId(id)
  if (!validRel(rel)) return null
  const child = execTool(id, 'ola-get', [rel])
  child.stderr.resume()
  return new Promise((resolve) => {
    let head = Buffer.alloc(0)
    let settled = false
    const fail = () => {
      clearTimeout(timer)
      if (!settled) (settled = true), resolve(null)
      child.kill('SIGKILL')
    }
    // No header in time (ola-get refuses a FIFO at once since 2.3.0-4; this is the backstop), or
    // the asker went away before it came: the exec is killed, never left running.
    const timer = setTimeout(fail, headerMs)
    signal?.addEventListener('abort', () => !settled && fail(), { once: true })
    child.on('error', fail)
    child.on('close', fail)
    const onData = (d) => {
      head = Buffer.concat([head, d])
      const nl = head.indexOf(10)
      if (nl < 0) return head.length > 100 ? fail() : undefined
      child.stdout.off('data', onData)
      child.stdout.pause()
      let size
      try {
        size = JSON.parse(head.subarray(0, nl).toString('utf8')).size
      } catch {}
      if (!Number.isSafeInteger(size) || size < 0) return fail()
      clearTimeout(timer)
      settled = true
      const rest = head.subarray(nl + 1)
      async function* body() {
        let left = size
        if (rest.length) {
          const c = rest.subarray(0, left)
          left -= c.length
          yield c
        }
        for await (const c of child.stdout) {
          if (left <= 0) break
          const part = c.subarray(0, left)
          left -= part.length
          yield part
        }
        if (left > 0) throw new Error('the file changed while it was read')
      }
      resolve({ size, stream: body(), kill: () => child.kill('SIGKILL') })
    }
    child.stdout.on('data', onData)
  })
}

// The first bytes of several plain files in /work, in one `container exec` (the project view's
// things; review of 2026-11-16, M4: one exec per file before). The same walk as ola-get: each
// part opened with O_NOFOLLOW from the folder before it, O_NONBLOCK so a FIFO cannot hold it,
// regular files only. Output: one JSON line per file, {"i": n, "b": base64} or {"i": n}.
const PEEK = String.raw`
import base64, json, os, stat, sys
cap = int(sys.argv[1])
for i, rel in enumerate(sys.argv[2:]):
    out = {"i": i}
    try:
        fd = os.open("/work", os.O_RDONLY | os.O_DIRECTORY)
        parts = rel.split("/")
        for j, part in enumerate(parts):
            nfd = os.open(part, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | (0 if j == len(parts) - 1 else os.O_DIRECTORY), dir_fd=fd)
            os.close(fd)
            fd = nfd
        if stat.S_ISREG(os.fstat(fd).st_mode):
            os.set_blocking(fd, True)
            out["b"] = base64.b64encode(os.read(fd, cap)).decode()
        os.close(fd)
    except OSError:
        pass
    sys.stdout.write(json.dumps(out) + "\n")
`
export async function peek(id, rels, maxBytes) {
  validId(id)
  const list = rels.filter(validRel).slice(0, 32)
  if (!list.length) return new Map()
  const child = spawn(CONTAINER, ['exec', names(id).container, '/usr/bin/python3', '-I', '-c', PEEK, String(maxBytes), ...list], { stdio: ['ignore', 'pipe', 'pipe'] })
  const timer = setTimeout(() => child.kill('SIGKILL'), 15_000)
  const r = await collect(child, list.length * (maxBytes * 1.4 + 64) + 1024)
  clearTimeout(timer)
  const got = new Map()
  for (const line of r.out.split('\n')) {
    try {
      const x = JSON.parse(line)
      if (Number.isInteger(x.i) && list[x.i] !== undefined && typeof x.b === 'string') got.set(list[x.i], Buffer.from(x.b, 'base64').subarray(0, maxBytes))
    } catch {}
  }
  return got
}

/** Deletes /work/<rel> through ola-rm. true when deleted, false when there was no such file. */
export async function removeFile(id, rel) {
  validId(id)
  if (!validRel(rel)) return false
  const r = await collect(execTool(id, 'ola-rm', [rel]), 4096)
  if (r.code === 4 || r.code === 2) return false
  if (r.code !== 0) refuse(`delete failed: ${lastLine(r.err).slice(0, 200)}`)
  return true
}

/** What is in /work, as the VM reports it (see ola-files), without blocking. */
export async function filesAsync(id) {
  validId(id)
  const r = await collect(execTool(id, 'ola-files', []), 64 * 1024 * 1024)
  if (r.code !== 0) refuse(`workspace ${id} did not list its files`)
  return r.out.split('\n').filter(Boolean).map(parseFileLine)
}

// One line of ola-files, checked for shape; anything else is refused rather than shown.
function parseFileLine(line) {
  let x
  try {
    x = JSON.parse(line)
  } catch {
    refuse('the workspace reported a file list that is not in the expected shape')
  }
  const ok = typeof x?.path === 'string' && x.path.length < 4096 && !/[\x00-\x1f\x7f]/.test(x.path) && Number.isSafeInteger(x.size) && (x.mtime === undefined || Number.isSafeInteger(x.mtime)) && ['file', 'link', 'other'].includes(x.type) && (x.sha256 === null || /^[0-9a-f]{64}$/.test(x.sha256))
  if (!ok) refuse('the workspace reported a file list that is not in the expected shape')
  return { path: x.path, type: x.type, size: x.size, mtime: x.mtime ?? null, sha256: x.sha256, ola: x.path.startsWith('.ola/') }
}

// What is in /work, as the VM reports it (see ola-files). Each line is checked for shape;
// anything else is refused rather than shown.
export function files(id) {
  validId(id)
  stateOf(inspect(id)) === 'running' || refuse(`workspace ${id} is not running; start it first`)
  return ctr(['exec', names(id).container, '/opt/ola/bin/ola-files']).stdout.split('\n').filter(Boolean).map(parseFileLine)
}

export async function destroy(id, { confirm } = {}) {
  validId(id)
  if (confirm !== id) {
    if (!process.stdin.isTTY) refuse(`destroy wipes every file in ${id}; pass --confirm ${id} to do it without a prompt`)
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const said = await rl.question(`This wipes workspace ${id}: its volume, every file and the agent's history. Type the id to go ahead: `)
    rl.close()
    if (said.trim() !== id) refuse('not confirmed; nothing was removed')
  }
  const n = names(id)
  const vol = volumeOf(id)
  const img = vol?.configuration?.source
  if (inspect(id)) {
    ctr(['stop', n.container], { allowFail: true })
    ctr(['rm', '--force', n.container], { allowFail: true })
  }
  closeDoor(id)
  closeRelay('desk', id)
  if (vol) ctr(['volume', 'rm', n.volume])
  rmSync(paths(id).dir, { recursive: true, force: true })
  writeGatewayTokens()
  // What is left, checked rather than assumed.
  const left = []
  if (inspect(id)) left.push('the container')
  if (volumeOf(id)) left.push('the volume')
  if (img && existsSync(path.dirname(img))) left.push(`the volume's files on disk (${path.dirname(img)})`)
  if (existsSync(path.join(DATA_ROOT, 'containers', n.container))) left.push("the container's files on disk")
  if (existsSync(paths(id).dir)) left.push('the state folder')
  if (readFileSync(path.join(HOME, 'gateway-tokens'), 'utf8').includes(`${n.caller}:`)) left.push('its gateway token')
  if (left.length) refuse(`destroy left behind: ${left.join(', ')}`)
  return { id, removed: true }
}

export function buildImage() {
  const r = spawnSync(CONTAINER, ['build', '--progress', 'plain', '-t', IMAGE, '-f', path.join(here, 'Containerfile'), here], { stdio: 'inherit' })
  if (r.status !== 0) refuse('the image build failed')
}

// ---------------------------------------------------------------- the command line

async function main(argv) {
  const [cmd, ...rest] = argv
  const flags = {}
  const args = []
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--replace' || rest[i] === '--json') flags[rest[i].slice(2)] = true
    else if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[++i]
    else args.push(rest[i])
  }
  const id = args[0]
  const need = () => id || refuse(`usage: ws.mjs ${cmd} <id>`)
  switch (cmd) {
    case 'image':
      return buildImage()
    case 'create': {
      const w = await create(need(), flags)
      return console.log(`created ${w.id}: ${w.cpus} CPUs, ${human(w.memory)} memory, ${human(w.disk)} volume, no network`)
    }
    case 'start': {
      const { ms } = await start(need())
      return console.log(`${id} is running; opencode answered after ${(ms / 1000).toFixed(1)} s`)
    }
    case 'rotate': {
      const r = await rotate(need())
      return console.log(`${id}: new opencode password and gateway token${r.restarted ? '; restarted' : ''}`)
    }
    case 'stop':
      stop(need())
      return console.log(`${id} stopped`)
    case 'status': {
      const rows = await status(id)
      if (flags.json) return console.log(JSON.stringify(rows, null, 2))
      if (!rows.length) return console.log('no workspaces')
      for (const r of rows) {
        if (r.state === 'missing') console.log(`${r.id}: no such workspace`)
        else
          console.log(
            `${r.id}: ${r.state}, ${r.cpus} CPUs, memory ${r.memory_used == null ? '-' : human(r.memory_used)} of ${human(r.memory_limit)}, volume ${r.disk_on_host == null ? '-' : human(r.disk_on_host)} on disk of ${human(r.disk_limit)}, network ${r.network}, door ${r.door}, desk ${r.desk}${r.opencode == null ? '' : `, opencode ${r.opencode}`}`,
          )
      }
      return
    }
    case 'upload': {
      if (args.length < 2) refuse('usage: ws.mjs upload <id> <file>... [--replace]')
      for (const f of await upload(id, args.slice(1), flags)) console.log(`uploaded ${f.name} (${human(f.size)}, sha256 ${f.sha256})`)
      return
    }
    case 'files': {
      const list = files(need())
      if (flags.json) return console.log(JSON.stringify(list, null, 2))
      const total = list.reduce((s, f) => s + f.size, 0)
      console.log(`${id}: ${list.length} entries, ${human(total)} (paths under .ola/ are the agent's own history and caches)`)
      for (const f of list) console.log(`${human(f.size).padStart(10)}  ${f.sha256 ?? `(${f.type})`.padEnd(64)}  ${JSON.stringify(f.path).slice(1, -1)}`)
      return
    }
    case 'destroy':
      await destroy(need(), flags)
      return console.log(`${id} destroyed; nothing of it is left on this machine`)
    default:
      console.error('usage: ws.mjs image | create <id> | start <id> | stop <id> | status [id] | upload <id> <file>... | files <id> | destroy <id>')
      process.exit(2)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Refusal ? `ws: ${e.message}` : `ws: ${e?.name || 'error'}: ${e?.message}`)
    process.exit(1)
  })
}
