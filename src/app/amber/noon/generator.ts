import { CONCEPTS } from './concepts'

// ─────────────────────────────────────────────────────────────────
// Amber's Noon — the generator
//
// Given a date, deterministically produces the run for that day:
//   - mood (for now hardcoded; later from LLM + weather/news)
//   - an ordered sequence of attempts, each with a concept + outcome
//   - the winning concept
//   - the closing statement paragraph
//
// Deterministic: the same date string always yields the same run, so
// the page is a faithful replay of what happened at noon.
// ─────────────────────────────────────────────────────────────────

export interface Attempt {
  concept: string
  blurb: string
  failed: boolean // the last attempt is always a success (failed=false)
}

export interface NoonRun {
  date: string              // 'YYYY-MM-DD'
  mood: {
    name: string
    reason: string
    palette: 'night' | 'hearth' | 'ink' | 'petrol' | 'bruise' | 'oxblood'
    accent: 'lime' | 'sodium' | 'uv'
  }
  attempts: Attempt[]
  winner: Attempt
  closingStatement: string
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

// ─── Mood selection ──────────────────────────────────────────────
// For now: hardcoded. Later this is synthesized by an LLM from the
// day's weather + news. The structure is already the one the page consumes.
function pickMoodForDate(_date: string) {
  return {
    name: 'uneasy',
    reason: 'bright sky, tense world',
    palette: 'petrol' as const,
    accent: 'lime' as const,
  }
}

// ─── Closing statement ───────────────────────────────────────────
// Template for now. Later: LLM-generated each day, matched to mood + winner.
function composeClosingStatement(moodName: string, winner: Attempt): string {
  const winnerBlurb = winner.blurb.replace(/\.$/, '').toLowerCase()
  return `The sky was too bright for the news. Amber reached for a few things and let most of them slip. She ended on ${winner.concept} — ${winnerBlurb}. Take that as today.`
  // moodName available for per-mood variants later
  void moodName
}

// ─── Attempt sequence ────────────────────────────────────────────
// Rules (MVP):
//   - first attempt ALWAYS fails
//   - each subsequent attempt has 25% chance of success
//   - max 6 attempts; if none has succeeded by then, force success on #6
//   - concepts picked without immediate repeat (no two in a row the same)
function planAttempts(rng: () => number): Attempt[] {
  const attempts: Attempt[] = []
  const MAX = 6
  const SUCCESS_PROB = 0.25
  let lastConceptName = ''

  for (let i = 0; i < MAX; i++) {
    // Pick a concept different from the previous one
    let c = CONCEPTS[Math.floor(rng() * CONCEPTS.length)]
    let guard = 0
    while (c.name === lastConceptName && guard++ < 8) {
      c = CONCEPTS[Math.floor(rng() * CONCEPTS.length)]
    }
    lastConceptName = c.name

    const isFirst = i === 0
    const isLastChance = i === MAX - 1
    let failed: boolean
    if (isFirst) failed = true
    else if (isLastChance) failed = false
    else failed = rng() >= SUCCESS_PROB

    attempts.push({ concept: c.name, blurb: c.blurb, failed })
    if (!failed) break
  }
  return attempts
}

// ─── Public: generate a full run for a date ──────────────────────
// Optional `salt` lets us re-roll the same date (for testing or a fresh take).
export function generateRun(date: string, salt?: string): NoonRun {
  const seedKey = salt ? `amber-noon-${date}-${salt}` : `amber-noon-${date}`
  const rng = seededRandom(hashString(seedKey))
  const mood = pickMoodForDate(date)
  const attempts = planAttempts(rng)
  const winner = attempts[attempts.length - 1]
  const closingStatement = composeClosingStatement(mood.name, winner)
  return { date, mood, attempts, winner, closingStatement }
}

// Convenience: today's date as YYYY-MM-DD
export function todayDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
