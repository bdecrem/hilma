// The one way a room changes: a signed-in occupant (or an admin) says what they want, the
// decorator writes the code, the test run passes, the new version is saved. The Decorate box
// (room-handlers.ts) and the in-room chat agent both call these two functions, so the daily
// allowance, the room lock and the save live in one place. No Next imports.

import type { SemibartUser } from './auth'
import { decorateRoom, MAX_PROMPT } from './room-agent'
import { changesSince, claimRoom, getRoom, mayDecorate, releaseRoom, roomLog, rosterRoom, saveRoom, undoRoom } from './rooms'

/** Changes one room takes in 24 hours: enough for an afternoon of fiddling, not for a loop. */
const DAILY_CHANGES = 80
/** How long a room stays taken while the decorator works; past this a crashed request frees it. */
const CLAIM_SECONDS = 240

export type RoomChange =
  /** The room has a new version; `say` is the decorator's line about it. */
  | { ok: true; say: string; room: string; version: number; code: string; ms?: number; attempts?: number }
  /** Nothing was saved. 200 = the decorator declined or could not draw it; otherwise an HTTP-style reason. */
  | { ok: false; status: 200 | 400 | 401 | 403 | 404 | 409 | 429; say: string }

function refuse(user: SemibartUser | null, room: string): Extract<RoomChange, { ok: false }> | null {
  if (!rosterRoom(room)) return { ok: false, status: 404, say: 'There is no such room.' }
  if (!user) return { ok: false, status: 401, say: 'Sign in first.' }
  if (!mayDecorate(user, room)) return { ok: false, status: 403, say: 'This is not your room to decorate.' }
  return null
}

/** Ask the decorator to change `room` as `prompt` says, and save the result. Takes 10 s to a minute or two. */
export async function changeRoom(user: SemibartUser | null, room: string, prompt: string): Promise<RoomChange> {
  const no = refuse(user, room)
  if (no) return no
  const info = rosterRoom(room)!
  const ask = prompt.trim()
  if (!ask) return { ok: false, status: 400, say: 'Say what you want in the room.' }
  if (ask.length > MAX_PROMPT) return { ok: false, status: 400, say: `Shorter, please: ${MAX_PROMPT} characters at most.` }
  if (await changesSince(room, Date.now() - 24 * 3600 * 1000) >= DAILY_CHANGES) return { ok: false, status: 429, say: 'This room has had enough changes for one day. Tomorrow.' }
  if (!(await claimRoom(room, CLAIM_SECONDS))) return { ok: false, status: 409, say: 'Someone is already changing this room. Give it a minute.' }
  try {
    const [before, history] = await Promise.all([getRoom(room), roomLog(room)])
    const result = await decorateRoom({ key: room, room: info, current: before.code, version: before.version, request: ask, asker: user!.name.split(' ')[0], askerCharacter: user!.character, history, log: line => console.log(`[semibart/rooms] ${room}: ${line}`) })
    if (!result.ok) return { ok: false, status: 200, say: result.say }
    const version = await saveRoom({ room, from: before.version, code: result.code, prompt: ask, say: result.say, author: user!.id, kind: 'decorate' })
    if (version === null) return { ok: false, status: 409, say: 'The room changed while I was working. Ask again.' }
    return { ok: true, say: result.say, room, version, code: result.code, ms: result.ms, attempts: result.attempts }
  } finally {
    await releaseRoom(room)
  }
}

/** Step `room` back one change. */
export async function undoChange(user: SemibartUser | null, room: string): Promise<RoomChange> {
  const no = refuse(user, room)
  if (no) return no
  if (!(await claimRoom(room, 20))) return { ok: false, status: 409, say: 'Someone is already changing this room. Give it a minute.' }
  try {
    const state = await undoRoom(room, user!.id)
    if (!state) return { ok: false, status: 200, say: 'Nothing to undo.' }
    return { ok: true, say: 'Undone.', ...state }
  } finally {
    await releaseRoom(room)
  }
}
