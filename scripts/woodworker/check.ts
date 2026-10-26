// Proves every room in src/app/woodworker/lib/levels.ts: the start is legal,
// it is not already solved, and its par is the solver's true minimum.
//   npx tsx scripts/woodworker/check.ts
import { solve } from '../../src/app/woodworker/lib/engine'
import { LEVELS } from '../../src/app/woodworker/lib/levels'
import { rulesFor } from '../../src/app/woodworker/lib/rules'

let bad = 0
for (const L of LEVELS) {
  const R = rulesFor(L)
  const t = Date.now()
  const path = solve(R, L.start)
  const ok = !!path && path.length === L.par && path.length > 0
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${L.id.padEnd(10)} par ${L.par}  solver ${path ? path.length : 'none'}  ${Date.now() - t} ms`)
}
process.exit(bad ? 1 : 0)
