import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { db } from './db'
import { cookieFrom, makeToken, readToken } from './session'

// CASBS Quest accounts (schema apps/semibart/schema/001). Every character is seeded: you sign in
// with your first name and a passcode, which starts as your study number and which you change
// to four digits of your own in your study. A user owns exactly one character, keyed by the
// game's lowercase slug (the room key). Bart is the first admin.
//
// The one function every route needs: sessionUser(req) -> the signed-in user, or null.

export type SemibartUser = { id: string; character: string; name: string; study: string; role: 'user' | 'admin' }
export type Failure = { error: string; status: number }

type Row = SemibartUser & {
  login: string; aliases: string[]; passcode_hash: string | null; session_version: number
  failed_attempts: number; locked_until: string | null; last_seen_at: string | null
}
const FULL = 'id, character, name, study, role, login, aliases, passcode_hash, session_version, failed_attempts, locked_until, last_seen_at'
const pub = (r: Row): SemibartUser => ({ id: r.id, character: r.character, name: r.name, study: r.study, role: r.role })

async function rowById(id: string): Promise<Row | null> {
  const { data, error } = await db().from('semibart_users').select(FULL).eq('id', id).maybeSingle()
  if (error) throw new Error(`semibart_users: ${error.message}`)
  return (data as Row | null) ?? null
}

/** The signed-in user's full row (passcode state included), or null. */
export async function sessionRow(req: Request): Promise<Row | null> {
  const token = cookieFrom(req)
  const s = token ? readToken(token) : null
  if (!s) return null
  const row = await rowById(s.userId)
  if (!row || row.session_version !== s.version) return null
  if (!row.last_seen_at || Date.now() - Date.parse(row.last_seen_at) > 10 * 60 * 1000) {
    await db().from('semibart_users').update({ last_seen_at: new Date().toISOString() }).eq('id', row.id)
  }
  return row
}

/** The signed-in user, or null. */
export async function sessionUser(req: Request): Promise<SemibartUser | null> {
  const row = await sessionRow(req)
  return row ? pub(row) : null
}

/** Who owns a character (its room), or null. */
export async function userByCharacter(slug: string): Promise<SemibartUser | null> {
  const { data, error } = await db().from('semibart_users').select(FULL).eq('character', slug.toLowerCase()).maybeSingle()
  if (error) throw new Error(`semibart_users: ${error.message}`)
  return data ? pub(data as Row) : null
}

export async function allUsers(): Promise<Row[]> {
  const { data, error } = await db().from('semibart_users').select(FULL).order('character')
  if (error) throw new Error(`semibart_users: ${error.message}`)
  return (data as Row[]) || []
}

// ---------- passcodes ----------
export function hashPasscode(code: string): string {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(code, salt, 32).toString('hex')}`
}
function matchesHash(code: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const a = scryptSync(code, Buffer.from(salt, 'hex'), 32), b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
const noZeros = (s: string) => s.replace(/^0+(?=\d)/, '')
function passcodeMatches(row: Row, code: string): boolean {
  code = code.trim()
  if (!code) return false
  // until it's changed, the passcode is the study number ("016" and "16" both work for 016)
  return row.passcode_hash ? matchesHash(code, row.passcode_hash) : noZeros(code) === noZeros(row.study)
}
export const passcodeIsDefault = (row: Row) => !row.passcode_hash

// ---------- signing in ----------
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

/** The fellow a typed name means: first name, nickname, full name, or the game's slug. */
export async function findByName(typed: string): Promise<Row | null> {
  const q = fold(typed)
  if (!q) return null
  const rows = await allUsers()
  const names = (r: Row) => [r.login, r.character, ...r.aliases, r.name].map(fold)
  return rows.find(r => names(r).includes(q))
    || rows.find(r => names(r).includes(q.split(' ')[0]))
    || null
}

export async function logIn(name: string, passcode: string): Promise<{ user: SemibartUser; token: string } | Failure> {
  const row = await findByName(name || '')
  if (!row) return { error: "No fellow by that name. Try your first name.", status: 401 }
  // count this attempt and check the lock in one statement (schema 003), before looking at the passcode
  const { data: attempt, error } = await db().rpc('semibart_try_login', { p_user: row.id })
  if (error) throw new Error(`semibart_try_login: ${error.message}`)
  if (attempt === null || attempt === undefined) return { error: 'Too many tries. Wait a few minutes, then try again.', status: 429 }
  if (!passcodeMatches(row, passcode || '')) {
    return { error: row.passcode_hash ? "That passcode doesn't match." : "That passcode doesn't match. Your first passcode is your study number.", status: 401 }
  }
  await db().from('semibart_users').update({ failed_attempts: 0, locked_until: null, last_seen_at: new Date().toISOString() }).eq('id', row.id)
  return { user: pub(row), token: makeToken(row.id, row.session_version) }
}

/** A new four-digit passcode; ends every other session. Returns a fresh token for this one. */
export async function changePasscode(row: Row, current: string, next: string): Promise<{ token: string } | Failure> {
  if (!passcodeMatches(row, current || '')) return { error: "Your current passcode doesn't match.", status: 401 }
  if (!/^\d{4}$/.test(next || '')) return { error: 'The new passcode is four digits.', status: 400 }
  const version = row.session_version + 1
  const { error } = await db().from('semibart_users')
    .update({ passcode_hash: hashPasscode(next), passcode_set_at: new Date().toISOString(), session_version: version, failed_attempts: 0, locked_until: null })
    .eq('id', row.id)
  if (error) throw new Error(`semibart_users: ${error.message}`)
  return { token: makeToken(row.id, version) }
}

/** Admin: back to the study number, and every session of that user ends. */
export async function resetPasscode(character: string): Promise<SemibartUser | Failure> {
  const { data, error } = await db().from('semibart_users').select(FULL).eq('character', (character || '').toLowerCase()).maybeSingle()
  if (error) throw new Error(`semibart_users: ${error.message}`)
  if (!data) return { error: 'No such character.', status: 404 }
  const row = data as Row
  const { error: e2 } = await db().from('semibart_users')
    .update({ passcode_hash: null, passcode_set_at: null, session_version: row.session_version + 1, failed_attempts: 0, locked_until: null })
    .eq('id', row.id)
  if (e2) throw new Error(`semibart_users: ${e2.message}`)
  return pub(row)
}

export const isFailure = (x: unknown): x is Failure => !!x && typeof x === 'object' && 'error' in x && 'status' in x
