import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// the review package lives in apps/mrd/dossiers/review; these pages are static, so it is read at build time only
const DIR = join(process.cwd(), 'apps/mrd/dossiers/review')

export type Side = 'new' | 'mrd'
export const KEY: Record<string, { country: string; source: Side }> = JSON.parse(readFileSync(join(DIR, 'key.json'), 'utf8'))
export const LETTERS = Object.keys(KEY).sort()

// the reviewer's ranking (REVIEW.md section 1): overall 1–5, and the 8-indicator check as correct / partly / wrong
export const RANKING: { letter: string; overall: number; c: number; p: number; w: number }[] = [
  { letter: 'F', overall: 5, c: 8, p: 0, w: 0 },
  { letter: 'J', overall: 5, c: 8, p: 0, w: 0 },
  { letter: 'L', overall: 5, c: 8, p: 0, w: 0 },
  { letter: 'A', overall: 5, c: 8, p: 0, w: 0 },
  { letter: 'K', overall: 5, c: 8, p: 0, w: 0 },
  { letter: 'E', overall: 5, c: 8, p: 0, w: 0 },
  { letter: 'C', overall: 4, c: 7, p: 1, w: 0 },
  { letter: 'H', overall: 3, c: 5, p: 2, w: 1 },
  { letter: 'G', overall: 2, c: 4, p: 2, w: 2 },
  { letter: 'I', overall: 2, c: 6, p: 1, w: 1 },
  { letter: 'D', overall: 2, c: 4, p: 2, w: 2 },
  { letter: 'B', overall: 2, c: 5, p: 2, w: 1 },
]

export function readBlind(name: string) {
  return readFileSync(join(DIR, 'blind', name), 'utf8')
}
