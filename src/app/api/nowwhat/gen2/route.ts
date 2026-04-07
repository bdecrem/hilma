import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const CANDIDATES_PATH = path.join(process.cwd(), 'data', 'nowwhat-gen2-candidates.json')
const COLS = 26
const ROWS = 10

// Word dictionary — built once, lives in memory
let wordPool: string[] | null = null

const THEME_WORDS = [
  // Human connection
  'handshake', 'embrace', 'gathering', 'family', 'conversation', 'circle of people',
  'holding hands', 'crowd', 'village', 'neighborhood', 'playground', 'classroom',
  // Nature & growth
  'tree', 'flower', 'sunrise', 'river', 'mountain', 'garden', 'bloom', 'seedling',
  'forest', 'ocean wave', 'bird in flight', 'nest', 'rain', 'rainbow',
  // Building & shelter
  'house', 'bridge', 'tower', 'arch', 'door', 'window', 'staircase', 'lighthouse',
  'city skyline', 'tent', 'dome', 'wall with opening',
  // Knowledge & light
  'lightbulb', 'book', 'candle', 'beacon', 'telescope', 'microscope', 'lamp',
  'torch', 'eye', 'magnifying glass', 'scroll',
  // Community & democracy
  'ballot box', 'scale of justice', 'podium', 'round table', 'raised fist',
  'helping hand', 'open hand', 'megaphone', 'flag',
  // Movement & progress
  'arrow up', 'rocket', 'bicycle', 'sailboat', 'compass', 'footprints',
  'ladder', 'ascending steps', 'wave', 'spiral',
  // Abstract symbols
  'question mark', 'exclamation mark', 'heart', 'star', 'infinity',
  'plus sign', 'peace sign', 'yin yang', 'diamond',
  // Everyday life
  'cup of tea', 'campfire', 'piano keys', 'clock', 'key', 'umbrella',
  'bread', 'chair', 'pen', 'hammer',
  // Space & cosmos
  'planet', 'crescent moon', 'constellation', 'galaxy', 'comet',
  // Connection & networks
  'web', 'chain links', 'puzzle piece', 'knot', 'crossroads',
]

function getWordPool(): string[] {
  if (!wordPool) {
    wordPool = [...THEME_WORDS].sort(() => Math.random() - 0.5)
  }
  if (wordPool.length === 0) {
    wordPool = [...THEME_WORDS].sort(() => Math.random() - 0.5)
  }
  return wordPool
}

function pickConcept(): string {
  const pool = getWordPool()
  return pool.pop()!
}

interface Candidate {
  id: string
  concept: string
  name: string
  grid: number[][]
  fillPercent: number
  createdAt: string
  approved?: boolean
}

interface CandidatePool {
  candidates: Candidate[]
  totalGenerated: number
}

async function readPool(): Promise<CandidatePool> {
  try {
    const data = await fs.readFile(CANDIDATES_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { candidates: [], totalGenerated: 0 }
  }
}

async function writePool(pool: CandidatePool) {
  await fs.writeFile(CANDIDATES_PATH, JSON.stringify(pool, null, 2))
}

function fillPercent(grid: number[][]): number {
  let filled = 0
  for (const row of grid) for (const cell of row) if (cell) filled++
  return Math.round((filled / (COLS * ROWS)) * 100)
}

// GET — return all candidates
export async function GET() {
  const pool = await readPool()
  return NextResponse.json(pool)
}

// POST — generate a new shape from the next concept
export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  const concept = pickConcept()

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

    // Validate
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

    const candidate: Candidate = {
      id: `g2-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      concept,
      name: parsed.name || concept,
      grid,
      fillPercent: fp,
      createdAt: new Date().toISOString(),
    }

    // Don't save yet — only saved when alive2 reports a win via PUT
    return NextResponse.json({ candidate, concept })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, concept }, { status: 500 })
  }
}

// PUT — save a shape that survived entropy (called by alive2 on win)
export async function PUT(request: Request) {
  const body = await request.json()
  const { candidate } = body
  if (!candidate?.id || !candidate?.grid) {
    return NextResponse.json({ error: 'Missing candidate data' }, { status: 400 })
  }

  const pool = await readPool()
  // Avoid duplicates
  if (!pool.candidates.find(c => c.id === candidate.id)) {
    pool.candidates.push(candidate)
    pool.totalGenerated++
    await writePool(pool)
  }

  return NextResponse.json({ ok: true })
}

// PATCH — approve/reject a candidate
export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, approved } = body

  const pool = await readPool()
  const candidate = pool.candidates.find(c => c.id === id)
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  candidate.approved = approved
  await writePool(pool)

  return NextResponse.json({ ok: true, candidate })
}
