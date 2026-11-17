#!/usr/bin/env node
// The runner: runs a task set against one named configuration, N seeds each, one fresh folder
// per run, with a time limit and a token limit, and writes one result row per run to SQLite.
//
//   node evals/run.mjs --config configs/glm-5.3-flash.json [--tasks all|a1-survey,b*,easy,skills,skill:chart] [--seeds 1,2]
//        [--skills on|off]  (opencode-ws: Ola's skills offered or denied; see skills/README.md)
//        [--concurrency 3] [--time 600] [--tokens 1500000] [--max-usd 15] [--db results/evals.db] [--dry]
//
// Resumable: a (configuration, task, task version, seed) already in the database is skipped, so
// running the same command again finishes what is left. Safe to stop: Ctrl-C kills every agent
// (its whole process group) and writes nothing for the runs it cut short; they run next time.
// Easy tasks run first, then medium, then hard, so a budget stop leaves the cheap evidence.
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = path.dirname(fileURLToPath(import.meta.url))
const VOCAB = JSON.parse(readFileSync(path.join(here, 'lib/labels.json'), 'utf8'))
const LEVELS = ['easy', 'medium', 'hard']
const RUNNER_VERSION = 2 // 2: workspace harness, follow-up prompts, all_text, retired tasks

// ------------------------------------------------------------------ arguments
const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith('--')) continue
  const k = a.slice(2)
  args[k] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true
}
if (!args.config) {
  console.error('usage: node run.mjs --config configs/<name>.json [--tasks all] [--seeds 1,2] [--concurrency 3] [--time 600] [--tokens 1500000] [--max-usd 15]')
  process.exit(2)
}
const cfgPath = path.resolve(here, args.config)
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
// --skills on|off (opencode-ws only): the same configuration with Ola's skills offered or denied for
// the session, recorded as two configurations (<name>-skills-on, <name>-skills-off) whose settings
// carry the hash of the skills folder, so a score always names the exact skills.
const skillsMode = args.skills === undefined ? null : String(args.skills)
if (skillsMode !== null) {
  if (!['on', 'off'].includes(skillsMode) || cfg.harness !== 'opencode-ws') { console.error('--skills on|off needs an opencode-ws configuration'); process.exit(2) }
  cfg.name = `${cfg.name}-skills-${skillsMode}`
  cfg.skills = skillsMode
  cfg.skills_hash = skillsHash(path.join(here, '../skills'))
}
function skillsHash(dir) {
  const h = createHash('sha256')
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name.startsWith('.') || e.name === '__pycache__') continue
      if (e.isDirectory()) walk(path.join(d, e.name), `${rel}${e.name}/`)
      else if (e.isFile()) h.update(`${rel}${e.name}\0`).update(readFileSync(path.join(d, e.name))).update('\0')
    }
  }
  // the skill folders only, as workspace/ws.mjs skillsHash (the folder's README and check.py are not in the image)
  for (const e of readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory() && !/^[._]/.test(x.name)).sort((a, b) => (a.name < b.name ? -1 : 1))) walk(path.join(dir, e.name), `${e.name}/`)
  return h.digest('hex').slice(0, 16)
}
const seeds = String(args.seeds || '1,2').split(',').map(Number)
const concurrency = Number(args.concurrency || 3)
const timeLimit = Number(args.time || 600)
const tokenLimit = Number(args.tokens || 1_500_000)
const maxUsd = Number(args['max-usd'] || Infinity)
const dbPath = path.resolve(here, args.db || 'results/evals.db')
const runsRoot = path.resolve(here, 'runs')
// Load throttle (round two, on the mini beside live services): a run starts only while the 1-minute
// load average is under --max-load; if it stays over for --load-patience minutes, the runner stops.
const maxLoad = Number(args['max-load'] || 6)
const loadPatience = Number(args['load-patience'] || 15)

// ------------------------------------------------------------------ tasks
const allTasks = readdirSync(path.join(here, 'tasks'))
  .filter((d) => existsSync(path.join(here, 'tasks', d, 'task.json')))
  .map((d) => ({ dir: path.join(here, 'tasks', d), ...JSON.parse(readFileSync(path.join(here, 'tasks', d, 'task.json'), 'utf8')) }))
  .filter((t) => !t.retired || args['with-retired'])
const want = String(args.tasks || 'all').split(',')
const pick = (t) => want.some((w) => w === 'all' || w === t.id || w === t.level || w === t.family || (t.skill && w === `skill:${t.skill}`) || (w.endsWith('*') && t.id.startsWith(w.slice(0, -1))))
const tasks = allTasks.filter(pick).sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.id.localeCompare(b.id))

// ------------------------------------------------------------------ the configuration's identity
function harnessVersion() {
  if (cfg.harness === 'opencode-ws') return 'opencode 2.3.0 in ' + /export const IMAGE = '([^']+)'/.exec(readFileSync(path.join(here, '../workspace/ws.mjs'), 'utf8'))[1]
  if (cfg.harness === 'opencode') return 'opencode ' + JSON.parse(readFileSync(path.join(here, '../node_modules/@opencode/cli/package.json'), 'utf8')).version
  return 'claude-agent-sdk ' + JSON.parse(readFileSync(path.join(here, 'node_modules/@anthropic-ai/claude-agent-sdk/package.json'), 'utf8')).version
}
const settings = Object.fromEntries(Object.entries(cfg).filter(([k]) => !['key_file', 'key_var', 'token_file'].includes(k)))
const hv = harnessVersion()
const configId = cfg.name + '@' + createHash('sha256').update(JSON.stringify({ settings, hv, RUNNER_VERSION, oc: cfg.harness === 'opencode' ? opencodeConfig('X') : cfg.harness === 'opencode-ws' ? readFileSync(path.join(here, '../workspace/opencode.jsonc'), 'utf8') : null })).digest('hex').slice(0, 10)

// ------------------------------------------------------------------ database
mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new DatabaseSync(dbPath)
const inList = (xs) => xs.map((x) => `'${x}'`).join(',')
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS configurations (id TEXT PRIMARY KEY, name TEXT NOT NULL, harness TEXT NOT NULL, harness_version TEXT NOT NULL,
    model TEXT NOT NULL, settings_json TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS results (
    run_id TEXT PRIMARY KEY, config_id TEXT NOT NULL REFERENCES configurations(id), task TEXT NOT NULL, family TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('easy','medium','hard')), honesty INTEGER NOT NULL, task_version INTEGER NOT NULL, seed INTEGER NOT NULL,
    passed INTEGER NOT NULL, checks_passed INTEGER NOT NULL, checks_total INTEGER NOT NULL,
    duration_s REAL NOT NULL, tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, cost_usd REAL NOT NULL,
    requests INTEGER NOT NULL, tool_calls INTEGER NOT NULL, tool_errors INTEGER NOT NULL,
    end_reason TEXT NOT NULL CHECK (end_reason IN (${inList(VOCAB.end_reasons)})),
    failure_label TEXT NOT NULL CHECK (failure_label IN (${inList(VOCAB.failure_labels)})),
    time_limit_s INTEGER NOT NULL, token_limit INTEGER NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS one_result ON results (config_id, task, task_version, seed);
  CREATE TABLE IF NOT EXISTS result_checks (run_id TEXT NOT NULL, check_name TEXT NOT NULL, ok INTEGER NOT NULL,
    label TEXT NOT NULL CHECK (label IN (${inList(VOCAB.failure_labels)})), PRIMARY KEY (run_id, check_name));
  CREATE TABLE IF NOT EXISTS result_tools (run_id TEXT NOT NULL, tool TEXT NOT NULL, calls INTEGER NOT NULL, errors INTEGER NOT NULL, PRIMARY KEY (run_id, tool));
`)
db.prepare('INSERT OR IGNORE INTO configurations VALUES (?,?,?,?,?,?,?)').run(configId, cfg.name, cfg.harness, hv, cfg.model, JSON.stringify(settings), new Date().toISOString())
const done = new Set(db.prepare('SELECT task, task_version, seed FROM results WHERE config_id = ?').all(configId).map((r) => `${r.task}|${r.task_version}|${r.seed}`))
const spentBefore = db.prepare('SELECT COALESCE(SUM(cost_usd),0) AS s FROM results WHERE config_id LIKE ?').get(cfg.name + '@%').s

const queue = []
for (const t of tasks) for (const s of seeds) if (!done.has(`${t.id}|${t.version}|${s}`)) queue.push({ task: t, seed: s })
console.log(`${configId}: ${tasks.length} tasks x ${seeds.length} seeds, ${queue.length} to run (${done.size} already in ${path.relative(process.cwd(), dbPath)}), ` +
  `${concurrency} at a time, ${timeLimit} s and ${tokenLimit.toLocaleString()} tokens per run` + (Number.isFinite(maxUsd) ? `, $${maxUsd} ceiling ($${spentBefore.toFixed(2)} spent before)` : ''))
if (args.dry) process.exit(0)

// ------------------------------------------------------------------ one run
const live = new Set() // children to kill on stop
let stopping = false
let spent = spentBefore
let reserved = 0

function opencodeConfig(base) {
  return {
    $schema: 'https://opencode.ai/config.json',
    providers: { box: { name: 'The box', env: ['BOX_API_KEY'], package: '@opencode/ai/providers/openai-compatible', settings: { baseURL: base },
      models: { m: { modelID: cfg.gateway_model, name: cfg.name, capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: cfg.context, output: cfg.max_output } } } } },
    model: 'box/m',
    update: 'disable',
    permissions: [
      { action: '*', resource: '*', effect: 'allow' },
      { action: 'webfetch', resource: '*', effect: 'deny' },
      { action: 'websearch', resource: '*', effect: 'deny' },
      { action: 'external_directory', resource: '*', effect: 'deny' },
    ],
  }
}

function isolatedEnv(home, extra) {
  return { PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin', HOME: home, TMPDIR: path.join(home, 'tmp'), XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local/share'), XDG_STATE_HOME: path.join(home, '.local/state'), XDG_CACHE_HOME: path.join(home, '.cache'), LANG: 'en_US.UTF-8', ...extra }
}

async function runOpencode(run, prompts) {
  if (prompts.length > 1) throw new Error('the local opencode harness runs one prompt; use opencode-ws for follow-up tasks')
  const instruction = prompts[0]
  writeFileSync(path.join(run.work, 'opencode.jsonc'), JSON.stringify(opencodeConfig(cfg.gateway_url), null, 2))
  const token = readFileSync(path.resolve(here, cfg.token_file), 'utf8').trim()
  const s = { final_text: '', requests: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, tools: {}, errors: 0, end_reason: 'done' }
  const out = createWriteStream(path.join(run.dir, 'events.jsonl'))
  const child = spawn(path.join(here, '../node_modules/.bin/opencode'), ['run', '--standalone', '--auto', '--format', 'json', '--model', 'box/m', instruction], {
    cwd: run.work, env: isolatedEnv(run.home, { BOX_API_KEY: token }), stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  live.add(child)
  const kill = (why) => { if (s.end_reason === 'done') s.end_reason = why; try { process.kill(-child.pid, 'SIGKILL') } catch {} }
  const timer = setTimeout(() => kill('timeout'), timeLimit * 1000)
  let buf = '', texts = [], err = ''
  child.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-20000) })
  child.stdout.on('data', (d) => {
    out.write(d)
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      let e; try { e = JSON.parse(line) } catch { continue }
      const p = e.part || {}
      if (e.type === 'step_finish') {
        s.requests++; s.tokens_in += p.tokens?.input || 0; s.tokens_out += (p.tokens?.output || 0) + (p.tokens?.reasoning || 0)
        if (s.tokens_in + s.tokens_out > tokenLimit) kill('token_limit')
      } else if (e.type === 'step_start') texts = []
      else if (e.type === 'text' && p.text) texts.push(p.text)
      else if (e.type === 'tool_use') {
        const t = (s.tools[p.tool || '?'] ||= { calls: 0, errors: 0 }); t.calls++
        if (p.state?.status === 'error') { t.errors++; s.errors++ }
      } else if (e.type === 'error') { s.saw_error = (e.error?.name || 'error').slice(0, 40) }
      if (texts.length) s.final_text = texts.join('\n')
    }
  })
  const code = await new Promise((r) => child.on('close', (c) => r(c)))
  clearTimeout(timer); live.delete(child); out.end()
  writeFileSync(path.join(run.dir, 'stderr.txt'), err)
  if (s.end_reason === 'done' && (code !== 0 || s.saw_error)) s.end_reason = s.requests === 0 && !s.saw_error ? 'harness_error' : 'model_error'
  if (s.end_reason === 'model_error' && s.final_text && code === 0) s.end_reason = 'done'
  return s
}

let sdk = null
let anthropicKey = null
async function runClaude(run, prompts) {
  sdk ||= await import('@anthropic-ai/claude-agent-sdk')
  if (!anthropicKey) {
    const f = readFileSync(cfg.key_file.replace(/^~/, homedir()), 'utf8')
    const m = f.match(new RegExp(`^${cfg.key_var}=(.*)$`, 'm'))
    if (!m) throw new Error(`${cfg.key_var} not in ${cfg.key_file}`)
    anthropicKey = m[1].trim().replace(/^['"]|['"]$/g, '')
  }
  const s = { final_text: '', requests: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, tools: {}, errors: 0, end_reason: 'done' }
  const ac = new AbortController()
  const timer = setTimeout(() => { s.end_reason = 'timeout'; ac.abort() }, timeLimit * 1000)
  const out = createWriteStream(path.join(run.dir, 'events.jsonl'))
  const ids = new Map()
  const P = cfg.price_per_mtok
  let resume = null
  const texts = []
  try {
   for (const instruction of prompts) {
    if (s.end_reason !== 'done') break
    for await (const m of sdk.query({ prompt: instruction, options: { ...(resume ? { resume } : {}),
      cwd: run.work, model: cfg.model, effort: cfg.effort, systemPrompt: { type: 'preset', preset: 'claude_code' },
      settingSources: [], permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true,
      disallowedTools: ['WebFetch', 'WebSearch'], maxBudgetUsd: cfg.max_usd_per_run, abortController: ac,
      env: isolatedEnv(run.home, { ...(cfg.tool_path ? { PATH: cfg.tool_path } : {}),
        // round two: the agent's shell gets no web (a dead proxy) while the SDK's own API calls go direct
        ...(cfg.dead_proxy ? { HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9', http_proxy: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9', all_proxy: 'http://127.0.0.1:9', NO_PROXY: 'api.anthropic.com', no_proxy: 'api.anthropic.com' } : {}),
        ANTHROPIC_API_KEY: anthropicKey, CLAUDE_CONFIG_DIR: path.join(run.home, '.claude'), DISABLE_AUTOUPDATER: '1',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1' }),
    } })) {
      out.write(JSON.stringify(m) + '\n')
      if (m.type === 'system' && m.subtype === 'init' && m.apiKeySource !== 'ANTHROPIC_API_KEY') {
        s.end_reason = 'harness_error'; s.why = 'not on the evals API key'; ac.abort(); break
      }
      if (m.type === 'assistant') {
        s.requests++
        for (const b of m.message?.content || []) {
          if (b.type === 'tool_use') { ids.set(b.id, b.name); (s.tools[b.name] ||= { calls: 0, errors: 0 }).calls++ }
          if (b.type === 'text' && b.text) texts.push(b.text)
        }
      }
      if (m.type === 'user') for (const b of m.message?.content || []) if (b.type === 'tool_result' && b.is_error) { const t = s.tools[ids.get(b.tool_use_id) || '?']; if (t) t.errors++; s.errors++ }
      if (m.type === 'result') {
        s.final_text = m.result || ''
        resume = m.session_id || resume
        let mine = 0
        for (const u of Object.values(m.modelUsage || {})) {
          s.tokens_in += u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens; s.tokens_out += u.outputTokens
          mine += (u.inputTokens * P.input + u.outputTokens * P.output + u.cacheReadInputTokens * P.cache_read + u.cacheCreationInputTokens * P.cache_write) / 1e6
        }
        s.cost_usd += Math.max(mine, m.total_cost_usd || 0)
        s.turn_requests = (s.turn_requests || 0) + (m.num_turns || 0)
        if (m.subtype === 'error_max_budget_usd') s.end_reason = 'budget_limit'
        else if (m.subtype !== 'success' && s.end_reason === 'done') s.end_reason = m.subtype === 'error_max_turns' ? 'token_limit' : 'model_error'
      }
    }
   }
  } catch (e) {
    if (s.end_reason === 'done') { s.end_reason = 'harness_error'; s.why = String(e?.message || e).slice(0, 200) }
  }
  s.all_text = texts.join('\n\n')
  if (s.turn_requests) s.requests = s.turn_requests
  clearTimeout(timer); out.end()
  return s
}

function label(s, check, task) {
  if (s.end_reason !== 'done' && s.end_reason !== 'model_error' && !check.all) return s.end_reason
  if (check.all) return 'success'
  if (s.end_reason === 'model_error') return 'model_error'
  const failed = check.checks.filter((c) => !c.ok)
  if (failed.some((c) => c.missing)) return s.final_text.trim() ? 'claimed_done_not_done' : 'stopped_early'
  return failed[0]?.label && VOCAB.failure_labels.includes(failed[0].label) ? failed[0].label : 'unknown'
}

const insert = db.prepare(`INSERT INTO results VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
const insertCheck = db.prepare('INSERT INTO result_checks VALUES (?,?,?,?)')
const insertTool = db.prepare('INSERT INTO result_tools VALUES (?,?,?,?)')

async function runOne({ task, seed }) {
  const runId = randomUUID()
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const dir = path.join(runsRoot, cfg.name, `${task.id}-s${seed}-${stamp}`)
  const run = { dir, work: path.join(dir, 'work'), home: path.join(dir, 'home'), gen: path.join(dir, cfg.harness === 'opencode-ws' ? 'inputs' : 'work') }
  for (const d of [run.gen, run.home, path.join(run.home, 'tmp')]) mkdirSync(d, { recursive: true })
  const truth = path.join(dir, 'truth.json') // outside the agent's folder
  const g = spawnSync('python3', [path.join(here, 'lib/task.py'), 'generate', task.dir, run.gen, String(seed), truth], { encoding: 'utf8' })
  if (g.status !== 0) throw new Error(`generate ${task.id}: ${g.stderr.slice(-400)}`)
  const prompts = [readFileSync(path.join(task.dir, 'instruction.md'), 'utf8').trim(), ...(task.followups || []).map((f) => readFileSync(path.join(task.dir, f), 'utf8').trim())]
  const started = new Date()
  const s = cfg.harness === 'opencode' ? await runOpencode(run, prompts) : cfg.harness === 'opencode-ws' ? await runWs(run, prompts) : await runClaude(run, prompts)
  if (stopping) return // cut short: record nothing, it runs again next time
  const duration = (Date.now() - started) / 1000
  writeFileSync(path.join(dir, 'session.json'), JSON.stringify({ final_text: s.final_text, all_text: s.all_text || s.final_text, turns: s.turns }, null, 1))
  const c = spawnSync('python3', [path.join(here, 'lib/task.py'), 'check', task.dir, run.work, truth, path.join(dir, 'session.json')], { encoding: 'utf8', timeout: 300_000 })
  let check
  try { check = JSON.parse(c.stdout.trim().split('\n').pop()) } catch { check = { checks: [], passed: 0, total: 0, all: false } }
  writeFileSync(path.join(dir, 'check.json'), JSON.stringify(check, null, 1))
  const lab = label(s, check, task)
  const toolCalls = Object.values(s.tools).reduce((a, t) => a + t.calls, 0)
  db.exec('BEGIN')
  insert.run(runId, configId, task.id, task.family, task.level, task.honesty ? 1 : 0, task.version, seed, check.all ? 1 : 0, check.passed, check.total,
    Math.round(duration * 10) / 10, s.tokens_in, s.tokens_out, Math.round(s.cost_usd * 10000) / 10000, s.requests, toolCalls, s.errors,
    s.end_reason, lab, timeLimit, tokenLimit, started.toISOString(), new Date().toISOString())
  for (const ch of check.checks) insertCheck.run(runId, ch.name, ch.ok ? 1 : 0, ch.missing ? 'stopped_early' : ch.label)
  for (const [tool, t] of Object.entries(s.tools)) if (/^[A-Za-z0-9_.:-]{1,64}$/.test(tool)) insertTool.run(runId, tool, t.calls, t.errors)
  db.exec('COMMIT')
  spent += s.cost_usd
  console.log(`${check.all ? 'PASS' : 'fail'}  ${task.id.padEnd(22)} seed ${seed}  ${String(check.passed).padStart(2)}/${String(check.total).padEnd(2)} ` +
    `${duration.toFixed(0).padStart(4)} s  ${String(s.tokens_in + s.tokens_out).padStart(8)} tok  ${toolCalls} calls  ${lab}` +
    (s.cost_usd ? `  $${s.cost_usd.toFixed(3)} (total $${spent.toFixed(2)})` : '') + (s.why ? `  [${s.why}]` : ''))
}

process.on('SIGTERM', () => process.emit('SIGINT'))
process.on('SIGINT', () => {
  stopping = true
  console.log('\nstopping: killing the agents; runs cut short are not recorded and will run next time')
  for (const ch of live) try { process.kill(-ch.pid, 'SIGKILL') } catch {}
  setTimeout(() => process.exit(130), wsh ? 120_000 : 500) // workspace runs see `stopping`, interrupt and destroy their VM
})

const perRunCap = cfg.max_usd_per_run || 0
let budgetStop = false
let wsh = null
const freeSlots = []
if (cfg.harness === 'opencode-ws') {
  const { makeWsHarness } = await import('./lib/wsrun.mjs')
  wsh = await makeWsHarness({ home: cfg.ola_home.replace(/^~/, homedir()), gatewayDb: cfg.gateway_db.replace(/^~/, homedir()) })
  freeSlots.push(...cfg.slots.slice(0, concurrency))
}
const liveFlags = { get stopping() { return stopping } }
async function runWs(run, prompts) {
  const slot = freeSlots.shift()
  try { return await wsh.run({ slot, gen: run.gen, work: run.work, dir: run.dir, prompts, timeLimit, tokenLimit, live: liveFlags, skills: skillsMode }) } finally { freeSlots.push(slot) }
}
const { loadavg } = await import('node:os')
let loadStop = false
async function waitForLoad() {
  const t0 = Date.now()
  while (loadavg()[0] > maxLoad && !stopping) {
    if (Date.now() - t0 > loadPatience * 60_000) { loadStop = true; return false }
    await new Promise((r) => setTimeout(r, 30_000))
  }
  return !stopping
}
async function worker() {
  while (queue.length && !stopping && !loadStop) {
    if (!(await waitForLoad())) { console.log(`load stayed over ${maxLoad} for ${loadPatience} min: stopping`); return }
    if (perRunCap && spent + reserved + perRunCap > maxUsd) { budgetStop = true; return }
    const item = queue.shift()
    reserved += perRunCap
    try { await runOne(item) } catch (e) { console.log(`error  ${item.task.id} seed ${item.seed}: ${String(e.message || e).slice(0, 300)}`) }
    reserved -= perRunCap
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
if (budgetStop) console.log(`stopped at the spending ceiling: $${spent.toFixed(2)} spent of $${maxUsd}; ${queue.length} runs not started`)
if (wsh) for (const sl of cfg.slots) await wsh.destroyQuietly(sl)
console.log(`done: ${configId}. Report: node evals/report.mjs`)
