import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { registerPushToken, unregisterPushToken, type PushEnvironment } from '@/lib/f2/push'

export const runtime = 'nodejs'

// POST /api/f2/push/register { token, environment: 'sandbox'|'production', bundle_id }
// — the app's APNs device token, sent after the user allows notifications and
// on every launch (tokens can change). A token moves to whoever is signed in.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  let body: { token?: string; environment?: string; bundle_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const token = (body.token ?? '').trim().toLowerCase()
  if (!/^[0-9a-f]{32,200}$/.test(token)) return NextResponse.json({ error: 'invalid token' }, { status: 400 })
  if (body.environment !== 'sandbox' && body.environment !== 'production') {
    return NextResponse.json({ error: 'environment must be sandbox or production' }, { status: 400 })
  }
  await registerPushToken(user.id, token, body.environment as PushEnvironment, body.bundle_id || 'com.bartdecrem.Feynd')
  return NextResponse.json({ ok: true })
}

// DELETE /api/f2/push/register { token } — on sign-out.
export async function DELETE(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.token) return NextResponse.json({ error: 'token required' }, { status: 400 })
  await unregisterPushToken(user.id, body.token.trim().toLowerCase())
  return NextResponse.json({ ok: true })
}
