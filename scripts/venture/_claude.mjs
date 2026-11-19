// One question to Claude on the machine's own Claude login (the Max plan), not the API key.
// Bart, Nov 18, 2026: "all the agent work should be oauth using our max plan"; Nov 19: "tell me if
// any of these can be easily routed differently so they are processed through our Max plan".
// What is not time-critical goes through here: the steer count, the replay test, the minutes.
//
//   const { text, json, usage } = await askClaude({ system, user, schema, effort: 'high' })
//
// It starts Claude Code once, headless, with no tools, no settings, no hooks, no CLAUDE.md and no
// saved session, in an empty folder: the model sees the system text and the question and nothing
// of this project. The login is the one saved on the machine (the keychain on an iMac,
// CLAUDE_CODE_OAUTH_TOKEN where a launchd job sets it); ANTHROPIC_API_KEY is removed from the
// child's environment so the call can never fall back to the key.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export const LOGIN_MODEL = 'claude-opus-5-5'

export function askClaude({ system, user, schema = null, effort = 'medium', model = LOGIN_MODEL, timeoutMs = 20 * 60e3 }) {
  const dir = mkdtempSync(join(tmpdir(), 'venture-ask-'))
  writeFileSync(join(dir, 'system.txt'), system)
  const args = ['-p', '--output-format', 'json', '--model', model, '--effort', effort, '--system-prompt-file', join(dir, 'system.txt'), '--tools', '', '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config']
  if (schema) args.push('--json-schema', JSON.stringify(schema))
  const env = { ...process.env, PATH: `${homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}`, DISABLE_AUTOUPDATER: '1' }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return new Promise((resolve, reject) => {
    const p = spawn('claude', args, { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => { clearTimeout(timer); rmSync(dir, { recursive: true, force: true }); reject(new Error(`could not start claude: ${e.message}`)) })
    p.on('close', (code, signal) => {
      clearTimeout(timer)
      rmSync(dir, { recursive: true, force: true })
      if (signal) return reject(new Error(`claude was stopped (${signal}) after ${Math.round(timeoutMs / 60e3)} min`))
      let r
      try { r = JSON.parse(out) } catch { return reject(new Error(`claude exit ${code}: ${(err || out).trim().slice(0, 400)}`)) }
      if (code !== 0 || r.is_error || r.subtype !== 'success') return reject(new Error(`claude failed (${r.subtype ?? code}): ${String(r.result ?? err).slice(0, 400)}`))
      if (schema && r.structured_output == null) return reject(new Error(`claude gave no structured answer: ${String(r.result).slice(0, 400)}`))
      resolve({ text: typeof r.result === 'string' ? r.result : '', json: r.structured_output ?? null, usage: r.usage ?? {}, apiEquivalentUsd: r.total_cost_usd ?? 0 })
    })
    p.stdin.end(user)
  })
}
