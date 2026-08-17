import { NextResponse } from 'next/server'
import { createGuestUser, setSessionCookie } from '@/lib/f2/auth'
import { seedIntroTopic } from '@/lib/f2/intro'

export const runtime = 'nodejs'

// POST /api/f2/auth/guest — the try-before-signup path. Creates a claimable
// guest account seeded with the intro topic and signs it in. The session
// cookie is the only key to a guest account, so the client should call this
// once and rely on the cookie after that.
export async function POST() {
  const result = await createGuestUser()
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  await seedIntroTopic(result.id)
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
