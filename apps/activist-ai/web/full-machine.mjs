#!/usr/bin/env node
// OLA-299: a project opened while Ola's computer runs as many projects as it can.
//
//   node full-machine.mjs [shots-dir]
//
// Starts the dev server (built page, scripted model) playing a full machine (OLA_DEV_FULL=1: the
// front desk's 503 machine_busy on /api/project and the event stream), opens the page at 390 px in
// WebKit and Chromium, and checks what the person sees: the plain sentence, never "Lost the
// connection"; a request typed in Ask Ola stays in the box with a sentence saying why; then a place
// frees (/__dev/full?on=0) and the project opens by itself, no reload, with the composer working.
// Before the fix the page froze on "Opening your project…" (Solid throws an errored resource on
// every read) and the drawer said "Lost the connection" forever.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = process.argv[2] ?? null
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
let passed = 0
let failed = 0
const t = (name, ok, why = '') => (ok ? passed++ : failed++, console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !why ? '' : `: ${why}`}`))

const built = spawnSync(path.join(HERE, 'node_modules/.bin/vite'), ['build', '--logLevel', 'error'], { cwd: HERE, encoding: 'utf8' })
if (built.status !== 0) (console.error(built.stderr || built.stdout), process.exit(1))

const dev = spawn(process.execPath, [path.join(HERE, 'dev.mjs'), '--dist', '--fake-model', '--port', '0'], {
  cwd: HERE,
  env: { ...process.env, OLA_DEV_CONTROLS: '1', OLA_DEV_FULL: '1', OLA_DEV_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ola-full-')) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
dev.stderr.on('data', (d) => (out += d))
const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`dev server did not start:\n${out}`)), 90_000)
  dev.stdout.on('data', (d) => {
    out += d
    const m = /ready (http:\/\/\S+)/.exec(out)
    if (m) (clearTimeout(timer), resolve(m[1]))
  })
  dev.on('exit', (c) => reject(new Error(`dev server exited ${c}:\n${out}`)))
})
const full = (on) => fetch(new URL(`/__dev/full?on=${on ? 1 : 0}`, url), { method: 'POST', headers: { origin: new URL(url).origin } })
const until = async (fn, ms, what) => {
  const end = Date.now() + ms
  for (;;) {
    if (await fn()) return
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

try {
  for (const [name, engine] of [['webkit', webkit], ['chromium', chromium]]) {
    await full(true)
    const browser = await engine.launch()
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const body = () => page.locator('body').innerText()
    await page.goto(url)
    let text = ''
    try {
      await until(async () => /running as many projects as it can/.test((text = await body())), 20_000, 'the full-machine sentence')
      t(`${name}: the page says the machine is full`, true)
    } catch (e) {
      t(`${name}: the page says the machine is full`, false, `${e.message}; page: ${text.slice(0, 300)}`)
    }
    // Past LOST_AFTER_MS (5 s): the stream has been refused long enough to count as lost.
    await page.waitForTimeout(7000)
    text = await body()
    t(`${name}: no "Lost the connection" while full`, !/Lost the connection/.test(text), text.slice(0, 300))
    t(`${name}: no "Opening your project…" while full`, !/Opening your project/.test(text), text.slice(0, 300))
    t(`${name}: the sentence says when (a project unused for 30 minutes closes)`, /30 minutes closes/.test(text) && /\(4\)/.test(text), text.slice(0, 300))
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-full.png`), fullPage: true })

    // Ask Ola while full: the words stay, the reason is said.
    const openAsk = () => page.locator('.askbar-open:visible, .askbar-status button:visible').first().click()
    await openAsk()
    const box = page.locator('#ask-drawer textarea')
    await box.fill('make a flyer for the potluck')
    await box.press('Enter')
    await page.waitForTimeout(500)
    text = await body()
    t(`${name}: the drawer says full, not lost`, /running as many projects as it can/.test(text) && !/Lost the connection/.test(text), text.slice(0, 400))
    t(`${name}: a request typed while full stays, with why`, (await box.inputValue()) === 'make a flyer for the potluck' && /cannot go yet/.test(text), text.slice(0, 400))
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-full-drawer.png`), fullPage: true })
    // The drawer stays open: on a phone it covers the page, and the project loads behind it.

    // A place frees: the project opens by itself (the page asks every 10 s), no reload.
    await full(false)
    try {
      await until(async () => !/running as many projects as it can/.test((text = await body())) && !/Opening your project/.test(text), 25_000, 'the project to open')
      t(`${name}: the project opens by itself when a place frees`, true)
    } catch (e) {
      t(`${name}: the project opens by itself when a place frees`, false, `${e.message}; page: ${text.slice(0, 300)}`)
    }
    await until(async () => !/Lost the connection/.test(await body()), 15_000, 'the connection to be back').catch(() => {})
    await box.fill('make a flyer for the potluck')
    await box.press('Enter')
    try {
      await until(async () => (await box.inputValue()) === '' && !/cannot go yet|Lost the connection/.test(await body()), 15_000, 'the request to go')
      t(`${name}: after it opens, a request goes`, true)
    } catch (e) {
      t(`${name}: after it opens, a request goes`, false, `${e.message}; page: ${(await body()).slice(0, 300)}`)
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-opened.png`), fullPage: true })
    await browser.close()
  }
} finally {
  dev.kill('SIGTERM')
}
console.log(`${passed} of ${passed + failed} passed`)
process.exit(failed ? 1 : 0)
