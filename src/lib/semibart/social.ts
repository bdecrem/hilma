import { db } from './db'
import { allUsers, type SemibartUser } from './auth'
import { ROSTER, rosterRoom } from './rooms'

// CASBS Quest social features (schema apps/semibart/schema/020 and 002): what is stuck to a
// desk, the announcements that scroll along the bottom of the screen, and each fellow's own
// lines. Notes are written and taken down through notes.ts; this file only reads them, and
// here everyone gets the text: a note on a desk is in plain view of whoever walks in.
// No Next imports.

/* ---------- the desk: every note for the people of one room ---------- */

export type DeskNote = {
  id: string; to: { character: string; name: string }; from: { character: string; name: string }
  body: string; color: string; created_at: string
  /** The viewer may take it down: its reader, its author, an admin. */
  canRemove: boolean
}

const first = (name: string) => name.split(' ')[0]

export async function deskNotes(room: string, viewer: SemibartUser | null): Promise<DeskNote[]> {
  const info = rosterRoom(room)
  if (!info) return []
  const users = await allUsers()
  const byId = new Map(users.map(u => [u.id, u]))
  const ids = users.filter(u => info.occupants.includes(u.character)).map(u => u.id)
  if (!ids.length) return []
  const { data, error } = await db().from('semibart_notes')
    .select('id, to_user, from_user, body, color, created_at')
    .in('to_user', ids).is('removed_at', null)
    .order('created_at', { ascending: true }).limit(80)
  if (error) throw new Error(`semibart_notes: ${error.message}`)
  return (data || []).map(n => {
    const to = byId.get(n.to_user), from = byId.get(n.from_user)
    return {
      id: n.id as string,
      to: { character: to ? to.character : '', name: to ? first(to.name) : 'someone' },
      from: { character: from ? from.character : '', name: from ? first(from.name) : 'someone' },
      body: n.body as string, color: n.color as string, created_at: n.created_at as string,
      canRemove: !!viewer && (viewer.role === 'admin' || viewer.id === n.to_user || viewer.id === n.from_user),
    }
  })
}

/** The room a character lives in ('kevin' for the three in Study 27), or null. */
export function roomOf(character: string): string | null {
  if (rosterRoom(character)) return character
  for (const k of Object.keys(ROSTER)) if (ROSTER[k].occupants.includes(character)) return k
  return null
}

/* ---------- announcements ---------- */

export type EventKind = 'note' | 'room' | 'persona' | 'system'
export type EventOut = { id: number; kind: EventKind; actor: string; room: string; text: string; at: string }

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max)

/** Put a line on the ticker. With quietMinutes, a line of the same kind by the same actor about
 *  the same room inside that window is not repeated (five notes in a row are one headline). */
export async function announce(e: { kind: EventKind; actor: string; room: string; text: string; quietMinutes?: number }): Promise<void> {
  const text = clean(e.text, 160)
  if (!text) return
  if (e.quietMinutes) {
    const since = new Date(Date.now() - e.quietMinutes * 60_000).toISOString()
    const { count, error } = await db().from('semibart_events').select('id', { count: 'exact', head: true })
      .eq('kind', e.kind).eq('actor', e.actor).eq('room', e.room).gte('created_at', since)
    if (error) throw new Error(`semibart_events: ${error.message}`)
    if ((count || 0) > 0) return
  }
  const { error } = await db().from('semibart_events').insert({ kind: e.kind, actor: e.actor, room: e.room, text })
  if (error) throw new Error(`semibart_events: ${error.message}`)
}

/** Announcements after an id, oldest first. With after = 0: the last few of the past day, so a
 *  fresh page has something to scroll. */
export async function eventsAfter(after: number): Promise<EventOut[]> {
  let q = db().from('semibart_events').select('id, kind, actor, room, text, created_at')
  if (after > 0) q = q.gt('id', after).order('id', { ascending: true }).limit(20)
  else q = q.gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString()).order('id', { ascending: false }).limit(4)
  const { data, error } = await q
  if (error) throw new Error(`semibart_events: ${error.message}`)
  const rows = (data || []).map(r => ({ id: r.id as number, kind: r.kind as EventKind, actor: r.actor as string, room: r.room as string, text: r.text as string, at: r.created_at as string }))
  return after > 0 ? rows : rows.reverse()
}

/* ---------- the chat's daily allowance ---------- */

/** Messages one person may send to a room's Claude in 24 hours. */
export const DAILY_TURNS = 60

/** Count this message against the asker's day. False when the day's allowance is used up
 *  (and then nothing is recorded). */
export async function countTurn(character: string, room: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { count, error } = await db().from('semibart_agent_turns').select('id', { count: 'exact', head: true }).eq('character', character).gte('created_at', since)
  if (error) throw new Error(`semibart_agent_turns: ${error.message}`)
  if ((count || 0) >= DAILY_TURNS) return false
  const { error: e2 } = await db().from('semibart_agent_turns').insert({ character, room })
  if (e2) throw new Error(`semibart_agent_turns: ${e2.message}`)
  return true
}

/* ---------- personas: a fellow's own lines ---------- */

export type Persona = {
  /** What a visitor says when they look at you. */
  look?: string
  /** What you call through the door when someone knocks. */
  come?: string
  /** What you say the first time someone walks in. */
  hello?: string
  /** What you say when talked to, one per click, in turn. */
  lines?: string[]
  /** What you are up to, in a few words: "napping on the couch". */
  doing?: string
}
const LINE = 140, MAX_LINES = 6

export function cleanPersona(p: unknown): Persona {
  const out: Persona = {}
  if (!p || typeof p !== 'object') return out
  const src = p as Record<string, unknown>
  for (const k of ['look', 'come', 'hello', 'doing'] as const) {
    if (typeof src[k] === 'string' && clean(src[k] as string, LINE)) out[k] = clean(src[k] as string, LINE)
  }
  if (Array.isArray(src.lines)) {
    const lines = src.lines.filter((l): l is string => typeof l === 'string').map(l => clean(l, LINE)).filter(Boolean).slice(0, MAX_LINES)
    if (lines.length) out.lines = lines
  }
  return out
}

export async function allPersonas(): Promise<Record<string, Persona>> {
  const { data, error } = await db().from('semibart_personas').select('character, data')
  if (error) throw new Error(`semibart_personas: ${error.message}`)
  const out: Record<string, Persona> = {}
  for (const r of data || []) { const p = cleanPersona(r.data); if (Object.keys(p).length) out[r.character as string] = p }
  return out
}

export async function getPersona(character: string): Promise<Persona> {
  const { data, error } = await db().from('semibart_personas').select('data').eq('character', character).maybeSingle()
  if (error) throw new Error(`semibart_personas: ${error.message}`)
  return cleanPersona(data ? data.data : null)
}

/** Merge a change into a character's persona. A key set to '' (or lines to []) goes back to the
 *  game's own; reset drops everything first. Returns what is stored now. */
export async function setPersona(character: string, patch: Record<string, unknown>, by: string, reset = false): Promise<Persona> {
  const now: Record<string, unknown> = reset ? {} : { ...(await getPersona(character)) }
  for (const k of ['look', 'come', 'hello', 'doing', 'lines']) {
    if (!(k in patch)) continue
    const v = patch[k]
    if (v === '' || v === null || (Array.isArray(v) && !v.length)) delete now[k]
    else now[k] = v
  }
  const next = cleanPersona(now)
  const { error } = await db().from('semibart_personas').upsert({ character, data: next, updated_by: by, updated_at: new Date().toISOString() })
  if (error) throw new Error(`semibart_personas: ${error.message}`)
  return next
}
