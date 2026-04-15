// Bake today's (or a given date's) Amber Noon run.
// Usage:
//   npx tsx scripts/bake-noon.ts           (today)
//   npx tsx scripts/bake-noon.ts 2026-04-14

import { generateRun, todayDate } from '../src/app/amber/noon/generator'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dateArg = process.argv[2]
const saltArg = process.argv[3] // optional: re-roll with a different seed
const date = dateArg || todayDate()

const run = generateRun(date, saltArg)

// Written to public/ so it's served as a static asset (fetch-able from client & server).
const outDir = join(__dirname, '..', 'public', 'amber-noon')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, `${date}.json`)
writeFileSync(outPath, JSON.stringify(run, null, 2) + '\n')

console.log(`Baked ${date} → ${outPath}`)
console.log('')
console.log(JSON.stringify(run, null, 2))
