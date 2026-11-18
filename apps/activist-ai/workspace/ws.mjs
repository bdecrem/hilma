#!/usr/bin/env node
// ws.mjs: one sealed Linux VM per customer workspace, on Apple `container` 1.7.1.
//
//   node ws.mjs image                      build the workspace image from the Containerfile
//   node ws.mjs create <id> [--memory 6g] [--disk 50g] [--cpus 4]   (limits can only go down)
//   node ws.mjs start <id> | stop <id> | status [id]
//   node ws.mjs rotate <id> [--json]       new opencode password and gateway token: revoke, then restore
//   node ws.mjs revoke <id> | restore <id> the two phases (see "rotation" below); the admin CLI runs them
//   node ws.mjs close <id> | reopen <id>   a workspace that could not be made safe; reopen rotates again
//   node ws.mjs upload <id> <file>... [--replace]
//   node ws.mjs files <id> [--json]
//   (the front desk also uses putStream / getStream / removeFile / filesAsync, below: ola-put,
//   ola-get, ola-rm and ola-files through `container exec`, without blocking its event loop)
//   node ws.mjs destroy <id> [--confirm <id>]     wipes the volume; asks unless --confirm <id>
//   node ws.mjs snapshot <id> <dir> | snapshot --all <dir>    a consistent copy: project.db by
//                                          SQLite's online backup, files.tar, manifest.json
//   node ws.mjs load-snapshot <id> <dir/id>  a snapshot into an empty workspace (a restore)
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
import { chmodSync, closeSync, cpSync, createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { skillFolders as listSkills, skillsHash as hashSkills } from '../skills/version.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const CONTAINER = process.env.OLA_CONTAINER_BIN || '/usr/local/bin/container'
export const IMAGE = 'ola-workspace:2.3.0-33'
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
const MACHINE_MAX = 4
const MAX_RUNNING = Math.min(MACHINE_MAX, Number(process.env.OLA_MAX_RUNNING || MACHINE_MAX))
// OLA_RUNNING_SCOPE=home (the checks, never the machine's own ~/.ola): OLA_MAX_RUNNING counts only
// this OLA_HOME's workspaces, so a check's own limit does not depend on who else runs a VM; the
// machine's 4 still counts every one.
const SCOPE_HOME = process.env.OLA_RUNNING_SCOPE === 'home' && (process.env.OLA_HOME || '') !== '' && path.resolve(process.env.OLA_HOME) !== path.join(homedir(), '.ola')
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
  return {
    dir, secrets: path.join(dir, 'secrets.env'), meta: path.join(dir, 'meta.json'), door: path.join(dir, 'gateway.sock'), opencode: path.join(dir, 'opencode.sock'), doorPid: path.join(dir, 'door.pid'), doorLog: path.join(dir, 'door.log'), deskPid: path.join(dir, 'desk.pid'), deskLog: path.join(dir, 'desk.log'),
    // A rotation under way: the new secrets, written first (see revoke). While it exists, it is
    // the token the gateway gets, and nothing starts the workspace before the rotation is finished.
    next: path.join(dir, 'secrets.env.next'),
    // The workspace could not be brought to a safe state: nothing starts it until `reopen`.
    closed: path.join(dir, 'closed'),
    // It was running when its secrets were revoked; restore starts it again.
    restart: path.join(dir, 'restart-after-rotation'),
    lock: path.join(dir, 'lock'),
  }
}

export class Refusal extends Error {}
const refuse = (m, code) => {
  throw Object.assign(new Refusal(m), code ? { code } : {})
}
// `ws.mjs start` exits with these, so the front desk can tell a full machine and a closed
// workspace from a failure.
export const EXIT = { MACHINE_FULL: 3, CLOSED: 4 }

// ---------------------------------------------------------------- container, quietly

// Runs the container CLI. Arguments never carry a secret. Output is returned, not printed.
export function ctr(args, { input, allowFail = false, timeout } = {}) {
  const r = spawnSync(CONTAINER, args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024, timeout })
  if (r.error && !(allowFail && r.error.code === 'ETIMEDOUT')) refuse(`could not run ${CONTAINER}: ${r.error.code}`)
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
/**
 * For the checks (the deploy runs them on a shared machine): waits up to `ms` until `need` VMs can
 * run beside every running VM that is not one of `mine` (ids), saying once that it waits, and
 * throws one plain line if the room never comes.
 */
export async function waitForRoom(mine, need, { ms = 180_000, say = console.log } = {}) {
  const theirs = () => running().map((c) => c.configuration?.id || c.id).filter((n) => !mine.includes(n.slice(4)))
  const end = Date.now() + ms
  let told = false
  for (let t = theirs(); t.length + need > MACHINE_MAX; t = theirs()) {
    const what = `${t.length} VMs running that are not this suite's (${t.join(', ')})`
    if (Date.now() > end) throw new Error(`the machine is full: ${what}`)
    if (!told) (say(`waiting for a free VM slot: ${what}`), (told = true))
    await new Promise((r) => setTimeout(r, 2000))
  }
}
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
//
// Ownership: every entry whose name starts with `ws-` is a workspace's and is written from the
// workspaces' secrets alone, so a destroyed or rotated workspace's token is gone at once (a `ws-`
// entry with no workspace behind it is dropped too). Every other entry belongs to someone else
// (the `bart` host caller that bart/ola-bart.sh adds, for Bart's own apps) and is kept byte for
// byte, in its order, after the workspaces'. A file that is not one GATEWAY_TOKENS= line keeps
// nothing of its own: the gateway would refuse it anyway and keep the old callers in force.
export const OWNED_PREFIX = 'ws-'
export function foreignTokenEntries(text) {
  const t = String(text ?? '').trim()
  if (!/^GATEWAY_TOKENS=[^\n]*$/.test(t)) return []
  return t.slice('GATEWAY_TOKENS='.length).split(',').filter((e) => e !== '' && !e.trim().startsWith(OWNED_PREFIX))
}
export function writeGatewayTokens() {
  const dir = path.join(HOME, 'ws')
  const entries = []
  for (const id of existsSync(dir) ? readdirSync(dir).sort() : []) {
    if (!ID.test(id)) continue
    // A rotation under way: its new token, never the old one (another workspace's create or destroy
    // rewrites this file too, and must not bring a revoked token back).
    const f = [paths(id).next, paths(id).secrets].find((x) => existsSync(x))
    if (f) entries.push(`${names(id).caller}:${readEnvFile(f).BOX_API_KEY}`)
  }
  const file = path.join(HOME, 'gateway-tokens')
  let before = ''
  try {
    before = readFileSync(file, 'utf8')
  } catch {}
  entries.push(...foreignTokenEntries(before))
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
  // Homebrew's stable link, not the versioned Cellar path a brew upgrade removes (a door or desk
  // restarted by launchd after an upgrade would not start).
  const argv = [existsSync('/opt/homebrew/bin/node') ? '/opt/homebrew/bin/node' : process.execPath, path.join(here, r.script), r.sock, ...r.args]
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
    // opencode reads no config from the project (/work/opencode.json, /work/.opencode/): a file
    // the agent or an upload put there changed its instructions and permissions (review 3, open
    // until review 4). Also in the image's ENV; here too so a container made by this ws.mjs has it.
    '--env', 'OPENCODE_DISABLE_PROJECT_CONFIG=1',
    '-v', `${n.volume}:/work`,
    '-v', `${p.door}:/ola/gw/gateway.sock`,
    IMAGE,
  ]
}

const newSecrets = () => `OPENCODE_PASSWORD=${randomBytes(24).toString('base64url')}\nBOX_API_KEY=${randomBytes(32).toString('hex')}\n`

// ---------------------------------------------------------------- rotation
//
// New secrets for a workspace (a member was removed: they may have read both from inside). Both
// reach the VM only through --env-file at `container create`, so the container is made again
// from the same volume (nothing outside /work survives a stop anyway: the root is read-only).
//
// Two phases, so revocation never waits on a free VM slot (2026-11-16: with the machine at its
// cap, the old rotate failed at its last step, the restart, and the admin CLI stopped there, so
// the team's other workspaces were never rotated):
//
//   revoke (file writes, stop and rm only; none needs a slot)
//     1. write secrets.env.next          the new secrets; also the "rotation under way" marker
//     2. write gateway-tokens from it    the gateway reloads: the old token is refused (and confirmed)
//     3. stop the VM, close desk + door  the old password reaches nothing
//     4. rm the old container            its config held the old secrets. If it cannot be removed,
//                                        the workspace is closed: it never runs on that container
//     5. rename .next to secrets.env     the new secrets are the workspace's
//   restore (best effort)
//     6. create the container from the new secrets
//     7. start it, if it was running     a full machine leaves it stopped; the next request wakes it
//
// Why this order survives a kill -9 between any two steps: .next is written before anything else
// and removed only after the old container is gone, so "a .next exists" means exactly "the old
// container may still exist". While it exists, writeGatewayTokens hands the gateway the NEW
// token (whoever rewrites the file), and start() finishes the revocation before it runs anything,
// so a wake never boots the old container. Once .next is gone, any container there was made from
// the new secrets, and a missing one is made again by start(). Running the command again picks up
// the .next it finds (its token may already be the one in force) and carries on. The token goes
// before the stop because the token is the one the gateway itself can refuse, whatever the
// container runtime does; a kill between 2 and 3 leaves the VM running on the old password for
// that moment, reachable only through the host's desk socket, and the next start() or rerun stops it.
// Killed before step 2 finishes, nothing in force has changed yet: run it again.

const KILL_AT = HOME !== path.join(homedir(), '.ola') ? process.env.OLA_TEST_KILL_AT : undefined
// The checks' way to kill -9 a rotation between two steps (never honored for the machine's own ~/.ola).
const step = (name) => KILL_AT === name && process.kill(process.pid, 'SIGKILL')

// One rotation, start or reopen at a time per workspace (the front desk's wake can arrive in the
// middle of an admin's rotation). A lock left by a killed process is taken over.
async function withLock(id, fn) {
  const { lock } = paths(id)
  for (let i = 0; ; i++) {
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 })
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let pid = 0
      let age = 0
      try {
        pid = Number(readFileSync(lock, 'utf8')) || 0
        age = Date.now() - statSync(lock).mtimeMs
      } catch {
        continue // it went away meanwhile
      }
      // No pid yet is a lock being written this instant, unless it is old.
      if (pid ? !alive(pid) : age > 5000) {
        rmSync(lock, { force: true })
        continue
      }
      if (i >= 1800) refuse(`workspace ${id} is busy with another rotation or start (pid ${pid})`)
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  try {
    return await fn()
  } finally {
    rmSync(lock, { force: true })
  }
}

// The gateway's answer to the old token through this workspace's own door socket (the only place
// a workspace token is accepted). 401: refused. 0: nothing listens (no gateway, or it runs without
// this door), so nothing accepts it either. Waits for the gateway's reload (a watch, or its 3 s stat).
async function confirmRefused(id, token) {
  const sock = path.join(GATEWAY_DOORS, `${names(id).caller}.sock`)
  const ask = () =>
    new Promise((resolve) => {
      const req = http.request({ socketPath: sock, path: '/v1/models', headers: { authorization: `Bearer ${token}` }, timeout: 3000 }, (res) => (res.resume(), resolve(res.statusCode)))
      req.on('error', () => resolve(0))
      req.on('timeout', () => (req.destroy(), resolve(-1)))
      req.end()
    })
  for (let i = 0; i < 100; i++) {
    if (!existsSync(sock)) return 'no gateway'
    const s = await ask()
    if (s === 401) return 'refused'
    if (s === 0) return 'no gateway'
    await new Promise((r) => setTimeout(r, 100))
  }
  return 'unconfirmed'
}

/** Marks a workspace closed (it could not be made safe): nothing starts it until `reopen`. */
export function close(id) {
  validId(id)
  existsSync(paths(id).dir) || refuse(`no workspace ${id}`)
  writeFileSync(paths(id).closed, 'closed: it could not be brought to a safe state after a rotation; see ws.mjs reopen\n', { mode: 0o600 })
  closeRelay('desk', id)
  closeDoor(id)
}
export const isClosed = (id) => existsSync(paths(id).closed)
const known = (id) => (validId(id), existsSync(paths(id).meta) || refuse(`no workspace ${id}`))

/**
 * Phase 1: the old opencode password and gateway token stop working. Needs no VM slot.
 * Resolves to { state: 'revoked' | 'closed', gateway: 'refused' | 'no gateway' | 'unconfirmed', wasRunning }.
 */
export async function revoke(id) {
  known(id)
  return withLock(id, () => revokeLocked(id))
}
async function revokeLocked(id) {
  const p = paths(id)
  const n = names(id)
  const c = inspect(id)
  const wasRunning = stateOf(c) === 'running'
  const old = existsSync(p.secrets) ? readEnvFile(p.secrets).BOX_API_KEY : null
  // 1. (An interrupted rotation's .next is kept: its token may already be the gateway's.)
  if (!existsSync(p.next)) {
    writeFileSync(`${p.next}.tmp`, newSecrets(), { mode: 0o600 })
    renameSync(`${p.next}.tmp`, p.next)
  }
  if (wasRunning) writeFileSync(p.restart, '', { mode: 0o600 })
  step('pending')
  // 2.
  writeGatewayTokens()
  step('tokens')
  const gateway = old && old !== readEnvFile(p.next).BOX_API_KEY ? await confirmRefused(id, old) : 'refused'
  // 3. Bounded: a stuck runtime must not hold the revocation of the team's other workspaces.
  if (c) ctr(['stop', n.container], { allowFail: true, timeout: 120_000 })
  closeRelay('desk', id)
  closeDoor(id)
  step('stopped')
  // 4.
  if (inspect(id)) ctr(['rm', '--force', n.container], { allowFail: true, timeout: 120_000 })
  if (inspect(id)) {
    close(id)
    return { id, state: 'closed', gateway, wasRunning, why: 'the old container could not be removed' }
  }
  step('removed')
  // 5.
  renameSync(p.next, p.secrets)
  step('renamed')
  return { id, state: 'revoked', gateway, wasRunning }
}

// The container, made from the current secrets if it is missing (after a rotation, or a crash in one).
async function ensureContainer(id) {
  const had = inspect(id)
  // A stopped container made from an older image is made again from the current one, from the
  // same volume and secrets: the root is read-only, so nothing outside /work is lost. A running
  // one keeps its image until it next stops (so a deploy never cuts a run short).
  if (had && stateOf(had) !== 'running' && !String(had.configuration?.image?.reference ?? '').endsWith(`/${IMAGE}`) && had.configuration?.image?.reference !== IMAGE) {
    ctr(['rm', names(id).container])
    step('made again from the current image')
  } else if (had) return
  volumeOf(id) || refuse(`workspace ${id} has no volume`)
  const meta = JSON.parse(readFileSync(paths(id).meta, 'utf8'))
  await openDoor(id) // the mount source must exist when the container is created
  try {
    ctr(createArgs(id, { cpus: meta.cpus, memory: meta.memory }))
  } finally {
    closeDoor(id)
  }
  for (const dir of runtimeDirs(id)) chmodSync(dir, 0o700)
  step('created')
}

/**
 * Phase 2, best effort: the container made again from the new secrets, and started if it was
 * running. Resolves to { state: 'running' | 'stopped' | 'deferred' | 'closed' | 'pending', why? }:
 * 'deferred' means it was meant to run but is left stopped (or not yet made); the front desk's
 * wake makes and starts it on the next request.
 */
export async function restore(id) {
  known(id)
  return withLock(id, () => restoreLocked(id))
}
async function restoreLocked(id) {
  const p = paths(id)
  if (isClosed(id)) return { id, state: 'closed' }
  if (existsSync(p.next)) return { id, state: 'pending', why: 'its revocation is not finished' }
  // The "was running" mark goes only when restore is done with it, so a kill -9 in here keeps it.
  const want = existsSync(p.restart)
  const done = (r) => (rmSync(p.restart, { force: true }), r)
  try {
    await ensureContainer(id)
  } catch (e) {
    return done({ id, state: want ? 'deferred' : 'stopped', container: false, why: e.message })
  }
  if (!want) return done({ id, state: 'stopped', container: true })
  try {
    await startLocked(id)
    return done({ id, state: 'running', container: true })
  } catch (e) {
    stopQuietly(id)
    return done({ id, state: 'deferred', container: true, busy: e.code === 'MACHINE_FULL', why: e.message })
  }
}

/** Both phases: `ws.mjs rotate`. */
export async function rotate(id) {
  const r = await revoke(id)
  if (r.state !== 'revoked') return r
  return { ...r, ...(await restore(id)), gateway: r.gateway }
}

/** A closed workspace, made safe again: a fresh rotation (new secrets), its container made, left stopped. */
export async function reopen(id) {
  known(id)
  return withLock(id, async () => {
    const r = await revokeLocked(id)
    if (r.state !== 'revoked') return r
    rmSync(paths(id).restart, { force: true })
    await ensureContainer(id)
    rmSync(paths(id).closed, { force: true })
    return { id, state: 'stopped', gateway: r.gateway }
  })
}

function stopQuietly(id) {
  if (inspect(id)) ctr(['stop', names(id).container], { allowFail: true, timeout: 120_000 })
  closeDoor(id)
  closeRelay('desk', id)
}

export async function start(id) {
  known(id)
  return withLock(id, () => startLocked(id))
}
async function startLocked(id) {
  if (isClosed(id)) refuse(`workspace ${id} is closed; see: ws.mjs reopen ${id}`, 'CLOSED')
  // A rotation that did not finish is finished first: the old container never runs again.
  if (existsSync(paths(id).next) && (await revokeLocked(id)).state !== 'revoked') refuse(`workspace ${id} is closed; see: ws.mjs reopen ${id}`, 'CLOSED')
  rmSync(paths(id).restart, { force: true })
  await ensureContainer(id)
  const c = inspect(id) || refuse(`no workspace ${id}`)
  const t0 = Date.now()
  await openDoor(id) // also reopens a door that died while the VM ran
  if (stateOf(c) !== 'running') {
    const others = running().filter((x) => (x.configuration?.id || x.id) !== names(id).container)
    const counted = SCOPE_HOME ? others.filter((x) => existsSync(paths((x.configuration?.id || x.id).slice(4)).meta)) : others
    if (counted.length >= MAX_RUNNING || others.length >= MACHINE_MAX) {
      closeDoor(id)
      refuse(`${Math.max(counted.length, others.length)} workspaces are already running; the machine runs at most ${counted.length >= MAX_RUNNING ? MAX_RUNNING : MACHINE_MAX}`, 'MACHINE_FULL')
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
  known(id)
  // A container a rotation removed and has not made again is already stopped.
  if (inspect(id)) ctr(['stop', names(id).container], { allowFail: true })
  closeDoor(id)
  closeRelay('desk', id)
}

export async function status(id) {
  if (id !== undefined) validId(id)
  const dir = path.join(HOME, 'ws')
  const ids = id ? [id] : [...new Set([...listOla().map((c) => (c.configuration?.id || c.id).slice(4)), ...(existsSync(dir) ? readdirSync(dir).filter((x) => ID.test(x) && existsSync(paths(x).meta)) : [])])]
  const stats = new Map()
  const up = running()
  if (up.length) for (const s of json(['stats', '--no-stream', ...up.map((c) => c.configuration?.id || c.id)])) stats.set(s.id, s)
  const rows = []
  for (const w of ids) {
    const c = inspect(w)
    // closed: refused until reopen; rotation 'pending': a revocation not finished (start finishes it).
    const marks = existsSync(paths(w).dir) ? { closed: isClosed(w), rotation: existsSync(paths(w).next) ? 'pending' : null } : {}
    if (!c) {
      // A workspace whose container a rotation removed is not gone: its volume and state are here,
      // and start makes the container again.
      rows.push(existsSync(paths(w).meta) && volumeOf(w) ? { id: w, state: 'no container', ...marks } : { id: w, state: 'missing' })
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
      ...marks,
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
/** The agent's user in the VM, and the groups and user of our own (image 2.3.0-20, Containerfile). */
export const WORK_UID = 1000
export const RUNNER_GID = 1001
export const TWIN_UID = 1002
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
  return headed(execTool(id, 'ola-get', [rel]), { headerMs, signal })
}

/**
 * What "Open" shows of a file, made inside the VM by ola-view (README, "Open for every kind"):
 * `pdf-page <rel> <n>` (a PNG) and `doc <rel>` (our HTML) as { size, stream, kill } like
 * getStream; null when the VM made nothing. The bytes are the VM's word: the front desk serves
 * them only under a sandbox CSP, as an image or in a frame that runs no script.
 */
export async function viewStream(id, args, { headerMs = 120_000, signal } = {}) {
  validId(id)
  if (!['pdf-page', 'doc'].includes(args[0]) || !validRel(args[1])) return null
  return headed(execTool(id, 'ola-view', args.map(String)), { headerMs, signal })
}

function headed(child, { headerMs, signal }) {
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

// ---------------------------------------------------------------- the project database
//
// /work/project.db lives inside the VM and is only ever opened there, by ola-db (the host cannot
// read ext4, and must not open a file a hostile agent controls). The front desk and these commands
// run `ola-db api ...` through `container exec`: read-only, JSON out, time and size capped.

const DB_DOCS = /\.(pdf|txt|md|html?|docx|pptx|odt|rtf)$/i
/** Whether a file is a document the project database indexes on upload. */
export const isDocument = (rel) => DB_DOCS.test(rel)

/** `ola-db api <args>` in the VM, parsed. Refuses on a timeout, a failure or output out of shape. */
export async function dbApi(id, args, { ms = 15_000, max = 16 * 1024 * 1024 } = {}) {
  validId(id)
  const child = execTool(id, 'ola-db', ['api', ...args])
  const timer = setTimeout(() => child.kill('SIGKILL'), ms)
  const r = await collect(child, max)
  clearTimeout(timer)
  if (r.code !== 0) refuse(/interrupted/.test(r.err) ? 'the query took too long' : /no such table/.test(r.err) ? 'no such table' : 'the project database did not answer', /no such table/.test(r.err) ? 'NO_TABLE' : 'DB_FAILED')
  try {
    const x = JSON.parse(r.out)
    if (x && typeof x === 'object' && !Array.isArray(x)) return x
  } catch {}
  refuse('the project database answered out of shape', 'DB_FAILED')
}

/** `ola-batch api <args>` in the VM (batch jobs), parsed like dbApi; a job the VM does not have is NO_JOB. */
export async function batchApi(id, args, { ms = 20_000, max = 8 * 1024 * 1024 } = {}) {
  validId(id)
  const child = execTool(id, 'ola-batch', ['api', ...args])
  const timer = setTimeout(() => child.kill('SIGKILL'), ms)
  const r = await collect(child, max)
  clearTimeout(timer)
  if (r.code !== 0) refuse(/no such job/.test(r.err) ? 'no such job' : 'the job did not answer', /no such job/.test(r.err) ? 'NO_JOB' : 'JOB_FAILED')
  try {
    const x = JSON.parse(r.out)
    if (x && typeof x === 'object' && !Array.isArray(x)) return x
  } catch {}
  refuse('the job answered out of shape', 'JOB_FAILED')
}

/** `ola-batch run <job>` in the VM: the job itself, for as long as it runs (the front desk keeps it going). */
export function batchRunner(id, job, key) {
  validId(id)
  if (!/^[0-9a-f]{12}$/.test(job)) refuse('not a job id')
  if (!/^[0-9a-f]{64}$/.test(key ?? '')) refuse('not a runner key')
  // The agent's user, in a group of its own (review 5 follow-up): it writes the project's database
  // as the agent does, but the agent's processes cannot read its memory, environment or pipes (the
  // kernel's ptrace check wants the same uid and gid), so the key on its input stays its own.
  const child = spawn(CONTAINER, ['exec', '-i', '--user', `${WORK_UID}:${RUNNER_GID}`, names(id).container, '/opt/ola/bin/ola-batch', 'run', job, '--key-stdin'], { stdio: ['pipe', 'pipe', 'pipe'] })
  child.stdin.on('error', () => {})
  child.stdin.end(key + '\n')
  child.stdout.resume()
  return child
}

/** `ola-db api backup|xlsx ...` as a stream of bytes (a download); kill() ends it. */
export function dbStream(id, args) {
  validId(id)
  const child = execTool(id, 'ola-db', ['api', ...args])
  child.stderr.resume()
  return { stream: child.stdout, kill: () => child.kill('SIGKILL'), done: new Promise((r) => child.on('close', (code) => r(code))) }
}

/** Records and indexes a document in the project database (an upload). true when it did. */
export async function dbAdd(id, rel, { by = 'upload', ms = 120_000 } = {}) {
  if (!validRel(rel)) return false
  const child = execTool(id, 'ola-db', ['add', rel, '--by', by])
  const timer = setTimeout(() => child.kill('SIGKILL'), ms)
  const r = await collect(child, 64 * 1024)
  clearTimeout(timer)
  return r.code === 0
}

/** Forgets a document (its row and its index entries); used when its file is deleted. */
export async function dbRemove(id, rel) {
  if (!validRel(rel)) return false
  const r = await collect(execTool(id, 'ola-db', ['remove', rel]), 64 * 1024)
  return r.code === 0
}

// ---------------------------------------------------------------- reading real documents (2026-11-17)
//
// Everything below runs a tool inside the VM and parses its one JSON answer strictly; a refusal
// comes back as { refused: <the tool's own sentence> } (exit 3), never as a host error. The
// sentence is the VM's word: the front desk shows it as text only.

async function toolJson(id, tool, args, { ms = 60_000, max = 16 * 1024 * 1024, input } = {}) {
  validId(id)
  const child = execTool(id, tool, args.map(String), { stdin: input !== undefined })
  if (input !== undefined) {
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  }
  const timer = setTimeout(() => child.kill('SIGKILL'), ms)
  const r = await collect(child, max)
  clearTimeout(timer)
  let x = null
  try {
    x = JSON.parse(lastLine(r.out))
  } catch {}
  return { code: r.code, json: x && typeof x === 'object' && !Array.isArray(x) ? x : null, err: lastLine(r.err).replace(/^ola-[a-z]+: /, '').slice(0, 300) }
}

/** `ola-view pdf-info|table ...`: JSON, or null when the file is not there or cannot be shown. */
export async function viewJson(id, args, opts) {
  if (!['pdf-info', 'table'].includes(args[0]) || !validRel(args[1])) return null
  const r = await toolJson(id, 'ola-view', args, { ms: 120_000, ...opts })
  return r.code === 0 ? r.json : null
}

/** A zip unpacked inside the VM (ola-unzip). { folder, files, renamed, skipped } or { refused }. */
export async function unzip(id, rel, { maxBytes } = {}) {
  if (!validRel(rel)) return { refused: 'not a plain path' }
  const r = await toolJson(id, 'ola-unzip', [rel, ...(maxBytes ? ['--max-bytes', maxBytes] : [])], { ms: 30 * 60_000, max: 64 * 1024 * 1024 })
  if (r.code === 0 && r.json && Array.isArray(r.json.files) && r.json.files.every((f) => validRel(f?.path) && Number.isSafeInteger(f.size) && /^[0-9a-f]{64}$/.test(f.sha256))) return r.json
  return { refused: r.err || 'the zip could not be unpacked' }
}

/** A SQLite file attached read-only to the project database after its integrity check. */
export async function dbAttach(id, rel) {
  if (!validRel(rel)) return { refused: 'not a plain path' }
  const r = await toolJson(id, 'ola-db', ['attach', rel], { ms: 20 * 60_000 })
  if (r.code === 0 && r.json && typeof r.json.alias === 'string' && /^[a-z][a-z0-9_]{0,29}$/.test(r.json.alias)) return { alias: r.json.alias, tables: Number(r.json.tables) || 0 }
  return { refused: r.err || 'the database could not be attached' }
}

/** Every document in a folder indexed (OCR included); resolves when done, true when it ran. */
export async function dbAddFolder(id, folder, { by = 'upload', ms = 6 * 3600_000 } = {}) {
  if (!validRel(folder)) return false
  const child = execTool(id, 'ola-db', ['add-folder', folder, '--by', by])
  const timer = setTimeout(() => child.kill('SIGKILL'), ms)
  const r = await collect(child, 64 * 1024 * 1024)
  clearTimeout(timer)
  return r.code === 0
}

/** The project's disk: volume size, use, and what takes the room (ola-db api disk). */
export async function disk(id) {
  const r = await toolJson(id, 'ola-db', ['api', 'disk'], { ms: 30_000 })
  const x = r.json
  if (r.code !== 0 || !x || !['total', 'used', 'free', 'files', 'data', 'ola'].every((k) => Number.isSafeInteger(x[k]) && x[k] >= 0)) refuse('the workspace did not report its disk', 'DB_FAILED')
  return { total: x.total, used: x.used, free: x.free, files: x.files, data: x.data, ola: x.ola }
}

// A large upload in pieces (ola-put --chunk): resumable, each piece hashed on both sides.
const UID = /^[0-9a-f]{32}$/
export async function putChunk(id, uid, offset, source, { maxBytes = Infinity } = {}) {
  validId(id)
  if (!UID.test(uid) || !Number.isSafeInteger(offset) || offset < 0) refuse('bad upload piece')
  const child = execTool(id, 'ola-put', ['--chunk', uid, '--offset', String(offset)], { stdin: true })
  const done = collect(child, 64 * 1024)
  child.stdin.on('error', () => {})
  const sha = createHash('sha256')
  let size = 0
  let broken = false
  try {
    for await (const chunk of source) {
      size += chunk.length
      if (size > maxBytes) {
        broken = true
        break
      }
      sha.update(chunk)
      if (!child.stdin.write(chunk)) await new Promise((r) => (child.stdin.once('drain', r), child.once('close', r)))
      if (child.exitCode !== null) break
    }
  } catch {
    broken = true
  } finally {
    if (broken) child.kill('SIGKILL')
    else child.stdin.end()
  }
  const r = await done
  let x = null
  try {
    x = JSON.parse(lastLine(r.out))
  } catch {}
  if (r.code === 5 && Number.isSafeInteger(x?.have)) return { have: x.have, mismatch: true }
  if (broken) throw Object.assign(new Refusal('the piece did not arrive whole'), { code: 'ABORTED' })
  if (r.code !== 0 || !Number.isSafeInteger(x?.have) || x.sha256 !== sha.digest('hex') || x.have !== offset + size) refuse('the workspace did not take the piece')
  return { have: x.have }
}
export async function uploadStatus(id, uid) {
  if (!UID.test(uid)) return null
  const r = await toolJson(id, 'ola-put', ['--status', uid], { ms: 15_000 })
  return r.code === 0 && Number.isSafeInteger(r.json?.have) ? r.json.have : null
}
export async function finishUpload(id, uid, name, { replace = false } = {}) {
  if (!UID.test(uid) || !UPLOAD_NAME.test(name)) refuse('bad upload')
  const r = await toolJson(id, 'ola-put', ['--finish', uid, name, ...(replace ? ['--replace'] : [])], { ms: 10 * 60_000 })
  if (r.code === 3) throw Object.assign(new Refusal(`${name}: a file with that name is already in the workspace`), { code: 'EXISTS' })
  if (r.code !== 0 || r.json?.name !== name || !Number.isSafeInteger(r.json?.size) || !/^[0-9a-f]{64}$/.test(r.json?.sha256 ?? '')) refuse('the workspace did not finish the upload')
  return { name, size: r.json.size, sha256: r.json.sha256 }
}
export async function abortUpload(id, uid) {
  if (!UID.test(uid)) return false
  return (await toolJson(id, 'ola-put', ['--abort', uid], { ms: 15_000 })).code === 0
}

// ---------------------------------------------------------------- snapshots (backups)
//
// A consistent copy of one project: the database by SQLite's online backup (consistent while the
// agent may be writing), and every other file in /work as a tar, with a manifest of sha256s.
//   <dir>/<id>/project.db   <dir>/<id>/files.tar   <dir>/<id>/manifest.json
// A stopped workspace is started for its snapshot and stopped again (the host cannot read ext4).

const TAR_EXCLUDE = ['./project.db', './project.db-wal', './project.db-shm', './.ola/cache', './.ola/tmp', './lost+found']
function pipeTo(child, file) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(file, { mode: 0o600 })
    const sha = createHash('sha256')
    let size = 0
    child.stdout.on('data', (c) => (sha.update(c), (size += c.length)))
    child.stdout.pipe(out)
    let err = ''
    child.stderr.on('data', (d) => (err = (err + d).slice(-500)))
    child.on('close', (code) => out.close(() => (code === 0 ? resolve({ sha256: sha.digest('hex'), size }) : reject(new Refusal(`the copy failed: ${err.trim().split('\n').pop() ?? ''}`.slice(0, 200))))))
  })
}

export async function snapshot(id, dir) {
  known(id)
  const was = stateOf(inspect(id))
  if (was !== 'running') await start(id)
  try {
    const out = path.join(path.resolve(dir), id)
    mkdirSync(out, { recursive: true, mode: 0o700 })
    const at = new Date().toISOString()
    const dbFile = path.join(out, 'project.db.part')
    // The database copy is made and checked INSIDE the VM (ola-db api snapshot-check: online backup,
    // integrity_check, real tables counted); this machine only copies its bytes and keeps them if
    // their sha256 is the one the check reported (review 4, open: the host used to open a file the
    // agent controls with its own SQLite). A VM can still lie about its own copy; it cannot make
    // this machine parse it.
    const checked = await toolJson(id, 'ola-db', ['api', 'snapshot-check'], { ms: 30 * 60_000 })
    const c = checked.json
    if (checked.code !== 0 || !c || !/^snap-[0-9]+-[0-9a-f]{16}\.db$/.test(c.name ?? '') || !/^[0-9a-f]{64}$/.test(c.sha256 ?? '') || !Number.isSafeInteger(c.size)) refuse('the database copy could not be made')
    const db = await pipeTo(spawn(CONTAINER, ['exec', names(id).container, '/opt/ola/bin/ola-db', 'api', 'snapshot-send', '--name', c.name], { stdio: ['ignore', 'pipe', 'pipe'] }), dbFile)
    const tarFile = path.join(out, 'files.tar.part')
    const tar = await pipeTo(spawn(CONTAINER, ['exec', names(id).container, 'tar', '-C', '/work', ...TAR_EXCLUDE.map((x) => `--exclude=${x}`), '-cf', '-', '.'], { stdio: ['ignore', 'pipe', 'pipe'] }), tarFile)
    const counts = c.tables && typeof c.tables === 'object' && !Array.isArray(c.tables) ? Object.fromEntries(Object.entries(c.tables).filter(([k, v]) => /^[A-Za-z0-9_.]{1,128}$/.test(k) && Number.isSafeInteger(v) && v >= 0).slice(0, 2000)) : {}
    if (db.sha256 !== c.sha256 || db.size !== c.size) refuse('the database copy changed between its check and its copy')
    if (c.integrity !== 'ok' || !('documents' in counts)) refuse('the database copy did not check out')
    renameSync(dbFile, path.join(out, 'project.db'))
    renameSync(tarFile, path.join(out, 'files.tar'))
    const manifest = { id, at, image: IMAGE, database: { ...db, tables: counts }, files: tar }
    writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
    return manifest
  } finally {
    if (was !== 'running') stop(id)
  }
}

/** Every workspace on this machine, one at a time (each stopped one is started and stopped again). */
export async function snapshotAll(dir, { say = console.log } = {}) {
  const wsDir = path.join(HOME, 'ws')
  const ids = existsSync(wsDir) ? readdirSync(wsDir).filter((x) => ID.test(x) && existsSync(paths(x).meta) && !isClosed(x)) : []
  const done = []
  const failed = []
  for (const id of ids) {
    try {
      if (stateOf(inspect(id)) !== 'running') await waitForRoom([id], 1, { say })
      const m = await snapshot(id, dir)
      done.push(id)
      say(`${id}: ${m.database.size} bytes of database (${Object.entries(m.database.tables).map(([t, n]) => `${t} ${n}`).join(', ')}), ${m.files.size} bytes of files`)
    } catch (e) {
      failed.push(id)
      say(`${id}: FAILED (${e.message})`)
    }
  }
  return { done, failed }
}

/**
 * Puts a snapshot into a workspace (a new one, for a restore test or to move a project): the
 * files first, then the database through SQLite's backup API into the live file (never by
 * replacing it under an open WAL). Refuses a workspace that already holds files of its own.
 */
export async function loadSnapshot(id, dir) {
  known(id)
  const src = path.resolve(dir)
  for (const f of ['project.db', 'files.tar', 'manifest.json']) existsSync(path.join(src, f)) || refuse(`${src} is not a snapshot (no ${f})`)
  if (stateOf(inspect(id)) !== 'running') await start(id)
  const mine = (await filesAsync(id)).filter((f) => !f.ola && !/^project\.db(-wal|-shm)?$/.test(f.path))
  if (mine.length) refuse(`workspace ${id} already has files; load a snapshot only into an empty one`)
  const run = (args, file) =>
    new Promise((resolve, reject) => {
      const child = spawn(CONTAINER, ['exec', '-i', names(id).container, ...args], { stdio: ['pipe', 'pipe', 'pipe'] })
      let err = ''
      child.stderr.on('data', (d) => (err = (err + d).slice(-500)))
      child.stdout.resume()
      child.stdin.on('error', () => {})
      createReadStream(file).pipe(child.stdin)
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Refusal(`the restore failed: ${err.trim().split('\n').pop() ?? ''}`.slice(0, 200)))))
    })
  // The agent's own history (.ola: conversations, caches) is in files.tar too, but it is not put
  // into a running workspace: opencode holds its database open. Restore it by hand with the
  // workspace stopped (README, "Where the data lives").
  await run(['tar', '-C', '/work', '--no-same-owner', '--exclude=./.ola', '-xf', '-'], path.join(src, 'files.tar'))
  const restore = String.raw`
import sqlite3, sys, os
tmp = "/work/.ola/tmp/restore.db"
os.makedirs("/work/.ola/tmp", exist_ok=True)
with open(tmp, "wb") as f:
    f.write(sys.stdin.buffer.read())
src = sqlite3.connect(tmp)
dst = sqlite3.connect("/work/project.db")
src.backup(dst)
dst.close(); src.close(); os.unlink(tmp)
`
  await run(['/usr/bin/python3', '-I', '-c', restore], path.join(src, 'project.db'))
  return { id, from: src }
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

// Built under a temporary tag and named IMAGE only once the build finished, so a build that is cut
// off (a slow or stalled download, a killed deploy) never leaves something called IMAGE that is
// half made; the next build starts again. The downloads in the Containerfile retry and give up on
// a stalled connection. Up to three tries in all.
// The build context is staged: this folder plus the skill folders of ../skills (at skills/ in the
// context; the folder's own README and check.py stay out, since opencode would read a loose .md at
// the top as a skill), so the image's skills are exactly the repo's, labeled with their hash.
const SKILLS_SRC = path.join(here, '../skills')
// The one hash of a skill set (skills/version.mjs): the same for the image, the Mac app's bundle
// and the deploy's record, so they can be compared.
const skillFolders = (dir = SKILLS_SRC) => listSkills(dir)
export function skillsHash(dir = SKILLS_SRC) {
  return hashSkills(dir)
}
function stageContext() {
  const ctx = mkdtempSync(path.join(tmpdir(), 'ola-image-'))
  cpSync(here, ctx, { recursive: true, filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src) })
  for (const s of skillFolders()) cpSync(path.join(SKILLS_SRC, s), path.join(ctx, 'skills', s), { recursive: true, filter: (src) => !/[\\/](__pycache__|\.DS_Store)([\\/]|$)/.test(src) })
  return ctx
}
export function buildImage({ tries = 3 } = {}) {
  const tmp = `${IMAGE}-building`
  const ctx = stageContext()
  const hash = skillsHash()
  try {
    for (let i = 1; i <= tries; i++) {
      ctr(['image', 'delete', tmp], { allowFail: true })
      const r = spawnSync(CONTAINER, ['build', '--progress', 'plain', '--build-arg', `OLA_SKILLS_HASH=${hash}`, '-t', tmp, '-f', path.join(ctx, 'Containerfile'), ctx], { stdio: 'inherit' })
      if (r.status === 0) {
        ctr(['image', 'tag', tmp, IMAGE])
        ctr(['image', 'delete', tmp], { allowFail: true })
        return
      }
      console.error(`ws: the image build failed (try ${i} of ${tries})`)
    }
  } finally {
    rmSync(ctx, { recursive: true, force: true })
  }
  ctr(['image', 'delete', tmp], { allowFail: true })
  refuse('the image build failed')
}
/** Builds IMAGE if this machine does not have it yet. */
export function ensureImage() {
  if (ctr(['image', 'inspect', IMAGE], { allowFail: true }).status !== 0) buildImage()
}

// ---------------------------------------------------------------- the command line

async function main(argv) {
  const [cmd, ...rest] = argv
  const flags = {}
  const args = []
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--replace' || rest[i] === '--json' || rest[i] === '--missing') flags[rest[i].slice(2)] = true
    else if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[++i]
    else args.push(rest[i])
  }
  const id = args[0]
  const need = () => id || refuse(`usage: ws.mjs ${cmd} <id>`)
  switch (cmd) {
    case 'image':
      return flags.missing ? ensureImage() : buildImage()
    case 'create': {
      const w = await create(need(), flags)
      return console.log(`created ${w.id}: ${w.cpus} CPUs, ${human(w.memory)} memory, ${human(w.disk)} volume, no network`)
    }
    case 'start': {
      const { ms } = await start(need())
      return console.log(`${id} is running; opencode answered after ${(ms / 1000).toFixed(1)} s`)
    }
    // rotate = revoke, then restore. With --json, one JSON line (the admin CLI reads it); the exit
    // code is 0 whatever the state, which the line says, and 1 only if the command itself failed.
    case 'rotate':
    case 'revoke':
    case 'restore':
    case 'reopen': {
      const r = await { rotate, revoke, restore, reopen }[cmd](need())
      if (flags.json) return console.log(JSON.stringify(r))
      return console.log(`${id}: ${stateLine(r)}`)
    }
    case 'close':
      close(need())
      return console.log(`${id} closed; nothing starts it until: ws.mjs reopen ${id}`)
    case 'stop':
      stop(need())
      return console.log(`${id} stopped`)
    case 'status': {
      const rows = await status(id)
      if (flags.json) return console.log(JSON.stringify(rows, null, 2))
      if (!rows.length) return console.log('no workspaces')
      for (const r of rows) {
        if (r.state === 'missing') console.log(`${r.id}: no such workspace`)
        else if (r.state === 'no container') console.log(`${r.id}: no container (start makes it from the current secrets)${r.closed ? ' (CLOSED)' : ''}${r.rotation ? ' (rotation pending)' : ''}`)
        else
          console.log(
            `${r.id}: ${r.state}${r.closed ? ' (CLOSED)' : ''}${r.rotation ? ' (rotation pending)' : ''}, ${r.cpus} CPUs, memory ${r.memory_used == null ? '-' : human(r.memory_used)} of ${human(r.memory_limit)}, volume ${r.disk_on_host == null ? '-' : human(r.disk_on_host)} on disk of ${human(r.disk_limit)}, network ${r.network}, door ${r.door}, desk ${r.desk}${r.opencode == null ? '' : `, opencode ${r.opencode}`}`,
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
    case 'snapshot': {
      if (flags.all) {
        const r = await snapshotAll(flags.all)
        console.log(`${r.done.length} project${r.done.length === 1 ? '' : 's'} copied to ${path.resolve(flags.all)}${r.failed.length ? `; FAILED: ${r.failed.join(', ')}` : ''}`)
        if (r.failed.length) process.exit(1)
        return
      }
      if (!args[1]) refuse('usage: ws.mjs snapshot <id> <dir> | snapshot --all <dir>')
      const m = await snapshot(need(), args[1])
      return console.log(flags.json ? JSON.stringify(m, null, 2) : `${id}: copied to ${path.join(path.resolve(args[1]), id)} (database ${human(m.database.size)}, files ${human(m.files.size)})`)
    }
    case 'load-snapshot': {
      if (!args[1]) refuse('usage: ws.mjs load-snapshot <id> <dir>/<snapshot id>')
      await loadSnapshot(need(), args[1])
      return console.log(`${id}: loaded from ${path.resolve(args[1])}`)
    }
    default:
      console.error('usage: ws.mjs image | create <id> | start <id> | stop <id> | status [id] | rotate | revoke | restore | reopen | close <id> [--json] | upload <id> <file>... | files <id> | snapshot <id> <dir> | snapshot --all <dir> | load-snapshot <id> <dir> | destroy <id>')
      process.exit(2)
  }
}

/** One plain sentence for a rotation's result (also the admin CLI's, per workspace). */
export function stateLine(r) {
  const gw = r.gateway === 'unconfirmed' ? '; THE GATEWAY DID NOT CONFIRM the old token is refused (is it running? node ops/ola.mjs status)' : ''
  switch (r.state) {
    case 'running':
      return `new secrets in force, old ones refused; running again${gw}`
    case 'stopped':
      return `new secrets in force, old ones refused; stopped, starts on its next request${gw}`
    case 'deferred':
      return `new secrets in force, old ones refused; left stopped (${r.busy ? 'the machine is running as many workspaces as it may' : r.why}); it starts on its next request${gw}`
    case 'revoked':
      return `new secrets in force, old ones refused; not restarted yet (finish: ws.mjs restore ${r.id})${gw}`
    case 'closed':
      return `CLOSED (${r.why ?? 'it could not be brought to a safe state'}); the old gateway token is refused and nothing starts it. Fix the container runtime, then: ws.mjs reopen ${r.id}`
    default:
      return `${r.state}${r.why ? ` (${r.why})` : ''}${gw}`
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Refusal ? `ws: ${e.message}` : `ws: ${e?.name || 'error'}: ${e?.message}`)
    process.exit(EXIT[e?.code] ?? 1)
  })
}
