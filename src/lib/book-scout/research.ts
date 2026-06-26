import Anthropic from '@anthropic-ai/sdk'
import type { Book } from './email'

// Lazy client — never init at module top level.
let _client: Anthropic | null = null
function anthropic(): Anthropic {
  if (_client) return _client
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')
  _client = new Anthropic({ apiKey: key })
  return _client
}

export type ResearchSource = { name: string; url: string; type: string; notes: string }

// Runs the human-curated research for one genre and returns the books.
// Uses Claude with the server-side web_search tool. The AI never recommends on
// its own taste — it only aggregates and attributes these humans' picks.
export async function researchBooks(input: {
  genre: string
  referenceBooks: string
  sources: ResearchSource[]
  today: string // e.g. "2026-06-26"
}): Promise<{ books: Book[]; sourceNames: string[] }> {
  const { genre, referenceBooks, sources, today } = input

  const sourceList = sources
    .map((s) => `- ${s.name} (${s.type}) — ${s.url}${s.notes ? ` — ${s.notes}` : ''}`)
    .join('\n')

  const refLine = referenceBooks.trim()
    ? `\nThe user likes these books — lean toward picks in a similar vein, but never at the expense of the human-attribution rule:\n${referenceBooks.trim()}\n`
    : ''

  const prompt = `You are Book Scout's research engine. Your job is NOT to recommend books from your own taste — that is forbidden and defeats the point. Your ONLY job is to find books that the named human curators below have recently recommended, and report them with attribution. If you cannot attribute a book to a specific human source with something they actually said, DO NOT include it.

Today is ${today}. Genre to scout: ${genre}.
${refLine}
HUMAN CURATOR SOURCES (use web_search to mine these — and only these):
${sourceList}

HARD REQUIREMENTS — every book must pass all three:
1. AVAILABLE NOW: already published (publication date on or before ${today}) and buyable as a Kindle ebook. EXCLUDE anything "coming soon," "most anticipated," pre-order, or forthcoming. This is the single most important filter.
2. ATTRIBUTED: tied to at least one named human source above, with a short quote or close paraphrase of what they said. Name the source.
3. RECENT: the human picked/reviewed it in roughly the last 1–3 months, or it is a current staff pick.

DATE-WINDOW SELF-CORRECTION (important): For each source, check the availability of what it is currently featuring. If MORE THAN ~30% of a source's current picks are not yet available (still forthcoming), that source's current page is too forward-looking — go back to that source's EARLIER lists (previous month or two) and pull already-released titles from there instead. Always prefer a slightly older list of available books over a fresh list of unreleased ones.

Aim for 8–12 books. Correct attribution and genuine availability over quantity. Never invent quotes — only quote/paraphrase what you actually read. Prefer books that appear across more than one human source.

When done, output ONLY a JSON array (no prose before or after), each item exactly:
{"title":"...","author":"...","pub_date":"e.g. 'Jun 2026' — on or before ${today}","one_line":"one neutral sentence on what the book is — NOT your opinion","sources":[{"name":"human source name","said":"short quote or paraphrase"}]}`

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]
  let final: Anthropic.Message | null = null

  // Agentic web-search loop — re-send on pause_turn until the model finishes.
  for (let i = 0; i < 8; i++) {
    const res = await anthropic().messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      messages,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 16 }],
    })
    if (res.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: res.content })
      continue
    }
    final = res
    break
  }
  if (!final) throw new Error('research did not complete')

  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  const books = parseBooks(text)
  if (books.length === 0) {
    const hint = final.stop_reason === 'max_tokens' ? ' (output hit max_tokens — truncated)' : ''
    throw new Error(`no books parsed from research output${hint}; got ${text.length} chars`)
  }

  const sourceNames = [
    ...new Set(books.flatMap((b) => b.sources.map((s) => s.name.split(' (')[0].trim()))),
  ]
  return { books, sourceNames }
}

// Pull the JSON array out of the model's final text, tolerating stray prose,
// markdown fences, and bracket characters inside the surrounding prose.
function parseBooks(text: string): Book[] {
  const candidates: string[] = []
  // 1. A fenced ```json block, if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidates.push(fence[1])
  // 2. The array-of-objects span — anchor on `[{`/`}]` so a stray `[word]` in
  //    prose doesn't derail extraction.
  const a = text.indexOf('[{')
  const aSpaced = a === -1 ? text.search(/\[\s*\{/) : a
  const b = text.lastIndexOf('}]')
  if (aSpaced !== -1 && b !== -1 && b > aSpaced) {
    const end = text.indexOf(']', b)
    candidates.push(text.slice(aSpaced, end === -1 ? b + 2 : end + 1))
  }
  // 3. Whole text as a last resort.
  candidates.push(text.trim())

  let arr: unknown = null
  for (const c of candidates) {
    try {
      const v = JSON.parse(c)
      if (Array.isArray(v) && v.length) { arr = v; break }
    } catch {
      // try next candidate
    }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter((b): b is Book => {
      const o = b as Record<string, unknown>
      return (
        o &&
        typeof o.title === 'string' &&
        typeof o.author === 'string' &&
        typeof o.one_line === 'string' &&
        Array.isArray(o.sources) &&
        o.sources.length > 0
      )
    })
    .map((b) => ({
      title: b.title,
      author: b.author,
      pub_date: b.pub_date || '',
      one_line: b.one_line,
      sources: b.sources
        .filter((s) => s && typeof s.name === 'string' && typeof s.said === 'string')
        .map((s) => ({ name: s.name, said: s.said })),
    }))
    .filter((b) => b.sources.length > 0)
}
