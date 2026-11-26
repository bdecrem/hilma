// Spreadsheet (Bart's request of Nov 25, OLA-466): used at phone size the way he used it. Tap a cell,
// type, press Enter, read what the cell shows. The page that failed for him computed every formula
// right and still showed `=A6+B6*3` in the cell after Enter: only reading the cell a person just left
// catches that, so every value here is read from the cell, never from the page's own state.
//
// The grid is found by where things are on screen, not by the page's markup: each model names its
// cells differently (aria-label="A1", data-key, data-ref, plain <td>). Cells are the page's text
// fields (or table cells when it has no fields) grouped into rows by their top edge and ordered left
// to right; a first row of letters or first column of numbers is the header and is skipped. The test
// stays inside columns A to E and rows 6 to 9, which exist whichever way "10 by 20" was read.
import { open, wait } from '../lib/harness.mjs'

export const NAMES = ['page_opens', 'grid_found', 'formula_shows_value', 'sum_range', 'recalculates_as_typed', 'text_cell', 'arrows_move', 'loop_shows_error']

/** Tags every cell with data-olacheck="A1"… (again each time: some pages redraw the grid) and returns its size. */
const tag = (page) => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 8 && getComputedStyle(e).visibility !== 'hidden' }
  let els = [...document.querySelectorAll('input:not([type]), input[type=text], input[type=search], textarea, [contenteditable=""], [contenteditable=true]')].filter(vis)
  if (els.length < 50) els = [...document.querySelectorAll('td, [role=gridcell], [role=cell]')].filter(vis)
  const at = els.map((e) => { const r = e.getBoundingClientRect(); return { e, x: r.left + scrollX, y: r.top + scrollY } }).sort((a, b) => a.y - b.y || a.x - b.x)
  let rows = []
  for (const c of at) { const last = rows[rows.length - 1]; if (last && Math.abs(last[0].y - c.y) <= 4) last.push(c); else rows.push([c]) }
  rows = rows.filter((r) => r.length >= 5).map((r) => r.sort((a, b) => a.x - b.x))
  const shown = (e) => ('value' in e && e.tagName !== 'TD' ? e.value : e.innerText || '').trim()
  // A header drawn with the same elements as the cells: a row of letters, a column of numbers.
  if (rows.length && rows[0].filter((c) => /^[A-Z]{1,2}$/.test(shown(c.e))).length >= rows[0].length - 1) rows.shift()
  if (rows.length >= 5 && rows.slice(0, 5).every((r, i) => shown(r[0].e) === String(i + 1))) rows = rows.map((r) => r.slice(1))
  document.querySelectorAll('[data-olacheck]').forEach((e) => e.removeAttribute('data-olacheck'))
  rows.forEach((r, ri) => r.forEach((c, ci) => { if (ci < 26) c.e.setAttribute('data-olacheck', String.fromCharCode(65 + ci) + (ri + 1)) }))
  return { rows: rows.length, cols: rows.length ? Math.min(...rows.map((r) => r.length)) : 0 }
})

const cell = async (page, ref) => { await tag(page); return page.locator(`[data-olacheck="${ref}"]`).first() }

/** What a person reads in the cell. */
async function shown(page, ref) {
  const c = await cell(page, ref)
  if (!(await c.count())) return null
  return c.evaluate((e) => ('value' in e && e.tagName !== 'TD' ? e.value : e.innerText || '').trim())
}

/** Tap the cell, replace what it holds, optionally press Enter. */
async function type(page, ref, value, { enter = true } = {}) {
  const c = await cell(page, ref)
  await c.scrollIntoViewIfNeeded().catch(() => {})
  await c.click({ timeout: 3000 })
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Backspace')
  if (value !== '') await page.keyboard.type(String(value), { delay: 15 })
  if (enter) await page.keyboard.press('Enter')
  await wait(page, 250)
}

/** The cell the keyboard is in, or null. */
async function focused(page) {
  await tag(page)
  return page.evaluate(() => document.activeElement?.closest?.('[data-olacheck]')?.getAttribute('data-olacheck') || document.querySelector('[data-olacheck]:focus-within')?.getAttribute('data-olacheck') || null)
}

const is = (v, n) => v != null && new RegExp(`^\\s*${n}(\\.0+)?\\s*$`).test(v)
const isError = (v) => !!v && !v.startsWith('=') && /circ|loop|cycl|err|#|ref|invalid|⚠|!/i.test(v) && !/^-?\d+(\.\d+)?$/.test(v)

export async function check(env, got) {
  const page = await open(env)
  await page.setViewportSize({ width: 390, height: 844 })
  await wait(page, 300)
  got.page_opens = (await page.evaluate(() => document.body?.innerHTML?.trim().length || 0)) > 0
  const grid = await tag(page)
  env.notes.push(`grid ${grid.cols} across, ${grid.rows} down`)
  got.grid_found = grid.rows >= 10 && grid.cols >= 10
  if (grid.rows < 9 || grid.cols < 5) return

  // A formula shows its value in the cell once you press Enter.
  await type(page, 'A6', 2)
  await type(page, 'B6', 4)
  await type(page, 'C6', '=A6+B6*3')
  const c6 = await shown(page, 'C6')
  got.formula_shows_value = is(c6, 14)
  if (!got.formula_shows_value) env.notes.push(`after Enter the formula cell shows "${String(c6).slice(0, 40)}" (want 14)`)

  await type(page, 'D6', '=SUM(A6:C6)')

  // "Everything recalculates as I type": change A6 without pressing Enter and read C6.
  await type(page, 'A6', 8, { enter: false })
  got.recalculates_as_typed = is(await shown(page, 'C6'), 20)
  // The sum is read here, after typing elsewhere, so a page that leaves a finished formula's text in
  // its cell fails formula_shows_value only, not this too: 8 + 4 + 20.
  got.sum_range = is(await shown(page, 'D6'), 32)
  await page.keyboard.press('Enter')
  await wait(page, 200)

  await type(page, 'E6', 'hello')
  got.text_cell = (await shown(page, 'E6')) === 'hello' && is(await shown(page, 'A6'), 8)

  // The arrow keys move between cells (from an empty cell, so the arrow has no text to move inside).
  await type(page, 'B8', '', { enter: false })
  await type(page, 'A8', '', { enter: false })
  await page.keyboard.press('ArrowRight')
  await wait(page, 150)
  const right = await focused(page)
  await page.keyboard.press('ArrowDown')
  await wait(page, 150)
  const down = await focused(page)
  got.arrows_move = right === 'B8' && down === 'B9'
  if (!got.arrows_move) env.notes.push(`arrows from A8: right went to ${right}, then down to ${down} (want B8, B9)`)

  // A circular reference shows an error in the cell.
  await type(page, 'A9', '=B9')
  await type(page, 'B9', '=A9')
  await type(page, 'E8', 'x', { enter: false }) // typing elsewhere, for the same reason as the sum
  const a9 = await shown(page, 'A9'), b9 = await shown(page, 'B9')
  got.loop_shows_error = isError(a9) && isError(b9)
  if (!got.loop_shows_error) env.notes.push(`loop: A9 shows "${String(a9).slice(0, 30)}", B9 shows "${String(b9).slice(0, 30)}"`)
}
