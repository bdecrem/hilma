// Passwords for the front desk (2026-11-17: "a normal login with an optional passkey").
//
// The hash. scrypt from Node's own crypto (no dependency in the process that holds every session):
// N = 2^17, r = 8, p = 1, a 16-byte random salt, a 32-byte result. That is OWASP's Password Storage
// Cheat Sheet's scrypt setting (minimum CPU/memory cost 2^17, block size 8, parallelism 1: 128 MiB
// and, measured on the Mac mini, about 0.25 s per hash). A stored hash names its own parameters
// (`scrypt$17$8$1$<salt>$<hash>`, base64url), so they can be raised later and old hashes still check.
// At most two hashes run at once (each holds 128 MiB); the rest wait their turn, so a burst of
// sign-ins cannot take the machine's memory.
//
// What a password must be (NIST SP 800-63B-4, 3.1.1.2): at least 8 characters by default (the
// owner's choice, 2026-11-17; NIST's floor for a password used alone is 15, and OLA_FD_PASSWORD_MIN
// may raise it to anything from 8 to 64, never below 8), at most 256; any
// characters, spaces included, compared after Unicode NFKC normalization; no rules about kinds of
// characters; not one of the most common passwords (common-passwords.txt, bundled), nor such a
// word repeated or with digits and signs around it, nor the person's own handle, nor one character
// over and over. The refusals are plain sentences.
//
// Nothing here logs. A password or a hash never leaves this file except as the hash to store.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const SCRYPT = { log2N: 17, r: 8, p: 1, keylen: 32, saltlen: 16 }
export const MAX_LENGTH = 256
const MAXMEM = 288 * 1024 * 1024 // 128 * N * r = 128 MiB, with room

/** The shortest password allowed: OLA_FD_PASSWORD_MIN (8 to 64), 8 by default. */
export function minLength(env = process.env) {
  const v = env.OLA_FD_PASSWORD_MIN === undefined ? 8 : Number(env.OLA_FD_PASSWORD_MIN)
  if (!Number.isInteger(v) || v < 8 || v > 64) throw new Error('OLA_FD_PASSWORD_MIN must be a whole number from 8 to 64')
  return v
}

const COMMON = new Set(
  readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#')),
)
export const commonCount = () => COMMON.size

/** The form a password is hashed and compared in. */
export const normalize = (pw) => String(pw).normalize('NFKC')

/**
 * Why this password will not do, as one sentence for the person, or null if it is fine.
 * `handle` is the person's own (a password that is their name, or contains it, is refused).
 */
export function passwordProblem(pw, { handle = '', min = minLength() } = {}) {
  if (typeof pw !== 'string') return 'Type a password.'
  const p = normalize(pw)
  const chars = [...p].length
  if (chars < min) return `Use at least ${min} characters. A few words in a row works well, like a short sentence you will remember.`
  if (chars > MAX_LENGTH) return `Use at most ${MAX_LENGTH} characters.`
  if (/[\u0000-\u001f\u007f]/.test(p)) return 'A password cannot have a line break or a tab in it.'
  const low = p.toLowerCase()
  if (new Set(low.replace(/\s/g, '')).size <= 2) return 'That password is one or two characters over and over. Choose something harder to guess.'
  if (handle && low.replace(/[^a-z0-9]/g, '').includes(handle.toLowerCase().replace(/[^a-z0-9]/g, ''))) return 'Your password cannot have your name for Ola in it.'
  if (isCommon(low)) return 'That is one of the most common passwords, so it is among the first anyone tries. Choose something else.'
  return null
}

/** One of the common passwords, or one of them repeated, or with digits and signs around it. */
function isCommon(low) {
  const forms = new Set([low, low.replace(/\s+/g, ''), low.replace(/[^a-z]/g, ''), low.replace(/^[^a-z]+|[^a-z]+$/g, '')])
  for (const f of forms) {
    if (!f) continue
    if (COMMON.has(f)) return true
    // The same common word over and over ("passwordpassword", "iloveyouiloveyou").
    for (let n = 1; n <= f.length / 2; n++) if (f.length % n === 0 && f.slice(0, n).repeat(f.length / n) === f && COMMON.has(f.slice(0, n))) return true
  }
  // A run of keys or digits ("123456789012345", "qwertyuiopasdfg").
  const runs = ['0123456789012345678901234567890', '9876543210987654321098765432109', 'qwertyuiopasdfghjklzxcvbnm', 'abcdefghijklmnopqrstuvwxyz', '1qaz2wsx3edc4rfv5tgb6yhn7ujm']
  const bare = low.replace(/\s+/g, '')
  return runs.some((r) => r.includes(bare))
}

// ------------------------------------------------------------------ hashing, two at a time
let running = 0
const waiting = []
async function slot(fn) {
  if (running >= 2) await new Promise((r) => waiting.push(r))
  running++
  try {
    return await fn()
  } finally {
    running--
    waiting.shift()?.()
  }
}
const derive = (pw, salt, { log2N, r, p, keylen }) =>
  slot(
    () =>
      new Promise((resolve, reject) =>
        scrypt(Buffer.from(normalize(pw), 'utf8'), salt, keylen, { N: 2 ** log2N, r, p, maxmem: MAXMEM }, (e, k) => (e ? reject(e) : resolve(k))),
      ),
  )
const b64 = (b) => Buffer.from(b).toString('base64url')

/** The string to store for a password. */
export async function hashPassword(pw) {
  const salt = randomBytes(SCRYPT.saltlen)
  const key = await derive(pw, salt, SCRYPT)
  return `scrypt$${SCRYPT.log2N}$${SCRYPT.r}$${SCRYPT.p}$${b64(salt)}$${b64(key)}`
}

const STORED = /^scrypt\$(1[0-9]|20)\$([1-9]|1[0-6])\$([1-4])\$([A-Za-z0-9_-]{16,64})\$([A-Za-z0-9_-]{32,128})$/
/**
 * Does `pw` match `stored`? With no stored hash (no such person, or a person with no password) the
 * same work is done against a made-up hash and the answer is false, so the time taken does not say
 * which it was. The comparison is constant-time.
 */
export async function verifyPassword(pw, stored) {
  const m = typeof stored === 'string' ? STORED.exec(stored) : null
  const params = m ? { log2N: Number(m[1]), r: Number(m[2]), p: Number(m[3]), keylen: Buffer.from(m[5], 'base64url').length } : SCRYPT
  const salt = m ? Buffer.from(m[4], 'base64url') : DUMMY_SALT
  const want = m ? Buffer.from(m[5], 'base64url') : DUMMY_KEY
  const given = typeof pw === 'string' && [...pw].length <= MAX_LENGTH ? pw : ''
  const got = await derive(given, salt, params)
  return timingSafeEqual(got, want) && m !== null
}
const DUMMY_SALT = randomBytes(SCRYPT.saltlen)
const DUMMY_KEY = randomBytes(SCRYPT.keylen)

/** Whether a stored hash was made with weaker parameters than today's (to rehash at the next sign-in). */
export function needsRehash(stored) {
  const m = STORED.exec(stored ?? '')
  return !m || Number(m[1]) < SCRYPT.log2N || Number(m[2]) < SCRYPT.r
}
