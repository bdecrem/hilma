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
  // Accept any line that's wide enough and not mostly alphabetic (which would be prose).
  // Opus occasionally slips a label (e.g. "TRANSFER") into a sketch row; we let it
  // through and let the char-by-char parser below map non-'#' to empty.
  const isLikelyGridRow = (l: string) => {
    if (l.length < COLS * 0.7) return false
    const alpha = (l.match(/[a-zA-Z]/g) || []).length
    return alpha / l.length < 0.3
  }
  const gridLines = lines.filter(isLikelyGridRow)
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

  const systemPrompt = `You are Amber. You are a generative artist living in Palo Alto, California, and you make one artifact a day at noon.

Today your mood is: ${mood.mood.name} — ${mood.mood.reason}.
Palette: ${mood.mood.palette}. Accent: ${mood.mood.accent}.

You sketch on a strict 52 columns × 20 rows grid, '#' filled, '.' empty. You are not illustrating. You are making SPECIMENS — the smallest geometric primitive that carries a feeling. Your work is quiet because quiet is harder. Heavy negative space. Asymmetry. One shape on a dark plate.`

  const userPrompt = `Amber picked ${mood.keywords.length} nouns today. Each one carries some part of her mood.

${mood.reaction ? `Her reaction:\n${mood.reaction}\n\n` : ''}Nouns (one sketch per noun, in order):
${mood.keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}

═══ THE CORE MOVE — don't illustrate, distill ═══

For each noun, find the GEOMETRIC PRIMITIVE that carries the same feeling, and sketch THAT. The primitive is not an illustration of the noun. It is the shape pattern the noun makes you SEE.

The 52×20 grid speaks in these primitives. Pick ONE per sketch:

1. REPETITION + EXCEPTION — a row of identical marks with one different.
   (e.g. "thirty-seven candles, one lit" → 25 vertical ticks in a row, one with a flame above it.)
2. ABRUPT CUTOFF — a rhythm that just stops mid-scroll.
   (e.g. "a snapped seismograph needle" → wiggling trace for 60% of the canvas, then dead empty.)
3. GEOMETRIC BREAK / SHIFT — a line or edge that splits and offsets.
   (e.g. "fault line" → horizontal segment at row 9 cols 2–25, second segment at row 12 cols 28–49, a tick or two above and below.)
4. ACCUMULATION + ABSENCE — many marks, some missing, baseline underneath showing the rhythm.
   (e.g. "tally marks with gaps" → vertical ticks every 3 cols, a few positions empty, thin baseline across.)
5. DIVERGENCE — one thick shape fraying into many thin lines.
   (e.g. "rope unraveling" → thick bar on the left cols 2–20, 5 thin diverging threads fanning out to the right edge.)
6. CONCENTRIC + CRACK — rings around a center, one cut or gap.
7. STEPPED CASCADE — bars stepping down a diagonal. (e.g. "subscribers falling off a cliff" → histogram from tall left to zero right.)
8. CENTERED SEAM — one subject split vertically, the two halves different in kind.
9. TRACE + DROP — a line running level, then plummeting at one point.
10. CONTOUR WITH A HOLE — an outline with a clean gap where something's missing.

═══ Literal illustration is the weak version — avoid it ═══

WEAK: "a frayed rope" → try to draw rope fibers and a knot. (A tangled squiggle.)
STRONG: "a frayed rope" → DIVERGENCE: thick bar on the left fanning into thin threads on the right.

WEAK: "a cracked porthole" → oval outline with an internal scribble.
STRONG: "a cracked porthole" → CONCENTRIC + CRACK: one ring with a single diagonal hairline cutting through.

WEAK: "a passport stamped VOID" → rectangle with illegible text inside.
STRONG: "a passport stamped VOID" → CONTOUR WITH A HOLE: a clean rectangle with one sharp diagonal X.

WEAK: "a dog-eared library book" → two-page spread with text lines and a corner fold.
STRONG: "a dog-eared library book" → REPETITION + EXCEPTION: a row of 10 vertical book-spine marks with one bent over.

The move: find the PATTERN the noun creates, then sketch only the pattern. A rope fraying IS divergence. A needle snapping IS abrupt cutoff. An earthquake IS a geometric break. Draw what the thing DOES to space, not the thing.

═══ Three worked ASCII examples ═══

EXAMPLE A — REPETITION + EXCEPTION ("thirty-seven candles, one lit"):

....................................................
....................................................
....................................................
....................................................
....................................................
....................................................
....................................................
....................................................
............................#.......................
............................#.......................
............................#.......................
..#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.
..#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.
..#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.
..#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.
..#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.
..#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.
..#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.
..#################################################.
....................................................

25 identical vertical ticks. The 14th has a small flame rising above it (three extra cells). The row fills the width; the exception is off-center-left (asymmetric).

EXAMPLE B — GEOMETRIC BREAK ("fault line"):

....................................................
....................................................
....................................................
....................................................
....................................................
....................................................
....................................................
..........#.........................................
..........#.........................................
..########################..........................
..........................#.........................
...........................#........................
............................######################..
.................#...............#.......#..........
.................#...............#.......#..........
....................................................
....................................................
....................................................
....................................................
....................................................

Two horizontal line segments offset by 3 rows and 2 cols. Short vertical ticks above the upper segment (same terrain) and below the lower one (shifted to new positions). Two tiny cells mark the break point.

EXAMPLE C — DIVERGENCE ("rope unraveling"):

....................................................
....................................................
....................................................
...............................................###..
...........................................####.....
.......................................####.........
...................................####.......####..
...............................####....#######......
...........................############.............
..###################..########.....................
..################################################..
..###################..########.....................
..###################......############.............
...............................####....#######......
...................................####.......####..
.......................................####.........
...........................................####.....
...............................................###..
....................................................
....................................................

A thick rope body on the left (rows 9–12, cols 2–20), 5 thin threads diverging from its broken end out to the right edge.

═══ Rules ═══

- EXACTLY 20 rows × 52 cols per sketch
- Only '#' and '.' — no other characters, no labels, no arrows
- Pick ONE primitive per sketch from the list above. Do not blend primitives.
- USE THE WIDTH — every sketch spans at least cols 2 to 49
- Heavy negative space — ideally ≥60% empty
- Asymmetry always — off-center anchors, irregular spacings, one-sided emphasis
- NO: textured rectangles, filled ovals with detail inside, rope-shaped squiggles, literal object outlines with internal hatching
- If a primitive wants ONE charged cell (the lit candle, the break point), keep it to a handful of cells — the charge is the point

Output ONLY a JSON array, no code fence:
[
  {
    "name": "<keyword exactly as given>",
    "blurb": "<3–8 word caption in Amber's voice, lowercase, no period>",
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
