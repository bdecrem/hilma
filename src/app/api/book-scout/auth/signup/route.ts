import { NextResponse } from 'next/server'
import { bookScoutDb } from '@/lib/book-scout/db'
import { hashPassword, isValidEmail, setSessionCookie } from '@/lib/book-scout/auth'

export const runtime = 'nodejs'

// The legacy single-user library (seeded for Bart) is claimed by this account.
const ADMIN_EMAIL = 'bdecrem@gmail.com'

export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const email = body.email?.trim().toLowerCase()
  const password = body.password || ''
  if (!email || !isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  const db = bookScoutDb()
  const { data: existing } = await db.from('book_scout_users').select('id').eq('email', email).maybeSingle()
  if (existing) return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })

  const is_admin = email === ADMIN_EMAIL
  const password_hash = await hashPassword(password)
  const { data: user, error } = await db
    .from('book_scout_users')
    .insert({ email, password_hash, is_admin })
    .select('id, email, is_admin')
    .single()
  if (error || !user) return NextResponse.json({ error: 'Could not create account.' }, { status: 500 })

  // Admin claims the pre-seeded library (the existing 200 books with no owner).
  if (is_admin) {
    await db.from('book_scout_library').update({ user_id: user.id }).is('user_id', null)
  }

  const res = NextResponse.json({ user })
  setSessionCookie(res, user.id)
  return res
}
