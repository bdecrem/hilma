import { NextResponse } from 'next/server'
import { APP_COOKIE, login, sessionValue } from '@/lib/kochito/app-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { name, passcode } → sets the session cookie. See src/lib/kochito/app-auth.ts.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const out = await login(body.name, body.passcode, ip)
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status })
  const s = sessionValue(out.user)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(APP_COOKIE, s.value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: s.maxAge })
  return res
}
