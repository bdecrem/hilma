import { createHmac, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { f2Supabase } from './supabase'

export type F2User = {
  id: string
  username: string
  avatar_url: string | null
}

const COOKIE_NAME = 'f2_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function sessionSecret(): string {
  const s = process.env.F2_SESSION_SECRET
  if (!s) throw new Error('F2_SESSION_SECRET not set')
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

export async function getSessionUser(): Promise<F2User | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  const verified = verifySession(token)
  if (!verified) return null
  const { data, error } = await f2Supabase()
    .from('f2_users')
    .select('id, username, avatar_url')
    .eq('id', verified.userId)
    .maybeSingle()
  if (error || !data) return null
  return data as F2User
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

export function getImessageDefaultUserId(): string {
  const id = process.env.F2_DEFAULT_IMESSAGE_USER_ID
  if (!id) throw new Error('F2_DEFAULT_IMESSAGE_USER_ID not set')
  return id
}

export async function findUserByUsername(
  username: string,
): Promise<{ id: string; password_hash: string } | null> {
  const { data, error } = await f2Supabase()
    .from('f2_users')
    .select('id, password_hash')
    .eq('username', username.toLowerCase())
    .maybeSingle()
  if (error || !data) return null
  return data as { id: string; password_hash: string }
}
