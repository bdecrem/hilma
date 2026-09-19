import { NextResponse } from 'next/server'
import { claimGuestAccount, getSessionUser } from '@/lib/polly/auth'
import { accountRootId, updateAccountWide } from '@/lib/polly/profiles'

export const runtime = 'nodejs'

// POST /api/polly/auth/claim — { email, password }. Upgrades the signed-in
// GUEST account to a real one in place: same user id, so every topic, card,
// pebble, and point of XP earned as a guest comes along.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!user.is_guest) {
    return NextResponse.json({ error: 'Not a guest account.' }, { status: 409 })
  }
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 })
  }
  // The credentials live on the account's root row; every language profile
  // stops being a guest with it. The session stays on the current profile.
  const rootId = await accountRootId(user.id)
  const result = await claimGuestAccount(rootId, {
    email: body.email,
    password: body.password,
  })
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  await updateAccountWide(user.id, { is_guest: false })
  return NextResponse.json({
    user: {
      id: user.id,
      username: result.username,
      avatar_url: user.avatar_url,
      is_guest: false,
      language: user.language ?? null,
    },
  })
}
