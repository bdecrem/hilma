import { NextResponse, after } from 'next/server'
import { normalizePhone, sessionCookie, verifyCode } from '@/lib/dolly/auth'
import { createUser, findUserByPhone, isValidTz, updateUser } from '@/lib/dolly/core'
import { isLanguage, isLevel } from '@/lib/dolly/language'
import { welcome } from '@/lib/dolly/tick'
import { userView } from '@/lib/dolly/view'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/dolly/auth/verify { phone, code, tz, language?, level?, daily_hour? }
// — the code checks out: a returning number signs in, a new one becomes an
// account with what onboarding chose, gets its hello by text, and day 1 exists.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    phone?: string
    code?: string
    tz?: string
    locale?: string
    language?: string
    level?: string
    daily_hour?: number
    name?: string
  }
  const phone = normalizePhone(body.phone ?? '', { tz: body.tz, locale: body.locale })
  const code = (body.code ?? '').replace(/\D/g, '')
  if (!phone || code.length !== 6) return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 })
  if (!(await verifyCode(phone, code))) return NextResponse.json({ error: 'That code is wrong or expired.' }, { status: 401 })

  const tz = typeof body.tz === 'string' && isValidTz(body.tz) ? body.tz : undefined
  const existing = await findUserByPhone(phone)
  let user = existing
  if (user) {
    if (tz && tz !== user.tz) user = await updateUser(user.id, { tz })
  } else {
    const hour = Number.isInteger(body.daily_hour) && body.daily_hour! >= 0 && body.daily_hour! < 24 ? body.daily_hour! : 8
    user = await createUser({
      phone,
      language: isLanguage(body.language) ? body.language : 'es',
      level: isLevel(body.level) ? body.level : 'new',
      daily_hour: hour,
      tz: tz ?? 'America/Los_Angeles',
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : null,
    })
    const created = user
    after(async () => {
      try {
        await welcome(created)
      } catch (e) {
        console.error('[dolly] welcome failed', e)
      }
    })
  }
  const res = NextResponse.json({ ok: true, created: !existing, user: userView(user) })
  res.cookies.set(sessionCookie(user.id))
  return res
}
