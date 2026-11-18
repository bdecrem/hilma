import { NextResponse } from 'next/server'
import { appToken, isAppUser, login, readAppToken } from '@/lib/kochito/app-auth'
import { keyOk } from '@/lib/venture/interview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The Ola iPhone app's admin sign-in. Same accounts and the same wrong-try limits as the
// app.kochitolabs.com login (src/lib/kochito/app-auth.ts); a signed token for 30 days instead of a
// cookie, kept in the phone's Keychain.
//   POST { name, passcode }            → { token, user, expires, links }
//   POST { ola: <the phone's Ola sign-in> } → the same, with no passcode (2026-11-18, OLA-151; Bart:
//        "user bart is an admin user and i want to see the voice chat tab"). The phone is already
//        signed in to Ola (app.ola.cx); we ask Ola who that sign-in is. Only an Ola admin whose
//        name is also one of this site's accounts gets a token. Nothing of the sign-in is kept or logged.
//   GET  Authorization: Bearer <token> → { user, expires, links } (401 when it no longer works)
// `links` are the voice links of the Kit page, for the app's Kit screen.

function links() {
  const k = process.env.VENTURE_KEY
  if (!keyOk(k)) return []
  const q = `?k=${encodeURIComponent(k as string)}`
  return [
    { name: 'Leave a note', what: 'Say what you want done. Kit reads it in a minute or two.', href: `https://ola.cx/venture/memo${q}` },
    { name: 'Talk it through', what: 'An open conversation, out loud.', href: `https://ola.cx/venture/talk${q}` },
    { name: 'Answer my questions', what: 'A short check-in, about five minutes.', href: `https://ola.cx/venture/call/checkin${q}` },
  ]
}

const headers = { 'cache-control': 'no-store' }

const OLA_ME = 'https://app.ola.cx/api/device/me'

// Who an Ola sign-in is, as Ola itself answers: { handle, admin } or null (signed out, or no answer).
async function olaPerson(pass: string): Promise<{ handle: string; admin: boolean } | null> {
  if (!/^[A-Za-z0-9._~-]{20,400}$/.test(pass)) return null
  try {
    const r = await fetch(OLA_ME, { headers: { authorization: `Bearer ${pass}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const j = (await r.json()) as { person?: { handle?: unknown; admin?: unknown } }
    const handle = typeof j.person?.handle === 'string' ? j.person.handle.toLowerCase() : ''
    return handle ? { handle, admin: j.person?.admin === true } : null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof body.ola === 'string') {
    const who = await olaPerson(body.ola)
    if (!who) return NextResponse.json({ error: 'Sign in to Ola again.' }, { status: 401, headers })
    if (!who.admin || !isAppUser(who.handle)) return NextResponse.json({ error: 'This Ola account is not an admin here.' }, { status: 403, headers })
    const t = appToken(who.handle)
    return NextResponse.json({ token: t.token, user: who.handle, expires: t.expires, links: links() }, { headers })
  }
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const out = await login(body.name, body.passcode, ip)
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status, headers })
  const t = appToken(out.user)
  return NextResponse.json({ token: t.token, user: out.user, expires: t.expires, links: links() }, { headers })
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const user = readAppToken(auth.startsWith('Bearer ') ? auth.slice(7).trim() : null)
  if (!user) return NextResponse.json({ error: 'Sign in again.' }, { status: 401, headers })
  const expires = Number(auth.split('.')[2]) || null
  return NextResponse.json({ user, expires, links: links() }, { headers })
}
