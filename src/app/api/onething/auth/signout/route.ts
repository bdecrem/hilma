import { NextResponse } from 'next/server'
import { COOKIE } from '@/lib/onething/core'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set({ name: COOKIE, value: '', path: '/', maxAge: 0 })
  return res
}
