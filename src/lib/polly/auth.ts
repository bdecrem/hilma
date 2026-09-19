import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { pollySupabase } from './supabase'

export type PollyUser = {
  id: string
  username: string
  avatar_url: string | null
  /// Auto-created try-before-signup account (claimable via /auth/claim).
  is_guest?: boolean
  /// The Settings "Refresher" toggle; false = mastery is forever.
  recert_enabled?: boolean
  /// Active course's language code (it/fr/ko); null until the first run picked one.
  language?: string | null
}

const COOKIE_NAME = 'polly_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,23}$/

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

export async function getSessionUser(): Promise<PollyUser | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  const verified = verifySession(token)
  if (!verified) return null
  const { data, error } = await pollySupabase()
    .from('polly_users')
    .select('id, username, avatar_url, is_guest, recert_enabled, account_id, active_course:polly_courses!polly_users_active_course_id_fkey(language)')
    .eq('id', verified.userId)
    .maybeSingle()
  if (error || !data) return null
  const { active_course, account_id, ...user } = data as unknown as PollyUser & {
    active_course: { language: string } | null
    account_id: string | null
  }
  // A language profile (schema 007) shows the account's name, not its own
  // internal "<name>+<lang>" handle.
  if (account_id) {
    const { data: root } = await pollySupabase()
      .from('polly_users')
      .select('username')
      .eq('id', account_id)
      .maybeSingle()
    if (root?.username) user.username = root.username as string
  }
  return { ...user, language: active_course?.language ?? null }
}

/// Create a claimable guest account — the try-before-signup path. Username
/// is an opaque handle; the random password is never shown (the session
/// cookie is the only key until the account is claimed).
export async function createGuestUser(input: { username?: string } = {}): Promise<
  { id: string; username: string } | { error: string; status: number }
> {
  let username: string
  if (input.username !== undefined) {
    // First-run "what should Polly call you?" — the name is the account.
    const chosen = input.username.trim()
    if (!USERNAME_RE.test(chosen)) {
      return { error: 'Names are 2–24 letters, numbers, dots, dashes or underscores.', status: 400 }
    }
    const { data: taken } = await pollySupabase()
      .from('polly_users')
      .select('id')
      .ilike('username', chosen)
      .maybeSingle()
    if (taken) return { error: 'That name is taken — try another.', status: 409 }
    username = chosen
  } else {
    username = `guest-${randomBytes(6).toString('hex')}`
  }
  const password_hash = await hashPassword(randomBytes(24).toString('hex'))
  const { data, error } = await pollySupabase()
    .from('polly_users')
    .insert({ username, password_hash, is_guest: true })
    .select('id, username')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return { error: 'That name is taken — try another.', status: 409 }
    console.error('[polly] createGuestUser failed:', error)
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
  const sb = pollySupabase()
  const { data: existing } = await sb
    .from('polly_users')
    .select('id')
    .or(`username.eq.${email},email.ilike.${email}`)
    .maybeSingle()
  if (existing && existing.id !== userId) {
    return { error: 'An account with that email already exists.', status: 409 }
  }
  const password_hash = await hashPassword(input.password)
  const { data, error } = await sb
    .from('polly_users')
    .update({ username: email, email, password_hash, is_guest: false })
    .eq('id', userId)
    .eq('is_guest', true)
    .select('id, username')
    .maybeSingle()
  if (error || !data) {
    if (error?.code === '23505') {
      return { error: 'An account with that email already exists.', status: 409 }
    }
    console.error('[polly] claimGuestAccount failed:', error)
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
  const sb = pollySupabase()
  // Try username first (covers existing accounts + new email-as-username).
  const { data: byUser } = await sb
    .from('polly_users')
    .select('id, password_hash')
    .eq('username', lower)
    .maybeSingle()
  if (byUser) return byUser as { id: string; password_hash: string }

  // Fall back to email lookup for users who happened to register with a
  // separate display username at some future point.
  const { data: byEmail } = await sb
    .from('polly_users')
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

  const sb = pollySupabase()
  // Pre-check both columns to give a clean 409 instead of a Postgres error.
  const { data: existing } = await sb
    .from('polly_users')
    .select('id')
    .or(`username.eq.${email},email.ilike.${email}`)
    .maybeSingle()
  if (existing) {
    return { error: 'An account with that email already exists.', status: 409 }
  }

  const password_hash = await hashPassword(input.password)
  const { data, error } = await sb
    .from('polly_users')
    .insert({ username: email, email, password_hash })
    .select('id, username, email')
    .single()
  if (error || !data) {
    // Unique-constraint race: two signups for the same email at once. The
    // pre-check above missed it, but the DB constraint holds the line.
    if (error?.code === '23505') {
      return { error: 'An account with that email already exists.', status: 409 }
    }
    console.error('[polly] createUser failed:', error)
    return { error: 'Could not create account.', status: 500 }
  }
  return data as { id: string; username: string; email: string }
}
