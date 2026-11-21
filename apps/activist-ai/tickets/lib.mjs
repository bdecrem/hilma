// Shared by trial.mjs and handoff.mjs (OLA-300): the sandbox a ticket model works in, its opencode
// settings and one opencode run. The sandbox: the home folder is out of reach except the run folder
// and the two node_modules (read only); outbound network only to loopback (the ticket lane's gateway).
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
export function freeGb() { return Number(sh(`df -k ${q(homedir())} | tail -1 | awk '{print $4}'`).trim()) / 1048576 }
export function gatewayToken() {
  const f = path.join(root, '.gw/token')
  if (!existsSync(f)) throw new Error('no gateway token: start apps/activist-ai/tickets/gateway.sh first')
  return readFileSync(f, 'utf8').trim()
}

export function profile(runDir) {
  return `(version 1)
(allow default)
(deny file-read* file-write* (subpath ${q(homedir())}))
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

export function opencodeConfig(model) {
  const m = MODELS[model]
  return {
    $schema: 'https://opencode.ai/config.json',
    providers: { box: { name: 'Ola tickets', env: ['BOX_API_KEY'], package: '@opencode/ai/providers/openai-compatible', settings: { baseURL: `http://127.0.0.1:${portOf(model)}/v1` },
      models: { m: { modelID: 'code', name: model, capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: m.context || 200000, output: 32000 } } } } },
    model: 'box/m', update: 'disable',
    permissions: [{ action: '*', resource: '*', effect: 'allow' }, { action: 'webfetch', resource: '*', effect: 'deny' }, { action: 'websearch', resource: '*', effect: 'deny' }, { action: 'external_directory', resource: '*', effect: 'deny' }],
  }
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
  if (s.tokens_in + s.tokens_out > tokenLimit) return 'token_limit'
  if (usdLimit !== Infinity && cost(model, s) >= usdLimit) return 'usd_limit'
  return null
}

export async function runOpencode(run, text, { timeLimit, tokenLimit, usdLimit = Infinity, model, token, bin = opencodeBin }) {
  if (usdLimit !== Infinity && !MODELS[model]) throw new Error(`a dollar stop needs the model's prices: unknown model ${model}`)
  const s = { requests: 0, tokens_in: 0, tokens_out: 0, end: 'done', final: '', tools: 0, tool_errors: 0 }
  const out = createWriteStream(path.join(run.dir, 'events.jsonl'))
  const child = sandboxed(run, [bin, 'run', '--standalone', '--auto', '--format', 'json', '--model', 'box/m', text], { BOX_API_KEY: token })
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

export const cost = (model, s) => +((s.tokens_in * MODELS[model].in + s.tokens_out * MODELS[model].out) / 1e6).toFixed(2)
