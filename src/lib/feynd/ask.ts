import { getTopic, DEFAULT_TOPIC } from './topics'
import { loadSourcesForTopic, renderSourceBlock } from './sources'
import { FEYND_TEACHING_PERSONA } from './persona'

export type AskTurn = { role: 'user' | 'assistant'; text: string }
export type AskVideoContext = {
  title?: string
  author?: string
  host?: string
  publishedOn?: string
  transcript?: string
}

export type AskOptions = {
  question: string
  topic?: string
  history?: AskTurn[]
  videoContext?: AskVideoContext
  system?: string
  maxTokens?: number
}

export type AskResult = {
  answer: string
  topicId: string
  sourceCount: number
  usage?: Record<string, number>
}

// Unified agent call. Loads the topic's curated source pool, injects as
// cache-controlled system blocks, layers in an optional per-video block,
// and calls Opus.
export async function askWithTopic(opts: AskOptions): Promise<AskResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const topicId = opts.topic ?? DEFAULT_TOPIC
  const topic = getTopic(topicId)
  if (!topic) throw new Error(`Unknown topic: ${topicId}`)

  let sources: Awaited<ReturnType<typeof loadSourcesForTopic>> = []
  try {
    sources = await loadSourcesForTopic(topicId)
  } catch (e) {
    console.warn('[feynd/ask] source load failed', e instanceof Error ? e.message : e)
  }

  // System prompt layering: shared teaching persona → topic-specific domain
  // framing → optional per-caller addition (e.g. voice-mode tighter bounds).
  const baseSystem = [
    FEYND_TEACHING_PERSONA,
    'DOMAIN FOR THIS SESSION',
    topic.persona,
    opts.system?.trim() ? 'ADDITIONAL INSTRUCTIONS\n' + opts.system.trim() : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const sourceDigest = sources.length
    ? `You have a curated library of ${sources.length} recent sources on this topic (papers, tech reports, engineering blogs, videos). Treat this library as the most up-to-date ground truth for model internals, post-training recipes, and lab-specific details. Cite sources inline with [Title] when you lean on them.\n\n---\n\n` +
      sources.map(renderSourceBlock).join('\n\n---\n\n')
    : null

  const videoBlock = opts.videoContext?.transcript
    ? `The user is currently studying a specific video. Ground video-specific answers in this transcript.\n\nVIDEO: "${opts.videoContext.title ?? ''}" — ${opts.videoContext.author ?? ''}${opts.videoContext.host ? ` (with ${opts.videoContext.host})` : ''}${opts.videoContext.publishedOn ? `, ${opts.videoContext.publishedOn}` : ''}\n\nTRANSCRIPT:\n${opts.videoContext.transcript}`
    : null

  const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
    { type: 'text', text: baseSystem },
  ]
  if (sourceDigest) {
    systemBlocks.push({ type: 'text', text: sourceDigest, cache_control: { type: 'ephemeral' } })
  }
  if (videoBlock) {
    systemBlocks.push({ type: 'text', text: videoBlock, cache_control: { type: 'ephemeral' } })
  }

  const history = Array.isArray(opts.history) ? opts.history.slice(-20) : []
  const messages = [
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user' as const, content: opts.question },
  ]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: opts.maxTokens ?? 1200,
      system: systemBlocks,
      messages,
    }),
  })

  const raw = await res.text()
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${raw}`)

  const data = JSON.parse(raw) as {
    content?: Array<{ type: string; text?: string }>
    usage?: Record<string, number>
  }
  const answer =
    (data.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('\n')
      .trim()
  if (!answer) throw new Error('empty answer')

  return {
    answer,
    topicId,
    sourceCount: sources.length,
    usage: data.usage,
  }
}
