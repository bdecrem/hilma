#!/usr/bin/env npx tsx
/**
 * nowwhat-gen2 — concept-driven shape generation pipeline
 *
 * 1. Build a dictionary of 100 words/concepts aligned with the "now what?" theme
 * 2. Feed concepts to Haiku to generate 26x10 pixel grids
 * 3. Save candidates to data/nowwhat-gen2-candidates.json for human review
 *
 * Usage:
 *   npx tsx scripts/nowwhat-gen2.ts                # generate 10 shapes
 *   npx tsx scripts/nowwhat-gen2.ts --count 50     # generate 50 shapes
 *   npx tsx scripts/nowwhat-gen2.ts --refresh-words # regenerate the word dictionary
 *
 * Does NOT affect the live site.
 */

import { promises as fs } from 'fs'
import path from 'path'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const WORDS_PATH = path.join(process.cwd(), 'data', 'nowwhat-gen2-words.json')
const CANDIDATES_PATH = path.join(process.cwd(), 'data', 'nowwhat-gen2-candidates.json')

const COLS = 26
const ROWS = 10

// ── API helpers ──

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set — check .env.local')
  return key
}

async function callAnthropic(model: string, system: string, prompt: string): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.content[0].text
}

// ── Step 1: Generate word dictionary ──

const WORD_SYSTEM = `You are a creative researcher for a project called "Now What?" which explores:
AGI has arrived. How do we make it benefit humanity? How do we build thriving democracy, reduce inequality, amplify human potential, find meaning, build community?

The project features pixel-art shapes on a 26x10 grid — simple, iconic forms that evoke these themes.`

const WORD_PROMPT = `Generate a JSON array of exactly 100 words or short concepts (1-3 words each) that could inspire simple, recognizable pixel-art icons for this project.

Mix these categories:
- Human connection (gathering, handshake, embrace...)
- Nature & growth (tree, bloom, river, sunrise...)
- Building & shelter (house, bridge, tower, arch...)
- Knowledge & light (lightbulb, book, beacon, telescope...)
- Community & democracy (vote, assembly, circle, commons...)
- Movement & progress (arrow, path, rocket, wave...)
- Abstract symbols (question mark, exclamation, spiral, infinity...)
- Everyday life (cup of tea, bicycle, garden, campfire...)

Each word should be drawable as a simple silhouette at 26x10 pixels. Avoid anything too complex.

Return ONLY a JSON array of strings, no explanation.`

async function generateWords(): Promise<string[]> {
  console.log('  generating word dictionary...')
  const raw = await callAnthropic('claude-haiku-4-5-20251001', WORD_SYSTEM, WORD_PROMPT)
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Failed to parse word list from Haiku response')
  const words: string[] = JSON.parse(match[0])
  console.log(`  ✓ ${words.length} words generated`)
  return words
}

async function loadOrGenerateWords(forceRefresh: boolean): Promise<string[]> {
  if (!forceRefresh) {
    try {
      const data = await fs.readFile(WORDS_PATH, 'utf-8')
      const words = JSON.parse(data)
      console.log(`  loaded ${words.length} words from cache`)
      return words
    } catch {
      // Fall through to generate
    }
  }
  const words = await generateWords()
  await fs.writeFile(WORDS_PATH, JSON.stringify(words, null, 2))
  console.log(`  saved to ${WORDS_PATH}`)
  return words
}

// ── Step 2: Generate shapes from concepts ──

const SHAPE_SYSTEM = `You are a pixel artist. You draw simple, iconic shapes on a grid that is ${COLS} columns wide and ${ROWS} rows tall. Each cell is either filled (1) or empty (0).

Rules:
- The grid is WIDE (26 cols) and SHORT (10 rows) — think horizontal banner, not square
- Draw recognizable silhouettes, not detailed illustrations
- Use 15-60% of cells (too sparse = invisible, too dense = blob)
- Center the shape horizontally in the grid
- The shape should be instantly recognizable at tiny pixel scale
- Think: what would this look like as a 26x10 pixel icon on an old airport departure board?`

const SHAPE_PROMPT = (concept: string) => `Draw "${concept}" as a ${COLS}x${ROWS} binary grid.

Return ONLY a JSON object with:
- "name": a short name for the shape (1-3 words)
- "grid": an array of ${ROWS} arrays, each containing ${COLS} numbers (0 or 1)

No explanation, just the JSON.`

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

async function loadCandidates(): Promise<CandidatePool> {
  try {
    const data = await fs.readFile(CANDIDATES_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { candidates: [], totalGenerated: 0 }
  }
}

async function saveCandidates(pool: CandidatePool) {
  await fs.writeFile(CANDIDATES_PATH, JSON.stringify(pool, null, 2))
}

function validateGrid(grid: unknown): grid is number[][] {
  if (!Array.isArray(grid) || grid.length !== ROWS) return false
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== COLS) return false
    for (const cell of row) if (cell !== 0 && cell !== 1) return false
  }
  return true
}

function fillPercent(grid: number[][]): number {
  let filled = 0, total = COLS * ROWS
  for (const row of grid) for (const cell of row) if (cell) filled++
  return Math.round((filled / total) * 100)
}

function printGrid(grid: number[][]) {
  for (const row of grid) {
    console.log('    ' + row.map(c => c ? '█' : '·').join(''))
  }
}

async function generateShape(concept: string): Promise<{ name: string; grid: number[][] } | null> {
  try {
    const raw = await callAnthropic('claude-haiku-4-5-20251001', SHAPE_SYSTEM, SHAPE_PROMPT(concept))
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    if (!parsed.name || !validateGrid(parsed.grid)) return null
    const fp = fillPercent(parsed.grid)
    if (fp < 10 || fp > 70) return null // too sparse or too dense
    return { name: parsed.name, grid: parsed.grid }
  } catch (e) {
    console.log(`    ✗ failed for "${concept}": ${(e as Error).message}`)
    return null
  }
}

// ── Main ──

async function main() {
  // Load env
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const envContent = await fs.readFile(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (match) process.env[match[1].trim()] = match[2].trim()
    }
  } catch { /* no .env.local */ }

  const args = process.argv.slice(2)
  const refreshWords = args.includes('--refresh-words')
  const countIdx = args.indexOf('--count')
  const count = countIdx >= 0 ? parseInt(args[countIdx + 1]) || 10 : 10

  console.log('\n  nowwhat-gen2 — concept-driven shape generation\n')

  // Step 1: Words
  const words = await loadOrGenerateWords(refreshWords)

  // Step 2: Generate shapes
  const pool = await loadCandidates()
  const usedConcepts = new Set(pool.candidates.map(c => c.concept))
  const available = words.filter(w => !usedConcepts.has(w))

  if (available.length === 0) {
    console.log('  all words used — run with --refresh-words to get new ones')
    return
  }

  // Shuffle and pick
  const shuffled = [...available].sort(() => Math.random() - 0.5)
  const batch = shuffled.slice(0, count)

  console.log(`  generating ${batch.length} shapes...\n`)

  let successes = 0
  for (const concept of batch) {
    process.stdout.write(`  "${concept}" → `)
    const result = await generateShape(concept)

    if (result) {
      const candidate: Candidate = {
        id: `g2-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        concept,
        name: result.name,
        grid: result.grid,
        fillPercent: fillPercent(result.grid),
        createdAt: new Date().toISOString(),
      }
      pool.candidates.push(candidate)
      pool.totalGenerated++
      successes++
      console.log(`${result.name} (${candidate.fillPercent}% filled)`)
      printGrid(result.grid)
      console.log()
    } else {
      pool.totalGenerated++
      console.log('rejected')
    }

    // Rate limit: ~1 req/sec
    await new Promise(r => setTimeout(r, 1200))
  }

  await saveCandidates(pool)
  console.log(`  ✓ ${successes}/${batch.length} shapes generated`)
  console.log(`  total candidates: ${pool.candidates.length}`)
  console.log(`  saved to ${CANDIDATES_PATH}\n`)
}

main().catch(e => {
  console.error(`\n  ✗ ${e.message}\n`)
  process.exit(1)
})
