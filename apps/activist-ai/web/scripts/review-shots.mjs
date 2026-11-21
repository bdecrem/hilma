#!/usr/bin/env node
// Screenshots of every screen of the live app.ola.cx for a design review (OLA-312), at 390 x 844
// (WebKit, touch, as on Bart's phone in Safari) and 1280 x 800 (WebKit), signed in as a made-up
// person made through the test server's admin command over ssh (the same way cloud-publish-walk.mjs
// does it). Never Bart's account. The password is random and never printed.
//
//   node web/scripts/review-shots.mjs <dir> [--who revshot1] [--keep] [--cleanup]
//
// At the end (unless --keep) the project's computer is destroyed and the person suspended.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { webkit } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const OUT = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : 'review-shots')
const ORIGIN = 'https://app.ola.cx'
const SSH = process.env.OLA_WALK_SSH || 'admin@100.95.51.98'
const WHO = arg('--who', 'revshot1')
const ID = `${WHO}-test`
mkdirSync(OUT, { recursive: true })

const REMOTE = `
const fs = require('fs'), cp = require('child_process')
const env = { ...process.env, OLA_HOME: process.env.HOME + '/.ola' }
for (const l of fs.readFileSync(process.env.HOME + '/.ola/frontdesk.env', 'utf8').split('\\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const [tool, ...rest] = process.argv.slice(2)
const r = cp.spawnSync(process.execPath, [tool, ...rest], { env, encoding: 'utf8' })
process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status ?? 1)
`
function remote(tool, a, { ok = false } = {}) {
  const q = a.map((s) => `'${String(s).replace(/'/g, `'\\''`)}'`).join(' ')
  const cmd = `cd ~/ola-staging/current/apps/activist-ai && PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node - ${tool} ${q}`
  // On the test server itself (the mini) the command runs here; elsewhere over ssh.
  const r = existsSync(path.join(homedir(), 'ola-staging/current')) ? spawnSync('/bin/sh', ['-c', cmd], { input: REMOTE, encoding: 'utf8', timeout: 600_000 }) : spawnSync('ssh', ['-o', 'ConnectTimeout=15', SSH, cmd], { input: REMOTE, encoding: 'utf8', timeout: 600_000 })
  if (r.status !== 0 && !ok) throw new Error(`${tool} ${a[0]}: ${(r.stderr || '').trim().split('\n').pop()}`)
  return (r.stdout || '').trim()
}
const admin = (...a) => remote('frontdesk/admin.mjs', a)

function cleanup() {
  const listed = admin('list')
  if (new RegExp(`^workspace ${ID} `, 'm').test(listed)) remote('workspace/ws.mjs', ['destroy', ID, '--confirm', ID], { ok: true }), console.log(`cleanup: ${ID} destroyed`)
  if (new RegExp(`^person ${WHO} .* active`, 'm').test(listed)) admin('suspend', WHO), console.log(`cleanup: ${WHO} suspended`)
}
if (args.includes('--cleanup')) (cleanup(), process.exit(0))

const listed = admin('list')
if (new RegExp(`^person ${WHO} .* suspended`, 'm').test(listed)) throw new Error(`${WHO} was used before: pass --who <new name>`)
if (!new RegExp(`^person ${WHO} `, 'm').test(listed)) admin('add-person', WHO, '--name', 'Robin Example (made up)')
if (!new RegExp(`^workspace ${ID} `, 'm').test(listed)) admin('create-workspace', ID, '--name', 'Elm Street rent campaign', '--team', `${ID}-team`, '--team-name', 'Elm Street Tenants (made up)', '--owner', WHO, '--memory', '2g', '--disk', '2g', '--cpus', '2')
const link = admin('invite', WHO, '--hours', '2').split(/\s+/).find((w) => w.startsWith('https://'))
if (!link) throw new Error('no setup link')
const PASSWORD = randomBytes(12).toString('base64url')
const csv = path.join(OUT, 'members.csv')
writeFileSync(csv, 'name,city,joined\nAna Ruiz,Oakland,2025-03-01\nBo Chen,Berkeley,2025-04-12\nCy Diallo,Oakland,2025-06-30\nDee Park,Alameda,2025-07-02\n')

const log = []
const note = (s) => (console.log(s), log.push(s))
const b = await webkit.launch()
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, laptop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } }
try {
  // Signed out: the sign-in page and the setup page, both sizes.
  for (const [size, opt] of Object.entries(sizes)) {
    const c = await b.newContext(opt)
    const p = await c.newPage()
    await p.goto(ORIGIN, { waitUntil: 'networkidle' }).catch(() => {})
    await p.waitForTimeout(800)
    await p.screenshot({ path: path.join(OUT, `${size}-01-signin.png`) })
    await c.close()
  }
  const c = await b.newContext(sizes.phone)
  const p = await c.newPage()
  const snap = async (name, page = p, full = false) => (await page.waitForTimeout(700), await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }), note(`shot ${name}`))
  const step = async (name, fn) => { try { await fn() } catch (e) { note(`FAILED ${name}: ${e.message.split('\n')[0]}`) } }
  await p.goto(link)
  await p.waitForTimeout(800)
  await snap('phone-02-setup')
  await p.getByLabel('Choose a password').fill(PASSWORD)
  await p.getByRole('button', { name: 'Make my account' }).click()
  await p.waitForSelector('.project-title', { timeout: 90_000 })
  await p.waitForTimeout(3000)
  await snap('phone-03-project-opens')
  await step('menu', async () => { await p.getByRole('button', { name: /Menu/ }).first().click(); await snap('phone-04-menu'); await p.keyboard.press('Escape'); await p.waitForTimeout(300) })
  await step('add file', async () => {
    await p.goto(`${ORIGIN}/#/files`); await p.waitForTimeout(1500); await snap('phone-05-files-empty')
    const input = p.locator('input[type=file]').first()
    await input.setInputFiles(csv); await p.waitForTimeout(4000); await snap('phone-06-files-one')
  })
  await step('data', async () => { await p.goto(`${ORIGIN}/#/data`); await p.waitForTimeout(1500); await snap('phone-07-data') })
  await step('jobs', async () => { await p.goto(`${ORIGIN}/#/jobs`); await p.waitForTimeout(1500); await snap('phone-08-jobs') })
  await step('settings', async () => { await p.goto(`${ORIGIN}/#/settings`); await p.waitForTimeout(1500); await snap('phone-09-settings'); await snap('phone-09b-settings-full', p, true) })
  await step('account', async () => { await p.goto(`${ORIGIN}/#/account`); await p.waitForTimeout(1500); await snap('phone-10-account') })
  await step('projects', async () => { await p.goto(`${ORIGIN}/#/projects`); await p.waitForTimeout(1500); await snap('phone-11-projects') })
  await step('ask', async () => {
    await p.goto(`${ORIGIN}/#/`); await p.waitForTimeout(2500)
    await snap('phone-12-home-again')
    const input = p.locator('#ask-input')
    if (!(await input.isVisible())) await p.getByRole('button', { name: 'Ask Ola' }).first().click()
    await input.fill('how many members are in members.csv, by city?')
    await snap('phone-13-typed')
    await input.press('Enter')
    await p.waitForTimeout(8000); await snap('phone-14-working')
    await p.waitForFunction(() => ['done', 'failed'].includes([...document.querySelectorAll('.turn')].pop()?.dataset.status ?? ''), null, { timeout: 240_000 }).catch(() => note('no end of run in 240 s'))
    await snap('phone-15-answer'); await snap('phone-15b-answer-full', p, true)
  })
  const state = await c.storageState()
  await c.close()

  const l = await b.newContext({ ...sizes.laptop, storageState: state })
  const q = await l.newPage()
  for (const [name, hash] of [['laptop-03-project', '#/'], ['laptop-06-files', '#/files'], ['laptop-07-data', '#/data'], ['laptop-08-jobs', '#/jobs'], ['laptop-09-settings', '#/settings'], ['laptop-10-account', '#/account'], ['laptop-11-projects', '#/projects']]) {
    await step(name, async () => { await q.goto(`${ORIGIN}/${hash}`); await q.waitForTimeout(2500); await snap(name, q) })
  }
  await step('laptop menu', async () => { await q.goto(`${ORIGIN}/#/`); await q.waitForTimeout(2000); await q.getByRole('button', { name: /Menu/ }).first().click(); await snap('laptop-04-menu', q) })
  await step('laptop ask', async () => {
    await q.goto(`${ORIGIN}/#/`); await q.waitForTimeout(2000)
    const btn = q.getByRole('button', { name: 'Ask Ola' }).first()
    if (await btn.isVisible()) await btn.click()
    await q.waitForTimeout(800); await snap('laptop-12-conversation', q)
  })
  await l.close()
} finally {
  await b.close()
  writeFileSync(path.join(OUT, 'log.txt'), log.join('\n') + '\n')
  if (!args.includes('--keep')) { try { cleanup() } catch (e) { console.log(`cleanup FAILED: ${e.message}`) } }
}
