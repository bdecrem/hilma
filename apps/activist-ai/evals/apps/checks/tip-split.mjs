// Tip split: $100 bill, 20% tip, 4 people -> $30.00 each; 5 people -> $24.00 each.
import { open, findInput, setField, clickText, readAll, wait } from '../lib/harness.mjs'

export const NAMES = ['page_opens', 'bill_input', 'people_input', 'tip_20', 'each_of_4', 'each_of_5']

const money = (v) => new RegExp(`(\\$\\s*${v}(\\.00)?(?![\\d%.])|(?<![\\d.])${v}\\.00(?!\\d))`)

async function people(page, n) {
  const p = await findInput(page, /people|person|split|guest|diner|ways|how many|party|friend|group|number of/)
  if (!p) return false
  await setField(p, n)
  await p.press('Tab').catch(() => {})
  return true
}

export async function check(env, got) {
  const page = await open(env)
  got.page_opens = (await page.evaluate(() => document.body?.innerText?.trim().length || 0)) > 0
  const bill = await findInput(page, /bill|amount|total|check|cost|subtotal|price|\$/)
  if (!bill) return
  got.bill_input = true
  await setField(bill, 100)
  await bill.press('Tab').catch(() => {})
  // The tip: a field, a select, or a 20% button.
  const tip = await findInput(page, /tip|percent|%|gratuity/)
  if (tip) got.tip_20 = await setField(tip, (await tip.evaluate((e) => e.tagName)) === 'SELECT' ? /^\s*20\s*%?\s*$|\b20\s*%/ : 20)
  else got.tip_20 = !!(await clickText(page, /^\s*20\s*%\s*$/))
  if (tip) await tip.press('Tab').catch(() => {})
  got.people_input = await people(page, 4)
  await clickText(page, /calculate|split|compute|^\s*go\s*$|^\s*=\s*$/, { exclude: /reset|clear/ })
  await wait(page, 400)
  got.each_of_4 = money(30).test(await readAll(page))
  if (got.people_input) {
    await people(page, 5)
    await clickText(page, /calculate|split|compute|^\s*go\s*$|^\s*=\s*$/, { exclude: /reset|clear/ })
    await wait(page, 400)
    got.each_of_5 = money(24).test(await readAll(page))
  }
}
