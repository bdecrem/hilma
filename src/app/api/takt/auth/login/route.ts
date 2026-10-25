import { NextResponse } from 'next/server'
import { logIn, setSessionCookie } from '@/lib/takt/auth'

export const runtime = 'nodejs'

// POST /api/takt/auth/login { email, password }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null
  if (!body?.email || !body.password) {
    return NextResponse.json({ error: 'Email and password, please.' }, { status: 400 })
  }
  const user = await logIn(body.email, body.password)
  if ('error' in user) return NextResponse.json({ error: user.error }, { status: user.status })
  const res = NextResponse.json({ user })
  setSessionCookie(res, user.id)
  return res
}
