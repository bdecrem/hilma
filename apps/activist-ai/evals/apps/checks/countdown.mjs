// Countdown to 2027-03-14 10:00 local time, seen with the clock set to 2027-03-04 06:00: 10 days
// 4 hours left (11 accepted for a count that rounds days up); the count moves; a share button shares, copies or opens a share link.
import { open, clickText, text, wait } from '../lib/harness.mjs'

export const NAMES = ['page_opens', 'shows_10_days', 'ticks', 'share_button', 'share_does_something']

export async function check(env, got) {
  await env.ctx.addInitScript(() => {
    window.__shared = []
    const rec = (k) => (...a) => { window.__shared.push(k + ' ' + JSON.stringify(a).slice(0, 200)); return Promise.resolve() }
    try { Object.defineProperty(navigator, 'share', { value: rec('share'), configurable: true }) } catch {}
    try { Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true }) } catch {}
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: rec('clipboard'), write: rec('clipboard') }, configurable: true }) } catch {}
    const exec = document.execCommand?.bind(document)
    document.execCommand = (c, ...r) => { if (c === 'copy') window.__shared.push('execCommand copy'); return exec ? exec(c, ...r) : true }
    window.open = (u) => { window.__shared.push('open ' + u); return null }
  })
  const page = await env.ctx.newPage()
  await page.clock.install({ time: new Date(2027, 2, 4, 6, 0, 0) })
  env.page = page
  page.on('pageerror', (e) => env.errors.push(String(e.message || e)))
  page.on('dialog', (d) => d.accept().catch(() => {}))
  await page.goto(env.url, { waitUntil: 'load', timeout: 20000 })
  await page.clock.runFor(1500)
  const t0 = await text(page)
  got.page_opens = t0.trim().length > 0
  // "10" days: as its own number next to "days", or written out.
  got.shows_10_days = /\b1[01]\s*(days?|d)\b/i.test(t0) || (await page.evaluate(() => {
    const leaves = [...document.querySelectorAll('body *')].filter((e) => !e.children.length && /^\s*1[01]\s*$/.test(e.textContent))
    return leaves.some((e) => /day/i.test((e.parentElement?.innerText || '') + (e.nextElementSibling?.innerText || '')))
  }))
  await page.clock.runFor(3000)
  got.ticks = (await text(page)) !== t0
  const before = await page.evaluate(() => document.body.innerText)
  const pagesBefore = env.ctx.pages().length
  const clicked = await clickText(page, /share|copy link|tweet|invite/i)
  got.share_button = !!clicked
  if (clicked) {
    await page.clock.runFor(500)
    await wait(page, 300)
    const shared = await page.evaluate(() => window.__shared)
    const after = await page.evaluate(() => document.body.innerText)
    got.share_does_something = shared.length > 0 || env.ctx.pages().length > pagesBefore || (after !== before && /copied|shared|link/i.test(after))
  }
}
