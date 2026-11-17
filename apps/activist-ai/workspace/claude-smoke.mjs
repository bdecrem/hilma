#!/usr/bin/env node
// Fallback to Claude, live, by hand: Claude Code inside a sealed workspace, through the door and
// the gateway, with a real credential. One tiny request per mode asked for.
//
//   node workspace/claude-smoke.mjs api_key   (CLAUDE_API_KEY in the environment)
//   node workspace/claude-smoke.mjs oauth     (CLAUDE_OAUTH_TOKEN_FILE: a file, mode 600)
//
// Its own gateway (port 4283), state in ~/.ola-wcc, one 1 GiB workspace `w-cc`, destroyed at the
// end. It proves: the request ran in the VM and wrote a file in /work; the gateway logged the
// Claude requests with no content; no credential is in the gateway's output, the VM's environment
// or any file in /work. It prints counts and the gateway's own numbers, never a credential.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const modes = process.argv.slice(2).filter((m) => ['api_key', 'oauth'].includes(m))
if (!modes.length) throw new Error('say api_key, oauth or both')
const HOME = path.join(homedir(), '.ola-wcc')
const ID = 'w-cc'
const CTR = '/usr/local/bin/container'
const env = { ...process.env, OLA_HOME: HOME, OLA_GATEWAY_PORT: '4283' }
const ws = (...a) => spawnSync(process.execPath, [path.join(AI, 'workspace/ws.mjs'), ...a], { env, encoding: 'utf8' })
const secrets = [process.env.CLAUDE_API_KEY, process.env.CLAUDE_OAUTH_TOKEN_FILE && readFileSync(process.env.CLAUDE_OAUTH_TOKEN_FILE, 'utf8').trim()].filter(Boolean)
mkdirSync(HOME, { recursive: true, mode: 0o700 })
const grants = path.join(HOME, 'gateway-claude')
const write = (g) => writeFileSync(grants, JSON.stringify(g), { mode: 0o600 })
write({})
ws('destroy', ID, '--confirm', ID)
const made = ws('create', ID, '--memory', '1g', '--disk', '1g', '--cpus', '1')
if (made.status !== 0) throw new Error(`create: ${made.stderr.trim().split('\n').pop()}`)
const run = mkdtempSync(path.join(tmpdir(), 'ola-wcc-'))
const gw = spawn(process.execPath, [path.join(AI, 'gateway/server.mjs')], {
  env: {
    PATH: process.env.PATH, HOME: homedir(),
    UPSTREAM_BASE_URL: 'http://127.0.0.1:9/v1', UPSTREAM_API_KEY: 'not-used-in-this-smoke-0000', GATEWAY_MODELS: 'general=none',
    GATEWAY_PORT: '4283', GATEWAY_TOKENS_FILE: path.join(HOME, 'gateway-tokens'), GATEWAY_DOOR_DIR: path.join(HOME, 'gw'), GATEWAY_DB: path.join(run, 'usage.db'),
    GATEWAY_CLAUDE_FILE: grants,
    ...(process.env.CLAUDE_API_KEY ? { CLAUDE_API_KEY: process.env.CLAUDE_API_KEY } : {}),
    ...(process.env.CLAUDE_OAUTH_TOKEN_FILE ? { CLAUDE_OAUTH_TOKEN_FILE: process.env.CLAUDE_OAUTH_TOKEN_FILE } : {}),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
gw.stdout.on('data', (d) => (log += d))
gw.stderr.on('data', (d) => (log += d))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let bad = 0
try {
  await sleep(1500)
  const st = ws('start', ID)
  if (st.status !== 0) throw new Error(`start: ${st.stderr.trim().split('\n').pop()}`)
  for (const mode of modes) {
    // Off first: the gateway refuses, and Claude Code says so.
    write({})
    await sleep(2500)
    const off = spawnSync(CTR, ['exec', '-i', `ola-${ID}`, '/opt/ola/bin/ola-claude', 'go'], { input: 'Say ok.', encoding: 'utf8', timeout: 120_000 })
    const refused = /Fallback to Claude is off/.test(off.stdout + off.stderr)
    write({ [`ws-${ID}`]: { mode, cap_micro_usd: 1_000_000, cap_tokens: 2_000_000 } })
    await sleep(2500)
    const file = `claude-${mode}.txt`
    const t0 = Date.now()
    const r = spawnSync(CTR, ['exec', '-i', `ola-${ID}`, '/opt/ola/bin/ola-claude', 'go'], { input: `Write a file named ${file} containing exactly the word hi. Then stop.`, encoding: 'utf8', timeout: 300_000 })
    const events = r.stdout.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const result = events.find((e) => e.type === 'result')
    const init = events.find((e) => e.type === 'system' && e.subtype === 'init')
    const got = spawnSync(CTR, ['exec', `ola-${ID}`, 'cat', `/work/${file}`], { encoding: 'utf8' }).stdout.trim()
    const ok = refused && r.status === 0 && got === 'hi' && result && !result.is_error
    if (!ok) bad++
    console.log(`${ok ? 'pass' : 'FAIL'}  ${mode}: off refused ${refused}; exit ${r.status}; ${events.length} events; tools ${init?.tools?.length ?? '?'}; apiKeySource ${init?.apiKeySource ?? '?'}; ${file} says "${got}"; ${Math.round((Date.now() - t0) / 1000)} s; Claude Code's own count: ${result?.usage?.input_tokens ?? '?'} in, ${result?.usage?.output_tokens ?? '?'} out, $${result?.total_cost_usd ?? '?'}`)
    if (!ok) console.log(r.stderr.split('\n').slice(-3).join(' | ').slice(0, 300))
  }
  // The credentials are nowhere but the gateway's own memory.
  const venv = spawnSync(CTR, ['exec', `ola-${ID}`, 'sh', '-c', 'env; cat /proc/1/environ 2>/dev/null | tr "\\0" "\\n"; grep -rIl . /work 2>/dev/null | head -500 | xargs cat 2>/dev/null'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout
  const leaks = secrets.filter((s) => venv.includes(s) || log.includes(s)).length
  if (leaks) bad++
  console.log(`${leaks ? 'FAIL' : 'pass'}  no credential in the VM's environment, its files or the gateway's output (${secrets.length} checked)`)
  const lines = log.split('\n').filter((l) => l.includes('"route":"claude'))
  console.log(`gateway: ${lines.length} Claude requests logged; ${lines.map((l) => JSON.parse(l)).map((l) => `${l.status} ${l.mode} ${l.model} ${l.tokens_in}/${l.tokens_out} ${l.cost_micro_usd ?? ''}`).join('; ')}`)
} finally {
  gw.kill('SIGTERM')
  ws('destroy', ID, '--confirm', ID)
}
process.exit(bad ? 1 : 0)
