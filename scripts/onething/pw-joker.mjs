// The joker save, driven at phone size in WebKit against a local dev server,
// signed in as the throwaway account from joker-user.ts (two gaps, 36 days
// that can come back, three jokers): the save opens by itself once, "Not now"
// leaves the note on the wall, the note reopens it, playing flies two cards
// into the gaps and lands on 41, the page under it follows.
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

await page.goto(`${base}/api/onething/dev/as?id=${uid}`, { waitUntil: 'networkidle' })
await page.waitForSelector('.oj-rescue', { timeout: 15000 })
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/${p}01-offer.png` })
check((await page.locator('.oj-rescue-num span').first().textContent()) === '36', 'opens by itself on the 36 that broke')
check((await page.locator('.oj-rescue-h').textContent()) === 'Two days slipped by.', 'headline: two days slipped by')
check((await page.locator('.oj-play').textContent()) === 'Play two jokers', 'button: play two jokers')
check(await page.locator('.oj-strip-gap').count() === 2, 'two empty sheets in the strip')
check(await page.locator('.oj-rescue-hand .oj-joker.up').count() === 2, 'two cards lifted out of the hand')

await page.getByRole('button', { name: 'Not now' }).click()
await page.waitForTimeout(400)
check(await page.locator('.oj-rescue').count() === 0, 'not now closes it')
await page.screenshot({ path: `${out}/${p}02-slip.png` })
check(await page.locator('.oj-slip').count() === 1, 'the note stays above the pad')
await page.locator('.oj-level').scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await page.locator('.oj-level').screenshot({ path: `${out}/${p}03-hand-before.png` })
check((await page.locator('.oj-jokers-text b').textContent()) === 'Three jokers in hand', 'the hand: three jokers')
await page.locator('.oj-month').screenshot({ path: `${out}/${p}04-wall-before.png` })
check(await page.locator('.oj-tile.savable').count() >= 1, 'the missed days on the wall offer the save')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
check(await page.locator('.oj-rescue').count() === 0, 'a reload does not open it again')

await page.locator('.oj-slip').click()
await page.waitForSelector('.oj-rescue')
await page.waitForTimeout(400)
// a burst from the moment the server says yes, so the cards are caught in the air
const yes = page.waitForResponse((res) => res.url().includes('/api/onething/joker'))
await page.locator('.oj-play').click()
await yes
for (let k = 0; k < 6; k++) { await page.screenshot({ path: `${out}/${p}05-flying-${k}.png` }); await page.waitForTimeout(110) }
await page.waitForSelector('.oj-rescue.is-saved', { timeout: 10000 })
await page.waitForTimeout(250)
await page.screenshot({ path: `${out}/${p}06-landing.png` })
await page.waitForTimeout(1300)
await page.screenshot({ path: `${out}/${p}07-saved.png` })
check((await page.locator('.oj-rescue-num span').first().textContent()) === '41', 'lands on 41')
check((await page.locator('.oj-rescue-h').textContent()) === 'Saved.', 'headline: saved')
check(await page.locator('.oj-strip-gap .oj-joker').count() === 2, 'a joker in each gap')
check(await page.locator('.oj-rescue-hand .oj-card-slot').count() === 2, 'two jokers left (one dealt back by day 40)')
check((await page.locator('.oj-rescue-p').textContent()).includes('Day 40 dealt you a fresh joker'), 'says day 40 dealt one back')

await page.getByRole('button', { name: 'Back to your page' }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/${p}08-page.png` })
check(await page.locator('.oj-slip').count() === 0, 'the note is gone')
check((await page.locator('.oj-streak b').textContent()) === '41', 'the streak at the top reads 41')
await page.locator('.oj-level').scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await page.locator('.oj-level').screenshot({ path: `${out}/${p}09-hand-after.png` })
check((await page.locator('.oj-jokers-text b').textContent()) === 'Two jokers in hand', 'the hand: two jokers')
await page.locator('.oj-month').screenshot({ path: `${out}/${p}10-wall-after.png` })
check(await page.locator('.oj-tile.saved').count() >= 1, 'covered days on the wall carry a joker')
check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll')

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
await b.close()
console.log(failures ? `${failures} failure(s)` : 'all passed')
process.exit(failures ? 1 : 0)
