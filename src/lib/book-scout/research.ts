import Anthropic from '@anthropic-ai/sdk'
import type { Book, ClaudePick } from './email'
import type { LibraryBook } from './library'

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

  // Sonnet + the basic web_search tool: the _20260209 variant runs code-exec
  // dynamic filtering on every search (~10s each), which makes a multi-search
  // run blow past function timeouts. Basic search + Sonnet completes in a
  // couple of minutes.
  for (let i = 0; i < 8; i++) {
    const res = await anthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 12000,
      messages,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
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

// ONE-TIME taste profile from a reader's library. Cheap (no web search), run
// once on upload and reused for every pick run — so we never re-read hundreds
// of books per request. Returns a compact prose profile.
export async function generateTasteProfile(library: LibraryBook[]): Promise<string> {
  // Purchases are the strong signal; include them all, then top up with samples.
  const purchases = library.filter((b) => b.type === 'Purchase')
  const samples = library.filter((b) => b.type !== 'Purchase')
  const lines = [...purchases, ...samples].slice(0, 320).map((b) => `${b.title} — ${b.author}`)

  const prompt = `Here is a reader's book library (${library.length} books; the purchased ones are the strongest signal, listed first).

${lines.join('\n')}

Write a concise TASTE PROFILE for this reader that a book scout can reuse to recommend new books — without seeing the full library again. 150–220 words, plain prose. Cover:
- Their main lanes / sub-genres (be specific, e.g. "espionage in the le Carré/McCloskey mold", "Reacher-style action", "Nordic & translated crime", "literary domestic suspense", "smart speculative fiction").
- Authors they clearly follow (name the recurring ones).
- The texture they like (pace, tone, settings, translated vs. domestic, standalone vs. series).
- A one-line steer on what to recommend and what to avoid.
Output ONLY the profile prose — no preamble, no headings.`

  const res = await anthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 700,
    messages: [{ role: 'user', content: prompt }],
  })
  return res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join(' ').trim()
}

// Claude Code Picks — driven by the stored taste profile (not the full library),
// so a 600-book shelf costs the same as a 50-book one. Dedup against owned
// titles happens in the caller, in code (not in the prompt).
export async function researchClaudePicks(input: {
  tasteProfile: string
  today: string
}): Promise<ClaudePick[]> {
  const { tasteProfile, today } = input

  const prompt = `You are "Claude Code Picks" — a personal book scout. Here is the reader's taste profile:

${tasteProfile}

Recommend 8 books this reader would love (the caller trims to the best 5 after
removing any they already own).

REQUIREMENTS for every pick:
1. RECENT: published within roughly the last 12 months (on or before ${today}).
2. AVAILABLE NOW on Kindle (already published, buyable — not forthcoming/pre-order).
3. A genuine taste match across their lanes — not eight of the same thing.
4. Prefer fresher / less-obvious recent releases over the most-everywhere bestseller.

Use web_search to find recent releases, "if you liked X" readalikes, and new books by authors adjacent to their taste. Every "why" must tie the pick to a specific element of their taste profile (a lane or an author).

When done, output ONLY a JSON array (no prose, no fences), 8 items:
{"title":"...","author":"...","pub_date":"e.g. 'Mar 2026' — within ~12 months, on/before ${today}","one_line":"one neutral sentence on what the book is","why":"one sentence on why it fits THIS reader's taste"}`

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]
  let final: Anthropic.Message | null = null
  for (let i = 0; i < 8; i++) {
    const res = await anthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      messages,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
    })
    if (res.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: res.content })
      continue
    }
    final = res
    break
  }
  if (!final) throw new Error('claude picks did not complete')

  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  const arr = extractArray(text)
  return arr
    .filter((o): o is ClaudePick => {
      const x = o as Record<string, unknown>
      return x && typeof x.title === 'string' && typeof x.author === 'string' && typeof x.why === 'string'
    })
    .map((p) => ({
      title: p.title,
      author: p.author,
      pub_date: p.pub_date || '',
      one_line: p.one_line || '',
      why: p.why,
    }))
    .slice(0, 8)
}

// Pull a JSON array out of the model's final text, tolerating stray prose,
// markdown fences, and bracket characters inside the surrounding prose.
function extractArray(text: string): unknown[] {
  const candidates: string[] = []
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidates.push(fence[1])
  const a = text.indexOf('[{')
  const aSpaced = a === -1 ? text.search(/\[\s*\{/) : a
  const b = text.lastIndexOf('}]')
  if (aSpaced !== -1 && b !== -1 && b > aSpaced) {
    const end = text.indexOf(']', b)
    candidates.push(text.slice(aSpaced, end === -1 ? b + 2 : end + 1))
  }
  candidates.push(text.trim())
  for (const c of candidates) {
    try {
      const v = JSON.parse(c)
      if (Array.isArray(v) && v.length) return v
    } catch {
      // try next candidate
    }
  }
  return []
}

function parseBooks(text: string): Book[] {
  const arr = extractArray(text)
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
