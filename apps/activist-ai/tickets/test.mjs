#!/usr/bin/env node
// The ticket lane's own checks, offline (no model, no gateway, no tracker): a run stops itself at its
// dollar ceiling and at its token ceiling, a run under both ends on its own, and the trial and the
// hand-off refuse to start without their ceilings or their tests.
//   node apps/activist-ai/tickets/test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { LEAN, MODELS, cost, here, opencodeConfig, overLimit, runFolders, runOpencode, runTest, tracker, upstreamOf } from './lib.mjs'

// A stand-in for opencode: one model call every 20 ms, each 200,000 tokens in and 1,000 out, until
// it is killed or has made `steps` calls. At Kimi K3.1 Pro's prices ($2 in, $10 out) a call is $0.41.
function fakeRun(steps = 1000) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'olt-test-')))
  const run = runFolders(dir)
  const bin = path.join(dir, 'fake-opencode.sh')
  const line = JSON.stringify({ type: 'step_finish', part: { tokens: { input: 200000, output: 1000, reasoning: 0 } } })
  writeFileSync(bin, `#!/bin/sh\ni=0\nwhile [ $i -lt ${steps} ]; do echo '${line}'; i=$((i+1)); sleep 0.02; done\necho '{"type":"text","part":{"text":"done"}}'\n`, { mode: 0o755 })
  return { run, bin, dir }
}

test('OLA-356: cache hits are priced at the cached rate and count toward the token ceiling', () => {
  // Kimi: 100k new at $2, 900k cached at $0.20, 10k out at $10 = 0.20 + 0.18 + 0.10
  const s = { tokens_in: 100_000, tokens_cached: 900_000, tokens_out: 10_000 }
  assert.equal(cost('kimi-k3.1-pro', s), 0.48)
  assert.equal(cost('qwen3.7-max', s), +((1_000_000 * 2.5 + 10_000 * 7.5) / 1e6).toFixed(2), 'no cached rate listed: billed as new input')
  assert.equal(overLimit('kimi-k3.1-pro', s, { tokenLimit: 1_000_000 }), 'token_limit')
})

test('OLA-356: the lean configuration caps tool output, drops skills and spare tools; the default is unchanged', () => {
  const lean = opencodeConfig('kimi-k3.1-pro', { lean: true }), full = opencodeConfig('kimi-k3.1-pro')
  assert.ok(lean.tool_output.max_bytes <= 12000)
  for (const t of ['skill', 'subagent', 'question', 'experimental_image_generate']) assert.ok(lean.permissions.some((p) => p.action === t && p.effect === 'deny'), t)
  assert.equal(full.tool_output, undefined)
  assert.equal(full.permissions.length, 4)
  assert.equal(LEAN.env.OPENCODE_DISABLE_CLAUDE_CODE, '1')
})

test('overLimit: the dollar and token ceilings', () => {
  const s = { tokens_in: 1_000_000, tokens_out: 100_000 } // Kimi: $2 + $1 = $3
  assert.equal(cost('kimi-k3.1-pro', s), 3)
  assert.equal(overLimit('kimi-k3.1-pro', s, { usdLimit: 3 }), 'usd_limit')
  assert.equal(overLimit('kimi-k3.1-pro', s, { usdLimit: 3.01 }), null)
  assert.equal(overLimit('kimi-k3.1-pro', s, { tokenLimit: 1_000_000 }), 'token_limit')
  assert.equal(overLimit('kimi-k3.1-pro', s, {}), null)
})

test('a run is killed at its dollar ceiling', async () => {
  const { run, bin, dir } = fakeRun()
  const s = await runOpencode(run, 'x', { timeLimit: 60, tokenLimit: 1e12, usdLimit: 2, model: 'kimi-k3.1-pro', token: 't', bin })
  assert.equal(s.end, 'usd_limit')
  assert.equal(s.requests, 5) // 4 calls are $1.64, the 5th takes it to $2.05
  assert.ok(cost('kimi-k3.1-pro', s) >= 2 && cost('kimi-k3.1-pro', s) < 2.5)
  rmSync(dir, { recursive: true, force: true })
})

test('a run is killed at its token ceiling', async () => {
  const { run, bin, dir } = fakeRun()
  const s = await runOpencode(run, 'x', { timeLimit: 60, tokenLimit: 500_000, usdLimit: 100, model: 'kimi-k3.1-pro', token: 't', bin })
  assert.equal(s.end, 'token_limit')
  assert.equal(s.requests, 3)
  rmSync(dir, { recursive: true, force: true })
})

test('a run under both ceilings ends on its own', async () => {
  const { run, bin, dir } = fakeRun(2)
  const s = await runOpencode(run, 'x', { timeLimit: 60, tokenLimit: 1e7, usdLimit: 10, model: 'kimi-k3.1-pro', token: 't', bin })
  assert.equal(s.end, 'done')
  assert.equal(s.requests, 2)
  assert.equal(s.final, 'done')
  rmSync(dir, { recursive: true, force: true })
})

test('a dollar ceiling without the model\'s prices is refused', async () => {
  const { run, bin, dir } = fakeRun(1)
  await assert.rejects(runOpencode(run, 'x', { timeLimit: 60, tokenLimit: 1e7, usdLimit: 10, model: 'nope', token: 't', bin }), /unknown model/)
  rmSync(dir, { recursive: true, force: true })
})

test('runTest: exit code and node:test counts, in the sandbox', async () => {
  const { run, dir } = fakeRun(1)
  writeFileSync(path.join(run.work, 't.mjs'), "import test from 'node:test'\ntest('a', () => {})\ntest('b', () => { throw new Error('no') })\n")
  const r = await runTest(run, 'x', 'node t.mjs')
  assert.equal(r.exit, 1)
  assert.equal(r.total, 2)
  assert.equal(r.pass, 1)
  rmSync(dir, { recursive: true, force: true })
})

test('the trial refuses runs whose worst case is over --max-usd', () => {
  // three cases on Kimi, each stopping at $10: a worst case of $30
  const r = spawnSync(process.execPath, [path.join(here, 'trial.mjs'), '--models', 'kimi-k3.1-pro', '--cases', 'ola-324-clock,ola-283-select,ola-337-deepseek', '--max-usd', '29'], { encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /can cost up to \$30\.00, over --max-usd 29/)
  const one = spawnSync(process.execPath, [path.join(here, 'trial.mjs'), '--models', 'kimi-k3.1-pro', '--cases', 'ola-324-clock', '--run-usd', '6'], { encoding: 'utf8' })
  assert.equal(one.status, 2)
  assert.match(one.stderr, /--max-usd is required: these 1 runs can cost up to \$6\.00/)
})

test('the tracker gets the model\'s words as one argument, never through a shell', () => {
  // Nov 21: Ola's reply quoted `node scripts/venture/runner-test.mjs` in backticks, and the hand-off's
  // shell line ran it on the mini. Here a reply that would write a file if a shell ever saw it.
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'olt-tracker-')))
  const fake = path.join(dir, 'issues.mjs')
  writeFileSync(fake, "console.log(JSON.stringify(process.argv.slice(2)))\n")
  const marker = path.join(dir, 'ran')
  const words = `Changed \`touch ${marker}\` and $(touch ${marker}); "quoted" 'single' \\ done`
  const out = JSON.parse(tracker(['comment', 'OLA-1', words], fake))
  assert.deepEqual(out, ['comment', 'OLA-1', words])
  assert.equal(existsSync(marker), false)
  rmSync(dir, { recursive: true, force: true })
})

test('the hand-off refuses to start without a test that decides', () => {
  const r = spawnSync(process.execPath, [path.join(here, 'handoff.mjs'), 'run', 'OLA-1', '--dry'], { encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /--test "<cmd>" is required/)
})

test('OLA-370: OpenRouter models go to OpenRouter with the key file, the rest to Together, priced from models.json', () => {
  assert.deepEqual(upstreamOf('flint'), { provider: 'openrouter', base: 'https://openrouter.ai/api/v1', keyFile: '.ola/openrouter.key' })
  assert.equal(upstreamOf('inkling-2-mini').provider, 'openrouter')
  assert.deepEqual(upstreamOf('kimi-k3.1-pro'), { provider: 'together', base: 'https://api.together.xyz/v1', keyEnv: 'TOGETHER_API_KEY' })
  assert.throws(() => upstreamOf('x', { x: { id: 'a', provider: 'elsewhere' } }), /unknown provider elsewhere/)
  assert.throws(() => upstreamOf('_note'), /unknown model/)
  assert.equal(MODELS.flint.id, 'recursive/flint-v1.0:free')
  assert.equal(MODELS['inkling-2-mini'].id, 'thinkingmachines/inkling-2-mini')
  const s = { tokens_in: 1_000_000, tokens_cached: 4_000_000, tokens_out: 100_000 }
  assert.equal(cost('flint', s), 0)
  assert.equal(cost('inkling-2-mini', s), +(0.075 + 4 * 0.015 + 0.1 * 0.3).toFixed(2)) // $0.17
  assert.equal(opencodeConfig('flint', { lean: true }).providers.box.models.m.limit.context, 262144)
})

test('OLA-370: gateway.sh refuses an OpenRouter key file that others can read, and never prints the key', () => {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), 'olt-gw-')))
  mkdirSync(path.join(home, '.ola'))
  const secret = 'sk-or-v1-test-' + 'f'.repeat(40)
  const file = path.join(home, '.ola/openrouter.key')
  writeFileSync(file, secret + '\n', { mode: 0o644 })
  const run = (alias) => spawnSync(path.join(here, 'gateway.sh'), [alias], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home } })
  const loose = run('flint')
  assert.equal(loose.status, 1)
  assert.match(loose.stdout, /must be mode 600/)
  assert.ok(!(loose.stdout + loose.stderr).includes(secret))
  rmSync(file)
  const none = run('inkling-2-mini')
  assert.equal(none.status, 1)
  assert.match(none.stdout, /openrouter\.key not found/)
  assert.match(run('no-such-model').stdout, /unknown model no-such-model/)
  rmSync(home, { recursive: true, force: true })
})
