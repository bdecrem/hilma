import { NextResponse } from 'next/server'
import { createUser, setSessionCookie } from '@/lib/polly/auth'
import { notifyAdminNewAccount } from '@/lib/polly/admin-notify'
import { isLanguageCode, setActiveLanguage } from '@/lib/polly/language'

export const runtime = 'nodejs'

// POST /api/polly/auth/signup
// Body: { email, password, language? }. `language` (it/fr/ko) starts the course
// in the same request when signup happens from the first run. Creates a user (username = lowercased email),
// sets the session cookie, returns the user. No email verification — that
// can be added later behind a feature flag if abuse appears.
export async function POST(req: Request) {
  let body: { email?: string; password?: string; language?: unknown }
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

  if (body.language !== undefined && !isLanguageCode(body.language)) {
    return NextResponse.json({ error: 'Unknown language' }, { status: 400 })
  }
  const result = await createUser({ email: body.email, password: body.password })
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  let language: string | null = null
  if (isLanguageCode(body.language)) {
    const r = await setActiveLanguage(result.id, body.language)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
    language = body.language
  }
  // Admin ping (best-effort; awaited because serverless won't outlive the
  // response, but it can never fail the signup).
  await notifyAdminNewAccount('signup', result.username)

  const res = NextResponse.json({
    user: {
      id: result.id,
      username: result.username,
      avatar_url: null,
      language,
    },
  })
  setSessionCookie(res, result.id)
  return res
}
