import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const COLS = 26
const ROWS = 10

// Lazy Supabase client (untyped — we cast as needed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sb: any = null
function getSupabase() {
  if (!_sb) {
    _sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  }
  return _sb
}

// Fallback words
const FALLBACK_WORDS = [
  'handshake', 'embrace', 'gathering', 'family', 'tree', 'flower', 'sunrise',
  'house', 'bridge', 'lighthouse', 'lightbulb', 'book', 'telescope',
  'ballot box', 'rocket', 'bicycle', 'compass', 'heart', 'star', 'spiral',
  'campfire', 'planet', 'constellation', 'puzzle piece', 'garden',
]

let wordPool: string[] | null = null

async function loadWords(): Promise<string[]> {
  const sb = getSupabase()
  const { data } = await sb.from('nowwhat_words').select('words').eq('id', 1).single()
  if (data?.words && Array.isArray(data.words) && data.words.length > 0) {
    return data.words
  }
  return FALLBACK_WORDS
}

async function getWordPool(): Promise<string[]> {
  if (!wordPool || wordPool.length === 0) {
    const words = await loadWords()
    wordPool = [...words].sort(() => Math.random() - 0.5)
  }
  return wordPool
}

async function pickConcept(): Promise<string> {
  const pool = await getWordPool()
  if (pool.length === 0) {
    const words = await loadWords()
    wordPool = [...words].sort(() => Math.random() - 0.5)
    return wordPool!.pop()!
  }
  return pool.pop()!
}

function fillPercent(grid: number[][]): number {
  let filled = 0
  for (const row of grid) for (const cell of row) if (cell) filled++
  return Math.round((filled / (COLS * ROWS)) * 100)
}

// GET — return all candidates
export async function GET() {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('nowwhat_candidates')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ candidates: [], totalGenerated: 0 })
  return NextResponse.json({ candidates: data || [], totalGenerated: data?.length || 0 })
}

// POST — generate a new shape from the next concept
export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  const concept = await pickConcept()

  const system = `You are a pixel artist. You draw simple, iconic shapes on a grid that is ${COLS} columns wide and ${ROWS} rows tall. Each cell is either filled (1) or empty (0).

Rules:
- The grid is WIDE (26 cols) and SHORT (10 rows) — think horizontal banner, not square
- Draw recognizable silhouettes, not detailed illustrations
- Use 15-60% of cells (too sparse = invisible, too dense = blob)
- Center the shape horizontally in the grid
- Think: what would this look like as a 26x10 pixel icon on an old airport departure board?`

  const prompt = `Draw "${concept}" as a ${COLS}x${ROWS} binary grid.

Return ONLY a JSON object with:
- "name": a short name for the shape (1-3 words)
- "grid": an array of ${ROWS} arrays, each containing ${COLS} numbers (0 or 1)

No explanation, just the JSON.`

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `Haiku ${res.status}: ${err}` }, { status: 500 })
    }

    const data = await res.json()
    const raw = data.content[0].text
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'No JSON in response', concept }, { status: 422 })

    const parsed = JSON.parse(match[0])
    const grid = parsed.grid

    if (!Array.isArray(grid) || grid.length !== ROWS) {
      return NextResponse.json({ error: 'Invalid grid dimensions', concept }, { status: 422 })
    }
    for (const row of grid) {
      if (!Array.isArray(row) || row.length !== COLS) {
        return NextResponse.json({ error: 'Invalid row length', concept }, { status: 422 })
      }
    }

    const fp = fillPercent(grid)
    if (fp < 8 || fp > 75) {
      return NextResponse.json({ error: `Fill ${fp}% out of range`, concept }, { status: 422 })
    }

    const candidate = {
      id: `g2-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      concept,
      name: parsed.name || concept,
      grid,
      fill_percent: fp,
      created_at: new Date().toISOString(),
    }

    // Don't save yet — only saved when the page reports a win via PUT
    return NextResponse.json({ candidate: { ...candidate, fillPercent: fp, createdAt: candidate.created_at }, concept })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, concept }, { status: 500 })
  }
}

// PUT — save a shape that survived entropy (called on win)
export async function PUT(request: Request) {
  const body = await request.json()
  const { candidate } = body
  if (!candidate?.id || !candidate?.grid) {
    return NextResponse.json({ error: 'Missing candidate data' }, { status: 400 })
  }

  const sb = getSupabase()
  await sb.from('nowwhat_candidates').upsert({
    id: candidate.id,
    concept: candidate.concept,
    name: candidate.name,
    grid: candidate.grid,
    fill_percent: candidate.fillPercent || candidate.fill_percent,
    created_at: candidate.createdAt || candidate.created_at || new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}

// PATCH — approve/reject a candidate
export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, approved } = body

  const sb = getSupabase()
  const { data, error } = await sb
    .from('nowwhat_candidates')
    .update({ approved })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, candidate: data })
}
