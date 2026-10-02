import { NextResponse } from 'next/server'
import { findUserById, sessionCookie } from '@/lib/onething/core'

// GET /api/onething/dev/as?id=<user id> — LOCAL DEV ONLY: sign the browser in
// as that account (a real session cookie, so every route works as in
// production) and go to the journal (or `next`, any /onething path). Lets a reviewer or a Playwright run use
// the site on localhost without a code text. Dead in production builds.
export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const url = new URL(req.url)
  const id = url.searchParams.get('id') ?? ''
  const next = url.searchParams.get('next') ?? ''
  const user = await findUserById(id)
  if (!user) return NextResponse.json({ error: 'No such account.' }, { status: 404 })
  // A relative Location, so it also works through a tunnel that rewrites the host.
  const res = new NextResponse(null, { status: 307, headers: { Location: next.startsWith('/onething') ? next : '/onething' } })
  res.cookies.set(sessionCookie(user.id))
  return res
}
