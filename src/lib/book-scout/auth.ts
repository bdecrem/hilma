import { createHmac, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { bookScoutDb } from './db'

export type DogEarUser = { id: string; email: string; is_admin: boolean }

const COOKIE = 'dogear_session'
const MAX_AGE = 60 * 60 * 24 * 60 // 60 days

function secret(): string {
  // Reuse the F2 session secret (set in Vercel + .env.local). Fail loudly if absent.
  const s = process.env.F2_SESSION_SECRET || process.env.BOOK_SCOUT_PASSWORD
  if (!s) throw new Error('no session secret (F2_SESSION_SECRET / BOOK_SCOUT_PASSWORD)')
  return s
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

function sign(userId: string): string {
  const exp = Date.now() + MAX_AGE * 1000
  const payload = `${userId}.${exp}`
  const sig = createHmac('sha256', secret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function verify(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, expStr, sig] = parts
  const expected = createHmac('sha256', secret()).update(`${userId}.${expStr}`).digest('hex')
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return null
  return userId
}

export function setSessionCookie(res: NextResponse, userId: string): void {
  res.cookies.set({
    name: COOKIE, value: sign(userId), httpOnly: true,
    secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  })
}
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({ name: COOKIE, value: '', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
}

// Current logged-in Dog-Ear user (or null).
export async function getSessionUser(): Promise<DogEarUser | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null
  const userId = verify(token)
  if (!userId) return null
  const { data } = await bookScoutDb()
    .from('book_scout_users')
    .select('id, email, is_admin')
    .eq('id', userId)
    .maybeSingle()
  return (data as DogEarUser) ?? null
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

// True if the current session belongs to an admin (gates curator tools).
export async function isAdmin(): Promise<boolean> {
  const u = await getSessionUser()
  return !!u?.is_admin
}
