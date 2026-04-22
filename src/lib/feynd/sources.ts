import { feyndSupabase } from './supabase'

export type FeyndSource = {
  id: string
  topic_id: string
  kind: string
  url: string | null
  title: string
  author: string | null
  publisher: string | null
  published_on: string | null
  source_text: string
  summary: string | null
  tags: string[]
  token_estimate: number | null
}

// In-process cache — the source pool rarely changes, so we don't re-query
// on every Opus call. TTL short enough that new ingests show up without
// redeploy but long enough that chats don't each pay a round-trip.
const CACHE_TTL_MS = 60 * 1000
const cache: Map<string, { at: number; sources: FeyndSource[] }> = new Map()

export async function loadSourcesForTopic(topicId: string): Promise<FeyndSource[]> {
  const now = Date.now()
  const hit = cache.get(topicId)
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.sources

  const sb = feyndSupabase()
  const { data, error } = await sb
    .from('feynd_sources')
    .select('id, topic_id, kind, url, title, author, publisher, published_on, source_text, summary, tags, token_estimate')
    .eq('topic_id', topicId)
    .order('published_on', { ascending: false, nullsFirst: false })
  if (error) throw new Error(`loadSourcesForTopic: ${error.message}`)

  const sources = (data ?? []) as FeyndSource[]
  cache.set(topicId, { at: now, sources })
  return sources
}

export function invalidateSourceCache(topicId?: string) {
  if (topicId) cache.delete(topicId)
  else cache.clear()
}

// Format a source as a compact markdown block to inject into an Opus
// system-prompt cache block. Keep the preamble short — the value is the
// source_text itself.
export function renderSourceBlock(s: FeyndSource): string {
  const bits: string[] = []
  bits.push(`### ${s.title}`)
  const meta: string[] = []
  if (s.author) meta.push(s.author)
  if (s.publisher) meta.push(s.publisher)
  if (s.published_on) meta.push(s.published_on)
  if (s.kind) meta.push(`(${s.kind})`)
  if (meta.length) bits.push(meta.join(' · '))
  if (s.url) bits.push(`URL: ${s.url}`)
  bits.push('')
  bits.push(s.source_text)
  return bits.join('\n')
}
