import { NextResponse } from 'next/server'
import { COOKIE, ensureUser, normalizePhone, signSession, verifyCode } from '@/lib/onething/core'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string; code?: string }
  const phone = normalizePhone(body.phone ?? '')
  const code = (body.code ?? '').replace(/\D/g, '')
  if (!phone || code.length !== 6) return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 })
  if (!(await verifyCode(phone, code))) {
    return NextResponse.json({ error: 'That code is wrong or expired.' }, { status: 401 })
  }
  const user = await ensureUser(phone)
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: COOKIE,
    value: signSession(user.id),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return res
}
