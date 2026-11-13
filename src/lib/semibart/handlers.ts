import { allUsers, changePasscode, isFailure, logIn, passcodeIsDefault, resetPasscode, sessionRow, type SemibartUser } from './auth'
import { leaveNote, notesFor, removeNote } from './notes'
import { clearCookie, setCookie } from './session'

// Plain Request -> Response handlers for CASBS Quest accounts and notes. hilma mounts them under
// /api/semibart/* (src/app/api/semibart/<name>/route.ts, one line each); the game's own project
// can mount the same functions.

type Handler = (req: Request) => Promise<Response>
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })
const fail = (f: { error: string; status: number }) => json({ error: f.error }, f.status)
async function readBody(req: Request): Promise<Record<string, string>> {
  try { const b = await req.json(); return b && typeof b === 'object' ? b : {} } catch { return {} }
}
const guarded = (h: Handler): Handler => async req => {
  try { return await h(req) } catch (e) {
    console.error('[semibart]', e)
    return json({ error: 'Something went wrong on our side.' }, 500)
  }
}
const meOut = (u: SemibartUser, isDefault: boolean) => ({ character: u.character, name: u.name, study: u.study, role: u.role, passcodeIsDefault: isDefault })

/** GET /api/semibart/me -> { user } or { user: null } */
export const me: Handler = guarded(async req => {
  const row = await sessionRow(req)
  return json({ user: row ? meOut(row, passcodeIsDefault(row)) : null })
})

/** POST /api/semibart/login { name, passcode } */
export const login: Handler = guarded(async req => {
  const { name, passcode } = await readBody(req)
  const r = await logIn(String(name || ''), String(passcode || ''))
  if (isFailure(r)) return fail(r)
  const row = await sessionRow(new Request(req.url, { headers: { cookie: `semibart_session=${r.token}` } }))
  return json({ user: meOut(r.user, row ? passcodeIsDefault(row) : true) }, 200, { 'set-cookie': setCookie(req, r.token) })
})

/** POST /api/semibart/logout */
export const logout: Handler = guarded(async req => json({ ok: true }, 200, { 'set-cookie': clearCookie(req) }))

/** POST /api/semibart/passcode { current, next } (signed in) */
export const passcode: Handler = guarded(async req => {
  const row = await sessionRow(req)
  if (!row) return json({ error: 'Sign in first.' }, 401)
  const { current, next } = await readBody(req)
  const r = await changePasscode(row, String(current || ''), String(next || ''))
  if (isFailure(r)) return fail(r)
  return json({ ok: true, user: meOut(row, false) }, 200, { 'set-cookie': setCookie(req, r.token) })
})

/** GET ?for=a,b | POST { to, body } | DELETE ?id= (signed in) */
export const notes: Handler = guarded(async req => {
  const row = await sessionRow(req)
  if (!row) return json({ error: 'Sign in first.' }, 401)
  const url = new URL(req.url)
  if (req.method === 'GET') {
    const who = (url.searchParams.get('for') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 6)
    return json({ notes: await notesFor(row, who) })
  }
  if (req.method === 'POST') {
    const { to, body } = await readBody(req)
    const r = await leaveNote(row, String(to || ''), String(body || ''))
    return isFailure(r) ? fail(r) : json({ note: r })
  }
  if (req.method === 'DELETE') {
    const r = await removeNote(row, url.searchParams.get('id') || '')
    return isFailure(r) ? fail(r) : json(r)
  }
  return json({ error: 'Method not allowed.' }, 405)
})

/** GET /api/semibart/admin/users (admin): everyone, with sign-in state */
export const adminUsers: Handler = guarded(async req => {
  const row = await sessionRow(req)
  if (!row || row.role !== 'admin') return json({ error: 'Admins only.' }, 403)
  const users = (await allUsers()).map(u => ({ character: u.character, name: u.name, study: u.study, role: u.role, passcodeIsDefault: !u.passcode_hash, lastSeen: u.last_seen_at, locked: !!(u.locked_until && Date.parse(u.locked_until) > Date.now()) }))
  return json({ users })
})

/** POST /api/semibart/admin/reset { character } (admin): passcode back to the study number */
export const adminReset: Handler = guarded(async req => {
  const row = await sessionRow(req)
  if (!row || row.role !== 'admin') return json({ error: 'Admins only.' }, 403)
  const { character } = await readBody(req)
  const r = await resetPasscode(String(character || ''))
  return isFailure(r) ? fail(r) : json({ ok: true, user: { character: r.character, name: r.name } })
})
