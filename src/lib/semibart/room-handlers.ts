// Plain Request -> Response handlers for CASBS Quest rooms (see rooms.ts). hilma mounts them
// under /api/semibart/rooms (src/app/api/semibart/rooms/**); the game's own project can mount
// the same functions. No Next imports.

import { sessionUser } from './auth'
import { changeRoom, undoChange, type RoomChange } from './room-change'
import { getRoom, roomIndex, rosterRoom } from './rooms'

const json = (body: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } })

const guarded = (h: () => Promise<Response>) => async (): Promise<Response> => {
  try { return await h() } catch (e) {
    console.error('[semibart/rooms]', e)
    return json({ error: 'Something went wrong on our side.', say: 'Something went wrong on our side. Try again.' }, 500)
  }
}

/** GET /api/semibart/rooms -> { rooms: { daniel: 3, ... } }. The game polls this; the CDN holds
 *  it for two seconds so forty open tabs are one database read. */
export const roomsIndex = (): Promise<Response> => guarded(async () =>
  json({ rooms: await roomIndex() }, 200, 'public, max-age=0, s-maxage=2, stale-while-revalidate=4'))()

/** GET /api/semibart/rooms/:room[?v=N] -> { room, version, code }. With the version the game
 *  asked for in the URL, the answer never changes, so it is cached for good. */
export const roomGet = (req: Request, room: string): Promise<Response> => guarded(async () => {
  if (!rosterRoom(room)) return json({ error: 'No such room.' }, 404)
  const state = await getRoom(room)
  const asked = Number(new URL(req.url).searchParams.get('v'))
  const pinned = asked > 0 && asked === state.version
  return json(state, 200, pinned ? 'public, max-age=31536000, immutable' : 'no-store')
})()

const answer = (c: RoomChange) => c.ok ? json({ changed: true, ...c }) : json({ changed: false, say: c.say, error: c.say }, c.status)

/** POST /api/semibart/rooms/:room { prompt } -> { changed: true, say, version, code } when the
 *  room changed, { changed: false, say } when it did not. Occupants and admins only. */
export const roomDecorate = (req: Request, room: string): Promise<Response> => guarded(async () => {
  let prompt = ''
  try { const b = await req.json(); if (b && typeof b.prompt === 'string') prompt = b.prompt } catch { /* an empty prompt is answered by changeRoom */ }
  return answer(await changeRoom(await sessionUser(req), room, prompt))
})()

/** POST /api/semibart/rooms/:room/undo -> { changed: true, say, version, code }: one change back. */
export const roomUndo = (req: Request, room: string): Promise<Response> => guarded(async () =>
  answer(await undoChange(await sessionUser(req), room)))()
