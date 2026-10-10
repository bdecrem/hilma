// Sign-in: a phone number, a six-digit code by iMessage, a session cookie.
// Onething's shape (src/lib/onething/core.ts), with Dolly's own tables and
// cookie. The phone number is the account: the daily text goes to it.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { normalizePhone as onethingNormalizePhone, type PhoneHint } from '@/lib/onething/core'
import { findUserById, supabase, type User } from './core'
import { sendText } from './send'

export const COOKIE = 'dolly_session'
const CODE_TTL_MIN = 10

export { type PhoneHint }

export function normalizePhone(raw: string, hint?: PhoneHint): string | null {
  return onethingNormalizePhone(raw, hint)
}

function secret(): string {
  const s = process.env.F2_SESSION_SECRET
  if (!s) throw new Error('F2_SESSION_SECRET not set')
  return s
}

export function signSession(userId: string): string {
  const sig = createHmac('sha256', secret()).update(`dolly:${userId}`).digest('hex')
  return `${userId}.${sig}`
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null
  const i = token.lastIndexOf('.')
  if (i < 0) return null
  const userId = token.slice(0, i)
  const sig = token.slice(i + 1)
  const expected = createHmac('sha256', secret()).update(`dolly:${userId}`).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return userId
}

/** A year, httpOnly, re-issued on every /me so an active person never hits the cliff. */
export function sessionCookie(userId: string) {
  return {
    name: COOKIE,
    value: signSession(userId),
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  }
}

export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies()
  const userId = verifySession(jar.get(COOKIE)?.value)
  if (!userId) return null
  return findUserById(userId)
}

// ---------- one-time codes ----------

function hashCode(phone: string, code: string): string {
  return createHash('sha256').update(`dolly:${phone}:${code}`).digest('hex')
}

export async function startCode(phone: string): Promise<void> {
  const code = (randomBytes(4).readUInt32BE(0) % 1_000_000).toString().padStart(6, '0')
  const expires_at = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString()
  const { error } = await supabase().from('dolly_codes').insert({ phone, code_hash: hashCode(phone, code), expires_at })
  if (error) throw new Error(`dolly: code insert failed: ${error.message}`)
  await sendText(phone, `Your Dolly code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`)
}

export async function verifyCode(phone: string, code: string): Promise<boolean> {
  const sb = supabase()
  const { data } = await sb
    .from('dolly_codes')
    .select('id')
    .eq('phone', phone)
    .eq('code_hash', hashCode(phone, code.trim()))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
  const row = data?.[0]
  if (!row) return false
  await sb.from('dolly_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id)
  return true
}
