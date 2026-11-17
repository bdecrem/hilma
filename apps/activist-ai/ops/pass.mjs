// Passes: how a signed-in device (the Mac app, the command line) gets past the door without the
// door passcode. Used by the TLS front (ops/tls.mjs) and the front desk (frontdesk/devices.mjs),
// with the same key in both: OLA_GATE_PASS_KEY, 64 hex characters (32 bytes), set in tls.env and
// frontdesk.env. Without it the feature is off: the TLS front accepts only the passcode, and the
// front desk answers 404 on /api/device/*.
//
//   olap1.<base64url(JSON payload)>.<base64url(HMAC-SHA256(key, "olap1." + payload part))>
//   payload {"k": "code" | "device", "id": "<random, 128 bits or more>", "exp": <unix seconds>}
//
// A pass that checks out says only that this machine made it and it has not expired. Who it
// belongs to, and whether it was revoked, is the front desk's database (a device) or memory (a
// one-time code). The comparison is of SHA-256 digests in constant time, so neither the answer nor
// its timing depends on how close a forgery came.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const PASS_PREFIX = 'olap1.'
const B64 = /^[A-Za-z0-9_-]+$/
// The longest pass this code makes is about 120 characters; anything much longer is not one.
const MAX_LEN = 400
// No pass lives longer than a device (180 days) plus a day of clock slack.
const MAX_LIFE_S = 181 * 24 * 3600

/** The key from the environment: null when absent (the feature is off); throws on a bad value. */
export function passKey(env = process.env) {
  const v = env.OLA_GATE_PASS_KEY
  if (v === undefined || v === '') return null
  if (!/^[0-9a-f]{64}$/i.test(v)) throw new Error('OLA_GATE_PASS_KEY must be 64 hex characters (32 bytes); leave it unset to keep device sign-in off')
  return Buffer.from(v, 'hex')
}

const mac = (key, body) => createHmac('sha256', key).update(PASS_PREFIX + body).digest('base64url')
const digest = (s) => createHash('sha256').update(s).digest()

/** A new pass of kind `k` ("code" or "device"), good until `exp` (unix seconds). */
export function makePass(key, k, exp) {
  if (!['code', 'device'].includes(k)) throw new Error('a pass is a code or a device')
  const id = randomBytes(32).toString('base64url')
  const body = Buffer.from(JSON.stringify({ k, id, exp })).toString('base64url')
  return { pass: `${PASS_PREFIX}${body}.${mac(key, body)}`, id, exp }
}

/**
 * The payload of a pass that this key made and that has not expired, or null. `want` limits the
 * kind. Never throws on what a client sent.
 */
export function readPass(key, raw, { want = null, now = Date.now() } = {}) {
  if (!key || typeof raw !== 'string' || raw.length > MAX_LEN || !raw.startsWith(PASS_PREFIX)) return null
  const rest = raw.slice(PASS_PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot < 1 || dot !== rest.lastIndexOf('.')) return null
  const body = rest.slice(0, dot)
  const given = rest.slice(dot + 1)
  if (!B64.test(body) || !B64.test(given)) return null
  if (!timingSafeEqual(digest(given), digest(mac(key, body)))) return null
  let p
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!p || typeof p !== 'object' || !['code', 'device'].includes(p.k) || typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{22,64}$/.test(p.id) || !Number.isSafeInteger(p.exp)) return null
  const s = Math.floor(now / 1000)
  if (p.exp <= s || p.exp > s + MAX_LIFE_S) return null
  if (want && p.k !== want) return null
  return { k: p.k, id: p.id, exp: p.exp }
}

/** The pass in an `Authorization: Bearer olap1.…` header, as a string, or null (not one). */
export function bearerPass(header) {
  const m = typeof header === 'string' ? /^Bearer (olap1\.[A-Za-z0-9_.-]{1,400})$/.exec(header) : null
  return m ? m[1] : null
}

/** Paths a pass may be used on, at the door and at the front desk. */
export const PASS_PATH = /^\/api\/device\//
