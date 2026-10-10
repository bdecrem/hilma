import { NextResponse } from 'next/server'
import { COOKIE } from '@/lib/dolly/auth'

export const runtime = 'nodejs'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set({ name: COOKIE, value: '', path: '/', maxAge: 0 })
  return res
}
