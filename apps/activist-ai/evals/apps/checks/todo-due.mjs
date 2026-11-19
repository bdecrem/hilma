// To-do with due dates: add "Print flyers" due 2026-12-01; it and the date show; it can be marked
// done (its look or a checkbox changes, it is not deleted); a second task adds.
import { open, text, findInput, clickText } from '../lib/harness.mjs'
import { addEntry } from '../lib/forms.mjs'

export const NAMES = ['page_opens', 'add_task', 'shows_due_date', 'mark_done', 'second_task']
const DATE = /dec(ember)?\.?\s*0?1\b|\b0?1(st)?\s*dec|12\/0?1\b|2026-12-01|\b0?1\.12\b|\b0?1\/12\/2026/i

async function setDate(page, iso) {
  const d = (await findInput(page, /./, { type: 'date' })) || (await findInput(page, /due|date|when|deadline/))
  if (!d) return
  await d.evaluate((e) => e.setAttribute('data-apps-main', ''))
  const type = await d.getAttribute('type')
  await d.fill(type === 'date' ? iso : type === 'datetime-local' ? `${iso}T17:00` : iso).catch(() => {})
}

// The task's row: the smallest element holding the task text and a control.
const rowState = (page, name) => page.evaluate((name) => {
  const all = [...document.querySelectorAll('li, tr, div, article, label, section')].filter((e) => e.innerText?.includes(name))
  const row = all.find((e) => e.querySelector('input[type=checkbox], button, [role=checkbox]') && ![...e.children].some((c) => c.innerText?.includes(name) && c.querySelector('input[type=checkbox], button, [role=checkbox]'))) || null
  if (!row) return null
  row.setAttribute('data-apps-row', '')
  const looks = [row, ...row.querySelectorAll('*')].map((e) => { const s = getComputedStyle(e); return s.textDecorationLine + s.opacity + s.color }).join('|')
  return [row.className, looks, [...row.querySelectorAll('input[type=checkbox]')].map((c) => c.checked).join(), row.getAttribute('aria-checked'), row.closest('[class*=done], [class*=complete], [id*=done], [id*=complete]') ? 'in-done' : ''].join('#')
}, name)

export async function check(env, got) {
  const page = await open(env)
  got.page_opens = (await text(page)).trim().length > 0
  if (!(await findInput(page, /./))) return
  await addEntry(page, /task|to-?do|what|title|item|new|add/, 'Print flyers', { extra: () => setDate(page, '2026-12-01') })
  const t = await text(page)
  got.add_task = t.includes('Print flyers')
  if (!got.add_task) return
  got.shows_due_date = DATE.test(t)
  const before = await rowState(page, 'Print flyers')
  if (before) {
    const box = page.locator('[data-apps-row] input[type=checkbox], [data-apps-row] [role=checkbox]').first()
    if (await box.count()) await box.click({ timeout: 3000 }).catch(() => {})
    else {
      const b = page.locator('[data-apps-row] button').filter({ hasText: /done|complete|✓|✔|check|mark|finish/i }).first()
      if (await b.count()) await b.click({ timeout: 3000 }).catch(() => {})
      else await page.locator('[data-apps-row]').click({ timeout: 3000 }).catch(() => {})
    }
    await page.waitForTimeout(500)
    await page.evaluate(() => document.querySelectorAll('[data-apps-row]').forEach((e) => e.removeAttribute('data-apps-row')))
    const after = await rowState(page, 'Print flyers')
    got.mark_done = !!after && after !== before && (await text(page)).includes('Print flyers')
  }
  await addEntry(page, /task|to-?do|what|title|item|new|add/, 'Call the city', { extra: () => setDate(page, '2026-12-05') })
  const t2 = await text(page)
  got.second_task = t2.includes('Call the city') && t2.includes('Print flyers')
}
