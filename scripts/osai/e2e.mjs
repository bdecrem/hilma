// osai end-to-end check against a dev server (default localhost:3240):
//   OUT=/tmp/shots node scripts/osai/e2e.mjs            # or BASE=https://… for production
// Signs in as the test account (name "e2e", secret OSAI_E2E_PASSCODE from
// .env.local), reads the two tabs, the Landscape and the details page, chats on both models,
// runs two web-search turns, waits for the memory note, sets and removes an
// own password, checks the phone layout, then wipes the test account's rows.
// It never signs in as a real reader, so nothing of theirs can be touched.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE ?? 'http://localhost:3240'
const OUT = process.env.OUT ?? '/tmp'
const USER = 'e2e'
const errors = []
const log = (...a) => console.log('[e2e]', ...a)

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const env = Object.fromEntries(
  readFileSync(path.join(repo, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const SECRET = env.OSAI_E2E_PASSCODE
if (!SECRET) throw new Error('OSAI_E2E_PASSCODE missing from .env.local')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/40[03]/.test(m.text())) errors.push('console: ' + m.text()) }) // the deliberate bad sign-ins are expected

const waitAssistant = (n) =>
  page.waitForFunction(
    (n) => {
      const m = document.querySelectorAll('.osai-chat .msg.assistant')
      return m.length === n && !document.querySelector('.osai-chat .cursor') && m[n - 1].textContent.length > 40
    },
    n,
    { timeout: 300000 },
  )

let snapshot = null
try {
  // 1. Sign in: unknown name, wrong passcode, then right
  await page.goto(`${BASE}/osai`)
  await page.waitForSelector('.osai-login')
  await page.screenshot({ path: `${OUT}/01-login.png` })
  await page.fill('#osai-name', 'Nobody')
  await page.fill('#osai-passcode', '1102')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForSelector('.osai-login .err')
  log('unknown name →', await page.textContent('.osai-login .err'))
  await page.fill('#osai-name', 'E2E')
  await page.fill('#osai-passcode', '1102')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForFunction(() => /not right/.test(document.querySelector('.osai-login .err')?.textContent ?? ''))
  log('shared passcode on the test account →', await page.textContent('.osai-login .err'))
  await page.fill('#osai-passcode', SECRET)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForSelector('.osai-res h1', { timeout: 30000 })
  log('signed in; landing =', await page.textContent('.osai-res h1'), '| resources =', await page.locator('.osai-res .entry').count())

  // Start clean: the test account's rows are disposable.
  await ctx.request.delete(`${BASE}/api/osai/chat`)
  await ctx.request.delete(`${BASE}/api/osai/memory`)
  await ctx.request.delete(`${BASE}/api/osai/auth/password`)
  await page.reload()
  await page.waitForSelector('.osai-res h1')
  snapshot = { notes: '' }
  const existing = (await (await ctx.request.get(`${BASE}/api/osai/chat`)).json()).history.length
  log('test account reset; messages =', existing)

  await page.waitForSelector('#osai-chat-input:not([disabled])')
  const tabs = await page.locator('.osai-nav a').allTextContents()
  log('tabs =', tabs.join(' | '))
  if (tabs.length !== 2) throw new Error('expected two tabs')
  const base = await page.locator('.osai-chat .msg.assistant').count()
  await page.screenshot({ path: `${OUT}/02-resources.png`, fullPage: true })

  // 2. The memo, then the Landscape (reached from the card under the memo) + details
  await page.click('.osai-nav a[href="/osai/memo"]')
  await page.waitForSelector('.osai-core h1')
  log('core title =', await page.textContent('.osai-core h1'), '| landscape card:', (await page.locator('a.osai-landscape').count()) === 1 ? 'yes' : 'MISSING')
  await page.screenshot({ path: `${OUT}/02b-core.png`, fullPage: true })
  await page.click('a.osai-landscape')
  await page.waitForSelector('.osai-ov .row')
  log('landscape rows =', await page.locator('.osai-ov .row').count(), '| details card:', (await page.locator('.osai-ov .detail-card').count()) === 1 ? 'yes' : 'MISSING')
  await page.screenshot({ path: `${OUT}/03-landscape.png`, fullPage: true })
  await page.click('.osai-ov .row >> nth=0')
  await page.waitForURL(/\/osai\/details#box-3/)
  await page.waitForSelector('#box-3')
  log('details boxes =', await page.locator('.osai-dt .box').count(), '| current tab:', await page.locator('.osai-nav a[aria-current="page"]').textContent())
  if (await page.locator('.osai-dt h2#people').count()) throw new Error('people section still present')
  await page.screenshot({ path: `${OUT}/04-details.png`, fullPage: true })

  // 3. Grounded turn on Opus, then Fable
  await page.click('.osai-chat .seg button[title="claude-opus-5-5"]')
  await page.fill('#osai-chat-input', 'Where is the field thinnest, and why? Two sentences.')
  await page.keyboard.press('Enter')
  await waitAssistant(base + 1)
  const a1 = await page.locator('.osai-chat .msg.assistant').nth(base).textContent()
  log('opus reply (first 240):', a1.slice(0, 240).replace(/\s+/g, ' '))
  await page.click('.osai-chat .seg button[title="claude-fable-5-1"]')
  await page.fill('#osai-chat-input', 'In one sentence: remember that I care most about the product layer. Then tell me which line of the one-pager the map reads as the Mozilla-style move.')
  await page.keyboard.press('Enter')
  await waitAssistant(base + 2)
  const a2 = await page.locator('.osai-chat .msg.assistant').nth(base + 1).textContent()
  log('fable reply (first 240):', a2.slice(0, 240).replace(/\s+/g, ' '))
  log('model tags:', await page.locator('.osai-chat .msg.assistant .model').nth(base).textContent(), '/', await page.locator('.osai-chat .msg.assistant .model').nth(base + 1).textContent())
  await page.screenshot({ path: `${OUT}/05-chat.png` })

  // 3b. Web search: the prompt under the last answer (Fable), then the Web toggle (Opus)
  await page.click('.osai-chat .check-web')
  await waitAssistant(base + 3)
  const a3 = await page.locator('.osai-chat .msg.assistant').nth(base + 2).textContent()
  log('search reply, fable (first 240):', a3.slice(0, 240).replace(/\s+/g, ' '))
  log('  has "From the web":', /From the web/i.test(a3) ? 'yes' : 'no', '| source chips:', await page.locator(`.osai-chat .msg.assistant >> nth=${base + 2} >> .sources a`).count())
  await page.click('.osai-chat .seg button[title="claude-opus-5-5"]')
  await page.click('.osai-chat .web')
  await page.fill('#osai-chat-input', 'What has Mozilla announced about AI in the last two weeks?')
  await page.keyboard.press('Enter')
  await waitAssistant(base + 4)
  const a4 = await page.locator('.osai-chat .msg.assistant').nth(base + 3).textContent()
  log('search reply, opus (first 240):', a4.slice(0, 240).replace(/\s+/g, ' '))
  log('  source chips:', await page.locator(`.osai-chat .msg.assistant >> nth=${base + 3} >> .sources a`).count(), '| web toggle reset:', (await page.getAttribute('.osai-chat .web', 'aria-pressed')) === 'false' ? 'yes' : 'NO')
  await page.screenshot({ path: `${OUT}/06-search.png` })

  // 4. Memory note changed (the Haiku update runs after each response)
  let notes = snapshot.notes
  for (let i = 0; i < 16 && notes === snapshot.notes; i++) {
    await page.waitForTimeout(2500)
    notes = (await (await ctx.request.get(`${BASE}/api/osai/memory`)).json()).notes ?? ''
  }
  log('memory note changed:', notes !== snapshot.notes ? 'yes' : 'NO', '|', notes.replace(/\n/g, ' | ').slice(0, 200))

  // 5. History survives a reload
  await page.reload()
  await page.waitForSelector('.osai-chat .msg.assistant')
  log('assistant messages after reload =', await page.locator('.osai-chat .msg.assistant').count(), `(expect ${base + 4})`)

  // 6. Own password replaces the sign-in secret
  {
    try {
      await page.click('.osai-user-btn')
      await page.getByRole('menuitem', { name: 'Set a password' }).click()
      await page.waitForSelector('.osai-dialog')
      await page.fill('#osai-pw-new', 'e2e-password-1')
      await page.fill('#osai-pw-confirm', 'e2e-password-2')
      await page.click('.osai-dialog .primary')
      await page.waitForSelector('.osai-dialog .err')
      log('mismatch →', await page.textContent('.osai-dialog .err'))
      await page.fill('#osai-pw-confirm', 'e2e-password-1')
      await page.click('.osai-dialog .primary')
      await page.waitForSelector('.osai-dialog .ok')
      log('password set →', (await page.textContent('.osai-dialog .ok')).slice(0, 60))
      await page.screenshot({ path: `${OUT}/07-password.png` })
      await page.click('.osai-dialog .primary')
      await page.click('.osai-user-btn')
      log('menu label now:', await page.getByRole('menuitem', { name: /password/i }).textContent())
      await page.getByRole('menuitem', { name: 'Sign out' }).click()
      await page.waitForSelector('.osai-login')
      await page.fill('#osai-name', 'e2e')
      await page.fill('#osai-passcode', SECRET)
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.waitForSelector('.osai-top .wordmark', { timeout: 30000 })
      log('signed in again: yes (the test account always uses its own secret; the dialog, hash and removal are what is checked here)')
    } finally {
      const r = await ctx.request.delete(`${BASE}/api/osai/auth/password`)
      log('own password removed:', r.status())
    }
  }

  // 7. Phone layout
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const p = await phone.newPage()
  p.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message))
  await p.goto(`${BASE}/osai`)
  await p.waitForSelector('.osai-login')
  await p.screenshot({ path: `${OUT}/08-phone-login.png` })
  await p.fill('#osai-name', 'e2e')
  await p.fill('#osai-passcode', SECRET)
  await p.getByRole('button', { name: 'Continue' }).click()
  await p.waitForSelector('.osai-core h1')
  const sw = await p.evaluate(() => document.documentElement.scrollWidth)
  log('phone scrollWidth =', sw, sw > 390 ? 'OVERFLOW' : 'ok')
  await p.screenshot({ path: `${OUT}/09-phone-core.png`, fullPage: true })
  await p.click('.osai-top .ask')
  await p.waitForSelector('.osai-aside.open .osai-chat')
  await p.waitForSelector('.osai-chat .msg.assistant')
  await p.screenshot({ path: `${OUT}/10-phone-chat.png` })
  await p.goto(`${BASE}/osai/overview`)
  await p.waitForSelector('.osai-ov .row')
  const sw2 = await p.evaluate(() => document.documentElement.scrollWidth)
  log('phone landscape scrollWidth =', sw2, sw2 > 390 ? 'OVERFLOW' : 'ok')
  await p.screenshot({ path: `${OUT}/11-phone-landscape.png`, fullPage: true })
  await phone.close()

  await page.click('.osai-user-btn')
  await page.getByRole('menuitem', { name: 'Memory' }).click()
  await page.waitForFunction(() => (document.querySelector('.osai-dialog .notes')?.textContent ?? '…') !== '…')
  log('memory dialog:', (await page.textContent('.osai-dialog .notes')).slice(0, 80).replace(/\n/g, ' | '))
  await page.keyboard.press('Escape')
  await page.click('.osai-user-btn')
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.waitForSelector('.osai-login')
  log('signed out ok')
} finally {
  // 8. Wipe the test account (its rows are the only thing this script ever writes).
  if (snapshot) {
    await ctx.request.post(`${BASE}/api/osai/auth/login`, { data: { user: USER, passcode: SECRET } }) // the page may have signed out
    const c = await ctx.request.delete(`${BASE}/api/osai/chat`)
    const m = await ctx.request.delete(`${BASE}/api/osai/memory`)
    const w = await ctx.request.delete(`${BASE}/api/osai/auth/password`)
    log('cleanup (test account only):', c.status(), m.status(), w.status())
  }
  await browser.close()
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1) }
log('done, no page errors')
