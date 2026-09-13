import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, findUserById, listEntries, localDay, scoreboard, sessionCookie, tzFor, verifySession, LEVELS } from '@/lib/onething/core'

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
  const res = NextResponse.json({
    user: { phone: user.phone, since: user.created_at, tz: tzFor(user) },
    today,
    board: scoreboard(entries, today),
    levels: LEVELS,
    entries,
  })
  // Sliding renewal: every visit pushes the cookie's expiry out another year.
  if (!devAs) res.cookies.set(sessionCookie(user.id))
  return res
}
