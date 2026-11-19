// Sign-up sheet: add a name, it shows, it survives a reload, a second name adds to the list.
import { open, text, findInput } from '../lib/harness.mjs'
import { addEntry } from '../lib/forms.mjs'

export const NAMES = ['page_opens', 'name_input', 'adds_name', 'survives_reload', 'second_name']

export async function check(env, got) {
  const page = await open(env)
  got.page_opens = (await text(page)).trim().length > 0
  got.name_input = !!(await findInput(page, /name/)) || !!(await findInput(page, /./))
  if (!got.name_input) return
  await addEntry(page, /name/, 'Ana Lopez')
  got.adds_name = (await text(page)).includes('Ana Lopez')
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(800)
  got.survives_reload = got.adds_name && (await text(page)).includes('Ana Lopez')
  await addEntry(page, /name/, 'Ben Okafor')
  const t = await text(page)
  got.second_name = t.includes('Ben Okafor') && t.includes('Ana Lopez')
}
