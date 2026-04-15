import { COLS, ROWS, mk, type Grid } from '@/lib/nowwhat'

// ─────────────────────────────────────────────────────────────────
// Amber's noon concepts — ten drawable-in-26x10 silhouettes
//
// Each is a hand-sketched Grid (26 cols × 10 rows).
// Later, the daily mood will filter / weight which concept is picked,
// and a small model will generate 10 variations of the winning concept.
// For now: one handmade canonical version per concept.
// ─────────────────────────────────────────────────────────────────

export interface Concept {
  name: string
  blurb: string
  grid: Grid
}

// 1. HORIZON — long flat line with a small disk just above
const HORIZON: Grid = mk((c, r) => {
  // line across the middle
  if ((r === 5 || r === 6) && c >= 2 && c <= 23) return true
  // sun disk above line
  const dx = c - 12.5, dy = r - 3
  if (Math.sqrt(dx * dx + dy * dy) <= 1.6) return true
  return false
})

// 2. WINDOW — four panes
const WINDOW: Grid = mk((c, r) => {
  const inFrame = r >= 1 && r <= 8 && c >= 9 && c <= 16
  if (!inFrame) return false
  const onTopBot = r === 1 || r === 8
  const onSides = c === 9 || c === 16
  const onHorizDivider = r === 4 || r === 5
  const onVertDivider = c === 12 || c === 13
  return onTopBot || onSides || onHorizDivider || onVertDivider
})

// 3. ANTENNA — pole + three wave bars
const ANTENNA: Grid = mk((c, r) => {
  // pole
  if ((c === 12 || c === 13) && r >= 3 && r <= 9) return true
  // bar 1 (widest, lowest)
  if (r === 2 && c >= 10 && c <= 15) return true
  // bar 2
  if (r === 1 && c >= 8 && c <= 17) return true
  // bar 3 (narrowest, on top) — stylized dots
  if (r === 0 && (c === 6 || c === 12 || c === 13 || c === 19)) return true
  return false
})

// 4. BIRD — spread-wing silhouette, high in the frame
const BIRD: Grid = mk((c, r) => {
  // body
  if (r === 2 && c >= 11 && c <= 14) return true
  if (r === 3 && c >= 12 && c <= 13) return true
  // left wing rising outward
  if (r === 3 && c >= 6 && c <= 10) return true
  if (r === 2 && c >= 4 && c <= 6) return true
  if (r === 1 && c >= 2 && c <= 4) return true
  // right wing rising outward
  if (r === 3 && c >= 15 && c <= 19) return true
  if (r === 2 && c >= 19 && c <= 21) return true
  if (r === 1 && c >= 21 && c <= 23) return true
  return false
})

// 5. KEY — lying horizontal, head on left, bit on right
const KEY: Grid = mk((c, r) => {
  // head (circle on left)
  const dx = c - 4, dy = r - 4.5
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d >= 1.4 && d <= 2.5) return true
  // stem
  if ((r === 4 || r === 5) && c >= 6 && c <= 21) return true
  // bit (teeth on right)
  if (r === 6 && (c === 17 || c === 19 || c === 21)) return true
  return false
})

// 6. LADDER — vertical, with rungs
const LADDER: Grid = mk((c, r) => {
  // two rails
  if (c === 10 && r >= 0 && r <= 9) return true
  if (c === 15 && r >= 0 && r <= 9) return true
  // rungs (row 1, 3, 5, 7)
  if ((r === 1 || r === 3 || r === 5 || r === 7) && c >= 10 && c <= 15) return true
  return false
})

// 7. WAVE — three horizontal swells
const WAVE: Grid = mk((c, r) => {
  const y1 = 2 + Math.round(1.2 * Math.sin(c * 0.6))
  const y2 = 5 + Math.round(1.2 * Math.sin(c * 0.6 + 1.1))
  const y3 = 8 + Math.round(1.2 * Math.sin(c * 0.6 + 2.2))
  return r === y1 || r === y2 || r === y3
})

// 8. CANDLE — narrow body + flame
const CANDLE: Grid = mk((c, r) => {
  // body
  if ((c === 12 || c === 13) && r >= 4 && r <= 9) return true
  // pool of light at base
  if (r === 9 && c >= 10 && c <= 15) return true
  // flame
  if (r === 2 && (c === 12 || c === 13)) return true
  if (r === 3 && c === 12) return true
  // flame dot above
  if (r === 1 && c === 12) return true
  return false
})

// 9. TOWER — thin tall with cap
const TOWER: Grid = mk((c, r) => {
  // body
  if (c >= 11 && c <= 14 && r >= 2 && r <= 9) return true
  // cap (wider, one row up)
  if (r === 1 && c >= 9 && c <= 16) return true
  // tiny antenna
  if (r === 0 && (c === 12 || c === 13)) return true
  return false
})

// 10. COMPASS — cross with one askew pointer
const COMPASS: Grid = mk((c, r) => {
  // plus sign centered at (5, 12.5)
  if (r === 5 && c >= 8 && c <= 17) return true
  if ((c === 12 || c === 13) && r >= 1 && r <= 9) return true
  // askew pointer going up-right
  if (r === 4 && (c === 15 || c === 16)) return true
  if (r === 3 && (c === 17 || c === 18)) return true
  if (r === 2 && (c === 19 || c === 20)) return true
  return false
})

export const CONCEPTS: Concept[] = [
  { name: 'horizon', blurb: 'what\'s coming, but not here yet.', grid: HORIZON },
  { name: 'window',  blurb: 'watching from inside.',             grid: WINDOW },
  { name: 'antenna', blurb: 'listening for a specific signal.',  grid: ANTENNA },
  { name: 'bird',    blurb: 'the view from above.',              grid: BIRD },
  { name: 'key',     blurb: 'not sure what it opens anymore.',   grid: KEY },
  { name: 'ladder',  blurb: 'ascent that may not finish.',       grid: LADDER },
  { name: 'wave',    blurb: 'slow tide. change happening anyway.', grid: WAVE },
  { name: 'candle',  blurb: 'a small ritual against the dark.',  grid: CANDLE },
  { name: 'tower',   blurb: 'watching and being watched.',       grid: TOWER },
  { name: 'compass', blurb: 'direction uncertain.',              grid: COMPASS },
]

export function pickRandomConcept(): Concept {
  return CONCEPTS[Math.floor(Math.random() * CONCEPTS.length)]
}

// Ensure lib doesn't complain about unused imports
export { COLS, ROWS }
