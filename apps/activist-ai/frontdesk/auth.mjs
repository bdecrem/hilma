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
//   SameSite=Strict, Path=/, no Domain). The database keeps its sha256. A session ends at its
//   absolute expiry, after an idle stretch, at sign-out, or when the admin revokes it; each is
//   checked on every request, so a revoked cookie fails at once.
// - CSRF: every state-changing request must come from our Origin (checked exactly) and carry
//   X-Ola-CSRF, an HMAC of the session id under the front desk's key, compared in constant time.
import { createHash, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import { isIP } from 'node:net'
import { audit, today } from './db.mjs'

export const COOKIE = '__Host-ola'
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

export function makeAuth({ db, keys, origin, rpName = 'Ola', session: { absoluteMs, idleMs }, limits, log = () => {} }) {
  const rpID = new URL(origin).hostname
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
    return { cookie: `${COOKIE}=${t}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(absoluteMs / 1000)}` }
  }
  const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`

  return {
    rpID,
    allow,
    clearCookie,

    /** The person behind a request's cookie, or null. Checks expiry, idle time, revocation, status. */
    session(req) {
      const raw = parseCookie(req.headers.cookie ?? '')[COOKIE]
      if (!raw || raw.length > 100) return null
      const id = sha256(raw)
      const now = Date.now()
      const row = db.prepare('SELECT s.id, s.person_id, s.passkey_id, s.expires_at, s.last_used_at, s.revoked_at, p.handle, p.display_name, p.status, p.is_admin FROM sessions s JOIN people p ON p.id = s.person_id WHERE s.id = ?').get(id)
      if (!row || row.revoked_at !== null || row.expires_at <= now || now - row.last_used_at > idleMs || row.status !== 'active') return null
      if (now - row.last_used_at > 60_000) db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(now, id)
      return { id, personId: row.person_id, passkeyId: row.passkey_id, handle: row.handle, name: row.display_name, isAdmin: !!row.is_admin, csrf: createHmac('sha256', keys.csrf).update(id).digest('base64url') }
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
      return { status: 200, body: { ceremony, options, name: inv.display_name } }
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
      const refused = { status: 401, body: { error: 'sign_in_refused', message: 'That passkey did not open Ola. If you have no passkey for this computer yet, ask Bart for an invitation.' } }
      const c = takeCeremony(ceremonyId, 'login')
      if (!c || typeof response?.id !== 'string' || response.id.length > 1400) return refused
      const pk = db.prepare('SELECT k.id, k.person_id, k.credential_id, k.public_key, k.counter, k.transports, p.status, p.webauthn_user_id FROM passkeys k JOIN people p ON p.id = k.person_id WHERE k.credential_id = ?').get(response.id)
      if (!pk) return refused
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
      audit(db, { actor: pk.person_id, action: 'signed_in' })
      return { status: 200, body: { ok: true }, cookie: startSession(pk.person_id, pk.id).cookie }
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
