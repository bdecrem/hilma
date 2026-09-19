import { NextResponse } from 'next/server'
import { getSessionUser, setSessionCookie } from '@/lib/polly/auth'
import { LANGUAGES, isLanguageCode } from '@/lib/polly/language'
import { profileForLanguage, rememberProfile } from '@/lib/polly/profiles'
import { pollySupabase } from '@/lib/polly/supabase'

export const runtime = 'nodejs'

// POST /api/polly/languages/switch  { language }
// Leave the current language and sign into another, the way one switches
// users on Netflix: the session cookie is re-issued for that language's
// profile (created, with its course, the first time). Returns the same
// `user` shape as /auth/me, plus `created`.
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

  const target = await profileForLanguage(user.id, body.language)
  if ('error' in target) return NextResponse.json({ error: target.error }, { status: target.status })
  await rememberProfile(target.id)

  const { data: row } = await pollySupabase()
    .from('polly_users')
    .select('avatar_url, is_guest, recert_enabled')
    .eq('id', target.id)
    .maybeSingle()
  const res = NextResponse.json({
    user: {
      id: target.id,
      username: user.username, // the account's name, same in every language
      avatar_url: row?.avatar_url ?? null,
      is_guest: Boolean(row?.is_guest),
      recert_enabled: row?.recert_enabled ?? true,
      language: body.language,
    },
    created: target.created,
  })
  setSessionCookie(res, target.id)
  return res
}
