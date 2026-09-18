import { NextResponse } from 'next/server'
import { createUser, setSessionCookie } from '@/lib/polly/auth'
import { notifyAdminNewAccount } from '@/lib/polly/admin-notify'

export const runtime = 'nodejs'

// POST /api/polly/auth/signup
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
  // Admin ping (best-effort; awaited because serverless won't outlive the
  // response, but it can never fail the signup).
  await notifyAdminNewAccount('signup', result.username)

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
