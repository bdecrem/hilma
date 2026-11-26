#!/usr/bin/env node
// The quick tests of one part of Ola, with no VM and no browser (OLA-464):
//   node ops/unit.mjs web          web/test/*.test.ts and *.test.mjs (about a second)
//   node ops/unit.mjs frontdesk    frontdesk/test/*.test.mjs (under a minute)
// An ordinary update runs these in place of the part's long suite (ops/select.mjs, quickForm); the long
// suites run for a big change and in the automatic checks. Prints node's own summary, exits as it does.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SETS = { web: /\.test\.(ts|mjs)$/, frontdesk: /\.test\.mjs$/ }
const part = process.argv[2]
if (!SETS[part]) {
  console.error(`usage: node ops/unit.mjs ${Object.keys(SETS).join(' | ')}`)
  process.exit(2)
}
const cwd = path.join(AI, part)
const files = readdirSync(path.join(cwd, 'test')).filter((f) => SETS[part].test(f)).sort().map((f) => path.join('test', f))
const r = spawnSync(process.execPath, ['--test', ...files], { cwd, stdio: 'inherit' })
process.exit(r.status ?? 1)
