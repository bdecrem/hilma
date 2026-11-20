#!/usr/bin/env node
// Publish from a cloud project, walked the way a person does it, on the live test server (OLA-230):
//
//   A. Bart's own sentence, in a new conversation: "make a page that says Pat and publish it on ola".
//      Ola asks once, in the conversation, with the exact list of files and the address (the
//      Publish sheet's list); one yes; Ola's reply says the address, and the page answers at
//      https://sites.ola.cx/<project>/ with "Pat" on it. No trip to another screen. Fails if Ola
//      sends the person to press Publish, or asks in words as well;
//   B. Ola makes a second page without being asked to publish it; the person presses that page's own
//      Publish button, sees the list, publishes it again over the first, sees it live, then
//      Unpublish takes it down and the address answers 404.
//
//   node web/cloud-publish-walk.mjs [--origin https://app.ola.cx] [--shots <dir>] [--only A,B] [--keep] [--cleanup]
//
// Runs on the iMac (or any Mac with Playwright's chromium), at a phone's size (390 by 844),
// headless. The made-up person and project are made on the test server through its admin command
// over ssh (OLA_WALK_SSH, default admin@100.95.51.98): person `pubwalk`, project `pubwalk-test`
// (team `pubwalk-test-team`), a one-time invitation link, a password chosen here at random and never
// printed. At the end (unless --keep) the page is taken down, the project's computer destroyed and
// the person suspended; --cleanup does only that. Never Bart's account. Made-up words only.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt)
const ORIGIN = arg('--origin', 'https://app.ola.cx')
const SITES = process.env.OLA_WALK_SITES || 'https://sites.ola.cx'
const SSH = process.env.OLA_WALK_SSH || 'admin@100.95.51.98'
const ONLY = new Set(arg('--only', 'A,B').split(','))
const KEEP = args.includes('--keep')
const SHOTS = arg('--shots', path.join(homedir(), 'Desktop/Ola/cloud-publish', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')))
const WHO = process.env.OLA_WALK_WHO || 'pubwalk'
const ID = process.env.OLA_WALK_ID || 'pubwalk-test'
const TEAM = `${ID}-team`
const PAGE_URL = `${SITES}/${ID}/`
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

// ---------------------------------------------------------------- the test server's admin command
// The deployed release's admin CLI with the front desk's settings, read the way ops/ola.mjs reads
// them; the program goes over stdin so nothing needs quoting twice. Output is returned, never printed
// here (an invitation link is a one-time key).
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

async function cleanup() {
  const sites = admin('sites')
  if (new RegExp(`^${ID}\\s`, 'm').test(sites) && !new RegExp(`^${ID}\\s.*nothing up`, 'm').test(sites)) console.log(`cleanup: ${admin('unpublish', ID).split('\n').pop()}`)
  const listed = admin('list')
  if (new RegExp(`^workspace ${ID} `, 'm').test(listed)) {
    remote('workspace/ws.mjs', ['destroy', ID, '--confirm', ID], { ok: true })
    console.log(`cleanup: the project's computer ${ID} destroyed`)
  }
  if (new RegExp(`^person ${WHO} .* active`, 'm').test(listed)) admin('suspend', WHO), console.log(`cleanup: ${WHO} suspended`)
  const code = await status(PAGE_URL)
  console.log(`cleanup: ${PAGE_URL} answers ${code}`)
}
async function status(url) {
  try {
    return (await fetch(url, { redirect: 'manual', cache: 'no-store' })).status
  } catch (e) {
    return `error ${e.message}`
  }
}
if (args.includes('--cleanup')) {
  await cleanup()
  process.exit(0)
}

// ---------------------------------------------------------------- the made-up person and project
// A walk's person is suspended at its end and never reused: the next walk takes the next name
// (pubwalk, pubwalk2, …; OLA_WALK_WHO overrides), with a project of its own.
{
  const listed = admin('list')
  if (new RegExp(`^person ${WHO} .* suspended`, 'm').test(listed)) throw new Error(`${WHO} was suspended by an earlier walk: run with OLA_WALK_WHO=<a new name> OLA_WALK_ID=<a new project>`)
  if (!new RegExp(`^person ${WHO} `, 'm').test(listed)) admin('add-person', WHO, '--name', 'Pat Walker (made up)')
  if (!new RegExp(`^workspace ${ID} `, 'm').test(listed)) admin('create-workspace', ID, '--name', 'Made-up tenants’ meeting', '--team', TEAM, '--team-name', 'Made-up Elm Street Tenants', '--owner', WHO, '--memory', '2g', '--disk', '2g', '--cpus', '2')
}
const link = admin('invite', WHO, '--hours', '2').split(/\s+/).find((w) => w.startsWith('https://'))
if (!link) throw new Error('no setup link from the admin command')
const PASSWORD = `made up ${randomBytes(9).toString('base64url')} walk`

// ---------------------------------------------------------------- steps
const results = []
const inWordsSeen = () => results.some((r) => /FIRST ASKED IN WORDS/.test(r.detail ?? ''))
let page
let ctx
let failed = false
async function step(name, limitS, fn) {
  if (failed) return results.push({ name, ok: false, detail: 'skipped: an earlier step failed' }), console.log(`skip  ${name}`)
  const t0 = Date.now()
  let ok = true
  let detail = ''
  try {
    detail = (await Promise.race([fn(), sleep(limitS * 1000).then(() => Promise.reject(new Error(`took more than ${limitS} s`)))])) ?? ''
  } catch (e) {
    ok = false
    failed = true
    detail = String(e?.message ?? e).split('\n')[0].slice(0, 400)
  }
  const n = String(results.length).padStart(2, '0')
  await page?.screenshot({ path: path.join(SHOTS, `${n}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 50)}.png`), fullPage: false }).catch(() => {})
  results.push({ name, ok, ms: Date.now() - t0, detail })
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}  ${((Date.now() - t0) / 1000).toFixed(1)} s${detail ? `  (${detail})` : ''}`)
}
const answerText = async () => ((await page.locator('.drawer .turn').last().locator('.said-ola').innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
async function openDrawer() {
  if (!(await page.locator('.drawer.open').count())) {
    const tab = page.getByRole('tab', { name: /Conversation/ })
    if (await tab.isVisible().catch(() => false)) await tab.click()
    else await page.locator('.askbar-open').click()
  }
  await page.locator('.drawer.open').waitFor({ timeout: 5000 })
}
async function ask(text, { fresh = true } = {}) {
  await openDrawer()
  if (fresh && (await page.locator('.drawer .turn').count())) {
    await page.getByRole('button', { name: 'New conversation' }).click()
    await until(async () => (await page.locator('.drawer .turn').count()) === 0, 10_000, 'a new conversation')
  }
  const before = await page.locator('.drawer .turn').count()
  await page.locator('#ask-input').fill(text)
  await page.locator('.composer button[type="submit"]').click()
  await until(async () => (await page.locator('.drawer .turn').count()) > before, 20_000, 'the request in the conversation')
}
/** Waits for the newest turn to end, answering approval sheets and Ola's question cards. */
async function finishRun(limitMs, { sheet = () => 'Yes, this once', card = () => null } = {}) {
  const asked = []
  const end = Date.now() + limitMs
  while (Date.now() < end) {
    const dlg = page.locator('dialog.approval[open]')
    if (await dlg.count()) {
      const title = (await dlg.locator('.sheet-title').innerText()).replace(/\s+/g, ' ')
      if (/publish this on the web/i.test(title)) {
        // Ola's publish question: the list comes from the server's own check, then one yes.
        const yes = dlg.getByRole('button', { name: /^Publish these / })
        await yes.waitFor({ timeout: 60_000 })
        await sleep(500)
        await page.screenshot({ path: path.join(SHOTS, `asked-${asked.length + 1}-publish.png`) })
        const files = await dlg.locator('.publish-files .publish-name').allInnerTexts()
        const address = (await dlg.locator('.publish-address').innerText()).replace(/\s+/g, ' ')
        asked.push(`publish sheet: ${address}; ${files.join(', ')} → ${await yes.innerText()}`)
        await yes.click()
        await until(async () => !(await page.locator('dialog.approval[open]').count()), 15_000, 'the publish question closing')
        continue
      }
      const button = sheet(title)
      asked.push(`sheet "${title}" → ${button}`)
      await sleep(600)
      await page.screenshot({ path: path.join(SHOTS, `asked-${asked.length}.png`) })
      await dlg.getByRole('button', { name: button }).click()
      await until(async () => !(await page.locator('dialog.approval[open]').count()), 10_000, 'the sheet closing')
      continue
    }
    const q = page.locator('.drawer .question-card').last()
    if ((await q.count()) && !(await q.getAttribute('aria-busy').catch(() => null))?.includes('true')) {
      const text = (await q.innerText()).replace(/\s+/g, ' ')
      const options = await q.locator('.question-option-label').allInnerTexts()
      const pick = card(text, options) ?? options.find((o) => /^(yes|publish|go ahead|ok)/i.test(o)) ?? options[0]
      await page.screenshot({ path: path.join(SHOTS, `asked-${asked.length + 1}.png`) })
      if (pick) {
        asked.push(`card "${text.slice(0, 160)}" → ${pick}`)
        await q.locator('.question-option').filter({ hasText: pick }).first().click()
      } else {
        asked.push(`card "${text.slice(0, 160)}" → typed yes`)
        await q.locator('.question-own input').fill('Yes')
        await q.locator('.question-own').getByRole('button', { name: 'Answer' }).click()
      }
      await until(async () => (await page.locator('.drawer .question-card').count()) === 0 || (await q.getAttribute('aria-busy')) === 'true', 15_000, 'the answer going')
      await sleep(1500)
      continue
    }
    const st = await page.locator('.drawer .turn').last().getAttribute('data-status')
    if (st && st !== 'working' && st !== 'sending') return { status: st, asked }
    await sleep(700)
  }
  throw new Error(`the run did not end in ${Math.round(limitMs / 1000)} s (asked: ${asked.join('; ') || 'nothing'})`)
}
async function toThings() {
  const tab = page.getByRole('tab', { name: /Made by Ola/ })
  if (await tab.isVisible().catch(() => false)) return tab.click()
  await page.getByRole('button', { name: 'Close the drawer' }).click()
}
/** The address, read three times over six seconds: the status and whether the page says `words`. */
async function live(words) {
  const seen = []
  for (let i = 0; i < 3; i++) {
    const r = await fetch(PAGE_URL, { cache: 'no-store' }).catch((e) => ({ status: `error ${e.message}`, text: async () => '' }))
    const body = await r.text()
    seen.push(`${r.status}${r.status === 200 ? (words.test(body) ? ' with the page' : ' but NOT the page') : ''}`)
    if (i < 2) await sleep(3000)
  }
  return seen
}
/** Presses the page's own Publish, checks the list in the sheet, and says yes. */
async function publishFromCard(match, { again = false } = {}) {
  await toThings()
  await page.reload()
  await page.waitForSelector('.project-title')
  await toThings().catch(() => {})
  const card = page.locator('.thing').filter({ has: page.locator('.thing-publish') }).filter({ hasText: match })
  await until(() => card.count(), 20_000, `a page matching ${match} with a Publish button on the project`)
  await card.first().scrollIntoViewIfNeeded()
  await card.first().locator('.thing-publish').click()
  const sheet = page.locator('dialog.publish-sheet[open]')
  await sheet.waitFor({ timeout: 10_000 })
  const yes = sheet.getByRole('button', { name: again ? /^Publish these .* again$/ : /^Publish these / })
  await yes.waitFor({ timeout: 60_000 })
  await sleep(500)
  await page.screenshot({ path: path.join(SHOTS, `sheet-${again ? 'again' : 'first'}.png`) })
  const files = await sheet.locator('.publish-files .publish-name').allInnerTexts()
  const address = (await sheet.locator('.publish-address').innerText()).replace(/\s+/g, ' ')
  if (!files.includes('index.html')) throw new Error(`the list has no index.html: ${files.join(', ')}`)
  if (!address.includes(`sites.ola.cx/${ID}/`)) throw new Error(`the sheet's address: ${address}`)
  await yes.click()
  await sheet.locator('.publish-done').waitFor({ timeout: 360_000 })
  const done = (await sheet.locator('.publish-done').innerText()).replace(/\s+/g, ' ')
  return { files, done }
}

const { chromium } = await import('playwright')
const browser = await chromium.launch()
try {
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page = await ctx.newPage()
  await step('sign in from a setup link: choose a password, land in the project', 60, async () => {
    await page.goto(link)
    await page.getByLabel('Choose a password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Make my account' }).click()
    await page.waitForSelector('.project-title', { timeout: 45_000 })
    await page.waitForSelector('.empty-title, .thing, .drawer.open #ask-input', { timeout: 45_000 })
    return `"${await page.locator('.project-title').innerText()}"`
  })

  if (ONLY.has('A')) {
    await step('A: "make a page that says Pat and publish it on ola": one yes in the conversation, Ola says the address, the page is live', 900, async () => {
      await ask('make a page that says Pat and publish it on ola')
      let r = await finishRun(600_000)
      let reply = await answerText()
      writeFileSync(path.join(SHOTS, 'A-reply-1.txt'), reply)
      const sentAway = /press .?publish|tap .?publish|find .{0,40} under pages/i.test(reply)
      const inWords = !r.asked.some((a) => a.startsWith('publish sheet')) && /\?\s*$/.test(reply)
      if (sentAway) throw new Error(`Ola sent the person to press Publish: ${reply.slice(0, 300)}`)
      if (inWords) {
        // Ola asked in words instead of with the question: noted as a failure of "one yes", then answered.
        await ask('Yes', { fresh: false })
        r = await finishRun(300_000)
        reply = await answerText()
        writeFileSync(path.join(SHOTS, 'A-reply-2.txt'), reply)
      }
      if (r.status !== 'done') throw new Error(`the run ended "${r.status}": ${reply.slice(0, 200)}`)
      if (!r.asked.some((a) => a.startsWith('publish sheet'))) throw new Error(`no publish question in the conversation; asked: ${r.asked.join('; ') || 'nothing'}; reply: ${reply.slice(0, 300)}`)
      if (!reply.includes(`sites.ola.cx/${ID}`)) throw new Error(`Ola's reply does not say the address: ${reply.slice(0, 300)}`)
      const seen = await live(/\bPat\b/)
      if (!seen.every((x) => x === '200 with the page')) throw new Error(`${PAGE_URL}: ${seen.join(', ')}`)
      return `${inWords ? 'FIRST ASKED IN WORDS; ' : ''}asked: ${r.asked.join('; ')}; reply: ${reply.slice(0, 240)}; ${PAGE_URL}: ${seen.join(', ')}`
    })
    if (inWordsSeen()) failed = true
  }

  if (ONLY.has('B')) {
    failed = false
    await step('B: Ola makes a second page, nothing said about publishing', 600, async () => {
      await ask('Make a one-page flyer as an HTML file called flyer.html for our Saturday book swap at 10 am in the Elm Street courtyard. Do not publish it.')
      const r = await finishRun(590_000)
      if (r.status !== 'done') throw new Error(`the run ended "${r.status}": ${(await answerText()).slice(0, 200)}`)
      return `asked: ${r.asked.join('; ') || 'nothing'}`
    })
    await step('B: the flyer’s own Publish button: the list, yes, live at sites.ola.cx', 420, async () => {
      const { files, done } = await publishFromCard(/flyer/i, { again: ONLY.has('A') })
      const seen = await live(/book swap|saturday/i)
      if (!seen.every((s) => s === '200 with the page')) throw new Error(`the sheet said "${done}"; the address: ${seen.join(', ')}`)
      return `files: ${files.join(', ')}; sheet: "${done}"; ${PAGE_URL}: ${seen.join(', ')}`
    })
    await step('B: Unpublish from the sheet, the address answers 404', 420, async () => {
      const sheet = page.locator('dialog.publish-sheet[open]')
      await sheet.getByRole('button', { name: 'Unpublish' }).click()
      await sheet.getByRole('button', { name: 'Yes, take it down now' }).click()
      await sheet.locator('.publish-done').filter({ hasText: 'Taken down' }).waitFor({ timeout: 360_000 })
      const seen = []
      for (let i = 0; i < 3; i++) seen.push(await status(PAGE_URL)), i < 2 && (await sleep(3000))
      if (!seen.every((s) => s === 404)) throw new Error(`the address after Unpublish: ${seen.join(', ')}`)
      return `${PAGE_URL}: ${seen.join(', ')}`
    })
  }
} finally {
  await browser.close()
  writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(results, null, 2))
  if (!KEEP) await cleanup().catch((e) => console.log(`cleanup FAILED: ${e.message}`))
  console.log(`screenshots: ${SHOTS}`)
}
process.exit(results.every((r) => r.ok) ? 0 : 1)
