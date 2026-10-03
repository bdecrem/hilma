// osai end-to-end check against a dev server (default localhost:3240):
//   OUT=/tmp/shots node scripts/osai/e2e.mjs
// Signs in as bart, reads the two tabs and the details page, chats on both
// models, runs two web-search turns, waits for the memory note, sets and
// removes an own password, checks the phone layout. It runs against the real
// tables, so it snapshots bart's history and memory note first and at the end
// deletes only the rows it created and puts the note back. Never run it while
// the real bart has set his own password: that part is skipped automatically.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE ?? 'http://localhost:3240'
const OUT = process.env.OUT ?? '/tmp'
const USER = 'bart'
const errors = []
const log = (...a) => console.log('[e2e]', ...a)

// Service-role client for the cleanup, from .env.local (never printed).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const env = Object.fromEntries(
  readFileSync(path.join(repo, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

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
  await page.fill('#osai-name', 'Bart')
  await page.fill('#osai-passcode', '0000')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForFunction(() => /not right/.test(document.querySelector('.osai-login .err')?.textContent ?? ''))
  log('wrong passcode →', await page.textContent('.osai-login .err'))
  await page.fill('#osai-passcode', '1102')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForSelector('.osai-core h1', { timeout: 30000 })
  log('signed in; core title =', await page.textContent('.osai-core h1'))

  // Snapshot the real state before touching anything.
  const st = await (await ctx.request.get(`${BASE}/api/osai/chat`)).json()
  const pw = await (await ctx.request.get(`${BASE}/api/osai/auth/password`)).json()
  snapshot = { maxId: Math.max(0, ...st.history.map((r) => r.id)), notes: st.notes ?? '', hasPassword: !!pw.hasPassword }
  log('snapshot: existing messages =', st.history.length, '| note chars =', snapshot.notes.length, '| own password =', snapshot.hasPassword)

  await page.waitForSelector('#osai-chat-input:not([disabled])')
  const tabs = await page.locator('.osai-nav a').allTextContents()
  log('tabs =', tabs.join(' | '))
  if (tabs.length !== 2) throw new Error('expected two tabs')
  const base = await page.locator('.osai-chat .msg.assistant').count()
  await page.screenshot({ path: `${OUT}/02-core.png`, fullPage: true })

  // 2. Landscape + details
  await page.click('.osai-nav a[href="/osai/overview"]')
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
  await page.click('.osai-chat .more-web')
  await waitAssistant(base + 3)
  const a3 = await page.locator('.osai-chat .msg.assistant').nth(base + 2).textContent()
  log('search reply, fable (first 240):', a3.slice(0, 240).replace(/\s+/g, ' '))
  log('  has "From the web":', /From the web/i.test(a3) ? 'yes' : 'no', '| Sources:', /Sources:/.test(a3) ? 'yes' : 'no', '| links:', await page.locator(`.osai-chat .msg.assistant >> nth=${base + 2} >> a`).count())
  await page.click('.osai-chat .seg button[title="claude-opus-5-5"]')
  await page.click('.osai-chat .web')
  await page.fill('#osai-chat-input', 'What has Mozilla announced about AI in the last two weeks?')
  await page.keyboard.press('Enter')
  await waitAssistant(base + 4)
  const a4 = await page.locator('.osai-chat .msg.assistant').nth(base + 3).textContent()
  log('search reply, opus (first 240):', a4.slice(0, 240).replace(/\s+/g, ' '))
  log('  Sources:', /Sources:/.test(a4) ? 'yes' : 'no', '| web toggle reset:', (await page.getAttribute('.osai-chat .web', 'aria-pressed')) === 'false' ? 'yes' : 'NO')
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

  // 6. Own password replaces the shared passcode (skipped if the real bart has one)
  if (snapshot.hasPassword) {
    log('password test skipped: bart already has his own password')
  } else {
    try {
      await page.getByRole('button', { name: 'Set a password' }).first().click()
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
      log('top-bar label now:', await page.getByRole('button', { name: /password/i }).first().textContent())
      await page.getByRole('button', { name: 'Sign out' }).first().click()
      await page.waitForSelector('.osai-login')
      await page.fill('#osai-name', 'Bart')
      await page.fill('#osai-passcode', '1102')
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.waitForSelector('.osai-login .err')
      log('shared passcode after setting a password →', await page.textContent('.osai-login .err'))
      await page.fill('#osai-passcode', 'e2e-password-1')
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.waitForSelector('.osai-top .wordmark', { timeout: 30000 }) // whichever page we were on
      log('signed in with own password: yes')
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
  await p.fill('#osai-name', 'bart')
  await p.fill('#osai-passcode', '1102')
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

  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await page.waitForSelector('.osai-login')
  log('signed out ok')
} finally {
  // 8. Put bart's data back: only the rows this run created, and his note.
  if (snapshot) {
    const del = await db.from('osai_messages').delete().eq('user_name', USER).gt('id', snapshot.maxId).select('id')
    const note = await db.from('osai_memory').upsert({ user_name: USER, notes: snapshot.notes, updated_at: new Date().toISOString() })
    log('cleanup: removed', del.data?.length ?? '?', 'test messages', del.error ? `(error: ${del.error.message})` : '', '| note restored:', note.error ? `error: ${note.error.message}` : 'yes')
  }
  await browser.close()
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1) }
log('done, no page errors')
