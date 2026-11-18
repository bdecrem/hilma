#!/usr/bin/env node
// Is apps/activist-ai/OVERVIEW.md, the one-page overview of Ola, still current? (OLA-132)
// Bart, 2026-11-17: a one-page overview "that's always up to date so agents can refer to that for
// context... critical that it's up to date."
//
// It reads the overview's header line, "Last checked against: `<hash>` (<date>)", and counts the
// commits on origin/main since that hash that changed anything under apps/activist-ai other than
// OVERVIEW.md itself (a commit that only updates the overview does not make it stale).
//
//   node scripts/venture/overview-check.mjs              fetches origin/main first
//   node scripts/venture/overview-check.mjs --no-fetch   uses origin/main as it is
//   node scripts/venture/overview-check.mjs --list       also lists the commits
//
// Prints "current" (exit 0) or "stale: N Ola commits since <date>" (exit 1). Exit 2 when the header
// is missing or the hash is not on origin/main. The board (src/lib/venture/overview.ts) applies the
// same rule through GitHub's API.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = 'apps/activist-ai'
const FILE = `${DIR}/OVERVIEW.md`
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

const args = process.argv.slice(2)
const header = readFileSync(join(root, FILE), 'utf8').match(/^Last checked against: `([0-9a-f]{7,40})` \((\d{4}-\d{2}-\d{2})\)/m)
if (!header) {
  console.error(`${FILE} has no "Last checked against: \`<hash>\` (<date>)" line`)
  process.exit(2)
}
const [, hash, date] = header
if (!args.includes('--no-fetch')) git('fetch', '-q', 'origin', 'main')
try {
  git('merge-base', '--is-ancestor', hash, 'origin/main')
} catch {
  console.error(`the checked commit ${hash} is not on origin/main`)
  process.exit(2)
}
const shas = git('log', '--format=%H', `${hash}..origin/main`, '--', DIR).split('\n').filter(Boolean)
const ola = shas.filter((sha) => git('show', '--name-only', '--format=', sha, '--', DIR).split('\n').some((f) => f && f !== FILE))
if (!ola.length) {
  console.log('current')
  process.exit(0)
}
console.log(`stale: ${ola.length} Ola commit${ola.length === 1 ? '' : 's'} since ${date}`)
if (args.includes('--list')) for (const sha of ola) console.log(`  ${git('log', '-1', '--format=%h %s', sha)}`)
process.exit(1)
