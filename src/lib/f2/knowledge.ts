// The knowledge layer behind Dodo's GLOBAL chat (text + voice): one
// conversation that knows everything in all of ONE user's topics.
// Schema: apps/f2/schema/051_f2_knowledge.sql. Reference: docs/f2-global-chat.md.
//
// Two layers, because a big account's material (4M+ chars) cannot ride in a
// prompt on every spoken turn:
//   1. DIGESTS — a short "wiki card" per topic, written once per material
//      change. All of a user's digests, each with where they stand on it, form
//      the MAP that is always in the global prompt.
//   2. CHUNKS — the material itself, embedded, searched per turn (vector +
//      full text, fused) for the passages a question needs.
//
// The universe is always ONE user's topics: every read and the search
// function filter on user_id.
import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from './supabase'
import { buildFullContent, type F2Thread } from './threads'

const DIGEST_MODEL = 'claude-sonnet-5'
const EMBEDDING_MODEL = 'text-embedding-3-small'
/// What the digest writer reads of a topic (≈ 45K tokens). Longer material is
/// sampled head + middle + tail so a book's later chapters are represented.
const DIGEST_SOURCE_CHARS = 180_000
const CHUNK_CHARS = 1400
const CHUNK_OVERLAP = 180
const EMBED_BATCH = 96
const INSERT_BATCH = 200
/// The map's budget in the prompt (≈ 30K tokens). Past it, the least recently
/// touched topics shrink to their first line.
const MAP_MAX_CHARS = 120_000
const PASSAGE_CHARS = 1100

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

function topicTitle(thread: Pick<F2Thread, 'topic' | 'url'>): string {
  return thread.topic || thread.url || 'Untitled topic'
}

// ---------------------------------------------------------------------------
// Chunking + embeddings
// ---------------------------------------------------------------------------

/// Paragraph-aware chunks of ≈ CHUNK_CHARS with a little overlap, so a
/// passage that straddles a boundary is still found whole in one of them.
export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!clean) return []
  const paragraphs = clean.split(/\n{2,}/)
  const pieces: string[] = []
  for (const p of paragraphs) {
    if (p.length <= CHUNK_CHARS) {
      pieces.push(p)
      continue
    }
    // A very long paragraph (a transcript, usually): cut on sentence ends.
    const sentences = p.match(/[^.!?\n]+[.!?]*\s*/g) ?? [p]
    let current = ''
    for (const s of sentences) {
      if (current.length + s.length > CHUNK_CHARS && current) {
        pieces.push(current.trim())
        current = ''
      }
      if (s.length > CHUNK_CHARS) {
        for (let i = 0; i < s.length; i += CHUNK_CHARS) pieces.push(s.slice(i, i + CHUNK_CHARS))
      } else {
        current += s
      }
    }
    if (current.trim()) pieces.push(current.trim())
  }

  const chunks: string[] = []
  let current = ''
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > CHUNK_CHARS) {
      chunks.push(current)
      current = current.slice(-CHUNK_OVERLAP)
    }
    current = current ? `${current}\n\n${piece}` : piece
  }
  if (current.trim()) chunks.push(current)
  return chunks
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH)
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
    })
    if (!res.ok) {
      throw new Error(`embeddings request failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
    }
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] }
    for (const row of json.data.sort((a, b) => a.index - b.index)) out.push(row.embedding)
  }
  return out
}

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

function digestSource(content: string): string {
  if (content.length <= DIGEST_SOURCE_CHARS) return content
  const third = Math.floor(DIGEST_SOURCE_CHARS / 3)
  const mid = Math.floor(content.length / 2)
  return [
    content.slice(0, third),
    '\n\n[… material skipped …]\n\n',
    content.slice(mid - third / 2, mid + third / 2),
    '\n\n[… material skipped …]\n\n',
    content.slice(-third),
  ].join('')
}

const DIGEST_SYSTEM = `You write the index card for one topic in a learner's personal library. A tutor will carry every card of the library in mind during a conversation, to know what the learner has saved, to connect topics to each other, and to decide which topic to look inside. It can search the full text separately — the card is the map, not the material.

Write plain text, no markdown headings, 120–220 words, in this shape:
- First line: one sentence saying what this is (kind of source, author or speaker when known, subject).
- "Key ideas:" 4–8 short clauses separated by semicolons — the claims, arguments or skills that matter most.
- "Names and terms:" the people, works, places, concepts and jargon someone might mention when asking about this, comma separated.
- "Good for:" one line on what questions this topic answers.

Be specific to THIS material — a card that could describe any text on the subject is useless. If the material is thin (a title, a link, a few chat lines), say so in the first line and keep the card short; never invent content.`

export async function writeDigest(thread: F2Thread, content: string): Promise<string> {
  const chat = thread.messages
    .slice(-8)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
    .slice(0, 3000)
  const body = content
    ? `Material:\n${digestSource(content)}`
    : `There is no saved material for this topic yet.${chat ? `\n\nRecent chat about it:\n${chat}` : ''}`
  const response = await anthropic().messages.create({
    model: DIGEST_MODEL,
    max_tokens: 1200,
    thinking: { type: 'disabled' },
    system: DIGEST_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Topic title: ${topicTitle(thread)}\nURL: ${thread.url ?? 'none'}\nKind: ${thread.kind}\n\n${body}`,
      },
    ],
  })
  const text = response.content.find((b) => b.type === 'text')
  const digest = text && text.type === 'text' ? text.text.trim() : ''
  if (!digest) throw new Error(`digest came back empty for thread ${thread.id}`)
  return digest
}

// ---------------------------------------------------------------------------
// Indexing a topic
// ---------------------------------------------------------------------------

export function materialHash(thread: F2Thread, content: string): string {
  return createHash('sha256').update(`${topicTitle(thread)}\n${thread.url ?? ''}\n${content}`).digest('hex')
}

export type IndexResult = { threadId: string; status: 'fresh' | 'indexed'; chunks: number }

/// Bring one topic's digest + chunks up to date. A no-op when the material's
/// hash has not changed. Chunks are replaced wholesale; the digest row is
/// written LAST, so a crash half-way leaves the topic marked stale, not done.
export async function indexTopic(thread: F2Thread, opts: { force?: boolean } = {}): Promise<IndexResult> {
  const db = f2Supabase()
  const content = buildFullContent(thread)
  const hash = materialHash(thread, content)

  if (!opts.force) {
    const { data: existing } = await db
      .from('f2_topic_digests')
      .select('content_hash')
      .eq('thread_id', thread.id)
      .maybeSingle()
    if (existing?.content_hash === hash) return { threadId: thread.id, status: 'fresh', chunks: 0 }
  }

  const chunks = chunkText(content)
  const [digest, embeddings] = await Promise.all([
    writeDigest(thread, content),
    chunks.length > 0 ? embedTexts(chunks) : Promise.resolve([] as number[][]),
  ])

  const { error: delError } = await db.from('f2_topic_chunks').delete().eq('thread_id', thread.id)
  if (delError) throw new Error(`chunk delete failed: ${delError.message}`)
  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const rows = chunks.slice(i, i + INSERT_BATCH).map((text, j) => ({
      thread_id: thread.id,
      user_id: thread.user_id,
      idx: i + j,
      text,
      embedding: JSON.stringify(embeddings[i + j]),
    }))
    const { error } = await db.from('f2_topic_chunks').insert(rows)
    if (error) throw new Error(`chunk insert failed: ${error.message}`)
  }

  const { error: upError } = await db.from('f2_topic_digests').upsert({
    thread_id: thread.id,
    user_id: thread.user_id,
    digest,
    content_hash: hash,
    content_chars: content.length,
    chunk_count: chunks.length,
    model: DIGEST_MODEL,
    updated_at: new Date().toISOString(),
  })
  if (upError) throw new Error(`digest upsert failed: ${upError.message}`)
  return { threadId: thread.id, status: 'indexed', chunks: chunks.length }
}

export type IndexStatus = { topics: number; indexed: number; pending: number; failed: number }

/// The columns the map and the staleness check need — never `content`, which
/// for a big library is megabytes.
const TOPIC_COLUMNS =
  'id, user_id, topic, url, kind, stars, updated_at, last_quizzed_at, recert_due_at, study_focus'
type TopicRow = Pick<
  F2Thread,
  'id' | 'user_id' | 'topic' | 'url' | 'kind' | 'stars' | 'updated_at' | 'last_quizzed_at' | 'recert_due_at' | 'study_focus'
>

async function listTopicRows(userId: string): Promise<TopicRow[]> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .select(TOPIC_COLUMNS)
    .eq('user_id', userId)
    .or('topic.not.is.null,url.not.is.null')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`topic list failed: ${error.message}`)
  return (data ?? []) as unknown as TopicRow[]
}

/// How much of the library is indexed — cheap (no material is loaded): a topic
/// counts as pending when it has no digest or was touched since its digest.
export async function indexStatus(userId: string): Promise<IndexStatus> {
  const topics = await listTopicRows(userId)
  const { data: rows } = await f2Supabase()
    .from('f2_topic_digests')
    .select('thread_id, updated_at')
    .eq('user_id', userId)
  const at = new Map((rows ?? []).map((r) => [r.thread_id as string, new Date(r.updated_at as string).getTime()]))
  const pending = topics.filter((t) => !(at.get(t.id)! >= new Date(t.updated_at).getTime())).length
  return { topics: topics.length, indexed: topics.length - pending, pending, failed: 0 }
}

/// Index whatever of the user's library is missing or stale, newest first,
/// until `budgetMs` runs out (a topic in flight is allowed to finish).
/// Global chat calls this when it opens; ingest paths call indexTopic directly.
export async function ensureUserIndexed(
  userId: string,
  opts: { budgetMs?: number; concurrency?: number } = {},
): Promise<IndexStatus> {
  const started = Date.now()
  const budgetMs = opts.budgetMs ?? 8000
  const topics = await listTopicRows(userId)
  const { data: rows } = await f2Supabase()
    .from('f2_topic_digests')
    .select('thread_id, content_hash, updated_at')
    .eq('user_id', userId)
  const digests = new Map((rows ?? []).map((r) => [r.thread_id as string, r as { content_hash: string; updated_at: string }]))
  // Only a topic touched since its digest can have new material; load just
  // those in full and let the hash decide (a chat message also bumps
  // updated_at, and changes nothing).
  const candidates = topics.filter((t) => {
    const d = digests.get(t.id)
    return !d || new Date(t.updated_at).getTime() > new Date(d.updated_at).getTime()
  })
  const stale: F2Thread[] = []
  for (let i = 0; i < candidates.length; i += 10) {
    const ids = candidates.slice(i, i + 10).map((t) => t.id)
    const { data: full } = await f2Supabase().from('f2_threads').select('*').eq('user_id', userId).in('id', ids)
    for (const t of (full ?? []) as F2Thread[]) {
      const d = digests.get(t.id)
      if (!d || d.content_hash !== materialHash(t, buildFullContent(t))) stale.push(t)
      else await f2Supabase().from('f2_topic_digests').update({ updated_at: new Date().toISOString() }).eq('thread_id', t.id)
    }
  }

  let done = 0
  let failed = 0
  const queue = [...stale]
  const worker = async () => {
    while (queue.length > 0 && Date.now() - started < budgetMs) {
      const thread = queue.shift()!
      try {
        await indexTopic(thread, { force: true })
        done++
      } catch (err) {
        failed++
        console.error('[f2/knowledge] indexTopic failed:', thread.id, err)
      }
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker))
  return {
    topics: topics.length,
    indexed: topics.length - stale.length + done,
    pending: stale.length - done - failed,
    failed,
  }
}

// ---------------------------------------------------------------------------
// The map: every digest + where the learner stands
// ---------------------------------------------------------------------------

function daysAgo(iso: string | null): string {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 60) return `${days} days ago`
  return `${Math.round(days / 30)} months ago`
}

function standing(thread: TopicRow, weaknesses: string[]): string {
  const parts = [
    thread.stars >= 3 ? 'mastered (3 stars)' : `${thread.stars} of 3 stars`,
    `last touched ${daysAgo(thread.updated_at)}`,
  ]
  if (thread.last_quizzed_at) parts.push(`last quizzed ${daysAgo(thread.last_quizzed_at)}`)
  if (thread.recert_due_at && new Date(thread.recert_due_at).getTime() < Date.now()) {
    parts.push('refresher overdue')
  }
  if (thread.study_focus) parts.push(`studying only: "${thread.study_focus}"`)
  if (weaknesses.length > 0) parts.push(`weak spots from their last exam: ${weaknesses.slice(0, 3).join('; ')}`)
  return parts.join(' · ')
}

export type KnowledgeMap = { text: string; topics: number; withoutDigest: number }

/// The always-in-context block for global chat: one entry per topic, most
/// recently touched first.
export async function buildKnowledgeMap(userId: string): Promise<KnowledgeMap> {
  const db = f2Supabase()
  const [topics, digestRows, gradedRows] = await Promise.all([
    listTopicRows(userId),
    db.from('f2_topic_digests').select('thread_id, digest').eq('user_id', userId),
    db
      .from('f2_voice_sessions')
      .select('thread_id, grade_detail, graded_at')
      .eq('user_id', userId)
      .not('grade', 'is', null)
      .order('graded_at', { ascending: false })
      .limit(200),
  ])
  const digests = new Map((digestRows.data ?? []).map((r) => [r.thread_id as string, r.digest as string]))
  const weaknesses = new Map<string, string[]>()
  for (const row of gradedRows.data ?? []) {
    const id = row.thread_id as string | null
    if (!id || weaknesses.has(id)) continue
    weaknesses.set(id, ((row.grade_detail as { weaknesses?: string[] } | null)?.weaknesses ?? []).filter(Boolean))
  }

  let withoutDigest = 0
  const entries = topics.map((t) => {
    const digest = digests.get(t.id)
    if (!digest) withoutDigest++
    return {
      head: `"${topicTitle(t)}" — ${standing(t, weaknesses.get(t.id) ?? [])}`,
      body: digest ?? '(not indexed yet — only the title is known)',
    }
  })

  // Over budget: shrink from the oldest end to the digest's first line.
  let total = entries.reduce((n, e) => n + e.head.length + e.body.length + 2, 0)
  for (let i = entries.length - 1; i >= 0 && total > MAP_MAX_CHARS; i--) {
    const short = entries[i].body.split('\n')[0]
    total -= entries[i].body.length - short.length
    entries[i].body = short
  }

  return {
    text: entries.map((e) => `${e.head}\n${e.body}`).join('\n\n'),
    topics: topics.length,
    withoutDigest,
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/// `similarity` is the cosine similarity to the query — what decides whether a
/// passage's topic is shown to the user as a source (global-chat.ts).
export type Passage = { threadId: string; topic: string; text: string; score: number; similarity: number }

export async function searchKnowledge(
  userId: string,
  query: string,
  opts: { limit?: number; threadId?: string } = {},
): Promise<Passage[]> {
  const q = query.trim().slice(0, 1000)
  if (!q) return []
  const [embedding] = await embedTexts([q])
  const db = f2Supabase()
  const { data, error } = await db.rpc('f2_search_chunks', {
    p_user: userId,
    p_embedding: JSON.stringify(embedding),
    p_query: q,
    p_limit: opts.limit ?? 6,
    p_thread: opts.threadId ?? null,
  })
  if (error) throw new Error(`knowledge search failed: ${error.message}`)
  const rows = (data ?? []) as { thread_id: string; content: string; score: number; similarity: number }[]
  if (rows.length === 0) return []

  const ids = [...new Set(rows.map((r) => r.thread_id))]
  const { data: threads } = await db
    .from('f2_threads')
    .select('id, topic, url')
    .eq('user_id', userId)
    .in('id', ids)
  const titles = new Map((threads ?? []).map((t) => [t.id as string, topicTitle(t as { topic: string | null; url: string | null })]))
  return rows.map((r) => ({
    threadId: r.thread_id,
    topic: titles.get(r.thread_id) ?? 'Untitled topic',
    text: r.content.slice(0, PASSAGE_CHARS),
    score: r.score,
    similarity: r.similarity,
  }))
}

/// The thread a (possibly partial) topic title refers to, for the search tool.
export async function findTopicByTitle(userId: string, title: string): Promise<string | null> {
  const needle = title.trim().toLowerCase()
  if (!needle) return null
  const topics = await listTopicRows(userId)
  const named = topics.map((t) => ({ id: t.id, title: topicTitle(t).toLowerCase() }))
  return (
    named.find((t) => t.title === needle)?.id ??
    named.find((t) => t.title.includes(needle) || needle.includes(t.title))?.id ??
    null
  )
}

export function formatPassages(passages: Passage[]): string {
  return passages.map((p, i) => `(${i + 1}) from "${p.topic}":\n${p.text}`).join('\n\n')
}

/// Is this turn worth a search? "yes", "go on", "mm-hmm" are not.
export function worthSearching(text: string): boolean {
  const t = text.trim()
  return t.length >= 14 && t.split(/\s+/).length >= 3
}
