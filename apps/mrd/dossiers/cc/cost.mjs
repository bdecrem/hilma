// The cost tests (../COST-TEST.md): runs ONE job through Claude Code on the plan's login and records what it cost.
//
//   node cc/cost.mjs <step> <slug> --chunk <key> (or --fixture f, which names its chunk) --model <id> --effort <low|medium|high|xhigh>
//        [--label text] [--fixture file] [--max-window 85] [--max-week 90] [--to-the-limit] [--dry] [--print-prompt] [--skip-done]
//
// steps: sources | verify | redo   audit.py's prompts (audit.py --emit <phase> --only <chunk> --readonly), model and effort overridden
//        forward | back | timeline history.py's prompts (PLAN.md Parts 3 and 4)
//
// Before and after: the plan's three meters from `claude -p /usage` (no tokens). The session runs the way cc/check.mjs runs it
// (Agent SDK, WebSearch + the `read` MCP tool, structured output). Writes cost/results/<time>-<step>-<chunk>-<model>-<effort>.json
// (a "started" record first, finalized after), appends a row to cost/LOG.md, commits cost/ and pushes through the mini.
// It never writes to a database: no ingest, no dossier_log, no dossier_check_runs; the pages read are logged in the result file.
//
// exit: 0 ok (or skipped), 1 error, 3 cut off by the plan limit, 4 refused (meters above the max, or no subscription)
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join, basename, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOSSIERS = dirname(HERE)
const REPO = resolve(DOSSIERS, '..', '..', '..')
const COST = join(DOSSIERS, 'cost'), RESULTS = join(COST, 'results'), LOG = join(COST, 'LOG.md')
mkdirSync(RESULTS, { recursive: true })

for (const f of [join(DOSSIERS, '..', '.env'), join(REPO, '.env.local')]) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
// the plan, never the API: an API key in the environment would bill the API instead
const childEnv = () => { const e = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'mrd-dossiers-cost/0.1' }; for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) delete e[k]; return e }

// ---- arguments ----
const args = process.argv.slice(2)
const [step, slug] = args
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const flag = k => args.includes(k)
const FIXTURE0 = opt('--fixture') ? resolve(process.cwd(), opt('--fixture')) : null
// a fixture names its own chunk, so --chunk may be left out with --fixture
const CHUNK = opt('--chunk') || (FIXTURE0 && existsSync(FIXTURE0) ? JSON.parse(readFileSync(FIXTURE0, 'utf8')).chunk : undefined), MODEL = opt('--model'), EFFORT = opt('--effort'), LABEL = opt('--label', '')
const FIXTURE = FIXTURE0
const MAX_WINDOW = Number(opt('--max-window', 85)), MAX_WEEK = Number(opt('--max-week', 90))
const TO_LIMIT = flag('--to-the-limit'), DRY = flag('--dry'), PRINT = flag('--print-prompt'), SKIP_DONE = flag('--skip-done')
const STEPS = ['sources', 'verify', 'redo', 'forward', 'back', 'timeline']
const usage = 'usage: node cc/cost.mjs <sources|verify|redo|forward|back|timeline> <slug> --chunk <key> --model <id> --effort <low|medium|high|xhigh> [--label t] [--fixture f] [--max-window 85] [--max-week 90] [--to-the-limit] [--dry] [--print-prompt] [--skip-done]'
if (!STEPS.includes(step) || !slug || !CHUNK || !MODEL || !['low', 'medium', 'high', 'xhigh', 'max'].includes(EFFORT)) { console.error(usage); process.exit(2) }
const JOB_ID = [step, slug, CHUNK, MODEL, EFFORT, LABEL && `label=${LABEL}`, FIXTURE && 'fixture'].filter(Boolean).join(' ')

// what Claude Code says when the plan runs out (apps/pro-usage/report.py LIMIT_RE, kept in step with it)
const LIMIT_RE = /usage limit|limit reached|reached your limit|hit your (?:[\w-]+ )?limit|limit will reset|resets? (?:at )?\d|out of (?:extra )?usage|rate_limit|API Error: 429/i

const stamp = () => new Date().toTimeString().slice(0, 8)
const local = d => d.toLocaleString('sv-SE')               // 2026-11-20 14:03:09, this Mac's time zone
const say = (...a) => console.log(`[${stamp()}]`, ...a)
const run = (cmd, argv, { cwd = DOSSIERS, timeout = 600_000, env = process.env } = {}) => new Promise(res => {
  execFile(cmd, argv, { cwd, maxBuffer: 64 * 1024 * 1024, timeout, env }, (err, stdout, stderr) => res({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr), err }))
})

// ---- the plan's meters: `claude -p /usage` uses no tokens ----
function findClaude() {
  for (const c of [process.env.CLAUDE_BIN, join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']) if (c && existsSync(c)) return c
  return 'claude'
}
async function meters() {
  const at = new Date().toISOString(), dir = mkdtempSync(join(tmpdir(), 'mrd-usage-'))
  const r = await run(findClaude(), ['-p', '/usage', '--output-format', 'json'], { cwd: dir, timeout: 120_000, env: childEnv() })
  rmSync(dir, { recursive: true, force: true })
  let text = ''
  try { text = JSON.parse(r.stdout).result || '' } catch { text = r.stdout + r.stderr }
  const bars = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(.+?):\s*(\d+(?:\.\d+)?)\s*%\s*used(?:\s*[·•-]\s*resets\s*(.+))?/)
    if (m) bars[m[1].trim()] = { pct: Number(m[2]), resets: (m[3] || '').trim() }
  }
  const pick = (...w) => { for (const [k, v] of Object.entries(bars)) if (w.every(x => k.toLowerCase().includes(x))) return v; return null }
  return { at, window: pick('session'), week: pick('week', 'all'), fable: pick('week', 'fable'), subscription: /subscription/i.test(text), bars, text: text.slice(0, 1500) }
}
const pct = m => (m && m.pct != null ? `${m.pct}%` : '?')
const showMeters = (m, tag) => say(`meters ${tag}: window ${pct(m.window)} (resets ${m.window?.resets || '?'}) · week ${pct(m.week)} (resets ${m.week?.resets || '?'}) · Fable week ${pct(m.fable)} (resets ${m.fable?.resets || '?'})${m.subscription ? '' : ' · NOT ON A SUBSCRIPTION'}`)

// ---- the job ----
async function getJob() {
  const path = join(mkdtempSync(join(tmpdir(), 'mrd-cost-')), 'jobs.json')
  let r
  if (FIXTURE || ['forward', 'back', 'timeline'].includes(step)) {
    r = await run('python3', [join(DOSSIERS, 'history.py'), slug, '--emit', step, path, '--chunk', CHUNK, ...(FIXTURE ? ['--fixture', FIXTURE] : [])])
  } else {
    r = await run('python3', [join(DOSSIERS, 'audit.py'), slug, '--emit', step, path, '--only', CHUNK, '--readonly'])
  }
  const msg = (r.stdout.trim() || r.stderr.trim()); if (msg) say(msg.split('\n').slice(-3).join(' | '))
  if (r.code !== 0 || !existsSync(path)) throw new Error(`emit failed (${r.code}): ${r.stderr.slice(-800)}`)
  const P = JSON.parse(readFileSync(path, 'utf8'))
  rmSync(dirname(path), { recursive: true, force: true })
  const job = P.jobs.find(j => j.key === CHUNK)
  if (!job) throw new Error(`no ${step} job for chunk ${CHUNK} (nothing to check there?)`)
  job.default_model = job.model; job.default_effort = job.effort
  job.model = MODEL; job.effort = EFFORT
  return { P, job }
}

function schemaKeys(s) {
  const items = s?.properties && Object.values(s.properties)[0]?.items
  return { top: Object.keys(s?.properties || {}), per_indicator: Object.keys(items?.properties || {}) }
}

// ---- the session (as cc/check.mjs runs it, minus every database write) ----
function readerServer(meta) {
  const readEnv = { ...process.env }
  // compile.py --read never touches the database, but ../laws/lib.py reads these at import
  if (!readEnv.MRD_SUPABASE_URL) { readEnv.MRD_SUPABASE_URL = 'http://unused.invalid'; readEnv.MRD_SUPABASE_SERVICE_KEY = 'unused' }
  return createSdkMcpServer({
    name: 'reader',
    tools: [tool('read', "Fetch a web page or PDF and return its text. Pass `find` (terms separated by ' | ', e.g. 'Artigo 122 | reagrupamento familiar') to get the passages around those terms instead of the start of the document; consolidated codes are long, so always use `find` for article numbers. Blocked or script-only sites are retried in a real browser.",
      { url: z.string(), find: z.string().nullable().describe("terms separated by ' | '"), max_chars: z.number().int().nullable().describe('2000-20000, default 8000') },
      async ({ url, find, max_chars }) => {
        const rec = { at: new Date().toISOString(), url, find: find || null, ok: false, chars: 0 }
        meta.pages.push(rec)
        say(`read   ${url.slice(0, 120)}${find ? ` · find ${find.slice(0, 60)}` : ''}`)
        const argv = [join(DOSSIERS, 'compile.py'), slug, '--read', url, '--max-chars', String(max_chars || 8000)]
        if (find) argv.push('--find', find)
        const { stdout, stderr, code } = await run('python3', argv, { timeout: 240_000, env: readEnv })
        if (code !== 0 && !stdout.trim()) return { content: [{ type: 'text', text: `read failed: ${stderr.slice(-400)}` }], isError: true }
        rec.ok = true; rec.chars = stdout.length
        return { content: [{ type: 'text', text: stdout }] }
      })],
  })
}

async function runSession(job, meta) {
  let output = null
  const q = query({ prompt: job.user, options: {
    model: job.model, effort: job.effort, systemPrompt: job.system,
    tools: job.web ? ['WebSearch'] : [], mcpServers: { reader: readerServer(meta) },
    allowedTools: job.web ? ['WebSearch', 'mcp__reader__read'] : ['mcp__reader__read'],
    permissionMode: 'dontAsk', settingSources: [], persistSession: false,
    outputFormat: { type: 'json_schema', schema: job.schema }, maxTurns: job.max_turns, cwd: tmpdir(), env: childEnv(),
  } })
  try {
    for await (const m of q) {
      if (m.type === 'assistant') {
        meta.calls++
        for (const b of m.message?.content || []) if (b.type === 'tool_use' && b.name === 'WebSearch') { meta.searches.push(String(b.input?.query || '')); say(`search ${String(b.input?.query || '').slice(0, 120)}`) }
      } else if (m.type === 'rate_limit_event') {
        const i = m.rate_limit_info || {}
        meta.rate_limit_events.push(i)
        if (i.status === 'rejected') { meta.limit = true; say(`plan limit: ${JSON.stringify(i)}`) }
      } else if (m.type === 'system' && /limit/i.test(JSON.stringify(m))) {
        meta.limit_lines.push(JSON.stringify(m).slice(0, 500))
      } else if (m.type === 'result') {
        meta.result = { subtype: m.subtype, is_error: m.is_error, num_turns: m.num_turns, duration_ms: m.duration_ms, duration_api_ms: m.duration_api_ms,
          total_cost_usd: m.total_cost_usd, usage: m.usage, modelUsage: m.modelUsage, text: m.result ? String(m.result).slice(0, 2000) : null, errors: m.errors || null }
        if (m.subtype === 'success' && m.structured_output) output = m.structured_output
        else meta.error = `${m.subtype}${m.errors ? ': ' + JSON.stringify(m.errors).slice(0, 400) : ''}${m.result ? ' · ' + String(m.result).slice(0, 400) : ''}`
      }
    }
  } catch (e) { meta.error = String(e.message || e).slice(0, 800) }
  if (!output && LIMIT_RE.test([meta.error, meta.result?.text, ...meta.limit_lines].join('\n'))) meta.limit = true
  return output
}

function tokens(res) {
  const by = {}, t = { input: 0, output: 0, cache_read: 0, cache_write: 0, cost_usd: 0 }
  for (const [m, v] of Object.entries(res?.modelUsage || {})) {
    by[m] = { input: v.inputTokens || 0, output: v.outputTokens || 0, cache_read: v.cacheReadInputTokens || 0, cache_write: v.cacheCreationInputTokens || 0,
      thinking: v.thinkingTokens ?? null, cost_usd: Math.round((v.costUSD || 0) * 10000) / 10000 }
    for (const k of ['input', 'output', 'cache_read', 'cache_write', 'cost_usd']) t[k] += by[m][k]
  }
  if (!Object.keys(by).length && res?.usage) {          // no modelUsage (a crash result): fall back to the main loop's usage
    const u = res.usage; Object.assign(t, { input: u.input_tokens || 0, output: u.output_tokens || 0, cache_read: u.cache_read_input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0 })
  }
  t.total = t.input + t.output + t.cache_read + t.cache_write
  t.cost_usd = Math.round((res?.total_cost_usd ?? t.cost_usd) * 10000) / 10000
  return { totals: t, by_model: by }
}

// ---- the log ----
const HEADER = `# Cost tests: the log

One row per run of \`cc/cost.mjs\` (see \`../COST-TEST.md\`). Dollars are API-equivalent (the SDK's \`total_cost_usd\`); the run itself counts
against the plan, whose meters are read before and after with \`claude -p /usage\`. The full record of each run, answers included, is in \`results/\`.

| time | step | chunk | model | effort | min | turns | out tokens | total tokens | $ API-eq | window % | week % | Fable week % | pages | status | job |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
`
const arrow = (a, b) => `${a?.pct ?? '?'}→${b?.pct ?? '?'}`
function logRow(rec) {
  if (!existsSync(LOG)) writeFileSync(LOG, HEADER)
  const t = rec.tokens?.totals || {}
  const cells = [local(new Date(rec.started_at)).slice(0, 16), rec.step, rec.chunk, rec.model, rec.effort, rec.minutes ?? '', rec.turns ?? '',
    (t.output ?? 0).toLocaleString('en-US'), (t.total ?? 0).toLocaleString('en-US'), (t.cost_usd ?? 0).toFixed(2),
    arrow(rec.meters_before?.window, rec.meters_after?.window), arrow(rec.meters_before?.week, rec.meters_after?.week), arrow(rec.meters_before?.fable, rec.meters_after?.fable),
    rec.pages_read ?? '', rec.status, '`' + rec.job_id + '`']
  appendFileSync(LOG, '| ' + cells.map(c => String(c).replace(/\|/g, '/')).join(' | ') + ' |\n')
}
function doneInLog(id) {
  if (!existsSync(LOG)) return false
  return readFileSync(LOG, 'utf8').split('\n').some(l => l.includes('`' + id + '`') && / \| ok \| `/.test(l))
}

// ---- git: commit cost/ only, push through the mini; a failure here never fails the run ----
async function git(argv) { return run('git', argv, { cwd: REPO, timeout: 120_000 }) }
async function commitAndPush(msg) {
  const rel = 'apps/mrd/dossiers/cost'
  for (let i = 0; i < 20; i++) {
    const a = await git(['add', rel])
    const c = a.code === 0 ? await git(['commit', '-q', '-m', msg, '-m', 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', '--', rel]) : a
    const out = c.stdout + c.stderr
    if (c.code === 0) break
    if (/index\.lock/.test(out)) { await new Promise(r => setTimeout(r, 3000)); continue }
    if (/nothing to commit|no changes added/.test(out)) break
    say(`commit failed: ${out.slice(-300)}`); return
  }
  const push = async () => run('bash', [join(homedir(), '.claude', 'push-via-mini.sh')], { cwd: REPO, timeout: 180_000 })
  await git(['pull', '-q', '--rebase', '--autostash', 'origin', 'main'])   // other machines push to main all day
  let p = await push()
  // the helper ends with `git status -sb`: still "ahead" means the push did not land
  const bad = r => r.code !== 0 || /rejected|non-fast-forward|fetch first|failed to push|\[ahead/i.test(r.stdout + r.stderr)
  if (bad(p)) {
    say(`push failed, rebasing and retrying once: ${(p.stdout + p.stderr).trim().slice(-200)}`)
    await git(['pull', '-q', '--rebase', '--autostash', 'origin', 'main'])
    p = await push()
  }
  say(bad(p) ? `push failed (the commit is local): ${(p.stdout + p.stderr).trim().slice(-200)}` : `pushed: ${(p.stdout).trim().split('\n').pop()}`)
}

// ---- a run killed before it could finish its row (the plan limit closing the process, a reboot) ----
async function finalizeStale() {
  let n = 0
  for (const f of readdirSync(RESULTS).filter(f => f.endsWith('.json'))) {
    const p = join(RESULTS, f)
    let rec; try { rec = JSON.parse(readFileSync(p, 'utf8')) } catch { continue }
    if (rec.status !== 'started' || rec.pid === process.pid) continue
    try { process.kill(rec.pid, 0); continue } catch { /* the process is gone */ }
    rec.status = 'cut off'; rec.finished_at = null
    rec.note = 'the process ended before it could finish this record (plan limit or killed); meters after not read'
    writeFileSync(p, JSON.stringify(rec, null, 1)); logRow(rec); n++
  }
  return n
}

// ---- main ----
async function main() {
  if (SKIP_DONE && doneInLog(JOB_ID)) { say(`already done in cost/LOG.md: ${JOB_ID}`); process.exit(0) }
  const { P, job } = await getJob()
  const m0 = await meters()
  const sk = schemaKeys(job.schema)
  say(`job ${JOB_ID}`)
  say(`${P.country.name} · ${job.label} · q${job.qids.join(', q')} · source ${P.source || 'database'}`)
  say(`model ${job.model} (default ${job.default_model}) · effort ${job.effort} (default ${job.default_effort}) · max turns ${job.max_turns} · tools ${(job.web ? ['WebSearch', 'mcp__reader__read'] : ['mcp__reader__read']).join(', ')}`)
  say(`prompt: system ${job.system.length.toLocaleString('en-US')} chars (~${Math.round(job.system.length / 4).toLocaleString('en-US')} tokens), user ${job.user.length} chars; schema ${JSON.stringify(job.schema).length.toLocaleString('en-US')} chars`)
  say(`schema keys: ${sk.top.join(', ')} → per indicator: ${sk.per_indicator.join(', ')}`)
  showMeters(m0, 'now')
  if (PRINT) console.log(`\n----- system -----\n${job.system}\n\n----- user -----\n${job.user}\n\n----- schema -----\n${JSON.stringify(job.schema, null, 1)}\n`)
  if (DRY) { say('dry: nothing run'); process.exit(0) }

  if (!m0.subscription) { say('refused: Claude Code does not report a subscription; this would bill the API'); process.exit(4) }
  if (!TO_LIMIT) {
    const over = []
    if (m0.window?.pct > MAX_WINDOW) over.push(`window ${m0.window.pct}% > ${MAX_WINDOW}%`)
    if (m0.week?.pct > MAX_WEEK) over.push(`week ${m0.week.pct}% > ${MAX_WEEK}%`)
    if (/fable/i.test(job.model) && m0.fable?.pct > MAX_WEEK) over.push(`Fable week ${m0.fable.pct}% > ${MAX_WEEK}%`)
    if (over.length) { say(`refused: ${over.join(', ')} (pass --to-the-limit to run anyway)`); process.exit(4) }
  }
  const stale = await finalizeStale()
  if (stale) say(`${stale} earlier run(s) that never finished written as cut off`)

  const t0 = new Date()
  const ts = local(t0).replace(/[-:]/g, '').replace(' ', '-')
  const short = MODEL.replace(/^claude-/, '')
  const file = join(RESULTS, `${ts}-${step}-${CHUNK}-${short}-${EFFORT}${LABEL ? '-' + LABEL.replace(/[^\w.-]+/g, '_') : ''}.json`)
  const rec = { status: 'started', job_id: JOB_ID, pid: process.pid, step, slug, chunk: CHUNK, model: MODEL, effort: EFFORT, label: LABEL || null,
    source: P.source || 'database', fixture: FIXTURE ? basename(FIXTURE) : null, country: P.country, qids: job.qids,
    started_at: t0.toISOString(), meters_before: m0, prompt_chars: { system: job.system.length, user: job.user.length }, default_model: job.default_model, default_effort: job.default_effort }
  writeFileSync(file, JSON.stringify(rec, null, 1))

  const meta = { calls: 0, searches: [], pages: [], rate_limit_events: [], limit_lines: [], limit: false, error: null, result: null }
  let finalized = false
  const finalize = async (output, why) => {
    if (finalized) return; finalized = true
    const t1 = new Date()
    rec.finished_at = t1.toISOString(); rec.minutes = Math.round((t1 - t0) / 600) / 100
    rec.meters_after = await meters()
    rec.tokens = tokens(meta.result)
    rec.turns = meta.result?.num_turns ?? null; rec.calls = meta.calls
    rec.duration_ms = meta.result?.duration_ms ?? null; rec.duration_api_ms = meta.result?.duration_api_ms ?? null
    rec.pages_read = meta.pages.length; rec.pages = meta.pages; rec.searches = meta.searches
    rec.rate_limit_events = meta.rate_limit_events; rec.error = meta.error; rec.result_text = meta.result?.text ?? null
    rec.output = output
    rec.status = why || (output ? 'ok' : meta.limit ? 'cut off' : 'error')
    delete rec.pid
    writeFileSync(file, JSON.stringify(rec, null, 1)); logRow(rec)
    showMeters(rec.meters_after, 'after')
    say(`${rec.status} · ${rec.minutes} min · ${rec.turns ?? '?'} turns · ${rec.pages_read} pages · ${meta.searches.length} searches · out ${rec.tokens.totals.output.toLocaleString('en-US')} · total ${rec.tokens.totals.total.toLocaleString('en-US')} tokens · $${rec.tokens.totals.cost_usd.toFixed(2)} API-equivalent${meta.error ? ' · ' + meta.error.slice(0, 200) : ''}`)
    say(`wrote ${file.replace(REPO + '/', '')}`)
    await commitAndPush(`mrd cost test: ${step} ${CHUNK} ${MODEL} ${EFFORT}${LABEL ? ' (' + LABEL + ')' : ''}`)
    return rec.status
  }
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { say(`${sig}: writing the record`); await finalize(null, 'stopped'); process.exit(1) })

  say(`running ${step} on ${CHUNK} with ${MODEL} at ${EFFORT}...`)
  const output = await runSession(job, meta)
  const status = await finalize(output)
  process.exit(status === 'ok' ? 0 : status === 'cut off' ? 3 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
