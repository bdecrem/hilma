import { NextResponse } from 'next/server'
import {
  findUserByEmail,
  setSessionCookie,
  verifyPassword,
  type OmniUser,
} from '@/lib/omni/auth'
import { omniSupabase } from '@/lib/omni/supabase'
import { getOrCreateProgress, progressPayload } from '@/lib/omni/progress'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'Email and password required.' }, { status: 400 })
  }

  const found = await findUserByEmail(body.email)
  if (!found || !(await verifyPassword(body.password, found.password_hash))) {
    return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 })
  }

  const { data: user } = await omniSupabase()
    .from('omni_users')
    .select('id, email, display_name, language')
    .eq('id', found.id)
    .single()
  if (!user) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 500 })
  }

  const u = user as OmniUser
  const progress = await getOrCreateProgress(u.id, u.language)
  const res = NextResponse.json({ user: u, progress: progressPayload(progress) })
  setSessionCookie(res, u.id)
  return res
}
