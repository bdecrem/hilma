#!/usr/bin/env node
// Fix one PDF with the pipeline, from any machine that has it installed, under a
// daily cap on what the model calls may cost. The pipeline itself is private
// (apps/venture/private/pdf-desk/run.py --url; it writes original.pdf, fixed.pdf,
// transcript.txt, the checker's reports and result.json into the folder and judges
// the result by its pass rule). This wrapper exists so the unattended runner, which
// may only run `node scripts/venture/*`, can fix a document a customer sent, and
// so no run, attended or not, can spend without a limit.
//
//   node scripts/venture/fix.mjs <url-or-file> <folder under apps/venture/private/> [--org "City of X"] [--max-pages N]
//   node scripts/venture/fix.mjs --spent           what today's runs cost, on every machine together
//
// The cap: FIX_CAP_USD a day (default 3), counted in venture_state key "fix_spend"
// so the terminal session and the runner share it. Before a run the cost is
// estimated at 10 cents a page (measured: 5 to 12 cents on agendas); a run that
// would pass the cap is refused, and so is a document over --max-pages (default 60)
// unless the flag raises it. Exit code 0 = fixed and passes, 1 = fixed but does not
// pass (the folder says why), 2 = refused or failed to run.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { getState, setState } from './_state.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const priv = join(root, 'apps/venture/private')
const env = Object.fromEntries(
  readFileSync(root + '.env.local', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const CAP = Number(process.env.FIX_CAP_USD ?? 3)
const PER_PAGE = 0.1
const today = new Date().toLocaleDateString('en-CA')
const stop = (m) => { console.error(m); process.exit(2) }

async function spent() {
  const s = (await getState(db, 'fix_spend'))?.value
  return s?.date === today ? s : { date: today, usd: 0, runs: 0 }
}

const args = process.argv.slice(2)
if (args[0] === '--spent') {
  const s = await spent()
  console.log(`${s.date}: $${s.usd.toFixed(2)} in ${s.runs} run(s); the cap is $${CAP.toFixed(2)} a day`)
  process.exit(0)
}
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const [src, folder] = args
if (!src || !folder || folder.startsWith('--')) stop('usage: fix.mjs <url-or-file> <folder under apps/venture/private/> [--org "…"] [--max-pages N] | --spent')
const dir = resolve(priv, folder)
if (!dir.startsWith(priv + '/')) stop(`the folder must be inside ${priv}`)
const py = join(priv, 'pdf-proof/.venv/bin/python')
const run = join(priv, 'pdf-desk/run.py')
if (!existsSync(py) || !existsSync(run)) stop('the PDF pipeline is not installed on this machine (pdf-proof/.venv and pdf-desk/run.py under the private folder)')

// how long is it? (to estimate the cost before spending anything)
let file = src
if (/^https?:\/\//.test(src)) {
  const res = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) stop(`could not download ${src}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.subarray(0, 5).toString() !== '%PDF-') stop(`${src} is not a PDF (it starts with ${JSON.stringify(buf.subarray(0, 12).toString())})`)
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  file = join(mkdtempSync(join(tmpdir(), 'fix-')), 'original.pdf')
  writeFileSync(file, buf)
} else if (!existsSync(src)) stop(`no such file: ${src}`)
else file = resolve(src) // the pipeline runs from its own folder
const count = spawnSync(py, ['-I', '-c', 'import sys, pikepdf; print(len(pikepdf.open(sys.argv[1]).pages))', file], { encoding: 'utf8' })
const pages = Number(count.stdout.trim())
if (!pages) stop(`could not open the PDF: ${count.stderr.trim().split('\n').pop()}`)
const maxPages = Number(opt('--max-pages', 60))
if (pages > maxPages) stop(`${pages} pages is over the limit of ${maxPages} for one run; pass --max-pages ${pages} to allow it (about $${(pages * PER_PAGE).toFixed(2)})`)
const before = await spent()
const estimate = pages * PER_PAGE
if (before.usd + estimate > CAP) stop(`refused: $${before.usd.toFixed(2)} already spent today and this document (${pages} pages, about $${estimate.toFixed(2)}) would pass the cap of $${CAP.toFixed(2)}. Set FIX_CAP_USD higher in a terminal session if that is intended.`)

const out = spawnSync(py, ['-I', run, '--url', file, '--dir', dir, '--org', opt('--org', '')], { cwd: join(priv, 'pdf-desk'), encoding: 'utf8', timeout: 50 * 60e3, maxBuffer: 64e6 })
let r = null
try { r = JSON.parse(out.stdout.trim().split('\n').pop()) } catch {}
// count the cost whatever happened: a failed run has usually paid for its pages
const cost = r?.cost_this_run_usd ?? (out.status === 0 ? 0 : estimate)
const now = await spent()
await setState(db, 'fix_spend', { date: today, usd: Math.round((now.usd + cost) * 1e4) / 1e4, runs: now.runs + 1 })
if (!r) stop(`the pipeline did not finish: ${(out.stderr || out.stdout).trim().split('\n').slice(-3).join(' | ')}`)
if (/^https?:\/\//.test(src)) {
  // keep where it came from beside the result
  const { writeFileSync } = await import('node:fs')
  const p = join(dir, 'result.json')
  if (existsSync(p)) writeFileSync(p, JSON.stringify({ ...JSON.parse(readFileSync(p, 'utf8')), url: src }, null, 1))
}
console.log(`${r.after_pass ? 'PASS' : 'DOES NOT PASS'}  ${pages} page(s)  $${cost.toFixed(2)}  ${dir}`)
console.log(r.verdict ?? r.error ?? '')
console.log(`today so far: $${(now.usd + cost).toFixed(2)} of $${CAP.toFixed(2)}`)
process.exit(r.after_pass ? 0 : 1)
