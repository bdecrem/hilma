import { NextResponse } from 'next/server'
import { createGuestUser, setSessionCookie } from '@/lib/polly/auth'
import { notifyAdminNewAccount } from '@/lib/polly/admin-notify'
import { isLanguageCode, setActiveLanguage } from '@/lib/polly/language'

export const runtime = 'nodejs'

// POST /api/polly/auth/guest  { username?, language? }
// The first-run path: the learner picked a language and a name, and that is
// the account — no password (the session cookie is the only key until it is
// claimed with an email from Profile). Both fields are optional so the old
// anonymous "try it" call still works. Language and user are created in one
// request so the account never sits half set up.
export async function POST(req: Request) {
  let body: { username?: unknown; language?: unknown } = {}
  try {
    const text = await req.text()
    if (text.trim()) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (body.username !== undefined && typeof body.username !== 'string') {
    return NextResponse.json({ error: 'username must be a string' }, { status: 400 })
  }
  if (body.language !== undefined && !isLanguageCode(body.language)) {
    return NextResponse.json({ error: 'Unknown language' }, { status: 400 })
  }

  const result = await createGuestUser({ username: body.username as string | undefined })
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  let language: string | null = null
  if (isLanguageCode(body.language)) {
    const r = await setActiveLanguage(result.id, body.language)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
    language = body.language
  }
  await notifyAdminNewAccount('guest', result.username)
  const res = NextResponse.json({
    user: {
      id: result.id,
      username: result.username,
      avatar_url: null,
      is_guest: true,
      language,
    },
  })
  setSessionCookie(res, result.id)
  return res
}
