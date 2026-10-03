// osai phone layout check in real WebKit (Playwright's), iPhone viewport:
//   BASE=https://ola.cx OUT=/tmp/shots node scripts/osai/phone-check.mjs
// Signs in as the e2e account, opens the chat sheet, focuses the composer,
// and fails on any horizontal overflow. iOS Safari's input auto-zoom is not
// emulated here; the 16px composer rule covers that.
import { webkit, devices } from 'playwright'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE ?? 'http://localhost:3240'
const OUT = process.env.OUT ?? '/tmp'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const env = Object.fromEntries(
  readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const log = (...a) => console.log('[phone]', ...a)
const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 14'] })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const width = async (label) => {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  log(label, 'scroll/client width =', w.join('/'), w[0] > w[1] ? 'OVERFLOW' : 'ok')
  if (w[0] > w[1]) errors.push(`${label}: horizontal overflow ${w[0]} > ${w[1]}`)
}
try {
  await page.goto(`${BASE}/osai`)
  await page.waitForSelector('.osai-login')
  await width('sign-in')
  await page.fill('#osai-name', 'e2e')
  await page.fill('#osai-passcode', env.OSAI_E2E_PASSCODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForSelector('.osai-core h1', { timeout: 30000 })
  await width('one-pager')
  await page.click('.osai-top .ask')
  await page.waitForSelector('.osai-aside.open .osai-chat')
  await page.waitForSelector('#osai-chat-input:not([disabled])')
  await width('chat sheet')
  const box = await page.locator('.osai-chat .compose').boundingBox()
  const vh = await page.evaluate(() => window.innerHeight)
  log('composer bottom', Math.round(box.y + box.height), 'of viewport', vh, box.y + box.height <= vh + 1 ? 'visible' : 'OFFSCREEN')
  await page.focus('#osai-chat-input')
  await page.waitForTimeout(400)
  await width('composer focused')
  await page.screenshot({ path: `${OUT}/webkit-chat.png` })
  await page.click('.osai-chat .close')
  await page.goto(`${BASE}/osai/overview`)
  await page.waitForSelector('.osai-ov .row')
  await width('landscape')
  await page.screenshot({ path: `${OUT}/webkit-landscape.png`, fullPage: true })
  await page.click('.osai-user-btn')
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.waitForSelector('.osai-login')
} finally {
  await browser.close()
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1) }
log('done')
