import { NextResponse } from 'next/server'
import { createGuest, setSessionCookie } from '@/lib/takt/auth'

export const runtime = 'nodejs'

// POST /api/takt/auth/guest — the app's first launch: a guest account, signed in. The cookie
// is the only key to it, so the app calls this once and keeps the cookie.
export async function POST() {
  const user = await createGuest()
  if ('error' in user) return NextResponse.json({ error: user.error }, { status: user.status })
  const res = NextResponse.json({ user })
  setSessionCookie(res, user.id)
  return res
}
