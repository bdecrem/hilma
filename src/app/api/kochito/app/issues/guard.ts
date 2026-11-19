import { NextResponse } from 'next/server'
import { sessionUser } from '@/lib/kochito/app-auth'
import { WriteError } from '@/lib/venture/issue-writes'

// Every write to the tracker from the board (OLA-163): only with the board's session cookie (the
// same check the pages make, src/lib/kochito/app-auth.ts), only from a page on the same host, and
// recorded as the signed-in account. The routes: POST issues (new), PATCH issues/<id> (fields,
// status), POST issues/<id>/comments.
export async function asUser(req: Request, run: (user: string) => Promise<unknown>) {
  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const origin = req.headers.get('origin')
  if (origin && new URL(origin).host !== req.headers.get('host')) return NextResponse.json({ error: 'not from this site' }, { status: 403 })
  try {
    return NextResponse.json(await run(user))
  } catch (e) {
    if (e instanceof WriteError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('kochito issues write', e)
    return NextResponse.json({ error: 'the change was not saved' }, { status: 500 })
  }
}
export const issueId = (s: string) => (/^OLA-\d+$/i.test(s) ? s.toUpperCase() : null)
