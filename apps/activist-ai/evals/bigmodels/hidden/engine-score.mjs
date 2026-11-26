// node engine-score.mjs <formula.mjs> <cases.json>: runs the hidden cases, prints JSON {pass, total, fails}.
// Run inside the run's sandbox (run.mjs): the file under test was written by a model.
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url'
const cases = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
let mod; try { mod = await import(pathToFileURL(path.resolve(process.argv[2])).href) } catch (e) { console.log(JSON.stringify({ pass: 0, total: cases.length, load: String(e).slice(0, 200) })); process.exit(0) }
const fn = mod.computeSheet ?? mod.default
const fails = []; let pass = 0
for (const [cells, want] of cases) {
  let got; try { got = fn(structuredClone(cells)) } catch (e) { got = { __threw: String(e).slice(0, 120) } }
  const ok = got && Object.entries(want).every(([k, v]) => typeof v === 'number' ? (typeof got[k] === 'number' && Math.abs(got[k] - v) < 1e-9) : got[k] === v)
  if (ok) pass++; else fails.push(Object.keys(cells).map((k) => `${k}=${cells[k]}`).join(' ').slice(0, 80))
}
console.log(JSON.stringify({ pass, total: cases.length, fails }))
