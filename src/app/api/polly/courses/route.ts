import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { LANGUAGES, activeLanguage, isLanguageCode, setActiveLanguage } from '@/lib/polly/language'

export const runtime = 'nodejs'

// GET /api/polly/courses — the languages Polly offers and the learner's active one.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  return NextResponse.json({ languages: LANGUAGES, active: await activeLanguage(user.id) })
}

// POST /api/polly/courses  { language }
// Starts (or switches to) the course for that language. One request, so the
// account never sits half set up between "user created" and "course chosen".
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  let body: { language?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!isLanguageCode(body.language)) {
    return NextResponse.json({ error: 'Pick one of: ' + Object.keys(LANGUAGES).join(', ') }, { status: 400 })
  }
  const r = await setActiveLanguage(user.id, body.language)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, language: body.language })
}
