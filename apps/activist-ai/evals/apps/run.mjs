#!/usr/bin/env node
// App problems: real "build me ..." requests, run the way the Mac app's Local session runs them,
// then checked by a program that uses what was built the way a person would. See README.md.
//
//   node run.mjs run <problem> <ola|claude> [--time 900]   run, check, record
//   node run.mjs check <problem> <folder> [--shot file]   check any folder, print sub-checks
//   node run.mjs recheck                                  check every recorded run again
//   node run.mjs selftest [problem]                       empty folder and wrong fixture fail, good passes
//   node run.mjs report                                   rebuild results/results.md
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkFolder } from './lib/harness.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// A private problem set (OLA-157): OLA_APP_PROBLEMS_DIR=<dir> reads problems.json, checks/, fixtures/
// and writes results/ there instead, for problems made from a real project's requests (the drafts
// of `frontdesk/admin.mjs switches tasks`), which stay on the machine and never enter this repo.
const SET = process.env.OLA_APP_PROBLEMS_DIR ? path.resolve(process.env.OLA_APP_PROBLEMS_DIR) : HERE
if (SET !== HERE && SET.startsWith(path.resolve(HERE, '../../../..') + path.sep)) die('OLA_APP_PROBLEMS_DIR is inside the repo; a private problem set lives outside it')
const PROBLEMS = JSON.parse(fs.readFileSync(path.join(SET, 'problems.json'), 'utf8'))
const RESULTS = path.join(SET, 'results')
const RUNS = path.join(os.homedir(), 'Library/Caches/ola-eval/runs-apps')
const OLA = path.join(os.homedir(), 'Library/Caches/ola-eval/Ola.app/Contents/MacOS/Ola')
const TOKEN = path.join(os.homedir(), 'Library/Caches/ola-eval/model-token')
export const COLUMNS = {
  ola: 'open weights (Nemotron 3.5 Super VL)',
  'ola-noex': 'open weights, no worked example (OLA-181)',
  claude: 'Claude Code',
  local: 'local',
}

// Do-nothing `open`, `xdg-open` and `osascript`, so a model that tries to show what it built opens
// nothing.
function standIns(dir) {
  fs.mkdirSync(dir, { recursive: true })
  for (const n of ['open', 'xdg-open', 'osascript']) fs.writeFileSync(path.join(dir, n), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  return dir
}

function leftovers(dir) {
  const r = spawnSync('lsof', ['-a', '-d', 'cwd', '-Fpn'], { encoding: 'utf8' })
  const out = []; let pid = null
  for (const l of (r.stdout || '').split('\n')) {
    if (l.startsWith('p')) pid = Number(l.slice(1))
    else if (l.startsWith('n') && l.slice(1).startsWith(dir + '/') && pid !== process.pid) out.push(pid)
  }
  return [...new Set(out)]
}

const problem = (id) => PROBLEMS.find((p) => p.id === id) || die(`no problem ${id}`)
function die(m) { console.error(m); process.exit(2) }
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt }

async function runOne(id, column) {
  const p = problem(id)
  if (!['ola', 'ola-noex', 'claude'].includes(column)) die('column: ola, ola-noex (Ola with no worked example, OLA-181) or claude')
  // Nothing a run does may open a window on this Mac's screen. The Claude fallback sets its own
  // PATH (ClaudeRunner.swift: ~/.local/bin first), so the stand-ins below cannot reach it; a
  // 2026-11-18 Claude run opened its game in the browser with `open`. Refused until that is solved.
  if (column === 'claude' && !process.argv.includes('--can-open-windows')) die('the claude column can open windows on this screen (its PATH cannot be guarded); see README')
  const limit = Number(arg('--time', 900))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(RUNS, `${id}-${column}-${stamp}`)
  const work = path.join(dir, 'work'), support = path.join(dir, 'support')
  fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(support, { recursive: true })
  // Only plain settings reach the run: none of this shell's keys or tokens.
  const keep = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM', '__CF_USER_TEXT_ENCODING']
  const env = {
    ...Object.fromEntries(keep.filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
    OLA_DEFAULTS_SUITE: `cx.ola.eval.apps.${id}.${column}.${stamp.replace(/-/g, '')}`,
    OLA_SUPPORT_DIR: support,
    OLA_MODEL_TOKEN_FILE: TOKEN,
    OLA_MODEL_URL: 'http://127.0.0.1:14311/v1',
    BROWSER: '/usr/bin/true',
    // The without-examples column of OLA-181's measure: the ola-examples plugin adds nothing.
    ...(column === 'ola-noex' ? { OLA_EXAMPLES: 'off' } : {}),
  }
  env.PATH = `${standIns(path.join(support, 'bin'))}:${env.PATH}`
  const request = column === 'claude' ? `/claude ${p.request}` : p.request
  const log = path.join(dir, 'transcript.txt')
  const t0 = Date.now()
  let code
  if (column === 'claude') {
    // A terminal is needed: Claude Code's writes ask first; pty-run answers "Always allow".
    code = await new Promise((res) => {
      const c = spawn('python3', [path.join(HERE, 'lib/pty-run.py'), log, String(limit), '--', OLA, '--cli', request], { cwd: work, env, stdio: 'ignore' })
      c.on('exit', (x) => res(x))
    })
  } else {
    // No terminal, like a run nobody is watching: Ola goes ahead with lots of permissions.
    code = await new Promise((res) => {
      const out = fs.openSync(log, 'a')
      const c = spawn(OLA, ['--cli', request], { cwd: work, env, stdio: ['ignore', out, out] })
      // The app builds the agent's PATH itself, starting with support/web-tools, which it empties
      // and fills at start: the stand-ins go in there once it is filled.
      const tools = path.join(support, 'web-tools')
      const guard = setInterval(() => { if (fs.existsSync(path.join(tools, 'ola-search')) && !fs.existsSync(path.join(tools, 'open'))) { standIns(tools); fs.appendFileSync(log, '') } }, 200)
      c.on('exit', () => clearInterval(guard))
      const timer = setTimeout(() => { fs.appendFileSync(log, '\n[run.mjs] time limit\n'); c.kill('SIGINT'); setTimeout(() => c.kill('SIGKILL'), 5000) }, limit * 1000)
      c.on('exit', (x) => { clearTimeout(timer); res(x) })
    })
  }
  const seconds = Math.round((Date.now() - t0) / 1000)
  // What the run left behind (a model often starts its server and leaves it running): every
  // process whose working folder is inside this run's folder, stopped by its id.
  const left = leftovers(dir)
  for (const pid of left) { try { process.kill(pid, 'SIGTERM') } catch {} }
  if (left.length) fs.appendFileSync(log, `\n[run.mjs] stopped ${left.length} process(es) the run left running\n`)
  const timedOut = seconds >= limit - 1
  const model = column.startsWith('ola') ? 'Nemotron 3.5 Super VL' : (process.env.ANTHROPIC_MODEL || 'Claude Code default model')
  const meta = { problem: id, column, model, date: new Date().toISOString().slice(0, 10), started: stamp, seconds, exit: code, timedOut, dir }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
  return record(meta)
}

async function record(meta) {
  const p = problem(meta.problem)
  const shot = path.join(meta.dir, 'built.png')
  const lastMessage = fs.existsSync(path.join(meta.dir, 'transcript.txt')) ? fs.readFileSync(path.join(meta.dir, 'transcript.txt'), 'utf8').slice(-4000) : ''
  const r = await checkFolder(p, path.join(meta.dir, 'work'), { shot, lastMessage })
  const out = {
    problem: meta.problem, column: meta.column, model: meta.model || (meta.column.startsWith('ola') ? 'Nemotron 3.5 Super VL' : null), date: meta.date, seconds: meta.seconds, timedOut: meta.timedOut,
    page: r.page, checks: r.checks, passed: r.checks.filter((c) => c.pass).length, total: r.checks.length,
    pass: r.checks.every((c) => c.pass), failure: meta.timedOut ? 'timeout' : (r.checks.find((c) => !c.pass)?.name || 'success'),
    notes: r.notes, screenshot: fs.existsSync(shot) ? shot : null, run: meta.dir,
  }
  fs.mkdirSync(RESULTS, { recursive: true })
  fs.writeFileSync(path.join(RESULTS, `${meta.problem}.${meta.column}.json`), JSON.stringify(out, null, 2) + '\n')
  console.log(`${meta.problem} / ${meta.column}: ${out.passed} of ${out.total}, ${out.failure} (${meta.seconds}s)`)
  report()
  return out
}

function report() {
  const rows = ['| Problem | ' + Object.values(COLUMNS).join(' | ') + ' |', '|---|' + Object.keys(COLUMNS).map(() => '---').join('|') + '|']
  for (const p of PROBLEMS) {
    const cells = Object.keys(COLUMNS).map((c) => {
      if (c === 'local') return 'from Dec, when the Studio serves the model'
      const f = path.join(RESULTS, `${p.id}.${c}.json`)
      if (!fs.existsSync(f)) return c === 'claude' ? 'not run (Claude runs capped at four problems)' : 'not run'
      const r = JSON.parse(fs.readFileSync(f, 'utf8'))
      return `${r.passed} of ${r.total}, ${r.pass ? 'pass' : 'fail'}${r.pass ? '' : ` (${r.failure})`}, ${r.seconds < 90 ? `${r.seconds} s` : `${Math.round(r.seconds / 60)} min`}${c === 'claude' && r.model ? `, ${r.model}` : ''}`
    })
    rows.push(`| ${p.id}${p.source === 'real' ? ' (real request)' : ''} | ${cells.join(' | ')} |`)
  }
  const reqs = PROBLEMS.map((p) => `- **${p.id}**: "${p.request}"`).join('\n')
  const md = `# App problems: results\n\nOne run per cell, scored by the problem's check (passed sub-checks of all; the name in brackets is the first one that failed). Rebuilt by \`node run.mjs report\`. The Claude Code column ran on Bart's default model that day (Ola's \`/claude\` passes none). Screenshots and the built folders are on the iMac under \`~/Library/Caches/ola-eval/runs-apps/\`.\n\n${rows.join('\n')}\n\nThe requests, word for word:\n\n${reqs}\n`
  fs.writeFileSync(path.join(RESULTS, 'results.md'), md)
}

async function selftest(only) {
  let bad = 0
  for (const p of PROBLEMS.filter((x) => !only || x.id === only)) {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'apps-empty-'))
    const cases = [['empty', empty, false]]
    for (const [k, want] of [['wrong', false], ['good', true]]) {
      const d = path.join(SET, 'fixtures', p.id, k)
      if (fs.existsSync(d)) cases.push([k, d, want])
      else { console.log(`${p.id}: no fixture ${k}`); bad++ }
    }
    for (const [k, d, want] of cases) {
      const r = await checkFolder(p, d, {})
      const ok = r.checks.every((c) => c.pass)
      const line = r.checks.map((c) => `${c.pass ? '+' : '-'}${c.name}`).join(' ')
      console.log(`${ok === want ? 'ok  ' : 'BAD '} ${p.id} ${k}: ${r.checks.filter((c) => c.pass).length}/${r.checks.length} ${line}`)
      if (ok !== want) bad++
    }
  }
  process.exit(bad ? 1 : 0)
}

const [cmd, a, b] = process.argv.slice(2)
if (cmd === 'run') await runOne(a, b)
else if (cmd === 'check') {
  const r = await checkFolder(problem(a), path.resolve(b), { shot: arg('--shot') })
  console.log(JSON.stringify(r, null, 2))
} else if (cmd === 'recheck') {
  // The latest finished run per problem and column (run folders sort by time).
  const latest = {}
  for (const d of fs.readdirSync(RUNS).sort()) {
    const m = path.join(RUNS, d, 'meta.json')
    if (!fs.existsSync(m)) continue
    const meta = JSON.parse(fs.readFileSync(m, 'utf8'))
    if (!a || a === meta.problem) latest[`${meta.problem}.${meta.column}`] = meta
  }
  for (const meta of Object.values(latest)) await record(meta)
} else if (cmd === 'selftest') await selftest(a)
else if (cmd === 'report') report()
else die('usage: run.mjs run|check|recheck|selftest|report')
