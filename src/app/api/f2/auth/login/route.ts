import { NextResponse } from 'next/server'
import {
  findUserByIdentifier,
  setSessionCookie,
  verifyPassword,
} from '@/lib/f2/auth'
import { f2Supabase } from '@/lib/f2/supabase'

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

  // Fetch full profile so the iOS app gets the avatar in one round-trip.
  const { data: profile } = await f2Supabase()
    .from('f2_users')
    .select('id, username, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  const res = NextResponse.json({
    user: {
      id: user.id,
      username: profile?.username ?? identifier,
      avatar_url: profile?.avatar_url ?? null,
    },
  })
  setSessionCookie(res, user.id)
  return res
}
