import { NextResponse } from 'next/server'
import { createUser, setSessionCookie } from '@/lib/f2/auth'
import { seedIntroTopic } from '@/lib/f2/intro'

export const runtime = 'nodejs'

// POST /api/f2/auth/signup
// Body: { email, password }. Creates a user (username = lowercased email),
// sets the session cookie, returns the user. No email verification — that
// can be added later behind a feature flag if abuse appears.
export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: 'email and password required' },
      { status: 400 },
    )
  }

  const result = await createUser({ email: body.email, password: body.password })
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  // Every fresh account starts with the intro topic (best-effort).
  await seedIntroTopic(result.id)

  const res = NextResponse.json({
    user: {
      id: result.id,
      username: result.username,
      avatar_url: null,
    },
  })
  setSessionCookie(res, result.id)
  return res
}
