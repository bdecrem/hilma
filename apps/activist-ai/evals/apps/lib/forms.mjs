// Filling in a form the way a person would: the field we care about, plausible values in the other
// empty fields, then the add button (or Enter).
import { findInput, clickText, wait } from './harness.mjs'

export async function fillOthers(page, skip = []) {
  const ins = page.locator('input:visible, textarea:visible')
  const n = await ins.count()
  for (let i = 0; i < n; i++) {
    const e = ins.nth(i)
    if (await e.evaluate((x, s) => s.includes(x.getAttribute('data-apps-pick')) || x.hasAttribute('data-apps-main'), skip).catch(() => true)) continue
    const type = (await e.getAttribute('type')) || 'text'
    if ((await e.inputValue().catch(() => 'x')) !== '') continue
    const v = { email: 'ana@example.org', tel: '5550100', number: '1', date: '2026-12-05', time: '10:00', url: 'https://example.org' }[type] ?? (['text', 'search', 'textarea'].includes(type) || (await e.evaluate((x) => x.tagName)) === 'TEXTAREA' ? 'x' : null)
    if (v !== null) await e.fill(v).catch(() => {})
  }
}

// Type `value` in the field matching `re` (or the first text field), fill the rest, submit.
export async function addEntry(page, re, value, { extra, button } = {}) {
  const f = (await findInput(page, re)) || (await findInput(page, /./))
  if (!f) return false
  await f.evaluate((e) => e.setAttribute('data-apps-main', ''))
  await f.fill(value)
  if (extra) await extra()
  await fillOthers(page)
  await f.evaluate((e) => e.removeAttribute('data-apps-main'))
  // The field's own form's button first (a page can have a "Sign up" link elsewhere).
  const own = f.locator('xpath=ancestor::form[1]//button[not(@type="button") and not(@type="reset")] | ancestor::form[1]//input[@type="submit"]').first()
  if (await own.count() && await own.isVisible().catch(() => false)) { await own.click({ timeout: 3000 }).catch(() => {}); await wait(page, 500); return true }
  const clicked = await clickText(page, button || /add|sign|join|submit|register|save|count me|volunteer|create|^\s*\+\s*$/i, { exclude: /clear|remove|delete|reset|cancel|share|export|print/i })
  if (!clicked) await f.press('Enter').catch(() => {})
  await wait(page, 500)
  return true
}
