#!/usr/bin/env node
// Screenshots of the project page on a phone (390 x 844, WebKit) and a laptop (1280), for a design
// look (made-up data only):   node scripts/project-shots.mjs <dir>   (from web/, after `npm run build`)
// Starts dev.mjs with the scripted model, saves a made-up downloaded page under sources/, and walks:
// the conversation (where a phone opens), a request answered, the switch, Made by Ola, Sources, the
// Menu, the projects list; then the laptop's home and its conversation.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { webkit } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.join(HERE, '..')
const out = path.resolve(process.argv[2] ?? 'shots')
fs.mkdirSync(out, { recursive: true })

const p = spawn(process.execPath, [path.join(WEB, 'dev.mjs'), '--dist', '--fake-model', '--port', '0'], { cwd: WEB, env: { ...process.env, OLA_DEV_CONTROLS: '1', OLA_DEV_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ola-shots-')) }, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
p.stderr.on('data', (d) => (log += d))
const url = await new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error(log)), 60_000)
  p.stdout.on('data', (d) => {
    log += d
    const m = /ready (http:\/\/\S+)/.exec(log)
    if (m) clearTimeout(t), ok(m[1])
  })
})
await fetch(new URL('/__dev/source', url), { method: 'POST' })

const b = await webkit.launch()
try {
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })
  const pg = await phone.newPage()
  const snap = async (name, page = pg) => (await page.waitForTimeout(300), await page.screenshot({ path: path.join(out, `${name}.png`) }))
  await pg.goto(url)
  await pg.waitForSelector('.drawer.open #ask-input')
  await pg.evaluate(() => document.fonts.ready)
  await snap('phone-1-conversation')
  await pg.fill('#ask-input', 'Count the rows in survey.csv with a short program and write the number to rows.md.')
  await pg.press('#ask-input', 'Enter')
  await pg.waitForFunction(() => ['done', 'failed'].includes([...document.querySelectorAll('.drawer .turn')].pop()?.dataset.status ?? ''), null, { timeout: 60_000 })
  await snap('phone-2-answered')
  await pg.locator('label.lots-toggle').click()
  await snap('phone-3-switch-on')
  await pg.locator('label.lots-toggle').click()
  await pg.fill('#ask-input', 'Make the page, but ask me which one first')
  await pg.press('#ask-input', 'Enter')
  await pg.waitForSelector('.question-card')
  await pg.locator('.question-card').scrollIntoViewIfNeeded()
  await snap('phone-4-question')
  await pg.locator('.question-option').first().click()
  await pg.waitForFunction(() => !document.querySelector('.question-card'))
  await pg.getByRole('tab', { name: /Made by Ola/ }).click()
  await pg.waitForSelector('.thing')
  await snap('phone-5-made')
  await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await snap('phone-6-made-end')
  await pg.getByRole('tab', { name: /Sources/ }).click()
  await snap('phone-7-sources')
  await pg.getByRole('button', { name: 'Menu' }).click()
  await snap('phone-8-menu')
  await pg.keyboard.press('Escape')
  await pg.goto(new URL('/#/projects', url).href)
  await pg.waitForSelector('.gate-projects')
  await snap('phone-9-projects')

  const laptop = await b.newContext({ viewport: { width: 1280, height: 860 } })
  const lp = await laptop.newPage()
  await lp.goto(url)
  await lp.waitForSelector('.thing')
  await lp.evaluate(() => document.fonts.ready)
  await snap('laptop-1-home', lp)
  await lp.locator('.sources').scrollIntoViewIfNeeded()
  await snap('laptop-2-sources', lp)
  await lp.evaluate(() => window.scrollTo(0, 0))
  await lp.getByRole('button', { name: 'Ask Ola' }).click()
  await lp.waitForSelector('.drawer.open')
  await snap('laptop-3-conversation', lp)
} finally {
  await b.close()
  p.kill('SIGTERM')
}
console.log(`shots in ${out}`)
