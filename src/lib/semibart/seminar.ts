// The seminar room as the last grab of the question mic left it (2026-11-14). flamewar.ts stores the
// moves of every scene it writes; the game draws the mess they leave (papers, coffee, water, a
// smashed window, the trash can on its side, the screen down, the light hanging by a wire, the door
// open, the clock on the floor) for everyone who walks in, until someone picks up the broom.
// The check account has its own copy ('check'), so checks never wreck or sweep the fellows' room.
// Table: apps/semibart/schema/024_semibart_seminar.sql. No Next imports.

import { db } from './db'

export type WreckMove = { act: string; who?: string; style?: string }
export type Wreck = { by: string; name: string; at: string; headline: string; moves: WreckMove[] }

const rowFor = (character: string | null | undefined) => (character === 'check' ? 'check' : 'room')

export async function getWreck(character: string | null | undefined): Promise<Wreck | null> {
  const { data, error } = await db().from('semibart_seminar').select('wreck').eq('id', rowFor(character)).maybeSingle()
  if (error) throw new Error(`semibart_seminar: ${error.message}`)
  return (data?.wreck as Wreck | null) ?? null
}

export async function saveWreck(character: string, wreck: Wreck): Promise<void> {
  const { error } = await db().from('semibart_seminar').upsert({ id: rowFor(character), wreck, updated_by: character, updated_at: new Date().toISOString() })
  if (error) throw new Error(`semibart_seminar: ${error.message}`)
}

/** The broom. True when there was a mess to sweep. */
export async function sweepWreck(character: string): Promise<boolean> {
  const was = await getWreck(character)
  if (!was) return false
  const { error } = await db().from('semibart_seminar').upsert({ id: rowFor(character), wreck: null, updated_by: character, updated_at: new Date().toISOString() })
  if (error) throw new Error(`semibart_seminar: ${error.message}`)
  return true
}
