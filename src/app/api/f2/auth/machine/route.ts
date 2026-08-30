import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { signSession } from '@/lib/f2/auth'

export const runtime = 'nodejs'

// POST /api/f2/auth/machine — a trusted machine (the Mac mini's Dodo-for-
// Macintosh agent) trades a shared secret for a session token, for exactly one
// user: F2_MACHINE_TOKEN pairs with F2_MACHINE_USER_ID. No user_id in the
// request — the token IS the identity. Header: x-f2-machine-token.
export async function POST(req: Request) {
  const expected = process.env.F2_MACHINE_TOKEN
  const userId = process.env.F2_MACHINE_USER_ID
  if (!expected || !userId) {
    return NextResponse.json({ error: 'machine auth not configured' }, { status: 503 })
  }
  const given = req.headers.get('x-f2-machine-token') ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ session: signSession(userId), user_id: userId })
}
