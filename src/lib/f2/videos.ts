// F2 "setup:" — agentic explainer-video finder.
//
// Given a freeform request ("find me videos giving a good overview of the
// history of Israel that won't bore me"), this:
//   1. plans 2-3 YouTube search queries + quality criteria (Haiku),
//   2. searches the YouTube Data API (long videos only) and pulls real
//      durations / channels / view counts,
//   3. filters to the 30-60 min band, then
//   4. ranks the candidates and picks the 3 best reputable, on-topic videos
//      (Sonnet).
//
// The caller (agent.ts handleSetup) creates a topic from the result and
// ingests the transcripts. Discovery uses the YouTube Data API rather than
// letting the model free-associate URLs, so durations and links are real.

import Anthropic from '@anthropic-ai/sdk'

const PLAN_MODEL = 'claude-haiku-4-5'
const RANK_MODEL = 'claude-sonnet-4-6'

// Duration band. Bart's spec is 30-60 min; we collect a slightly wider net so
// the ranker has room to choose, and tell it to prefer the 30-60 core.
const MIN_SEC = 25 * 60
const MAX_SEC = 70 * 60

const SEARCH_API = 'https://www.googleapis.com/youtube/v3/search'
const VIDEOS_API = 'https://www.googleapis.com/youtube/v3/videos'

let _client: Anthropic | null = null
function anthropic(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey })
  return _client
}

function youtubeKey(): string {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YOUTUBE_API_KEY is not set')
  return key
}

export type VideoCandidate = {
  videoId: string
  url: string
  title: string
  channel: string
  durationSec: number
  viewCount: number
  publishedAt: string
}

export type VideoPick = VideoCandidate & { why: string }

export type FindResult = {
  topicTitle: string
  picks: VideoPick[]
  candidatesConsidered: number
}

// --- Step 1: turn the freeform ask into search queries + criteria ----------

type SearchPlan = {
  topicTitle: string
  queries: string[]
  criteria: string
  recencyYears: number | null
}

const PLAN_SYSTEM =
  'You plan a YouTube search to find long-form explainer videos for a learner. ' +
  'Given their freeform request, return ONLY a JSON object (no prose, no code fence) with keys: ' +
  '"topicTitle" (a clean 3-7 word chapter-style title for the subject, Title Case, no quotes), ' +
  '"queries" (2-3 distinct YouTube search query strings likely to surface reputable 30-60 minute explainers, lectures, or documentaries — vary the angle), ' +
  '"criteria" (one sentence describing what makes a strong pick for THIS request — honor any taste cues like "won\'t bore me" or "overview"), ' +
  'and "recencyYears" (an integer when the user asks for recent/last-N-years material, else null). ' +
  'Do not invent video titles or URLs — only produce search queries.'

async function planSearch(request: string, today: string): Promise<SearchPlan | null> {
  try {
    const res = await anthropic().messages.create({
      model: PLAN_MODEL,
      max_tokens: 400,
      system: PLAN_SYSTEM,
      messages: [{ role: 'user', content: `Today is ${today}.\n\nRequest: ${request}` }],
    })
    const block = res.content[0]
    const raw = block?.type === 'text' ? block.text : ''
    const parsed = extractJson(raw) as Partial<SearchPlan> | null
    if (!parsed || !Array.isArray(parsed.queries) || parsed.queries.length === 0) return null
    return {
      topicTitle: (parsed.topicTitle || '').trim() || 'New Topic',
      queries: parsed.queries.filter((q) => typeof q === 'string' && q.trim()).slice(0, 3),
      criteria: (parsed.criteria || '').trim(),
      recencyYears:
        typeof parsed.recencyYears === 'number' && parsed.recencyYears > 0
          ? Math.floor(parsed.recencyYears)
          : null,
    }
  } catch (err) {
    console.error('[f2] planSearch failed:', err)
    return null
  }
}

// --- Step 2: YouTube Data API search + details -----------------------------

/// search.list for one query → up to `max` video ids. videoDuration=long
/// restricts to >20 min so we don't waste the details quota on shorts.
async function searchVideoIds(
  query: string,
  publishedAfter: string | null,
  max = 12,
): Promise<string[]> {
  const params = new URLSearchParams({
    key: youtubeKey(),
    q: query,
    part: 'snippet',
    type: 'video',
    videoDuration: 'long',
    order: 'relevance',
    relevanceLanguage: 'en',
    maxResults: String(max),
  })
  if (publishedAfter) params.set('publishedAfter', publishedAfter)
  try {
    const res = await fetch(`${SEARCH_API}?${params}`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.error(`[f2] youtube search → ${res.status}: ${await res.text()}`)
      return []
    }
    const data = await res.json()
    return (data.items ?? [])
      .map((it: { id?: { videoId?: string } }) => it.id?.videoId)
      .filter((v: unknown): v is string => typeof v === 'string')
  } catch (err) {
    console.error('[f2] youtube search error:', err)
    return []
  }
}

/// videos.list for a batch of ids → candidates with real duration / stats.
async function fetchVideoDetails(ids: string[]): Promise<VideoCandidate[]> {
  if (ids.length === 0) return []
  const params = new URLSearchParams({
    key: youtubeKey(),
    id: ids.slice(0, 50).join(','),
    part: 'snippet,contentDetails,statistics',
  })
  try {
    const res = await fetch(`${VIDEOS_API}?${params}`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.error(`[f2] youtube videos → ${res.status}: ${await res.text()}`)
      return []
    }
    const data = await res.json()
    const out: VideoCandidate[] = []
    for (const it of data.items ?? []) {
      const durationSec = parseISODuration(it.contentDetails?.duration ?? '')
      out.push({
        videoId: it.id,
        url: `https://www.youtube.com/watch?v=${it.id}`,
        title: it.snippet?.title ?? '(untitled)',
        channel: it.snippet?.channelTitle ?? '(unknown)',
        durationSec,
        viewCount: Number(it.statistics?.viewCount ?? 0),
        publishedAt: it.snippet?.publishedAt ?? '',
      })
    }
    return out
  } catch (err) {
    console.error('[f2] youtube videos error:', err)
    return []
  }
}

// --- Step 3: rank + pick 3 -------------------------------------------------

const RANK_SYSTEM =
  'You are curating a short learning playlist. From a numbered list of real YouTube videos, pick the 3 BEST for the learner\'s request. ' +
  'Favor reputable, knowledgeable sources (established educators, universities, broadcasters, recognized authors/journalists, well-regarded documentary channels) and substantive explainers over thin or sensational content. ' +
  'Prefer videos in the 30-60 minute range. Aim for 3 that together give a strong, non-boring overview — varied angles are good, near-duplicates are not. ' +
  'On contested topics, prefer balanced, credible sources. ' +
  'Return ONLY a JSON array of exactly 3 objects (no prose, no code fence): [{"n": <the number from the list>, "why": "<≤12 word reason>"}]. Use distinct n values.'

async function rankPicks(
  request: string,
  criteria: string,
  candidates: VideoCandidate[],
): Promise<{ n: number; why: string }[] | null> {
  const list = candidates
    .map((c, i) => {
      const mins = Math.round(c.durationSec / 60)
      const views = c.viewCount ? `${Math.round(c.viewCount / 1000)}k views` : 'views n/a'
      const year = c.publishedAt ? c.publishedAt.slice(0, 4) : '????'
      return `${i + 1}. "${c.title}" — ${c.channel} · ${mins} min · ${views} · ${year}`
    })
    .join('\n')
  try {
    const res = await anthropic().messages.create({
      model: RANK_MODEL,
      max_tokens: 500,
      system: RANK_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Request: ${request}\n${criteria ? `Criteria: ${criteria}\n` : ''}\nVideos:\n${list}`,
        },
      ],
    })
    const block = res.content[0]
    const raw = block?.type === 'text' ? block.text : ''
    const parsed = extractJson(raw)
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter((p) => p && typeof p.n === 'number')
      .map((p) => ({ n: Math.floor(p.n), why: typeof p.why === 'string' ? p.why : '' }))
  } catch (err) {
    console.error('[f2] rankPicks failed:', err)
    return null
  }
}

// --- Orchestrator ----------------------------------------------------------

export async function findExplainerVideos(request: string): Promise<FindResult | null> {
  const trimmed = request.trim()
  if (!trimmed) return null

  const now = new Date()
  const plan = await planSearch(trimmed, now.toISOString().slice(0, 10))
  if (!plan) return null

  const publishedAfter = plan.recencyYears
    ? new Date(now.getTime() - plan.recencyYears * 365 * 24 * 3600 * 1000).toISOString()
    : null

  // Run the queries, dedupe ids, pull details.
  const idLists = await Promise.all(
    plan.queries.map((q) => searchVideoIds(q, publishedAfter)),
  )
  const ids = Array.from(new Set(idLists.flat()))
  if (ids.length === 0) return { topicTitle: plan.topicTitle, picks: [], candidatesConsidered: 0 }

  const details = await fetchVideoDetails(ids)
  const inBand = details
    .filter((c) => c.durationSec >= MIN_SEC && c.durationSec <= MAX_SEC)
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 25)

  if (inBand.length === 0) {
    return { topicTitle: plan.topicTitle, picks: [], candidatesConsidered: details.length }
  }

  // If we somehow have ≤3 in-band, skip the ranker and take them.
  let picks: VideoPick[]
  if (inBand.length <= 3) {
    picks = inBand.map((c) => ({ ...c, why: '' }))
  } else {
    const ranked = await rankPicks(trimmed, plan.criteria, inBand)
    if (ranked && ranked.length > 0) {
      const seen = new Set<number>()
      picks = []
      for (const r of ranked) {
        const idx = r.n - 1
        if (idx >= 0 && idx < inBand.length && !seen.has(idx)) {
          seen.add(idx)
          picks.push({ ...inBand[idx], why: r.why })
        }
        if (picks.length === 3) break
      }
      // Backfill if the model under-picked or repeated.
      for (const c of inBand) {
        if (picks.length === 3) break
        if (!picks.some((p) => p.videoId === c.videoId)) picks.push({ ...c, why: '' })
      }
    } else {
      picks = inBand.slice(0, 3).map((c) => ({ ...c, why: '' }))
    }
  }

  return { topicTitle: plan.topicTitle, picks, candidatesConsidered: inBand.length }
}

// --- helpers ---------------------------------------------------------------

/// Parse ISO 8601 duration (PT#H#M#S) → seconds.
function parseISODuration(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return 0
  const [, h, min, s] = m
  return (Number(h ?? 0) * 3600) + (Number(min ?? 0) * 60) + Number(s ?? 0)
}

/// Pull the first JSON object/array out of a model reply, tolerating stray
/// prose or a ```json fence.
function extractJson(raw: string): unknown {
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  const start = body.search(/[[{]/)
  if (start === -1) return null
  // Find the matching end by scanning from the last bracket of the same family.
  const openCh = body[start]
  const closeCh = openCh === '[' ? ']' : '}'
  const end = body.lastIndexOf(closeCh)
  if (end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}
