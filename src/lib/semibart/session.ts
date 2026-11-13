import { createHmac, timingSafeEqual } from 'node:crypto'

// The session cookie: "<user id>.<session version>.<expiry ms>.<hmac>", signed with
// SEMIBART_SESSION_SECRET under a "semibart." domain so no other app's cookie opens it.
// Changing your passcode bumps the session version, which ends every other session.

export const COOKIE = 'semibart_session'
const MAX_AGE = 60 * 60 * 24 * 120 // a fellowship year, roughly

function secret(): string {
  const s = process.env.SEMIBART_SESSION_SECRET
  if (!s) throw new Error('SEMIBART_SESSION_SECRET is not set')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(`semibart.${payload}`).digest('hex')
}

export function makeToken(userId: string, version: number): string {
  const payload = `${userId}.${version}.${Date.now() + MAX_AGE * 1000}`
  return `${payload}.${sign(payload)}`
}

export function readToken(token: string): { userId: string; version: number } | null {
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [userId, version, exp, sig] = parts
  const a = Buffer.from(sig, 'hex'), b = Buffer.from(sign(`${userId}.${version}.${exp}`), 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (!(Number(exp) > Date.now())) return null
  return { userId, version: Number(version) }
}

export function cookieFrom(req: Request, name = COOKIE): string | null {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

function secure(req: Request): boolean {
  return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https'
}

export function setCookie(req: Request, token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure(req) ? '; Secure' : ''}`
}

export function clearCookie(req: Request): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure(req) ? '; Secure' : ''}`
}
