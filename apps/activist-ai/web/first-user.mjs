#!/usr/bin/env node
// The first-user check: a person who has never seen Ola, with no patience, walks three journeys
// end to end on a fresh copy of everything, with the real everyday model:
//
//   A. invited by link: makes a passkey, lands in an empty project, asks for a hello-world page,
//      answers what Ola asks, sees the page and Opens it;
//   B. uploads a small messy spreadsheet, asks a question whose honest answer needs a caveat,
//      gets a chart and an Excel file, Opens both, finds them again on the project home;
//   D. asks something that needs the web: the search card (Allow once), the download card, the
//      saved source in Files and in Data.
//
//   node web/first-user.mjs [--fake-model] [--keep] [--shots <dir>] [--only A,B,D] [--runs webkit@1280,chromium@390]
//
// Run on the machine that hosts the projects (the Mac mini), from apps/activist-ai, after `npm ci`
// in web/ and frontdesk/ and `npx playwright install chromium webkit`. Its own everything: the
// gateway (port OLA_FU_GW_PORT, 4893) with the real everyday model on Together (OLA_FU_MODEL; the
// key from TOGETHER_API_KEY or ~/Documents/code/hilma/.env.local, never printed), a scripted Claude,
// the made-up search provider, the front desk (OLA_FU_FD_PORT, 4891), state in ~/.ola-first-user,
// one small project per run (`fu1-a`, `fu1-b`), all destroyed at the end. Only made-up data. One real
// outside download (the made-up search's one real result, a UN PDF).
//
// It fails when a step fails, when a step takes longer than its limit (OLA_FU_SLOW=1.5 scales them
// all), or when a forbidden word (FORBIDDEN below: the machine's words, not the person's) is on the
// screen. The person's own requests are left out of that scan; Ola's replies are not, because the
// person reads them too, and those hits are named "in Ola's reply" so they can be told apart.
// A screenshot and the screen's words are saved at every step (--shots, default a temp folder).
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeModel } from './server/fake-model.mjs'
import { startFakeAnthropic } from './server/fake-anthropic.mjs'
import { SoftAuthn } from '../frontdesk/review/softauthn.mjs'

const AI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt)
const FAKE = args.includes('--fake-model')
const KEEP = args.includes('--keep')
const ONLY = new Set(arg('--only', 'A,B,D').split(','))
const RUNS = arg('--runs', 'webkit@1280,chromium@390').split(',').map((r) => ({ engine: r.split('@')[0], width: Number(r.split('@')[1] || 1280) }))
const SHOTS = arg('--shots', mkdtempSync(path.join(tmpdir(), 'ola-first-user-shots-')))
const MODEL = process.env.OLA_FU_MODEL || 'nvidia/NVIDIA-Nemotron-3.5-Super-VL'
const SLOW = Number(process.env.OLA_FU_SLOW || 1)
const FD_PORT = Number(process.env.OLA_FU_FD_PORT || 4891)
const GW_PORT = Number(process.env.OLA_FU_GW_PORT || 4893)
const TAG = process.env.OLA_FU_TAG || 'fu1'
const ORIGIN = `http://localhost:${FD_PORT}`
mkdirSync(SHOTS, { recursive: true })

// Words a person should never read: the machine's words. The interface's own vocabulary is
// "Ola", "this machine", "your project", "Data", "Files", "Settings".
export const FORBIDDEN = ['workspace', 'gateway', 'VM', 'virtual machine', 'sandbox', 'front desk', 'frontdesk', 'opencode', 'token', 'tokens', 'container', 'endpoint', 'API', 'LLM', 'prompt', 'localhost', 'session', 'sessions', 'upstream', 'payload', 'null', 'undefined', 'NaN', '[object Object]', 'stdout', 'stderr', 'exit code', 'ENOENT', 'EACCES', 'traceback', '/work/']
const forbiddenIn = (text) =>
  FORBIDDEN.filter((w) => (/^[A-Za-z ]+$/.test(w) ? new RegExp(`\\b${w}\\b`, w === w.toUpperCase() ? '' : 'i') : { test: (t) => t.includes(w) }).test(text))

// ---------------------------------------------------------------- made-up data
// A small messy spreadsheet: a food bank's visit log with one exact duplicate row and two blank
// household counts, so an honest total needs a caveat. Right answers: 9 distinct visits with a
// count, North 3 visits / 11 households, South 2 / 9, East 2 / 7 (counting the blanks as unknown).
const CSV = [
  'date,site,households,volunteer',
  '2026-10-01,North,4,Ana',
  '2026-10-01,North,4,Ana',
  '2026-10-02,South,5,Ben',
  '2026-10-03,East,,Cy',
  '2026-10-05,North,3,Ana',
  '2026-10-06,South,4,Dee',
  '2026-10-08,East,3,Cy',
  '2026-10-09,North,4,Ben',
  '2026-10-10,East,4,Cy',
  '2026-10-12,South,,Dee',
  '',
].join('\n')

// ---------------------------------------------------------------- the stack
const HOME = path.join(homedir(), '.ola-first-user')
rmSync(HOME, { recursive: true, force: true })
mkdirSync(HOME, { recursive: true, mode: 0o700 })
const env = {
  ...process.env,
  OLA_HOME: HOME,
  OLA_GATEWAY_PORT: String(GW_PORT),
  OLA_MAX_RUNNING: '2',
  OLA_RUNNING_SCOPE: 'home',
  OLA_FD_DATA: path.join(HOME, 'fd'),
  OLA_FD_ORIGIN: ORIGIN,
  OLA_FD_PORT: String(FD_PORT),
  OLA_FD_GATEWAY_USAGE_TOKEN: randomBytes(24).toString('hex'),
  OLA_FD_COMPARE_PREFIX: `${TAG}c`,
  OLA_FD_CANDIDATES_DIR: path.join(HOME, 'candidates'),
  OLA_FD_COMPARE_TICK_MS: '86400000',
  OLA_FD_MODEL_LABEL: FAKE ? 'a scripted model' : MODEL.split('/').pop(),
  // OLA_FU_IDLE_MIN=1: the project sleeps after a minute (journey I watches it wake).
  ...(process.env.OLA_FU_IDLE_MIN ? { OLA_FD_IDLE_STOP_MIN: process.env.OLA_FU_IDLE_MIN } : {}),
}
const node = (script, argv) => spawnSync(process.execPath, [path.join(AI, script), ...argv], { env, encoding: 'utf8' })
const admin = (...a) => {
  const r = node('frontdesk/admin.mjs', a)
  if (r.status !== 0) throw new Error(`admin ${a[0]}: ${r.stderr.trim().split('\n').pop()}`)
  return r.stdout.trim()
}
function together() {
  if (process.env.TOGETHER_API_KEY) return process.env.TOGETHER_API_KEY
  const line = readFileSync(path.join(homedir(), 'Documents/code/hilma/.env.local'), 'utf8').split('\n').find((l) => l.startsWith('TOGETHER_API_KEY='))
  if (!line) throw new Error('no TOGETHER_API_KEY')
  return line.slice('TOGETHER_API_KEY='.length).replace(/^["']|["']$/g, '').trim()
}
const children = []
function start(script, extra = {}) {
  const p = spawn(process.execPath, [path.join(AI, script)], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  p.log = ''
  const keep = (d) => (p.log = (p.log + d).slice(-40000))
  p.stdout.on('data', keep)
  p.stderr.on('data', keep)
  children.push(p)
  return p
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms, what) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const v = await fn()
      if (v) return v
    } catch {}
    await sleep(250)
  }
  throw new Error(`${what}: nothing after ${Math.round(ms / 1000)} s`)
}

const IDS = RUNS.map((_, i) => `${TAG}-${String.fromCharCode(97 + i)}`)
for (const id of IDS) node('workspace/ws.mjs', ['destroy', id, '--confirm', id])
const fakeClaude = await startFakeAnthropic()
fakeClaude.server.unref()
let fake = null
if (FAKE) {
  fake = await startFakeModel()
  fake.server.unref()
}
RUNS.forEach((r, i) => {
  const who = `${TAG}p${i}`
  admin('add-person', who, '--name', ['Rosa Made-up', 'Tomas Made-up', 'Ines Made-up'][i % 3])
  admin('create-workspace', IDS[i], '--name', 'Made-up food bank', '--team', `${TAG}-team-${i}`, '--team-name', 'Made-up Neighbors’ Pantry', '--owner', who, '--memory', '2g', '--disk', '2g', '--cpus', '2')
  r.who = who
  r.team = `${TAG}-team-${i}`
  r.id = IDS[i]
})
const gw = start('gateway/server.mjs', {
  HOME: homedir(),
  ...(FAKE
    ? { UPSTREAM_BASE_URL: `http://127.0.0.1:${fake.port}/v1`, UPSTREAM_API_KEY: 'fake-model-key-not-a-secret', GATEWAY_MODELS: 'general=fake' }
    : { UPSTREAM_BASE_URL: 'https://api.together.xyz/v1', UPSTREAM_API_KEY: together(), GATEWAY_MODELS: `general=${MODEL}` }),
  GATEWAY_PORT: String(GW_PORT),
  GATEWAY_TOKENS_FILE: path.join(HOME, 'gateway-tokens'),
  GATEWAY_DOOR_DIR: path.join(HOME, 'gw'),
  GATEWAY_DB: path.join(HOME, 'usage.db'),
  GATEWAY_CLAUDE_FILE: path.join(HOME, 'gateway-claude'),
  GATEWAY_CLAUDE_UPSTREAM: fakeClaude.url,
  CLAUDE_API_KEY: 'sk-made-up-key-for-the-stand-in-0000',
  GATEWAY_USAGE_TOKEN: env.OLA_FD_GATEWAY_USAGE_TOKEN,
  GATEWAY_WEB_FILE: path.join(HOME, 'gateway-web'),
  GATEWAY_SEARCH_PROVIDER: 'mock',
  GATEWAY_BATCH_FILE: path.join(HOME, 'gateway-batch'),
  // OLA_FU_SPECIALISTS=<model id>: the specialists (see, read, ocr, translate) on that model, on Together.
  ...(process.env.OLA_FU_SPECIALISTS && !FAKE ? { GATEWAY_MODELS: `general=${MODEL},${['see', 'ocr', 'read', 'translate', 'route'].map((n) => `${n}=${process.env.OLA_FU_SPECIALISTS}`).join(',')}` } : {}),
  // OLA_FU_HOSTED=<model id>: Fallback to a hosted open model, that model on Together (cents a request).
  ...(process.env.OLA_FU_HOSTED && !FAKE ? { HOSTED_BASE_URL: 'https://api.together.xyz/v1', HOSTED_API_KEY: together(), HOSTED_MODEL: process.env.OLA_FU_HOSTED, HOSTED_PROVIDER: 'Together AI', GATEWAY_HOSTED_FILE: path.join(HOME, 'gateway-hosted'), GATEWAY_HOSTED_PRICES: 'in=1.4,out=4.4' } : {}),
})
await until(() => gw.log.includes('"event":"start"'), 15_000, 'the gateway start')
start('frontdesk/server.mjs')
await until(async () => (await fetch(`${ORIGIN}/api/health`)).ok, 15_000, 'the front desk start')
const wsLib = await import('../workspace/ws.mjs')
await wsLib.waitForRoom(IDS, IDS.length)

// ---------------------------------------------------------------- steps, timing, words
const results = []
let failedJourney = null
async function step(run, journey, name, limitS, fn) {
  if (failedJourney === `${run.label}:${journey}`) return results.push({ run: run.label, journey, name, ok: false, ms: 0, detail: 'skipped: an earlier step of this journey failed', skipped: true })
  const t0 = Date.now()
  let ok = true
  let detail = ''
  try {
    const limit = limitS * 1000 * SLOW
    detail = (await Promise.race([fn(), sleep(limit).then(() => Promise.reject(new Error(`took more than ${Math.round(limit / 1000)} s`)))])) ?? ''
  } catch (e) {
    ok = false
    detail = String(e?.message ?? e).split('\n')[0].slice(0, 300)
    failedJourney = `${run.label}:${journey}`
  }
  const ms = Date.now() - t0
  const slug = `${run.label}-${journey}-${String(results.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}`
  let words = []
  try {
    await run.page.screenshot({ path: path.join(SHOTS, `${slug}.png`) })
    const seen = await screenWords(run.page)
    writeFileSync(path.join(SHOTS, `${slug}.txt`), `${seen.ui}\n\n--- Ola's replies ---\n${seen.ola}\n`)
    words = [...forbiddenIn(seen.ui).map((w) => `"${w}"`), ...forbiddenIn(seen.ola).map((w) => `"${w}" in Ola's reply`)]
  } catch {}
  const newWords = words.filter((w) => !run.wordsSeen.has(w))
  newWords.forEach((w) => run.wordsSeen.add(w))
  if (newWords.length) ok = false
  results.push({ run: run.label, journey, name, ok, ms, detail: [detail, newWords.length ? `forbidden words on screen: ${newWords.join(', ')}` : ''].filter(Boolean).join('; ') })
  console.log(`${ok ? 'pass' : 'FAIL'}  ${run.label} ${journey}  ${name}  ${(ms / 1000).toFixed(1)} s${detail || newWords.length ? `  (${results.at(-1).detail})` : ''}`)
}
/** What a person reads: the interface, and Ola's replies apart; their own requests left out. */
const screenWords = (page) =>
  page.evaluate(() => {
    // Only text that is on the screen (or read out by a screen reader: .sr-only counts), from the
    // live page: closed dialogs and a shut drawer are not read.
    const seen = (el) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        if (e.matches('dialog:not([open]), [hidden], [inert], [aria-hidden="true"], script, style')) return false
        if (!e.classList.contains('sr-only') && getComputedStyle(e).display === 'none') return false
      }
      return true
    }
    const ui = []
    const ola = []
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement
      const t = n.textContent.trim()
      if (!t || !el || !seen(el) || el.closest('.request')) continue
      ;(el.closest('.said-ola .answer, .said-ola .note') ? ola : ui).push(t)
    }
    return { ui: ui.join('\n'), ola: ola.join('\n') }
  })

/** Waits for the newest turn to end, answering each question Ola asks with `answer(kind, text)`. */
async function finishRun(run, limitMs, answer = () => 'Yes, this once') {
  const page = run.page
  const asked = []
  const end = Date.now() + limitMs
  await until(() => page.locator('.drawer .turn').count(), 20_000, 'the request in the conversation')
  while (Date.now() < end) {
    const dlg = page.locator('dialog.approval[open]')
    if (await dlg.count()) {
      const title = (await dlg.locator('.sheet-title').innerText()).replace(/\s+/g, ' ')
      const button = answer(title)
      asked.push(`${title} → ${button}`)
      await sleep(600) // the sheet slides in
      await page.screenshot({ path: path.join(SHOTS, `${run.label}-asked-${asked.length}.png`) })
      await dlg.getByRole('button', { name: button }).click()
      await until(async () => !(await page.locator('dialog.approval[open]').count()), 10_000, 'the question closing')
      continue
    }
    const status = await page.locator('.drawer .turn').last().getAttribute('data-status')
    if (status && status !== 'working' && status !== 'sending') return { status, asked }
    await sleep(500)
  }
  throw new Error(`the run did not end in ${Math.round(limitMs / 1000)} s (asked: ${asked.join('; ') || 'nothing'})`)
}
async function openDrawer(page) {
  if (!(await page.locator('.drawer.open').count())) await page.locator('.askbar-open').click()
  await page.locator('.drawer.open').waitFor({ timeout: 5000 })
}
/** A request in a new conversation (or this one, `fresh: false`); returns once it is on the page. */
async function ask(run, text, { fresh = true } = {}) {
  const page = run.page
  await openDrawer(page)
  if (fresh && (await page.locator('.drawer .turn').count())) {
    await page.getByRole('button', { name: 'New conversation' }).click()
    await until(async () => (await page.locator('.drawer .turn').count()) === 0, 10_000, 'a new conversation')
  }
  const before = await page.locator('.drawer .turn').count()
  await page.locator('#ask-input').fill(text)
  await page.locator('.composer button[type="submit"]').click()
  await until(async () => (await page.locator('.drawer .turn').count()) > before, 20_000, 'the request in the conversation')
}
async function openIn(run, link) {
  const [tab] = await Promise.all([run.ctx.waitForEvent('page', { timeout: 15_000 }), link.click()])
  await tab.waitForLoadState('load')
  return tab
}
const answerText = async (page) => ((await page.locator('.drawer .turn').last().locator('.said-ola').innerText().catch(() => '')) || '').replace(/\s+/g, ' ')

// ---------------------------------------------------------------- the journeys
const { chromium, webkit } = await import('playwright')
const engines = { chromium, webkit }
/** A browser context for one person, with a passkey device of its own. */
async function personContext(browser, run) {
  const device = new SoftAuthn({ rpId: 'localhost', origin: ORIGIN })
  const ctx = await browser.newContext({ viewport: { width: run.width, height: run.width < 600 ? 844 : 860 }, acceptDownloads: true })
  await ctx.exposeFunction('__softCreate', (o) => device.create(o))
  // WebKit has no virtual authenticator: the page's navigator.credentials is answered by a
  // software passkey (the same one frontdesk/check.mjs uses); the cookie and the rest are the browser's.
  await ctx.addInitScript(() => {
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const bin = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer
    navigator.credentials.create = async ({ publicKey: o }) => {
      const r = await window.__softCreate({ ...o, challenge: b64(o.challenge), user: { ...o.user, id: b64(o.user.id) }, excludeCredentials: [] })
      return { id: r.id, rawId: bin(r.rawId), type: r.type, authenticatorAttachment: 'platform', getClientExtensionResults: () => ({}), response: { clientDataJSON: bin(r.response.clientDataJSON), attestationObject: bin(r.response.attestationObject), getTransports: () => ['internal'] } }
    }
  })
  ctx.on('request', (r) => !r.url().startsWith(`${ORIGIN}/`) && !/^(data|blob|about):/.test(r.url()) && run.foreign.add(r.url()))
  return ctx
}
try {
  for (const run of RUNS) {
    run.label = `${run.engine}@${run.width}`
    run.wordsSeen = new Set()
    failedJourney = null
    const browser = await engines[run.engine].launch()
    run.foreign = new Set()
    run.ctx = await personContext(browser, run)
    run.page = await run.ctx.newPage()
    const page = run.page
    const link = admin('invite', run.who)

    if (ONLY.has('A')) {
      await step(run, 'A', 'the invitation link shows who it is for', 15, async () => {
        await page.goto(link)
        await page.getByRole('button', { name: 'Make my passkey' }).waitFor({ timeout: 10_000 })
      })
      await step(run, 'A', 'make a passkey and land in the project', 30, async () => {
        await page.getByRole('button', { name: 'Make my passkey' }).click()
        await page.waitForSelector('.project-title', { timeout: 30_000 })
        await page.waitForSelector('.empty-title, .thing', { timeout: 30_000 })
        return `"${await page.locator('.project-title').innerText()}"`
      })
      await step(run, 'A', 'the empty project says what to do', 10, async () => {
        const t = await page.locator('main').innerText()
        if (!/Ask Ola/.test(t)) throw new Error('the empty project does not point at Ask Ola')
      })
      await step(run, 'A', 'ask for a hello-world page', 300, async () => {
        await page.locator('.empty-actions .primary-button').first().click()
        await page.locator('.drawer.open').waitFor({ timeout: 5000 })
        await ask(run, 'Make me a simple web page that says Hello, world, with a short welcome line under it.')
        const r = await finishRun(run, 290_000)
        if (r.status !== 'done') throw new Error(`the run ended "${r.status}": ${(await answerText(page)).slice(0, 160)}`)
        return r.asked.length ? `asked: ${r.asked.join('; ')}` : 'asked nothing'
      })
      await step(run, 'A', 'Open the page from under the reply', 30, async () => {
        const open = page.locator('.drawer .turn').last().locator('.made-pages a, .made-pictures a').filter({ hasText: /\.html?/ }).first()
        await open.waitFor({ timeout: 10_000 })
        const tab = await openIn(run, open)
        const frame = tab.frames().find((f) => f.url().includes('/v/'))
        const text = frame ? await frame.locator('body').innerText() : ''
        await tab.screenshot({ path: path.join(SHOTS, `${run.label}-A-opened-page.png`) })
        await tab.close()
        if (!/hello/i.test(text)) throw new Error(`the opened page says: ${text.slice(0, 120) || '(nothing)'}`)
      })
      await step(run, 'A', 'the page is on the project home', 20, async () => {
        await page.getByRole('button', { name: 'Close the drawer' }).click()
        await until(() => page.locator('.thing').count(), 15_000, 'a thing on the home')
      })
    }

    if (ONLY.has('B')) {
      failedJourney = null
      await step(run, 'B', 'upload the spreadsheet', 30, async () => {
        await page.goto(`${ORIGIN}/?w=${run.id}#/files`)
        await page.waitForSelector('#file-picker', { state: 'attached' })
        await page.locator('#file-picker').setInputFiles({ name: 'pantry visits october.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
        await page.waitForSelector('table.files .file-name:has-text("pantry visits october.csv")', { timeout: 25_000 })
      })
      await step(run, 'B', 'ask a question that needs a caveat; get a chart and an Excel file', 420, async () => {
        await page.goto(`${ORIGIN}/?w=${run.id}#/`)
        await page.waitForSelector('.project-title')
        await ask(run, 'How many households did each site serve in October, from pantry visits october.csv? Make a bar chart as a PNG and an Excel file with the totals.')
        const r = await finishRun(run, 410_000)
        if (r.status !== 'done') throw new Error(`the run ended "${r.status}": ${(await answerText(page)).slice(0, 160)}`)
        const made = await page.locator('.drawer .turn').last().locator('.made-pages a, .made-pictures a, .made-picture a').allInnerTexts()
        const reply = await answerText(page)
        // The model's quality, said but not failed on: the duplicate row and the two blanks.
        const dup = /duplicat|repeat|twice|same row/i.test(reply)
        const blank = /blank|missing|empty|no (household )?count/i.test(reply)
        return `made: ${made.join(', ') || 'nothing listed'}; the duplicate ${dup ? 'named' : 'NOT named'}; the blanks ${blank ? 'named' : 'NOT named'}`
      })
      await step(run, 'B', 'Open the chart and the Excel file', 40, async () => {
        const turn = page.locator('.drawer .turn').last()
        const pic = turn.locator('.made-picture img, .made-pictures img').first()
        if (!(await pic.count())) throw new Error('no picture under the reply')
        const xl = turn.locator('.made-pages a').filter({ hasText: /\.xlsx/i }).first()
        if (!(await xl.count())) throw new Error('no Excel file under the reply')
        const tab = await openIn(run, xl)
        await tab.waitForSelector('table.grid tbody tr', { timeout: 20_000 })
        await tab.screenshot({ path: path.join(SHOTS, `${run.label}-B-opened-excel.png`) })
        await tab.close()
      })
      await step(run, 'B', 'find both again from the project home', 20, async () => {
        await page.getByRole('button', { name: 'Close the drawer' }).click()
        await page.reload()
        await page.waitForSelector('.thing')
        const home = await page.locator('main').innerText()
        const missing = ['.xlsx', '.png'].filter((x) => !home.toLowerCase().includes(x))
        if (missing.length) throw new Error(`not on the home: ${missing.join(', ')}`)
      })
    }

    if (ONLY.has('D')) {
      failedJourney = null
      await step(run, 'D', 'a request that needs the web: the search card, Allow once', 360, async () => {
        await ask(run, 'Search the web for the Universal Declaration of Human Rights, download the official PDF, and tell me what Article 1 says.')
        const cards = []
        const r = await finishRun(run, 350_000, (title) => (cards.push(title), 'Allow once'))
        if (!cards.some((c) => /search the web/.test(c))) throw new Error(`no search card (cards: ${cards.join('; ') || 'none'})`)
        if (r.status !== 'done') throw new Error(`the run ended "${r.status}"`)
        const reply = await answerText(page)
        return `cards: ${cards.join('; ')}; Article 1 ${/born free|equal in dignity/i.test(reply) ? 'quoted' : 'NOT quoted'}`
      })
      await step(run, 'D', 'the saved source is in Files and in Data', 30, async () => {
        await page.getByRole('button', { name: 'Close the drawer' }).click()
        await page.goto(`${ORIGIN}/?w=${run.id}#/files`)
        await page.waitForSelector('table.files')
        const files = await page.locator('main').innerText()
        if (!/sources\/.+\.pdf/i.test(files)) throw new Error('no downloaded PDF under sources/ in Files')
        await page.goto(`${ORIGIN}/?w=${run.id}#/data`)
        await page.waitForSelector('#data-title')
        await sleep(1500)
        const data = await page.locator('main').innerText()
        if (!/sources\/.+\.pdf/i.test(data)) throw new Error('the downloaded PDF is not among the documents in Data')
      })
    }
    if ([...ONLY].some((j) => 'CEFGHI'.includes(j))) {
      failedJourney = null
      let n = 0
      const newPerson = async (role) => {
        const who = `${TAG}${role.slice(0, 3)}${n++}`
        admin('add-person', who, '--name', role === 'member' ? 'Lena Made-up' : 'Sam Made-up')
        const ctx = await personContext(browser, run)
        const p = await ctx.newPage()
        const sub = { ...run, label: `${run.label}-${role}`, ctx, page: p, wordsSeen: new Set() }
        return { who, page: p, run: sub, close: () => ctx.close() }
      }
      const { moreJourneys } = await import('./first-user-more.mjs')
      await moreJourneys({ run, step, ask, finishRun, answerText, openIn, admin, ORIGIN, sleep, until, ONLY, AI, SHOTS, env, newPerson })
    }
    if (run.foreign.size) results.push({ run: run.label, journey: '-', name: 'no request to another origin', ok: false, ms: 0, detail: [...run.foreign].slice(0, 3).join(' ') })
    await browser.close()
  }
} finally {
  for (const p of children) p.kill('SIGTERM')
  if (!KEEP) {
    for (const id of IDS) node('workspace/ws.mjs', ['destroy', id, '--confirm', id])
    rmSync(HOME, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------- the report
const usage = gw.log.split('\n').filter((l) => l.includes('"route":"chat"')).map((l) => JSON.parse(l))
const tin = usage.reduce((s, u) => s + (u.tokens_in || 0), 0)
const tout = usage.reduce((s, u) => s + (u.tokens_out || 0), 0)
console.log(`\nmodel ${FAKE ? 'scripted' : MODEL}: ${usage.length} requests, ${tin} in, ${tout} out`)
for (const run of RUNS) {
  for (const j of [...ONLY]) {
    const rows = results.filter((r) => r.run === `${run.engine}@${run.width}` && r.journey === j)
    console.log(`${run.engine}@${run.width} journey ${j}: ${rows.every((r) => r.ok) ? 'whole' : 'BROKEN'}, ${(rows.reduce((s, r) => s + r.ms, 0) / 1000).toFixed(0)} s`)
  }
}
console.log(`screenshots and screen words: ${SHOTS}`)
const failed = results.filter((r) => !r.ok)
console.log(`${results.length - failed.length} of ${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
