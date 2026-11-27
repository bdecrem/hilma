#!/usr/bin/env node
// The speed check (OLA-456). Bart, Nov 25: "OLA NEEDS TO BE GIVE OR TAKE OPENCODE. SO IT NEEDS TO
// PRODUCE THE THING IN 5 MINUTES". Each request of requests.json (a page, a toy, an app) is made
// twice on this machine's model: once by plain OpenCode (no instructions, no skills, no Ola tools,
// an empty folder: what spike/plain/run-plain.sh does) and once by Ola, typed into app.ola.cx on a
// phone-size screen (web/bart-test.mjs). Ola passes a request when it finishes with a page within
// twice plain OpenCode's time. One failed request fails the run.
//
//   node evals/speed/run.mjs [--only page,toy] [--fresh] [--plain-only] [--after-deploy --changed <file>]
//
// Runs on the test server (or the Studio), as the account that runs Ola. The model and its address
// are the gateway's own (~/.ola/gateway.env: UPSTREAM_BASE_URL and GATEWAY_MODELS general=), so both
// halves use the same model. Plain OpenCode's times are kept a week per model, OpenCode version and
// request (~/ola-speed/plain.json; --fresh measures again): a change to Ola's instructions does not
// change them. Each Ola walk holds the machine's test turn (ops/turn.mjs) and gives it back after.
//
// Result: ~/ola-staging/speed.json (the last run), a line per run in ~/ola-speed/history.log, the
// pages and screenshots in ~/ola-speed/runs/<time>/. Exit 0 all passed, 1 a request failed, 2 broken.
//
// --after-deploy: started by ops/ola.mjs after an update that serves; runs only when the update
// changed Ola's instructions, skills or tools (lib.mjs TRIGGERS; the changed files in --changed).
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { baselineKey, fmt, freshBaseline, judge, olaLimit, overall, shouldRun, upstreamFrom } from './lib.mjs'

const AI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const HOME = homedir()
const DIR = path.join(HOME, 'ola-speed')
const STAMP = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const RUN = path.join(DIR, 'runs', STAMP)
const LATEST = path.join(HOME, 'ola-staging', 'speed.json')
const BASE = path.join(DIR, 'plain.json')
mkdirSync(RUN, { recursive: true })
const say = (m) => console.log(`${new Date().toLocaleTimeString('en-US', { hour12: false })} speed: ${m}`)
const release = (() => {
  try {
    return JSON.parse(readFileSync(path.join(HOME, 'ola-staging/deployed.json'), 'utf8')).commit.slice(0, 12)
  } catch {
    return null
  }
})()

if (args.includes('--after-deploy')) {
  const f = arg('--changed')
  const changed = f && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
  const d = shouldRun(changed)
  say(`${d.run ? 'runs' : 'not run'}: ${d.why}`)
  if (!d.run) process.exit(0)
}

// ---------------------------------------------------------------- the model, the gateway's own
const envFile = path.join(HOME, '.ola/gateway.env')
if (!existsSync(envFile)) (say(`no ${envFile}: this machine runs no Ola`), process.exit(2))
const envText = readFileSync(envFile, 'utf8')
const { baseURL, model } = upstreamFrom(envText)
const KEY = (envText.match(/^UPSTREAM_API_KEY=(.*)$/m)?.[1] ?? '').trim().replace(/^"|"$/g, '')
if (!baseURL || !model) (say('the gateway names no upstream address or no general model'), process.exit(2))
// OpenCode's version: the one in the project image (workspace/ws.mjs IMAGE, ola-workspace:<version>-<n>).
const OC = readFileSync(path.join(AI, 'workspace/ws.mjs'), 'utf8').match(/IMAGE = 'ola-workspace:(\d+\.\d+\.\d+)/)?.[1]
if (!OC) (say('cannot read OpenCode version from workspace/ws.mjs'), process.exit(2))
const OCDIR = path.join(DIR, `oc-${OC}`)
const OCBIN = path.join(OCDIR, 'node_modules/.bin/opencode')
const PATHS = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'

const all = JSON.parse(readFileSync(path.join(AI, 'evals/speed/requests.json'), 'utf8')).requests
const only = arg('--only')?.split(',')
const requests = only ? all.filter((r) => only.includes(r.id)) : all
say(`release ${release ?? '?'}, model ${model}, OpenCode ${OC}, ${requests.length} request(s): ${requests.map((r) => r.id).join(', ')}`)

// ---------------------------------------------------------------- plain OpenCode
function run(cmd, a, opts) {
  return new Promise((res) => {
    const p = spawn(cmd, a, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    const t = opts.timeout ? setTimeout(() => p.kill('SIGTERM'), opts.timeout) : null
    p.on('close', (code) => (t && clearTimeout(t), res({ code, out, err })))
  })
}

async function plain(r) {
  if (!existsSync(OCBIN)) {
    mkdirSync(OCDIR, { recursive: true })
    const i = spawnSync('npm', ['install', '--silent', `@opencode/cli@${OC}`], { cwd: OCDIR, encoding: 'utf8', env: { ...process.env, PATH: PATHS } })
    if (i.status !== 0 || !existsSync(OCBIN)) throw new Error(`OpenCode ${OC} would not install: ${(i.stderr || '').trim().split('\n').pop()}`)
  }
  const dir = path.join(RUN, `plain-${r.id}`)
  const work = path.join(dir, 'work')
  const home = path.join(dir, 'home')
  mkdirSync(work, { recursive: true })
  mkdirSync(home, { recursive: true })
  const config = {
    $schema: 'https://opencode.ai/config.json',
    providers: { box: { name: 'The box', env: ['BOX_API_KEY'], package: '@opencode/ai/providers/openai-compatible', settings: { baseURL }, models: { m: { modelID: model, name: 'plain', capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: 131072, output: 16000 } } } } },
    model: 'box/m',
    update: 'disable',
    permissions: [{ action: '*', resource: '*', effect: 'allow' }, { action: 'external_directory', resource: '*', effect: 'deny' }],
  }
  writeFileSync(path.join(work, 'opencode.jsonc'), JSON.stringify(config, null, 2))
  // Nothing of this machine's own settings: a home of its own, and only PATH and the key passed in.
  // BROWSER and do-nothing stand-ins keep anything from opening a window (rule 46).
  const shim = path.join(dir, 'shim')
  mkdirSync(shim, { recursive: true })
  for (const n of ['open', 'osascript']) writeFileSync(path.join(shim, n), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  const env = { PATH: `${shim}:${PATHS}`, HOME: home, XDG_CONFIG_HOME: `${home}/.config`, XDG_DATA_HOME: `${home}/.local/share`, XDG_STATE_HOME: `${home}/.local/state`, XDG_CACHE_HOME: `${home}/.cache`, BROWSER: '/usr/bin/true', BOX_API_KEY: KEY }
  const t0 = Date.now()
  const p = await run(OCBIN, ['run', '--standalone', '--auto', '--model', 'box/m', r.ask], { cwd: work, env, timeout: 1800_000 })
  const seconds = +((Date.now() - t0) / 1000).toFixed(1)
  writeFileSync(path.join(dir, 'out.txt'), p.out)
  writeFileSync(path.join(dir, 'err.txt'), p.err)
  const pages = readdirSync(work, { recursive: true }).map(String).filter((f) => /\.html?$/i.test(f) && !f.includes('node_modules'))
  return { seconds, exit: p.code, made: p.code === 0 && pages.length > 0, pages: pages.slice(0, 5), at: new Date().toISOString(), dir }
}

// ---------------------------------------------------------------- Ola, the way Bart types it
const TURN = await import(path.join(AI, 'ops/turn.mjs'))
async function ola(r, limit) {
  const tag = randomBytes(3).toString('hex')
  const shots = path.join(RUN, `ola-${r.id}`)
  const held = process.env.OLA_TURN === 'off' ? null : await TURN.acquire({ label: `speed check ${r.id}`, on: (m) => say(`turn: ${m}`) })
  try {
    const env = { ...process.env, OLA_WALK_SSH: process.env.OLA_WALK_SSH || 'local', OLA_WALK_WHO: `speed${r.id}${tag}`, OLA_WALK_ID: `speed-${r.id}-${tag}`, OLA_WALK_NAME: `Speed ${r.kind}`, OLA_WALK_TEAM_NAME: 'Speed check', OLA_TURN_HELD: held ? String(process.pid) : '' }
    const p = await run(process.execPath, [path.join(AI, 'web/bart-test.mjs'), r.ask, '--shots', shots, '--limit', String(limit)], { cwd: AI, env, timeout: (limit + 900) * 1000 })
    writeFileSync(path.join(RUN, `ola-${r.id}.log`), p.out + p.err)
    let res = null
    try {
      res = JSON.parse(readFileSync(path.join(shots, 'result.json'), 'utf8'))
    } catch {}
    if (!res) return { error: `the walk left no result (exit ${p.code}): ${(p.err || p.out).trim().split('\n').pop()?.slice(0, 200)}`, shots }
    return { seconds: res.seconds ?? null, status: res.status ?? null, error: res.error ?? null, page: res.pageName ?? null, asked: res.asked?.length ?? 0, shots }
  } finally {
    held?.release()
  }
}

// ---------------------------------------------------------------- the run
const bases = (() => {
  try {
    return JSON.parse(readFileSync(BASE, 'utf8'))
  } catch {
    return {}
  }
})()
const rows = []
for (const r of requests) {
  const key = baselineKey(model, OC, r.ask)
  let p = bases[key]
  let reused = freshBaseline(p) && !args.includes('--fresh')
  if (!reused) {
    say(`${r.id}: plain OpenCode, "${r.ask}"`)
    try {
      p = await plain(r)
    } catch (e) {
      say(`${r.id}: plain OpenCode broke: ${e.message}`)
      process.exit(2)
    }
    if (p.made) (bases[key] = p), writeFileSync(BASE, JSON.stringify(bases, null, 2))
    say(`${r.id}: plain OpenCode ${p.made ? `made ${p.pages.join(', ')} in ${fmt(p.seconds)}` : `made nothing (exit ${p.exit}, ${fmt(p.seconds)})`}`)
  } else say(`${r.id}: plain OpenCode ${fmt(p.seconds)} (measured ${p.at.slice(0, 16)}, kept)`)
  if (args.includes('--plain-only')) {
    rows.push({ id: r.id, kind: r.kind, ask: r.ask, plain: { seconds: p.seconds, made: p.made, at: p.at, reused }, ola: null, verdict: { pass: null, why: '--plain-only' } })
    continue
  }
  if (!p.made) {
    rows.push({ id: r.id, kind: r.kind, ask: r.ask, plain: { seconds: p.seconds, made: false, at: p.at, reused }, ola: null, verdict: judge(p, null) })
    continue
  }
  say(`${r.id}: Ola, "${r.ask}" (stopped at ${fmt(olaLimit(p.seconds))})`)
  const o = await ola(r, olaLimit(p.seconds))
  const verdict = judge(p, o)
  say(`${r.id}: ${verdict.pass ? 'PASS' : 'FAIL'}: ${verdict.why}${o.asked ? ` (${o.asked} question(s) answered)` : ''}`)
  rows.push({ id: r.id, kind: r.kind, ask: r.ask, plain: { seconds: p.seconds, made: p.made, at: p.at, reused, pages: p.pages }, ola: o, verdict })
}

const pass = args.includes('--plain-only') ? null : overall(rows)
const result = { at: new Date().toISOString(), release, model, opencode: OC, factor: 2, pass, rows, dir: RUN }
writeFileSync(path.join(RUN, 'result.json'), JSON.stringify(result, null, 2))
if (!args.includes('--plain-only') && !only) writeFileSync(LATEST, JSON.stringify(result, null, 2))
const line = `${result.at} ${release ?? '?'} ${model} ${pass === null ? 'MEASURED' : pass ? 'PASS' : 'FAIL'} ${rows.map((x) => `${x.id} ${x.ola?.seconds ? fmt(x.ola.seconds) : '-'} / plain ${fmt(x.plain.seconds)}${x.verdict.pass === false ? ' FAIL' : ''}`).join('; ')}`
appendFileSync(path.join(DIR, 'history.log'), line + '\n')
say(line)
// Each run's plain-OpenCode folders are only evidence; keep the last ten runs.
const runs = readdirSync(path.join(DIR, 'runs')).sort()
for (const old of runs.slice(0, -10)) rmSync(path.join(DIR, 'runs', old), { recursive: true, force: true })
process.exit(pass === false ? 1 : 0)
