// Book Summary — a ~2-page web-researched study-context summary for topics
// of kind 'book', generated on demand from the Topics menu. The prompt is
// Bart's book-summary prompt (canonical copy: apps/feynd/BOOK-SUMMARY.md —
// keep the template below in sync with it). Unlike the rest of F2's LLM
// calls this one needs live web search, so it goes straight to the Anthropic
// API with the web_search server tool rather than through llm.ts.

import Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from './supabase'
import { gatherUserNotes, type F2Thread } from './threads'

const BOOK_SUMMARY_MODEL = 'claude-opus-5'
const MAX_WEB_SEARCHES = 8

export type BookSummary = {
  status: 'generating' | 'ready' | 'error'
  markdown?: string
  model?: string
  error?: string
  updated_at?: string
}

export async function setBookSummary(
  threadId: string,
  userId: string,
  value: BookSummary,
): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ book_summary: value, updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', userId)
  if (error) console.error('[f2/book-summary] setBookSummary failed:', error)
}

/// List-payload projection: status only, never the ~1,300-word markdown.
/// Clients fetch the full text via GET /api/f2/topics/[id]/book-summary.
export function bookSummaryForClient(
  b: BookSummary | null | undefined,
): { status: string; error: string | null; updated_at: string | null } | null {
  if (!b) return null
  return {
    status: b.status,
    error: b.error ?? null,
    updated_at: b.updated_at ?? null,
  }
}

/// The prompt, verbatim from apps/feynd/BOOK-SUMMARY.md with the book line
/// and the "stories I already know" list filled from the topic.
function buildBookSummaryPrompt(thread: F2Thread): string {
  const label = thread.topic ?? thread.url ?? 'this book'
  const notes = gatherUserNotes(thread).slice(0, 8000)
  return `Search the web and write a ~2-page (1,100–1,300 word) study-context summary
of the book "${label}", as a markdown document. I'll give it to my study agent as
context before discussing the book.

Structure: (1) what the book is — full title, pub date, one line on
reception; (2) the core argument in the author's framing; (3) the
supporting theory/diagnosis; (4) 4–6 case studies and anecdotes, each told
with enough specifics — names, numbers, the punchline — to carry a
conversation; (5) the book's prescriptive framework, if any; (6) a
quick-reference section.

Curation rules (this is where AIs go wrong):
- Every fact must attach to a theme. Before including a detail, ask what
  claim it serves. If it illustrates or proves nothing, cut it.
- Prefer facts with a name, number, or date over vague generalities.
- Skip blurbs, ISBN-level trivia, marketing copy, and podcast promo.
- Attribute contested claims to the author ("X argues...") rather than
  stating them as fact.
- Direct quotes: rare, under 15 words, only if they're the memorable line.

Quick reference: ~10 core terms and ~8 numbers/dates, each with a one-line
gloss. Never a bare word-cloud — every item gets its few-word explainer.
These are the things worth memorizing.

Sourcing: if the book is recent and you're working from reviews and
interviews rather than the text, say so at the top of the doc and flag
anything secondhand or unverifiable.${notes ? `

Stories or data I already know are in the book — include these:
${notes}` : ''}

After you finish searching, reply with ONLY the markdown document — no
preamble, no commentary about your search process.`
}

/// Generate and store the summary. Runs inside the route's after() — errors
/// are recorded on the row so the client's polling sees them.
export async function generateBookSummary(thread: F2Thread): Promise<void> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await anthropic.messages.create({
      model: BOOK_SUMMARY_MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: buildBookSummaryPrompt(thread) }],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: MAX_WEB_SEARCHES,
        } as never,
      ],
    })

    // The document is the text after the last search/thinking block —
    // earlier text blocks are between-search narration.
    let lastNonText = -1
    res.content.forEach((block, i) => {
      if (block.type !== 'text') lastNonText = i
    })
    const markdown = res.content
      .slice(lastNonText + 1)
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()
    if (markdown.length < 400) {
      throw new Error(`summary too short (${markdown.length} chars)`)
    }

    await setBookSummary(thread.id, thread.user_id, {
      status: 'ready',
      markdown,
      model: BOOK_SUMMARY_MODEL,
      updated_at: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[f2/book-summary] generation failed:', message)
    await setBookSummary(thread.id, thread.user_id, {
      status: 'error',
      error: message.slice(0, 300),
      updated_at: new Date().toISOString(),
    })
  }
}
