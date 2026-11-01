// Takt mods (apps/takt/schema/003_takt_mods.sql): a user's own version of a Stage song, made
// by Agent mode. A row is the whole bundle the app downloads — the song file (band + parts,
// the app's own format), this song's charting override, the conversation — and its version
// counts the turns that changed it. Version 0 is a conversation that hasn't changed anything
// yet: the app shows no card for it, but keeps the thread.

import { randomBytes } from 'node:crypto'
import { f2Supabase } from '@/lib/f2/supabase'
import type { SongFile } from './songfile'
import type { SongOverride } from './charting'

export type ModMessage = {
  role: 'user' | 'agent'
  text: string
  at: string
  /** The agent's working steps, for the sheet's history. */
  steps?: string[]
}

export type ModRow = {
  id: string
  user_id: string
  base: string
  base_title: string
  name: string
  title: string
  version: number
  song: SongFile
  charting: SongOverride | null
  messages: ModMessage[]
  created_at: string
  updated_at: string
}

/** What the list route returns: everything but the song and the thread. */
export type ModSummary = Omit<ModRow, 'song' | 'charting' | 'messages' | 'user_id'> & { line: string }

const COLUMNS = 'id, user_id, base, base_title, name, title, version, song, charting, messages, created_at, updated_at'

export function summary(m: ModRow): ModSummary {
  return {
    id: m.id,
    base: m.base,
    base_title: m.base_title,
    name: m.name,
    title: m.title,
    version: m.version,
    line: m.song.song.line,
    created_at: m.created_at,
    updated_at: m.updated_at,
  }
}

/** The bundle the app stores: the row without the owner. */
export function bundle(m: ModRow): Omit<ModRow, 'user_id'> {
  const { user_id: _owner, ...rest } = m
  void _owner
  return rest
}

export async function listMods(userId: string): Promise<ModRow[]> {
  const { data, error } = await f2Supabase()
    .from('takt_mods')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`takt_mods: ${error.message}`)
  return (data ?? []) as unknown as ModRow[]
}

export async function getMod(userId: string, id: string): Promise<ModRow | null> {
  const { data, error } = await f2Supabase()
    .from('takt_mods')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`takt_mods: ${error.message}`)
  return (data as unknown as ModRow | null) ?? null
}

/** A new mod of `base` for the user: the song as the app sent it, titled "<Base> mod NN". */
export async function createMod(userId: string, base: string, baseTitle: string, song: SongFile, charting: SongOverride | null): Promise<ModRow> {
  const mine = await listMods(userId)
  const nth = mine.filter((m) => m.base_title === baseTitle).length + 1
  const title = `${baseTitle} mod ${String(nth).padStart(2, '0')}`
  const name = `mod-${randomBytes(4).toString('hex')}`
  const file: SongFile = JSON.parse(JSON.stringify(song))
  file.name = name
  file.song.title = title
  const { data, error } = await f2Supabase()
    .from('takt_mods')
    .insert({ user_id: userId, base, base_title: baseTitle, name, title, version: 0, song: file, charting, messages: [] })
    .select(COLUMNS)
    .single()
  if (error || !data) throw new Error(`takt_mods insert: ${error?.message}`)
  return data as unknown as ModRow
}

export async function saveMod(m: ModRow): Promise<void> {
  const { error } = await f2Supabase()
    .from('takt_mods')
    .update({ title: m.title, version: m.version, song: m.song, charting: m.charting, messages: m.messages, updated_at: new Date().toISOString() })
    .eq('id', m.id)
    .eq('user_id', m.user_id)
  if (error) throw new Error(`takt_mods update: ${error.message}`)
}

export async function deleteMod(userId: string, id: string): Promise<boolean> {
  const { data, error } = await f2Supabase().from('takt_mods').delete().eq('user_id', userId).eq('id', id).select('id')
  if (error) throw new Error(`takt_mods delete: ${error.message}`)
  return (data?.length ?? 0) > 0
}
