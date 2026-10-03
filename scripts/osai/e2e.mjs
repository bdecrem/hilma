// osai end-to-end check against a dev server (default localhost:3240):
//   OUT=/tmp/shots node scripts/osai/e2e.mjs
// Signs in as bart with the passcode, reads the three pages, chats on both
// models, waits for the memory note, checks the phone layout, then deletes
// the test conversation and memory so nothing is left in the real tables.
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3240'
const OUT = process.env.OUT
const errors = []
const log = (...a) => console.log('[e2e]', ...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/403/.test(m.text())) errors.push('console: ' + m.text()) }) // the deliberate wrong-passcode 403 is expected

// 1. Login page
await page.goto(`${BASE}/osai`)
await page.waitForSelector('.osai-login')
await page.screenshot({ path: `${OUT}/01-login.png` })
await page.getByRole('button', { name: 'Bart' }).click()
await page.fill('#osai-passcode', '0000')
await page.getByRole('button', { name: /Continue as Bart/ }).click()
await page.waitForSelector('.osai-login .err')
log('wrong passcode →', await page.textContent('.osai-login .err'))
await page.fill('#osai-passcode', '1102')
await page.getByRole('button', { name: /Continue as Bart/ }).click()
await page.waitForSelector('.osai-core h1', { timeout: 30000 })
log('signed in; core title =', await page.textContent('.osai-core h1'))
await page.waitForSelector('.osai-chat .starter')
await page.screenshot({ path: `${OUT}/02-core.png`, fullPage: true })

// 2. Overview + details
await page.click('.osai-nav a[href="/osai/overview"]')
await page.waitForSelector('.osai-ov .row')
log('overview rows =', await page.locator('.osai-ov .row').count())
await page.screenshot({ path: `${OUT}/03-overview.png`, fullPage: true })
await page.click('.osai-ov .row >> nth=0')
await page.waitForURL(/\/osai\/details#box-3/)
await page.waitForSelector('#box-3')
log('details boxes =', await page.locator('.osai-dt .box').count())
await page.screenshot({ path: `${OUT}/04-details.png`, fullPage: true })

// 3. Chat on Opus (starter), then Fable
await page.click('.osai-chat .starter >> nth=1')
await page.waitForFunction(() => {
  const m = document.querySelectorAll('.osai-chat .msg.assistant')
  return m.length === 1 && !document.querySelector('.osai-chat .cursor') && m[0].textContent.length > 40
}, null, { timeout: 180000 })
const a1 = await page.locator('.osai-chat .msg.assistant').nth(0).textContent()
log('opus reply (first 300):', a1.slice(0, 300).replace(/\s+/g, ' '))
log('opus model tag:', await page.locator('.osai-chat .msg.assistant .model').nth(0).textContent())

await page.click('.osai-chat .seg button[title="claude-fable-5-1"]')
await page.fill('#osai-chat-input', 'In one sentence: remember that I care most about the product layer. Then tell me which box the one-pager calls the real Mozilla move.')
await page.keyboard.press('Enter')
await page.waitForFunction(() => {
  const m = document.querySelectorAll('.osai-chat .msg.assistant')
  return m.length === 2 && !document.querySelector('.osai-chat .cursor') && m[1].textContent.length > 20
}, null, { timeout: 180000 })
const a2 = await page.locator('.osai-chat .msg.assistant').nth(1).textContent()
log('fable reply (first 300):', a2.slice(0, 300).replace(/\s+/g, ' '))
log('fable model tag:', await page.locator('.osai-chat .msg.assistant .model').nth(1).textContent())
await page.screenshot({ path: `${OUT}/05-chat.png` })

// 4. Memory note (the Haiku update runs after the response; poll the API)
let notes = ''
for (let i = 0; i < 12; i++) {
  const r = await ctx.request.get(`${BASE}/api/osai/memory`)
  notes = (await r.json()).notes ?? ''
  if (notes.trim()) break
  await page.waitForTimeout(2500)
}
log('memory note:', notes ? notes.replace(/\n/g, ' | ') : '(empty)')
await page.click('.osai-chat .memory summary')
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/06-memory.png` })

// 5. History survives a reload
await page.reload()
await page.waitForSelector('.osai-chat .msg.assistant')
log('history after reload =', await page.locator('.osai-chat .msg').count(), 'messages')

// 6. Phone layout
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const p = await phone.newPage()
p.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message))
await p.goto(`${BASE}/osai`)
await p.waitForSelector('.osai-login')
await p.screenshot({ path: `${OUT}/07-phone-login.png` })
await p.getByRole('button', { name: 'Bart' }).click()
await p.fill('#osai-passcode', '1102')
await p.getByRole('button', { name: /Continue as Bart/ }).click()
await p.waitForSelector('.osai-core h1')
const sw = await p.evaluate(() => document.documentElement.scrollWidth)
const cw = await p.evaluate(() => document.documentElement.clientWidth)
log('phone scrollWidth/clientWidth =', sw, '/', cw, sw > cw ? 'OVERFLOW' : 'ok')
await p.screenshot({ path: `${OUT}/08-phone-core.png`, fullPage: true })
await p.click('.osai-top .ask')
await p.waitForSelector('.osai-aside.open .osai-chat')
await p.waitForSelector('.osai-chat .msg.assistant')
await p.screenshot({ path: `${OUT}/09-phone-chat.png` })
await p.goto(`${BASE}/osai/overview`)
await p.waitForSelector('.osai-ov .row')
const sw2 = await p.evaluate(() => document.documentElement.scrollWidth)
log('phone overview scrollWidth =', sw2, sw2 > 390 ? 'OVERFLOW' : 'ok')
await p.screenshot({ path: `${OUT}/10-phone-overview.png`, fullPage: true })

// 7. Clean up the test conversation and memory, then sign out
const d1 = await ctx.request.delete(`${BASE}/api/osai/chat`)
const d2 = await ctx.request.delete(`${BASE}/api/osai/memory`)
log('cleanup:', d1.status(), d2.status())
await page.reload()
await page.waitForSelector('.osai-chat .starter')
log('after cleanup, messages =', await page.locator('.osai-chat .msg').count())
await page.click('.osai-top .right .out')
await page.waitForSelector('.osai-login')
log('signed out ok')

await browser.close()
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1) }
log('done, no page errors')
