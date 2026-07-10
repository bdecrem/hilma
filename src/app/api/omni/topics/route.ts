import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/omni/auth'
import { omniSupabase } from '@/lib/omni/supabase'
import { getOrCreateProgress } from '@/lib/omni/progress'
import { isValidLevel } from '@/lib/omni/languages'
import { generateChapter } from '@/lib/omni/generate'
import { insertChapterPackage } from '@/lib/omni/topics'

export const runtime = 'nodejs'
// Custom-topic generation is a single Sonnet call (~15-30s).
export const maxDuration = 60

const LIST_COLUMNS =
  'id, language, level, kind, user_id, title, title_target, emoji, description, status, sort_order, created_at, omni_cards(count)'

type ListRow = Record<string, unknown> & {
  omni_cards?: { count: number }[]
}

function flattenCount(rows: ListRow[] | null) {
  return (rows ?? []).map((r) => {
    const { omni_cards, ...rest } = r
    return { ...rest, card_count: omni_cards?.[0]?.count ?? 0 }
  })
}

/** All chapters for the user's language: the prebaked course + their own. */
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  const sb = omniSupabase()
  const [prebaked, mine] = await Promise.all([
    sb
      .from('omni_topics')
      .select(LIST_COLUMNS)
      .eq('language', user.language)
      .is('user_id', null)
      .eq('status', 'ready')
      .order('level', { ascending: true })
      .order('sort_order', { ascending: true }),
    sb
      .from('omni_topics')
      .select(LIST_COLUMNS)
      .eq('language', user.language)
      .eq('user_id', user.id)
      .eq('status', 'ready')
      .order('created_at', { ascending: false }),
  ])
  if (prebaked.error || mine.error) {
    console.error('[omni/topics] list failed:', prebaked.error ?? mine.error)
    return NextResponse.json({ error: 'Could not load chapters.' }, { status: 500 })
  }
  return NextResponse.json({
    prebaked: flattenCount(prebaked.data as ListRow[]),
    mine: flattenCount(mine.data as ListRow[]),
  })
}

/** Create a custom chapter from a user-provided theme. Synchronous generation. */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: { title?: string; level?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const theme = body.title?.trim()
  if (!theme) {
    return NextResponse.json({ error: 'Give the topic a title.' }, { status: 400 })
  }
  if (theme.length > 200) {
    return NextResponse.json({ error: 'Keep the topic under 200 characters.' }, { status: 400 })
  }

  const progress = await getOrCreateProgress(user.id, user.language)
  const level = isValidLevel(Number(body.level)) ? Number(body.level) : progress.level

  try {
    const pkg = await generateChapter({ language: user.language, level, theme })
    const { topic, cards } = await insertChapterPackage({
      pkg,
      language: user.language,
      level,
      kind: 'custom',
      userId: user.id,
    })
    return NextResponse.json({ topic, cards })
  } catch (err) {
    console.error('[omni/topics] custom generation failed:', err)
    return NextResponse.json(
      { error: 'Could not build that chapter. Try again.' },
      { status: 500 },
    )
  }
}
