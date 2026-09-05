// Jam accounts: username + password, HMAC-signed session cookie.
// Same shape as F2 auth (src/lib/f2/auth.ts) but its own users table and
// secret — Jam accounts are not Feynd accounts.

import { createHmac, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { jamDb } from './db'

export type JamUser = { id: string; username: string }

const COOKIE_NAME = 'jam_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90 // 90 days

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/
const PASSWORD_MIN = 4

function secret(): string {
  const s = process.env.JAM_SESSION_SECRET
  if (!s) throw new Error('JAM_SESSION_SECRET not set')
  return s
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function validateCredentials(username: string, password: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return 'Username: 2–32 characters, letters, numbers, dots, dashes or underscores.'
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return `Password: at least ${PASSWORD_MIN} characters.`
  }
  return null
}

function sign(userId: string): string {
  const exp = Date.now() + COOKIE_MAX_AGE * 1000
  const payload = `${userId}.${exp}`
  const sig = createHmac('sha256', secret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function verify(token: string): { userId: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, expStr, sig] = parts
  const expected = createHmac('sha256', secret()).update(`${userId}.${expStr}`).digest('hex')
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return null
  return { userId }
}

export function setSessionCookie(res: NextResponse, userId: string): void {
  res.cookies.set({
    name: COOKIE_NAME,
    value: sign(userId),
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

/** The signed-in user, or null. */
export async function getJamUser(): Promise<JamUser | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  const v = verify(token)
  if (!v) return null
  const { data, error } = await jamDb()
    .from('jam_users')
    .select('id, username')
    .eq('id', v.userId)
    .maybeSingle()
  if (error || !data) return null
  return data as JamUser
}

export async function createUser(
  usernameRaw: string,
  password: string,
): Promise<JamUser | { error: string; status: number }> {
  const username = normalizeUsername(usernameRaw)
  const invalid = validateCredentials(username, password)
  if (invalid) return { error: invalid, status: 400 }
  const password_hash = await bcrypt.hash(password, 10)
  const { data, error } = await jamDb()
    .from('jam_users')
    .insert({ username, password_hash })
    .select('id, username')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return { error: 'That username is taken.', status: 409 }
    console.error('[jam] createUser failed:', error)
    return { error: 'Could not create the account.', status: 500 }
  }
  return data as JamUser
}

export async function authenticate(
  usernameRaw: string,
  password: string,
): Promise<JamUser | null> {
  const username = normalizeUsername(usernameRaw)
  const { data } = await jamDb()
    .from('jam_users')
    .select('id, username, password_hash')
    .eq('username', username)
    .maybeSingle()
  if (!data) return null
  const ok = await bcrypt.compare(password, data.password_hash as string)
  if (!ok) return null
  return { id: data.id as string, username: data.username as string }
}
