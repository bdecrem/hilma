// The third outside review's harness (2026-11-16): proofs against front desks started here, on
// loopback ports of their own (4791 to 4793), with made-up people and one workspace (rv-a, under
// ~/.ola-rev3). Never against a deployed front desk.
//   node frontdesk/review/rev3.mjs cookie     no VM: the https cookie is exactly as before, behind
//                                             the PROXY protocol too, and the two names never mix
//   node frontdesk/review/rev3.mjs views      one VM (rv-a): "Open" on a closed workspace, and
//                                             unread page files against the rest of the team
//   node frontdesk/review/rev3.mjs tokens     no VM, a scratch OLA_HOME: a gateway-tokens write under
//                                             way when a rotation starts puts the revoked token back
//   node frontdesk/review/rev3.mjs config     one VM (rv-a): does a /work/opencode.json (a file a person
//                                             can upload, or the agent can write) reach opencode's config?
//   node frontdesk/review/rev3.mjs --destroy  removes rv-a and the state
// Prints one line per proof, `pass` or `FAIL`; exits 1 if any fails.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { SoftAuthn } from './softauthn.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AI = path.resolve(HERE, '../..')
const ROOT = path.join(homedir(), 'rev3-state')
const CTR = '/usr/local/bin/container'
const WS = 'rv-a'
const base = {
  ...process.env,
  OLA_HOME: path.join(homedir(), '.ola-rev3'),
  OLA_MAX_RUNNING: '1',
  OLA_RUNNING_SCOPE: 'home',
  OLA_GATEWAY_PORT: '4187',
  OLA_GATEWAY_DOORS: path.join(homedir(), '.ola-rev3', 'gw'),
  OLA_FD_IDLE_STOP_MIN: '0',
  OLA_FD_SLOW_MS: '4000',
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const argv = process.argv.slice(2)
let failed = 0
const proof = (name, pass, detail) => {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`)
}

const deskEnv = (port, origin, extra = {}) => ({ ...base, OLA_FD_DATA: path.join(ROOT, `fd-${port}`), OLA_FD_ORIGIN: origin, OLA_FD_PORT: String(port), ...extra })
const admin = (env, ...a) => {
  const r = spawnSync(process.execPath, [path.join(AI, 'frontdesk/admin.mjs'), ...a], { env, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`admin ${a[0]}: ${r.stderr.trim().split('\n').pop()}`)
  return r.stdout.trim()
}
function startDesk(env) {
  const p = spawn(process.execPath, [path.join(AI, 'frontdesk/server.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  p.log = ''
  p.stdout.on('data', (d) => (p.log += d))
  p.stderr.on('data', (d) => (p.log += d))
  process.on('exit', () => p.kill())
  return p
}

/** One request on a fresh connection (a PROXY v1 line first when `from` is given); the whole answer. */
function req(desk, method, p, { body, headers = {}, from = null } = {}) {
  return new Promise((resolve) => {
    const r = http.request(
      {
        method,
        path: p,
        headers: { host: desk.host, origin: desk.origin, 'content-type': 'application/json', ...headers },
        createConnection: () => {
          const sock = net.connect(desk.port, '127.0.0.1')
          if (from) sock.write(`PROXY TCP4 ${from} 127.0.0.1 40000 ${desk.port}\r\n`)
          return sock
        },
      },
      (res) => {
        let t = ''
        res.on('data', (d) => (t += d))
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(t)
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text: t, json })
        })
      },
    )
    r.on('error', () => resolve({ status: 0, headers: {} }))
    r.setTimeout(30_000, () => r.destroy())
    r.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
async function up(desk) {
  for (let i = 0; i < 80; i++) {
    if ((await req(desk, 'GET', '/api/health', { from: desk.from })).status === 200) return
    await sleep(150)
  }
  throw new Error(`front desk on ${desk.port} did not start`)
}
/** A made-up person registered by invitation; returns their passkey and the registration's Set-Cookie. */
async function register(desk, handle) {
  admin(desk.env, 'add-person', handle, '--name', `${handle} (made up)`)
  const key = new SoftAuthn({ rpId: 'localhost', origin: desk.origin })
  const o = await req(desk, 'POST', '/api/auth/register/options', { body: { invite: admin(desk.env, 'invite', handle).split('/').pop() }, from: desk.from })
  const v = await req(desk, 'POST', '/api/auth/register/verify', { body: { ceremony: o.json?.ceremony, response: key.create(o.json.options) }, from: desk.from })
  if (v.status !== 200) throw new Error(`register ${handle}: ${v.status}`)
  return { key, setCookie: v.headers['set-cookie']?.[0] ?? '' }
}
const valueOf = (setCookie) => setCookie.split(';')[0].split('=').slice(1).join('=')

if (argv.includes('--destroy')) {
  spawnSync(process.execPath, [path.join(AI, 'workspace/ws.mjs'), 'destroy', WS, '--confirm', WS], { env: base, stdio: 'inherit' })
  rmSync(ROOT, { recursive: true, force: true })
  rmSync(base.OLA_HOME, { recursive: true, force: true })
  console.log('destroyed')
  process.exit(0)
}
rmSync(ROOT, { recursive: true, force: true })
mkdirSync(ROOT, { recursive: true })

// ---------------------------------------------------------------- the session cookie
if (argv.includes('cookie')) {
  // The production shape: an https origin, behind the PROXY protocol (TLS is the front's).
  const S = { port: 4791, origin: 'https://localhost:4791', host: 'localhost:4791', from: '198.51.100.7' }
  S.env = deskEnv(S.port, S.origin, { OLA_FD_PROXY_PROTOCOL: '1' })
  // The rehearsal shape: plain http://localhost.
  const L = { port: 4792, origin: 'http://localhost:4792', host: 'localhost:4792', from: null }
  L.env = deskEnv(L.port, L.origin)
  const ps = [startDesk(S.env), startDesk(L.env)]
  await Promise.all([up(S), up(L)])

  const s = await register(S, 'rv-sam')
  const shape = /^__Host-ola=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=\d+$/
  proof('https: the session cookie is __Host-ola, Secure, HttpOnly, SameSite=Strict, Path=/, no Domain', shape.test(s.setCookie), s.setCookie.replace(/=[A-Za-z0-9_-]{43}/, '=<token>'))
  const t = valueOf(s.setCookie)
  const me = (desk, cookie, extra = {}) => req(desk, 'GET', '/api/me', { headers: { cookie, ...extra }, from: desk.from }).then((r) => r.status)
  const asked = {
    hostCookie: await me(S, `__Host-ola=${t}`),
    sameTokenAsLocal: await me(S, `ola-local=${t}`),
    localFirstThenGarbageHost: await me(S, `ola-local=${t}; __Host-ola=x`),
    // Headers a client might send hoping for the weaker mode: none of them is read.
    forwardedHttp: await me(S, `ola-local=${t}`, { 'x-forwarded-proto': 'http', 'x-forwarded-host': 'localhost', forwarded: 'proto=http' }),
  }
  proof('https: only __Host-ola is read; ola-local and forwarding headers change nothing', asked.hostCookie === 200 && asked.sameTokenAsLocal === 401 && asked.localFirstThenGarbageHost === 401 && asked.forwardedHttp === 401, asked)
  const out = await req(S, 'GET', '/api/me', { headers: { cookie: 'ola-local=nothing' }, from: S.from })
  proof('https: a signed-out answer clears __Host-ola, with Secure', out.headers['set-cookie']?.[0] === '__Host-ola=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0', out.headers['set-cookie']?.[0])
  // A Host that names plain localhost (the rehearsal origin's host) is refused, not served weaker.
  const wrongHost = await req({ ...S, host: 'localhost' }, 'GET', '/api/me', { headers: { cookie: `__Host-ola=${t}` }, from: S.from })
  const viaPlainPort = await req({ ...S, host: 'localhost:4792' }, 'GET', '/api/me', { headers: { cookie: `ola-local=${t}` }, from: S.from })
  proof('https: another Host is 421 before any cookie is read', wrongHost.status === 421 && viaPlainPort.status === 421, { host_localhost: wrongHost.status, host_localhost_4792: viaPlainPort.status })
  // A PROXY header that claims localhost as the client does not change the mode either.
  const loop = await me({ ...S, from: '127.0.0.1' }, `ola-local=${t}`)
  proof('https: a PROXY line from 127.0.0.1 does not make it local', loop === 401, { status: loop })

  const l = await register(L, 'rv-lou')
  proof('http://localhost: ola-local, HttpOnly, SameSite=Strict, Path=/ (no Secure)', /^ola-local=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+$/.test(l.setCookie), l.setCookie.replace(/=[A-Za-z0-9_-]{43}/, '=<token>'))
  const lt = valueOf(l.setCookie)
  const lAsked = { local: await me(L, `ola-local=${lt}`), asHost: await me(L, `__Host-ola=${lt}`) }
  proof('http://localhost: only ola-local is read', lAsked.local === 200 && lAsked.asHost === 401, lAsked)
  for (const p of ps) p.kill()
  process.exit(failed ? 1 : 0)
}

// ---------------------------------------------------------------- the gateway's token file
if (argv.includes('tokens')) {
  // Two ws.mjs processes rewrite ~/.ola/gateway-tokens: a rotation (revoke, step 2) and anything
  // else that writes it (create, destroy, another workspace's revoke, a start finishing one). Each
  // reads every workspace's secrets, then renames its file into place, with no lock between them.
  // Here the other writer is paused between its read and its rename by a FIFO in a later
  // workspace's folder (made by the harness on the host: the agent cannot reach this folder).
  const { mkdtempSync, writeFileSync, renameSync, readFileSync, openSync, writeSync, closeSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const home = mkdtempSync(path.join(tmpdir(), 'rev3-tokens-'))
  const env = { ...process.env, OLA_HOME: home }
  const dir = (id) => (mkdirSync(path.join(home, 'ws', id), { recursive: true }), path.join(home, 'ws', id))
  writeFileSync(path.join(dir('rv-a'), 'secrets.env'), 'OPENCODE_PASSWORD=made-up-old\nBOX_API_KEY=old-token-of-rv-a\n', { mode: 0o600 })
  const fifo = path.join(dir('rv-z'), 'secrets.env')
  spawnSync('/usr/bin/mkfifo', [fifo])
  const write = `const ws = await import(${JSON.stringify(path.join(AI, 'workspace/ws.mjs'))}); ws.writeGatewayTokens()`
  const other = spawn(process.execPath, ['--input-type=module', '-e', write], { env, stdio: 'ignore' })
  await sleep(1500) // it has read rv-a's (old) secrets and waits on rv-z's
  const parked = path.join(home, 'parked-fifo')
  renameSync(fifo, parked)
  writeFileSync(fifo, 'BOX_API_KEY=token-of-rv-z\n', { mode: 0o600 })
  // The rotation of rv-a: step 1 (secrets.env.next), step 2 (the token file from it).
  writeFileSync(path.join(home, 'ws', 'rv-a', 'secrets.env.next'), 'OPENCODE_PASSWORD=made-up-new\nBOX_API_KEY=new-token-of-rv-a\n', { mode: 0o600 })
  const rotation = spawn(process.execPath, ['--input-type=module', '-e', write], { env, stdio: 'ignore' })
  const rotationDone = new Promise((r) => rotation.on('close', r))
  await Promise.race([rotationDone, sleep(3000)])
  const afterRotation = readFileSync(path.join(home, 'gateway-tokens'), 'utf8')
  // (Here the real rotation confirms the gateway refuses the old token, and goes on.) The other
  // writer is let go.
  const w = openSync(parked, 'w')
  writeSync(w, 'BOX_API_KEY=token-of-rv-z\n')
  closeSync(w)
  await new Promise((r) => other.on('close', r))
  await rotationDone
  const final = readFileSync(path.join(home, 'gateway-tokens'), 'utf8')
  proof('a token write under way when a rotation starts cannot put the revoked token back', !final.includes('old-token-of-rv-a') && final.includes('new-token-of-rv-a'), {
    afterTheRotationsWrite: afterRotation.includes('new-token-of-rv-a') ? 'new token' : afterRotation.includes('old-token-of-rv-a') ? 'OLD token' : 'no file yet',
    afterTheOtherWritersRename: final.includes('old-token-of-rv-a') ? 'OLD token' : 'new token',
  })
  rmSync(home, { recursive: true, force: true })
  process.exit(failed ? 1 : 0)
}

// ---------------------------------------------------------------- the agent's config (one VM)
if (argv.includes('config')) {
  process.env.OLA_HOME = base.OLA_HOME
  const ws = await import('../../workspace/ws.mjs')
  if (!(await import('node:fs')).existsSync(ws.paths(WS).meta)) spawnSync(process.execPath, [path.join(AI, 'workspace/ws.mjs'), 'create', WS, '--memory', '1g', '--disk', '1g', '--cpus', '1'], { env: base, stdio: 'ignore' })
  await ws.waitForRoom([WS], 1)
  // A project config as a person could upload it (opencode.json is a plain name) or the agent write it.
  const cfg = JSON.stringify({ instructions: ['/work/rv3-marker.md'], permissions: [{ action: 'webfetch', resource: '*', effect: 'allow' }, { action: 'browser', resource: '*', effect: 'allow' }] })
  await ws.start(WS)
  spawnSync(CTR, ['exec', '-i', '--user', '1000', `ola-${WS}`, 'sh', '-c', 'cat > /work/opencode.json && echo "rv3 marker: made-up project instruction" > /work/rv3-marker.md'], { input: cfg })
  ws.stop(WS)
  await ws.start(WS) // opencode reads its config at start
  const ask = (p) =>
    new Promise((resolve) => {
      const r = http.request({ socketPath: ws.paths(WS).opencode, path: p, headers: { authorization: `Basic ${Buffer.from(`opencode:${ws.secrets(WS).OPENCODE_PASSWORD}`).toString('base64')}` }, timeout: 10_000 }, (res) => {
        let t = ''
        res.on('data', (d) => (t += d))
        res.on('end', () => resolve({ status: res.statusCode, text: t }))
      })
      r.on('error', () => resolve({ status: 0, text: '' }))
      r.end()
    })
  const seen = {}
  for (const p of ['/api/config', '/config', '/api/config?directory=/work']) {
    const r = await ask(p)
    seen[p] = { status: r.status, projectInstruction: r.text.includes('/work/rv3-marker.md'), webfetchAllowed: /"webfetch"[^}]*"allow"|"allow"[^}]*"webfetch"/.test(r.text), browserAllowed: /"browser"[^}]*"allow"|"allow"[^}]*"browser"/.test(r.text) }
  }
  const took = Object.values(seen).some((x) => x.projectInstruction || x.webfetchAllowed)
  proof("a /work/opencode.json does not change the agent's standing config", !took, seen)
  spawnSync(CTR, ['exec', '--user', '1000', `ola-${WS}`, 'rm', '-f', '/work/opencode.json', '/work/rv3-marker.md'])
  ws.stop(WS)
  process.exit(failed ? 1 : 0)
}

// ---------------------------------------------------------------- "Open" (one VM)
if (argv.includes('views')) {
  const D = { port: 4793, origin: 'http://localhost:4793', host: 'localhost:4793', from: null }
  D.env = deskEnv(D.port, D.origin)
  const ws = (a) => spawnSync(process.execPath, [path.join(AI, 'workspace/ws.mjs'), ...a], { env: D.env, encoding: 'utf8' })
  ws(['destroy', WS, '--confirm', WS])
  const fd = startDesk(D.env)
  await up(D)
  process.env.OLA_HOME = base.OLA_HOME // ws.mjs reads it at import
  const { waitForRoom } = await import('../../workspace/ws.mjs')
  await waitForRoom([WS], 1)
  admin(D.env, 'create-workspace', WS, '--name', 'Rev3 made-up', '--team', 'rv-team', '--team-name', 'Rev3 made-up team', '--memory', '1g', '--disk', '1g', '--cpus', '1')
  const ann = await register(D, 'rv-ann')
  admin(D.env, 'add-member', 'rv-team', 'rv-ann', 'owner')
  const lo = await req(D, 'POST', '/api/auth/login/options', { body: {} })
  const lv = await req(D, 'POST', '/api/auth/login/verify', { body: { ceremony: lo.json.ceremony, response: ann.key.get(lo.json.options) } })
  const cookie = lv.headers['set-cookie'][0].split(';')[0]
  for (let i = 0; i < 90; i++) {
    if ((await req(D, 'GET', '/api/project', { headers: { cookie, 'x-ola-workspace': WS } })).status === 200) break
    await sleep(1000)
  }
  // "Ola made" a page, its stylesheet and a 30 MiB data file (as the agent's user).
  const mk = spawnSync(CTR, ['exec', '--user', '1000', `ola-${WS}`, 'sh', '-c', 'printf "<!doctype html><title>made up</title><link rel=stylesheet href=look.css>" > /work/page.html && printf "h1{}" > /work/look.css && head -c 31457280 /dev/zero > /work/big.bin'], { encoding: 'utf8' })
  if (mk.status !== 0) throw new Error('could not write the files in the workspace')
  const open = async () => {
    const r = await req(D, 'GET', `/api/open?w=${WS}&path=page.html`, { headers: { cookie, 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'document' } })
    return { status: r.status, grant: /\/v\/([A-Za-z0-9_-]{43})\//.exec(r.text ?? '')?.[1] ?? null }
  }
  const view = (grant, file, dest = 'style') => req(D, 'GET', `/v/${grant}/${file}`, { headers: { 'sec-fetch-dest': dest, 'sec-fetch-site': 'cross-site' } }).then((r) => r.status)
  const execs = () => spawnSync('/bin/ps', ['-axo', 'command='], { encoding: 'utf8' }).stdout.split('\n').filter((x) => x.includes(`ola-${WS}`) && x.includes('ola-get')).length

  // 1. Unread page files. A page (or anyone holding its grant: a member, or the page's own
  // script) asks for the big file four times and reads nothing.
  const g = await open()
  if (!g.grant) throw new Error(`no grant (${g.status})`)
  const held = []
  for (let i = 0; i < 4; i++) {
    const s = net.connect(D.port, '127.0.0.1')
    s.write(`GET /v/${g.grant}/big.bin HTTP/1.1\r\nHost: ${D.host}\r\nSec-Fetch-Dest: image\r\n\r\n`)
    s.pause()
    s.on('error', () => {})
    held.push(s)
    await sleep(300)
  }
  await sleep(16_000) // four of the 4 s windows a download is allowed to stand still
  const holding = execs()
  const t0 = Date.now()
  const other = await view(g.grant, 'look.css') // the page's own stylesheet, for the same team
  const otherMs = Date.now() - t0
  // Now read what each got: a request the server ended stops short of the 30 MiB and closes.
  const ends = await Promise.all(
    held.map(
      (s) =>
        new Promise((resolve) => {
          let n = 0
          const done = (closed) => (clearTimeout(t), resolve({ closed, bytes: n }))
          const t = setTimeout(() => done(false), 10_000)
          s.on('data', (d) => (n += d.length))
          s.on('close', () => done(true))
          s.resume()
        }),
    ),
  )
  const cut = ends.filter((e) => e.closed && e.bytes < 31457280).length
  proof('an unread page file is ended like an unread download (exec and slot freed)', cut === 4 && holding === 0 && other === 200, { unreadCutShort: cut, olaGetExecsHeldAfter16s: holding, nextFileStatus: other, nextFileMs: otherMs })
  for (const s of held) s.destroy()
  await sleep(1500)

  // 2. Asked for and given up on at once: what a page's own script does with fetch() and an
  // AbortController, or a member's client, in a loop. Twelve requests for the big file, each
  // dropped 50 ms after it was sent: the first four take the workspace's four page execs, the
  // rest wait in line and get theirs after their asker has gone.
  const dropped = []
  for (let i = 0; i < 12; i++) {
    const s = net.connect(D.port, '127.0.0.1')
    s.on('error', () => {})
    s.write(`GET /v/${g.grant}/big.bin HTTP/1.1\r\nHost: ${D.host}\r\nSec-Fetch-Dest: empty\r\n\r\n`)
    dropped.push(s)
  }
  await sleep(50)
  for (const s of dropped) s.destroy()
  await sleep(10_000) // longer than any of them needs to end
  const stuck = execs()
  const t1 = Date.now()
  const next = await view(g.grant, 'look.css')
  proof('requests given up on, even while waiting in line, leave nothing running', stuck === 0 && next === 200, { olaGetExecsStill10sLater: stuck, nextFileStatus: next, nextFileMs: Date.now() - t1 })

  // 3. Closed: the admin CLI closes a workspace it could not make safe (admin.mjs closeWorkspace:
  // the database says closed, then ws.mjs close). The container may still be up (a revocation
  // that failed before its stop), so the front desk's refusal is the only thing that holds.
  const before = await open()
  const db = new DatabaseSync(path.join(D.env.OLA_FD_DATA, 'platform.db'))
  db.prepare("UPDATE workspaces SET status = 'closed' WHERE slug = ?").run(WS)
  db.close()
  ws(['close', WS])
  const project = (await req(D, 'GET', '/api/project', { headers: { cookie, 'x-ola-workspace': WS } })).status
  const after = await open()
  const old = await view(before.grant, 'look.css')
  proof('a closed workspace: Open is refused and an earlier grant stops', project === 423 && after.status === 423 && !after.grant && old !== 200, { project, openAfterClose: after.status, newGrant: !!after.grant, earlierGrant: old })

  fd.kill()
  ws(['stop', WS])
  process.exit(failed ? 1 : 0)
}
console.error('usage: rev3.mjs cookie | tokens | config | views | --destroy')
process.exit(2)
