import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { f2Supabase } from '@/lib/f2/supabase'

// Takt accounts (apps/takt, schema apps/takt/schema/001): Dodo's shape — a guest on first
// launch, claimed in place by email + password, a signed session cookie — in tables of its
// own (takt_users, takt_progress) in the same Supabase project. The cookie is signed with
// F2_SESSION_SECRET under a "takt." domain, so a Dodo cookie never opens Takt and the other
// way round.

export type TaktUser = {
  id: string
  email: string | null
  is_guest: boolean
}

const COOKIE_NAME = 'takt_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // a year: the app has no other key to a guest

function secret(): string {
  const s = process.env.F2_SESSION_SECRET
  if (!s) throw new Error('F2_SESSION_SECRET not set')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(`takt.${payload}`).digest('hex')
}

export function signSession(userId: string): string {
  const exp = Date.now() + COOKIE_MAX_AGE * 1000
  const payload = `${userId}.${exp}`
  return `${payload}.${sign(payload)}`
}

export function verifySession(token: string): { userId: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, expStr, sig] = parts
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(sign(`${userId}.${expStr}`), 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return null
  return { userId }
}

export async function getSessionUser(): Promise<TaktUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  const verified = verifySession(token)
  if (!verified) return null
  const { data, error } = await f2Supabase()
    .from('takt_users')
    .select('id, email, is_guest')
    .eq('id', verified.userId)
    .maybeSingle()
  if (error) throw new Error(`takt_users: ${error.message}`)
  return (data as TaktUser | null) ?? null
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

type Failure = { error: string; status: number }

function checkCredentials(email: string, password: string): Failure | null {
  if (!isValidEmail(email)) return { error: 'That email doesn’t look right.', status: 400 }
  if (password.length < 8) return { error: 'Use a password of 8 or more characters.', status: 400 }
  return null
}

/// A guest: no email, a random password nobody sees; the cookie is its only key.
export async function createGuest(): Promise<TaktUser | Failure> {
  const password_hash = await bcrypt.hash(randomBytes(24).toString('hex'), 10)
  const { data, error } = await f2Supabase()
    .from('takt_users')
    .insert({ password_hash, is_guest: true })
    .select('id, email, is_guest')
    .single()
  if (error || !data) {
    console.error('[takt] createGuest failed:', error)
    return { error: 'Could not start a session.', status: 500 }
  }
  return data as TaktUser
}

/// Sign up: the guest becomes a real account in place (same id, same progress).
export async function claimGuest(userId: string, emailIn: string, password: string): Promise<TaktUser | Failure> {
  const email = emailIn.trim().toLowerCase()
  const bad = checkCredentials(email, password)
  if (bad) return bad
  const password_hash = await bcrypt.hash(password, 10)
  const { data, error } = await f2Supabase()
    .from('takt_users')
    .update({ email, password_hash, is_guest: false })
    .eq('id', userId)
    .eq('is_guest', true)
    .select('id, email, is_guest')
    .maybeSingle()
  if (error?.code === '23505') return { error: 'There’s already an account with that email. Log in instead.', status: 409 }
  if (error) {
    console.error('[takt] claimGuest failed:', error)
    return { error: 'Could not create the account.', status: 500 }
  }
  if (!data) return { error: 'This device is already signed in to an account.', status: 409 }
  return data as TaktUser
}

/// Sign up without a guest (a fresh client): a new real account.
export async function createAccount(emailIn: string, password: string): Promise<TaktUser | Failure> {
  const email = emailIn.trim().toLowerCase()
  const bad = checkCredentials(email, password)
  if (bad) return bad
  const password_hash = await bcrypt.hash(password, 10)
  const { data, error } = await f2Supabase()
    .from('takt_users')
    .insert({ email, password_hash, is_guest: false })
    .select('id, email, is_guest')
    .single()
  if (error?.code === '23505') return { error: 'There’s already an account with that email. Log in instead.', status: 409 }
  if (error || !data) {
    console.error('[takt] createAccount failed:', error)
    return { error: 'Could not create the account.', status: 500 }
  }
  return data as TaktUser
}

export async function logIn(emailIn: string, password: string): Promise<TaktUser | Failure> {
  const email = emailIn.trim().toLowerCase()
  const { data, error } = await f2Supabase()
    .from('takt_users')
    .select('id, email, is_guest, password_hash')
    .eq('email', email)
    .maybeSingle()
  if (error) {
    console.error('[takt] logIn failed:', error)
    return { error: 'Could not log in.', status: 500 }
  }
  if (!data || !(await bcrypt.compare(password, data.password_hash as string))) {
    return { error: 'That email and password don’t match.', status: 401 }
  }
  return { id: data.id, email: data.email, is_guest: data.is_guest } as TaktUser
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
  res.cookies.set({ name: COOKIE_NAME, value: '', httpOnly: true, path: '/', maxAge: 0 })
}
