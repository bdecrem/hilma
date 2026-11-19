// Crossword: a real grid (>= 5x5 square cells), numbers in cells, a clue list, an AI call, a new
// puzzle that differs, typing a letter into a cell.
import { open, clickText, wait } from '../lib/harness.mjs'

export const NAMES = ['page_opens', 'grid_5x5', 'numbered_starts', 'clue_list', 'uses_ai', 'new_puzzle_differs', 'typing_fills']

// In the page: the largest set of same-sized square boxes laid out on >= 5 columns and >= 5 rows.
function readGrid() {
  const vis = (e) => { const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 }
  const boxes = []
  for (const e of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'BUTTON'].includes(e.tagName) || e.closest('button')) continue
    const r = e.getBoundingClientRect()
    if (r.width < 12 || r.width > 90 || r.height < 12 || r.height > 90) continue
    if (r.width / r.height < 0.8 || r.width / r.height > 1.25 || !vis(e)) continue
    boxes.push({ e, r, k: `${Math.round(r.width / 3)}x${Math.round(r.height / 3)}` })
  }
  const groups = {}
  for (const b of boxes) (groups[b.k] ||= []).push(b)
  let best = null
  for (const g of Object.values(groups)) {
    const set = new Set(g.map((b) => b.e))
    const outer = g.filter((b) => { let p = b.e.parentElement; while (p) { if (set.has(p)) return false; p = p.parentElement } return true })
    // one box per position
    const seen = new Map()
    for (const b of outer) { const key = `${Math.round(b.r.left / 4)},${Math.round(b.r.top / 4)}`; if (!seen.has(key)) seen.set(key, b) }
    const cells = [...seen.values()]
    const xs = new Set(cells.map((b) => Math.round(b.r.left / 4))), ys = new Set(cells.map((b) => Math.round(b.r.top / 4)))
    if (xs.size >= 5 && ys.size >= 5 && cells.length >= 20 && (!best || cells.length > best.length)) best = cells
  }
  if (!best) return null
  best.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left)
  const lum = (e) => { const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g); if (!m || (m[3] !== undefined && +m[3] < 0.3)) return 1; return (0.3 * m[0] + 0.59 * m[1] + 0.11 * m[2]) / 255 }
  // numbers: visible 1-3 digit texts whose centre is inside a cell
  const nums = new Set()
  const inCell = (x, y) => best.some((b) => x >= b.r.left && x <= b.r.right && y >= b.r.top && y <= b.r.bottom)
  for (const e of document.querySelectorAll('body *')) {
    if (e.children.length || !/^\s*\d{1,3}\s*$/.test(e.textContent) || !vis(e)) continue
    const r = e.getBoundingClientRect()
    if (r.width && inCell(r.left + r.width / 2, r.top + r.height / 2)) nums.add(+e.textContent.trim())
  }
  const letters = best.map((b) => { const i = b.e.matches('input') ? b.e : b.e.querySelector('input'); return (i ? i.value : b.e.innerText.replace(/\d/g, '')).trim().toUpperCase() })
  const dark = best.map((b) => lum(b.e) < 0.35)
  const white = best.findIndex((b, i) => !dark[i])
  const w = best[white]
  return {
    n: best.length, cols: new Set(best.map((b) => Math.round(b.r.left / 4))).size, rows: new Set(best.map((b) => Math.round(b.r.top / 4))).size,
    nums: [...nums], letters: letters.join('|'), sig: dark.map((d) => (d ? '#' : '.')).join('') + [...nums].join(','),
    white: w ? { x: w.r.left + w.r.width / 2, y: w.r.top + w.r.height / 2 } : null,
  }
}

function readClues() {
  const re = /^\s*\d{1,2}\s*(?:[.):\-–]|\s|across|down|a\b|d\b)\s*\S+(?:\s+\S+){1,}/i
  const out = new Set()
  for (const e of document.querySelectorAll('li, p, div, span, button, td, dt, dd, label')) {
    const t = (e.innerText || '').replace(/\s+/g, ' ').trim()
    if (!t || t.length > 160) continue
    if (re.test(t) && /[a-z]{3}/i.test(t)) out.add(t)
  }
  return [...out]
}

async function fillInputs(page) {
  const ins = page.locator('input:visible, textarea:visible')
  const n = await ins.count()
  for (let i = 0; i < n; i++) {
    const e = ins.nth(i)
    const type = (await e.getAttribute('type')) || 'text'
    if (!['text', 'search', 'password', 'number', null].includes(type) && e) { if (type !== 'textarea') continue }
    const desc = `${await e.getAttribute('placeholder')} ${await e.getAttribute('id')} ${await e.getAttribute('name')} ${await e.getAttribute('aria-label')}`
    if (/maxlength/.test('') || (await e.evaluate((x) => x.closest('[class*=cell], [class*=grid]') !== null))) continue
    if ((await e.inputValue().catch(() => 'x')) !== '') continue
    await e.fill(/key|token/i.test(desc) || type === 'password' ? 'sk-test-stub' : type === 'number' ? '10' : 'ocean').catch(() => {})
  }
}

const NEW = /new|generate|another|regenerate|create|fresh|refresh|reroll|shuffle|make|start/i
const NOT = /setting|about|check|reveal|clear|reset|close|cancel|hint|print|save|share|timer/i

export async function check(env, got) {
  const page = await open(env, { settle: 1500 })
  got.page_opens = ((await page.evaluate(() => document.body?.innerText?.trim().length || 0)) > 0)
  // A grid on load, or after asking for one (filling any topic box first).
  let g = await page.evaluate(readGrid)
  const first = new Set()
  for (let i = 0; i < 3 && !g; i++) {
    await fillInputs(page)
    await clickText(page, NEW, { exclude: NOT, tried: first })
    for (let t = 0; t < 8 && !g; t++) { await wait(page, 1000); g = await page.evaluate(readGrid) }
  }
  got.clue_list = (await page.evaluate(readClues)).length >= 4
  got.uses_ai = env.aiCount() > 0
  if (!g) return
  got.grid_5x5 = g.cols >= 5 && g.rows >= 5
  got.numbered_starts = g.nums.length >= 3 && g.nums.includes(1)
  got.clue_list = (await page.evaluate(readClues)).length >= 4
  got.uses_ai = env.aiCount() > 0
  // Type a letter into the first open cell.
  if (g.white) {
    await page.mouse.click(g.white.x, g.white.y)
    await page.keyboard.type('Q')
    await wait(page, 300)
    const g2 = await page.evaluate(readGrid)
    got.typing_fills = !!g2 && (g2.letters.match(/Q/g) || []).length > (g.letters.match(/Q/g) || []).length
  }
  // A new puzzle: up to three clicks (a menu, then a sheet, then its button).
  const before = g.sig + (await page.evaluate(readClues)).join()
  for (let i = 0; i < 3 && !got.new_puzzle_differs; i++) {
    // A person opens the menu when no button says "new".
    if (!(await clickText(page, NEW, { exclude: NOT })) && !(await clickText(page, /menu|≡|☰|more|options/i))) break
    for (let t = 0; t < 8; t++) {
      await wait(page, 1000)
      const g3 = await page.evaluate(readGrid)
      if (g3 && g3.sig + (await page.evaluate(readClues)).join() !== before) { got.new_puzzle_differs = true; break }
    }
  }
  got.uses_ai = env.aiCount() > 0
}
