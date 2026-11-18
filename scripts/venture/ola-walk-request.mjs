// Walk one real request on app.ola.cx as a person on a phone (iPhone 14), screenshots as it goes.
//   node scripts/venture/ola-walk-request.mjs <out dir> <name> <password> "<request>" ("" = only watch the open one) [--invite <token>] [--minutes 15]
// Answers a question card from Ola with its first choice; prints the page text at each step.
import { chromium, devices } from 'playwright'
const a = process.argv.slice(2); const [out, name, pw, request] = a
const opt = (k) => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : null }
const minutes = Number(opt('--minutes') ?? 15)
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 14'] }); const p = await ctx.newPage()
let n = 0; const shot = async (label) => { await p.waitForTimeout(800); await p.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${label}.png` }); console.log(`[${n}] ${label} | ${(await p.innerText('body')).replace(/\s+/g, ' ').slice(0, 400)}`) }
if (opt('--invite')) {
  await p.goto(`https://app.ola.cx/#/invite/${opt('--invite')}`); await p.waitForSelector('input[type=password]')
  await p.locator('input[type=password]').first().fill(pw); await p.getByRole('button', { name: /make my account|continue|save/i }).first().click(); await p.waitForTimeout(2500)
} else {
  await p.goto('https://app.ola.cx/'); await p.waitForSelector('input[type=password]')
  await p.locator('input').first().fill(name); await p.locator('input[type=password]').fill(pw); await p.getByRole('button', { name: /sign in/i }).click(); await p.waitForTimeout(2500)
}
await shot('projects')
const open = p.getByRole('link').or(p.getByRole('button')).filter({ hasText: /block party|open/i }).first()
if (await open.count()) { await open.click(); await p.waitForTimeout(3000) }
await shot('project')
const box = p.locator('textarea:visible, input[type=text]:visible').last()
if (request) { await box.fill(request); await shot('typed'); await box.press('Enter'); await p.waitForTimeout(1500) } else { await box.click(); await p.waitForTimeout(2000) }
if (request && await box.inputValue()) { const send = p.locator('button[type=submit]:visible, button[aria-label*="end" i]:visible, button[aria-label*="ask" i]:visible').last(); if (await send.count()) await send.click() }
const t0 = Date.now(); let last = ''
while (Date.now() - t0 < minutes * 60000) {
  await p.waitForTimeout(20000)
  const txt = (await p.innerText('body')).replace(/\s+/g, ' ')
  const q = p.locator('[class*=question] button, [data-question] button').first()
  if (await q.count() && await q.isVisible().catch(() => false)) { await shot('question'); await q.click(); continue }
  if (txt !== last) { last = txt; await shot(`t${Math.round((Date.now() - t0) / 1000)}s`) }
  if (!/working on your request|Work is under way/i.test(txt) && Date.now() - t0 > 60000) break
}
await shot('end'); await p.evaluate(() => window.scrollTo(0, 0)); await shot('end-top')
await b.close()
