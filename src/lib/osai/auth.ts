// osai readers: three fixed names behind one shared passcode, HMAC-signed
// session cookie. Same shape as Jam auth (src/lib/jam/auth.ts) minus the
// users table: the names are a constant and the passcode is an env var.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'

export const OSAI_USERS = ['mitchell', 'songyee', 'bart'] as const
export type OsaiUser = (typeof OSAI_USERS)[number]

export const DISPLAY: Record<OsaiUser, string> = {
  mitchell: 'Mitchell',
  songyee: 'Songyee',
  bart: 'Bart',
}

export const FULL_NAME: Record<OsaiUser, string> = {
  mitchell: 'Mitchell Baker',
  songyee: 'Songyee Yoon',
  bart: 'Bart Decrem',
}

const COOKIE_NAME = 'osai_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90 // 90 days

export function isOsaiUser(s: unknown): s is OsaiUser {
  return typeof s === 'string' && (OSAI_USERS as readonly string[]).includes(s)
}

function secret(): string {
  const s = process.env.OSAI_SESSION_SECRET
  if (!s) throw new Error('OSAI_SESSION_SECRET not set')
  return s
}

export function passcodeOk(code: unknown): boolean {
  const expected = process.env.OSAI_PASSCODE
  if (!expected) throw new Error('OSAI_PASSCODE not set')
  if (typeof code !== 'string') return false
  const a = Buffer.from(code.trim())
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function sign(user: OsaiUser): string {
  const exp = Date.now() + COOKIE_MAX_AGE * 1000
  const payload = `${user}.${exp}`
  const sig = createHmac('sha256', secret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function verify(token: string): OsaiUser | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [user, expStr, sig] = parts
  const expected = createHmac('sha256', secret()).update(`${user}.${expStr}`).digest('hex')
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return null
  return isOsaiUser(user) ? user : null
}

export function setSessionCookie(res: NextResponse, user: OsaiUser): void {
  res.cookies.set({
    name: COOKIE_NAME,
    value: sign(user),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

/** The signed-in reader, or null. */
export async function getOsaiUser(): Promise<OsaiUser | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    return verify(token)
  } catch {
    return null
  }
}
