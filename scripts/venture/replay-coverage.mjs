#!/usr/bin/env node
// Which corrections (from 22 on) have no replay case and no reason in replay-untestable.json.
//   node scripts/venture/replay-coverage.mjs        prints the count of cases and the uncovered numbers; exit 1 if any
import { readFileSync } from 'node:fs'
import { loadCases, uncoveredCorrections } from './_replay.mjs'

const root = new URL('../../', import.meta.url)
const cases = loadCases(root)
const missing = uncoveredCorrections(root, readFileSync(new URL('apps/venture/private/CORRECTIONS.md', root), 'utf8'))
console.log(`${cases.length} cases; ${cases.filter((c) => !c.weakness).length} without a weakness; corrections with no case and no reason: ${missing.length ? missing.join(', ') : 'none'}`)
process.exit(missing.length ? 1 : 0)
