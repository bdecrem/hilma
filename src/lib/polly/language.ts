// Languages Polly teaches, and the learner's active course.
//
// The course row (polly_courses) is created with the account during the
// first run; polly_users.active_course_id points at it. Adding a language
// here also needs the check constraint in apps/polly/schema/002 widened.

import { pollySupabase } from './supabase'

export const LANGUAGES = {
  it: { name: 'Italian', native: 'Italiano' },
  fr: { name: 'French', native: 'Français' },
  ko: { name: 'Korean', native: '한국어' },
} as const

export type LanguageCode = keyof typeof LANGUAGES

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === 'string' && v in LANGUAGES
}

/// Create the course if the user doesn't have one for that language, and
/// make it the active one. Returns the course id.
export async function setActiveLanguage(
  userId: string,
  language: LanguageCode,
): Promise<{ courseId: string } | { error: string; status: number }> {
  const sb = pollySupabase()
  const { data: course, error } = await sb
    .from('polly_courses')
    .upsert({ user_id: userId, language }, { onConflict: 'user_id,language' })
    .select('id')
    .single()
  if (error || !course) {
    console.error('[polly/language] course upsert failed:', error)
    return { error: 'Could not set up the course.', status: 500 }
  }
  const { error: uErr } = await sb
    .from('polly_users')
    .update({ active_course_id: course.id, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (uErr) {
    console.error('[polly/language] active course update failed:', uErr)
    return { error: 'Could not set up the course.', status: 500 }
  }
  return { courseId: course.id }
}

/// The learner's active language code, or null before the first run picked one.
export async function activeLanguage(userId: string): Promise<LanguageCode | null> {
  const { data, error } = await pollySupabase()
    .from('polly_users')
    .select('active_course:polly_courses!polly_users_active_course_id_fkey(language)')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[polly/language] activeLanguage failed:', error)
    return null
  }
  const course = (data as { active_course?: { language?: string } | null } | null)?.active_course
  return isLanguageCode(course?.language) ? course.language : null
}

/// One paragraph for the tutor prompts. Empty when no language is set yet
/// (accounts created before the first-run flow existed).
export function learnerLine(language: LanguageCode | null): string {
  if (!language) return ''
  const { name } = LANGUAGES[language]
  return `\n\nThe learner is studying ${name} (their own language is English). You are their ${name} tutor: explain in English, give ${name} examples with translations, and correct their ${name} gently and specifically. When they write in ${name}, reply in simple ${name} first, then the English.`
}
