import { NextResponse } from 'next/server'
import { bookScoutDb } from '@/lib/book-scout/db'
import { verifyPassword, setSessionCookie } from '@/lib/book-scout/auth'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const email = body.email?.trim().toLowerCase()
  const password = body.password || ''
  if (!email || !password) return NextResponse.json({ error: 'Email and password required.' }, { status: 400 })

  const { data: user } = await bookScoutDb()
    .from('book_scout_users')
    .select('id, email, is_admin, password_hash')
    .eq('email', email)
    .maybeSingle()
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 })
  }

  const res = NextResponse.json({ user: { id: user.id, email: user.email, is_admin: user.is_admin } })
  setSessionCookie(res, user.id)
  return res
}
