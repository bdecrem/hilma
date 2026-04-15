// Bake today's (or a given date's) Amber Noon run.
// If public/amber-noon/mood-YYYY-MM-DD.json exists (from set-mood.ts),
// that mood + keywords + reaction drive the bake. Otherwise we fall back
// to the hardcoded default mood and the static CONCEPTS list.
//
// Usage:
//   npx tsx scripts/bake-noon.ts           (today)
//   npx tsx scripts/bake-noon.ts 2026-04-14
//   npx tsx scripts/bake-noon.ts 2026-04-14 reroll-1   (optional salt)

import { generateRun, todayDate, type MoodInput } from '../src/app/amber/noon/generator'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dateArg = process.argv[2]
const saltArg = process.argv[3]
const date = dateArg || todayDate()

const outDir = join(__dirname, '..', 'public', 'amber-noon')
mkdirSync(outDir, { recursive: true })

const moodPath = join(outDir, `mood-${date}.json`)
const conceptsPath = join(outDir, `concepts-${date}.json`)
let moodInput: MoodInput | undefined
if (existsSync(moodPath)) {
  const raw = JSON.parse(readFileSync(moodPath, 'utf8'))
  moodInput = {
    mood: raw.mood,
    reaction: raw.reaction,
    keywords: raw.keywords,
  }
  console.log(`Using mood from ${moodPath}: ${raw.mood.name}`)
  if (existsSync(conceptsPath)) {
    const c = JSON.parse(readFileSync(conceptsPath, 'utf8'))
    moodInput.dailyConcepts = c.concepts
    console.log(`Using ${c.concepts.length} daily-sketched concepts from ${conceptsPath}`)
  }
} else {
  console.log(`No mood file for ${date} — using default mood`)
}

const run = saltArg
  ? generateRun(date, saltArg, moodInput)
  : generateRun(date, moodInput)

const outPath = join(outDir, `${date}.json`)
writeFileSync(outPath, JSON.stringify(run, null, 2) + '\n')

console.log(`Baked ${date} → ${outPath}`)
console.log('')
console.log(JSON.stringify(run, null, 2))
