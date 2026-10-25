import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'

export const runtime = 'nodejs'

// GET /api/takt/auth/me — who the cookie belongs to.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  return NextResponse.json({ user })
}
