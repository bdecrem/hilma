import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/omni/auth'
import { omniSupabase } from '@/lib/omni/supabase'
import { getOrCreateProgress, progressPayload } from '@/lib/omni/progress'
import { isLanguageCode, isValidLevel } from '@/lib/omni/languages'

export const runtime = 'nodejs'

/** Update profile: switch language (progress per language is kept), rename. */
export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: { language?: string; display_name?: string; level?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.language !== undefined) {
    if (!isLanguageCode(body.language)) {
      return NextResponse.json({ error: 'Unknown language.' }, { status: 400 })
    }
    update.language = body.language
  }
  if (body.display_name !== undefined) {
    update.display_name = body.display_name.trim() || null
  }

  const { data: updated, error } = await omniSupabase()
    .from('omni_users')
    .update(update)
    .eq('id', user.id)
    .select('id, email, display_name, language')
    .single()
  if (error || !updated) {
    return NextResponse.json({ error: 'Update failed.' }, { status: 500 })
  }

  const startLevel = isValidLevel(Number(body.level)) ? Number(body.level) : 1
  const progress = await getOrCreateProgress(updated.id, updated.language, startLevel)
  return NextResponse.json({ user: updated, progress: progressPayload(progress) })
}
