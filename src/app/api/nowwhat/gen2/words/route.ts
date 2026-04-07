import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sb: any = null
function getSupabase() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  return _sb
}

const SEARCH_QUERIES = [
  'how will AGI benefit humanity society thriving',
  'post-superintelligence human meaning purpose',
  'AI democracy equality community future',
  'artificial intelligence human creativity flow state',
  'AGI public goods commons shared prosperity',
]

async function callHaiku(apiKey: string, system: string, prompt: string): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Haiku ${res.status}`)
  const data = await res.json()
  return data.content[0].text
}

async function searchWeb(query: string): Promise<string[]> {
  const braveKey = process.env.BRAVE_API_KEY
  if (!braveKey) return []

  try {
    const encoded = encodeURIComponent(query)
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encoded}&count=5`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': braveKey,
      },
    })
    if (!res.ok) return []
    const data = await res.json()
    const results = data.web?.results || []
    return results.map((r: { url: string }) => r.url).slice(0, 3)
  } catch {
    return []
  }
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text.slice(0, 3000)
  } catch {
    return ''
  }
}

async function loadExistingWords(): Promise<string[]> {
  const sb = getSupabase()
  const { data } = await sb.from('nowwhat_words').select('words').eq('id', 1).single()
  return (data?.words && Array.isArray(data.words)) ? data.words : []
}

async function saveWords(words: string[], sources: string[]) {
  const sb = getSupabase()
  await sb.from('nowwhat_words').upsert({
    id: 1,
    words,
    sources,
    updated_at: new Date().toISOString(),
  })
}

// GET — return current word list
export async function GET() {
  const words = await loadExistingWords()
  return NextResponse.json({ words, count: words.length })
}

// POST — search the web for articles, extract concepts via Haiku
export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  try {
    // Step 1: Search for articles
    const queries = [...SEARCH_QUERIES].sort(() => Math.random() - 0.5).slice(0, 3)
    const allUrls: string[] = []
    for (const q of queries) {
      const urls = await searchWeb(q)
      allUrls.push(...urls)
    }
    const uniqueUrls = [...new Set(allUrls)].slice(0, 5)

    // Step 2: Fetch article text
    const articles: string[] = []
    const sources: string[] = []
    for (const url of uniqueUrls) {
      const text = await fetchPageText(url)
      if (text.length > 200) {
        articles.push(text)
        sources.push(url)
      }
    }

    // Step 3: Extract concepts via Haiku
    const articleText = articles.length > 0
      ? articles.map((a, i) => `--- Article ${i + 1} (${sources[i]}) ---\n${a}`).join('\n\n')
      : 'No articles found. Use your knowledge of AGI, human thriving, democracy, community, nature, creativity, and meaning.'

    const system = `You are a creative researcher for "Now What?" — a project exploring how humanity thrives after AGI. You read articles and extract words/concepts that could be drawn as tiny pixel-art icons (26 pixels wide, 10 pixels tall).`

    const prompt = `Here are excerpts from recent articles about AGI and human thriving:

${articleText}

From these articles and the broader themes they touch on, extract exactly 100 words or short concepts (1-3 words each) that could be drawn as simple pixel-art silhouettes.

The concepts should be CONCRETE and VISUAL — things you can draw, not abstract ideas. Think: objects, symbols, scenes, creatures, buildings, natural forms, tools, gestures.

Mix categories: human connection, nature, buildings, knowledge, community, movement, everyday objects, cosmos, play.

Be inventive and specific — "paper crane" is better than "hope", "potluck table" is better than "community".

Return ONLY a JSON array of strings.`

    const raw = await callHaiku(apiKey, system, prompt)
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return NextResponse.json({ error: 'No JSON array in response' }, { status: 422 })

    const newWords: string[] = JSON.parse(match[0])

    // Merge: new words take priority, backfill with old to keep 100+
    const existing = await loadExistingWords()
    const newSet = new Set(newWords.map(w => w.toLowerCase()))
    const backfill = existing.filter(w => !newSet.has(w.toLowerCase()))
    const current = [...newWords, ...backfill].slice(0, Math.max(100, newWords.length))

    await saveWords(current, sources)

    return NextResponse.json({
      words: current,
      count: current.length,
      sources: sources.length > 0 ? sources : [],
    })
  } catch {
    // On failure, return whatever we have
    const existing = await loadExistingWords()
    return NextResponse.json({ words: existing, count: existing.length, sources: [] })
  }
}
