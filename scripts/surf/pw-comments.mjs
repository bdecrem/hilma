// Token Surfers web comments check: on a creation page in a phone viewport,
// post a comment signed out (the sign-in modal must open), sign in as the
// throwaway surftest_b, see the comment appear with the handle and the count
// go up, see 💬 on the gallery tile, delete the comment with ×.
//   node scripts/surf/pw-comments.mjs <shots-dir> [base] [slug]
// With no slug it publishes one as surftest_a through the API and unpublishes it after.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] || '.'
const base = (process.argv[3] || 'http://localhost:3219').replace(/\/$/, '')
let slug = process.argv[4] || ''
const key = process.env.SURF_APP_KEY || ''
mkdirSync(out, { recursive: true })
const errors = []
let fails = 0
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++ }

async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...(key ? { 'x-surf-key': key } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, j: await r.json().catch(() => null) }
}
async function account(handle, password = 'surftest1') {
  let r = await api('/api/surf/auth/login', { method: 'POST', body: { handle, password } })
  if (r.status !== 200) r = await api('/api/surf/auth/signup', { method: 'POST', body: { handle, password } })
  if (r.status !== 200) throw new Error(`${handle}: ${r.status}`)
  return r.j.token
}

const A = await account('surftest_a')
let published = false
if (!slug) {
  const r = await api('/api/surf/apps', { method: 'POST', token: A, body: { client_id: 'pwcomments-' + Date.now().toString(36), title: 'comments check', emoji: '💬', prompt: 'a page to comment on', html: '<!doctype html><html><body style="font:700 32px system-ui;padding:40px">say hi ↓</body></html>' } })
  slug = r.j.app.slug
  published = true
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(e.message))
// the signed-out post answers 401 on purpose (it opens the sign-in modal); the browser logs that as a resource error
page.on('console', (m) => { if (m.type() === 'error' && !/status of 401/.test(m.text())) errors.push('console: ' + m.text().slice(0, 140)) })
try {
  await page.goto(`${base}/surf/a/${slug}`, { waitUntil: 'networkidle', timeout: 60000 })
  const cmts = page.locator('.cmts')
  await cmts.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/comments-empty.png`, fullPage: true })
  ok('comments section renders', await cmts.count() === 1)
  ok('empty state', (await cmts.locator('.cmts-empty').count()) === 1)

  // signed out: post → the sign-in modal
  await cmts.locator('textarea').fill('this slaps 🔥')
  await cmts.locator('button[type=submit]').click()
  await page.waitForSelector('.modal', { timeout: 5000 })
  ok('sign-in modal opens on post', (await page.locator('.modal').count()) === 1)
  await page.click('.modal .switch')   // "already surfing? sign in"
  await page.fill('.modal input[placeholder="handle"]', 'surftest_b')
  await page.fill('.modal input[placeholder="password"]', 'surftest1')
  await page.click('.modal button[type=submit]')
  await page.waitForSelector('.cmt', { timeout: 10000 })
  const first = cmts.locator('.cmt').first()
  ok('comment appears with the handle', (await first.locator('.who span').textContent()) === '@surftest_b' && (await first.locator('p').textContent()) === 'this slaps 🔥')
  ok('count is 1', (await cmts.locator('[data-count]').textContent()) === '1')
  ok('composer cleared', (await cmts.locator('textarea').inputValue()) === '')
  await page.screenshot({ path: `${out}/comments-posted.png`, fullPage: true })

  // a second one, then the tile on the gallery
  await cmts.locator('textarea').fill('remixing this tonight')
  await cmts.locator('button[type=submit]').click()
  await page.waitForFunction(() => document.querySelectorAll('.cmt').length === 2, null, { timeout: 8000 })
  ok('second comment on top', (await cmts.locator('.cmt').first().locator('p').textContent()) === 'remixing this tonight')
  await page.goto(`${base}/surf/gallery?sort=new`, { waitUntil: 'networkidle' })
  const tile = page.locator(`a.app[href="/surf/a/${slug}"] .votes`)
  ok('gallery tile shows 💬 2', (await tile.textContent())?.includes('💬 2'), await tile.textContent())
  await page.screenshot({ path: `${out}/gallery-tile.png`, clip: { x: 0, y: 0, width: 390, height: 844 } })

  // back: delete both with ×
  await page.goto(`${base}/surf/a/${slug}`, { waitUntil: 'networkidle' })
  ok('reload keeps both', (await page.locator('.cmt').count()) === 2)
  await page.locator('.cmt .x').first().click()
  await page.waitForFunction(() => document.querySelectorAll('.cmt').length === 1, null, { timeout: 8000 })
  await page.locator('.cmt .x').first().click()
  await page.waitForFunction(() => document.querySelectorAll('.cmt').length === 0, null, { timeout: 8000 })
  ok('both deleted, count 0', (await page.locator('[data-count]').textContent()) === '0')
  ok('empty state is back', (await page.locator('.cmts-empty').count()) === 1)
} finally {
  await b.close()
  if (published) await api(`/api/surf/apps/${slug}`, { method: 'DELETE', token: A })
}
ok('no page errors', errors.length === 0, errors.join(' | '))
console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
