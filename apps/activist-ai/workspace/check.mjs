#!/usr/bin/env node
// The sealing proofs, run on the machine that hosts the workspaces (the Mac mini for now):
//
//   node workspace/check.mjs            (from apps/activist-ai, after `npm ci`)
//
// It starts its own model gateway (port 4181, Together as the stand-in model, key read from
// TOGETHER_API_KEY or ~/Documents/code/hilma/.env.local and never printed), creates three
// workspaces under a separate state folder (~/.ola-check), and proves from inside the VMs:
//   1. the workspace reaches the gateway, and the door leads nowhere else
//   2. it cannot reach the internet (TCP, UDP, DNS, IPv6), the host's ports (every host
//      address it might guess), the LAN, the tailnet, or another workspace
//   3. the limits hold: CPUs, memory (an allocation past it is killed), disk (writing past
//      it fails), refusals above the ceilings, at most N running
//   4. a real task through the gateway (the survey spike: 16 checks) passes inside the VM
//   5. destroy leaves nothing behind
// Only made-up data. Prints one line per check, the measurements, and exits 0 only if all pass.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const spike = path.join(here, '../spike')
// OLA_CHECK_TAG=<word> (a scratch copy run beside a deploy's suites): workspaces <word>-chk-*,
// state in ~/.ola-check-<word>, the gateway on OLA_CHECK_GW_PORT (4181).
const TAG = process.env.OLA_CHECK_TAG ?? ''
if (TAG && !/^[a-z][a-z0-9]{0,7}$/.test(TAG)) throw new Error('OLA_CHECK_TAG is 1 to 8 lowercase letters or digits')
const PRE = TAG ? `${TAG}-` : ''
const GW_PORT = Number(process.env.OLA_CHECK_GW_PORT || 4181)
process.env.OLA_HOME = path.join(homedir(), `.ola-check${TAG ? `-${TAG}` : ''}`)
process.env.OLA_GATEWAY_PORT = String(GW_PORT)
process.env.OLA_MAX_RUNNING = '2'
// The 2 counts this check's own workspaces (a person's workspace may run on the machine meanwhile).
process.env.OLA_RUNNING_SCOPE = 'home'
// --no-live skips the one real task (a live model run on the stand-in); everything else runs.
const LIVE = !process.argv.includes('--no-live')
const ws = await import('./ws.mjs')
const { OpenCode } = await import('@opencode/client')

const run = mkdtempSync(path.join(tmpdir(), 'ola-check-'))
const results = []
const measured = {}
const t = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const GIB = 1024 ** 3
const A = `${PRE}chk-a`
const B = `${PRE}chk-b`
const C = `${PRE}chk-c`

// Runs python inside a workspace (as its user `work`) and returns { code, out, err }.
function inside(id, code, { timeout = 120_000 } = {}) {
  const r = spawnSync(ws.CONTAINER, ['exec', ws.names(id).container, 'python3', '-I', '-c', code], { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}
const insideJSON = (id, code, opts) => {
  const r = inside(id, code, opts)
  try {
    return JSON.parse(r.out.trim().split('\n').pop())
  } catch {
    return { error: `exit ${r.code}: ${r.err.trim().split('\n').pop()}` }
  }
}

// ---------------------------------------------------------------- the gateway

function together() {
  if (process.env.TOGETHER_API_KEY) return process.env.TOGETHER_API_KEY
  const f = path.join(homedir(), 'Documents/code/hilma/.env.local')
  const line = readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith('TOGETHER_API_KEY='))
  if (!line) throw new Error('no TOGETHER_API_KEY in the environment or in ~/Documents/code/hilma/.env.local')
  return line.slice('TOGETHER_API_KEY='.length).replace(/^["']|["']$/g, '').trim()
}
let gateway = null
let gatewayLog = ''
async function startGateway() {
  if (gateway) gateway.kill('SIGTERM')
  gateway = spawn(process.execPath, [path.join(here, '../gateway/server.mjs')], {
    env: {
      PATH: process.env.PATH,
      HOME: homedir(),
      UPSTREAM_BASE_URL: 'https://api.together.xyz/v1',
      UPSTREAM_API_KEY: together(),
      // The tokens file ws.mjs keeps, reloaded on a change; each workspace's door socket.
      GATEWAY_TOKENS_FILE: path.join(ws.HOME, 'gateway-tokens'),
      GATEWAY_DOOR_DIR: ws.GATEWAY_DOORS,
      GATEWAY_MODELS: 'general=zai-org/GLM-5.3-Flash',
      GATEWAY_PORT: String(GW_PORT),
      GATEWAY_DB: path.join(run, 'usage.db'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  gateway.stdout.on('data', (d) => (gatewayLog += d))
  gateway.stderr.on('data', (d) => (gatewayLog += d))
  for (let i = 0; i < 50 && !gatewayLog.includes('"event":"start"'); i++) await new Promise((r) => setTimeout(r, 100))
  if (!gatewayLog.includes('"event":"start"')) throw new Error('the gateway did not start')
}

// ---------------------------------------------------------------- probes run inside a VM

const NET_PROBE = String.raw`
import json, os, socket, errno
def tcp(host, port, fam=socket.AF_INET):
    s = socket.socket(fam, socket.SOCK_STREAM); s.settimeout(3)
    try:
        s.connect((host, port)); return "OPEN"
    except OSError as e:
        return errno.errorcode.get(e.errno, str(e)) if e.errno else type(e).__name__
    finally:
        s.close()
out = {}
out["interfaces"] = sorted(l.split(":")[0].strip() for l in open("/proc/net/dev").read().splitlines()[2:])
out["ipv4_routes"] = len(open("/proc/net/route").read().splitlines()) - 1
try:
    out["ipv6_routes"] = [l for l in open("/proc/net/ipv6_route").read().splitlines() if not l.split()[-1] == "lo"]
except OSError:
    out["ipv6_routes"] = []
targets = {
  "internet 1.1.1.1:443": ("1.1.1.1", 443), "internet 8.8.8.8:53": ("8.8.8.8", 53),
  "internet 17.253.144.10:80 (apple)": ("17.253.144.10", 80),
  "vmnet host 192.168.64.1:22": ("192.168.64.1", 22), "vmnet host 192.168.64.1:${GW_PORT} (gateway)": ("192.168.64.1", ${GW_PORT}),
  "host-only 10.77.1.1:22": ("10.77.1.1", 22), "mini LAN 171.66.240.175:22": ("171.66.240.175", 22),
  "mini LAN 171.66.240.175:1234 (BlueBubbles)": ("171.66.240.175", 1234), "tailnet 100.95.51.98:1234": ("100.95.51.98", 1234),
  "tailnet 100.95.51.98:${GW_PORT} (gateway)": ("100.95.51.98", ${GW_PORT}), "default-network peer 192.168.64.3:22": ("192.168.64.3", 22),
}
out["tcp"] = {k: tcp(*v) for k, v in targets.items()}
out["tcp6 2606:4700:4700::1111:443"] = tcp("2606:4700:4700::1111", 443, socket.AF_INET6)
try:
    socket.getaddrinfo("example.com", 443); out["dns"] = "RESOLVED"
except OSError as e:
    out["dns"] = type(e).__name__
u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    u.sendto(b"x", ("8.8.8.8", 53)); out["udp 8.8.8.8:53"] = "SENT"
except OSError as e:
    out["udp 8.8.8.8:53"] = errno.errorcode.get(e.errno, str(e))
opened = []
for p in range(1, 65536):
    s = socket.socket(); s.settimeout(0.2)
    # A connect that lands on its own source port is Linux's TCP self-connect, not a listener.
    if s.connect_ex(("127.0.0.1", p)) == 0 and s.getsockname() != s.getpeername(): opened.append(p)
    s.close()
out["loopback_open"] = opened
listen = set()
for f in ("/proc/net/tcp", "/proc/net/tcp6"):
    try:
        for l in open(f).read().splitlines()[1:]:
            parts = l.split()
            if parts[3] == "0A": listen.add(parts[1])
    except OSError:
        pass
out["listen_table"] = sorted(listen)
out["unix_sockets"] = sorted(set(l.split()[-1] for l in open("/proc/net/unix").read().splitlines()[1:] if len(l.split()) > 7 and l.split()[-1].startswith("/")))
print(json.dumps(out))
`

const GATEWAY_PROBE = String.raw`
import json, os, socket, urllib.request
def get(path, token=None):
    req = urllib.request.Request("http://127.0.0.1:4180" + path, headers={"Authorization": "Bearer " + token} if token else {})
    try:
        r = urllib.request.urlopen(req, timeout=10); return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")
def raw(data):
    s = socket.create_connection(("127.0.0.1", 4180), timeout=10); s.sendall(data)
    got = b""
    while True:
        c = s.recv(65536)
        if not c: break
        got += c
    s.close(); return got.split(b"\r\n", 1)[0].decode("latin-1")
out = {}
out["models_with_token"] = get("/v1/models", os.environ["BOX_API_KEY"])
out["models_without_token"] = get("/v1/models")[0]
out["proxy_request"] = raw(b"GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n")
out["connect_tunnel"] = raw(b"CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nConnection: close\r\n\r\n")
out["host_header"] = raw(b"GET /v1/models HTTP/1.1\r\nHost: 127.0.0.1:1234\r\nConnection: close\r\n\r\n")
print(json.dumps(out))
`

const LIMITS_PROBE = String.raw`
import json, os
st = os.statvfs("/work")
print(json.dumps({"nproc": os.cpu_count(), "cpu_max": open("/sys/fs/cgroup/cpu.max").read().strip(),
  "mem_total": int(open("/proc/meminfo").read().split("MemTotal:")[1].split()[0]) * 1024,
  "work_size": st.f_blocks * st.f_frsize, "uid": os.getuid(),
  "cap_eff": [l.split()[1] for l in open("/proc/self/status") if l.startswith("CapEff")][0]}))
`

// Every directory on the image, outside /work and the /tmp tmpfs: a file is tried in each, and the ones that took it are listed. Plus any setuid or
// setgid file anywhere on the image.
const WRITABLE_PROBE = String.raw`
import json, os, stat
skip = ("/proc", "/sys", "/dev", "/work", "/tmp", "/.cz-init")
wrote, suid = [], []
for d, dirs, fs in os.walk("/"):
    dirs[:] = [x for x in dirs if not os.path.join(d, x).startswith(skip)]
    for f in fs:
        try:
            if os.lstat(os.path.join(d, f)).st_mode & (stat.S_ISUID | stat.S_ISGID): suid.append(os.path.join(d, f))
        except OSError: pass
    try:
        fd = os.open(os.path.join(d, ".ola-probe"), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd); os.unlink(os.path.join(d, ".ola-probe")); wrote.append(d)
    except OSError: pass
print(json.dumps({"wrote": wrote, "suid": suid}))
`

// Opens 48 connections through the door at once, each with a request the gateway is still
// waiting to finish (so none is closed by an answer), and counts which the door kept open
// and which it closed at once; then lets them go and asks once more.
const DOOR_FLOOD_PROBE = String.raw`
import json, select, socket, time
conns = []
for i in range(48):
    s = socket.create_connection(("127.0.0.1", 4180), timeout=5)
    s.sendall(b"GET /v1/models HTTP/1.1\r\nHost: gw\r\n")
    conns.append(s)
time.sleep(0.5)
held = refused = 0
for s in conns:
    r, _, _ = select.select([s], [], [], 0)
    if r and s.recv(1) == b"": refused += 1
    else: held += 1
for s in conns: s.close()
time.sleep(1)
s = socket.create_connection(("127.0.0.1", 4180), timeout=5)
s.sendall(b"GET /v1/models HTTP/1.1\r\nHost: gw\r\nConnection: close\r\n\r\n")
print(json.dumps({"held": held, "refused": refused, "after": s.recv(12).decode("latin-1")}))
`

// Touches every page of `mib` MiB; prints ALLOCATED if the VM let it.
const ALLOC = (mib) => `x = bytearray(${mib} * 1048576)\nfor i in range(0, len(x), 4096): x[i] = 1\nprint("ALLOCATED")`
// Writes until the disk is full or `mib` MiB are written; prints how far it got and why it stopped.
const FILL = (mib) => String.raw`
import json, os
n = 0; why = "wrote all"
try:
    with open("/work/fill.bin", "wb") as f:
        for _ in range(${mib}):
            f.write(b"\0" * 1048576); n += 1
        f.flush(); os.fsync(f.fileno())
except OSError as e:
    why = os.strerror(e.errno)
os.unlink("/work/fill.bin")
print(json.dumps({"mib": n, "stopped": why}))
`

// ---------------------------------------------------------------- the run

const destroyAll = async () => {
  for (const id of [A, B, C]) if (ws.inspect(id) || ws.volumeOf(id)) await ws.destroy(id, { confirm: id }).catch(() => {})
}

try {
  if (spawnSync(ws.CONTAINER, ['image', 'inspect', ws.IMAGE]).status !== 0) ws.buildImage()
  await destroyAll() // leftovers from an interrupted run
  rmSync(ws.HOME, { recursive: true, force: true })

  // -------- the tokens file keeps the callers it does not own (Bart's `bart` host caller)
  // A foreign entry, written as ola-bart.sh writes it (with odd spacing, which must survive byte
  // for byte), and a stale `ws-` entry with no workspace behind it, which must not.
  mkdirSync(ws.HOME, { recursive: true, mode: 0o700 })
  const tokFile = path.join(ws.HOME, 'gateway-tokens')
  const hostTok = `chk-host-${Math.random().toString(36).slice(2)}-0000000000000000`
  const foreign = [`bart:${hostTok}`, ` app.x:${hostTok}-second`]
  writeFileSync(tokFile, `GATEWAY_TOKENS=ws-gone:${hostTok}-stale-entry,${foreign.join(',')}\n`, { mode: 0o600 })
  const tokEntries = () => readFileSync(tokFile, 'utf8').trim().slice('GATEWAY_TOKENS='.length).split(',')

  // -------- create, and the refusals
  let t0 = Date.now()
  await ws.create(A)
  measured.create_s = (Date.now() - t0) / 1000
  await ws.create(B, { memory: '1g', disk: '1g', cpus: 1 })
  await ws.create(C, { memory: '512m', disk: '1g', cpus: 1 })
  for (const [flag, value] of [['memory', '7g'], ['disk', '60g'], ['cpus', 5]]) {
    const r = await ws.create(`${PRE}chk-over`, { [flag]: value }).then(() => 'created', (e) => e.message)
    t(`create refuses --${flag} ${value} (above the ceiling)`, r !== 'created' && !ws.inspect(`${PRE}chk-over`), r)
  }
  {
    const e = tokEntries()
    t('tokens file: creates keep the host callers byte for byte and drop a stale ws- entry', foreign.every((f) => e.includes(f)) && !e.some((x) => x.startsWith('ws-gone:')) && [A, B, C].every((id) => e.some((x) => x.startsWith(`ws-${id}:`))), `${e.length} entries`)
  }
  await startGateway()
  {
    const r = await new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port: GW_PORT, path: '/v1/models', headers: { authorization: `Bearer ${hostTok}` } }, (res) => (res.resume(), resolve(res.statusCode)))
      req.on('error', () => resolve(-1))
    })
    t('tokens file: the gateway accepts the kept host caller', r === 200, `status ${r}`)
  }

  await ws.waitForRoom([A, B, C], 2) // the check runs two VMs at a time
  t0 = Date.now()
  const startA = await ws.start(A)
  measured.start_s = startA.ms / 1000
  await ws.start(B)
  const third = await ws.start(C).then(() => 'started', (e) => e.message)
  t('a third workspace is refused while 2 run (OLA_MAX_RUNNING=2)', third !== 'started', third)
  ws.stop(C)

  // -------- host-side shape
  for (const id of [A, B]) {
    const c = ws.inspect(id)
    const cfg = c.configuration
    t(`${id}: attached to no network`, (cfg.networks || []).length === 0 && !JSON.stringify(c.status || {}).match(/\d+\.\d+\.\d+\.\d+/), `networks: ${(cfg.networks || []).length}`)
    const mounts = JSON.stringify(cfg.mounts || [])
    const sockets = JSON.stringify(cfg.sockets || cfg.publishedSockets || [])
    const other = id === A ? B : A
    t(`${id}: mounts only its own volume and door`, mounts.includes(`ola-${id}`) && mounts.includes(`/ws/${id}/gateway.sock`) && !mounts.includes(`ola-${other}`) && !mounts.includes(`/ws/${other}/`) && (cfg.mounts || []).filter((m) => !m.type?.tmpfs).length === 2, (cfg.mounts || []).map((m) => `${Object.keys(m.type || {})[0]} ${m.destination}`).join(', '))
    // opencode is reached through the desk (container exec), so nothing is published.
    t(`${id}: publishes no socket; its desk (container exec) is open`, (sockets === '[]' || sockets === '{}') && Boolean(ws.deskPid(id)), sockets)
  }
  const modes = [ws.HOME, path.join(ws.HOME, 'ws', A), path.join(ws.HOME, 'ws', A, 'secrets.env'), path.join(ws.HOME, 'gateway-tokens')].map((f) => (statSync(f).mode & 0o777).toString(8))
  t('host state: folders 700, secrets 600', modes.join(' ') === '700 700 600 600', modes.join(' '))
  t('opencode: 401 without the password, 200 with it', (await ws.opencodeRequest(A, '/api/info', { auth: false })) === 401 && (await ws.opencodeRequest(A, '/api/info')) === 200)

  // -------- 1. the gateway, and only the gateway
  const g = insideJSON(A, GATEWAY_PROBE)
  t('inside: the gateway answers with the workspace token', g.models_with_token?.[0] === 200 && g.models_with_token[1].data.some((m) => m.id === 'general'), JSON.stringify(g.models_with_token ?? g.error).slice(0, 120))
  t('inside: the gateway refuses without a token', g.models_without_token === 401)
  // Another workspace's token, handed to this one (from stdin, never on a command line): refused
  // through this door. The gateway binds each token to its own workspace's door.
  {
    const probe = 'import sys, urllib.request\nreq = urllib.request.Request("http://127.0.0.1:4180/v1/models", headers={"Authorization": "Bearer " + sys.stdin.read().strip()})\ntry:\n    print(urllib.request.urlopen(req, timeout=10).status)\nexcept urllib.error.HTTPError as e:\n    print(e.code)\n'
    const tryToken = (token) => spawnSync(ws.CONTAINER, ['exec', '-i', ws.names(A).container, 'python3', '-I', '-c', probe], { input: token, encoding: 'utf8' }).stdout.trim()
    const theirs = tryToken(ws.secrets(B).BOX_API_KEY)
    const own = tryToken(ws.secrets(A).BOX_API_KEY)
    t(`inside: ${B}'s token through ${A}'s door is refused; ${A}'s own works`, theirs === '401' && own === '200', `theirs ${theirs}, own ${own}`)
  }
  for (const k of ['proxy_request', 'host_header']) t(`inside: a ${k.replace('_', ' ')} through the door still lands on the gateway`, /^HTTP\/1\.1 (401|404)/.test(g[k] || ''), g[k])
  // Node's server drops a CONNECT it has no handler for: no tunnel, the connection just closes.
  t('inside: a CONNECT through the door opens no tunnel', !/^HTTP\/1\.[01] 200/.test(g.connect_tunnel ?? 'HTTP/1.1 200'), g.connect_tunnel === '' ? 'the gateway closed the connection' : g.connect_tunnel)

  // -------- 2. nothing else
  const n = insideJSON(A, NET_PROBE, { timeout: 300_000 })
  t('inside: the only interface is loopback', JSON.stringify(n.interfaces) === '["lo"]', JSON.stringify(n.interfaces))
  t('inside: no IPv4 or IPv6 route', n.ipv4_routes === 0 && (n.ipv6_routes || []).length === 0, `${n.ipv4_routes} v4, ${(n.ipv6_routes || []).length} v6`)
  for (const [k, v] of Object.entries(n.tcp || {})) t(`inside: cannot reach ${k}`, v !== 'OPEN', v)
  t('inside: cannot reach the internet over IPv6', n['tcp6 2606:4700:4700::1111:443'] !== 'OPEN', n['tcp6 2606:4700:4700::1111:443'])
  t('inside: DNS does not resolve', n.dns !== 'RESOLVED', n.dns)
  t('inside: UDP cannot be sent out', n['udp 8.8.8.8:53'] !== 'SENT', n['udp 8.8.8.8:53'])
  t('inside: on loopback only our two bridges listen (4096 opencode, 4180 door)', JSON.stringify(n.loopback_open) === '[4096,4180]', JSON.stringify(n.loopback_open))
  // The kernel's own table of listening TCP sockets (every user's): 127.0.0.1:4096 and :4180 only.
  t("inside: the kernel's listen table holds only those two", JSON.stringify(n.listen_table) === '["0100007F:1000","0100007F:1054"]', JSON.stringify(n.listen_table))
  measured.unix_sockets_inside = n.unix_sockets
  // Another workspace: neither has an address, so there is nothing to connect to; and B's
  // own probe sees the same seal from its side.
  const nb = insideJSON(B, NET_PROBE, { timeout: 300_000 })
  t(`${B} (the other workspace) has the same seal`, JSON.stringify(nb.interfaces) === '["lo"]' && Object.values(nb.tcp || { x: 'OPEN' }).every((v) => v !== 'OPEN'))
  writeFileSync(path.join(run, 'secret-of-b.txt'), 'made-up marker for workspace b\n')
  await ws.upload(B, [path.join(run, 'secret-of-b.txt')])
  const peek = inside(A, `import os\nfound=[os.path.join(d,f) for top in ["/"] for d,_,fs in os.walk(top) if not d.startswith(("/proc","/sys")) for f in fs if f=="secret-of-b.txt"]\nprint(found)`)
  t(`${A} cannot find ${B}'s file anywhere on its disk`, peek.out.trim() === '[]', peek.out.trim() || peek.err.trim().split('\n').pop())

  // -------- 3. limits
  const la = insideJSON(A, LIMITS_PROBE)
  t(`${A}: CPU quota is 4 CPUs`, la.cpu_max === '400000 100000', `cgroup cpu.max ${la.cpu_max}; the VM shows ${la.nproc} vCPUs`)
  t(`${A}: memory is 6 GiB`, la.mem_total > 5.5 * GIB && la.mem_total <= 6 * GIB, `MemTotal ${(la.mem_total / GIB).toFixed(2)} GiB`)
  t(`${A}: /work is 50 GiB`, la.work_size > 48 * GIB && la.work_size <= 50 * GIB, `${(la.work_size / GIB).toFixed(1)} GiB`)
  t(`${A}: runs as uid 1000 with no capabilities`, la.uid === 1000 && /^0+$/.test(la.cap_eff), `uid ${la.uid}, CapEff ${la.cap_eff}`)
  const lb = insideJSON(B, LIMITS_PROBE)
  t(`${B}: CPU quota is 1 CPU`, lb.cpu_max === '100000 100000', lb.cpu_max)
  const alloc = inside(B, ALLOC(1536))
  t(`${B}: touching 1.5 GiB in a 1 GiB workspace is stopped`, !alloc.out.includes('ALLOCATED'), `exit ${alloc.code}${alloc.err.includes('MemoryError') ? ', MemoryError' : alloc.code === 137 ? ', killed' : ''}`)
  const small = inside(B, ALLOC(256))
  t(`${B}: 256 MiB fits, and the workspace survived`, small.out.includes('ALLOCATED') && (await ws.opencodeRequest(B, '/api/info')) === 200)
  const fill = insideJSON(B, FILL(1300), { timeout: 300_000 })
  t(`${B}: writing past its 1 GiB volume fails`, fill.stopped && fill.stopped !== 'wrote all' && fill.mib < 1024, `${fill.mib} MiB written, then: ${fill.stopped}`)

  const madeUpPath = path.join(run, 'made-up-notes.txt')
  writeFileSync(madeUpPath, 'invented notes for the check\n')
  // -------- the review of 2026-11-16: the root is read-only, no setuid, ids and names
  const w = insideJSON(A, WRITABLE_PROBE, { timeout: 120_000 })
  t(`${A}: nothing outside /work and /tmp takes a file (the root is read-only)`, Array.isArray(w.wrote) && w.wrote.length === 0, w.error || JSON.stringify(w.wrote))
  t(`${A}: no setuid or setgid program in the image`, Array.isArray(w.suid) && w.suid.length === 0, w.error || JSON.stringify(w.suid))
  const past = insideJSON(B, String.raw`
import json, os
n = 0; why = "wrote all"
try:
    with open("/var/tmp/past.bin", "wb") as f:
        for _ in range(64): f.write(b"\1" * 1048576); n += 1
        f.flush(); os.fsync(f.fileno())
except OSError as e:
    why = os.strerror(e.errno)
print(json.dumps({"mib": n, "stopped": why}))
`)
  t(`${B}: writing outside /work, past the volume's limit, fails at once`, past.mib === 0 && past.stopped !== 'wrote all', `${past.mib} MiB, then: ${past.stopped}`)
  inside(B, 'open("/tmp/marker", "w").write("x")')
  ws.stop(B)
  await ws.start(B)
  const kept = inside(B, 'import os; print(os.path.exists("/tmp/marker"))')
  t(`${B}: nothing written outside /work survives a stop`, kept.out.trim() === 'False', kept.out.trim() || kept.err.trim().split('\n').pop())
  const rdirs = ws.runtimeDirs(A)
  t(`${A}: the runtime's folders (container config with its environment, volume image) are mode 700`, rdirs.length === 2 && rdirs.every((d) => (statSync(d).mode & 0o777) === 0o700), rdirs.map((d) => (statSync(d).mode & 0o777).toString(8)).join(' '))
  const badIds = ['../chk-a', '-rf', '--help', 'chk-a/../chk-b', 'CHK-A', 'a']
  const idRefusals = []
  for (const bad of badIds)
    for (const [name, f] of Object.entries({ start: () => ws.start(bad), stop: () => ws.stop(bad), status: () => ws.status(bad), files: () => ws.files(bad), upload: () => ws.upload(bad, [madeUpPath]), destroy: () => ws.destroy(bad, { confirm: bad }) }))
      idRefusals.push(await Promise.resolve().then(f).then(() => `${name} ${bad}: accepted`, (e) => (/workspace id is/.test(e.message) ? null : `${name} ${bad}: ${e.message}`)))
  t('every command refuses an id that is not a workspace id, before anything runs', idRefusals.every((r) => r === null), idRefusals.filter(Boolean).join('; ').slice(0, 200) || `${idRefusals.length} refusals`)
  symlinkSync(madeUpPath, path.join(run, 'link.txt'))
  t('upload: a symlink on the host is refused, not followed', (await ws.upload(A, [path.join(run, 'link.txt')]).then(() => 'uploaded', (e) => e.message)) !== 'uploaded')
  writeFileSync(path.join(run, '--replace'), 'x')
  const optName = await ws.upload(A, [path.join(run, '--replace')]).then(() => 'uploaded', (e) => e.message)
  t('upload: a name that looks like an option is refused on the host', /upload name is a plain file name/.test(optName), optName)
  const flood = insideJSON(A, DOOR_FLOOD_PROBE, { timeout: 120_000 })
  t('door: 48 connections at once, 32 held, the rest refused, and it answers again after', flood.held === 32 && flood.refused === 16 && /^HTTP\/1\.1 /.test(flood.after || '') && ws.doorPid(A), flood.error || `held ${flood.held}, refused ${flood.refused}, after: ${flood.after}`)

  // -------- upload and files
  const madeUp = path.join(run, 'made-up-notes.txt')
  writeFileSync(madeUp, 'invented notes for the check\n')
  const up = await ws.upload(A, [madeUp])
  const list = ws.files(A)
  const seen = list.find((f) => f.path === 'made-up-notes.txt')
  t('upload: the file is in /work with the same size and sha256', seen && seen.sha256 === up[0].sha256 && seen.size === up[0].size)
  t('upload: a second upload of the same name is refused', (await ws.upload(A, [madeUp]).then(() => 'uploaded', (e) => e.message)) !== 'uploaded')
  writeFileSync(path.join(run, '.hidden'), 'x')
  t('upload: a name starting with a dot is refused', (await ws.upload(A, [path.join(run, '.hidden')]).then(() => 'uploaded', (e) => e.message)) !== 'uploaded')

  // -------- the door restarts under a running VM
  process.kill(ws.doorPid(A), 'SIGTERM')
  await new Promise((r) => setTimeout(r, 300))
  const down = insideJSON(A, GATEWAY_PROBE)
  await ws.start(A) // reopens the door
  const back = insideJSON(A, GATEWAY_PROBE)
  t('door: with it closed the gateway is unreachable; reopened, it answers again', down.models_with_token?.[0] !== 200 && back.models_with_token?.[0] === 200, `closed: ${down.error ? 'no answer' : down.models_with_token?.[0]}, reopened: ${back.models_with_token?.[0] ?? back.error}`)

  // -------- 4. the real task, inside the VM
  if (LIVE) {
  const hostWork = path.join(run, 'survey')
  mkdirSync(hostWork)
  const made = spawnSync('python3', [path.join(spike, 'make-survey.py'), hostWork], { encoding: 'utf8' })
  writeFileSync(path.join(run, 'truth.json'), made.stdout) // the answers never enter the VM
  await ws.upload(A, [path.join(hostWork, 'survey.csv')])
  const bridge = net.createServer((c) => {
    const u = net.connect(ws.paths(A).opencode)
    c.pipe(u).pipe(c)
    c.on('error', () => u.destroy())
    u.on('error', () => c.destroy())
  })
  await new Promise((r) => bridge.listen(0, '127.0.0.1', r))
  const client = OpenCode.make({ baseUrl: `http://127.0.0.1:${bridge.address().port}`, headers: { authorization: `Basic ${Buffer.from(`opencode:${ws.secrets(A).OPENCODE_PASSWORD}`).toString('base64')}` } })
  const events = new Map()
  ;(async () => {
    try {
      for await (const ev of client.event.subscribe()) events.set(ev.type, (events.get(ev.type) || 0) + 1)
    } catch {}
  })()
  t0 = Date.now()
  let taskError = null
  try {
    const session = await client.session.create({ location: { directory: '/work' } })
    await client.session.prompt({ sessionID: session.id, text: readFileSync(path.join(spike, 'task-survey.txt'), 'utf8') })
    await Promise.race([client.session.wait({ sessionID: session.id }), new Promise((_, rej) => setTimeout(() => rej(new Error('no end after 300 s')), 300_000))])
  } catch (e) {
    taskError = e?.message || String(e)
  }
  measured.task_s = (Date.now() - t0) / 1000
  for (const f of ['survey_clean.csv', 'summary.md']) {
    const r = spawnSync(ws.CONTAINER, ['exec', ws.names(A).container, 'cat', `/work/${f}`], { encoding: 'utf8' })
    if (r.status === 0) writeFileSync(path.join(hostWork, f), r.stdout)
  }
  const checked = spawnSync('python3', [path.join(spike, 'check-survey.py'), hostWork, path.join(run, 'truth.json')], { encoding: 'utf8' })
  const lastLine = checked.stdout.trim().split('\n').pop()
  t('the survey task, run by opencode inside the VM through the gateway, passes its checks', !taskError && checked.status === 0, taskError || lastLine)
  if (checked.status !== 0) console.log(checked.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n'))
  bridge.close()
  const lines = gatewayLog.split('\n').filter((l) => l.includes(`"caller":"ws-${A}"`) && l.includes('"route":"chat"')).map((l) => JSON.parse(l))
  measured.task_model_requests = lines.length
  measured.task_tokens = lines.reduce((s, l) => s + (l.tokens_in || 0) + (l.tokens_out || 0), 0)
  measured.events = Object.fromEntries(events)
  }
  // -------- rotation (2026-11-16): revocation needs no VM slot, a failure closes, a kill -9 resumes
  {
    await ws.waitForRoom([A, B, C], 2)
    const cli = (args, extra = {}) => spawnSync(process.execPath, [path.join(here, 'ws.mjs'), ...args], { env: { ...process.env, ...extra }, encoding: 'utf8' })
    const line = (r) => {
      try {
        return JSON.parse(r.stdout.trim().split('\n').pop())
      } catch {
        return { state: `no answer (${(r.stderr || '').trim().split('\n').pop()})` }
      }
    }
    const ask = (socketPath, p, auth) =>
      new Promise((resolve) => {
        const req = http.request({ socketPath, path: p, headers: { authorization: auth }, timeout: 5000 }, (res) => (res.resume(), resolve(res.statusCode)))
        req.on('error', () => resolve(0))
        req.on('timeout', () => (req.destroy(), resolve(-1)))
        req.end()
      })
    // The running gateway's answer to a token, through that workspace's own door socket (the only
    // place a workspace token is accepted); opencode's to a password, through the desk (0: nothing answers).
    const gwAnswer = (id, token) => ask(path.join(ws.GATEWAY_DOORS, `ws-${id}.sock`), '/v1/models', `Bearer ${token}`)
    const deskAnswer = (id, pw) => ask(ws.paths(id).opencode, '/api/info', `Basic ${Buffer.from(`opencode:${pw}`).toString('base64')}`)
    const insideToken = (id, token) => spawnSync(ws.CONTAINER, ['exec', '-i', ws.names(id).container, 'python3', '-I', '-c', 'import sys, urllib.request\nreq = urllib.request.Request("http://127.0.0.1:4180/v1/models", headers={"Authorization": "Bearer " + sys.stdin.read().strip()})\ntry:\n    print(urllib.request.urlopen(req, timeout=10).status)\nexcept urllib.error.HTTPError as e:\n    print(e.code)\n'], { input: token, encoding: 'utf8' }).stdout.trim()
    const envHolds = (id, token) => (ws.inspect(id)?.configuration?.initProcess?.environment ?? []).includes(`BOX_API_KEY=${token}`)
    // A container CLI that fails one subcommand for one container (FAIL_ON, FAIL_NAME), as a stuck runtime would.
    const fake = path.join(run, 'container-failing')
    writeFileSync(fake, `#!/bin/sh\nif [ "$1" = "$FAIL_ON" ]; then for a in "$@"; do [ "$a" = "$FAIL_NAME" ] && { echo "Error: injected failure" >&2; exit 1; }; done; fi\nexec ${ws.CONTAINER} "$@"\n`, { mode: 0o700 })

    // At the cap: A and B run; the rotation of B may run only one (OLA_MAX_RUNNING=1), so B cannot start again.
    let old = ws.secrets(B)
    const r = line(cli(['rotate', B, '--json'], { OLA_MAX_RUNNING: '1' }))
    let now = ws.secrets(B)
    const st = (await ws.status(B))[0]
    const got = { state: r.state, gateway: r.gateway, oldToken: await gwAnswer(B, old.BOX_API_KEY), oldPassword: await deskAnswer(B, old.OPENCODE_PASSWORD), container: st.state }
    t(`rotate ${B} with the machine at its cap: new secrets in force, the old token refused by the gateway, the old password reaches nothing, left stopped`, r.state === 'deferred' && r.busy && r.gateway === 'refused' && now.BOX_API_KEY !== old.BOX_API_KEY && now.OPENCODE_PASSWORD !== old.OPENCODE_PASSWORD && got.oldToken === 401 && got.oldPassword === 0 && st.state === 'stopped' && !envHolds(B, old.BOX_API_KEY), JSON.stringify(got))
    const busy = cli(['start', B], { OLA_MAX_RUNNING: '1' })
    await ws.start(B) // a slot is free under this process's cap of 2: what the front desk's wake does
    const woke = { atCap: busy.status, newPassword: await deskAnswer(B, now.OPENCODE_PASSWORD), oldPassword: await deskAnswer(B, old.OPENCODE_PASSWORD), newInside: insideToken(B, now.BOX_API_KEY), oldInside: insideToken(B, old.BOX_API_KEY) }
    t(`${B}: start refuses with exit 3 while the machine is full; with a slot free it wakes, the new password and token work and the old ones are refused`, woke.atCap === ws.EXIT.MACHINE_FULL && woke.newPassword === 200 && woke.oldPassword === 401 && woke.newInside === '200' && woke.oldInside === '401', JSON.stringify(woke))

    // The old container cannot be removed: closed, its old token still refused, nothing starts it; reopen makes it safe.
    old = ws.secrets(C)
    const c1 = line(cli(['rotate', C, '--json'], { OLA_CONTAINER_BIN: fake, FAIL_ON: 'rm', FAIL_NAME: ws.names(C).container }))
    const closedRow = (await ws.status(C))[0]
    const refusedStart = await ws.start(C).then(() => 'started', (e) => e.code ?? e.message)
    const c1got = { state: c1.state, oldToken: await gwAnswer(C, old.BOX_API_KEY), closed: closedRow.closed, start: refusedStart }
    t(`${C}: a container that cannot be removed leaves the workspace closed, its old token refused, and start refusing it`, c1.state === 'closed' && c1got.oldToken === 401 && closedRow.closed === true && refusedStart === 'CLOSED', JSON.stringify(c1got))
    const re = line(cli(['reopen', C, '--json']))
    const reRow = (await ws.status(C))[0]
    t(`${C}: reopen rotates again, removes the old container and leaves it stopped and open`, re.state === 'stopped' && !reRow.closed && reRow.state === 'stopped' && ws.secrets(C).BOX_API_KEY !== old.BOX_API_KEY && !envHolds(C, old.BOX_API_KEY) && (await gwAnswer(C, old.BOX_API_KEY)) === 401, `${re.state}, ${reRow.state}`)
    // The container cannot be made again: the revocation stands, and start makes it.
    old = ws.secrets(C)
    const c2 = line(cli(['rotate', C, '--json'], { OLA_CONTAINER_BIN: fake, FAIL_ON: 'create', FAIL_NAME: ws.names(C).container }))
    const gone = (await ws.status(C))[0].state
    t(`${C}: a container that cannot be made again: the old token is refused, and the workspace waits with no container for start to make it`, c2.state === 'stopped' && c2.container === false && gone === 'no container' && (await gwAnswer(C, old.BOX_API_KEY)) === 401, `${c2.state}, ${gone}`)
    ws.stop(B) // C needs B's slot to show the wake
    await ws.start(C)
    t(`${C}: start makes the missing container from the new secrets and opencode answers to the new password only`, (await deskAnswer(C, ws.secrets(C).OPENCODE_PASSWORD)) === 200 && (await deskAnswer(C, old.OPENCODE_PASSWORD)) === 401)
    ws.stop(C)
    await ws.start(B)

    // kill -9 after each step of a running workspace's rotation; then run it again (after "stopped": a wake instead).
    for (const s of ['pending', 'tokens', 'stopped', 'removed', 'renamed', 'created']) {
      old = ws.secrets(B)
      const k = cli(['rotate', B, '--json'], { OLA_TEST_KILL_AT: s })
      // From "tokens" on the gateway refuses the old token; from "stopped" on the old password reaches nothing.
      let tok = 0
      for (let i = 0; i < 50 && (tok = await gwAnswer(B, old.BOX_API_KEY)) !== 401 && s !== 'pending'; i++) await new Promise((res) => setTimeout(res, 100))
      const pw = await deskAnswer(B, old.OPENCODE_PASSWORD)
      const between = { killed: k.signal, oldToken: tok, oldPassword: pw }
      const safe = k.signal === 'SIGKILL' && (s === 'pending' || tok === 401) && (['pending', 'tokens'].includes(s) || pw === 0)
      const again = s === 'stopped' ? await ws.start(B).then(() => ({ state: 'running' }), (e) => ({ state: e.message })) : line(cli(['rotate', B, '--json']))
      now = ws.secrets(B)
      const after = { state: again.state, oldToken: await gwAnswer(B, old.BOX_API_KEY), oldPassword: await deskAnswer(B, old.OPENCODE_PASSWORD), newPassword: await deskAnswer(B, now.OPENCODE_PASSWORD), pending: existsSync(ws.paths(B).next) }
      t(`kill -9 after "${s}", then ${s === 'stopped' ? 'a wake' : 'rotate again'}: ${s === 'pending' ? 'nothing in force had changed' : s === 'tokens' ? 'the old token was refused' : 'both old secrets were refused'}, and it completes`, safe && after.state === 'running' && after.oldToken === 401 && after.oldPassword === 401 && after.newPassword === 200 && !after.pending && !envHolds(B, old.BOX_API_KEY), `${JSON.stringify(between)} then ${JSON.stringify(after)}`)
    }
  }

  const st = (await ws.status(A))[0]
  measured.memory_after_task_mib = Math.round(st.memory_used / 1024 ** 2)
  measured.volume_on_host_after_task_mib = Math.round(st.disk_on_host / 1024 ** 2)
  const stb = (await ws.status(B))[0]
  measured.memory_idle_small_ws_mib = Math.round(stb.memory_used / 1024 ** 2)

  // -------- 5. destroy
  for (const id of [A, B, C]) {
    const r = await ws.destroy(id, { confirm: id }).then(() => 'ok', (e) => e.message)
    t(`destroy ${id}: container, volume, its files on disk, state folder and token all gone`, r === 'ok', r)
  }
  const doors = spawnSync('pgrep', ['-f', `(door|desk).mjs ${ws.HOME}`], { encoding: 'utf8' }).stdout.trim()
  t('destroy: no door or desk process left', doors === '', doors)
  const leftovers = ws.listOla().filter((c) => (c.configuration?.id || c.id).startsWith(`ola-${PRE}chk-`))
  t('destroy: no ola-chk container or volume left', leftovers.length === 0 && [A, B, C].every((id) => !ws.volumeOf(id)))
  {
    const e = tokEntries()
    t('tokens file: after every destroy only the host callers are left, unchanged', JSON.stringify(e) === JSON.stringify(foreign), `${e.length} entries`)
  }
} catch (e) {
  t('the check ran to the end', false, `${e?.name}: ${e?.message}`)
} finally {
  await destroyAll()
  if (gateway) gateway.kill('SIGTERM')
}

console.log(`\nmeasured: ${JSON.stringify(measured)}`)
const passed = results.filter(Boolean).length
console.log(`${passed} of ${results.length} checks passed  (files: ${run})`)
process.exit(passed === results.length ? 0 : 1)
