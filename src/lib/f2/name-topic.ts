// Shared topic-naming helper used by every F2 creation path
// (paste ingest, URL ingest, chat-started new topic).
//
// The model gets the document's intrinsic title (if any) as a hint plus a
// sample of the body, and is told to pick a clean chapter-style title. It
// can override the hint when the hint is unhelpful (e.g. a hostname,
// "YouTube", clickbait, or marketing fluff).

import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'
const SAMPLE_CHARS = 4000

let _client: Anthropic | null = null
function anthropic(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey })
  return _client
}

const INSTRUCTION =
  'Name this learning topic in 3–7 words, like a chapter title or a Wikipedia article: noun phrase, Title Case, no quotes, no trailing punctuation, no "Notes on…" or "Introduction to…". Focus on the SUBJECT, not the format (don\'t say "transcript", "article", "video", "podcast", "interview"). If it\'s about a specific person, place, or concept, lead with that. ' +
  'If a "document title" is provided below, treat it as a hint — use it when it\'s a clean subject phrase, but rewrite it freely when it\'s a hostname, a clickbait headline, marketing copy, generic site chrome, or otherwise not a good chapter title. ' +
  'Reply with ONLY the title — no preamble, no quotes, nothing else.'

export type NameTopicInput = {
  /** Body text (article, transcript, paste, opening exchange). */
  body: string
  /** Document's intrinsic title — HTML <title>, user-typed title, or LLM hint. */
  documentTitle?: string | null
}

/// Returns a clean 3–7 word title, or null when the LLM call fails or
/// produces something off (too short, too long). Caller is responsible for
/// the final fallback.
export async function nameTopic(input: NameTopicInput): Promise<string | null> {
  const body = input.body?.trim() ?? ''
  const hint = input.documentTitle?.trim() ?? ''
  if (!body && !hint) return null

  const sample = body.slice(0, SAMPLE_CHARS)
  const prompt =
    (hint ? `Document title (hint): ${hint}\n\n---\n` : '') +
    (sample || '(no body text available — name from the hint alone)')

  try {
    const res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 40,
      messages: [{ role: 'user', content: `${INSTRUCTION}\n\n${prompt}` }],
    })
    const block = res.content[0]
    const raw = block?.type === 'text' ? block.text : ''
    const title = cleanTitle(raw)
    return title.length >= 3 && title.length <= 70 ? title : null
  } catch (err) {
    console.error('[f2] nameTopic failed:', err)
    return null
  }
}

function cleanTitle(raw: string): string {
  return raw
    .trim()
    .replace(/^["'‘’“‛”]+/, '')
    .replace(/["'‘’“‛”]+$/, '')
    .replace(/[.!?]+$/, '')
    .trim()
}

/// Last-resort title when AI naming fails or there's nothing to send.
/// Used by the paste ingest route.
export function deriveTitle(text: string): string {
  const firstLine = text.trim().split('\n')[0]?.trim() ?? ''
  if (!firstLine) return 'Untitled paste'
  return firstLine.length > 60 ? firstLine.slice(0, 60).trimEnd() + '…' : firstLine
}
