import { NextResponse } from 'next/server'
import { authenticate, setSessionCookie } from '@/lib/jam/auth'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { username?: string; password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.username || !body.password) {
    return NextResponse.json({ error: 'username and password required' }, { status: 400 })
  }
  const user = await authenticate(body.username, body.password)
  if (!user) return NextResponse.json({ error: 'Wrong username or password.' }, { status: 401 })
  const res = NextResponse.json({ user })
  setSessionCookie(res, user.id)
  return res
}
