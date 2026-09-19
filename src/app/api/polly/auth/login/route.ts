import { NextResponse } from 'next/server'
import {
  findUserByIdentifier,
  setSessionCookie,
  verifyPassword,
} from '@/lib/polly/auth'
import { landingProfileId } from '@/lib/polly/profiles'
import { pollySupabase } from '@/lib/polly/supabase'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Accepts either the legacy `username` or a typed email — server-side
  // lookup checks both columns. Field is still named `username` in the body
  // for backwards compatibility with the existing iOS client.
  const identifier = body.username?.trim().toLowerCase()
  const password = body.password
  if (!identifier || !password) {
    return NextResponse.json(
      { error: 'username and password required' },
      { status: 400 },
    )
  }

  const user = await findUserByIdentifier(identifier)
  if (!user) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }

  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }

  // Land in the language profile the learner used last (schema 007); an
  // account with one language is its own profile.
  const profileId = await landingProfileId(user.id)
  const { data: profile } = await pollySupabase()
    .from('polly_users')
    .select('avatar_url, is_guest, active_course:polly_courses!polly_users_active_course_id_fkey(language)')
    .eq('id', profileId)
    .maybeSingle()
  const { data: root } = await pollySupabase()
    .from('polly_users')
    .select('username')
    .eq('id', user.id)
    .maybeSingle()
  const course = (profile as { active_course?: { language?: string } | null } | null)?.active_course
  const res = NextResponse.json({
    user: {
      id: profileId,
      username: root?.username ?? identifier,
      avatar_url: profile?.avatar_url ?? null,
      is_guest: Boolean(profile?.is_guest),
      language: course?.language ?? null,
    },
  })
  setSessionCookie(res, profileId)
  return res
}
