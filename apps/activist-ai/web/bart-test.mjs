#!/usr/bin/env node
// The Bart Test (OLA-446): one sentence, typed into Ola the way Bart types it, on a phone-size
// screen, timed from Send to the finished page. Bart, Nov 25: "do the Bart Test: build me a Good
// Morning web page with the weather in Santa Cruz today."
//
//   node web/bart-test.mjs ["the request"] [--studio] [--shots <dir>] [--limit 1800] [--keep] [--cleanup]
//
// Runs on the iMac, headless. A made-up person and project are made on the server through its
// admin command over ssh (OLA_WALK_SSH), a one-time invitation link, a random password never
// printed. Every sheet Ola raises is answered "once"; a question card gets its first option.
// What comes out, in --shots (default ~/Desktop/Ola/bart-test/<time>): a screenshot at each step,
// Ola's reply, the page Ola made as page.html and as a picture, and result.json with the time.
//
// --studio: the Mac Studio's Ola has no public address yet, and its secure front accepts only
// connections that start with a PROXY line. So a small forwarder is started there for the length
// of the walk (it adds that line), reached through an ssh tunnel, and the browser is told that
// app.ola.cx is that tunnel. Nothing on the Studio is changed and nothing stays behind.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt)
const STUDIO = args.includes('--studio')
const REQUEST = args.find((a, i) => !a.startsWith('--') && !['--shots', '--limit'].includes(args[i - 1])) || 'build me a Good Morning web page with the weather in Santa Cruz today'
const ORIGIN = 'https://app.ola.cx'
const SSH = process.env.OLA_WALK_SSH || (STUDIO ? 'ola@100.100.60.59' : 'admin@100.95.51.98')
const WHO = process.env.OLA_WALK_WHO || 'barttest'
const ID = process.env.OLA_WALK_ID || 'bart-test'
const LIMIT = Number(arg('--limit', 1800))
const KEEP = args.includes('--keep')
const SHOTS = arg('--shots', path.join(homedir(), 'Desktop/Ola/bart-test', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')))
const SHIM_PORT = 4799
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms, what) {
  const end = Date.now() + ms
  for (;;) {
    try {
      if (await fn()) return
    } catch {}
    if (Date.now() > end) throw new Error(`waited ${Math.round(ms / 1000)} s for ${what}`)
    await sleep(400)
  }
}

// The server's admin command with the front desk's settings (as in cloud-publish-walk.mjs).
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
  const r = spawnSync('ssh', ['-o', 'ConnectTimeout=15', SSH, `cd ~/ola-staging/current/apps/activist-ai && PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node - ${tool} ${q}`], { input: REMOTE, encoding: 'utf8', timeout: 600_000 })
  if (r.status !== 0 && !ok) throw new Error(`${tool} ${a[0]}: ${(r.stderr || '').trim().split('\n').pop()}`)
  return (r.stdout || '').trim()
}
const admin = (...a) => remote('frontdesk/admin.mjs', a)

function cleanup() {
  const listed = admin('list')
  if (new RegExp(`^workspace ${ID} `, 'm').test(listed)) remote('workspace/ws.mjs', ['destroy', ID, '--confirm', ID], { ok: true }), console.log(`cleanup: the project's computer ${ID} destroyed`)
  if (new RegExp(`^person ${WHO} .* active`, 'm').test(listed)) admin('suspend', WHO), console.log(`cleanup: ${WHO} suspended`)
}
if (args.includes('--cleanup')) {
  cleanup()
  process.exit(0)
}

// ---------------------------------------------------------------- the way in on the Studio
let shim
if (STUDIO) {
  const code = `const net=require('net');net.createServer(c=>{const u=net.connect(4743,'127.0.0.1',()=>{u.write('PROXY TCP4 127.0.0.1 127.0.0.1 '+(c.remotePort||50000)+' 4743\\r\\n');c.pipe(u);u.pipe(c)});const end=()=>{c.destroy();u.destroy()};c.on('error',end);u.on('error',end)}).listen(${SHIM_PORT},'127.0.0.1',()=>console.log('shim up'));process.stdin.resume();process.stdin.on('end',()=>process.exit(0))`
  shim = spawn('ssh', ['-o', 'ConnectTimeout=15', '-o', 'ExitOnForwardFailure=yes', '-L', `${SHIM_PORT}:127.0.0.1:${SHIM_PORT}`, SSH, `/opt/homebrew/bin/node -e "${code.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`], { stdio: ['pipe', 'pipe', 'inherit'] })
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('the forwarder on the Studio did not start')), 20_000)
    shim.stdout.on('data', (d) => String(d).includes('shim up') && (clearTimeout(t), res()))
    shim.on('exit', () => rej(new Error('the ssh tunnel ended')))
  })
}
const stopShim = () => shim && (shim.stdin.end(), shim.kill())

// ---------------------------------------------------------------- the made-up person and project
{
  const listed = admin('list')
  if (new RegExp(`^person ${WHO} .* suspended`, 'm').test(listed)) throw new Error(`${WHO} was suspended by an earlier run: use OLA_WALK_WHO=<a new name> OLA_WALK_ID=<a new project>`)
  if (!new RegExp(`^person ${WHO} `, 'm').test(listed)) admin('add-person', WHO, '--name', 'Bart Test (made up)')
  if (!new RegExp(`^workspace ${ID} `, 'm').test(listed)) admin('create-workspace', ID, '--name', 'Good morning', '--team', `${ID}-team`, '--team-name', 'Bart Test', '--owner', WHO, '--memory', '4g', '--disk', '4g', '--cpus', '4')
}
const link = admin('invite', WHO, '--hours', '2').split(/\s+/).find((w) => w.startsWith('https://'))
if (!link) throw new Error('no setup link from the admin command')
const PASSWORD = `made up ${randomBytes(9).toString('base64url')} walk`

const result = { request: REQUEST, server: STUDIO ? 'Mac Studio' : SSH, steps: [] }
let page
let n = 0
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${String(n++).padStart(2, '0')}-${name}.png`) }).catch(() => {})
const note = (name, t0, detail = '') => (result.steps.push({ name, s: +((Date.now() - t0) / 1000).toFixed(1), detail }), console.log(`${name}  ${((Date.now() - t0) / 1000).toFixed(1)} s${detail ? `  (${detail})` : ''}`))

const { chromium } = await import('playwright')
const browser = await chromium.launch({ args: STUDIO ? [`--host-resolver-rules=MAP app.ola.cx 127.0.0.1:${SHIM_PORT}`] : [] })
let failed = null
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page = await ctx.newPage()
  let t0 = Date.now()
  await page.goto(link)
  await page.getByLabel('Choose a password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Make my account' }).click()
  await page.waitForSelector('.project-title', { timeout: 90_000 })
  await page.waitForSelector('.made-none, .thing, #ask-input', { state: 'attached', timeout: 90_000 })
  await shot('signed-in')
  note('signed in from the invitation link', t0)

  // The request, exactly as typed.
  // A phone opens on the conversation; a wider screen needs the tab or the ask bar first.
  if (!(await page.locator('#ask-input:visible').count())) {
    await sleep(1500)
    const tab = page.getByRole('tab', { name: /Conversation/ })
    if (await page.locator('#ask-input:visible').count()) {
    } else if (await tab.isVisible().catch(() => false)) await tab.click()
    else await page.locator('.askbar-open').click({ timeout: 5000 }).catch(() => {})
  }
  // A new project's computer can take a minute to start; "Opening your project…" shows meanwhile.
  await until(async () => !(await page.getByText('Opening your project').count()) && !(await page.getByText('Lost the connection').count()), 240_000, 'the project to open')
  if (!(await page.locator('#ask-input:visible').count())) await page.locator('.askbar-open, .askbar input, .askbar textarea').first().click({ timeout: 5000 }).catch(() => {})
  await page.locator('#ask-input:visible').waitFor({ timeout: 30_000 })
  await page.locator('#ask-input').fill(REQUEST)
  await shot('typed')
  t0 = Date.now()
  await page.locator('.composer button[type="submit"]').click()
  await until(async () => (await page.locator('.turn').count()) > 0, 30_000, 'the request in the conversation')

  const asked = []
  let status = null
  let lastShot = 0
  while (Date.now() - t0 < LIMIT * 1000) {
    const dlg = page.locator('dialog.approval[open]')
    if (await dlg.count()) {
      const title = (await dlg.locator('.sheet-title').innerText().catch(() => '')).replace(/\s+/g, ' ')
      const names = await dlg.getByRole('button').allInnerTexts()
      const pick = names.find((b) => /once/i.test(b)) ?? names.find((b) => /^(yes|allow|ok)/i.test(b)) ?? names[0]
      await shot(`asked-${asked.length + 1}`)
      asked.push(`${Math.round((Date.now() - t0) / 1000)} s: sheet "${title}" → ${pick}`)
      await dlg.getByRole('button', { name: pick, exact: true }).first().click()
      await until(async () => !(await page.locator('dialog.approval[open]').count()), 15_000, 'the sheet closing').catch(() => {})
      continue
    }
    const q = page.locator('.question-card').last()
    if ((await q.count()) && !(await q.getAttribute('aria-busy').catch(() => null))?.includes('true')) {
      const text = (await q.innerText()).replace(/\s+/g, ' ')
      const options = await q.locator('.question-option-label').allInnerTexts()
      await shot(`asked-${asked.length + 1}`)
      if (options[0]) {
        asked.push(`${Math.round((Date.now() - t0) / 1000)} s: card "${text.slice(0, 200)}" → ${options[0]}`)
        await q.locator('.question-option').filter({ hasText: options[0] }).first().click()
      } else {
        asked.push(`${Math.round((Date.now() - t0) / 1000)} s: card "${text.slice(0, 200)}" → typed: you choose`)
        await q.locator('.question-own input').fill('You choose')
        await q.locator('.question-own').getByRole('button', { name: 'Answer' }).click()
      }
      await sleep(2500)
      continue
    }
    const st = await page.locator('.turn').last().getAttribute('data-status')
    if (st && st !== 'working' && st !== 'sending') {
      status = st
      break
    }
    if (Date.now() - lastShot > 60_000) (lastShot = Date.now()), await shot('working')
    await sleep(700)
  }
  result.seconds = +((Date.now() - t0) / 1000).toFixed(1)
  result.status = status ?? `not finished in ${LIMIT} s`
  result.asked = asked
  await sleep(1500)
  await shot('finished')
  const reply = ((await page.locator('.turn').last().locator('.said-ola').innerText().catch(() => '')) || '').trim()
  result.reply = reply
  writeFileSync(path.join(SHOTS, 'reply.txt'), reply)
  note(`Send to "${result.status}"`, t0, `${asked.length} question(s)`)

  // The page, opened the way a person opens it: the link under the reply.
  const open = page.locator('.turn').last().locator('.made-pages a, .made-pictures a').filter({ hasText: /\.html?/ }).first()
  if (await open.count()) {
    result.pageName = (await open.innerText()).trim()
    const popup = ctx.waitForEvent('page', { timeout: 15_000 }).catch(() => null)
    await open.click()
    const tab = (await popup) ?? page
    await tab.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    await sleep(3000)
    const frame = tab.frames().find((f) => f.url().includes('/v/')) ?? tab.mainFrame()
    result.pageUrl = frame.url().replace(/[?#].*/, '')
    writeFileSync(path.join(SHOTS, 'page.html'), await frame.content())
    result.pageText = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 1500)
    await tab.screenshot({ path: path.join(SHOTS, 'page-in-ola.png') })
    await tab.screenshot({ path: path.join(SHOTS, 'page-in-ola-full.png'), fullPage: true })
  } else result.pageName = null
} catch (e) {
  failed = String(e?.message ?? e).split('\n')[0].slice(0, 500)
  result.error = failed
  await shot('error')
  result.screenWords = (await page?.locator('body').innerText().catch(() => ''))?.replace(/\s+/g, ' ').slice(0, 800)
} finally {
  await browser.close()
  writeFileSync(path.join(SHOTS, 'result.json'), JSON.stringify(result, null, 2))
  if (!KEEP) try { cleanup() } catch (e) { console.log(`cleanup failed: ${e.message}`) }
  stopShim()
}
console.log(JSON.stringify({ ...result, reply: result.reply?.slice(0, 600), shots: SHOTS }, null, 2))
process.exit(failed || result.status !== 'done' ? 1 : 0)
