#!/usr/bin/env node
// Fix one PDF with the pipeline, from any machine that has it installed, under a
// daily cap on what the model calls may cost. The pipeline itself is private
// (apps/venture/private/pdf-desk/run.py --url; it writes original.pdf, fixed.pdf,
// transcript.txt, the checker's reports and result.json into the folder and judges
// the result by its pass rule). This wrapper exists so the unattended runner, which
// may only run `node scripts/venture/*`, can fix a document a customer sent, and
// so no run, attended or not, can spend without a limit.
//
//   node scripts/venture/fix.mjs <url-or-file> <folder under apps/venture/private/> [--org "City of X"] [--max-pages N] [--twice] [--customer <slug>]
//   node scripts/venture/fix.mjs --spent           what today's runs cost, on every machine together
//
// The cap: FIX_CAP_USD a day (default 3), counted in venture_state key "fix_spend"
// so the terminal session and the runner share it. Before a run the cost is
// estimated at 10 cents a page (measured: 5 to 12 cents on agendas); a run that
// would pass the cap is refused, and so is a document over --max-pages (default 60)
// unless the flag raises it.
//
// Passing the machine rule is not the same as being right. The pipeline writes a
// list `to_read` into result.json: places where the result rests on a single model
// answer or looks odd (a numbered series tagged two ways, a link with no text,
// readings that replace the page's characters). A document is READY only when it
// passes and that list holds nothing but figure descriptions. `--twice` fixes the
// document a second time from nothing (into <folder>/_second, at the same cost
// again) and compares the two transcripts, figure descriptions aside: the direct
// test of whether the result depends on the day.
// Exit code 0 = READY (passes, nothing to read, and with --twice both runs agree),
// 3 = passes but must be read by a terminal session before it goes anywhere,
// 1 = does not pass (the folder says why), 2 = refused or failed to run.
//
// A paying customer's documents are counted apart: `--customer <slug>` uses that
// customer's own cap for the month and page limit per document, read from
// apps/venture/private/data/customers.json ({ "<slug>": { "name": "...",
// "monthly_cap_usd": 150, "max_pages": 1200 } }). Only a terminal session adds a
// customer to that file, when someone has actually ordered; a slug that is not in
// it is refused, so the unattended runner cannot widen its own limit.
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

const argv = process.argv.slice(2)
const customerSlug = argv.includes('--customer') ? argv[argv.indexOf('--customer') + 1] : null
let customer = null
if (customerSlug) {
  const file = join(priv, 'data/customers.json')
  customer = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8'))[customerSlug] : null
  if (!customer?.monthly_cap_usd) stop(`"${customerSlug}" is not a customer in apps/venture/private/data/customers.json (a terminal session adds one when someone has ordered)`)
}
// the period and the limit that apply: the day's general cap, or this customer's month
const period = customer ? today.slice(0, 7) : today
const stateKey = customer ? `fix_spend:${customerSlug}` : 'fix_spend'
const LIMIT = customer ? Number(customer.monthly_cap_usd) : CAP
const per = customer ? `this month for ${customer.name ?? customerSlug}` : 'today'
async function spent() {
  const s = (await getState(db, stateKey))?.value
  return s?.date === period ? s : { date: period, usd: 0, runs: 0 }
}

const args = process.argv.slice(2)
if (args[0] === '--spent') {
  const s = await spent()
  console.log(`${s.date}: $${s.usd.toFixed(2)} in ${s.runs} run(s); the cap is $${LIMIT.toFixed(2)} ${customer ? 'a month for this customer' : 'a day'}`)
  process.exit(0)
}
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const [src, folder] = args.filter((a, i) => !a.startsWith('--') && !['--org', '--max-pages', '--customer'].includes(args[i - 1]))
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
const maxPages = Number(opt('--max-pages', customer?.max_pages ?? 60))
if (pages > maxPages) stop(`${pages} pages is over the limit of ${maxPages} for one run; pass --max-pages ${pages} to allow it (about $${(pages * PER_PAGE).toFixed(2)})`)
const before = await spent()
const estimate = pages * PER_PAGE
if (before.usd + estimate > LIMIT) stop(`refused: $${before.usd.toFixed(2)} already spent ${per} and this document (${pages} pages, about $${estimate.toFixed(2)}) would pass the cap of $${LIMIT.toFixed(2)}. ${customer ? 'Raise monthly_cap_usd in customers.json in a terminal session if that is intended.' : 'Set FIX_CAP_USD higher in a terminal session if that is intended.'}`)

const twice = args.includes('--twice')
if (twice && before.usd + 2 * estimate > LIMIT) stop(`refused: fixing it twice (about $${(2 * estimate).toFixed(2)}) would pass the cap of $${LIMIT.toFixed(2)}; $${before.usd.toFixed(2)} already spent ${per}`)
const fixInto = (d) => {
  const o = spawnSync(py, ['-I', run, '--url', file, '--dir', d, '--org', opt('--org', '')], { cwd: join(priv, 'pdf-desk'), encoding: 'utf8', timeout: 50 * 60e3, maxBuffer: 64e6 })
  let res = null
  try { res = JSON.parse(o.stdout.trim().split('\n').pop()) } catch {}
  return { o, res }
}
const { o: out, res: first } = fixInto(dir)
let r = first
// count the cost whatever happened: a failed run has usually paid for its pages
let cost = r?.cost_this_run_usd ?? (out.status === 0 ? 0 : estimate)
// what the transcript says, without its three header lines and without figure descriptions (a model's wording, new on every run)
const said = (d) => (existsSync(join(d, 'transcript.txt')) ? readFileSync(join(d, 'transcript.txt'), 'utf8').split('\n').slice(3).filter((l) => !/^\s*Figure Alt=/.test(l)) : null)
let disagree = null
if (twice && r?.after_pass) {
  const second = fixInto(join(dir, '_second'))
  cost += second.res?.cost_this_run_usd ?? estimate
  const a = said(dir), b = said(join(dir, '_second'))
  if (!second.res?.after_pass) disagree = 'the second run does not pass'
  else if (!a || !b) disagree = 'a transcript is missing'
  else {
    const n = Math.max(a.length, b.length), diff = []
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff.push(i)
    if (diff.length) disagree = `${diff.length} line(s) differ, first at line ${diff[0] + 4}: ${JSON.stringify((a[diff[0]] ?? '').trim().slice(0, 80))} / ${JSON.stringify((b[diff[0]] ?? '').trim().slice(0, 80))}`
  }
}
const now = await spent()
await setState(db, stateKey, { date: period, usd: Math.round((now.usd + cost) * 1e4) / 1e4, runs: now.runs + 1 })
if (!r) stop(`the pipeline did not finish: ${(out.stderr || out.stdout).trim().split('\n').slice(-3).join(' | ')}`)
if (/^https?:\/\//.test(src)) {
  // keep where it came from beside the result
  const { writeFileSync } = await import('node:fs')
  const p = join(dir, 'result.json')
  if (existsSync(p)) writeFileSync(p, JSON.stringify({ ...JSON.parse(readFileSync(p, 'utf8')), url: src }, null, 1))
}
const resultFile = join(dir, 'result.json')
const toRead = (existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')).to_read : null) ?? []
const points = toRead.filter((t) => !/figure description/.test(t))
if (disagree) points.unshift(`fixed twice, and the two results differ: ${disagree}`)
const ready = r.after_pass && !points.length
console.log(`${!r.after_pass ? 'DOES NOT PASS' : ready ? 'READY' : 'PASSES, READ FIRST'}  ${pages} page(s)  $${cost.toFixed(2)}  ${dir}`)
console.log(r.verdict ?? r.error ?? '')
if (r.after_pass && twice && !disagree) console.log('fixed twice from nothing: the two transcripts agree (figure descriptions aside)')
for (const t of points.slice(0, 12)) console.log(`  to read: ${t}`)
if (points.length > 12) console.log(`  … and ${points.length - 12} more in result.json`)
console.log(`${per} so far: $${(now.usd + cost).toFixed(2)} of $${LIMIT.toFixed(2)}`)
process.exit(!r.after_pass ? 1 : ready ? 0 : 3)
