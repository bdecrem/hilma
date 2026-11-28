#!/usr/bin/env node
// The night town (OLA-527). Bart, Nov 27: "I really want interesting shit to happen all night long when I sleep tonight ...
// little things get built, they get evaluated. If they work, we keep going." A town in one web page grows on the Mac Studio:
// each round Qwen (the mayor) hands out a few small, different jobs; Inkmini agents build them three at a time, each in
// its own copy; a script with a headless browser judges each change and keeps what works; every job leaves a line in
// journal.jsonl. See README.md.
//   node apps/night-town/town.mjs night [--until 07:00 | --minutes 30] [--jobs 6] [--fresh]
//   node apps/night-town/town.mjs status | report | stop
// NIGHT_TOWN_DIR (default ~/night-town) holds the town (a git repository), the runs, the journal and the screenshots.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, cpSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { homedir } from 'node:os'

const here = path.dirname(new URL(import.meta.url).pathname)
const repo = path.resolve(here, '../..')
const NT = process.env.NIGHT_TOWN_DIR || path.join(homedir(), 'night-town')
const TOWN = path.join(NT, 'town'), RUNS = path.join(NT, 'runs'), SHOTS = path.join(NT, 'shots')
const JOURNAL = path.join(NT, 'journal.jsonl'), LOG = path.join(NT, 'night.log'), PIDF = path.join(NT, 'night.pid'), STOPF = path.join(NT, 'STOP')
const BM = path.join(repo, 'apps/activist-ai/ops/studio/big-model.sh')
const BUILDER = 'studio-inkling-2-mini', MAYOR = 'Qwen3.8-Flash-Next (studio)'
const ENV = { TICKETS_WEEKLY_TOKENS: '2000000000', GATEWAY_TOTAL_TIMEOUT_MS: '2400000', GATEWAY_FIRST_BYTE_TIMEOUT_MS: '1800000', GATEWAY_READ_TIMEOUT_MS: '600000' }

const [cmd, ...rest] = process.argv.slice(2)
const args = Object.fromEntries(rest.reduce((a, x, i, all) => { if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]); return a }, []))
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' }).slice(0, 19)
const log = (m) => { const l = `${stamp()} ${m}`; console.log(l); try { appendFileSync(LOG, l + '\n') } catch {} }
const sh = (c, cwd) => { const r = spawnSync('/bin/sh', ['-c', c], { cwd, encoding: 'utf8', maxBuffer: 64 << 20 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') } }
const q = (p) => JSON.stringify(p)
const journal = () => existsSync(JOURNAL) ? readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) : []
const running = () => { if (!existsSync(PIDF)) return false; try { process.kill(Number(readFileSync(PIDF, 'utf8')), 0); return true } catch { return false } }

// ---------------------------------------------------------------- the town folder
function regenIndex(dir) {
  const parts = readdirSync(path.join(dir, 'parts')).filter((f) => f.endsWith('.js') && f !== 'index.js').sort()
  writeFileSync(path.join(dir, 'parts/index.js'), `window.TOWN_PARTS = ${JSON.stringify(parts)}\n`)
  return parts
}
function freshTown() {
  if (existsSync(NT) && readdirSync(NT).some((f) => f !== 'tools')) {
    const old = path.join(path.dirname(NT), `${path.basename(NT)}-before-${stamp().replace(/[: ]/g, '-')}`)
    mkdirSync(old); for (const f of readdirSync(NT)) if (f !== 'tools') sh(`mv ${q(path.join(NT, f))} ${q(old)}/`)
    console.log(`the last town moved to ${old}`)
  }
  mkdirSync(RUNS, { recursive: true }); mkdirSync(SHOTS, { recursive: true })
  cpSync(path.join(here, 'seed'), TOWN, { recursive: true })
  regenIndex(TOWN)
  sh('git init -q && git add -A && git -c user.name=town -c user.email=town@localhost commit -qm "the seed: ground, a road, three houses, six people"', TOWN)
}
const partsList = () => readdirSync(path.join(TOWN, 'parts')).filter((f) => f.endsWith('.js') && f !== 'index.js').sort()
  .map((f) => { const t = readFileSync(path.join(TOWN, 'parts', f), 'utf8'); return { file: `parts/${f}`, line: (t.match(/^\/\/\s*(.*)/) || [, '(no description line)'])[1].slice(0, 160), lines: t.split('\n').length } })
const keptChecks = () => JSON.parse(readFileSync(path.join(TOWN, 'checks.json'), 'utf8'))

// ---------------------------------------------------------------- the judge (a headless browser, no model)
let browser = null
async function getBrowser() {
  if (browser && browser.isConnected()) return browser
  const req = createRequire(path.join(homedir(), 'night-town-tools/'))
  let pw; try { pw = req('playwright') } catch { pw = createRequire(path.join(NT, 'tools/'))('playwright') }
  browser = await pw.chromium.launch({ headless: true })
  return browser
}
const within = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what}: no answer in ${ms / 1000} s`)), ms))])
async function openTown(dir) {
  const b = await getBrowser(), page = await b.newPage({ viewport: { width: 960, height: 640 } }), errors = []
  page.on('pageerror', (e) => errors.push(`page error: ${String(e.message).slice(0, 200)}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`) })
  await within(page.goto(`file://${dir}/index.html?test`), 20000, 'load')
  await within(page.waitForFunction(() => window.town && window.town.started, null, { timeout: 15000 }), 16000, 'start').catch((e) => errors.push(`did not start: ${e.message.slice(0, 120)}`))
  return { page, errors }
}
async function closePage(page) { try { await within(page.close(), 5000, 'close') } catch { try { await browser.close() } catch {} browser = null } }
// One check in a fresh page: true, or the reason it is not.
async function runCheck(dir, body) {
  const { page, errors } = await openTown(dir)
  try {
    if (errors.length) return `the page did not load cleanly: ${errors[0]}`
    const r = await within(page.evaluate((b) => { try { const v = (new Function('town', b))(window.town); return { v: v === true, got: JSON.stringify(v)?.slice(0, 80), errs: window.town.errors.slice(0, 2) } } catch (e) { return { v: false, got: `threw ${e.message}`.slice(0, 160), errs: window.town.errors.slice(0, 2) } } }, body), 30000, 'check')
    if (r.errs.length) return `town.errors: ${r.errs.join('; ')}`
    if (errors.length) return errors[0]
    return r.v ? true : `returned ${r.got}`
  } catch (e) { return e.message.slice(0, 200) } finally { await closePage(page) }
}
// The whole judgment of one town folder. Returns { ok, kind, lines }.
async function judge(dir, checks, own) {
  regenIndex(dir)
  const lines = []
  let r
  try {
    const { page, errors } = await openTown(dir)
    try {
      r = await within(page.evaluate(() => { window.town.advance(48); window.town.draw(); const c = document.getElementById('town').getContext('2d').getImageData(0, 0, 960, 640).data; const seen = new Set(); for (let i = 0; i < c.length; i += 397 * 4) seen.add(`${c[i]},${c[i + 1]},${c[i + 2]}`); return { colors: seen.size, errs: window.town.errors.slice(0, 3) } }), 60000, 'two days')
    } catch (e) { errors.push(e.message.slice(0, 200)) } finally { await closePage(page) }
    if (errors.length) { lines.push(`load and two days: ${errors.slice(0, 3).join(' | ')}`); return { ok: false, kind: 'error on load', lines } }
    if (r.errs.length) { lines.push(`town.errors after two days: ${r.errs.join(' | ')}`); return { ok: false, kind: 'error while running', lines } }
    lines.push(`load and two days: clean, ${r.colors} colors in the frame`)
    if (r.colors < 4) return { ok: false, kind: 'blank frame', lines }
  } catch (e) { lines.push(`browser: ${e.message.slice(0, 200)}`); return { ok: false, kind: 'judge error', lines } }
  if (own) { const v = await runCheck(dir, own); lines.push(`its own check: ${v === true ? 'true' : v}`); if (v !== true) return { ok: false, kind: 'its own check false', lines } }
  const c0 = Date.now()
  for (const k of checks) { const v = await runCheck(dir, k.check); if (v !== true) { lines.push(`earlier check "${k.name}": ${v}`); return { ok: false, kind: 'broke an earlier check', lines } } }
  lines.push(`${checks.length} earlier checks still true (${((Date.now() - c0) / 1000).toFixed(1)} s)`)
  return { ok: true, kind: 'kept', lines }
}
async function screenshot(round) {
  regenIndex(TOWN)
  try {
    const { page } = await openTown(TOWN)
    await within(page.evaluate(() => { window.town.advance(9 + 24); window.town.draw() }), 60000, 'shot')
    await page.screenshot({ path: path.join(SHOTS, `round-${String(round).padStart(3, '0')}-day.png`) })
    await within(page.evaluate(() => { window.town.advance(8); window.town.draw() }), 60000, 'shot')
    await page.screenshot({ path: path.join(SHOTS, `round-${String(round).padStart(3, '0')}-night.png`) })
    await closePage(page)
  } catch (e) { log(`screenshot failed: ${e.message.slice(0, 160)}`) }
}
async function townReading() {
  try {
    const { page, errors } = await openTown(TOWN)
    const s = await within(page.evaluate(() => { window.town.advance(24 + 8); return window.town.summary() }), 60000, 'reading')
    await closePage(page)
    return { ...s, pageErrors: errors.slice(0, 3) }
  } catch (e) { return { error: e.message.slice(0, 200) } }
}

// ---------------------------------------------------------------- the mayor (Qwen, one chat call)
function mayorPrompt(n, reading, recent) {
  const parts = partsList().map((p) => `- ${p.file} (${p.lines} lines): ${p.line}`).join('\n')
  return `You are the mayor of a little town that grows all night in one web page. Little agents (a small coding model, Inkling 2 Mini) build what you ask, one job each, side by side, each in its own copy. A script then opens the page in a browser and keeps a job only if the page has no errors, the job's check returns true, and every check of every job kept before still returns true. Failed jobs are thrown away.

THE TOWN'S API (the builders get this too):
${readFileSync(path.join(TOWN, 'TOWN.md'), 'utf8')}

THE PARTS NOW (one file each):
${parts}

THE TOWN AFTER A SIMULATED DAY (town.summary()):
${JSON.stringify(reading).slice(0, 3000)}

THE LAST JOBS AND WHAT HAPPENED:
${recent || '(none yet: this is the first round)'}

${pace()}

Hand out exactly ${n} small, DIFFERENT jobs. Rules:
- Small steps: one building, one behavior, or one visible thing per job. A builder has about 8 minutes.
- Each job is a NEW part (a new file parts/<name>.js) or a change to ONE named existing part. Jobs in the same round must touch different files.
- Favor what makes the town more alive to watch: things that move, change between day and night, react to each other. Build on what exists.
- Vary the kinds of job across the round (we are learning what the builder is good and bad at).
- A failed job must not come back in the same words: make it smaller or say it differently.
- The check is the body of a JavaScript function given \`town\`, run in the page after the town started (time is day 1, 06:00). It must return true ONLY if the thing really happens: call town.advance(hours) first if it needs time, then test state (buildings, people, events, town.state.parts.<name>), not just that a part is registered. Keep it short and deterministic. Do not use the DOM or pixels. It must not hinge on one lucky random draw: give it enough time, and test "at least one" or "more than", not exact counts of random things.
- Each job is built and judged alone, in a copy of the town as it is now: its check must not depend on another job of this round.
- Never put anything on a road tile; leave the roads as they are.
- Use only the API above. Never ask for a change to core.js or index.html.

Answer with JSON only, no other text:
{"note": "one or two sentences: what you are going for this round",
 "jobs": [{"name": "short-name", "kind": "building|behavior|people|visual|sky|interaction|system", "file": "parts/<name>.js", "change": "new|edit", "what": "two or three sentences of what to build", "check": "function body that returns true"}]}`
}
// How bold the next round should be, from how the last one went (the town should evolve, not repeat one size of job all night).
function pace() {
  const js = journal(); if (!js.length) return 'This is the first round: start with simple, visible things.'
  const last = js.filter((j) => j.round === js[js.length - 1].round), kept = last.filter((j) => j.verdict === 'kept').length
  const share = kept / last.length
  return `Last round ${kept} of ${last.length} jobs were kept. ` + (share >= 0.8 ? 'That is too easy: make this round a little bolder. Ask for things that use what other parts made (people visiting the new buildings, parts reacting to each other\'s events), a behavior with two or three steps, or something the townspeople do together. Still one file per job.'
    : share <= 0.4 ? 'That is too hard: make this round smaller and plainer, one clear thing per job.' : 'Keep about this size, and try one bolder job.')
}
async function askMayor(prompt) {
  const key = readFileSync(path.join(homedir(), '.ola/bigmodel.key'), 'utf8').trim()
  const t0 = Date.now()
  const res = await fetch('http://127.0.0.1:8090/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'big', messages: [{ role: 'user', content: prompt }], max_tokens: 14000, reasoning_effort: 'low' }), signal: AbortSignal.timeout(20 * 60000) })
  const j = await res.json()
  const m = j.choices?.[0]?.message || {}
  const text = m.content || ''
  return { text, reasoning: m.reasoning_content || m.reasoning || '', usage: j.usage || null, seconds: Math.round((Date.now() - t0) / 1000), status: res.status }
}
function parseJobs(text, n) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i), s = fence ? fence[1] : text
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b < a) throw new Error('no JSON object in the answer')
  const j = JSON.parse(s.slice(a, b + 1))
  if (!Array.isArray(j.jobs) || !j.jobs.length) throw new Error('no jobs in the answer')
  const seen = new Set(), jobs = []
  for (const x of j.jobs) {
    if (!x || !x.name || !x.what || !x.check) continue
    const file = /^parts\/[a-z0-9_-]+\.js$/i.test(x.file || '') ? x.file : `parts/${String(x.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.js`
    if (seen.has(file) || ['parts/index.js'].includes(file)) continue
    seen.add(file)
    jobs.push({ name: String(x.name).slice(0, 60), kind: String(x.kind || 'other').toLowerCase(), file, change: existsSync(path.join(TOWN, file)) ? 'edit' : 'new', what: String(x.what), check: String(x.check), asked: x })
  }
  if (!jobs.length) throw new Error('no usable job in the answer')
  return { note: j.note || '', jobs: jobs.slice(0, n) }
}

// ---------------------------------------------------------------- a builder (Inkmini in opencode, its own copy)
async function build(lib, token, round, job, i) {
  const dir = path.join(RUNS, `r${String(round).padStart(3, '0')}-${i + 1}-${job.file.slice(6, -3)}`)
  const run = lib.runFolders(dir), { work } = run
  cpSync(TOWN, work, { recursive: true, filter: (s) => !s.includes('/.git') })
  writeFileSync(path.join(work, 'job-check.js'), job.check + '\n')
  writeFileSync(path.join(work, 'opencode.jsonc'), JSON.stringify(lib.opencodeConfig(BUILDER, { lean: true, steps: 40 }), null, 2))
  writeFileSync(path.join(work, '.gitignore'), 'opencode.jsonc\njob-check.js\n')
  sh('git init -q && git add -A && git -c user.name=t -c user.email=t@l commit -qm base && git tag base', work)
  const where = job.change === 'edit' ? `Change only the file ${job.file}.` : `Write it as one new file, ${job.file}.`
  const text = `This folder is a little town drawn in a web page: core.js (do not change it), index.html (do not change it) and one feature per file in parts/. TOWN.md is the whole API: read it first. Look at parts/people.js as an example of a part.

Your job, "${job.name}": ${job.what}

${where} Do not change core.js, index.html, check.js, checks.json or any other part.

It is judged in a browser: the page must load and run two days with no error, and this check (in job-check.js) must return true:
${job.check}
Every check already in checks.json must stay true.

Run \`node check.js job-check.js\` to try it without a browser. Search before reading; read files in parts of at most 200 lines. When it passes, stop and say in one sentence what you built.`
  const t0 = Date.now()
  let s
  try { s = await lib.runOpencode(run, text, { timeLimit: 480, tokenLimit: Infinity, model: BUILDER, token, lean: true }) } catch (e) { s = { end: `harness error: ${e.message}`.slice(0, 120), requests: 0, tokens_in: 0, tokens_cached: 0, tokens_out: 0, final: '' } }
  const minutes = +((Date.now() - t0) / 60000).toFixed(1)
  sh('git add -A', work)
  const files = sh('git diff --cached --name-only base', work).out.split('\n').filter((f) => f && f !== 'parts/index.js')
  const diff = sh(`git diff --cached base -- . ':!parts/index.js'`, work).out
  writeFileSync(path.join(dir, 'change.diff'), diff)
  return { dir, work, run: s, minutes, files, diff, text }
}

// ---------------------------------------------------------------- the night
async function night() {
  if (running()) { console.error(`a night is already running (pid ${readFileSync(PIDF, 'utf8')})`); process.exit(1) }
  if (args.fresh || !existsSync(TOWN)) freshTown()
  mkdirSync(RUNS, { recursive: true }); mkdirSync(SHOTS, { recursive: true })
  rmSync(STOPF, { force: true }); writeFileSync(PIDF, String(process.pid))
  const N = Number(args.jobs || 6), AT_ONCE = 3
  const end = args.minutes ? Date.now() + Number(args.minutes) * 60000 : nextTime(args.until || '07:00')
  const left = () => end - Date.now()
  process.env.TICKETS_WEEKLY_TOKENS = ENV.TICKETS_WEEKLY_TOKENS
  Object.assign(process.env, ENV)
  const lib = await import(path.join(repo, 'apps/activist-ai/tickets/lib.mjs'))
  log(`night starts: until ${new Date(end).toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' })}, ${N} jobs a round, ${AT_ONCE} at once; town ${TOWN}`)
  let gwPid = null, mayorFails = 0, stopping = null
  const bm = (a) => { const r = spawnSync(BM, a, { encoding: 'utf8', env: { ...process.env, ...ENV } }); return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() } }
  const ownModelBack = () => {
    let r = bm(['back']); if (/answering again/.test(r.out) || /own model: loaded/.test(bm(['status']).out)) return true
    log(`Ola's own model did not come back: ${r.out.slice(-200)}; trying once more`); r = bm(['back'])
    return /answering again/.test(r.out)
  }
  const finish = (why) => {
    log(`night ends: ${why}`)
    const st = bm(['status']).out
    if (!/own model: loaded/.test(st) || !/no big model is running/.test(st)) ownModelBack()
    if (gwPid) { try { process.kill(gwPid) } catch {} }
    log(bm(['status']).out.replace(/\n/g, '; '))
    try { browser && browser.close() } catch {}
    rmSync(PIDF, { force: true })
  }
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { finish(`signal ${sig}`); process.exit(1) })
  // A crash anywhere (a page event, a stray promise) still ends with Ola's own model loaded; exit 3 tells start.sh to go on.
  for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, (e) => { finish(`crash (${ev}): ${String(e && e.stack || e).split('\n').slice(0, 3).join(' ')}`); process.exit(3) })
  const free = () => { let n = 0; while (sh('pgrep -f "before-after.mjs|runner.mjs|ola.mjs deploy|three.mjs|write-tests.mjs|batch.mjs run" >/dev/null').code === 0) { if (n++ % 10 === 0) log('waiting: other work of ours is running on the Studio'); spawnSync('sleep', ['60']); if (left() < 0) return false } return true }
  const diskOk = () => lib.freeGb() >= 20

  // The builders' gateway to Ola's own model, up for the whole night (it only forwards; the model behind it comes and goes).
  const port = lib.portOf(BUILDER)
  if (sh(`nc -z 127.0.0.1 ${port}`).code === 0) log(`a gateway already answers on ${port}: using it`)
  else { const o = spawnSync(path.join(repo, 'apps/activist-ai/tickets/gateway.sh'), [BUILDER], { encoding: 'utf8', env: { ...process.env, ...ENV } }).stdout; gwPid = Number((o.match(/gateway pid (\d+)/) || [])[1]) || null; log(o.trim()); spawnSync('sleep', ['2']) }
  const token = lib.gatewayToken()

  let round = journal().reduce((m, j) => Math.max(m, j.round || 0), 0)
  try {
    while (true) {
      if (existsSync(STOPF)) { stopping = 'asked to stop'; break }
      if (left() < 12 * 60000) { stopping = 'the clock (too little time left for a round)'; break }
      if (!diskOk()) { stopping = `less than 20 GB free on disk (${lib.freeGb().toFixed(1)} GB)`; break }
      if (!free()) { stopping = 'the clock (while waiting for other work)'; break }
      round++
      const r0 = Date.now(), rdir = path.join(RUNS, `r${String(round).padStart(3, '0')}-mayor`); mkdirSync(rdir, { recursive: true })
      // 1. the mayor's turn
      const reading = await townReading()
      const recent = journal().slice(-18).map((j) => `- round ${j.round} "${j.name}" (${j.kind}, ${j.file}): ${j.verdict === 'kept' ? 'KEPT' : `REJECTED, ${j.failure}: ${(j.judge || []).slice(-1)[0] || ''}`.slice(0, 220)}`).join('\n')
      const prompt = mayorPrompt(N, reading, recent); writeFileSync(path.join(rdir, 'prompt.txt'), prompt)
      const s0 = Date.now(), st = bm(['start', 'qwen']), swapIn = Math.round((Date.now() - s0) / 1000)
      log(`round ${round}: Qwen up in ${swapIn} s (${st.code === 0 ? 'ok' : 'FAILED'})`)
      let plan = null, ask = null, mayorWhy = ''
      if (st.code === 0) {
        // One more try while Qwen is up, if the first answer was not usable (not JSON, cut off, or the call failed).
        for (let t = 1; t <= 2 && !plan; t++) {
          try { ask = await askMayor(prompt); writeFileSync(path.join(rdir, `answer${t > 1 ? '-2' : ''}.json`), JSON.stringify(ask, null, 2)); plan = parseJobs(ask.text, N) }
          catch (e) { mayorWhy = `${t > 1 ? 'twice: ' : ''}${e.message.slice(0, 200)}`; if (t === 1) log(`round ${round}: the mayor's answer was not usable (${mayorWhy}); asking once more`) }
        }
      } else mayorWhy = `Qwen did not start: ${st.out.slice(-200)}`
      const b0 = Date.now(); const back = ownModelBack(); const swapOut = Math.round((Date.now() - b0) / 1000)
      log(`round ${round}: the mayor ${plan ? `handed out ${plan.jobs.length} jobs in ${ask.seconds} s` : `failed: ${mayorWhy}`}; Ola's own model back in ${swapOut} s${back ? '' : ' (NOT BACK)'}`)
      if (!back) { stopping = "Ola's own model did not come back"; break }
      if (!plan) {
        appendFileSync(path.join(NT, 'rounds.jsonl'), JSON.stringify({ round, at: stamp(), mayor: 'failed', why: mayorWhy, swapIn, swapOut, minutes: +((Date.now() - r0) / 60000).toFixed(1) }) + '\n')
        if (++mayorFails >= 3) { stopping = 'three failed mayor turns in a row'; break }
        continue
      }
      mayorFails = 0
      writeFileSync(path.join(rdir, 'plan.json'), JSON.stringify(plan, null, 2))
      // 2. the builders, three at a time from the round's list; 3. each judged in its own copy
      const results = new Array(plan.jobs.length)
      let next = 0
      const worker = async () => {
        while (next < plan.jobs.length) {
          const i = next++, job = plan.jobs[i]
          if (left() < 9 * 60000 || existsSync(STOPF)) { results[i] = null; continue }
          const b = await build(lib, token, round, job, i)
          const allowed = b.files.every((f) => f === job.file || (job.change === 'new' && /^parts\/[^/]+\.js$/.test(f) && !existsSync(path.join(TOWN, f))))
          let j
          if (b.run.end === 'timeout' && !b.files.length) j = { ok: false, kind: 'did not finish in time', lines: [`stopped at 8 minutes with no change`] }
          else if (!b.files.length) j = { ok: false, kind: 'no change', lines: [`ended ${b.run.end} with no change`] }
          else if (!allowed) j = { ok: false, kind: 'outside its part', lines: [`changed ${b.files.join(', ')}`] }
          else { j = await judge(b.work, keptChecks(), job.check); if (b.run.end === 'timeout') j.lines.unshift('the builder hit the 8-minute cap; judged what it left') }
          results[i] = { job, b, j }
          log(`round ${round} job ${i + 1} "${job.name}": ${j.ok ? 'passes in its copy' : `rejected (${j.kind})`}, ${b.minutes} min, ${b.run.requests} steps`)
        }
      }
      await Promise.all(Array.from({ length: AT_ONCE }, worker))
      // 4. merge the passing jobs one after the other, re-judging after each
      let kept = 0
      for (const x of results) {
        if (!x) continue
        const { job, b } = x
        let verdict = 'rejected', failure = x.j.kind, lines = [...x.j.lines]
        if (x.j.ok) {
          const p = path.join(b.dir, 'change.diff')
          const ap = sh(`git apply --whitespace=nowarn ${q(p)}`, TOWN)
          if (ap.code !== 0) { failure = 'did not apply'; lines.push(`merge: ${ap.out.slice(0, 200)}`) }
          else {
            const checks = keptChecks(), m = await judge(TOWN, checks, job.check)
            if (m.ok) {
              checks.push({ name: job.name, file: job.file, round, check: job.check }); writeFileSync(path.join(TOWN, 'checks.json'), JSON.stringify(checks, null, 2) + '\n')
              regenIndex(TOWN)
              sh(`git add -A && git -c user.name=inkmini -c user.email=inkmini@localhost commit -qm ${q(`round ${round}: ${job.name} (${job.file})\n\n${job.what}`)}`, TOWN)
              verdict = 'kept'; failure = null; kept++; lines.push('merged: every check still true')
            } else { sh('git checkout -q -- . && git clean -qfd', TOWN); failure = m.kind === 'broke an earlier check' ? 'broke an earlier check after merge' : `${m.kind} after merge`; lines.push(...m.lines.map((l) => `after merge: ${l}`)) }
          }
        }
        appendFileSync(JOURNAL, JSON.stringify({ round, at: stamp(), name: job.name, kind: job.kind, file: job.file, change: job.change, what: job.what, check: job.check, asked: job.asked,
          mayor: MAYOR, builder: BUILDER, minutes: b.minutes, steps: b.run.requests, end: b.run.end, tokens: { in: b.run.tokens_in, cached: b.run.tokens_cached, out: b.run.tokens_out },
          files: b.files, diffLines: b.diff.split('\n').filter((l) => /^[+-](?![+-]{2} )/.test(l)).length, diff: path.join(b.dir, 'change.diff'), said: (b.run.final || '').slice(0, 600),
          verdict, failure, judge: lines }) + '\n')
      }
      await screenshot(round)
      const minutes = +((Date.now() - r0) / 60000).toFixed(1)
      appendFileSync(path.join(NT, 'rounds.jsonl'), JSON.stringify({ round, at: stamp(), note: plan.note, mayorSeconds: ask.seconds, swapIn, swapOut, jobs: plan.jobs.length, built: results.filter(Boolean).length, kept, minutes, parts: partsList().length }) + '\n')
      log(`round ${round} done in ${minutes} min: ${kept} of ${results.filter(Boolean).length} kept; swaps ${swapIn + swapOut} s; town has ${partsList().length} parts. Mayor: ${plan.note.slice(0, 160)}`)
    }
  } catch (e) { stopping = `crash: ${e.stack?.split('\n').slice(0, 3).join(' ')}` }
  finish(stopping || 'done')
  process.exit(/^crash/.test(stopping || '') ? 3 : 0)
}
function nextTime(hm) {
  const [h, m] = hm.split(':').map(Number)
  const now = new Date(), pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const target = new Date(pt); target.setHours(h, m, 0, 0); if (target <= pt) target.setDate(target.getDate() + 1)
  return now.getTime() + (target - pt)
}

// ---------------------------------------------------------------- status and report
function status() {
  const js = journal(), rounds = existsSync(path.join(NT, 'rounds.jsonl')) ? readFileSync(path.join(NT, 'rounds.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
  console.log(`${running() ? `RUNNING (pid ${readFileSync(PIDF, 'utf8').trim()})` : 'not running'}; ${NT}`)
  console.log(`rounds ${rounds.length}, jobs ${js.length}: ${js.filter((j) => j.verdict === 'kept').length} kept, ${js.filter((j) => j.verdict !== 'kept').length} rejected; parts now ${existsSync(TOWN) ? partsList().length : 0}`)
  for (const j of js.slice(-5)) console.log(`  r${j.round} ${j.at.slice(11, 16)} ${j.verdict === 'kept' ? 'KEPT    ' : 'rejected'} ${j.name} (${j.kind}) ${j.minutes} min${j.failure ? `: ${j.failure}` : ''}`)
  if (existsSync(LOG)) console.log('last log line: ' + readFileSync(LOG, 'utf8').trim().split('\n').pop())
}
function report() {
  const js = journal(), rounds = existsSync(path.join(NT, 'rounds.jsonl')) ? readFileSync(path.join(NT, 'rounds.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
  const kept = js.filter((j) => j.verdict === 'kept'), rej = js.filter((j) => j.verdict !== 'kept')
  const parts = existsSync(TOWN) ? partsList() : [], lines = parts.reduce((a, p) => a + p.lines, 0)
  const by = (xs, k) => xs.reduce((m, x) => ((m[x[k] || '?'] = (m[x[k] || '?'] || 0) + 1), m), {})
  const kinds = [...new Set(js.map((j) => j.kind))]
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0)
  const ex = (j) => `- r${j.round} "${j.name}" (${j.kind}), ${j.minutes} min, ${j.steps} steps${j.failure ? `, ${j.failure}` : ''}. Qwen asked: "${j.what.replace(/\s+/g, ' ').slice(0, 300)}" Check: \`${j.check.replace(/\s+/g, ' ').slice(0, 160)}\`${j.failure ? ` Judge: ${(j.judge || []).slice(-1)[0]?.slice(0, 200) || ''}` : ''}`
  const rate = kinds.map((k) => { const a = js.filter((j) => j.kind === k); return { k, n: a.length, kept: a.filter((j) => j.verdict === 'kept').length } }).sort((a, b) => pct(b.kept, b.n) - pct(a.kept, a.n))
  const good = rate.filter((r) => r.n >= 2 && pct(r.kept, r.n) >= 50), bad = rate.filter((r) => r.n >= 2 && pct(r.kept, r.n) < 50)
  const ok = rounds.filter((r) => r.minutes && r.built), total = ok.reduce((a, r) => a + r.minutes, 0), swaps = ok.reduce((a, r) => a + (r.swapIn || 0) + (r.swapOut || 0), 0) / 60
  const third = Math.max(1, Math.ceil(rounds.length / 3))
  const phase = (rs) => { const ids = new Set(rs.map((r) => r.round)); const a = js.filter((j) => ids.has(j.round)); return a.length ? `${a.length} jobs, ${pct(a.filter((j) => j.verdict === 'kept').length, a.length)}% kept, kinds ${JSON.stringify(by(a, 'kind'))}, asks averaged ${Math.round(a.reduce((s, j) => s + j.what.length, 0) / a.length)} characters, checks ${Math.round(a.reduce((s, j) => s + j.check.length, 0) / a.length)}` : 'no jobs' }
  const failures = by(rej, 'failure')
  const top = Object.entries(failures).sort((a, b) => b[1] - a[1])
  const md = `# The night town: report (${stamp()})

${running() ? 'The night is still running: this is a partial report.\n\n' : ''}## The town

${parts.length} parts, ${lines} lines of code (seed: 4 parts). ${rounds.length} rounds, ${js.length} jobs: ${kept.length} kept, ${rej.length} rejected (${pct(kept.length, js.length)}% kept). Screenshots: ${SHOTS}. The town's history: \`git -C ${TOWN} log\`.

## Kept and rejected by kind

| kind | jobs | kept | share |
|---|---|---|---|
${rate.map((r) => `| ${r.k} | ${r.n} | ${r.kept} | ${pct(r.kept, r.n)}% |`).join('\n')}

Why jobs were rejected: ${top.map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.

## What Inkmini lands

${good.length ? good.map((r) => `${r.k} (${r.kept} of ${r.n})`).join(', ') : 'no kind with two or more jobs and half kept'}. Examples:
${kept.slice(-2).map(ex).join('\n') || '(none)'}

## What it does not land

${bad.length ? bad.map((r) => `${r.k} (${r.kept} of ${r.n})`).join(', ') : 'no kind with two or more jobs and under half kept'}. Examples:
${rej.filter((j) => j.failure !== 'did not finish in time').slice(-2).map(ex).join('\n') || rej.slice(-2).map(ex).join('\n') || '(none)'}

## How Qwen's asks changed

- First third: ${phase(rounds.slice(0, third))}
- Middle: ${phase(rounds.slice(third, 2 * third))}
- Last third: ${phase(rounds.slice(2 * third))}
- Mayor turns that failed: ${rounds.filter((r) => r.mayor === 'failed').length}${rounds.filter((r) => r.mayor === 'failed').slice(0, 3).map((r) => ` (r${r.round}: ${r.why})`).join('')}

## Time

${ok.length} rounds that built something averaged ${(total / (ok.length || 1)).toFixed(1)} min; swapping models took ${swaps.toFixed(0)} of ${total.toFixed(0)} min (${pct(swaps, total)}%). A job took ${(js.reduce((a, j) => a + j.minutes, 0) / (js.length || 1)).toFixed(1)} min on average (kept ${(kept.reduce((a, j) => a + j.minutes, 0) / (kept.length || 1)).toFixed(1)}, rejected ${(rej.reduce((a, j) => a + j.minutes, 0) / (rej.length || 1)).toFixed(1)}).

## Three plain lessons for the factory

1. ${good[0] ? `Inkmini is reliable on ${good[0].k} jobs (${good[0].kept} of ${good[0].n}): give it more of those.` : 'No kind of job was reliably landed: shrink the jobs.'}
2. ${top[0] ? `The most common failure was "${top[0][0]}" (${top[0][1]} of ${rej.length} rejections): ${/time|no change/.test(top[0][0]) ? 'the jobs are too big for 8 minutes, or the ask too long.' : /own check/.test(top[0][0]) ? 'the builder ships before its check passes, or the check asks for more than the words do.' : /earlier/.test(top[0][0]) ? 'new parts step on what exists: the shared state needs firmer rules.' : 'look at those runs first.'}` : 'Nothing was rejected.'}
3. Swaps cost ${pct(swaps, total)}% of the night; ${pct(swaps, total) > 25 ? 'hand out more jobs per mayor visit.' : 'the mayor-in-turns shape is affordable.'}

Every job, with Qwen's exact words, the change, the judge's output and the time: ${JOURNAL}.
`
  writeFileSync(path.join(NT, 'REPORT.md'), md)
  console.log(md)
  console.log(`written: ${path.join(NT, 'REPORT.md')}`)
}

if (cmd === 'night') await night()
else if (cmd === 'status') status()
else if (cmd === 'report') report()
else if (cmd === 'look') { if (!existsSync(TOWN)) freshTown(); mkdirSync(SHOTS, { recursive: true }); console.log(JSON.stringify(await judge(TOWN, keptChecks(), null))); console.log(JSON.stringify(await townReading()).slice(0, 600)); await screenshot(0); console.log(`shots in ${SHOTS}`); await browser?.close(); process.exit(0) }
else if (cmd === 'stop') { writeFileSync(STOPF, stamp()); console.log('asked to stop: the night ends after the job in progress, with Ola\'s own model loaded') }
else { console.error('town.mjs night [--until 07:00 | --minutes 30] [--jobs 6] [--fresh] | status | report | stop'); process.exit(2) }

