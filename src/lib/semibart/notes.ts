import { db } from './db'
import { allUsers, type Failure, type SemibartUser } from './auth'

// Sticky notes (schema apps/semibart/schema/002): one fellow leaves a short note for another, and
// it shows on their desk. Anyone can see that a note is there; only its reader, its author and an
// admin get the text. The desk drawing is the client's (public/semibart/notes.js).

export type NoteOut = {
  id: string; to: string; from: { character: string; name: string }; body: string | null
  color: string; created_at: string; mine: boolean; yours: boolean
}
const COLORS = ['yellow', 'pink', 'blue', 'green']
const PER_DAY = 30

export async function notesFor(viewer: SemibartUser, characters: string[]): Promise<NoteOut[]> {
  const users = await allUsers()
  const byId = new Map(users.map(u => [u.id, u]))
  const ids = users.filter(u => characters.includes(u.character)).map(u => u.id)
  if (!ids.length) return []
  const { data, error } = await db().from('semibart_notes')
    .select('id, to_user, from_user, body, color, created_at')
    .in('to_user', ids).is('removed_at', null)
    .order('created_at', { ascending: false }).limit(60)
  if (error) throw new Error(`semibart_notes: ${error.message}`)
  return (data || []).map(n => {
    const to = byId.get(n.to_user), from = byId.get(n.from_user)
    const mine = n.from_user === viewer.id, yours = n.to_user === viewer.id
    return {
      id: n.id, to: to ? to.character : '', from: { character: from ? from.character : '', name: from ? from.name : 'someone' },
      body: mine || yours || viewer.role === 'admin' ? n.body : null, color: n.color, created_at: n.created_at, mine, yours
    }
  })
}

export async function leaveNote(viewer: SemibartUser, toCharacter: string, bodyIn: string): Promise<NoteOut | Failure> {
  const body = (bodyIn || '').trim().replace(/\s+/g, ' ')
  if (!body) return { error: 'The note is empty.', status: 400 }
  if (body.length > 140) return { error: 'Keep it to 140 characters. It is a sticky note.', status: 400 }
  const users = await allUsers()
  const to = users.find(u => u.character === (toCharacter || '').toLowerCase())
  if (!to) return { error: 'Nobody by that name here.', status: 404 }
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count, error: ce } = await db().from('semibart_notes').select('id', { count: 'exact', head: true }).eq('from_user', viewer.id).gte('created_at', since)
  if (ce) throw new Error(`semibart_notes: ${ce.message}`)
  if ((count || 0) >= PER_DAY) return { error: 'That is a lot of notes for one day. More tomorrow.', status: 429 }
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const { data, error } = await db().from('semibart_notes').insert({ to_user: to.id, from_user: viewer.id, body, color }).select('id, created_at').single()
  if (error || !data) throw new Error(`semibart_notes: ${error ? error.message : 'no row'}`)
  return { id: data.id, to: to.character, from: { character: viewer.character, name: viewer.name }, body, color, created_at: data.created_at, mine: true, yours: to.id === viewer.id }
}

export async function removeNote(viewer: SemibartUser, id: string): Promise<{ ok: true } | Failure> {
  const { data, error } = await db().from('semibart_notes').select('id, to_user, from_user, removed_at').eq('id', id).maybeSingle()
  if (error) throw new Error(`semibart_notes: ${error.message}`)
  if (!data || data.removed_at) return { error: 'That note is gone.', status: 404 }
  if (data.to_user !== viewer.id && data.from_user !== viewer.id && viewer.role !== 'admin') return { error: 'Only its reader or its author can take it down.', status: 403 }
  const { error: e2 } = await db().from('semibart_notes').update({ removed_at: new Date().toISOString() }).eq('id', id)
  if (e2) throw new Error(`semibart_notes: ${e2.message}`)
  return { ok: true }
}
