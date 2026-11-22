// OLA-300: the board marks a ticket Ola built (a commit the hand-off made) and counts them per day.
// Offline: the pattern against the hand-off's real commit message (81b9772e, OLA-351) and a Kit
// commit, and the day's count. Run: npx tsx scripts/venture/ola-built-test.ts
import { execFileSync } from 'node:child_process'
import { closedOn, olaModel } from '../../src/lib/venture/board'

let pass = 0
let fail = 0
const ok = (name: string, cond: boolean) => (cond ? pass++ : fail++, console.log(`${cond ? 'pass' : 'FAIL'} ${name}`))
const body = (sha: string) => execFileSync('git', ['log', '-1', '--format=%b', sha], { encoding: 'utf8' })

ok("the hand-off's commit (81b9772e) reads as Ola's, with its model", olaModel(body('81b9772e')) === 'moonshotai/Kimi-K3.1-Pro')
ok("a builder's commit (c679f252) does not", olaModel(body('c679f252')) === null)
ok('the words in the middle of a line do not count', olaModel('Lead: not Built by Ola on x') === null)
const issues = [
  { status: 'done' as const, day: '2026-11-21', builtBy: { by: 'ola' as const, model: 'm' } },
  { status: 'done' as const, day: '2026-11-21', builtBy: null },
  { status: 'dropped' as const, day: '2026-11-21', builtBy: null },
  { status: 'done' as const, day: '2026-11-20', builtBy: { by: 'ola' as const, model: 'm' } },
]
const c = closedOn(issues, '2026-11-21')
ok('the day counts done tickets only, and Ola\'s among them', c.closed === 2 && c.ola === 1)
console.log(`${pass} of ${pass + fail}`)
process.exit(fail ? 1 : 0)
