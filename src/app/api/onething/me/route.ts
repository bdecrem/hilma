import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, findUserById, listEntries, localDay, scoreboard, sessionCookie, setUserName, tzFor, verifySession, LEVELS } from '@/lib/onething/core'
import { BONUS_EVERY, BONUS_POINTS, buddyViews } from '@/lib/onething/buddies'

export const runtime = 'nodejs'

export async function GET() {
  // Local screenshots only: never set on Vercel, ignored in production builds.
  const devAs = process.env.NODE_ENV !== 'production' ? process.env.ONETHING_DEV_AS : undefined
  const userId = devAs ?? verifySession((await cookies()).get(COOKIE)?.value)
  if (!userId) return NextResponse.json({ user: null })
  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ user: null })
  const entries = await listEntries(user.id)
  const today = localDay(new Date(), tzFor(user))
  const views = await buddyViews(user, today)
  const res = NextResponse.json({
    user: { phone: user.phone, since: user.created_at, tz: tzFor(user), name: user.name },
    today,
    board: scoreboard(entries, today),
    levels: LEVELS,
    entries,
    ...views,
    bonus: { every: BONUS_EVERY, points: BONUS_POINTS },
  })
  // Sliding renewal: every visit pushes the cookie's expiry out another year.
  if (!devAs) res.cookies.set(sessionCookie(user.id))
  return res
}

// PUT { name } — what buddies see instead of the number. Empty clears it.
export async function PUT(req: Request) {
  const userId = verifySession((await cookies()).get(COOKIE)?.value)
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { name?: string }
  const name = (body.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)
  await setUserName(user, name || null)
  return NextResponse.json({ ok: true, name: name || null })
}
