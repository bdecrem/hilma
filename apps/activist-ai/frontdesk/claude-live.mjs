#!/usr/bin/env node
// Fallback to Claude, live, the whole path, by hand: a made-up admin-owned project, its owner turns
// Claude on in Settings (with the confirming click), hands one tiny request to Claude from the
// drawer, and the reply comes back marked; the file is in the sealed VM; the gateway used the
// subscription (oauth mode); the audit has claude_enabled and claude_used with numbers only.
//
//   CLAUDE_OAUTH_TOKEN_FILE=~/.ola/claude-oauth-token node frontdesk/claude-live.mjs [--shots <dir>]
//
// Its own everything: gateway on 4583 (the everyday model is a fake: only Claude is real), front
// desk on 4984, state in ~/.ola-f2live, one 1 GiB workspace `f2-live`, destroyed at the end. The
// token is read by the gateway only (from its file); nothing here prints it, and the check fails if
// it appears in the gateway's or the front desk's output or in the VM.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startFakeModel } from '../web/server/fake-model.mjs'

const AI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null
const tokenFile = process.env.CLAUDE_OAUTH_TOKEN_FILE
if (!tokenFile) throw new Error('CLAUDE_OAUTH_TOKEN_FILE (a file, mode 600)')
const secret = readFileSync(tokenFile, 'utf8').trim()
// One turn at a time on the machine's four VMs, deploys first (OLA-83, ops/turn.mjs); a deploy's
// suites inherit the deploy's turn.
await (await import('../ops/turn.mjs')).takeTurn(`claude-live${process.env.OLA_CHECK_TAG ? ` ${process.env.OLA_CHECK_TAG}` : ''}`)
const ID = 'f2-live'
const ORIGIN = 'http://localhost:4984'
const run = mkdtempSync(path.join(tmpdir(), 'ola-f2live-'))
const env = { ...process.env, OLA_HOME: path.join(homedir(), '.ola-f2live'), OLA_GATEWAY_PORT: '4583', OLA_MAX_RUNNING: '1', OLA_RUNNING_SCOPE: 'home', OLA_FD_DATA: path.join(run, 'fd'), OLA_FD_ORIGIN: ORIGIN, OLA_FD_PORT: '4984', OLA_FD_GATEWAY_USAGE_TOKEN: `usage-${Math.random().toString(36).slice(2)}-000000000000000000` }
delete env.CLAUDE_OAUTH_TOKEN_FILE
mkdirSync(env.OLA_HOME, { recursive: true, mode: 0o700 })
const node = (script, argv) => spawnSync(process.execPath, [path.join(AI, script), ...argv], { env, encoding: 'utf8' })
const admin = (...a) => {
  const r = node('frontdesk/admin.mjs', a)
  if (r.status !== 0) throw new Error(`admin ${a[0]}: ${r.stderr.trim().split('\n').pop()}`)
  return r.stdout.trim()
}
const kids = []
const start = (script, extra) => {
  const p = spawn(process.execPath, [path.join(AI, script)], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  p.log = ''
  p.stdout.on('data', (d) => (p.log += d))
  p.stderr.on('data', (d) => (p.log += d))
  kids.push(p)
  return p
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (ok, what) => (console.log(`${ok ? 'pass' : 'FAIL'}  ${what}`), ok)
let bad = 0
node('workspace/ws.mjs', ['destroy', ID, '--confirm', ID])
try {
  admin('add-person', 'olive', '--name', 'Olive O.', '--admin')
  admin('create-workspace', ID, '--name', 'Made-up live check', '--team', 'f2-live-team', '--team-name', 'Made-up Live Team', '--owner', 'olive', '--memory', '1g', '--disk', '1g', '--cpus', '1')
  const fake = await startFakeModel()
  fake.server.unref()
  const gw = start('gateway/server.mjs', { HOME: homedir(), UPSTREAM_BASE_URL: `http://127.0.0.1:${fake.port}/v1`, UPSTREAM_API_KEY: 'fake-model-key-not-a-secret', GATEWAY_MODELS: 'general=fake', GATEWAY_PORT: '4583', GATEWAY_TOKENS_FILE: path.join(env.OLA_HOME, 'gateway-tokens'), GATEWAY_DOOR_DIR: path.join(env.OLA_HOME, 'gw'), GATEWAY_DB: path.join(run, 'usage.db'), GATEWAY_CLAUDE_FILE: path.join(env.OLA_HOME, 'gateway-claude'), CLAUDE_OAUTH_TOKEN_FILE: tokenFile, GATEWAY_USAGE_TOKEN: env.OLA_FD_GATEWAY_USAGE_TOKEN })
  await sleep(1500)
  const fd = start('frontdesk/server.mjs', {})
  await sleep(1500)
  const link = admin('invite', 'olive')
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  await page.goto(link)
  await page.getByRole('button', { name: 'Make my passkey' }).click()
  await page.waitForSelector('.project-title', { timeout: 120_000 })
  // Settings: the switch, the confirming click.
  await page.goto(`${ORIGIN}/?w=${ID}#/settings`)
  const sw = page.getByRole('switch', { name: 'Fallback to Claude' })
  await page.waitForFunction(() => document.querySelector('[role=switch]') && !document.querySelector('[role=switch]').disabled, null, { timeout: 30_000 })
  await sw.click()
  await page.locator('dialog.confirm[open]').getByRole('button', { name: 'Turn it on' }).click()
  await page.waitForFunction(() => document.querySelector('[role=switch]')?.getAttribute('aria-checked') === 'true')
  if (!say(/subscription|share/.test(await page.locator('.settings').innerText()), 'Settings: on, in subscription mode (the month shown as a share)')) bad++
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'live-settings-on.png') })
  // The drawer: Claude, one tiny request.
  await page.goto(`${ORIGIN}/?w=${ID}#/`)
  await page.waitForSelector('.project-title')
  await page.locator('.askbar-open').click()
  await page.waitForSelector('fieldset.engine', { timeout: 20_000 })
  await page.locator('fieldset.engine label', { hasText: 'Claude' }).click()
  await page.fill('#ask-input', 'Write a file named live-claude.txt containing exactly the word hi. Then stop.')
  const t0 = Date.now()
  await page.press('#ask-input', 'Enter')
  await page.waitForFunction(() => ['done', 'failed', 'stopped'].includes([...document.querySelectorAll('.drawer .turn')].pop()?.dataset.status), null, { timeout: 300_000 })
  const status = await page.locator('.drawer .turn').last().getAttribute('data-status')
  const who = (await page.locator('.drawer .turn').last().locator('.said-ola .who').innerText()).replace(/\s+/g, ' ').trim()
  const answer = await page.locator('.drawer .turn').last().locator('.said-ola').innerText()
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'live-drawer-claude.png') })
  if (!say(status === 'done' && who === 'Claude, outside this machine', `the reply came back marked "${who}" (${status}, ${Math.round((Date.now() - t0) / 1000)} s)`)) bad++
  console.log(`      reply: ${answer.replace(/\s+/g, ' ').slice(0, 200)}`)
  const file = spawnSync('/usr/local/bin/container', ['exec', `ola-${ID}`, 'cat', '/work/live-claude.txt'], { encoding: 'utf8' }).stdout.trim()
  if (!say(file === 'hi', `the file is in the sealed VM: live-claude.txt says "${file}"`)) bad++
  const lines = gw.log.split('\n').filter((l) => l.includes('"route":"claude"')).map((l) => JSON.parse(l))
  if (!say(lines.length > 0 && lines.every((l) => l.mode === 'oauth') && lines.some((l) => l.status === 200), `the gateway: ${lines.length} Claude requests, all in oauth mode (${lines.map((l) => `${l.status} ${l.model} ${l.tokens_in}/${l.tokens_out}`).join('; ')})`)) bad++
  const audit = JSON.parse(admin('audit', '--workspace', ID, '--json')).map((r) => r.action)
  if (!say(audit.includes('claude_enabled') && audit.includes('claude_used'), `audit: ${[...new Set(audit)].join(', ')}`)) bad++
  const vm = spawnSync('/usr/local/bin/container', ['exec', `ola-${ID}`, 'sh', '-c', 'env; cat /proc/1/environ | tr "\\0" "\\n"; grep -rIl . /work 2>/dev/null | head -300 | xargs cat 2>/dev/null'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout
  if (!say(!vm.includes(secret) && !gw.log.includes(secret) && !fd.log.includes(secret), 'the subscription token is nowhere in the VM, its files, or either log')) bad++
  await browser.close()
} catch (e) {
  bad++
  console.log(`FAIL  the live check ran to the end (${e?.message?.split('\n')[0]})`)
} finally {
  for (const k of kids) k.kill('SIGTERM')
  node('workspace/ws.mjs', ['destroy', ID, '--confirm', ID])
  rmSync(run, { recursive: true, force: true })
}
process.exit(bad ? 1 : 0)
