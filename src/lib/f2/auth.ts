import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { f2Supabase } from './supabase'

export type F2User = {
  id: string
  username: string
  avatar_url: string | null
  /// Auto-created try-before-signup account (claimable via /auth/claim).
  is_guest?: boolean
  /// The Settings "Refresher" toggle; false = mastery is forever.
  recert_enabled?: boolean
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
    .select('id, username, avatar_url, is_guest, recert_enabled')
    .eq('id', verified.userId)
    .maybeSingle()
  if (error || !data) return null
  return data as F2User
}

/// Create a claimable guest account — the try-before-signup path. Username
/// is an opaque handle; the random password is never shown (the session
/// cookie is the only key until the account is claimed).
export async function createGuestUser(): Promise<
  { id: string; username: string } | { error: string; status: number }
> {
  const suffix = randomBytes(6).toString('hex')
  const username = `guest-${suffix}`
  const password_hash = await hashPassword(randomBytes(24).toString('hex'))
  const { data, error } = await f2Supabase()
    .from('f2_users')
    .insert({ username, password_hash, is_guest: true })
    .select('id, username')
    .single()
  if (error || !data) {
    console.error('[f2] createGuestUser failed:', error)
    return { error: 'Could not start a session.', status: 500 }
  }
  return data as { id: string; username: string }
}

/// Turn a guest into a real account IN PLACE: same user id, same topics,
/// cards, XP — just real credentials on the row.
export async function claimGuestAccount(
  userId: string,
  input: { email: string; password: string },
): Promise<{ id: string; username: string } | { error: string; status: number }> {
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email)) return { error: 'Invalid email.', status: 400 }
  if (input.password.length < 8) {
    return { error: 'Password must be at least 8 characters.', status: 400 }
  }
  const sb = f2Supabase()
  const { data: existing } = await sb
    .from('f2_users')
    .select('id')
    .or(`username.eq.${email},email.ilike.${email}`)
    .maybeSingle()
  if (existing && existing.id !== userId) {
    return { error: 'An account with that email already exists.', status: 409 }
  }
  const password_hash = await hashPassword(input.password)
  const { data, error } = await sb
    .from('f2_users')
    .update({ username: email, email, password_hash, is_guest: false })
    .eq('id', userId)
    .eq('is_guest', true)
    .select('id, username')
    .maybeSingle()
  if (error || !data) {
    if (error?.code === '23505') {
      return { error: 'An account with that email already exists.', status: 409 }
    }
    console.error('[f2] claimGuestAccount failed:', error)
    return { error: 'Could not create the account.', status: 500 }
  }
  return data as { id: string; username: string }
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

/// Look up a user by either their username or their email (case-insensitive).
/// New email signups have username = lowercased email, so the username query
/// alone covers most cases — but we also fall back to email for safety.
export async function findUserByIdentifier(
  identifier: string,
): Promise<{ id: string; password_hash: string } | null> {
  const lower = identifier.toLowerCase()
  const sb = f2Supabase()
  // Try username first (covers existing accounts + new email-as-username).
  const { data: byUser } = await sb
    .from('f2_users')
    .select('id, password_hash')
    .eq('username', lower)
    .maybeSingle()
  if (byUser) return byUser as { id: string; password_hash: string }

  // Fall back to email lookup for users who happened to register with a
  // separate display username at some future point.
  const { data: byEmail } = await sb
    .from('f2_users')
    .select('id, password_hash')
    .ilike('email', lower)
    .maybeSingle()
  if (byEmail) return byEmail as { id: string; password_hash: string }

  return null
}

/// Back-compat alias — earlier callers used this name.
export const findUserByUsername = findUserByIdentifier

export function isValidEmail(s: string): boolean {
  // Pragmatic check, not RFC-5322 perfect. Good enough to reject typos.
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(s.trim())
}

export async function createUser(input: {
  email: string
  password: string
}): Promise<{ id: string; username: string; email: string } | { error: string; status: number }> {
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email)) return { error: 'Invalid email.', status: 400 }
  if (input.password.length < 8) {
    return { error: 'Password must be at least 8 characters.', status: 400 }
  }

  const sb = f2Supabase()
  // Pre-check both columns to give a clean 409 instead of a Postgres error.
  const { data: existing } = await sb
    .from('f2_users')
    .select('id')
    .or(`username.eq.${email},email.ilike.${email}`)
    .maybeSingle()
  if (existing) {
    return { error: 'An account with that email already exists.', status: 409 }
  }

  const password_hash = await hashPassword(input.password)
  const { data, error } = await sb
    .from('f2_users')
    .insert({ username: email, email, password_hash })
    .select('id, username, email')
    .single()
  if (error || !data) {
    // Unique-constraint race: two signups for the same email at once. The
    // pre-check above missed it, but the DB constraint holds the line.
    if (error?.code === '23505') {
      return { error: 'An account with that email already exists.', status: 409 }
    }
    console.error('[f2] createUser failed:', error)
    return { error: 'Could not create account.', status: 500 }
  }
  return data as { id: string; username: string; email: string }
}
