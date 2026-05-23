import { NextResponse } from 'next/server'
import {
  findUserByUsername,
  setSessionCookie,
  verifyPassword,
} from '@/lib/f2/auth'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const username = body.username?.trim().toLowerCase()
  const password = body.password
  if (!username || !password) {
    return NextResponse.json(
      { error: 'username and password required' },
      { status: 400 },
    )
  }

  const user = await findUserByUsername(username)
  if (!user) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }

  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }

  const res = NextResponse.json({ user: { id: user.id, username } })
  setSessionCookie(res, user.id)
  return res
}
