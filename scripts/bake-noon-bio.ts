// Bake today's Noon artifact using the new bio-engine (Ising physics).
// Reads:
//   public/amber-noon/mood-YYYY-MM-DD.json
//   public/amber-noon/concepts-YYYY-MM-DD.json
// Writes:
//   public/amber-noon/YYYY-MM-DD.json  (NoonRun-compatible shape)
//
// Physics lifted from scripts/bio-engine-per-concept.ts (G3 params).
// Session: up to MAX_ATTEMPTS Ising runs, first lander wins. If no attempt
// lands across MAX_SESSIONS retries, we keep the best (highest finalCrisp).
//
// Usage:
//   npx tsx scripts/bake-noon-bio.ts             (today)
//   npx tsx scripts/bake-noon-bio.ts 2026-04-17

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local so ANTHROPIC_API_KEY is available for the proposeExplanation
// and proposePalette calls below. Silent on failure — those calls check for
// the key themselves and degrade gracefully.
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

// Same token → hex maps the set-mood/renderer pipeline uses. We resolve
// archive colors here so Claude can reason about them as concrete hex values
// rather than opaque palette tokens.
const PALETTE_HEX: Record<string, string> = {
  night: '#0A0A0A', hearth: '#1A110A', ink: '#0C1424',
  petrol: '#0A1C1A', bruise: '#150826', oxblood: '#1C0808',
}
const ACCENT_HEX: Record<string, string> = {
  lime: '#C6FF3C', sodium: '#FF7A1A', uv: '#A855F7',
}

const COLS = 52
const ROWS = 20

// Ising params (G3 — mirrors experiment/page.tsx)
const J = 0.4
const OFF_BIAS = -0.9
const T_START = 2.0
const T_END = 0.03
const DT = 0.07
const ATTEMPT_SECONDS = 12
const LANDING_THRESHOLD = 0.80
const CRYSTAL_SECONDS = 3
const CRYSTAL_BIAS = 1.0
const CRYSTAL_OFF = -2.5
const CRYSTAL_T = 0.005

const MAX_ATTEMPTS = 10
const MAX_SESSIONS = 3
// Performance drama — require this many failures before accepting a landing.
// Matches the legacy 26×10 pieces, which typically had 4–5 failed attempts
// before the winner. An early lander is forced to fail (its result.landed
// flipped) and the session continues until we've accumulated enough misses.
const MIN_FAILURES = 3

type Grid = number[][]

function gauss(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function computeAffinity(grid: Grid, radius: number): number[][] {
  if (radius <= 0) return grid.map(row => row.map(v => (v === 1 ? 1 : 0)))
  const aff: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
  const R = Math.ceil(radius) + 1
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (grid[r][c] === 1) { aff[r][c] = 1.0; continue }
    let minD = Infinity
    for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      const rr = r + dr, cc = c + dc
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue
      if (grid[rr][cc] === 1) {
        const d = Math.hypot(dr, dc)
        if (d < minD) minD = d
      }
    }
    aff[r][c] = minD === Infinity ? 0 : Math.max(0, 1 - minD / radius)
  }
  return aff
}

function makeBias(grid: Grid, radius: number, strength: number, off: number): number[][] {
  const aff = computeAffinity(grid, radius)
  return aff.map(row => row.map(a => a * strength + (1 - a) * off))
}

function measureCrisp(s: number[][], grid: Grid): number {
  let ct = 0, co = 0, tc = 0, oc = 0
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (grid[r][c] === 1) { tc++; if (s[r][c] > 0.5) ct++ }
    else { oc++; if (s[r][c] < 0.2) co++ }
  }
  return (ct / Math.max(1, tc) + co / Math.max(1, oc)) / 2
}

function step(s: number[][], bias: number[][], T: number) {
  const noiseScale = Math.sqrt(2 * T * DT)
  const sNew: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const up = r > 0 ? s[r - 1][c] : 0
    const dn = r < ROWS - 1 ? s[r + 1][c] : 0
    const lf = c > 0 ? s[r][c - 1] : 0
    const rt = c < COLS - 1 ? s[r][c + 1] : 0
    const h = J * (up + dn + lf + rt) + bias[r][c]
    const drift = Math.tanh(h / T) - s[r][c]
    let v = s[r][c] + DT * drift + noiseScale * gauss()
    if (v > 1) v = 1; else if (v < -1) v = -1
    sNew[r][c] = v
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) s[r][c] = sNew[r][c]
}

interface AttemptResult {
  annealCrisp: number
  finalCrisp: number
  landed: boolean
  finalSpin: number[][]   // spin field at end (for rendering)
  finalGrid: Grid         // thresholded 0/1 grid (what reader sees)
}

function runAttempt(grid: Grid, radius: number, biasStrength: number): AttemptResult {
  const bias = makeBias(grid, radius, biasStrength, OFF_BIAS)
  const crystalBias = makeBias(grid, radius, CRYSTAL_BIAS, CRYSTAL_OFF)
  const s: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0).map(() => gauss() * 0.25))
  let t = 0
  const annealSteps = Math.floor(ATTEMPT_SECONDS / DT)
  for (let i = 0; i < annealSteps; i++) {
    const T = Math.max(T_END, T_START - (T_START - T_END) * (t / ATTEMPT_SECONDS))
    step(s, bias, T)
    t += DT
  }
  const annealCrisp = measureCrisp(s, grid)
  const landed = annealCrisp >= LANDING_THRESHOLD
  if (landed) {
    const crystalSteps = Math.floor(CRYSTAL_SECONDS / DT)
    for (let i = 0; i < crystalSteps; i++) step(s, crystalBias, CRYSTAL_T)
  }
  const finalCrisp = measureCrisp(s, grid)
  // Threshold spin field: > 0 → 1, else 0.
  const finalGrid: Grid = s.map(row => row.map(v => v > 0 ? 1 : 0))
  return { annealCrisp, finalCrisp, landed, finalSpin: s, finalGrid }
}

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface DailyConcept { name: string; blurb: string; grid: Grid }

function inferTuning(grid: Grid): { radius: number; bias: number } {
  const cells = grid.flat().reduce((a, b) => a + b, 0)
  // Match the experiment's honest landing rates: chunky shapes land ~30-50%
  // of the time, thin shapes need more help. Mean ~3.5 attempts to converge.
  if (cells < 60) return { radius: 2.4, bias: 0.35 }
  if (cells < 120) return { radius: 1.6, bias: 0.22 }
  return { radius: 1.2, bias: 0.18 }
}

// ──────────────────────────────────────────────────────────────────────────
// Claude helpers — authoring the final-screen prose and picking a palette.
// Both degrade gracefully if the API key is missing or the call fails.
// ──────────────────────────────────────────────────────────────────────────

interface ArchiveEntry { date: string; mood: string; bg: string; tile: string }

function scanArchive(dir: string, todayDate: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = []
  let files: string[] = []
  try { files = readdirSync(dir) } catch { return [] }
  for (const f of files) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue
    const d = f.replace(/\.json$/, '')
    if (d === todayDate) continue
    try {
      const r = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      const bg = r.mood?.bgColor ?? PALETTE_HEX[r.mood?.palette] ?? ''
      const tile = r.mood?.tileColor ?? ACCENT_HEX[r.mood?.accent] ?? ''
      if (bg && tile) entries.push({ date: d, mood: String(r.mood?.name ?? ''), bg, tile })
    } catch {}
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date))
}

async function callClaude(userPrompt: string, system: string, maxTokens = 1024): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) {
      console.warn(`  ⚠ claude call failed: ${res.status}`)
      return null
    }
    const data = await res.json()
    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')
      .trim()
    return text || null
  } catch (e) {
    console.warn(`  ⚠ claude call threw:`, e)
    return null
  }
}

interface MoodFile {
  mood: { name: string; reason: string; palette: string; accent: string; bgColor?: string; tileColor?: string }
  reaction?: string
  inputs?: {
    source?: string
    weather?: { conditions: string; tempF: number }
    picked?: string[]
    headlines?: string[]
  }
}

async function proposeClosingStatement(
  mood: MoodFile,
  attempts: Array<{ concept: string; blurb?: string; failed: boolean }>,
  winner: { concept: string; blurb?: string },
): Promise<string | null> {
  const failed = attempts.filter(a => a.failed).map(a => a.concept)

  const system = `You write a 2–3 sentence "closing statement" in Amber's voice for a daily art piece. Amber is a hypersensitive artist in Palo Alto. First-person. The statement appears under the winning image on the final screen.`

  const userPrompt = `Today's mood: ${mood.mood.name} — ${mood.mood.reason}

Amber's reaction (what snagged her today):
${mood.reaction ?? '(none)'}

The biosystem attempted these concepts in order:
${attempts.map((a, i) => `${i + 1}. ${a.concept}${a.failed ? ' (failed)' : ' ← LANDED'}`).join('\n')}

The winning concept: ${winner.concept}${winner.blurb ? ` — "${winner.blurb}"` : ''}

Write a 2–3 sentence closing in Amber's voice. Bridge her reaction to whatever actually landed. It's okay if the winner isn't what she started fixated on — lean into that. No meta-commentary about "the system" or "the image." Just her thinking out loud about why this shape, of all the shapes, came through.

Rules:
- First person, present or simple past tense.
- Specific over abstract. Name the thing that actually happened.
- No "I wanted X but got Y" framing. Just talk about what landed.
- Match the register of: "I kept trying to draw the desk and my hand kept going slack. The tanker came through because it's the opposite of that — massive and purposeless-looking, just sitting there holding its breath in the water."

Output ONLY the prose. No quotes, no preamble.`

  const text = await callClaude(userPrompt, system, 400)
  return text
}

async function proposeTweets(
  mood: MoodFile,
  winner: { concept: string },
  explanation: string | null,
  url: string,
): Promise<string[] | null> {
  const picks: string[] = (mood.inputs?.picked ?? mood.inputs?.headlines ?? [])
    .map(p => p.replace(/^\[r\/[^\]]+\]\s*/, '').trim())
    .filter(Boolean)
  if (picks.length === 0) return null

  const system = `You write tweet drafts for a daily generative art project. Voice: lowercase-leaning, first-person where natural, image-focused, short. Never use hashtags, never emoji, never a tagline like "new piece dropped."`

  const userPrompt = `Today's mood: ${mood.mood.name} — ${mood.mood.reason}
Winning concept: ${winner.concept}
Stories that snagged Amber:
${picks.map((p, i) => `${i + 1}. ${p}`).join('\n')}
${explanation ? `\nExplanation prose: ${explanation}\n` : ''}
Tweet URL to append at the end: ${url}

Write 3 DIFFERENT tweet drafts — different angles on today:
1. The contrast between two of the stories.
2. The image that landed (${winner.concept}) — hint at what it means without naming the stories.
3. The throughline — name the theme the stories share.

Rules:
- Under 270 chars each (leave room for URL on its own line).
- Lowercase-leaning but natural capitalization for proper nouns.
- End each tweet with a newline and the URL.
- No hashtags, no emoji, no "🎨", no "new piece", no "drop".

Output as JSON only, no preamble, no code fence:
{"tweets": ["tweet 1 text including URL", "tweet 2 text including URL", "tweet 3 text including URL"]}`

  const text = await callClaude(userPrompt, system, 1200)
  if (!text) return null
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const obj = JSON.parse(m[0])
    if (!Array.isArray(obj.tweets)) return null
    return obj.tweets.map((t: unknown) => String(t).trim()).filter(Boolean)
  } catch {
    return null
  }
}

async function proposeExplanation(mood: MoodFile): Promise<string | null> {
  const picks: string[] = (mood.inputs?.picked ?? mood.inputs?.headlines ?? [])
    .map(p => p.replace(/^\[r\/[^\]]+\]\s*/, '').trim())
    .filter(Boolean)
  if (picks.length === 0) return null

  const system = `You summarize the news stories an artist reacted to today, for display on a daily art piece's final screen. Factual third-person. No first-person, no second-person, no "we". Short and neutral.`

  const userPrompt = `The artist is Amber (a generative artist in Palo Alto). Today's mood: ${mood.mood.name} — ${mood.mood.reason}.

Stories she picked:
${picks.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Her reaction to them (for flavor — don't quote it):
${mood.reaction || '(none)'}

Write a short prose explanation (4–6 sentences total) in this exact format:

1. First sentence, verbatim: "Amber picked ${picks.length} stor${picks.length === 1 ? 'y' : 'ies'} in the news today."
2. One sentence per story: what factually happened, with one concrete human detail that explains why it snagged her. Use em-dashes or semicolons to join clauses. Keep it tight.
3. Last sentence: "The throughline she's chasing: [one short phrase naming the theme the stories share]."

Rules:
- No markdown, no quotes around the whole thing, no preamble.
- No "she felt", "she noticed" — narrate the events, not her interior state.
- Don't editorialize or moralize.
- Match the register of: "Former Princess Mako Komuro, photographed riding a public bus in Japan with her husband — female royals lose their status if they marry a commoner, and she chose to."

Output ONLY the prose paragraph.`

  const text = await callClaude(userPrompt, system, 600)
  return text
}

async function proposePalette(
  mood: MoodFile,
  archive: ArchiveEntry[],
): Promise<{ bgColor: string; tileColor: string } | null> {
  const w = mood.inputs?.weather
  const weatherLine = w ? `${w.conditions}, ${Math.round(w.tempF)}°F` : ''
  const archiveLine = archive.length
    ? archive.map(a => `- ${a.date} (${a.mood}): bg ${a.bg}, tile ${a.tile}`).join('\n')
    : '(archive is empty)'

  const system = `You pick a 2-color palette for a daily generative art piece rendered in 52×20 pixel cells. The field is the viewport background; the cells are painted in the tile color. The aesthetic is Amber v3 "SIGNAL": dark field + one accent, heavy negative space, specimen register.`

  const userPrompt = `Today's mood: ${mood.mood.name} — ${mood.mood.reason}
Weather (Palo Alto): ${weatherLine}
Artist's reaction (for tonal context): ${(mood.reaction ?? '').slice(0, 500)}

Palettes already used in the archive (${archive.length} pieces — differentiate clearly from all of them):
${archiveLine}

═══ RULES ═══

1. Background: must be DARK (total luminance well under 0.35). Not pure black — always tinted by a temperature (earth, ink, olive, bruise, oxblood, charcoal, slate). Never cream, pastel, or neutral-gray. The piece has to read as a night plate.
2. Tile: must read clearly against the field — distinct in both hue AND luminance. Muted over bright (dusky, dusted, desaturated) — a tile that's too saturated reads as a UI button, not a specimen.
3. Pair: the bg + tile should feel like ONE system — either resonating (same temperature family) or deliberately clashing (cool bg + warm tile, or warm bg + cool tile). Pick one relationship and commit.

═══ MOOD → COLOR REGISTER (defaults, not rules) ═══

- tender / mournful / held → warm tile on cool dark (peach/amber/copper on slate/ink)
- raw / stripped / exposed / environmental → muted green or rust tile on dark earth (sage/moss/clay on charcoal-brown/olive-black)
- uneasy / watching / technical → cool tile on cool dark (lime/UV/ice on petrol/ink)
- euphoric / 4am / alien → UV or high-chroma tile on bruise
- angry / smoldering → sodium/ember on oxblood
- hollowed-out / flattened → graphite/bone on near-black or (rarely) cream inversion
- brooding / heavy → muted warm or muted cool on near-black

These are starting points. The mood's REASON + reaction almost always points to a more specific register.

═══ ARCHIVE AWARENESS ═══

Before picking, identify which color lanes the archive already owns. If every prior tile is warm (amber, peach, copper, red-orange), a muted green or sage is a fresh lane. If prior bgs cluster in navy/slate, an earth-brown or oxblood is fresh. Actively hunt unused lanes.

═══ CALIBRATION EXAMPLES ═══

- "tender + overcast drizzle" (Mako on a wet bus) → bg #1A2430 (damp slate-blue), tile #F2A66B (muted warm peach). Cool bg + warm tile, muted both.
- "raw + goldman prize 37 years + earthquake" (stripped, environmental, geological) → bg #1A1814 (dark earth-charcoal), tile #9CAC82 (dusty sage). Warm dark bg + cool muted tile — specifically green-on-earth for the environmental thread. A lane nothing else in the archive occupies.

Match that level of specificity: the COMBINATION says something the mood-name alone doesn't.

Output ONLY a single JSON object, no prose, no code fence:
{"bgColor":"#RRGGBB","tileColor":"#RRGGBB"}`

  const text = await callClaude(userPrompt, system, 200)
  if (!text) return null
  const m = text.match(/\{[^}]*\}/)
  if (!m) return null
  try {
    const obj = JSON.parse(m[0])
    const bg = String(obj.bgColor || '').trim()
    const tile = String(obj.tileColor || '').trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(bg) || !/^#[0-9a-fA-F]{6}$/.test(tile)) return null
    return { bgColor: bg, tileColor: tile }
  } catch {
    return null
  }
}

async function main() {
  const date = process.argv[2] || todayDate()
  const dir = join(__dirname, '..', 'public', 'amber-noon')
  const moodPath = join(dir, `mood-${date}.json`)
  const conceptsPath = join(dir, `concepts-${date}.json`)

  if (!existsSync(moodPath)) throw new Error(`missing ${moodPath}`)
  if (!existsSync(conceptsPath)) throw new Error(`missing ${conceptsPath}`)

  const mood = JSON.parse(readFileSync(moodPath, 'utf8'))
  const { concepts }: { concepts: DailyConcept[] } = JSON.parse(readFileSync(conceptsPath, 'utf8'))

  console.log(`Baking ${date} (mood: ${mood.mood.name}, ${concepts.length} concepts)`)

  const pool = concepts.map(c => ({ ...c, ...inferTuning(c.grid) }))

  // Build a session: up to MAX_ATTEMPTS picks, no two in a row. Run physics
  // per pick; stop at first lander. Retry session up to MAX_SESSIONS.
  interface SessionAttempt {
    concept: DailyConcept & { radius: number; bias: number }
    result: AttemptResult
  }

  let best: { session: SessionAttempt[]; landed: boolean } | null = null
  for (let sess = 0; sess < MAX_SESSIONS; sess++) {
    const session: SessionAttempt[] = []
    let lastIdx = -1
    let landed = false
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      let idx = Math.floor(Math.random() * pool.length)
      let guard = 0
      while (idx === lastIdx && guard++ < 8) idx = Math.floor(Math.random() * pool.length)
      lastIdx = idx
      const c = pool[idx]
      const result = runAttempt(c.grid, c.radius, c.bias)
      // Drama gate: if we haven't logged enough failures yet, force this
      // attempt to fail even if the physics actually landed. Keeps the session
      // from ending on attempt 2 and restores the legacy 4–5-attempt cadence.
      const failuresSoFar = session.filter(x => !x.result.landed).length
      const forced = result.landed && failuresSoFar < MIN_FAILURES
      if (forced) result.landed = false
      session.push({ concept: c, result })
      console.log(`  s${sess} a${i} ${c.name.padEnd(22)} anneal=${result.annealCrisp.toFixed(3)} final=${result.finalCrisp.toFixed(3)} ${result.landed ? 'LANDED' : forced ? '(forced fail)' : ''}`)
      if (result.landed) { landed = true; break }
    }
    if (landed) { best = { session, landed: true }; break }
    if (!best) best = { session, landed: false }
    else {
      // keep session with highest max finalCrisp
      const bestMax = Math.max(...best.session.map(x => x.result.finalCrisp))
      const thisMax = Math.max(...session.map(x => x.result.finalCrisp))
      if (thisMax > bestMax) best = { session, landed: false }
    }
  }

  if (!best) throw new Error('no session produced')
  const { session, landed } = best

  // Winner = last attempt (the lander, or the best-we-got).
  const winnerAttempt = session[session.length - 1]
  const attempts = session.map((a, i) => ({
    concept: a.concept.name,
    blurb: a.concept.blurb,
    gridName: a.concept.name,
    grid: a.concept.grid,
    finalGrid: a.result.finalGrid,
    finalSpin: a.result.finalSpin,
    annealCrisp: a.result.annealCrisp,
    finalCrisp: a.result.finalCrisp,
    landed: a.result.landed,
    failed: i !== session.length - 1,
  }))

  const winner = attempts[attempts.length - 1]

  // Fallback closing if Claude fails or we skip the call below.
  const templatedClosing =
    landed
      ? `it came through. ${winner.concept}.`
      : `nothing landed today. just ${winner.concept}, dissolving.`

  // Populate meta.weather / location / news from the mood file so the renderer
  // can surface them in the bottom meta-rail (matching the legacy performance).
  const w = mood.inputs?.weather
  const weatherString = w ? `${w.conditions} · ${Math.round(w.tempF)}°F` : undefined
  const locationString = mood.inputs?.location
    ? String(mood.inputs.location).split(',')[0]  // "Palo Alto, CA" → "Palo Alto"
    : undefined
  // Use the specific items Amber picked (up to 3) as the news meta.
  const picked: string[] = Array.isArray(mood.inputs?.picked) ? mood.inputs.picked : []
  const headlines: string[] = Array.isArray(mood.inputs?.headlines) ? mood.inputs.headlines : []
  const newsItems = (picked.length ? picked : headlines).slice(0, 3).map((s: string) => {
    // Strip [r/sub] prefix from reddit entries for a tighter rail.
    const cleaned = s.replace(/^\[r\/[^\]]+\]\s*/, '').trim()
    // Cap to a short phrase for the rail.
    return cleaned.length > 60 ? cleaned.slice(0, 58) + '…' : cleaned
  })

  // Author the final-screen prose, closing statement, palette, and tweet
  // drafts in parallel. All of these degrade gracefully on failure.
  console.log(`  authoring explanation + closing + picking palette + drafting tweets…`)
  const archive = scanArchive(dir, date)
  const url = `intheamber.com/noon/${date}`
  const [explanation, closingFromClaude, palette] = await Promise.all([
    proposeExplanation(mood),
    proposeClosingStatement(mood, attempts, winner),
    mood.mood.bgColor && mood.mood.tileColor
      ? Promise.resolve(null)  // respect manual overrides already in the mood file
      : proposePalette(mood, archive),
  ])
  const closingStatement = closingFromClaude || templatedClosing
  const tweets = await proposeTweets(mood, winner, explanation, url)
  if (explanation) console.log(`  ✓ explanation (${explanation.length} chars)`)
  if (closingFromClaude) console.log(`  ✓ closing (${closingFromClaude.length} chars)`)
  else console.log(`  ⚠ closing: fell back to template`)
  if (palette) console.log(`  ✓ palette bg=${palette.bgColor} tile=${palette.tileColor}`)
  if (tweets) console.log(`  ✓ ${tweets.length} tweet drafts`)

  const moodOut = {
    ...mood.mood,
    ...(palette ? { bgColor: palette.bgColor, tileColor: palette.tileColor } : {}),
  }

  const run = {
    date,
    mood: moodOut,
    reaction: mood.reaction,
    keywords: mood.keywords,
    attempts,
    winner,
    closingStatement,
    meta: {
      engine: 'bio-engine/G3',
      sessions: best ? (landed ? 1 : MAX_SESSIONS) : 0,
      landed,
      weather: weatherString,
      location: locationString,
      news: newsItems,
      ...(explanation ? { explanation } : {}),
    },
  }

  mkdirSync(dir, { recursive: true })
  const outPath = join(dir, `${date}.json`)
  writeFileSync(outPath, JSON.stringify(run, null, 2) + '\n')

  console.log(`\n→ ${outPath}`)
  console.log(`  ${attempts.length} attempts; winner: "${winner.concept}" (${landed ? 'LANDED' : 'best-we-got'}, finalCrisp=${winner.finalCrisp.toFixed(3)})`)

  // Drop tweet drafts into a dated sidecar file so the human can pick and post.
  if (tweets && tweets.length > 0) {
    const tweetsPath = join(dir, `tweets-${date}.md`)
    const body = tweets
      .map((t, i) => `## draft ${i + 1}\n\n${t}\n`)
      .join('\n')
    writeFileSync(tweetsPath, `# tweet drafts — ${date}\n\n${body}`)
    console.log(`→ ${tweetsPath}`)
  }

  // Append this piece to src/app/amber/creations.json so it surfaces on the
  // amber homepage widget. Skip if an entry for this date already exists.
  try {
    const creationsPath = join(__dirname, '..', 'src', 'app', 'amber', 'creations.json')
    const creations: Array<Record<string, string>> = JSON.parse(readFileSync(creationsPath, 'utf8'))
    const dateShort = date.slice(5).replace('-', '.')  // "2026-04-20" → "04.20"
    const newUrl = `/amber/noon/${date}`
    const already = creations.some(c => c.url === newUrl)
    if (!already) {
      const entry = {
        name: 'noon',
        url: newUrl,
        date: dateShort,
        category: 'noon',
        description: `${mood.mood.name} · ${winner.concept}`,
      }
      creations.unshift(entry)
      writeFileSync(creationsPath, JSON.stringify(creations, null, 2) + '\n')
      console.log(`→ creations.json: prepended entry for ${date}`)
    } else {
      console.log(`  (creations.json already has an entry for ${date} — skipped)`)
    }
  } catch (e) {
    console.warn(`  ⚠ could not update creations.json:`, e)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
