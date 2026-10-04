// Pictures and links on the journal, in a phone browser against a local dev
// server on 3218, signed in as the review account (scripts/onething/review-user.ts up):
// a sentence with a link is kept and the link shows as its domain; "Add a
// picture" on today puts a snapshot under the sentence; a past day gets one
// from its sheet, the wall shows a corner of it; the snapshot opens big; the
// picture comes off again. Writes hero-link.png, hero-photo.png, wall.png,
// day.png, big.png into <dir> and fails on any page error.
//   node scripts/onething/pw-photo-shot.mjs <dir> <user id> [--desktop]
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const [dir, id] = process.argv.slice(2)
if (!dir || !id) throw new Error('usage: pw-photo-shot.mjs <dir> <user id> [--desktop]')
fs.mkdirSync(dir, { recursive: true })
const desktop = process.argv.includes('--desktop')
const base = 'http://localhost:3218'
let failures = 0
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }

// two test pictures: a wide warm one, a tall cool one (gradients, so cropping is visible)
const wide = path.join(dir, 'wide.jpg'), tall = path.join(dir, 'tall.jpg')
await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 250, g: 160, b: 60 } } })
  .composite([{ input: Buffer.from(`<svg width="2400" height="1600"><circle cx="1700" cy="500" r="380" fill="#ffe66d"/><rect x="0" y="1100" width="2400" height="500" fill="#3d3bff"/></svg>`), top: 0, left: 0 }])
  .jpeg().toFile(wide)
await sharp({ create: { width: 1200, height: 1800, channels: 3, background: { r: 40, g: 150, b: 220 } } })
  .composite([{ input: Buffer.from(`<svg width="1200" height="1800"><rect x="0" y="0" width="1200" height="700" fill="#b6f23a"/><circle cx="600" cy="1300" r="300" fill="#ff4b1f"/></svg>`), top: 0, left: 0 }])
  .jpeg().toFile(tall)

const b = await chromium.launch()
const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 900 } } : { ...devices['iPhone 13'] })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto(`${base}/api/onething/dev/as?id=${id}`, { waitUntil: 'networkidle' })
await p.waitForSelector('.oj-hero .oj-today', { timeout: 30000 })

// today: a sentence with a link (as the day's sentence, or one more thought if today is kept already)
if ((await p.locator('.oj-compose textarea').count()) === 0) await p.click('.oj-hero .oj-pill:has-text("Another thought")')
await p.fill('.oj-compose textarea', 'Read the whole thing on the train, https://www.example.com/long/essay?x=1, then slept.')
await p.click('.oj-compose button[type=submit]')
await p.waitForSelector('.oj-hero .oj-said .oj-link', { timeout: 20000 })
const link = p.locator('.oj-hero .oj-said .oj-link').last()
check((await link.innerText()) === 'example.com', 'the link shows as its bare domain', await link.innerText())
check((await link.getAttribute('href')) === 'https://www.example.com/long/essay?x=1', 'and points at the full URL')
check((await p.locator('.oj-hero .oj-said .t').last().innerText()).includes('example.com, then slept.'), 'the sentence keeps its punctuation after the link')
await p.waitForTimeout(600)
await p.locator('.oj-hero').screenshot({ path: `${dir}/hero-link.png` })

// a picture on today
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('.oj-hero .oj-pill:has-text("Add a picture")')])
await chooser.setFiles(wide)
await p.waitForSelector('.oj-hero .oj-snap img', { timeout: 30000 })
await p.waitForFunction(() => { const i = document.querySelector('.oj-hero .oj-snap img'); return i && i.complete && i.naturalWidth > 0 })
const snap = await p.locator('.oj-hero .oj-snap').boundingBox()
const said = await p.locator('.oj-hero .oj-said').boundingBox()
check(snap && said && snap.y > said.y + said.height - 2, 'the snapshot sits under the sentence, not above', JSON.stringify({ snap, said }))
check(snap && snap.width <= 260, 'the snapshot stays small', String(snap?.width))
check((await p.locator('.oj-hero .oj-pill:has-text("Another picture")').count()) === 1, 'the pill now offers another picture')
await p.waitForTimeout(500)
await p.locator('.oj-hero').screenshot({ path: `${dir}/hero-photo.png` })

// a past day from its sheet
const tile = p.locator('.oj-wall .oj-tile:not(.missed)').first()
const tileDay = (await tile.getAttribute('aria-label')) ?? ''
await tile.click()
await p.waitForSelector('.oj-sheet .oj-card', { timeout: 10000 })
const [chooser2] = await Promise.all([p.waitForEvent('filechooser'), p.click('.oj-sheet .oj-pill:has-text("Add a picture")')])
await chooser2.setFiles(tall)
await p.waitForSelector('.oj-sheet .oj-snap img', { timeout: 30000 })
await p.waitForFunction(() => { const i = document.querySelector('.oj-sheet .oj-snap img'); return i && i.complete && i.naturalWidth > 0 })
await p.waitForTimeout(400)
await p.locator('.oj-sheet-in').screenshot({ path: `${dir}/day.png` })
check(true, `a past day took a picture (${tileDay.slice(0, 30)}…)`)

// big
await p.click('.oj-sheet .oj-snap')
await p.waitForSelector('.oj-photo .oj-photo-print img', { timeout: 10000 })
await p.waitForFunction(() => { const i = document.querySelector('.oj-photo .oj-photo-print img'); return i && i.complete && i.naturalWidth > 0 })
await p.waitForTimeout(400)
await p.locator('.oj-sheet-in').screenshot({ path: `${dir}/big.png` })
check((await p.locator('.oj-photo .oj-photo-cap').innerText()).length > 0, 'the big view carries the day\'s sentence')
await p.click('.oj-photo .oj-x')
await p.waitForSelector('.oj-photo', { state: 'detached' })
// back on the day sheet; close it
await p.click('.oj-sheet .oj-x')
await p.waitForSelector('.oj-sheet', { state: 'detached' })

// the wall: a corner peeks out of that tile, and the tile text is link-free
const peeks = await p.locator('.oj-wall .oj-tile-peek').count()
check(peeks === 1, 'one tile on the wall shows a corner of its picture', String(peeks))
check(!(await p.locator('.oj-wall .oj-tile-text').allInnerTexts()).some((t) => t.includes('http')), 'no raw URL on the wall')
await p.locator('.oj-month').screenshot({ path: `${dir}/wall.png` })

// off again (today's), via the big view
await p.click('.oj-hero .oj-snap')
await p.waitForSelector('.oj-photo')
await p.click('.oj-photo .oj-text-btn:has-text("Remove this picture")')
await p.click('.oj-photo .oj-btn:has-text("Take it off")')
await p.waitForSelector('.oj-photo', { state: 'detached', timeout: 15000 })
await p.waitForFunction(() => !document.querySelector('.oj-hero .oj-snap'), null, { timeout: 15000 })
check((await p.locator('.oj-hero .oj-snap').count()) === 0, 'today\'s picture is off again')
check((await p.locator('.oj-hero .oj-pill:has-text("Add a picture")').count()) === 1, 'the pill offers to add one again')

check(errs.length === 0, 'no page errors', errs.join(' | '))
await b.close()
console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
