import { omniSupabase } from './supabase'
import type { ChapterPackage, DialogueLine, GrammarModule } from './generate'

export type OmniTopic = {
  id: string
  language: string
  level: number
  kind: 'prebaked' | 'custom' | 'freeform'
  user_id: string | null
  title: string
  title_target: string | null
  emoji: string | null
  description: string | null
  dialogue: DialogueLine[]
  grammar: GrammarModule | null
  status: string
  sort_order: number
  created_at: string
}

export type OmniCard = {
  id: string
  topic_id: string
  term: string
  romanization: string | null
  meaning: string
  example: string | null
  example_translation: string | null
  sort_order: number
}

export type CardWithReview = OmniCard & {
  strength: number
  last_result: 'known' | 'unknown' | null
}

const TOPIC_COLUMNS =
  'id, language, level, kind, user_id, title, title_target, emoji, description, dialogue, grammar, status, sort_order, created_at'

export async function insertChapterPackage(input: {
  pkg: ChapterPackage
  language: string
  level: number
  kind: 'prebaked' | 'custom' | 'freeform'
  userId?: string
  sortOrder?: number
}): Promise<{ topic: OmniTopic; cards: OmniCard[] }> {
  const sb = omniSupabase()
  const { pkg } = input
  const { data: topic, error } = await sb
    .from('omni_topics')
    .insert({
      language: input.language,
      level: input.level,
      kind: input.kind,
      user_id: input.userId ?? null,
      title: pkg.title,
      title_target: pkg.title_target ?? null,
      emoji: pkg.emoji ?? null,
      description: pkg.description ?? null,
      dialogue: pkg.dialogue,
      grammar: pkg.grammar,
      status: 'ready',
      sort_order: input.sortOrder ?? 0,
    })
    .select(TOPIC_COLUMNS)
    .single()
  if (error || !topic) {
    throw new Error(`insertChapterPackage topic failed: ${error?.message}`)
  }

  const rows = pkg.cards.map((c, i) => ({
    topic_id: topic.id,
    term: c.term,
    romanization: c.romanization ?? null,
    meaning: c.meaning,
    example: c.example ?? null,
    example_translation: c.example_translation ?? null,
    sort_order: i,
  }))
  const { data: cards, error: cardErr } = await sb
    .from('omni_cards')
    .insert(rows)
    .select('*')
  if (cardErr || !cards) {
    throw new Error(`insertChapterPackage cards failed: ${cardErr?.message}`)
  }
  return { topic: topic as OmniTopic, cards: cards as OmniCard[] }
}

/** A topic the user may see: prebaked, or one they own. */
export async function getTopicForUser(
  userId: string,
  topicId: string,
): Promise<OmniTopic | null> {
  const { data } = await omniSupabase()
    .from('omni_topics')
    .select(TOPIC_COLUMNS)
    .eq('id', topicId)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .maybeSingle()
  return (data as OmniTopic | null) ?? null
}

export async function getTopicCards(topicId: string): Promise<OmniCard[]> {
  const { data, error } = await omniSupabase()
    .from('omni_cards')
    .select('*')
    .eq('topic_id', topicId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`getTopicCards failed: ${error.message}`)
  return (data ?? []) as OmniCard[]
}

export async function getCardsWithReviews(
  userId: string,
  topicId: string,
): Promise<CardWithReview[]> {
  const cards = await getTopicCards(topicId)
  if (cards.length === 0) return []
  const { data: reviews } = await omniSupabase()
    .from('omni_reviews')
    .select('card_id, strength, last_result')
    .eq('user_id', userId)
    .in('card_id', cards.map((c) => c.id))
  const byCard = new Map(
    (reviews ?? []).map((r) => [r.card_id as string, r]),
  )
  return cards.map((c) => {
    const r = byCard.get(c.id)
    return {
      ...c,
      strength: (r?.strength as number) ?? 0,
      last_result: (r?.last_result as 'known' | 'unknown' | null) ?? null,
    }
  })
}
