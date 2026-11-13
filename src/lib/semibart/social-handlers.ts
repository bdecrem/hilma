// Plain Request -> Response handlers for CASBS Quest's social features (see social.ts): the
// notes on a desk, the announcements ticker, personas, and the chat with a room's Claude.
// hilma mounts them under /api/semibart/{desk,events,personas,agent}. No Next imports.

import { isFailure, sessionUser } from './auth'
import { leaveNote, removeNote } from './notes'
import { rosterRoom } from './rooms'
import { runRoomChat, type ChatTurn } from './social-agent'
import { allPersonas, announce, deskNotes, eventsAfter, roomOf } from './social'

const json = (body: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } })
type Handler = (req: Request) => Promise<Response>
const guarded = (h: Handler): Handler => async req => {
  try { return await h(req) } catch (e) {
    console.error('[semibart/social]', e)
    return json({ error: 'Something went wrong on our side.' }, 500)
  }
}
async function readBody(req: Request): Promise<Record<string, unknown>> {
  try { const b = await req.json(); return b && typeof b === 'object' ? b : {} } catch { return {} }
}
const first = (name: string) => name.split(' ')[0]

/** GET ?room=mary -> { notes }: everything stuck to the desk, for anyone who walks in.
 *  POST { to, body } (signed in) -> { note }. DELETE ?id= (its reader, its author, an admin). */
export const desk: Handler = guarded(async req => {
  const url = new URL(req.url)
  const user = await sessionUser(req)
  if (req.method === 'GET') {
    const room = (url.searchParams.get('room') || '').toLowerCase()
    if (!rosterRoom(room)) return json({ error: 'No such room.' }, 404)
    return json({ room, notes: await deskNotes(room, user) })
  }
  if (!user) return json({ error: 'Sign in first.' }, 401)
  if (req.method === 'POST') {
    const { to, body } = await readBody(req)
    const r = await leaveNote(user, String(to || ''), String(body || ''))
    if (isFailure(r)) return json({ error: r.error }, r.status)
    if (r.to !== user.character) {
      const toName = (await deskNotes(roomOf(r.to) || r.to, user)).find(n => n.id === r.id)?.to.name || r.to
      await announce({ kind: 'note', actor: user.character, room: roomOf(r.to) || r.to, text: `${first(user.name)} left a note on ${toName}'s desk.`, quietMinutes: 10 })
        .catch(e => console.error('[semibart/social] announce', e))
    }
    return json({ note: { id: r.id, to: { character: r.to, name: r.to }, from: { character: user.character, name: first(user.name) }, body: r.body, color: r.color, created_at: r.created_at, canRemove: true } })
  }
  if (req.method === 'DELETE') {
    const r = await removeNote(user, url.searchParams.get('id') || '')
    return isFailure(r) ? json({ error: r.error }, r.status) : json(r)
  }
  return json({ error: 'Method not allowed.' }, 405)
})

/** GET ?after=ID -> { events }: announcements newer than that id (0: the last few of today).
 *  Every open tab polls this, so the CDN holds each answer for a few seconds. */
export const events: Handler = guarded(async req => {
  const after = Math.max(0, Math.floor(Number(new URL(req.url).searchParams.get('after')) || 0))
  return json({ events: await eventsAfter(after) }, 200, 'public, max-age=0, s-maxage=4, stale-while-revalidate=8')
})

/** GET -> { personas: { mary: { look, come, hello, lines, doing } } }: only what differs from the game. */
export const personas: Handler = guarded(async () => json({ personas: await allPersonas() }))

/** POST { room, messages: [{ role: 'user' | 'claude', text }] } -> { reply, room?, persona? }.
 *  The room's occupants, and admins anywhere. Can take a minute or two when the room changes. */
export const agent: Handler = guarded(async req => {
  const user = await sessionUser(req)
  if (!user) return json({ error: 'Sign in first.', reply: 'Sign in first.' }, 401)
  const b = await readBody(req)
  const room = String(b.room || '').toLowerCase()
  const turns: ChatTurn[] = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m): m is { role: string; text: string } => !!m && typeof m === 'object' && typeof (m as { text?: unknown }).text === 'string')
    .map(m => ({ role: m.role === 'claude' ? 'claude' as const : 'user' as const, text: m.text.trim().slice(0, 600) }))
    .filter(m => m.text).slice(-12)
  const r = await runRoomChat(user, room, turns)
  return json(r.body, r.status)
})
