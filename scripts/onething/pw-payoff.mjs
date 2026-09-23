// The milestone payoff, headless at phone size: the preview route at day 7 and
// day 365, then the real trigger on the journal (dev sign-in as the throwaway
// user from payoff-user.ts). Against a local dev server.
//   OT_OUT=<shots-dir> OT_USER=<user id> node scripts/onething/pw-payoff.mjs
// OT_URL overrides the server (default http://localhost:3111).
import { chromium, webkit, devices } from 'playwright'
const base = process.env.OT_URL || 'http://localhost:3111'
const out = process.env.OT_OUT
const uid = process.env.OT_USER
let failures = 0
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++ }
let b
try { b = await webkit.launch() } catch { b = await chromium.launch() }
const ctx = await b.newContext({ ...devices['iPhone 14'] })
const page = await ctx.newPage()
const errors = []
// WebKit reports the Next dev overlay's own stack-frame fetch as a page error; that is not the page.
let step = 'start'
page.on('requestfailed', (r) => console.log(`REQFAIL [${step}] ${r.url()} ${r.failure()?.errorText ?? ''}`))
page.on('pageerror', (e) => { if (!/__nextjs_original-stack-frames/.test(e.message)) errors.push(`[${step} @ ${page.url()}] ${e.message}`) })

// --- preview, day 7 ---
step = 'p7'
await page.goto(`${base}/onething/grow?streak=7`, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/p7-seed.png` })
check(await page.locator('.ot-payoff-name').textContent() === 'Seed', 'starts on Seed')
check(await page.locator('.ot-payoff-days').textContent() === 'day 1', 'starts on day 1')
await page.waitForTimeout(2200)
await page.screenshot({ path: `${out}/p7-growing.png` })
const mid = await page.locator('.ot-payoff-days').textContent()
check(/^day [2-6]$/.test(mid), `counter runs while growing (${mid})`)
await page.waitForSelector('.ot-payoff-foot.in', { timeout: 8000 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/p7-arrived.png` })
check(await page.locator('.ot-payoff-name').textContent() === 'Sapling', 'lands on Sapling')
check(await page.locator('.ot-payoff-days').textContent() === 'day 7', 'counter ends on day 7')
check((await page.locator('.ot-payoff-line').textContent()) === 'Day 7.', 'headline Day 7.')
const sub = await page.locator('.ot-payoff-sub').textContent()
check(sub.includes('7 days in a row') && sub.includes('50 bonus points') && sub.includes('196 pts') && sub.includes('Sapling'), `sub line: ${sub}`)
check(!(await page.locator('.ot-payoff-hint').evaluate((el) => el.classList.contains('gone'))), 'hint shows after arrival')
// tap the ground: a flower; hint goes
const box = await page.locator('.ot-payoff-stage canvas').boundingBox()
await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.9)
await page.waitForTimeout(900)
await page.screenshot({ path: `${out}/p7-tapped.png` })
check(await page.locator('.ot-payoff-hint').evaluate((el) => el.classList.contains('gone')), 'hint hides after a tap')

// --- preview, day 365 ---
step = 'p365'
await page.goto(`${base}/onething/grow?streak=365`, { waitUntil: 'networkidle' })
await page.waitForSelector('.ot-payoff-foot.in', { timeout: 12000 })
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/p365-arrived.png` })
check(await page.locator('.ot-payoff-name').textContent() === 'Old Growth', '365 lands on Old Growth')
check((await page.locator('.ot-payoff-sub').textContent()).includes('A whole year'), '365 says a whole year')
step = 'p365-back'
await page.click('button:has-text("Back to the page")')
await page.waitForURL(/\/onething$/, { timeout: 5000 })
check(!(await page.locator('.ot-payoff').count()), 'back goes to the page')
// a soft navigation: let the landing's /me call answer before leaving, or WebKit reports the aborted fetch as a page error
await page.waitForResponse((r) => r.url().includes('/api/onething/me'), { timeout: 5000 })
await page.waitForTimeout(400)

// --- the real trigger on the journal ---
if (uid) {
step = 'journal'
  await page.goto(`${base}/api/onething/dev/as?id=${uid}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.ot-payoff', { timeout: 8000 })
  check(true, 'milestone day opens the payoff on load')
  await page.waitForSelector('.ot-payoff-foot.in', { timeout: 10000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/journal-payoff.png` })
  const jsub = await page.locator('.ot-payoff-sub').textContent()
  check(jsub.includes('7 days in a row') && jsub.includes('196 pts'), `journal payoff reads real data: ${jsub}`)
  await page.click('button:has-text("Back to the page")')
  await page.waitForTimeout(300)
  check(!(await page.locator('.ot-payoff').count()), 'back closes the overlay')
  check(await page.locator('.ot-replay').count() === 1, 'replay link on the streak line')
  await page.screenshot({ path: `${out}/journal-after.png` })
  step = 'journal-reload'
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  check(!(await page.locator('.ot-payoff').count()), 'a reload does not replay it')
  step = 'journal-replay'
  await page.click('.ot-replay')
  await page.waitForSelector('.ot-payoff', { timeout: 3000 })
  check(true, 'replay opens it again')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check(!(await page.locator('.ot-payoff').count()), 'Escape closes it')
  check(await page.evaluate(() => document.body.style.overflow) === '', 'body scroll restored')
}
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
await b.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASS')
process.exit(failures ? 1 : 0)
