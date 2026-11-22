// Shared by trial.mjs and handoff.mjs (OLA-300): the sandbox a ticket model works in, its opencode
// settings and one opencode run. The sandbox: the home folder is out of reach except the run folder
// and the two node_modules (read only), and so is every mounted disk (/Volumes: on Nov 21 Recursive Flint
// ran `find / -name select.mjs` and copied the ticket's answer from the mini's backup disk, which also
// holds env files; OLA-370); outbound network only to loopback (the ticket lane's gateway).
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, createWriteStream } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

export const here = path.dirname(new URL(import.meta.url).pathname)
export const repo = path.resolve(here, '../../..')
export const root = path.join(homedir(), 'ola-trials')
export const opencodeBin = path.join(repo, 'apps/activist-ai/node_modules/@opencode/cli/bin/opencode.exe')
export const nmRoot = path.join(repo, 'node_modules')
export const nmOla = path.join(repo, 'apps/activist-ai/node_modules')
export const MODELS = JSON.parse(readFileSync(path.join(here, 'models.json'), 'utf8'))
export const MIN_FREE_GB = 10

// The tracker, called with an argument list and never through a shell: a comment carries the model's
// own words, and on Nov 21 Ola's reply quoted `node scripts/venture/runner-test.mjs` in backticks,
// which the hand-off's shell line ran on the mini, outside the sandbox.
export function tracker(args, script = process.env.OLA_TICKETS_TRACKER || path.join(repo, 'scripts/venture/issues.mjs')) {
  return execFileSync(process.execPath, [script, ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).toString()
}

export const sh = (cmd, cwd) => execFileSync('/bin/sh', ['-c', cmd], { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).toString()
export const q = (p) => JSON.stringify(p)
export const portOf = (model) => 4460 + Object.keys(MODELS).filter((k) => !k.startsWith('_')).indexOf(model)

// Where a ticket model is served (OLA-370): Together unless models.json gives the model a `provider`.
// OpenRouter serves models no one else does (Recursive Flint, Inkling 2 Mini); its key is the file
// ~/.ola/openrouter.key, which gateway.sh reads into that one gateway's environment and never prints.
// For the ticket lane only: Ola's own gateway settings (~/.ola/gateway.env) do not know this.
export const PROVIDERS = {
  together: { base: 'https://api.together.xyz/v1', keyEnv: 'TOGETHER_API_KEY' },
  openrouter: { base: 'https://openrouter.ai/api/v1', keyFile: '.ola/openrouter.key' },
}
export function upstreamOf(model, models = MODELS) {
  const m = models[model]
  if (!m || model.startsWith('_')) throw new Error(`unknown model ${model}`)
  const name = m.provider || 'together'
  if (!PROVIDERS[name]) throw new Error(`model ${model}: unknown provider ${name}`)
  return { provider: name, ...PROVIDERS[name] }
}
export function freeGb() { return Number(sh(`df -k ${q(homedir())} | tail -1 | awk '{print $4}'`).trim()) / 1048576 }
export function gatewayToken() {
  const f = path.join(root, '.gw/token')
  if (!existsSync(f)) throw new Error('no gateway token: start apps/activist-ai/tickets/gateway.sh first')
  return readFileSync(f, 'utf8').trim()
}

export function profile(runDir) {
  return `(version 1)
(allow default)
(deny file-read* file-write* (subpath ${q(homedir())}) (subpath "/Volumes"))
(allow file-read* (literal ${q(homedir())}) (subpath ${q(nmRoot)}) (subpath ${q(nmOla)}) (subpath ${q(runDir)}))
(allow file-read-metadata (subpath ${q(homedir())}))
(allow file-write* (subpath ${q(runDir)}))
(deny network-outbound)
(allow network-outbound (remote ip "localhost:*") (remote unix-socket))
`
}

// TMPDIR is short and outside the home folder: unix sockets the tests make must fit in 104 bytes.
export function isolatedEnv(home, extra) {
  const tmp = mkdtempSync('/tmp/olt-')
  return { PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin', HOME: home, TMPDIR: tmp, XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local/share'), XDG_STATE_HOME: path.join(home, '.local/state'), XDG_CACHE_HOME: path.join(home, '.cache'),
    LANG: 'en_US.UTF-8', BROWSER: '/usr/bin/true', GIT_AUTHOR_NAME: 'ola', GIT_AUTHOR_EMAIL: 'ola@localhost', GIT_COMMITTER_NAME: 'ola', GIT_COMMITTER_EMAIL: 'ola@localhost', ...extra }
}

// The run's folders, the stand-ins for open and osascript (nothing it runs opens a window, rule 46),
// the sandbox profile. The caller fills `work`.
export function runFolders(dir) {
  const work = path.join(dir, 'work'), home = path.join(dir, 'home')
  for (const d of [work, path.join(home, 'tmp'), path.join(home, 'bin')]) mkdirSync(d, { recursive: true })
  for (const b of ['open', 'osascript']) writeFileSync(path.join(home, 'bin', b), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  writeFileSync(path.join(dir, 'sandbox.sb'), profile(dir))
  return { dir, work, home }
}

// steps (lean only): the step cap instead of LEAN's 60 (OLA-370: every failed Flint and Inkling run ended at
// the cap with no edit, so a run at 120 shows whether steps are the limit).
export function opencodeConfig(model, { lean = false, steps = null, baseURL = `http://127.0.0.1:${portOf(model)}/v1` } = {}) {
  const m = MODELS[model]
  return {
    $schema: 'https://opencode.ai/config.json',
    providers: { box: { name: 'Ola tickets', env: ['BOX_API_KEY'], package: '@opencode/ai/providers/openai-compatible', settings: { baseURL },
      models: { m: { modelID: 'code', name: model, capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: m.context || 200000, output: 32000 } } } } },
    model: 'box/m', update: 'disable',
    permissions: [{ action: '*', resource: '*', effect: 'allow' }, { action: 'webfetch', resource: '*', effect: 'deny' }, { action: 'websearch', resource: '*', effect: 'deny' }, { action: 'external_directory', resource: '*', effect: 'deny' },
      ...(lean ? LEAN.permissions : [])],
    ...(lean ? { ...LEAN.config, ...(steps ? { agents: { build: { steps } } } : {}) } : {}),
  }
}

// The lean ticket-work configuration (OLA-356), for the trial and the hand-off only, never Ola's
// product chat. The OLA-351 hand-off of Nov 21 cost $4.78 at list prices: Ola read whole files (the
// 80 KB root CLAUDE.md, runner.mjs, issues.mjs three times, a skill), its context grew from 28k to
// 130k tokens by call 7, and every later call resent all of it. Lean: tool output capped so one read
// cannot add 40 KB, no skills, and a request that says to search first and read line ranges.
export const LEAN = {
  config: { tool_output: { max_lines: 250, max_bytes: 12000 }, agents: { build: { steps: 60 } } },
  permissions: ['skill', 'experimental_image_generate', 'question', 'subagent'].map((action) => ({ action, resource: '*', effect: 'deny' })),
  env: { OPENCODE_DISABLE_CLAUDE_CODE: '1' },
  reading: 'How to read: search first (grep, glob) and then read only the lines you need (read with offset and limit, at most 200 lines at a time); never read a whole large file. Do not read the root CLAUDE.md whole (80 KB): grep it for the folder or file you touch. Do not load skills. Run the tests once your change is made, not before.',
}

export function sandboxed(run, argv, extra = {}) {
  return spawn('/usr/bin/sandbox-exec', ['-f', path.join(run.dir, 'sandbox.sb'), ...argv],
    { cwd: run.work, env: isolatedEnv(run.home, { PATH: `${path.join(run.home, 'bin')}:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin`, ...extra }), stdio: ['ignore', 'pipe', 'pipe'], detached: true })
}

// The stop on a run's spending (OLA-300, Nov 21): after each model call the run's tokens and dollars
// so far are added up, and the run is killed once either passes its ceiling. The trial of Nov 21
// had only a token stop (3M), which at Kimi's prices is $6 to $30 a run, and twelve such runs
// (about $45) emptied the Together account. Returns null, 'token_limit' or 'usd_limit'.
export function overLimit(model, s, { tokenLimit = Infinity, usdLimit = Infinity } = {}) {
  if (s.tokens_in + (s.tokens_cached || 0) + s.tokens_out > tokenLimit) return 'token_limit'
  if (usdLimit !== Infinity && cost(model, s) >= usdLimit) return 'usd_limit'
  return null
}

export async function runOpencode(run, text, { timeLimit, tokenLimit, usdLimit = Infinity, model, token, bin = opencodeBin, lean = false }) {
  if (usdLimit !== Infinity && !MODELS[model]) throw new Error(`a dollar stop needs the model's prices: unknown model ${model}`)
  const s = { requests: 0, tokens_in: 0, tokens_cached: 0, tokens_out: 0, end: 'done', final: '', tools: 0, tool_errors: 0 }
  const out = createWriteStream(path.join(run.dir, 'events.jsonl'))
  const child = sandboxed(run, [bin, 'run', '--standalone', '--auto', '--format', 'json', '--model', 'box/m', text], { BOX_API_KEY: token, ...(lean ? LEAN.env : {}) })
  const kill = (why) => { if (s.end === 'done') s.end = why; try { process.kill(-child.pid, 'SIGKILL') } catch {} }
  const timer = setTimeout(() => kill('timeout'), timeLimit * 1000)
  let buf = '', err = '', texts = []
  child.stderr.on('data', (d) => { err = (err + d).slice(-20000) })
  child.stdout.on('data', (d) => {
    out.write(d); buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      let e; try { e = JSON.parse(line) } catch { continue }
      const p = e.part || {}
      if (e.type === 'step_finish') {
        s.requests++; s.tokens_in += p.tokens?.input || 0; s.tokens_out += (p.tokens?.output || 0) + (p.tokens?.reasoning || 0)
        s.tokens_cached += p.tokens?.cache?.read || 0
        s.cache_seen ||= p.tokens || null
        const over = overLimit(model, s, { tokenLimit, usdLimit })
        if (over) kill(over)
      } else if (e.type === 'step_start') texts = []
      else if (e.type === 'text' && p.text) texts.push(p.text)
      else if (e.type === 'tool_use') { s.tools++; if (p.state?.status === 'error') s.tool_errors++ }
      else if (e.type === 'error') s.error = String(e.error?.name || 'error').slice(0, 60)
      if (texts.length) s.final = texts.join('\n').slice(0, 2000)
    }
  })
  const code = await new Promise((r) => child.on('close', r))
  clearTimeout(timer); out.end()
  writeFileSync(path.join(run.dir, 'stderr.txt'), err)
  if (s.end === 'done' && code !== 0) s.end = s.requests ? 'model_error' : 'harness_error'
  return s
}

// One test command in the run's sandbox, after the model stopped: its exit code and its pass count
// (node:test's summary, or TAP ok / not ok lines). Output kept in <run>/test-<name>.txt.
export async function runTest(run, name, cmd, limitMs = 600000) {
  const child = sandboxed(run, ['/bin/sh', '-c', cmd])
  let o = ''
  child.stdout.on('data', (d) => { o += d }); child.stderr.on('data', (d) => { o += d })
  const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, limitMs)
  const code = await new Promise((r) => child.on('close', r))
  clearTimeout(timer)
  writeFileSync(path.join(run.dir, `test-${name}.txt`), o)
  let pass = null, total = null
  const nt = o.match(/ℹ tests (\d+)[\s\S]*?ℹ pass (\d+)/)
  if (nt) { total = +nt[1]; pass = +nt[2] }
  else { const ok = (o.match(/^ok /gm) || []).length, bad = (o.match(/^(not ok|FAIL|✗)/gm) || []).length; pass = ok; total = ok + bad }
  return { name, cmd, exit: code, pass, total }
}

// Dollars at list prices. opencode reports input as the tokens the model server did not have cached,
// and the cache hits apart (probe.mjs: a usage of 1000 in with 600 cached reads as input 400, cache
// read 600); hits are billed at the model's cached rate (Together: about a tenth), or at the full
// input price when models.json lists none. Before OLA-356 the gateway hid the hit count, so every
// token was priced as new.
export const cost = (model, s) => { const m = MODELS[model]; return +((s.tokens_in * m.in + (s.tokens_cached || 0) * (m.cached ?? m.in) + s.tokens_out * m.out) / 1e6).toFixed(2) }
