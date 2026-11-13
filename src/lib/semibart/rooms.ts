// CASBS Quest rooms as data (apps/semibart/schema/010_semibart_rooms.sql): what a fellow has
// added to their study is a piece of drawing code in semibart_rooms, loaded by the game and run
// over the room (public/semibart/rooms.js). A change is a saved row, not a deploy.
//
// Every saved version is kept (semibart_room_versions). An undo is a new version holding the
// older code, so the history stays linear and nothing is lost.
//
// No Next imports: the routes in src/app/api/semibart/rooms are thin wrappers over this file.

import { db } from './db'
import type { SemibartUser } from './auth'
import rosterFile from './roster.json'

export type RosterRoom = { name: string; study: string; scene: 'desk' | 'read' | 'stand' | 'bart'; occupants: string[]; names: string[] }

/** The game's rooms, generated from the game by scripts/semibart/roster.mjs. */
export const ROSTER = (rosterFile as { rooms: Record<string, RosterRoom> }).rooms

export function rosterRoom(room: string): RosterRoom | null {
  return Object.prototype.hasOwnProperty.call(ROSTER, room) ? ROSTER[room] : null
}

/** A room is its occupants' to decorate; an admin may decorate any. */
export function mayDecorate(user: SemibartUser | null, room: string): boolean {
  const r = rosterRoom(room)
  if (!user || !r) return false
  return user.role === 'admin' || r.occupants.includes(user.character)
}

export type RoomState = { room: string; version: number; code: string }

/** room → version, for every room that has anything in it. The game polls this. */
export async function roomIndex(): Promise<Record<string, number>> {
  const { data, error } = await db().from('semibart_rooms').select('room, version').gt('version', 0)
  if (error) throw new Error(`semibart_rooms index: ${error.message}`)
  const out: Record<string, number> = {}
  for (const row of data ?? []) out[row.room as string] = row.version as number
  return out
}

export async function getRoom(room: string): Promise<RoomState> {
  const { data, error } = await db().from('semibart_rooms').select('room, version, code').eq('room', room).maybeSingle()
  if (error) throw new Error(`semibart_rooms read: ${error.message}`)
  return data ? { room, version: data.version as number, code: data.code as string } : { room, version: 0, code: '' }
}

/** Take the room for `seconds` (the decorator is at work). False when someone else has it.
 *  A database function, so the test and the claim are one statement on one clock. */
export async function claimRoom(room: string, seconds: number): Promise<boolean> {
  const { data, error } = await db().rpc('semibart_claim_room', { p_room: room, p_seconds: seconds })
  if (error) throw new Error(`semibart_claim_room: ${error.message}`)
  return data === true
}

export async function releaseRoom(room: string): Promise<void> {
  const { error } = await db().from('semibart_rooms').update({ busy_until: null }).eq('room', room)
  if (error) throw new Error(`semibart_rooms release: ${error.message}`)
}

/** Decorate requests saved for this room since `sinceMs` (the daily allowance counts these). */
export async function changesSince(room: string, sinceMs: number): Promise<number> {
  const { count, error } = await db()
    .from('semibart_room_versions')
    .select('id', { count: 'exact', head: true })
    .eq('room', room)
    .gte('created_at', new Date(sinceMs).toISOString())
  if (error) throw new Error(`semibart_room_versions count: ${error.message}`)
  return count ?? 0
}

export type SaveInput = { room: string; from: number; code: string; prompt: string; say: string; author: string; kind: 'decorate' | 'undo' }

/** Save `code` as version from + 1. Null when the room moved on since `from` was read. */
export async function saveRoom(input: SaveInput): Promise<number | null> {
  const version = input.from + 1
  // The history row first: its unique (room, version) is what makes two writers collide.
  const made = await db().from('semibart_room_versions').insert({ room: input.room, version, code: input.code, prompt: input.prompt, say: input.say, author: input.author, kind: input.kind })
  if (made.error) {
    if (made.error.code === '23505') return null
    throw new Error(`semibart_room_versions insert: ${made.error.message}`)
  }
  // That insert is the guard (with the room lock), so the room row itself is a plain write.
  const { error } = await db().from('semibart_rooms').update({ version, code: input.code, updated_at: new Date().toISOString() }).eq('room', input.room)
  if (error) throw new Error(`semibart_rooms save: ${error.message}`)
  return version
}

/** Step the room back one change. Returns the new state, or null when there is nothing before it.
 *  Repeated undos keep walking back: an undo row's prompt records which version it restored. */
export async function undoRoom(room: string, author: string): Promise<RoomState | null> {
  const current = await getRoom(room)
  if (current.version === 0) return null
  const { data: last, error } = await db().from('semibart_room_versions').select('version, kind, prompt').eq('room', room).eq('version', current.version).maybeSingle()
  if (error) throw new Error(`semibart_room_versions read: ${error.message}`)
  const restored = last && last.kind === 'undo' ? parseInt(String(last.prompt).replace(/^v/, ''), 10) : current.version
  const target = restored - 1
  if (!(target >= 0)) return null
  let code = ''
  if (target > 0) {
    const older = await db().from('semibart_room_versions').select('code').eq('room', room).eq('version', target).maybeSingle()
    if (older.error) throw new Error(`semibart_room_versions read: ${older.error.message}`)
    if (!older.data) return null
    code = older.data.code as string
  }
  const version = await saveRoom({ room, from: current.version, code, prompt: `v${target}`, say: '', author, kind: 'undo' })
  return version === null ? null : { room, version, code }
}
