// Unit converter: 100 °F -> 37.8 °C, 10 km -> 6.21 mi, 1 kg -> 2.2 lb, and 50 km -> 31.07 mi after
// changing the number. Drives category tabs or selects, unit selects, one number field.
import { open, text, clickText, readAll, wait } from '../lib/harness.mjs'

export const NAMES = ['page_opens', 'number_input', 'temperature', 'distance', 'weight', 'updates_on_change']

const U = {
  F: 'fahrenheit|°\\s*f\\b|^\\s*f\\s*$', C: 'celsius|centigrade|°\\s*c\\b|^\\s*c\\s*$',
  km: 'kilomet|\\bkm\\b', mi: '\\bmiles?\\b|\\bmi\\b', kg: 'kilogram|\\bkg\\b', lb: 'pound|\\blbs?\\b',
}

// Pick the category (a select option or a tab/button), then the from and to units in the selects
// that offer both.
async function setUnits(page, cat, from, to) {
  await page.evaluate(([cat, from, to]) => {
    const fire = (s) => { s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })) }
    const pick = (s, re) => { const o = [...s.options].find((o) => new RegExp(re, 'i').test(o.textContent) || new RegExp(re, 'i').test(o.value)); if (o) { s.value = o.value; fire(s) } return !!o }
    const sels = () => [...document.querySelectorAll('select')].filter((s) => s.getBoundingClientRect().width > 0)
    for (const s of sels()) if ([...s.options].some((o) => new RegExp(cat, 'i').test(o.textContent + o.value)) && ![...s.options].some((o) => new RegExp(from, 'i').test(o.textContent))) pick(s, cat)
  }, [cat, U[from], U[to]])
  await clickText(page, new RegExp(`^\\s*(${cat})\\w*\\s*$`, 'i'))
  await wait(page, 300)
  return page.evaluate(([from, to]) => {
    const fire = (s) => { s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })) }
    const has = (s, re) => [...s.options].find((o) => new RegExp(re, 'i').test(o.textContent) || new RegExp(re, 'i').test(o.value))
    const sels = [...document.querySelectorAll('select')].filter((s) => s.getBoundingClientRect().width > 0 && has(s, from) && has(s, to))
    if (sels[0]) { sels[0].value = has(sels[0], from).value; fire(sels[0]) }
    if (sels[1]) { sels[1].value = has(sels[1], to).value; fire(sels[1]) }
    return sels.length
  }, [U[from], U[to]])
}

async function convert(page, cat, from, to, value, want) {
  await setUnits(page, cat, from, to)
  const num = page.locator('input[type=number]:visible, input[inputmode=decimal]:visible, input[type=text]:visible').first()
  if (!(await num.count())) return false
  await num.fill(String(value))
  await num.dispatchEvent('input').catch(() => {})
  await num.press('Tab').catch(() => {})
  await clickText(page, /^\s*(convert|calculate|go|=)\s*$/i)
  await wait(page, 400)
  return want.test(await readAll(page))
}

export async function check(env, got) {
  const page = await open(env)
  got.page_opens = (await text(page)).trim().length > 0
  got.number_input = (await page.locator('input[type=number]:visible, input[inputmode=decimal]:visible, input[type=text]:visible').count()) > 0
  if (!got.number_input) return
  got.temperature = await convert(page, 'temp', 'F', 'C', 100, /37\.7\d*|37\.8\b|37\.8\d/)
  got.distance = await convert(page, 'dist|length|len', 'km', 'mi', 10, /6\.21\d*|6\.2\b/)
  got.updates_on_change = got.distance && (await convert(page, 'dist|length|len', 'km', 'mi', 50, /31\.0[67]\d*|31\.1\b/))
  got.weight = await convert(page, 'weight|mass', 'kg', 'lb', 1, /2\.20\d*|2\.2\b/)
}
