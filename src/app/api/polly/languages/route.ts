import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { listLanguageProfiles } from '@/lib/polly/profiles'

export const runtime = 'nodejs'

// GET /api/polly/languages — the language switcher's tiles: every language
// Polly teaches, whether this account has a profile in it, which one is
// active, and a line of progress (level, topics, streak) for the started ones.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  return NextResponse.json({ languages: await listLanguageProfiles(user.id) })
}
