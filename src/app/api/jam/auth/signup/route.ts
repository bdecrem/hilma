import { NextResponse } from 'next/server'
import { createUser, setSessionCookie } from '@/lib/jam/auth'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { username?: string; password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const username = body.username ?? ''
  const password = body.password ?? ''
  const result = await createUser(username, password)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const res = NextResponse.json({ user: result })
  setSessionCookie(res, result.id)
  return res
}
