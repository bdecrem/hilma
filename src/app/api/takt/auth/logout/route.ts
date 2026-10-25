import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/takt/auth'

export const runtime = 'nodejs'

// POST /api/takt/auth/logout
export async function POST() {
  const res = NextResponse.json({})
  clearSessionCookie(res)
  return res
}
