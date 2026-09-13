import { NextResponse, after } from 'next/server'
import { COOKIE, ensureUser, findUserByPhone, isValidTz, normalizePhone, setUserTz, signSession, verifyCode, welcomeNewUser } from '@/lib/onething/core'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string; code?: string; tz?: string }
  const phone = normalizePhone(body.phone ?? '')
  const code = (body.code ?? '').replace(/\D/g, '')
  // The browser's zone; the daily texts follow it. Ignored when it is not a real zone.
  const tz = typeof body.tz === 'string' && isValidTz(body.tz) ? body.tz : undefined
  if (!phone || code.length !== 6) return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 })
  if (!(await verifyCode(phone, code))) {
    return NextResponse.json({ error: 'That code is wrong or expired.' }, { status: 401 })
  }
  const existing = await findUserByPhone(phone)
  const user = existing
    ? (tz ? await setUserTz(existing, tz) : existing)
    : await ensureUser(phone, 'web', tz)
  if (!existing) {
    // First sign-in from this number: the account exists now; say hello and ask
    // today's question after the response goes out (a send can take ~15s).
    after(async () => {
      try {
        await welcomeNewUser(user)
      } catch (e) {
        console.error('[onething] welcome send failed', e)
      }
    })
  }
  const res = NextResponse.json({ ok: true, created: !existing })
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
