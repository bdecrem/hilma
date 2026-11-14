import { NextResponse } from 'next/server'
import { APP_COOKIE } from '@/lib/kochito/app-auth'

export const runtime = 'nodejs'

// The "Sign out" button is a plain form: clear the cookie, go back to the page.
export async function POST(req: Request) {
  const back = req.headers.get('referer')
  const here = new URL(req.url)
  const to = back && new URL(back).host === here.host ? back : new URL('/', here).toString()
  const res = NextResponse.redirect(to, 303)
  res.cookies.set(APP_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
