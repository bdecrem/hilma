// Devices: the owner's Mac app and the command line, signed in to a person's Ola account, so that
// in "On this Mac" (local folder mode) the agent runs on their own computer and only its model
// requests (and Ola's web commands) come to this machine, through the public address.
//
// Sign-in is OAuth for native apps (RFC 8252) with a PKCE-style binding. The app makes a secret S,
// listens on 127.0.0.1:<port> and opens the person's browser at
//   https://app.ola.cx/#/device?challenge=<base64url(sha256(S))>&port=<port>&name=<name>&kind=mac|cli
// The page (web/src/components/Device.tsx) asks "Sign in to Ola on <name>?"; on yes it posts
//   POST /api/device/grant {challenge, name, kind}   (session cookie + CSRF, as every write)
// and gets a one-time code (a pass, ops/pass.mjs: 120 seconds, in this process's memory, bound to
// the challenge and the person), and sends the browser to http://127.0.0.1:<port>/?code=<code>.
// The app redeems it:
//   POST /api/device/token  (the code as its pass)  {verifier: S}
// which checks base64url(sha256(S)) against the challenge; the code is spent on its first redeem,
// right or wrong. The answer is the device's token: another pass, kept here only as its sha256.
//
// The token is a pass, so the TLS front lets it through the door without the passcode, only under
// /api/device/, and hands it on as X-Ola-Pass (ops/tls.mjs). Here every route reads the pass from
// X-Ola-Pass when the front desk runs behind the TLS front (OLA_FD_PROXY_PROTOCOL=1: the front
// always removes a client's own X-Ola-Pass), or from `Authorization: Bearer` when it does not (dev,
// the check suites; the front removes Authorization, so a client's bearer never arrives here in
// production). The MAC and expiry are checked again, then the database.
//
// What a device can do (all under /api/device/, nothing else):
//   GET  /api/device/me          who, which device, until when
//   POST /api/device/signout     this device is revoked
//   ANY  /api/device/gw/<rest>   the model gateway, as the person's own caller p-<id> (GW_ALLOWED)
//   GET  /api/device/projects    the person's projects, and under /api/device/w/<project>/ the
//        project's conversations, files and event stream, with the web's own membership checks
//        (the cloud of the Mac and iPhone apps, OLA-150: server.mjs, deviceCloud)
// Each person who signs in a device has one gateway caller, p-<person id>, with its own token, in
// a file this module keeps (OLA_FD_PEOPLE_TOKENS_FILE, ~/.ola/gateway-people, mode 600, written by
// rename) and the gateway reads beside its tokens file (GATEWAY_PEOPLE_TOKENS_FILE). The file
// follows the database: a person with at least one live device who is active has an entry; anyone
// else has none. workspace/ws.mjs never touches it. Beside it, the quotas file (the people file's
// name + "-quotas", the same mode and rename): each such person's own weekly allowance on Ola when
// the admin set one (people.app_weekly_tokens, admin.mjs app-allowance), which the gateway prefers
// over its GATEWAY_PEOPLE_WEEKLY_TOKENS.
//
// Signing in without a browser (2026-11-17, "normal means you'd never leave the app"):
//   POST /api/device/login {handle, password, name, kind}   a name and password: the device; or, for
//        a person who asks for their passkey too, {passkey: true, ceremony, options} limited to that
//        person's passkeys, which the app answers with the system's own passkey sheet
//   POST /api/device/login {passkey: true, name, kind}       a passkey alone (any of the person's)
//   POST /api/device/login/passkey {ceremony, response}       the passkey's answer: the device
// and with the device's pass, within 15 minutes of its sign-in (a Mac key taken later cannot add one):
//   POST /api/device/passkey/options, POST /api/device/passkey/verify   a new passkey for the person
// The TLS front lets exactly the two login paths through without its passcode (ops/tls.mjs).
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { bearerPass, makePass, passKey, PASS_PATH, readPass } from '../ops/pass.mjs'
import { audit } from './db.mjs'
import { Limiter, same } from './auth.mjs'

export const DEVICE_DAYS = 180
export const CODE_SECONDS = 120
export const KINDS = ['mac', 'cli']
// The gateway routes a device may use, with the largest body each takes (the gateway's own default
// caps, gateway/specialists.mjs: 12 MiB for a chat that carries pictures to `see`, 24 MiB for audio):
// what opencode on the Mac sends (the chat, the model list, the week's usage), Ola's web commands
// (workspace/ola-search, ola-fetch, ola-lookup) and its specialist commands (ola-embed, ola-rerank,
// ola-transcribe, ola-draw; workspace/olaspec.py). Everything else is 403, whatever the gateway would
// say: the Claude and hosted routes, a batch lane, anything new.
const MIB = 1024 * 1024
export const GW_ALLOWED = new Map([
  ['POST /v1/chat/completions', 12 * MIB],
  ['GET /v1/models', 0],
  ['GET /v1/usage', 0],
  ['POST /web/search', 8 * 1024],
  ['POST /web/fetch', 8 * 1024],
  ['POST /web/lookup', 8 * 1024],
  ['POST /v1/embeddings', 4 * MIB],
  ['POST /v1/rerank', 4 * MIB],
  ['POST /v1/audio/transcriptions', 24 * MIB],
  ['POST /v1/images/generations', 64 * 1024],
])
// What goes back from the gateway: the type, the size, when to try again, and a download's own facts.
const GW_REPLY_HEADERS = ['content-type', 'content-length', 'retry-after', 'x-ola-final-url', 'x-ola-fetched-at', 'x-ola-redirects']

const sha256 = (s) => createHash('sha256').update(s).digest()

export function devicesConfig(env, { home, proxyProtocol }) {
  // One cap for every route instead of the gateway's defaults (when GATEWAY_LIMITS raises them).
  const mb = env.OLA_FD_DEVICE_MAX_BODY_MB === undefined ? null : Number(env.OLA_FD_DEVICE_MAX_BODY_MB)
  if (mb !== null && (!Number.isFinite(mb) || mb < 0.01 || mb > 256)) throw new Error('OLA_FD_DEVICE_MAX_BODY_MB must be a number from 0.01 to 256')
  const codeSeconds = env.OLA_FD_DEVICE_CODE_SECONDS === undefined ? CODE_SECONDS : Number(env.OLA_FD_DEVICE_CODE_SECONDS)
  if (!Number.isInteger(codeSeconds) || codeSeconds < 2 || codeSeconds > 600) throw new Error('OLA_FD_DEVICE_CODE_SECONDS must be a whole number from 2 to 600')
  return {
    key: passKey(env), // null: device sign-in is off
    codeSeconds, // how long a one-time code is good (120; the checks shorten it to watch one expire)
    peopleFile: env.OLA_FD_PEOPLE_TOKENS_FILE ?? path.join(home, 'gateway-people'),
    maxBody: mb === null ? null : Math.round(mb * 1024 * 1024),
    // Where the pass is read: behind the TLS front only the front's X-Ola-Pass, else a bearer.
    passFrom: proxyProtocol ? 'gate' : 'bearer',
    perDevice: 4,
    perPerson: 8,
  }
}

/** A device's name as the app gave it: 1 to 60 characters, no control or format characters. */
export function validDeviceName(name) {
  if (typeof name !== 'string') return null
  const n = name.trim()
  return n && [...n].length <= 60 && !/\p{C}/u.test(n) ? n : null
}
export const validChallenge = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c)
// Anyone with an active account may sign in the Mac app and the command line (2026-11-17: no admin
// step per person; people.devices_allowed is no longer read).
export const mayUseDevices = (p) => !!p && p.status === 'active'
/** How soon after its sign-in a device may add a passkey to the account. */
export const PASSKEY_ADD_MS = 15 * 60_000

// ---------------------------------------------------------------- the people file

function readPeopleFile(file) {
  const out = new Map()
  let text = ''
  try {
    text = readFileSync(file, 'utf8').trim()
  } catch {
    return out
  }
  if (!/^GATEWAY_TOKENS=[^\n]*$/.test(text)) return out
  for (const e of text.slice('GATEWAY_TOKENS='.length).split(',')) {
    const m = /^p-([1-9][0-9]{0,11}):([0-9a-f]{48})$/.exec(e.trim())
    if (m) out.set(Number(m[1]), m[2])
  }
  return out
}

/**
 * Makes the people file match the database: an entry for each person with a live device who may
 * use devices, a new random token for anyone new, no entry for anyone else. Written beside and
 * renamed into place (the gateway never reads half a file), mode 600, only when it changes.
 * Returns person id -> token.
 */
export function syncPeopleFile(db, file) {
  const now = Date.now()
  const want = db
    .prepare(
      `SELECT DISTINCT d.person_id AS id FROM devices d JOIN people p ON p.id = d.person_id
       WHERE d.revoked_at IS NULL AND d.expires_at > ? AND p.status = 'active' ORDER BY d.person_id`,
    )
    .all(now)
    .map((r) => r.id)
  const have = readPeopleFile(file)
  const next = new Map(want.map((id) => [id, have.get(id) ?? randomBytes(24).toString('hex')]))
  // The allowances first, so a person never reaches the gateway before their own number does.
  const get = db.prepare('SELECT app_weekly_tokens AS t FROM people WHERE id = ?')
  const own = want.map((id) => [id, get.get(id)?.t]).filter(([, t]) => Number.isSafeInteger(t) && t >= 0)
  writeIfChanged(quotasFileOf(file), `GATEWAY_QUOTAS=${own.map(([id, t]) => `p-${id}=${t}`).join(',')}\n`, own.length > 0)
  writeIfChanged(file, `GATEWAY_TOKENS=${[...next].map(([id, t]) => `p-${id}:${t}`).join(',')}\n`, next.size > 0)
  return next
}

/** The quotas file beside a people file (the gateway finds it the same way: gateway/server.mjs). */
export const quotasFileOf = (peopleFile) => `${peopleFile}-quotas`

/** Written beside and renamed into place (no reader sees half a file), mode 600, only when it changes; never made while empty. */
function writeIfChanged(file, line, any) {
  let before = null
  try {
    before = readFileSync(file, 'utf8')
  } catch {}
  if (before === line || (before === null && !any)) return
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, line, { mode: 0o600 })
  chmodSync(tmp, 0o600)
  renameSync(tmp, file)
}

// ---------------------------------------------------------------- shared with the admin CLI

/** A new device for a person: its token (shown once) and its row. */
export function createDevice(db, key, personId, name, kind) {
  const created = Date.now()
  const expires = created + DEVICE_DAYS * 24 * 3600_000
  const { pass } = makePass(key, 'device', Math.floor(expires / 1000))
  const r = db.prepare('INSERT INTO devices (person_id, name, kind, token_sha256, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(personId, name, kind, sha256(pass), created, expires)
  return { token: pass, id: Number(r.lastInsertRowid), expiresAt: expires }
}

/** Revokes devices (one by id, or all of a person's); returns how many. */
export function revokeDevices(db, { deviceId = null, personId = null }) {
  const now = Date.now()
  if (deviceId !== null) return db.prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, deviceId).changes
  return db.prepare('UPDATE devices SET revoked_at = ? WHERE person_id = ? AND revoked_at IS NULL').run(now, personId).changes
}

/** A device's row as a person or the admin sees it. */
export const deviceView = (d) => ({
  id: d.id,
  name: d.name,
  kind: d.kind,
  created: new Date(d.created_at).toISOString(),
  lastUsed: d.last_used_at ? new Date(d.last_used_at).toISOString() : null,
  expires: new Date(d.expires_at).toISOString(),
})

// ---------------------------------------------------------------- the server's half

export function makeDevices({ db, cfg, gateway, auth, clientOf, json, readJson, recheckMs = 1000, log = () => {}, switches = null, onPeople = null }) {
  const key = cfg.key
  const enabled = !!key
  const codes = new Map() // pass id -> { challenge, personId, name, kind, exp }
  const MAX_CODES = 1000
  const perPersonGrants = new Limiter({ capacity: 10, perMinute: 10 })
  const refusedAudit = new Limiter({ capacity: 10, perMinute: 10 }) // device_refused rows, per device or person
  const inflight = { device: new Map(), person: new Map() }
  const bump = (m, k, d) => (m.set(k, (m.get(k) ?? 0) + d), m.get(k) <= 0 && m.delete(k))

  if (enabled) {
    try {
      syncPeopleFile(db, cfg.peopleFile)
    } catch (e) {
      log(`the people file could not be written (${e.code ?? e.name})`)
    }
  }
  // Devices that expire, and people suspended by hand in the database, leave the file within the hour.
  const tidy = enabled ? setInterval(() => {
    try {
      sync()
    } catch {}
  }, 3600_000) : null
  tidy?.unref()

  const person = (id) => db.prepare('SELECT id, handle, display_name, status, is_admin, devices_allowed FROM people WHERE id = ?').get(id)
  const refused = (k, row) => {
    if (refusedAudit.take(k)) audit(db, { actorKind: 'system', subject: row.personId ?? row.person_id ?? row.id, action: 'device_refused', ok: false })
  }
  const passOf = (req) => (cfg.passFrom === 'gate' ? (typeof req.headers['x-ola-pass'] === 'string' ? req.headers['x-ola-pass'] : null) : bearerPass(req.headers.authorization))

  /** The live device behind a request's pass, or null. Counts as use (once a minute). */
  function deviceOf(raw) {
    const p = readPass(key, raw, { want: 'device' })
    if (!p) return null
    const row = db.prepare('SELECT d.id, d.person_id, d.name, d.kind, d.expires_at, d.revoked_at, d.last_used_at, p.handle, p.display_name, p.status, p.is_admin, p.devices_allowed FROM devices d JOIN people p ON p.id = d.person_id WHERE d.token_sha256 = ?').get(sha256(raw))
    if (!row) return null
    const now = Date.now()
    if (row.revoked_at !== null || row.expires_at <= now || !mayUseDevices(row)) return refused(`d${row.id}`, row), null
    if (!row.last_used_at || now - row.last_used_at > 60_000) db.prepare('UPDATE devices SET last_used_at = ? WHERE id = ?').run(now, row.id)
    return { id: row.id, personId: row.person_id, name: row.name, kind: row.kind, expiresAt: row.expires_at, passExp: p.exp, person: { handle: row.handle, name: row.display_name, admin: !!row.is_admin } }
  }
  /** Is a device found earlier still good? For a request that stays open (a stream). */
  function stillValid(dev) {
    const row = db.prepare('SELECT d.expires_at, d.revoked_at, p.status, p.is_admin, p.devices_allowed FROM devices d JOIN people p ON p.id = d.person_id WHERE d.id = ?').get(dev.id)
    const now = Date.now()
    return !!row && row.revoked_at === null && row.expires_at > now && dev.passExp * 1000 > now && mayUseDevices(row)
  }
  // A person's devices also decide their grant for the hosted open model on their own Macs
  // (hosted.mjs writeHostedGrants: only while a computer is signed in), so that file follows too
  // (OLA-337: a Mac signed in after the grants were written was refused the hosted model and its
  // picks until something else rewrote them).
  const sync = () => {
    const out = syncPeopleFile(db, cfg.peopleFile)
    try {
      onPeople?.()
    } catch (e) {
      log(`the hosted grants could not be written after a device change (${e.code ?? e.name})`)
    }
    return out
  }

  // ------------------------------------------------ signed in with a passkey (the page)

  /** POST /api/device/grant, with a session: a one-time code for the app that asked. */
  async function grant(req, res, sess) {
    if (!enabled) return json(res, 404, { error: 'not_found' })
    const body = await readJson(req, 4 * 1024)
    const name = validDeviceName(body?.name)
    const port = body?.port
    if (!body || !validChallenge(body.challenge) || !name || !KINDS.includes(body.kind) || (port !== undefined && !(Number.isInteger(port) && port >= 1024 && port <= 65535)))
      return json(res, 400, { error: 'bad_request', message: 'This sign-in link is not complete. Start again from Ola on that computer.' })
    const p = person(sess.personId)
    if (!perPersonGrants.take(p.id)) return json(res, 429, { error: 'slow_down', message: 'Too many tries. Wait a minute and try again.' }, { 'retry-after': '60' })
    const now = Date.now()
    for (const [k, c] of codes) if (c.exp <= now) codes.delete(k)
    while (codes.size >= MAX_CODES) codes.delete(codes.keys().next().value)
    const code = makePass(key, 'code', Math.floor(now / 1000) + cfg.codeSeconds)
    codes.set(code.id, { challenge: body.challenge, personId: p.id, name, kind: body.kind, exp: now + cfg.codeSeconds * 1000 })
    return json(res, 200, { code: code.pass })
  }

  /** GET /api/devices: the person's own devices. */
  function list(sess) {
    const p = person(sess.personId)
    const rows = db.prepare('SELECT * FROM devices WHERE person_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC').all(sess.personId, Date.now())
    return { enabled, allowed: mayUseDevices(p), devices: rows.map(deviceView) }
  }

  /** DELETE /api/devices/<id>: one of the person's own devices is removed. */
  function remove(sess, id) {
    const d = /^[1-9][0-9]{0,11}$/.test(id ?? '') ? db.prepare('SELECT id FROM devices WHERE id = ? AND person_id = ? AND revoked_at IS NULL').get(Number(id), sess.personId) : null
    if (!d) return { status: 404, body: { error: 'not_found', message: 'That computer is not signed in any more.' } }
    revokeDevices(db, { deviceId: d.id })
    audit(db, { actor: sess.personId, action: 'device_revoked' })
    sync()
    return { status: 200, body: { ok: true } }
  }

  // ------------------------------------------------ the device's own routes (a pass, no cookie)

  /** Is this a route a device uses with its pass (not the page's grant)? */
  const isDeviceRoute = (p) => PASS_PATH.test(p) && p !== '/api/device/grant'

  /** A new device for a person who just proved it is them: the same answer as /api/device/token's, plus this Mac's known-device token. */
  function signedIn(res, p0, body) {
    const name = validDeviceName(body?.name) ?? 'A Mac'
    const kind = KINDS.includes(body?.kind) ? body.kind : 'mac'
    const d = createDevice(db, key, p0.id, name, kind)
    audit(db, { actor: p0.id, action: 'signed_in' })
    audit(db, { actor: p0.id, action: 'device_signed_in' })
    sync()
    const hasPasskey = db.prepare('SELECT count(*) AS n FROM passkeys WHERE person_id = ?').get(p0.id).n > 0
    return json(res, 200, { token: d.token, expires_at: new Date(d.expiresAt).toISOString(), person: { handle: p0.handle, name: p0.display_name, admin: !!p0.is_admin }, device: { id: d.id, name, kind }, known: auth.knownToken(p0.id), has_passkey: hasPasskey })
  }

  /**
   * POST /api/device/login: the Mac app's and the command line's normal sign-in (2026-11-17), a name
   * and a password, with every limit of a web sign-in (auth.mjs passwordAttempt: per address, per
   * name with the known-device exception (X-Ola-Known), the global ceiling; one answer for every
   * failure). The door lets exactly this request through without its passcode (ops/tls.mjs). For a
   * person who asks for their passkey too, a right password gives a passkey ceremony for that person's
   * passkeys alone (as the web's), which the app answers in its own passkey sheet and sends to
   * /api/device/login/passkey; never a browser. `{passkey: true}` with no name: a passkey alone.
   */
  async function login(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'method' })
    const body = await readJson(req, 4 * 1024)
    if (!body) return json(res, 400, { error: 'bad_json' })
    const device = { name: validDeviceName(body.name) ?? 'A Mac', kind: KINDS.includes(body.kind) ? body.kind : 'mac' }
    if (body.passkey === true && body.handle === undefined && body.password === undefined) {
      // A random challenge and nothing else: charged to the address, as the web's sign-in options.
      if (!auth.allow('login/options', clientOf(req), null)) return json(res, 429, { error: 'slow_down', message: 'Too many tries. Wait a minute and try again.' }, { 'retry-after': '60' })
      const r = await auth.passkeyOptions({ device })
      return json(res, r.status, r.body)
    }
    const known = typeof req.headers['x-ola-known'] === 'string' ? req.headers['x-ola-known'] : null
    const r = await auth.passwordAttempt({ handle: body.handle, password: body.password, addr: clientOf(req), known })
    if (!r.ok) return json(res, r.status, r.body, r.headers ?? {})
    const p0 = person(r.person.id)
    if (r.person.require_passkey) {
      const c = await auth.passkeyOptions({ personId: p0.id, device })
      return json(res, c.status, c.body)
    }
    return signedIn(res, p0, device)
  }

  /** POST /api/device/login/passkey {ceremony, response}: the passkey's answer to a device ceremony. */
  async function loginPasskey(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'method' })
    const body = await readJson(req, 16 * 1024)
    if (!body) return json(res, 400, { error: 'bad_json' })
    if (!auth.allow('login/verify', clientOf(req), body)) return json(res, 429, { error: 'slow_down', message: 'Too many tries. Wait a minute and try again.' }, { 'retry-after': '60' })
    const r = await auth.passkeyAssert(body.ceremony, body.response, { device: true })
    if (!r.ok) return json(res, r.status, r.body)
    const p0 = person(r.personId)
    if (!mayUseDevices(p0)) return json(res, 401, { error: 'sign_in_refused', message: 'That passkey did not open Ola.' })
    return signedIn(res, p0, r.device)
  }

  /** POST /api/device/passkey/options | verify, with the pass: a new passkey for the person, soon after this device signed in. */
  async function addPasskey(req, res, dev, p) {
    if (req.method !== 'POST') return json(res, 405, { error: 'method' })
    const body = await readJson(req, 16 * 1024)
    if (!body) return json(res, 400, { error: 'bad_json' })
    const made = db.prepare('SELECT created_at FROM devices WHERE id = ?').get(dev.id)?.created_at ?? 0
    if (Date.now() - made > PASSKEY_ADD_MS) return json(res, 403, { error: 'not_fresh', message: 'For your safety, a passkey can be added only in the first 15 minutes after signing in. Sign out and sign in again on this Mac, then add it.' })
    const r = p === '/api/device/passkey/options' ? await auth.addPasskeyOptionsFor(dev.personId) : await auth.addPasskeyVerifyFor(dev.personId, body.ceremony, body.response)
    return json(res, r.status, r.body)
  }

  /**
   * Kept conversations (OLA-159): what a person chose to share to help improve Ola. Their app sends
   * each finished turn while the setting is on; the person can see how many are kept and delete them.
   *   POST   /api/device/kept  one turn (the same turn again replaces it)
   *   GET    /api/device/kept  { count, since }
   *   DELETE /api/device/kept  all of this person's, at once
   */
  const KEPT = { product: ['mac', 'iphone', 'cli', 'web'], runtime: ['local', 'cloud'], engine: ['ola', 'hosted', 'claude'], status: ['done', 'failed', 'stopped'] }
  async function kept(req, res, dev) {
    if (req.method === 'GET') {
      const r = db.prepare('SELECT count(*) AS n, min(at) AS since FROM kept_turns WHERE person_id = ?').get(dev.personId)
      return json(res, 200, { count: r.n, since: r.since ? new Date(r.since).toISOString() : null })
    }
    if (req.method === 'DELETE') {
      const r = db.prepare('DELETE FROM kept_turns WHERE person_id = ?').run(dev.personId)
      log(`kept: p${dev.personId} deleted ${r.changes} turn(s)`)
      return json(res, 200, { deleted: Number(r.changes) })
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method' })
    const b = await readJson(req, 1024 * 1024)
    if (!b) return json(res, 400, { error: 'bad_json' })
    const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
    const one = (v, list) => (list.includes(v) ? v : null)
    const t = {
      product: one(b.product, KEPT.product), runtime: one(b.runtime, KEPT.runtime), engine: one(b.engine, KEPT.engine), status: one(b.status, KEPT.status),
      session: text(b.session, 120), turn: text(b.turn, 120), request: text(b.request, 40_000), answer: text(b.answer, 400_000),
      at: Number.isFinite(Date.parse(b.at)) ? Date.parse(b.at) : Date.now(),
    }
    if (!t.product || !t.runtime || !t.engine || !t.status || !t.session || !t.turn || !t.request) return json(res, 400, { error: 'bad_turn' })
    // Steps: what was done, in the app's own plain words, never file contents or command output.
    const steps = (Array.isArray(b.steps) ? b.steps : []).slice(0, 300).map((s) => ({ tool: text(s?.tool, 60), words: text(s?.words, 300), status: text(s?.status, 20), error: text(s?.error, 600) || undefined }))
    db.prepare(
      `INSERT INTO kept_turns (person_id, device_id, at, received_at, product, runtime, app, session, session_title, turn, engine, model, status, seconds, request, answer, steps, switched_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(person_id, session, turn) DO UPDATE SET received_at = excluded.received_at, status = excluded.status, seconds = excluded.seconds, answer = excluded.answer, steps = excluded.steps, model = excluded.model, switched_from = excluded.switched_from, session_title = excluded.session_title`,
    ).run(dev.personId, String(dev.id), t.at, Date.now(), t.product, t.runtime, text(b.app, 40) || null, t.session, text(b.session_title, 200) || null, t.turn, t.engine, text(b.model, 120) || null, t.status,
      Number.isFinite(b.seconds) ? Math.max(0, Math.round(b.seconds)) : null, t.request, t.answer, JSON.stringify(steps), one(b.switched_from, KEPT.engine))
    // A switch to a fallback (OLA-157): its labels, and the kept turns are its draft test task.
    if (switches && one(b.switched_from, KEPT.engine)) switches.fromKept(db.prepare('SELECT id FROM kept_turns WHERE person_id = ? AND session = ? AND turn = ?').get(dev.personId, t.session, t.turn).id)
    return json(res, 200, { ok: true })
  }

  async function handle(req, res, p) {
    if (!enabled) return json(res, 404, { error: 'not_found' })
    if (p === '/api/device/login') return login(req, res)
    if (p === '/api/device/login/passkey') return loginPasskey(req, res)
    const raw = passOf(req)

    if (p === '/api/device/token') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method' })
      // Charged like a sign-in verify with no ceremony: to the address, then the global ceiling.
      if (!auth.allow('device/token', clientOf(req), null)) return json(res, 429, { error: 'slow_down' }, { 'retry-after': '60' })
      const pass = readPass(key, raw, { want: 'code' })
      const c = pass ? codes.get(pass.id) : null
      if (pass) codes.delete(pass.id) // spent on its first redeem, right or wrong
      if (!c || c.exp <= Date.now()) return json(res, 401, { error: 'invalid_code' })
      const body = await readJson(req, 4 * 1024)
      const p0 = person(c.personId)
      if (!body || typeof body.verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(body.verifier) || !same(sha256(body.verifier).toString('base64url'), c.challenge)) {
        refused(`p${c.personId}`, p0)
        return json(res, 401, { error: 'invalid_code' })
      }
      if (!mayUseDevices(p0)) return refused(`p${c.personId}`, p0), json(res, 401, { error: 'invalid_code' }) // suspended between the yes and the redeem
      const d = createDevice(db, key, p0.id, c.name, c.kind)
      audit(db, { actor: p0.id, action: 'device_signed_in' })
      sync()
      return json(res, 200, { token: d.token, expires_at: new Date(d.expiresAt).toISOString(), person: { handle: p0.handle, name: p0.display_name, admin: !!p0.is_admin }, device: { id: d.id, name: c.name, kind: c.kind } })
    }

    const dev = deviceOf(raw)
    if (!dev) return json(res, 401, { error: 'signed_out' })
    if (p === '/api/device/me' && req.method === 'GET') return json(res, 200, { person: dev.person, device: { id: dev.id, name: dev.name, kind: dev.kind }, expires_at: new Date(dev.expiresAt).toISOString() })
    if (p === '/api/device/signout' && req.method === 'POST') {
      revokeDevices(db, { deviceId: dev.id })
      audit(db, { actor: dev.personId, action: 'device_signed_out' })
      sync()
      return json(res, 200, { ok: true })
    }
    if (p === '/api/device/passkey/options' || p === '/api/device/passkey/verify') return addPasskey(req, res, dev, p)
    if (p === '/api/device/kept') return kept(req, res, dev)
    if (p.startsWith('/api/device/gw/')) return toGateway(req, res, dev, p.slice('/api/device/gw'.length))
    return json(res, 404, { error: 'not_found' })
  }

  // ------------------------------------------------ the gateway, as the person's own caller

  function toGateway(req, res, dev, rest) {
    if (!GW_ALLOWED.has(`${req.method} ${rest}`)) return json(res, 403, { error: 'not_allowed' })
    const maxBody = cfg.maxBody ?? GW_ALLOWED.get(`${req.method} ${rest}`)
    const declared = req.headers['content-length'] === undefined ? null : Number(req.headers['content-length'])
    if (declared !== null && !(Number.isSafeInteger(declared) && declared >= 0)) return json(res, 400, { error: 'bad_request' })
    if (declared !== null && declared > maxBody) return json(res, 413, { error: 'too_large' })
    if ((inflight.device.get(dev.id) ?? 0) >= cfg.perDevice || (inflight.person.get(dev.personId) ?? 0) >= cfg.perPerson) return json(res, 429, { error: 'too_many' }, { 'retry-after': '5' })
    let token = readPeopleFile(cfg.peopleFile).get(dev.personId)
    if (!token) token = sync().get(dev.personId) // the file lost the entry (a hand edit): made again; the gateway picks it up within seconds
    if (!token) return json(res, 401, { error: 'signed_out' })
    bump(inflight.device, dev.id, 1)
    bump(inflight.person, dev.personId, 1)
    let done = false
    const release = () => {
      if (done) return
      done = true
      bump(inflight.device, dev.id, -1)
      bump(inflight.person, dev.personId, -1)
    }
    // Only what the gateway needs: never the device's own headers (its pass, cookies, a batch lane).
    const headers = { authorization: `Bearer ${token}`, host: '127.0.0.1' }
    if (typeof req.headers['content-type'] === 'string') headers['content-type'] = req.headers['content-type'].slice(0, 200)
    if (typeof req.headers.accept === 'string') headers.accept = req.headers.accept.slice(0, 200)
    if (declared !== null) headers['content-length'] = String(declared)
    else if (req.method === 'POST') headers['transfer-encoding'] = 'chunked'
    const gw = new URL(gateway)
    const up = http.request({ host: gw.hostname, port: gw.port, method: req.method, path: rest, headers, agent: false })
    // Cut within a second when the device is revoked, the person suspended or the pass expires.
    const timer = setInterval(() => {
      if (stillValid(dev)) return
      up.destroy()
      res.destroy()
    }, recheckMs)
    const end = () => (clearInterval(timer), release())
    res.on('close', () => (up.destroy(), end()))
    up.on('response', (r) => {
      const out = { 'cache-control': 'no-store' }
      for (const h of GW_REPLY_HEADERS) if (r.headers[h] !== undefined) out[h] = r.headers[h]
      res.writeHead(r.statusCode, out)
      res.flushHeaders() // a stream's headers go out at once
      r.pipe(res)
      r.on('error', () => res.destroy())
    })
    up.on('error', () => {
      if (!res.headersSent) json(res, 502, { error: 'gateway_down' })
      else res.destroy()
      end()
    })
    if (req.method === 'GET') return up.end()
    let seen = 0
    let over = false
    req.on('data', (c) => {
      if (over) return
      seen += c.length
      if (seen > maxBody) {
        over = true
        up.destroy()
        if (!res.headersSent) json(res, 413, { error: 'too_large' }, { connection: 'close' })
        else res.destroy()
        return
      }
      if (!up.write(c)) req.pause(), up.once('drain', () => req.resume())
    })
    req.on('end', () => up.end())
    req.on('error', () => up.destroy())
  }

  /** The live device behind a request (its pass), or null: for the cloud routes in server.mjs. */
  const deviceFor = (req) => (enabled ? deviceOf(passOf(req)) : null)

  return { enabled, grant, list, remove, isDeviceRoute, handle, sync, deviceFor, stillValid, codesHeld: () => codes.size, close: () => tidy && clearInterval(tidy) }
}
