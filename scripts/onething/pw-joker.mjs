// The bookmarks by the streak (jokers.ts), driven at phone size in WebKit against
// a local dev server, signed in as the throwaway account from joker-user.ts (two
// gaps, 36 days that can come back, three in hand): nothing opens by itself, a red
// dot sits on the count, a tap opens the small card, Restore counts the streak up
// to 41 and leaves two ribbons, the dot goes, held days carry a ribbon on the wall.
//   set -a; source ./.env.local; set +a; npx tsx scripts/onething/joker-user.ts   → id
//   OT_OUT=<shots-dir> OT_USER=<id> [OT_URL=http://localhost:3218] [OT_DESKTOP=1] node scripts/onething/pw-joker.mjs
import { chromium, webkit, devices } from 'playwright'
const base = process.env.OT_URL || 'http://localhost:3218'
const out = process.env.OT_OUT
const uid = process.env.OT_USER
const desk = !!process.env.OT_DESKTOP
let failures = 0
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++ }
let b
try { b = await webkit.launch() } catch { b = await chromium.launch() }
const ctx = await b.newContext(desk ? { viewport: { width: 1280, height: 900 } } : { ...devices['iPhone 14'] })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => { if (!/__nextjs_original-stack-frames/.test(e.message)) errors.push(e.message) })
const p = desk ? 'desk-' : ''
const top = async (name) => page.screenshot({ path: `${out}/${p}${name}.png`, clip: { x: 0, y: 0, width: desk ? 1280 : 390, height: desk ? 420 : 420 } })

await page.goto(`${base}/api/onething/dev/as?id=${uid}`, { waitUntil: 'networkidle' })
await page.waitForSelector('.oj-streak.btn', { timeout: 15000 })
await page.waitForTimeout(800)
await top('01-top')
check(await page.locator('.oj-pop, .oj-sheet').count() === 0, 'nothing opens by itself')
check(await page.locator('.oj-streak.due').count() === 1, 'a red dot on the count')
check(await page.locator('.oj-marks .oj-ribbon:not(.off)').count() === 3, 'three ribbons held')

await page.locator('.oj-streak.btn').click()
await page.waitForSelector('.oj-pop')
await page.waitForTimeout(250)
await top('02-open')
check((await page.locator('.oj-pop-h').textContent()) === 'Your 36-day streak can come back.', 'the card: the 36 can come back')
const body = await page.locator('.oj-pop-p').textContent()
check(/^Two bookmarks hold Sunday the 18th and Friday, the days you missed\.$|^Two bookmarks hold .+ and .+, the days you missed\.$/.test(body), `names the two days (${body})`)
check((await page.locator('.oj-pop-btn').textContent()) === 'Restore to 41', 'the button: restore to 41')

await page.keyboard.press('Escape')
await page.waitForTimeout(150)
check(await page.locator('.oj-pop').count() === 0, 'escape closes it')
await page.locator('.oj-streak.btn').click()
await page.waitForSelector('.oj-pop-btn')
// a tap where the finger lands (locator.click scrolls the button to the top of the viewport first)
const tap = async (sel) => { const r = await page.locator(sel).boundingBox(); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (desk) await page.mouse.click(x, y); else await page.touchscreen.tap(x, y) }
const yes = page.waitForResponse((res) => res.url().includes('/api/onething/joker'))
await tap('.oj-pop-btn')
await yes
check(await page.evaluate(() => scrollY) === 0, 'the page stays put')
for (let k = 0; k < 4; k++) { await top(`03-climb-${k}`); await page.waitForTimeout(220) }
await page.waitForFunction(() => document.querySelector('.oj-streak b')?.textContent === '41', null, { timeout: 8000 })
await page.waitForTimeout(800)
await top('04-restored')
check((await page.locator('.oj-pop-h').textContent()) === 'Back to 41 days.', 'the card: back to 41')
check((await page.locator('.oj-streak b').textContent()) === '41', 'the count reads 41')
check(await page.locator('.oj-marks .oj-ribbon:not(.off)').count() === 2, 'two ribbons left (day 40 gave one back)')
check(await page.locator('.oj-streak.due').count() === 0, 'the dot is gone')

await page.mouse.click(desk ? 200 : 40, desk ? 600 : 500)
await page.waitForTimeout(200)
check(await page.locator('.oj-pop').count() === 0, 'a tap away closes it')
await page.locator('.oj-streak.btn').click()
await page.waitForSelector('.oj-pop')
await page.waitForTimeout(200)
await top('05-info')
check((await page.locator('.oj-pop-h').textContent()) === 'Two bookmarks.', 'afterwards the card explains: two bookmarks')
check((await page.locator('.oj-pop-k').textContent()) === 'Next one in 9 days.', 'next one in 9 days (41 → 50)')
await page.keyboard.press('Escape')

check(await page.locator('.oj-tile.held').count() === 2, 'the two held days on the wall carry a ribbon')
await page.locator('.oj-tile.held').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const held = await page.locator('.oj-tile.held').first().boundingBox()
const wall = await page.locator('.oj-wall').boundingBox()
await page.screenshot({ path: `${out}/${p}06-wall.png`, clip: { x: wall.x - 6, y: held.y - 220, width: wall.width + 12, height: held.height + 440 } })
check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll')
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
await b.close()
console.log(failures ? `${failures} failure(s)` : 'all passed')
process.exit(failures ? 1 : 0)
