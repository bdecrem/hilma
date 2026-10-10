import { NextResponse } from 'next/server'
import { getSessionUser, sessionCookie } from '@/lib/dolly/auth'
import { isValidTz, updateUser, type User } from '@/lib/dolly/core'
import { isLanguage, isLevel } from '@/lib/dolly/language'
import { userView } from '@/lib/dolly/view'

export const runtime = 'nodejs'

// GET /api/dolly/me — who is signed in (the cookie is re-issued).
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const res = NextResponse.json({ user: userView(user) })
  res.cookies.set(sessionCookie(user.id))
  return res
}

// PUT /api/dolly/me { name?, language?, level?, daily_hour?, tz? } — settings.
export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Partial<User> = {}
  if ('name' in body) patch.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : null
  if ('language' in body) {
    if (!isLanguage(body.language)) return NextResponse.json({ error: 'bad language' }, { status: 400 })
    patch.language = body.language
  }
  if ('level' in body) {
    if (!isLevel(body.level)) return NextResponse.json({ error: 'bad level' }, { status: 400 })
    patch.level = body.level
  }
  if ('daily_hour' in body) {
    const h = body.daily_hour
    if (!Number.isInteger(h) || (h as number) < 0 || (h as number) > 23) return NextResponse.json({ error: 'bad hour' }, { status: 400 })
    patch.daily_hour = h as number
  }
  if ('tz' in body) {
    if (typeof body.tz !== 'string' || !isValidTz(body.tz)) return NextResponse.json({ error: 'bad tz' }, { status: 400 })
    patch.tz = body.tz
  }
  const next = Object.keys(patch).length ? await updateUser(user.id, patch) : user
  return NextResponse.json({ user: userView(next) })
}
