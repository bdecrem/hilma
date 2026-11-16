// Sign-in for the front desk: passkeys only, by invitation; sessions held on the server; CSRF;
// rate limits. No passwords, no email sign-in, no "remember me" beyond the session's life.
//
// - An invitation is a single-use, expiring random token (32 bytes). The database keeps its
//   sha256; the admin CLI prints the link once. The token travels in the URL's fragment
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

// ---------------------------------------------------------------- the auth service

export function makeAuth({ db, keys, origin, rpName = 'Ola', session: { absoluteMs, idleMs }, limits }) {
  const rpID = new URL(origin).hostname
  const ceremonies = new Map() // id -> { kind, challenge, personId?, inviteId?, expires }
  const MAX_CEREMONIES = 1000
  // Per client address, and one bucket for everyone: behind the relay every client may share an
  // address, so the global bucket is what holds when per-address cannot.
  const perAddress = new Limiter(limits.perAddress)
  const everyone = new Limiter(limits.global)

  const allow = (addr) => perAddress.take(addr) && everyone.take('*')

  function newCeremony(c) {
    const now = Date.now()
    for (const [k, v] of ceremonies) if (v.expires < now) ceremonies.delete(k)
    if (ceremonies.size >= MAX_CEREMONIES) return null
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
    const row = db.prepare('SELECT i.id, i.person_id, i.expires_at, i.used_at, p.handle, p.display_name, p.status, p.webauthn_user_id FROM invitations i JOIN people p ON p.id = i.person_id WHERE i.token_hash = ?').get(sha256(raw))
    if (!row || row.used_at !== null || row.expires_at <= Date.now() || row.status === 'suspended') return null
    return row
  }

  function startSession(personId) {
    const t = token()
    const now = Date.now()
    db.prepare('INSERT INTO sessions (id, person_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)').run(sha256(t), personId, now, now + absoluteMs, now)
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
      const row = db.prepare('SELECT s.id, s.person_id, s.expires_at, s.last_used_at, s.revoked_at, p.handle, p.display_name, p.status, p.is_admin FROM sessions s JOIN people p ON p.id = s.person_id WHERE s.id = ?').get(id)
      if (!row || row.revoked_at !== null || row.expires_at <= now || now - row.last_used_at > idleMs || row.status !== 'active') return null
      if (now - row.last_used_at > 60_000) db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(now, id)
      return { id, personId: row.person_id, handle: row.handle, name: row.display_name, isAdmin: !!row.is_admin, csrf: createHmac('sha256', keys.csrf).update(id).digest('base64url') }
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
      const ceremony = newCeremony({ kind: 'register', challenge: options.challenge, inviteId: inv.id, personId: inv.person_id })
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
        const spent = db.prepare('UPDATE invitations SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?').run(Date.now(), c.inviteId, Date.now())
        if (spent.changes !== 1) throw new Error('invite')
        db.prepare('INSERT INTO passkeys (person_id, credential_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(c.personId, cred.id, Buffer.from(cred.publicKey), cred.counter, transports, Date.now())
        db.prepare("UPDATE people SET status = 'active' WHERE id = ? AND status = 'invited'").run(c.personId)
        audit(db, { actor: c.personId, action: 'passkey_registered' })
        db.exec('COMMIT')
      } catch {
        db.exec('ROLLBACK')
        return { status: 409, body: { error: 'invite_invalid', message: 'This invitation was already used. Ask Bart for a new one.' } }
      }
      audit(db, { actor: c.personId, action: 'signed_in' })
      return { status: 200, body: { ok: true }, cookie: startSession(c.personId).cookie }
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
        audit(db, { actorKind: 'system', subject: pk.person_id, action: 'sign_in_refused', ok: false })
        return refused
      }
      db.prepare('UPDATE passkeys SET counter = ?, last_used_on = ? WHERE id = ?').run(v.authenticationInfo.newCounter, today(), pk.id)
      audit(db, { actor: pk.person_id, action: 'signed_in' })
      return { status: 200, body: { ok: true }, cookie: startSession(pk.person_id).cookie }
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

/** Makes a single-use invitation for a person; returns the raw token (shown once). */
export function makeInvite(db, personId, ttlMs) {
  const raw = token()
  const now = Date.now()
  db.prepare('INSERT INTO invitations (person_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)').run(personId, sha256(raw), now, now + ttlMs)
  return raw
}
