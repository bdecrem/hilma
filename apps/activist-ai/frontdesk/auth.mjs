// Sign-in for the front desk: passkeys only, by invitation; sessions held on the server; CSRF;
// rate limits. No passwords, no email sign-in, no "remember me" beyond the session's life.
//
// - An invitation is a single-use, expiring random token (32 bytes). The database keeps its
//   sha256; the admin CLI prints the link once. A new invitation voids the person's earlier
//   unused ones. There are two kinds: `first` (a person with no passkey yet) and `device` (one
//   more passkey for a person who has one, made only by an explicit admin action, shorter-lived;
//   the person is told on their next sign-in from another device that it was added). The token travels in the URL's fragment
//   (#/invite/<token>), so it is in no request line and no Referer, and the page posts it.
// - A ceremony (one passkey registration or sign-in) is a server-side challenge with a random id,
//   kept in memory for 5 minutes and usable once.
// - A session is a random 32-byte token in a cookie named __Host-ola (HttpOnly, Secure,
//   SameSite=Strict, Path=/, no Domain). Only when the origin is plain http://localhost (the
//   rehearsal setup, reached through an ssh forward) is it `ola-local` instead, without Secure and
//   so without the __Host- prefix: Safari does not keep a Secure cookie set over http, even on
//   localhost (Chrome does), and Bart's first sign-in in Safari went in circles (2026-11-16). With
//   an https origin nothing changes (sessionCookie below; test/unit.test.mjs proves it). The database keeps its sha256. A session ends at its
//   absolute expiry, after an idle stretch, at sign-out, or when the admin revokes it; each is
//   checked on every request, so a revoked cookie fails at once.
// - CSRF: every state-changing request must come from our Origin (checked exactly) and carry
//   X-Ola-CSRF, an HMAC of the session id under the front desk's key, compared in constant time.
//
// Passwords (2026-11-17: "a normal login with an optional passkey"). A person signs in with their
// handle (the name the admin gave them, as in `admin.mjs add-person`) and a password, or with a
// passkey; either works, unless they turned on "Ask for my passkey too", when a right password is
// followed by their passkey. Hashing and the rules for a password are in passwords.mjs. Guessing
// (see PasswordGuard and passwordAttempt below):
//   - per address (an IPv6 /64), the sign-in rate, and for a device we do not know the global
//     ceiling too, as for invitations;
//   - per handle typed (whether or not such a person exists, so the answer says nothing about it):
//     5 wrong tries free, then each next try waits 1 s, 2 s, 4 s, … up to 15 minutes, counted over a
//     day. That per-name wait is what a stranger could use to keep a real person out (the fault the
//     passkey review found), so it is skipped for a browser or Mac that has signed in to that
//     account before: a "known device" token (an HMAC under the front desk's key, bound to the
//     person, 400 days, in an HttpOnly cookie or the app's settings) that buys no password, only
//     the right not to wait behind a stranger's wrong tries; it is limited per token (5 a minute).
//     A person with a passkey can always use it instead.
//   - "no such person", "no password", "suspended" and "wrong password" get one answer, after the
//     same scrypt work (a made-up hash when there is no real one).
import { createHash, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import { isIP } from 'node:net'
import { audit, today } from './db.mjs'
import { hashPassword, needsRehash, passwordProblem, verifyPassword } from './passwords.mjs'

export const COOKIE = '__Host-ola'
/** The session cookie's name and attributes for an origin (see the note on sessions above). */
export function sessionCookie(origin) {
  const u = new URL(origin)
  const local = u.protocol === 'http:' && u.hostname === 'localhost'
  return local ? { name: 'ola-local', attrs: 'Path=/; HttpOnly; SameSite=Strict' } : { name: COOKIE, attrs: 'Path=/; HttpOnly; Secure; SameSite=Strict' }
}
/** The known-device cookie (see passwords above): the same rules as the session cookie, its own name. */
export function knownCookieName(origin) {
  const s = sessionCookie(origin)
  return { name: s.name === COOKIE ? '__Host-ola-known' : 'ola-known-local', attrs: s.attrs }
}
const sha256 = (s) => createHash('sha256').update(s).digest()
export const token = () => randomBytes(32).toString('base64url')

/** Constant-time equality for two strings of any length (compares their digests). */
export function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  return timingSafeEqual(sha256(a), sha256(b)) && a.length === b.length
}

// ---------------------------------------------------------------- rate limits

/** Token buckets by key, in memory only (nothing about who asked is written anywhere). */
export class Limiter {
  constructor({ capacity, perMinute, maxKeys = 10_000 }) {
    Object.assign(this, { capacity, rate: perMinute / 60_000, maxKeys, buckets: new Map() })
  }
  take(key, n = 1) {
    const now = Date.now()
    let b = this.buckets.get(key)
    if (!b) {
      if (this.buckets.size >= this.maxKeys) for (const [k, v] of this.buckets) if (now - v.at > 600_000) this.buckets.delete(k)
      if (this.buckets.size >= this.maxKeys) return false
      b = { tokens: this.capacity, at: now }
      this.buckets.set(key, b)
    }
    b.tokens = Math.min(this.capacity, b.tokens + (now - b.at) * this.rate)
    b.at = now
    if (b.tokens < n) return false
    b.tokens -= n
    return true
  }
}

/**
 * Wrong passwords per handle typed, in memory only. The first `free` in a day cost nothing; after
 * that the next try must wait 1 s × 2^(n − free), at most `maxDelayMs`. A day after the last wrong
 * try the count is forgotten; a right password clears it. The map is bounded (oldest dropped).
 */
export class PasswordGuard {
  constructor({ free = 5, maxDelayMs = 15 * 60_000, forgetMs = 24 * 3600_000, maxKeys = 20_000 } = {}) {
    Object.assign(this, { free, maxDelayMs, forgetMs, maxKeys, seen: new Map() })
  }
  #get(key, now) {
    const f = this.seen.get(key)
    if (f && now - f.last > this.forgetMs) return this.seen.delete(key), null
    return f ?? null
  }
  delayFor(n) {
    return n < this.free ? 0 : Math.min(1000 * 2 ** (n - this.free), this.maxDelayMs)
  }
  /** Milliseconds before this handle may be tried again (0: now). */
  wait(key, now = Date.now()) {
    const f = this.#get(key, now)
    return f ? Math.max(0, f.last + this.delayFor(f.n) - now) : 0
  }
  /** Counts a wrong try; `burst` is true when the count reaches 5, 10, 20, 40, … (an audit row). */
  fail(key, now = Date.now()) {
    const f = this.#get(key, now) ?? { n: 0, last: now }
    f.n++
    f.last = now
    this.seen.delete(key)
    this.seen.set(key, f)
    while (this.seen.size > this.maxKeys) this.seen.delete(this.seen.keys().next().value)
    return { n: f.n, burst: f.n >= this.free && Number.isInteger(Math.log2(f.n / this.free)) }
  }
  success(key) {
    this.seen.delete(key)
  }
}

/** The handle as typed, in the one form it is looked up and limited under ('' if it cannot be one). */
export const handleKey = (h) => {
  const s = typeof h === 'string' ? h.normalize('NFKC').trim().toLowerCase() : ''
  return s.length >= 1 && s.length <= 64 ? s : ''
}

/**
 * The key a client address is limited under: an IPv4 address as it is (an IPv4-mapped IPv6 one as
 * its IPv4), an IPv6 address as its /64, the block any one IPv6 client holds (second review,
 * 2026-11-16: 50 addresses of one /64 had 50 buckets, and the same client spelled two ways two).
 */
export function addressKey(addr) {
  const a = String(addr ?? '?').toLowerCase()
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a)
  if (v4 && isIP(v4[1]) === 4) return v4[1]
  if (isIP(a) !== 6) return a.slice(0, 64)
  let [head, tail = ''] = a.split('::')
  if (!a.includes('::')) (head = a), (tail = '')
  const parts = (x) => (x ? x.split(':') : []).flatMap((g) => (g.includes('.') ? [((+g.split('.')[0] << 8) | +g.split('.')[1]).toString(16), ((+g.split('.')[2] << 8) | +g.split('.')[3]).toString(16)] : [g]))
  const h = parts(head)
  const t = parts(tail)
  const groups = [...h, ...Array(8 - h.length - t.length).fill('0'), ...t].map((g) => parseInt(g, 16).toString(16))
  if (groups.slice(0, 5).every((g) => g === '0') && groups[5] === 'ffff') return [groups[6], groups[7]].flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 255]).join('.')
  return `${groups.slice(0, 4).join(':')}::/64`
}

// ---------------------------------------------------------------- the auth service

export function makeAuth({ db, keys, origin, rpName = 'Ola', session: { absoluteMs, idleMs }, limits, passwordMin = 8, onAppKeysRevoked = () => {}, log = () => {} }) {
  const rpID = new URL(origin).hostname
  const jar = sessionCookie(origin)
  const knownJar = knownCookieName(origin)
  const ceremonies = new Map() // id -> { kind, challenge, personId?, inviteId?, expires }
  // Each address (an IPv6 /64) can hold at most perAddress.capacity + 5 × perMinute of these at
  // once (they live 5 minutes); when the map is full the oldest goes, so a flood can at worst void
  // ceremonies younger than a person's few seconds only at thousands of requests a second.
  const MAX_CEREMONIES = 20_000

  // ------------------------------------------------ rate limits (review of 2026-11-16, M3)
  //
  // Before: one bucket per address and one for everyone, both charged by every request, so one
  // caller at about one request a second held off every sign-in. Now:
  //   - an anonymous request (sign-in options, an invitation, an assertion naming no passkey we
  //     know) is charged to its client address and to a global ceiling. The ceiling is at least
  //     30 times one address's rate, so no single caller can reach it alone;
  //   - an assertion naming a passkey we hold is charged to that passkey's own bucket only: an
  //     attacker hammering from anywhere does not touch it (credential ids never leave this server
  //     except to the person's own browser), so the person's own sign-in still goes through.
  // The client address is the socket's peer, or with OLA_FD_PROXY_PROTOCOL=1 the address the
  // relay reports (server.mjs). Behind a relay WITHOUT the PROXY protocol every client shares the
  // relay's address and the per-address bucket becomes one shared bucket again: do not run that.
  const perAddress = new Limiter(limits.perAddress)
  const perCredential = new Limiter(limits.perCredential)
  const everyone = new Limiter(limits.global)
  let globalRefused = 0
  let globalNoted = 0
  const anonymous = (key) => {
    if (!perAddress.take(key)) return false
    if (everyone.take('*')) return true
    globalRefused++
    // Counts only, at most once a minute: that the ceiling was reached, not by whom.
    if (Date.now() - globalNoted > 60_000) (globalNoted = Date.now()), log(`sign-in ceiling reached (${globalRefused} refused so far)`)
    return false
  }
  const live = (id, kind) => {
    const c = typeof id === 'string' && id.length <= 100 ? ceremonies.get(id) : null
    return !!c && c.kind === kind && c.expires > Date.now()
  }
  /**
   * May this sign-in request go ahead? `route` is the path under /api/auth/, `body` its JSON.
   *
   * Second review (2026-11-16): the global ceiling also charged `login/options`, the first step of
   * every sign-in, so about 60 addresses (one IPv6 /64 before addresses were keyed by /64) kept
   * every person out, passkey or not; and anyone who knew a credential id (not a secret in
   * WebAuthn) emptied that passkey's own bucket with garbage and locked its owner out. Now:
   *   - login/options (a random challenge, nothing else) is charged to the address alone; the
   *     ceremony table is bounded by evicting its oldest entry, never by refusing;
   *   - a verify that names a live ceremony of its kind was paid for when that ceremony was
   *     issued, and goes ahead; anything else is anonymous (address, then the global ceiling);
   *   - register/options (an invitation) is anonymous.
   * Per passkey, only the "sign-in refused" audit rows are limited (10 a minute).
   */
  const allow = (route, addr, body) => {
    const key = addressKey(addr)
    // A password sign-in is limited inside passwordAttempt (a known device skips the ceiling).
    if (route === 'password') return true
    if (route === 'login/options') return perAddress.take(key)
    if (route === 'login/verify' && live(body?.ceremony, 'login')) return true
    if (route === 'register/verify' && live(body?.ceremony, 'register')) return true
    return anonymous(key)
  }

  function newCeremony(c) {
    const now = Date.now()
    for (const [k, v] of ceremonies) if (v.expires < now) ceremonies.delete(k)
    while (ceremonies.size >= MAX_CEREMONIES) ceremonies.delete(ceremonies.keys().next().value)
    const id = token()
    ceremonies.set(id, { ...c, expires: now + 5 * 60_000 })
    return id
  }
  function takeCeremony(id, kind) {
    if (typeof id !== 'string' || id.length > 100) return null
    const c = ceremonies.get(id)
    ceremonies.delete(id) // usable once, right or wrong
    return c && c.kind === kind && c.expires > Date.now() ? c : null
  }

  function inviteFor(raw) {
    if (typeof raw !== 'string' || raw.length < 20 || raw.length > 100) return null
    const row = db.prepare('SELECT i.id, i.person_id, i.kind, i.expires_at, i.used_at, i.voided_at, p.handle, p.display_name, p.status, p.webauthn_user_id FROM invitations i JOIN people p ON p.id = i.person_id WHERE i.token_hash = ?').get(sha256(raw))
    if (!row || row.used_at !== null || row.voided_at !== null || row.expires_at <= Date.now() || row.status === 'suspended') return null
    return row
  }
  const passkeyCount = (personId) => db.prepare('SELECT count(*) AS n FROM passkeys WHERE person_id = ?').get(personId).n

  function startSession(personId, passkeyId) {
    const t = token()
    const now = Date.now()
    db.prepare('INSERT INTO sessions (id, person_id, created_at, expires_at, last_used_at, passkey_id) VALUES (?, ?, ?, ?, ?, ?)').run(sha256(t), personId, now, now + absoluteMs, now, passkeyId)
    db.prepare('UPDATE people SET last_seen_on = ? WHERE id = ?').run(today(), personId)
    return { cookie: `${jar.name}=${t}; ${jar.attrs}; Max-Age=${Math.floor(absoluteMs / 1000)}` }
  }
  const clearCookie = `${jar.name}=; ${jar.attrs}; Max-Age=0`

  // ------------------------------------------------ passwords: limits, known devices, links
  const guard = new PasswordGuard()
  const stepGuard = new PasswordGuard({ free: 3 })
  const pwAddress = new Limiter(limits.perAddress)
  const perKnown = new Limiter({ capacity: 5, perMinute: 5 })
  const KNOWN_MS = 400 * 24 * 3600_000
  const knownMac = (personId, r) => createHmac('sha256', keys.known).update(`${personId}.${r}`).digest('base64url')
  const knownMake = (personId) => {
    const r = randomBytes(16).toString('base64url')
    return `${personId}.${r}.${knownMac(personId, r)}`
  }
  const knownOk = (tok, personId) => {
    const m = typeof tok === 'string' ? /^(\d{1,12})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(tok) : null
    return !!m && Number(m[1]) === personId && same(m[3], knownMac(personId, m[2]))
  }
  const knownCookie = (personId) => `${knownJar.name}=${knownMake(personId)}; ${knownJar.attrs}; Max-Age=${KNOWN_MS / 1000}`
  const ceiling = () => {
    if (everyone.take('*')) return true
    globalRefused++
    if (Date.now() - globalNoted > 60_000) (globalNoted = Date.now()), log(`sign-in ceiling reached (${globalRefused} refused so far)`)
    return false
  }
  const REFUSED_PW = { error: 'sign_in_refused', message: 'That name and password did not match. Check both and try again.' }
  const minutes = (ms) => {
    const n = ms < 90_000 ? Math.max(1, Math.ceil(ms / 1000)) : Math.ceil(ms / 60_000)
    return `${n} ${ms < 90_000 ? 'second' : 'minute'}${n === 1 ? '' : 's'}`
  }

  async function passwordAttempt({ handle, password, addr, known }) {
    const h = handleKey(handle)
    const p = h ? db.prepare('SELECT id, handle, display_name, status, is_admin, password_hash, require_passkey FROM people WHERE handle = ?').get(h) : null
    const isKnown = !!p && knownOk(known, p.id) && perKnown.take(known)
    const a = addressKey(addr)
    if (!pwAddress.take(a) || (!isKnown && !ceiling())) return { status: 429, body: { error: 'slow_down', message: 'Too many tries. Wait a minute and try again.' }, headers: { 'retry-after': '60' } }
    if (!isKnown) {
      const w = guard.wait(h)
      if (w > 0) return { status: 429, body: { error: 'slow_down', message: `Too many wrong tries for this name. Wait ${minutes(w)}, then try again.` }, headers: { 'retry-after': String(Math.ceil(w / 1000)) } }
    }
    const right = await verifyPassword(password, p?.status === 'active' ? p.password_hash : null)
    if (!right) {
      const f = guard.fail(h)
      if (p) {
        if (f.burst) audit(db, { actorKind: 'system', subject: p.id, action: 'sign_in_burst', ok: false, size: f.n })
        if (perCredential.take(`pw:${p.id}`)) audit(db, { actorKind: 'system', subject: p.id, action: 'sign_in_refused', ok: false })
      }
      return { status: 401, body: REFUSED_PW }
    }
    guard.success(h)
    if (needsRehash(p.password_hash)) db.prepare('UPDATE people SET password_hash = ? WHERE id = ?').run(await hashPassword(password), p.id)
    return { ok: true, person: p }
  }

  const LINK_GONE = { error: 'link_invalid', message: 'This link has expired or was already used. Ask Bart for a new one.' }
  function linkFor(raw) {
    if (typeof raw !== 'string' || raw.length < 20 || raw.length > 100) return null
    const row = db.prepare('SELECT l.id, l.person_id, l.expires_at, l.used_at, l.voided_at, p.handle, p.display_name, p.status, p.password_hash FROM password_links l JOIN people p ON p.id = l.person_id WHERE l.token_hash = ?').get(sha256(raw))
    if (!row || row.used_at !== null || row.voided_at !== null || row.expires_at <= Date.now() || row.status === 'suspended') return null
    return row
  }
  // A sign-in of the last 15 minutes stands in for the password when there is none yet.
  const FRESH_MS = 15 * 60_000
  const fresh = (sess) => Date.now() - (sess.createdAt ?? 0) <= FRESH_MS
  /** Null if the person proved it is them (the current password, or a fresh sign-in with none), else the refusal. */
  async function proveIt(sess, p, current) {
    if (!p.password_hash) return fresh(sess) ? null : { status: 403, body: { error: 'not_fresh', message: 'For your safety, sign out, sign in again with your passkey, then do this within 15 minutes.' } }
    // Its own count, by person (a session's holder guessing): a stranger's wrong sign-ins under the
    // same name never slow the person down here.
    const h = `session:${sess.personId}`
    const w = stepGuard.wait(h)
    if (w > 0) return { status: 429, body: { error: 'slow_down', message: `Too many wrong tries. Wait ${minutes(w)}.` }, headers: { 'retry-after': String(Math.ceil(w / 1000)) } }
    if (await verifyPassword(current, p.password_hash)) return stepGuard.success(h), null
    const f = stepGuard.fail(h)
    if (f.burst) audit(db, { actorKind: 'system', subject: sess.personId, action: 'sign_in_burst', ok: false, size: f.n })
    return { status: 403, body: { error: 'wrong_password', message: 'Your current password was not right.' } }
  }

  /**
   * A passkey sign-in ceremony: for one person's passkeys (after their right password, with "Ask for
   * my passkey too"), or for any passkey (no person). `device` ({name, kind}) marks it as the Mac
   * app's or the command line's (devices.mjs): it is answered only at /api/device/login/passkey, and
   * a web ceremony only at /api/auth/login/verify.
   */
  async function passkeyOptions({ personId = undefined, device = undefined } = {}) {
    let allowCredentials = []
    if (personId !== undefined) {
      const pks = db.prepare('SELECT credential_id, transports FROM passkeys WHERE person_id = ?').all(personId)
      if (!pks.length) return { status: 409, body: { error: 'no_passkey', message: 'Your account asks for your passkey, and it has none now. Ask Bart to turn that off for you.' } }
      allowCredentials = pks.map((k) => ({ id: k.credential_id, transports: JSON.parse(k.transports) }))
    }
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials, timeout: 120_000 })
    const ceremony = newCeremony({ kind: 'login', challenge: options.challenge, personId, device })
    return { status: 200, body: { passkey: true, ceremony, options } }
  }

  /** Checks a passkey's answer to a sign-in ceremony: { ok: true, personId, passkeyId, device } or a refusal. */
  async function passkeyAssert(ceremonyId, response, { device = false } = {}) {
      const refused = { status: 401, body: { error: 'sign_in_refused', message: 'That passkey did not open Ola. If you have no passkey for this computer yet, ask Bart for an invitation.' } }
      const c = takeCeremony(ceremonyId, 'login')
      if (!c || !!c.device !== device || typeof response?.id !== 'string' || response.id.length > 1400) return refused
      const pk = db.prepare('SELECT k.id, k.person_id, k.credential_id, k.public_key, k.counter, k.transports, p.status, p.webauthn_user_id FROM passkeys k JOIN people p ON p.id = k.person_id WHERE k.credential_id = ?').get(response.id)
      if (!pk) return refused
      // After a right password with "Ask for my passkey too": only that person's passkey finishes it.
      if (c.personId !== undefined && pk.person_id !== c.personId) return refused
      // A discoverable credential names its user: it must be the passkey's owner.
      const handle = response?.response?.userHandle
      if (handle && !same(handle, Buffer.from(pk.webauthn_user_id).toString('base64url'))) return refused
      let v
      try {
        v = await verifyAuthenticationResponse({
          response,
          expectedChallenge: c.challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: true,
          credential: { id: pk.credential_id, publicKey: new Uint8Array(pk.public_key), counter: pk.counter, transports: JSON.parse(pk.transports) },
        })
      } catch {
        v = { verified: false }
      }
      if (!v.verified || pk.status !== 'active') {
        if (perCredential.take(pk.credential_id)) audit(db, { actorKind: 'system', subject: pk.person_id, action: 'sign_in_refused', ok: false })
        return refused
      }
      db.prepare('UPDATE passkeys SET counter = ?, last_used_on = ? WHERE id = ?').run(v.authenticationInfo.newCounter, today(), pk.id)
      return { ok: true, personId: pk.person_id, passkeyId: pk.id, device: c.device ?? null }
  }

  return {
    rpID,
    allow,
    clearCookie,
    cookieName: jar.name,

    /** The person behind a request's cookie, or null. Checks expiry, idle time, revocation, status. */
    session(req) {
      const raw = parseCookie(req.headers.cookie ?? '')[jar.name]
      if (!raw || raw.length > 100) return null
      const id = sha256(raw)
      const now = Date.now()
      const row = db.prepare('SELECT s.id, s.person_id, s.passkey_id, s.created_at, s.expires_at, s.last_used_at, s.revoked_at, p.handle, p.display_name, p.status, p.is_admin FROM sessions s JOIN people p ON p.id = s.person_id WHERE s.id = ?').get(id)
      if (!row || row.revoked_at !== null || row.expires_at <= now || now - row.last_used_at > idleMs || row.status !== 'active') return null
      if (now - row.last_used_at > 60_000) db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(now, id)
      return { id, personId: row.person_id, passkeyId: row.passkey_id, createdAt: row.created_at, handle: row.handle, name: row.display_name, isAdmin: !!row.is_admin, csrf: createHmac('sha256', keys.csrf).update(id).digest('base64url') }
    },

    /**
     * Is a session found earlier still good? For a request that stays open (an event stream, a
     * download): rechecked while it runs, so sign-out, revocation, suspension, expiry and the
     * idle limit end it too. It does not count as use, so an open stream alone never keeps a
     * session from going idle.
     */
    stillValid(sess) {
      const row = db.prepare('SELECT s.expires_at, s.last_used_at, s.revoked_at, p.status FROM sessions s JOIN people p ON p.id = s.person_id WHERE s.id = ?').get(sess.id)
      const now = Date.now()
      return !!row && row.revoked_at === null && row.expires_at > now && now - row.last_used_at <= idleMs && row.status === 'active'
    },

    /**
     * What the person must be told now: a passkey added by a `device` invitation, shown once, to a
     * session that did not come from that passkey (so the person sees it on their own device,
     * not only whoever holds the new one).
     */
    notices(sess) {
      const rows = db.prepare("SELECT id, created_at FROM passkeys WHERE person_id = ? AND via = 'device' AND noticed_at IS NULL AND id IS NOT ?").all(sess.personId, sess.passkeyId ?? null)
      if (!rows.length) return []
      const mark = db.prepare('UPDATE passkeys SET noticed_at = ? WHERE id = ?')
      for (const r of rows) mark.run(Date.now(), r.id)
      return rows.map((r) => ({ kind: 'device_added', at: new Date(r.created_at).toISOString(), text: `A passkey for another device was added to your account on ${new Date(r.created_at).toUTCString().slice(0, 16)}. If that was you, there is nothing to do. If it was not, tell Bart at once: he will remove it.` }))
    },

    csrfOk(sess, req) {
      return !!sess && same(String(req.headers['x-ola-csrf'] ?? ''), sess.csrf)
    },

    signOut(sess) {
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(Date.now(), sess.id)
      audit(db, { actor: sess.personId, action: 'signed_out' })
    },

    // ------------------------------------------------ registration (by invitation)
    async registerOptions(inviteRaw) {
      const inv = inviteFor(inviteRaw)
      if (!inv) return { status: 404, body: { error: 'invite_invalid', message: 'This invitation has expired or was already used. Ask Bart for a new one.' } }
      // A first-passkey invitation never adds a second passkey (one made before this rule, say).
      if (inv.kind === 'first' && passkeyCount(inv.person_id)) return { status: 409, body: { error: 'has_passkey', message: 'You already have a passkey for Ola. Sign in with it; to add another device, ask Bart.' } }
      const existing = db.prepare('SELECT credential_id, transports FROM passkeys WHERE person_id = ?').all(inv.person_id)
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: inv.handle,
        userDisplayName: inv.display_name,
        userID: new Uint8Array(inv.webauthn_user_id),
        attestationType: 'none',
        excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: JSON.parse(p.transports) })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        supportedAlgorithmIDs: [-7, -257],
        timeout: 120_000,
      })
      const ceremony = newCeremony({ kind: 'register', challenge: options.challenge, inviteId: inv.id, inviteKind: inv.kind, personId: inv.person_id })
      if (!ceremony) return { status: 503, body: { error: 'busy', message: 'Too many sign-ins are under way. Try again in a minute.' } }
      return { status: 200, body: { ceremony, options, name: inv.display_name, min: passwordMin, hasPassword: false } }
    },

    async registerVerify(ceremonyId, response) {
      const c = takeCeremony(ceremonyId, 'register')
      if (!c) return { status: 400, body: { error: 'ceremony_invalid', message: 'That took too long. Start again from your invitation link.' } }
      let v
      try {
        v = await verifyRegistrationResponse({ response, expectedChallenge: c.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] })
      } catch {
        v = { verified: false }
      }
      if (!v.verified) return { status: 400, body: { error: 'passkey_refused', message: 'Your passkey could not be checked. Nothing was saved.' } }
      const cred = v.registrationInfo.credential
      const transports = JSON.stringify((cred.transports ?? []).filter((t) => ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'].includes(t)))
      db.exec('BEGIN IMMEDIATE')
      try {
        // The invitation is spent here, atomically: a second use finds used_at set and changes nothing.
        const spent = db.prepare('UPDATE invitations SET used_at = ? WHERE id = ? AND used_at IS NULL AND voided_at IS NULL AND expires_at > ?').run(Date.now(), c.inviteId, Date.now())
        if (spent.changes !== 1) throw new Error('invite')
        if (c.inviteKind === 'first' && passkeyCount(c.personId)) throw new Error('has a passkey')
        const pk = db.prepare('INSERT INTO passkeys (person_id, credential_id, public_key, counter, transports, created_at, via) VALUES (?, ?, ?, ?, ?, ?, ?)').run(c.personId, cred.id, Buffer.from(cred.publicKey), cred.counter, transports, Date.now(), c.inviteKind)
        c.passkeyId = Number(pk.lastInsertRowid)
        db.prepare("UPDATE people SET status = 'active' WHERE id = ? AND status = 'invited'").run(c.personId)
        audit(db, { actor: c.personId, action: c.inviteKind === 'device' ? 'device_added' : 'passkey_registered' })
        db.exec('COMMIT')
      } catch {
        db.exec('ROLLBACK')
        return { status: 409, body: { error: 'invite_invalid', message: 'This invitation was already used. Ask Bart for a new one.' } }
      }
      audit(db, { actor: c.personId, action: 'signed_in' })
      return { status: 200, body: { ok: true }, cookie: startSession(c.personId, c.passkeyId).cookie }
    },

    // ------------------------------------------------ sign-in
    async loginOptions() {
      const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: [], timeout: 120_000 })
      const ceremony = newCeremony({ kind: 'login', challenge: options.challenge })
      if (!ceremony) return { status: 503, body: { error: 'busy', message: 'Too many sign-ins are under way. Try again in a minute.' } }
      return { status: 200, body: { ceremony, options } }
    },

    async loginVerify(ceremonyId, response) {
      const r = await passkeyAssert(ceremonyId, response, { device: false })
      if (!r.ok) return r
      audit(db, { actor: r.personId, action: 'signed_in' })
      return { status: 200, body: { ok: true }, cookie: startSession(r.personId, r.passkeyId).cookie }
    },

    passkeyOptions,
    passkeyAssert,

    // ------------------------------------------------ passwords (see the note at the top)
    knownCookieName: knownJar.name,
    passwordMin,

    /**
     * Checks a handle and password, with every limit. Returns { ok: true, person } or a refusal
     * ({ status, body, headers }). `known` is a known-device token (the cookie, or the app's).
     */
    passwordAttempt,

    /** The web sign-in: a session, or (with "Ask for my passkey too") a passkey ceremony for that person alone. */
    async passwordSignIn(body, addr, known) {
      const r = await passwordAttempt({ handle: body?.handle, password: body?.password, addr, known })
      if (!r.ok) return r
      const p = r.person
      if (p.require_passkey) return passkeyOptions({ personId: p.id })
      audit(db, { actor: p.id, action: 'signed_in' })
      return { status: 200, body: { ok: true }, cookies: [startSession(p.id, null).cookie, knownCookie(p.id)] }
    },

    /** A known-device token for a person (the app keeps it; the browser gets it as a cookie). */
    knownToken: (personId) => knownMake(personId),

    /** Choosing a password from an invitation link (a first invitation only): the person is in. */
    async invitePassword(raw, password) {
      const inv = inviteFor(raw)
      if (!inv) return { status: 404, body: { error: 'invite_invalid', message: 'This invitation has expired or was already used. Ask Bart for a new one.' } }
      if (inv.kind !== 'first') return { status: 400, body: { error: 'invite_kind', message: 'This link adds a passkey for another device. Use the passkey button.' } }
      const p = db.prepare('SELECT password_hash FROM people WHERE id = ?').get(inv.person_id)
      if (p.password_hash || passkeyCount(inv.person_id)) return { status: 409, body: { error: 'has_account', message: 'You can already sign in to Ola. Sign in with your name and password.' } }
      const problem = passwordProblem(password, { handle: inv.handle, min: passwordMin })
      if (problem) return { status: 400, body: { error: 'weak_password', message: problem } }
      const hash = await hashPassword(password)
      db.exec('BEGIN IMMEDIATE')
      try {
        const spent = db.prepare('UPDATE invitations SET used_at = ? WHERE id = ? AND used_at IS NULL AND voided_at IS NULL AND expires_at > ?').run(Date.now(), inv.id, Date.now())
        if (spent.changes !== 1) throw new Error('invite')
        const set = db.prepare("UPDATE people SET password_hash = ?, password_set_at = ?, status = 'active' WHERE id = ? AND password_hash IS NULL AND status = 'invited'").run(hash, Date.now(), inv.person_id)
        if (set.changes !== 1 || passkeyCount(inv.person_id)) throw new Error('has an account')
        audit(db, { actor: inv.person_id, action: 'password_set' })
        db.exec('COMMIT')
      } catch {
        db.exec('ROLLBACK')
        return { status: 409, body: { error: 'invite_invalid', message: 'This invitation was already used. Ask Bart for a new one.' } }
      }
      audit(db, { actor: inv.person_id, action: 'signed_in' })
      return { status: 200, body: { ok: true }, cookies: [startSession(inv.person_id, null).cookie, knownCookie(inv.person_id)] }
    },

    /**
     * An invitation's person (for the greeting and the password rule), or 404. Nothing is started:
     * a first invitation is answered with a password (the page asks for nothing else); a `device`
     * invitation (one more passkey, made only by an explicit admin action) is the passkey page.
     */
    inviteInfo(raw) {
      const inv = inviteFor(raw)
      if (!inv) return { status: 404, body: { error: 'invite_invalid', message: 'This invitation has expired or was already used. Ask Bart for a new one.' } }
      return { status: 200, body: { name: inv.display_name, handle: inv.handle, kind: inv.kind, min: passwordMin } }
    },

    /** A reset link's person (for the greeting), or 404. */
    resetInfo(raw) {
      const l = linkFor(raw)
      if (!l) return { status: 404, body: LINK_GONE }
      return { status: 200, body: { name: l.display_name, handle: l.handle, hasPassword: l.password_hash !== null, min: passwordMin } }
    },

    /**
     * A new password from the admin's one-time link. A person who had a password before: every
     * session and every Mac of theirs is signed out (the old password may be known to someone else).
     */
    async reset(raw, password) {
      const l = linkFor(raw)
      if (!l) return { status: 404, body: LINK_GONE }
      const problem = passwordProblem(password, { handle: l.handle, min: passwordMin })
      if (problem) return { status: 400, body: { error: 'weak_password', message: problem } }
      const hash = await hashPassword(password)
      const now = Date.now()
      let had = false
      db.exec('BEGIN IMMEDIATE')
      try {
        const spent = db.prepare('UPDATE password_links SET used_at = ? WHERE id = ? AND used_at IS NULL AND voided_at IS NULL AND expires_at > ?').run(now, l.id, now)
        if (spent.changes !== 1) throw new Error('link')
        const before = db.prepare('SELECT password_hash, status FROM people WHERE id = ?').get(l.person_id)
        if (before.status === 'suspended') throw new Error('suspended')
        had = before.password_hash !== null
        db.prepare("UPDATE people SET password_hash = ?, password_set_at = ?, status = CASE WHEN status = 'invited' THEN 'active' ELSE status END WHERE id = ?").run(hash, now, l.person_id)
        if (had) {
          db.prepare('UPDATE sessions SET revoked_at = ? WHERE person_id = ? AND revoked_at IS NULL').run(now, l.person_id)
          db.prepare('UPDATE devices SET revoked_at = ? WHERE person_id = ? AND revoked_at IS NULL').run(now, l.person_id)
          audit(db, { actor: l.person_id, action: 'sessions_revoked' })
        }
        audit(db, { actor: l.person_id, action: had ? 'password_changed' : 'password_set' })
        db.exec('COMMIT')
      } catch {
        db.exec('ROLLBACK')
        return { status: 404, body: LINK_GONE }
      }
      if (had) onAppKeysRevoked()
      guard.success(handleKey(l.handle))
      audit(db, { actor: l.person_id, action: 'signed_in' })
      return { status: 200, body: { ok: true }, cookies: [startSession(l.person_id, null).cookie, knownCookie(l.person_id)] }
    },

    // ------------------------------------------------ the person's own account (signed in, CSRF)
    account(sess) {
      const p = db.prepare('SELECT password_hash, password_set_at, require_passkey FROM people WHERE id = ?').get(sess.personId)
      const pks = db.prepare('SELECT id, created_at, last_used_on FROM passkeys WHERE person_id = ? ORDER BY id').all(sess.personId)
      return {
        hasPassword: p.password_hash !== null,
        passwordSetAt: p.password_set_at ? new Date(p.password_set_at).toISOString() : null,
        requirePasskey: !!p.require_passkey,
        passkeys: pks.map((k) => ({ id: k.id, added: new Date(k.created_at).toISOString(), lastUsed: k.last_used_on ?? null })),
        minLength: passwordMin,
        fresh: fresh(sess),
      }
    },

    /** Sets or changes the password: the current one, or (no password yet) a sign-in of the last 15 minutes. */
    async setPassword(sess, body) {
      const p = db.prepare('SELECT handle, password_hash FROM people WHERE id = ?').get(sess.personId)
      const proof = await proveIt(sess, p, body?.current)
      if (proof) return proof
      const problem = passwordProblem(body?.password, { handle: p.handle, min: passwordMin })
      if (problem) return { status: 400, body: { error: 'weak_password', message: problem } }
      const hash = await hashPassword(body.password)
      const now = Date.now()
      db.prepare('UPDATE people SET password_hash = ?, password_set_at = ? WHERE id = ?').run(hash, now, sess.personId)
      // Every other sign-in ends, the Ola app on their Macs included: whoever knew the old one is out.
      const ended = Number(db.prepare('UPDATE sessions SET revoked_at = ? WHERE person_id = ? AND id != ? AND revoked_at IS NULL').run(now, sess.personId, sess.id).changes)
      const macs = Number(db.prepare('UPDATE devices SET revoked_at = ? WHERE person_id = ? AND revoked_at IS NULL').run(now, sess.personId).changes)
      audit(db, { actor: sess.personId, action: p.password_hash ? 'password_changed' : 'password_set' })
      if (ended || macs) audit(db, { actor: sess.personId, action: 'sessions_revoked' })
      if (macs) onAppKeysRevoked()
      return { status: 200, body: { ok: true, signedOutElsewhere: ended, macsSignedOut: macs } }
    },

    /** "Ask for my passkey too": on needs a passkey; off needs the password (or a fresh sign-in). */
    async setRequirePasskey(sess, body) {
      const on = body?.on === true
      const p = db.prepare('SELECT handle, password_hash, require_passkey FROM people WHERE id = ?').get(sess.personId)
      if (on && !passkeyCount(sess.personId)) return { status: 409, body: { error: 'no_passkey', message: 'Add a passkey first, then turn this on.' } }
      if (!on && p.require_passkey) {
        const proof = await proveIt(sess, p, body?.current)
        if (proof) return proof
      }
      if (!!p.require_passkey !== on) {
        db.prepare('UPDATE people SET require_passkey = ? WHERE id = ?').run(on ? 1 : 0, sess.personId)
        audit(db, { actor: sess.personId, action: on ? 'passkey_required_on' : 'passkey_required_off' })
      }
      return { status: 200, body: { ok: true, requirePasskey: on } }
    },

    /** Adding a passkey from Settings: the password first (or a fresh sign-in), then the browser's prompt. */
    async addPasskeyOptions(sess, body) {
      const p = db.prepare('SELECT handle, password_hash FROM people WHERE id = ?').get(sess.personId)
      const proof = await proveIt(sess, p, body?.current)
      if (proof) return proof
      return this.addPasskeyOptionsFor(sess.personId)
    },

    async addPasskeyVerify(sess, ceremonyId, response) {
      return this.addPasskeyVerifyFor(sess.personId, ceremonyId, response)
    },

    /**
     * A new passkey for a person who has proved it is them: from Settings on the web (above), or
     * from the Mac app soon after it signed in (devices.mjs, with the device's pass).
     */
    async addPasskeyOptionsFor(personId) {
      const p = db.prepare('SELECT handle, display_name, webauthn_user_id FROM people WHERE id = ?').get(personId)
      const existing = db.prepare('SELECT credential_id, transports FROM passkeys WHERE person_id = ?').all(personId)
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: p.handle,
        userDisplayName: p.display_name,
        userID: new Uint8Array(p.webauthn_user_id),
        attestationType: 'none',
        excludeCredentials: existing.map((k) => ({ id: k.credential_id, transports: JSON.parse(k.transports) })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        supportedAlgorithmIDs: [-7, -257],
        timeout: 120_000,
      })
      return { status: 200, body: { ceremony: newCeremony({ kind: 'add', challenge: options.challenge, personId }), options } }
    },

    async addPasskeyVerifyFor(personId, ceremonyId, response) {
      const c = takeCeremony(ceremonyId, 'add')
      if (!c || c.personId !== personId) return { status: 400, body: { error: 'ceremony_invalid', message: 'That took too long. Start again.' } }
      let v
      try {
        v = await verifyRegistrationResponse({ response, expectedChallenge: c.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] })
      } catch {
        v = { verified: false }
      }
      if (!v.verified) return { status: 400, body: { error: 'passkey_refused', message: 'Your passkey could not be checked. Nothing was saved.' } }
      const cred = v.registrationInfo.credential
      const transports = JSON.stringify((cred.transports ?? []).filter((t) => ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'].includes(t)))
      try {
        // via 'device': the person's other devices are told once that a passkey was added.
        db.prepare("INSERT INTO passkeys (person_id, credential_id, public_key, counter, transports, created_at, via) VALUES (?, ?, ?, ?, ?, ?, 'device')").run(personId, cred.id, Buffer.from(cred.publicKey), cred.counter, transports, Date.now())
      } catch {
        return { status: 409, body: { error: 'passkey_exists', message: 'That passkey is already on your account.' } }
      }
      audit(db, { actor: personId, action: 'passkey_added' })
      return { status: 200, body: { ok: true } }
    },

    /** Sign out everywhere: every session (this one too) and every Mac. */
    signOutEverywhere(sess) {
      const now = Date.now()
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE person_id = ? AND revoked_at IS NULL').run(now, sess.personId)
      const macs = Number(db.prepare('UPDATE devices SET revoked_at = ? WHERE person_id = ? AND revoked_at IS NULL').run(now, sess.personId).changes)
      audit(db, { actor: sess.personId, action: 'sessions_revoked' })
      if (macs) onAppKeysRevoked()
    },
  }
}

export function parseCookie(header) {
  const out = {}
  for (const part of header.split(';')) {
    const at = part.indexOf('=')
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim()
  }
  return out
}

// ---------------------------------------------------------------- invitations (admin CLI)

/**
 * Makes a single-use invitation for a person and voids their earlier unused ones, in one
 * transaction. Returns the raw token (shown once) and how many were voided.
 */
/**
 * A one-time link to set a password (admin.mjs reset-password): voids the person's earlier unused
 * ones, in one transaction. Returns the raw token (shown once) and how many were voided.
 */
export function makePasswordLink(db, personId, ttlMs) {
  const raw = token()
  const now = Date.now()
  db.exec('BEGIN IMMEDIATE')
  try {
    const voided = db.prepare('UPDATE password_links SET voided_at = ? WHERE person_id = ? AND used_at IS NULL AND voided_at IS NULL AND expires_at > ?').run(now, personId, now).changes
    db.prepare('INSERT INTO password_links (person_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)').run(personId, sha256(raw), now, now + ttlMs)
    db.exec('COMMIT')
    return { raw, voided }
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function makeInvite(db, personId, ttlMs, kind = 'first') {
  if (!['first', 'device'].includes(kind)) throw new Error('an invitation is first or device')
  const raw = token()
  const now = Date.now()
  db.exec('BEGIN IMMEDIATE')
  try {
    const voided = db.prepare('UPDATE invitations SET voided_at = ? WHERE person_id = ? AND used_at IS NULL AND voided_at IS NULL AND expires_at > ?').run(now, personId, now).changes
    db.prepare('INSERT INTO invitations (person_id, token_hash, created_at, expires_at, kind) VALUES (?, ?, ?, ?, ?)').run(personId, sha256(raw), now, now + ttlMs, kind)
    db.exec('COMMIT')
    return { raw, voided }
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
