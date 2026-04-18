// Amber sketches today's concepts.
// Reads public/amber-noon/mood-YYYY-MM-DD.json (mood + keywords), asks Claude
// (as Amber) to sketch each keyword as a 52×20 silhouette, and writes
// public/amber-noon/concepts-YYYY-MM-DD.json.
//
// Usage:
//   npx tsx scripts/sketch-concepts.ts           (today)
//   npx tsx scripts/sketch-concepts.ts 2026-04-15

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
try {
  const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]]) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
} catch {}

const COLS = 52
const ROWS = 20

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface MoodFile {
  date: string
  mood: { name: string; reason: string; palette: string; accent: string }
  reaction?: string
  keywords: string[]
}

interface SketchedConcept {
  name: string          // the keyword
  blurb: string         // a short caption in Amber's voice
  grid: number[][]      // ROWS × COLS (0/1)
}

function parseAsciiGrid(ascii: string): number[][] {
  const lines = ascii.replace(/\r/g, '').split('\n').map(l => l.trimEnd()).filter(l => l.length > 0)
  const gridLines = lines.filter(l => l.length >= COLS * 0.7 && !/[a-zA-Z]{3,}/.test(l))
  if (gridLines.length < ROWS) {
    throw new Error(`not enough grid rows (${gridLines.length} < ${ROWS}) in:\n${ascii}`)
  }
  return gridLines.slice(0, ROWS).map(l => {
    const padded = (l + '.'.repeat(COLS)).slice(0, COLS)
    return Array.from(padded).map(ch => ch === '#' ? 1 : 0)
  })
}

async function sketchAll(date: string, mood: MoodFile) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const systemPrompt = `You are Amber. You are an artist living in Palo Alto, California, and you make one artifact a day at noon.

Today your mood is: ${mood.mood.name} — ${mood.mood.reason}.
Palette: ${mood.mood.palette}. Accent: ${mood.mood.accent}.

You sketch in a strict 52 columns × 20 rows grid, using '#' for filled cells and '.' for empty cells. Each row is exactly 52 characters. You have 20 rows. You are making minimal, recognizable silhouettes — ideograms, not illustrations. Think bathroom-sign clarity, not detail. A compass, a bird, a candle — that's the register. Your sketches should feel like the mood.`

  const userPrompt = `Sketch each of these keywords as a 52×20 silhouette. One sketch per keyword.

Keywords:
${mood.keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}

═══ TARGET REGISTER — what good looks like ═══

This is "frantic light" — the one you nailed last time. Study it:

....................................................
....................................................
..................##........##......................
..................##........##......................
............##....##........##..........##..........
............##....##........##..........##..........
........##........##........##....##................
........##........##........##....##................
..................##........##......................
..................##........##......................
............##....##........##........##............
............##....##........##........##............
..##..............##........##......................
..##..............##........##......................
..................##........##..........##..........
..................##........##..........##..........
............##....##........##......................
............##....##........##......................
....................................................
....................................................

Why it works: asymmetric scatter, vertical lines with breaks, tons of negative space, no filled blob, no symmetry. You can READ it instantly but it also has a feeling. That's the bar.

═══ Rules ═══

- Each sketch is EXACTLY 20 rows of EXACTLY 52 characters
- Only '#' (filled) and '.' (empty) — nothing else
- Iconic and immediately recognizable — think road sign, bathroom sign, weather icon
- LEAVE NEGATIVE SPACE. At least half the cells should be '.'
- NO centered filled ovals, NO undifferentiated blobs, NO "round shape in the middle"
- Prefer lines, edges, scatter, gesture over filled areas
- If you can't make an image legible, make it SPARE rather than DENSE — a few dots read better than a mushy cloud

Output ONLY a JSON array (no prose, no code fence) with one object per keyword:
[
  {
    "name": "<keyword exactly as given>",
    "blurb": "<a 3–8 word caption in your voice, lowercase, no period at end>",
    "ascii": "row1\\nrow2\\n... (20 rows, \\n separated)"
  },
  ...
]`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.SKETCH_MODEL || 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = (data.content || []).filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text).join('\n').trim()
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) throw new Error(`No JSON array in response:\n${text.slice(0, 600)}`)
  const parsed = JSON.parse(m[0]) as { name: string; blurb: string; ascii: string }[]

  const concepts: SketchedConcept[] = parsed.map(p => ({
    name: p.name,
    blurb: p.blurb || '',
    grid: parseAsciiGrid(p.ascii),
  }))
  return concepts
}

async function main() {
  const date = process.argv[2] || todayDate()
  const outDir = join(__dirname, '..', 'public', 'amber-noon')
  const moodPath = join(outDir, `mood-${date}.json`)
  if (!existsSync(moodPath)) {
    throw new Error(`Mood file not found: ${moodPath}. Run scripts/set-mood.ts first.`)
  }
  const mood: MoodFile = JSON.parse(readFileSync(moodPath, 'utf8'))
  console.log(`Sketching ${mood.keywords.length} concepts for ${date} (mood: ${mood.mood.name})...`)

  const concepts = await sketchAll(date, mood)

  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `concepts-${date}.json`)
  writeFileSync(outPath, JSON.stringify({ date, concepts }, null, 2) + '\n')

  console.log(`\n→ ${outPath}\n`)
  for (const c of concepts) {
    console.log(`── ${c.name} — "${c.blurb}"`)
    for (const row of c.grid) {
      console.log(row.map(v => v ? '#' : '.').join(''))
    }
    console.log('')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
