import { createHmac, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { omniSupabase } from './supabase'
import { isLanguageCode } from './languages'

export type OmniUser = {
  id: string
  email: string
  display_name: string | null
  language: string
}

const COOKIE_NAME = 'omni_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function sessionSecret(): string {
  const s = process.env.OMNI_SESSION_SECRET
  if (!s) throw new Error('OMNI_SESSION_SECRET not set')
  return s
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function signSession(userId: string): string {
  const exp = Date.now() + COOKIE_MAX_AGE * 1000
  const payload = `${userId}.${exp}`
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifySession(token: string): { userId: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, expStr, sig] = parts
  const payload = `${userId}.${expStr}`
  const expected = createHmac('sha256', sessionSecret())
    .update(payload)
    .digest('hex')
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return null
  return { userId }
}

export async function getSessionUser(): Promise<OmniUser | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  const verified = verifySession(token)
  if (!verified) return null
  const { data, error } = await omniSupabase()
    .from('omni_users')
    .select('id, email, display_name, language')
    .eq('id', verified.userId)
    .maybeSingle()
  if (error || !data) return null
  return data as OmniUser
}

export function setSessionCookie(res: NextResponse, userId: string): void {
  res.cookies.set({
    name: COOKIE_NAME,
    value: signSession(userId),
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

export async function findUserByEmail(
  email: string,
): Promise<{ id: string; password_hash: string } | null> {
  const { data } = await omniSupabase()
    .from('omni_users')
    .select('id, password_hash')
    .ilike('email', email.trim().toLowerCase())
    .maybeSingle()
  return (data as { id: string; password_hash: string } | null) ?? null
}

export function isValidEmail(s: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(s.trim())
}

export async function createUser(input: {
  email: string
  password: string
  language: string
}): Promise<OmniUser | { error: string; status: number }> {
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email)) return { error: 'Invalid email.', status: 400 }
  if (input.password.length < 8) {
    return { error: 'Password must be at least 8 characters.', status: 400 }
  }
  if (!isLanguageCode(input.language)) {
    return { error: 'Unknown language.', status: 400 }
  }

  const sb = omniSupabase()
  const { data: existing } = await sb
    .from('omni_users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (existing) {
    return { error: 'An account with that email already exists.', status: 409 }
  }

  const password_hash = await hashPassword(input.password)
  const { data, error } = await sb
    .from('omni_users')
    .insert({ email, password_hash, language: input.language })
    .select('id, email, display_name, language')
    .single()
  if (error || !data) {
    console.error('[omni] createUser failed:', error)
    return { error: 'Could not create account.', status: 500 }
  }
  return data as OmniUser
}
