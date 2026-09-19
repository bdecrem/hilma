// Language profiles — one account, one profile per language.
//
// Each language a learner studies is its own polly_users row (schema 007):
// its own topics, cards, Peck, path, streak and level, because everything in
// Polly is scoped by user_id. The root row holds the credentials (or the
// guest name); siblings point at it through account_id. Switching language
// is switching profile: the server re-issues the session cookie for the
// sibling row, creating it the first time.

import { randomBytes } from 'node:crypto'
import { hashPassword } from './auth'
import { LANGUAGES, isLanguageCode, setActiveLanguage, type LanguageCode } from './language'
import { getUserProgress } from './progress'
import { pollySupabase } from './supabase'

type Row = {
  id: string
  username: string
  account_id: string | null
  avatar_url: string | null
  is_guest: boolean
  realtime_voice: string | null
  voice_style: string | null
  recert_enabled: boolean
  content_quality: string
  active_course: { language: string } | null
}

const ROW =
  'id, username, account_id, avatar_url, is_guest, realtime_voice, voice_style, recert_enabled, content_quality, ' +
  'active_course:polly_courses!polly_users_active_course_id_fkey(language)'

/// The account's root user id for any of its profiles.
export async function accountRootId(userId: string): Promise<string> {
  const { data } = await pollySupabase()
    .from('polly_users')
    .select('account_id')
    .eq('id', userId)
    .maybeSingle()
  return ((data as { account_id: string | null } | null)?.account_id) ?? userId
}

/// Every profile of the account (root first), with its language.
async function accountRows(rootId: string): Promise<Row[]> {
  const { data, error } = await pollySupabase()
    .from('polly_users')
    .select(ROW)
    .or(`id.eq.${rootId},account_id.eq.${rootId}`)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[polly/profiles] accountRows failed:', error)
    return []
  }
  return (data ?? []) as unknown as Row[]
}

export type LanguageProfile = {
  language: LanguageCode
  name: string
  native: string
  /// The learner has a profile for this language.
  started: boolean
  active: boolean
  level: number
  topic_count: number
  streak: number
}

/// All the languages Polly teaches, each marked with whether this account
/// studies it, which one is active, and a line of progress for the tile.
export async function listLanguageProfiles(userId: string): Promise<LanguageProfile[]> {
  const rootId = await accountRootId(userId)
  const rows = await accountRows(rootId)
  const byLang = new Map<string, Row>()
  for (const r of rows) {
    const lang = r.active_course?.language
    if (isLanguageCode(lang) && !byLang.has(lang)) byLang.set(lang, r)
  }
  const ids = [...byLang.values()].map((r) => r.id)
  const streaks = new Map<string, number>()
  if (ids.length) {
    const { data } = await pollySupabase()
      .from('polly_users')
      .select('id, daily_streak')
      .in('id', ids)
    for (const s of (data ?? []) as { id: string; daily_streak: number | null }[]) {
      streaks.set(s.id, s.daily_streak ?? 0)
    }
  }
  return Promise.all(
    (Object.keys(LANGUAGES) as LanguageCode[]).map(async (language) => {
      const row = byLang.get(language)
      const progress = row ? await getUserProgress(row.id) : null
      return {
        language,
        name: LANGUAGES[language].name,
        native: LANGUAGES[language].native,
        started: Boolean(row),
        active: row?.id === userId,
        level: progress?.level ?? 0,
        topic_count: progress?.topic_count ?? 0,
        streak: row ? (streaks.get(row.id) ?? 0) : 0,
      }
    }),
  )
}

/// The profile to sign into for a language: the existing one, or a new
/// sibling (with its course) the first time. Returns the profile's user id.
export async function profileForLanguage(
  userId: string,
  language: LanguageCode,
): Promise<{ id: string; created: boolean } | { error: string; status: number }> {
  const sb = pollySupabase()
  const rootId = await accountRootId(userId)
  const rows = await accountRows(rootId)
  const root = rows.find((r) => r.id === rootId)
  if (!root) return { error: 'Account not found.', status: 404 }

  const existing = rows.find((r) => r.active_course?.language === language)
  if (existing) return { id: existing.id, created: false }

  // A root that never picked a language (accounts older than the first-run
  // flow) simply becomes this language — nothing to keep apart yet.
  if (!root.active_course) {
    const r = await setActiveLanguage(root.id, language)
    if ('error' in r) return r
    return { id: root.id, created: false }
  }

  // New sibling. Account-level things (avatar, guest flag, voice, refresher
  // preference) start as a copy of the profile the learner is switching from.
  const from = rows.find((r) => r.id === userId) ?? root
  const password_hash = await hashPassword(randomBytes(24).toString('hex'))
  const { data, error } = await sb
    .from('polly_users')
    .insert({
      username: `${root.username}+${language}`,
      password_hash,
      account_id: rootId,
      is_guest: root.is_guest,
      avatar_url: root.avatar_url,
      realtime_voice: from.realtime_voice,
      voice_style: from.voice_style,
      recert_enabled: from.recert_enabled,
      content_quality: from.content_quality,
    })
    .select('id')
    .single()
  if (error || !data) {
    // Two switches racing: the other one made the row — use it.
    if (error?.code === '23505') {
      const again = (await accountRows(rootId)).find((r) => r.username === `${root.username}+${language}`)
      if (again) {
        const r = await setActiveLanguage(again.id, language)
        if ('error' in r) return r
        return { id: again.id, created: false }
      }
    }
    console.error('[polly/profiles] create profile failed:', error)
    return { error: 'Could not start that language.', status: 500 }
  }
  const id = (data as { id: string }).id
  const r = await setActiveLanguage(id, language)
  if ('error' in r) {
    await sb.from('polly_users').delete().eq('id', id)
    return r
  }
  return { id, created: true }
}

/// Remember which profile the account used last (a fresh login lands there).
export async function rememberProfile(profileId: string): Promise<void> {
  const rootId = await accountRootId(profileId)
  const { error } = await pollySupabase()
    .from('polly_users')
    .update({ last_profile_id: profileId })
    .eq('id', rootId)
  if (error) console.error('[polly/profiles] rememberProfile failed:', error)
}

/// After a password login on the root: the profile to land in.
export async function landingProfileId(rootId: string): Promise<string> {
  const { data } = await pollySupabase()
    .from('polly_users')
    .select('last_profile_id')
    .eq('id', rootId)
    .maybeSingle()
  const last = (data as { last_profile_id: string | null } | null)?.last_profile_id
  if (!last || last === rootId) return rootId
  // Only a profile that still belongs to this account.
  const { data: row } = await pollySupabase()
    .from('polly_users')
    .select('id')
    .eq('id', last)
    .eq('account_id', rootId)
    .maybeSingle()
  return row ? last : rootId
}

/// Write an account-level column to every profile of the account, so each
/// row keeps reading its own copy (avatar, guest flag).
export async function updateAccountWide(
  userId: string,
  patch: { avatar_url?: string | null; is_guest?: boolean },
): Promise<void> {
  const rootId = await accountRootId(userId)
  const { error } = await pollySupabase()
    .from('polly_users')
    .update(patch)
    .or(`id.eq.${rootId},account_id.eq.${rootId}`)
  if (error) console.error('[polly/profiles] updateAccountWide failed:', error)
}
