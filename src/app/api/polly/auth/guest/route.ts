import { NextResponse } from 'next/server'
import { createGuestUser, setSessionCookie } from '@/lib/polly/auth'
import { notifyAdminNewAccount } from '@/lib/polly/admin-notify'

export const runtime = 'nodejs'

// POST /api/polly/auth/guest — the try-before-signup path. Creates a claimable
// guest account and signs it in (Polly has no intro topic yet). The session
// cookie is the only key to a guest account, so the client should call this
// once and rely on the cookie after that.
export async function POST() {
  const result = await createGuestUser()
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  await notifyAdminNewAccount('guest', result.username)
  const res = NextResponse.json({
    user: {
      id: result.id,
      username: result.username,
      avatar_url: null,
      is_guest: true,
    },
  })
  setSessionCookie(res, result.id)
  return res
}
