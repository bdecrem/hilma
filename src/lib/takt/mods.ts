// Takt mods (apps/takt/schema/003_takt_mods.sql, 004_takt_mod_versions.sql): a user's own
// version of a Stage song, made by Agent mode. A row is the whole bundle the app downloads —
// the song file (band + parts, the app's own format), this song's charting override, the
// conversation — and its version counts the turns that changed it. Version 0 is a conversation
// that hasn't changed anything yet: the app shows no card for it, but keeps the thread.
//
// Every saved version is kept (takt_mod_versions: v0 the clone as made, then one per turn that
// changed the song), so a mod rolls back to any earlier one: a rollback is a new version with
// the old content, so the history stays linear and nothing is lost.

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

/** 'mod': Agent mode's own version of a track, a card on the set list. 'solo': the improv
 *  teacher's whole track from the player's take (solo-agent.ts), the Solo level on the song it
 *  came from; one per song and player, rewritten as the next version by each new take. */
export type ModKind = 'mod' | 'solo'

export type ModRow = {
  id: string
  user_id: string
  kind: ModKind
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

/** One entry of a mod's history, without its content. */
export type ModVersion = {
  version: number
  title: string
  line: string
  ask: string
  at: string
}

/** What the list route returns: everything but the song and the thread. */
export type ModSummary = Omit<ModRow, 'song' | 'charting' | 'messages' | 'user_id'> & { line: string }

/** What the app stores: the row without the owner, plus the history. */
export type ModBundle = Omit<ModRow, 'user_id'> & { versions: ModVersion[] }

const COLUMNS = 'id, user_id, kind, base, base_title, name, title, version, song, charting, messages, created_at, updated_at'

export function summary(m: ModRow): ModSummary {
  return {
    id: m.id,
    kind: m.kind ?? 'mod',
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

export async function bundle(m: ModRow): Promise<ModBundle> {
  const { user_id: _owner, ...rest } = m
  void _owner
  return { ...rest, versions: await listVersions(m.id) }
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

/** A new mod of `base` for the user: the song as the app sent it, titled "<Base> mod NN", and
 *  version 0 of its history (the clone as made). A solo (kind 'solo') is named "solo-…" and
 *  keeps the song's own title: the app shows it as a level of that song, not as a card. */
export async function createMod(userId: string, base: string, baseTitle: string, song: SongFile, charting: SongOverride | null, kind: ModKind = 'mod'): Promise<ModRow> {
  const mine = await listMods(userId)
  const nth = mine.filter((m) => m.base_title === baseTitle && (m.kind ?? 'mod') === 'mod').length + 1
  const title = kind === 'solo' ? baseTitle : `${baseTitle} mod ${String(nth).padStart(2, '0')}`
  const name = `${kind === 'solo' ? 'solo' : 'mod'}-${randomBytes(4).toString('hex')}`
  const file: SongFile = JSON.parse(JSON.stringify(song))
  file.name = name
  file.song.title = title
  const { data, error } = await f2Supabase()
    .from('takt_mods')
    .insert({ user_id: userId, kind, base, base_title: baseTitle, name, title, version: 0, song: file, charting, messages: [] })
    .select(COLUMNS)
    .single()
  if (error || !data) throw new Error(`takt_mods insert: ${error?.message}`)
  const row = data as unknown as ModRow
  await recordVersion(row, `The original: ${baseTitle}`)
  return row
}

/** The user's solo on `base` (the improv teacher's whole track), the latest if several. */
export async function findSolo(userId: string, base: string): Promise<ModRow | null> {
  const { data, error } = await f2Supabase()
    .from('takt_mods')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('kind', 'solo')
    .eq('base', base)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`takt_mods: ${error.message}`)
  return (data as unknown as ModRow | null) ?? null
}

/** Saves the row; with `ask` it also files the row's version in the history (call it after
 *  the version was bumped). */
export async function saveMod(m: ModRow, ask?: string): Promise<void> {
  const { error } = await f2Supabase()
    .from('takt_mods')
    .update({ title: m.title, version: m.version, song: m.song, charting: m.charting, messages: m.messages, updated_at: new Date().toISOString() })
    .eq('id', m.id)
    .eq('user_id', m.user_id)
  if (error) throw new Error(`takt_mods update: ${error.message}`)
  if (ask != null) await recordVersion(m, ask)
}

export async function recordVersion(m: ModRow, ask: string): Promise<void> {
  const { error } = await f2Supabase()
    .from('takt_mod_versions')
    .upsert({ mod_id: m.id, version: m.version, title: m.title, song: m.song, charting: m.charting, ask }, { onConflict: 'mod_id,version' })
  if (error) throw new Error(`takt_mod_versions: ${error.message}`)
}

export async function listVersions(modId: string): Promise<ModVersion[]> {
  const { data, error } = await f2Supabase()
    .from('takt_mod_versions')
    .select('version, title, ask, created_at, song->song->line')
    .eq('mod_id', modId)
    .order('version', { ascending: true })
  if (error) throw new Error(`takt_mod_versions: ${error.message}`)
  return ((data ?? []) as unknown as { version: number; title: string; ask: string; created_at: string; line: string | null }[]).map((v) => ({
    version: v.version,
    title: v.title,
    line: v.line ?? '',
    ask: v.ask,
    at: v.created_at,
  }))
}

/** One version's content. */
export async function getVersion(modId: string, version: number): Promise<{ title: string; song: SongFile; charting: SongOverride | null } | null> {
  const { data, error } = await f2Supabase()
    .from('takt_mod_versions')
    .select('title, song, charting')
    .eq('mod_id', modId)
    .eq('version', version)
    .maybeSingle()
  if (error) throw new Error(`takt_mod_versions: ${error.message}`)
  return (data as { title: string; song: SongFile; charting: SongOverride | null } | null) ?? null
}

/** Roll the mod back to `version`: a new version with that content, a line in the thread. */
export async function rollBack(m: ModRow, version: number): Promise<{ error?: string }> {
  if (version === m.version) return { error: `v${version} is the version it is on` }
  const v = await getVersion(m.id, version)
  if (!v) return { error: `no v${version} in the history` }
  m.song = v.song
  m.charting = v.charting
  m.title = v.title
  m.song.song.title = v.title
  m.version += 1
  const now = new Date().toISOString()
  m.messages = [...m.messages, { role: 'agent', text: `Back to v${version}: ${v.song.song.line} (now v${m.version}).`, at: now }]
  await saveMod(m, `Back to v${version}`)
  return {}
}

export async function deleteMod(userId: string, id: string): Promise<boolean> {
  const { data, error } = await f2Supabase().from('takt_mods').delete().eq('user_id', userId).eq('id', id).select('id')
  if (error) throw new Error(`takt_mods delete: ${error.message}`)
  return (data?.length ?? 0) > 0
}
