#!/usr/bin/env node
// The bigger models that fit the Mac Studio, on work a person would ask for (OLA-482; Bart, voice
// call Nov 26: "a variety of challenges ... build a website, build a spreadsheet, then I can see
// those"). The tickets of our own tracker are the other half: tickets/trial.mjs with the same model
// names (tickets/models.json, `studio-*`).
//
//   node evals/bigmodels/run.mjs --model studio-nemotron-3.5-super [--tasks website,data] [--time 900]
//   node evals/bigmodels/run.mjs --report
//
// One run: plain opencode (Ola's version, no instruction file, no skills, nothing of Ola's around
// it) in an empty folder holding only the task's files, in the ticket lane's sandbox (tickets/lib.mjs:
// the home folder out of reach, network loopback only), through the ticket lane's gateway for that
// model (tickets/gateway.sh <model>). After it stops the result is scored by a program and one line
// goes to ~/ola-trials/big/results.jsonl. Whatever was made stays in the run's folder for a person
// to open: ~/ola-trials/big/<model>/<task>-<time>/work, with shot.png and shot-phone.png beside it.
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, cpSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { root, MODELS, runFolders, opencodeConfig, runOpencode, gatewayToken, sandboxed, freeGb, MIN_FREE_GB } from '../../tickets/lib.mjs'
import { findPage } from '../apps/lib/harness.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const big = path.join(root, 'big')
const results = path.join(big, 'results.jsonl')
const TASKS = JSON.parse(readFileSync(path.join(here, 'tasks.json'), 'utf8'))
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
  if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return a
}, []))

if (args.report) { report(); process.exit(0) }
const model = String(args.model || '')
if (!args.score && (!MODELS[model] || model.startsWith('_'))) { console.error('--model <a name in tickets/models.json> required'); process.exit(2) }
const tasks = args.tasks ? String(args.tasks).split(',').map((id) => TASKS.find((t) => t.id === id) || die(`unknown task ${id}`)) : TASKS
const timeLimit = Number(args.time || 900)
function die(m) { console.error(m); process.exit(2) }

// Only what a browser needs, and never a file that starts a server: the app check (evals/apps) runs a
// server it finds, and this one would be a model's code outside the sandbox.
function pageCopy(work, to) {
  const walk = (d, rel, depth) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'opencode.jsonc') continue
      const f = path.join(d, e.name), r = path.join(rel, e.name)
      if (e.isDirectory()) { if (depth < 3) walk(f, r, depth + 1); continue }
      if (!/\.(html?|css|js|mjs|json|svg|png|jpe?g|gif|webp|woff2?|ico|txt)$/i.test(e.name) || statSync(f).size > 8e6) continue
      if (/\.(js|mjs)$/i.test(e.name) && /createServer|express\(|\.listen\(|Bun\.serve|fastify|hono|child_process|require\(['"]fs|from ['"]node:/.test(readFileSync(f, 'utf8'))) continue
      mkdirSync(path.dirname(path.join(to, r)), { recursive: true }); copyFileSync(f, path.join(to, r))
    }
  }
  mkdirSync(to, { recursive: true }); walk(work, '', 0)
}

const node = (argv, opts = {}) => execFileSync(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, timeout: 300000, ...opts }).toString()

async function inSandbox(run, argv, ms = 60000) {
  const c = sandboxed(run, argv)
  let o = ''
  c.stdout.on('data', (d) => { o += d }); c.stderr.on('data', (d) => { o += d })
  const t = setTimeout(() => { try { process.kill(-c.pid, 'SIGKILL') } catch {} }, ms)
  await new Promise((r) => c.on('close', r)); clearTimeout(t)
  return o
}

// Each scorer returns { pass, total, checks: [{name, pass}], notes }.
const SCORE = {
  // evals/apps' own check for that request: it uses the page the way a person does.
  async app(task, run) {
    const page = path.join(run.dir, 'page'); pageCopy(run.work, page)
    let r
    try { r = JSON.parse(node([path.join(here, '../apps/run.mjs'), 'check', task.id, page, '--shot', path.join(run.dir, 'shot.png')])) }
    catch (e) { return { pass: 0, total: 1, checks: [{ name: 'the check ran', pass: false }], notes: [String(e.stderr || e.message).slice(-300)] } }
    await phoneShot(run, page)
    return { pass: r.checks.filter((c) => c.pass).length, total: r.checks.length, checks: r.checks, notes: r.notes }
  },
  // A website has no right answer: the program checks that it is there and says what was asked, and
  // takes the two pictures Bart judges the look from.
  async site(task, run) {
    const page = path.join(run.dir, 'page'); pageCopy(run.work, page)
    const got = await look(page, path.join(run.dir, 'shot.png'), { width: 1280, height: 800 })
    const phone = await look(page, path.join(run.dir, 'shot-phone.png'), { width: 390, height: 844 })
    const checks = [
      { name: 'there is a page', pass: !!got },
      ...task.says.map((re) => ({ name: `says ${re}`, pass: !!got && new RegExp(re, 'i').test(got.text) })),
      { name: 'a contact form with name, email and message and a button', pass: !!got && got.form },
      { name: 'no script error', pass: !!got && !got.errors.length },
      { name: 'fits a phone without scrolling sideways', pass: !!phone && phone.scrollWidth <= 392 },
    ]
    return { pass: checks.filter((c) => c.pass).length, total: checks.length, checks, notes: got?.errors?.slice(0, 3) || [] }
  },
  async data(task, run) {
    const truth = JSON.parse(readFileSync(path.join(here, 'hidden/data-truth.json'), 'utf8'))
    let g = null
    try { g = JSON.parse(readFileSync(path.join(run.work, 'answers.json'), 'utf8')) } catch {}
    const hoods = Object.fromEntries(Object.entries(g?.dues_by_neighborhood || {}).map(([k, v]) => [String(k).trim().toLowerCase(), Number(v)]))
    const th = Object.fromEntries(Object.entries(truth.dues_by_neighborhood).map(([k, v]) => [k.toLowerCase(), v]))
    const checks = [
      { name: 'answers.json is there and is JSON', pass: !!g },
      { name: `joined in 2026 (${truth.joined_2026})`, pass: g?.joined_2026 === truth.joined_2026 },
      { name: 'dues per neighborhood (4 neighborhoods, the same name merged)', pass: Object.keys(hoods).length === 4 && Object.entries(th).every(([k, v]) => Math.abs((hoods[k] ?? -1) - v) < 0.01) },
      { name: `median dues of active members (${truth.median_dues_active})`, pass: Number(g?.median_dues_active) === truth.median_dues_active },
      { name: `emails that appear more than once (${truth.duplicate_emails.length})`, pass: JSON.stringify((g?.duplicate_emails || []).map((e) => String(e).toLowerCase()).sort()) === JSON.stringify(truth.duplicate_emails) },
    ]
    return { pass: checks.filter((c) => c.pass).length, total: checks.length, checks, notes: g ? [`got: joined ${g.joined_2026}, ${Object.keys(hoods).length} neighborhoods, median ${g.median_dues_active}, ${(g.duplicate_emails || []).length} duplicates`] : ['no answers.json'] }
  },
  // The model's file is run, so the scorer runs in the run's sandbox, with the hidden cases put there only now.
  async engine(task, run) {
    const s = path.join(run.dir, 'score'); mkdirSync(s, { recursive: true })
    for (const f of ['engine-score.mjs', 'engine-cases.json']) copyFileSync(path.join(here, 'hidden', f), path.join(s, f))
    const o = await inSandbox(run, [process.execPath, path.join(s, 'engine-score.mjs'), path.join(run.work, 'formula.mjs'), path.join(s, 'engine-cases.json')])
    let r; try { r = JSON.parse(o.trim().split('\n').pop()) } catch { r = { pass: 0, total: 28, load: o.slice(-200) } }
    return { pass: r.pass, total: r.total, checks: [{ name: `the 28 hidden cases (it started at 16)`, pass: r.pass === r.total }], notes: r.load ? [r.load] : (r.fails || []).slice(0, 6) }
  },
}

// Open the folder's page in headless Chromium (the web app's Playwright, as evals/apps does), over
// file://, with every request that is not a file refused: a model's page reaches nothing.
async function look(folder, shot, viewport) {
  const file = findPage(folder)
  if (!file) return null
  const require = createRequire(path.join(here, '../../web/package.json'))
  const { chromium } = require('playwright')
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 })
    await ctx.route((u) => !String(u).startsWith('file:'), (r) => r.abort())
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)))
    await page.goto('file://' + file, { waitUntil: 'load', timeout: 20000 }).catch((e) => errors.push('load: ' + String(e.message).slice(0, 100)))
    await page.waitForTimeout(800)
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    return await page.evaluate(() => ({
      text: document.body?.innerText || '',
      scrollWidth: document.documentElement.scrollWidth,
      form: !!document.querySelector('input[type=email], input[name*=mail i], input[id*=mail i]') && !!document.querySelector('textarea') && document.querySelectorAll('input, textarea').length >= 3 && !!document.querySelector('button, input[type=submit]'),
    })).then((r) => ({ ...r, errors }))
  } finally { await browser.close() }
}
const phoneShot = (run, page) => look(page, path.join(run.dir, 'shot-phone.png'), { width: 390, height: 844 }).catch(() => null)

async function one(task) {
  const free = freeGb()
  if (free < MIN_FREE_GB) throw new Error(`only ${free.toFixed(1)} GB free on this disk`)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const run = runFolders(path.join(big, model, `${task.id}-${stamp}`))
  if (task.files) cpSync(path.join(here, 'files', task.files), run.work, { recursive: true })
  writeFileSync(path.join(run.work, 'opencode.jsonc'), JSON.stringify(opencodeConfig(model), null, 2))
  console.log(`start ${task.id} on ${model} in ${path.relative(root, run.dir)}`)
  const t0 = Date.now()
  const s = await runOpencode(run, task.request, { timeLimit, tokenLimit: Infinity, model, token: gatewayToken() })
  const minutes = +((Date.now() - t0) / 60000).toFixed(1)
  let score
  try { score = await SCORE[task.kind](task, run) } catch (e) { score = { pass: 0, total: 1, checks: [{ name: 'the scorer ran', pass: false }], notes: [String(e.message).slice(0, 300)] } }
  const row = { at: new Date().toISOString(), task: task.id, kind: task.kind, level: task.level, model, build: MODELS[model].build, passed: score.total > 0 && score.pass === score.total, pass: score.pass, total: score.total, checks: score.checks, notes: score.notes,
    end: s.end, error: s.error, minutes, requests: s.requests, tokens_in: s.tokens_in, tokens_cached: s.tokens_cached || 0, tokens_out: s.tokens_out, tools: s.tools, tool_errors: s.tool_errors, final: (s.final || '').slice(0, 600), dir: path.relative(root, run.dir) }
  appendFileSync(results, JSON.stringify(row) + '\n')
  console.log(`${row.passed ? 'PASS' : 'FAIL'} ${task.id} on ${model}: ${score.pass}/${score.total}; ${s.end}, ${minutes} min, ${s.requests} calls, ${s.tokens_out} tokens written`)
}

function report() {
  if (!existsSync(results)) return console.log('no results yet')
  const rows = readFileSync(results, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const by = {}
  for (const r of rows) (by[r.model] ||= []).push(r)
  for (const [m, rs] of Object.entries(by)) {
    console.log(`${m}: ${rs.filter((r) => r.passed).length} of ${rs.length} passed, ${rs.reduce((a, r) => a + r.minutes, 0).toFixed(0)} min`)
    for (const r of rs) console.log(`   ${r.passed ? 'pass' : 'FAIL'} ${r.task} ${r.pass}/${r.total} ${r.end} ${r.minutes} min, ${r.requests} calls`)
  }
}

// --score <task> --folder <a work folder>: score what is there, no model (the scorers' own test, and a rescore).
if (args.score) {
  const task = TASKS.find((t) => t.id === args.score) || (console.error('unknown task'), process.exit(2))
  const dir = path.join('/tmp', `bigscore-${task.id}-${Date.now()}`)
  const run = runFolders(dir); cpSync(path.resolve(String(args.folder)), run.work, { recursive: true })
  const r = await SCORE[task.kind](task, run)
  console.log(`${task.id}: ${r.pass}/${r.total}`, JSON.stringify(r.checks.filter((c) => !c.pass).map((c) => c.name)), JSON.stringify(r.notes || []).slice(0, 300), dir)
  process.exit(0)
}
mkdirSync(big, { recursive: true })
for (const t of tasks) { try { await one(t) } catch (e) { console.error(`error ${t.id} on ${model}: ${e.message}`) } }
report()
