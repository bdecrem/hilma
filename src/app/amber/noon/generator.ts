import { CONCEPTS } from './concepts'

// ─────────────────────────────────────────────────────────────────
// Amber's Noon — the generator
//
// Given a date + (optionally) Amber's mood-of-the-day, deterministically
// produces the run for that day:
//   - mood (from the mood synthesizer; falls back to a hardcoded default)
//   - keywords (Amber's sensory images — drive the attempt concepts)
//   - an ordered sequence of attempts
//   - the winner
//   - a closing statement (woven from Amber's first-person reaction)
//
// Deterministic: same date (+ same mood input) always yields the same run.
// ─────────────────────────────────────────────────────────────────

export interface Attempt {
  concept: string        // the keyword shown to the viewer
  blurb: string          // short caption
  gridName: string       // name of the grid used (keyword, or one of the static CONCEPTS)
  grid?: number[][]     // inline grid (ROWS × COLS), when drawn freshly for the day
  failed: boolean        // the last attempt is always a success (failed=false)
}

export interface NoonRun {
  date: string
  mood: {
    name: string
    reason: string
    palette: 'night' | 'hearth' | 'ink' | 'petrol' | 'bruise' | 'oxblood'
    accent: 'lime' | 'sodium' | 'uv'
    bgColor?: string    // optional hex override — takes precedence over palette
    tileColor?: string  // optional hex override — tints the tiles
  }
  reaction?: string
  keywords?: string[]
  attempts: Attempt[]
  winner: Attempt
  closingStatement: string
  meta?: {
    weather?: string
    location?: string
    news?: string[]
  }
}

export interface DailyConcept {
  name: string
  blurb: string
  grid: number[][]
}

export interface MoodInput {
  mood: NoonRun['mood']
  reaction?: string
  keywords?: string[]
  dailyConcepts?: DailyConcept[]  // fresh grids sketched for today
}

// ─── Seeded PRNG (Mulberry32) ────────────────────────────────────
function hashString(s: string): number {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}
function seededRandom(seed: number) {
  let t = seed >>> 0
  return function () {
    t = (t + 0x6D2B79F5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const DEFAULT_MOOD: NoonRun['mood'] = {
  name: 'uneasy',
  reason: 'bright sky, tense world',
  palette: 'petrol',
  accent: 'lime',
}

// Map a keyword → one of the existing grids, deterministically.
function gridForKeyword(keyword: string): string {
  const idx = hashString(keyword) % CONCEPTS.length
  return CONCEPTS[idx].name
}

// Closing statement: if Amber wrote a reaction today, use it (first person) + the winner.
// Otherwise fall back to the original template.
function composeClosingStatement(
  moodName: string,
  winner: Attempt,
  reaction?: string,
): string {
  if (reaction && reaction.trim()) {
    return `${reaction.trim()} I ended on ${winner.concept}.`
  }
  void moodName
  const wb = winner.blurb ? ` — ${winner.blurb.replace(/\.$/, '').toLowerCase()}` : ''
  return `The sky was too bright for the news. Amber reached for a few things and let most of them slip. She ended on ${winner.concept}${wb}. Take that as today.`
}

// ─── Attempt sequence ────────────────────────────────────────────
// Rules:
//   - first attempt ALWAYS fails
//   - subsequent attempts have 25% chance of success
//   - max 6 attempts; if none has succeeded by then, force success on #6
//   - no two in a row the same
interface PoolEntry { concept: string; blurb: string; gridName: string; grid?: number[][] }

function planAttempts(rng: () => number, pool: PoolEntry[]): Attempt[] {
  const attempts: Attempt[] = []
  const MAX = 6
  const SUCCESS_PROB = 0.25
  let lastConcept = ''
  for (let i = 0; i < MAX; i++) {
    let c = pool[Math.floor(rng() * pool.length)]
    let guard = 0
    while (c.concept === lastConcept && guard++ < 8) {
      c = pool[Math.floor(rng() * pool.length)]
    }
    lastConcept = c.concept
    const isFirst = i === 0
    const isLastChance = i === MAX - 1
    let failed: boolean
    if (isFirst) failed = true
    else if (isLastChance) failed = false
    else failed = rng() >= SUCCESS_PROB
    const a: Attempt = { concept: c.concept, blurb: c.blurb, gridName: c.gridName, failed }
    if (c.grid) a.grid = c.grid
    attempts.push(a)
    if (!failed) break
  }
  return attempts
}

export function generateRun(date: string, saltOrMood?: string | MoodInput, maybeMood?: MoodInput): NoonRun {
  // Back-compat: generateRun(date, salt?) still works.
  let salt: string | undefined
  let moodInput: MoodInput | undefined
  if (typeof saltOrMood === 'string') { salt = saltOrMood; moodInput = maybeMood }
  else { moodInput = saltOrMood }

  const seedKey = salt ? `amber-noon-${date}-${salt}` : `amber-noon-${date}`
  const rng = seededRandom(hashString(seedKey))

  const mood = moodInput?.mood ?? DEFAULT_MOOD
  const reaction = moodInput?.reaction

  // Build the pool of attempt candidates.
  // Preference order:
  //   1. dailyConcepts (Amber sketched fresh grids for today's keywords)
  //   2. keywords only (grid hash-mapped to the static library)
  //   3. static CONCEPTS list
  let pool: PoolEntry[]
  if (moodInput?.dailyConcepts && moodInput.dailyConcepts.length > 0) {
    pool = moodInput.dailyConcepts.map(dc => ({
      concept: dc.name,
      blurb: dc.blurb,
      gridName: dc.name,
      grid: dc.grid,
    }))
  } else if (moodInput?.keywords && moodInput.keywords.length > 0) {
    pool = moodInput.keywords.map(kw => ({
      concept: kw,
      blurb: '',
      gridName: gridForKeyword(kw),
    }))
  } else {
    pool = CONCEPTS.map(c => ({ concept: c.name, blurb: c.blurb, gridName: c.name }))
  }

  const attempts = planAttempts(rng, pool)
  const winner = attempts[attempts.length - 1]
  const closingStatement = composeClosingStatement(mood.name, winner, reaction)
  return {
    date,
    mood,
    reaction,
    keywords: moodInput?.keywords,
    attempts,
    winner,
    closingStatement,
  }
}

export function todayDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
