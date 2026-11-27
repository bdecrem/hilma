// The five harder requests (OLA-484; Bart, Nov 26: "give them an interesting task that sonnet can do
// but maybe not the models"). One small check each, done the way a person would use the page, written
// to work on any page that does the job (squares found by their size, buttons by their words), and
// tried first on what Sonnet 5.5 made (reference/<task>). A check that could not find what to click
// says so in the notes: look at shot.png before calling that a failure of the model.
import path from 'node:path'
import { createRequire } from 'node:module'
import { findPage } from '../apps/lib/harness.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Every word the page shows: its text, what it draws on a canvas, and what it says in an alert.
const words = async (page, said) => (await page.evaluate(() => (document.body?.innerText || '') + '\n' + (window.__drawn || []).join('\n'))) + '\n' + said.join('\n')
const count = (text, re) => (text.match(re) || []).length

// The cells of a grid: n elements of one size laid out as a square, or failing that the biggest canvas cut into n.
const cells = (page, n) => page.evaluate((n) => {
  const side = Math.sqrt(n), groups = {}
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width < 14 || r.height < 14 || r.width > 200 || Math.abs(r.width - r.height) > r.width * 0.35) continue
    ;(groups[el.tagName] ||= []).push({ el, r })
  }
  // n elements of one tag within 15% of one width (thick lines between boxes make cells a pixel or two unequal)
  let g = null
  for (const list of Object.values(groups)) {
    list.sort((a, b) => a.r.width - b.r.width)
    for (let i = 0; i + n <= list.length && !g; i++) {
      const top = list[i].r.width * 1.15, same = list.filter((x) => x.r.width >= list[i].r.width && x.r.width <= top)
      if (same.length === n && (i === 0 || list[i - 1].r.width < list[i].r.width)) g = same
    }
    if (g) break
  }
  const text = (el) => String(el.querySelector?.('input')?.value || el.innerText || el.value || '').trim()
  if (g) {
    g.sort((a, b) => a.r.top - b.r.top)
    const rows = []
    for (let i = 0; i < side; i++) rows.push(g.slice(i * side, i * side + side).sort((a, b) => a.r.left - b.r.left))
    return rows.flat().map(({ el, r }) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, text: text(el) }))
  }
  const c = [...document.querySelectorAll('canvas')].map((el) => el.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0]
  if (!c) return null
  return Array.from({ length: n }, (_, i) => ({ x: c.left + (i % side + 0.5) * c.width / side, y: c.top + (Math.floor(i / side) + 0.5) * c.height / side, text: '' }))
}, n)

const clickWord = async (page, re) => {
  const b = page.locator('button, input[type=button], input[type=submit], [role=button], a').filter({ hasText: re }).first()
  if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 2000 }).catch(() => {}); return true }
  return false
}

// How many ways a Sudoku can be finished, counted up to 2. grid: 81 digits, 0 for empty.
function solutions(grid, first) {
  const g = grid.slice(); let n = 0
  const ok = (i, v) => { const r = Math.floor(i / 9), c = i % 9; for (let k = 0; k < 9; k++) { if (g[r * 9 + k] === v || g[k * 9 + c] === v || g[(r - r % 3 + Math.floor(k / 3)) * 9 + c - c % 3 + k % 3] === v) return false } return true }
  for (let i = 0; i < 81; i++) if (g[i]) { const v = g[i]; g[i] = 0; if (!ok(i, v)) return 0; g[i] = v }
  const go = () => { const i = g.indexOf(0); if (i < 0) { if (!n && first) first.push(...g); return ++n >= 2 } for (let v = 1; v <= 9; v++) if (ok(i, v)) { g[i] = v; if (go()) return true; g[i] = 0 } return false }
  go(); return n
}

const CHECK = {
  // An illegal move first (a pawn three squares), then the shortest checkmate there is. A page that took
  // the illegal move, or does not know checkmate, does not end by saying it.
  async chess(page, said, notes) {
    const before = count(await words(page, said), /checkmate/gi)
    const sq = await cells(page, 64)
    if (!sq) { notes.push('found no board of 64 squares'); return [{ name: 'refuses an illegal move, plays the fastest checkmate and says checkmate', pass: false }] }
    const at = (s) => sq[(8 - Number(s[1])) * 8 + 'abcdefgh'.indexOf(s[0])]
    for (const [a, b] of [['e2', 'e5'], ['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) {
      for (const s of [a, b]) { await page.mouse.click(at(s).x, at(s).y); await sleep(250) }
    }
    await sleep(600)
    return [{ name: 'refuses an illegal move, plays the fastest checkmate and says checkmate', pass: count(await words(page, said), /checkmate/gi) > before }]
  },
  // Start, then drop piece after piece without steering: the stack reaches the top and the game must say it is over.
  async blocks(page, said, notes) {
    const before = count(await words(page, said), /game\s*over/gi)
    await clickWord(page, /start|play|new game|begin/i)
    await page.mouse.click(5, 5).catch(() => {})
    for (const k of ['Enter', 'ArrowLeft', 'ArrowUp']) { await page.keyboard.press(k); await sleep(150) }
    let over = false
    for (let i = 0; i < 150 && !over; i++) { await page.keyboard.press('Space'); await sleep(140); if (i % 8 === 7) over = count(await words(page, said), /game\s*over/gi) > before }
    const score = (await words(page, said)).match(/score\D{0,12}(\d+)/i)
    if (score) notes.push(`score shown: ${score[1]}`)
    return [{ name: 'pieces drop with space, stack up, and the game says game over', pass: over }]
  },
  // Type one text with every kind asked for; the preview must hold the real thing for each.
  async markdown(page, said, notes) {
    const box = page.locator('textarea, [contenteditable=true], [contenteditable=""]').first()
    if (!(await box.isVisible().catch(() => false))) { notes.push('found nowhere to type'); return [{ name: 'a place to type and a preview', pass: false }] }
    const text = '# Big title\n\nSome **bold** and *slanted* words, a [link](https://example.com/x) and ![pic](pic.png).\n\n- one\n  - inside one\n- two\n\n> a quote\n\n```\ncode here\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n'
    await box.fill(text).catch(async () => { await box.click(); await page.keyboard.insertText(text) })
    await sleep(900)
    const has = await page.evaluate(() => {
      const docs = [document, ...[...document.querySelectorAll('iframe')].map((f) => { try { return f.contentDocument } catch { return null } }).filter(Boolean)]
      const q = (s) => docs.some((d) => [...d.querySelectorAll(s)].some((e) => !e.closest('textarea')))
      return { heading: q('h1'), bold: q('strong, b'), italic: q('em, i'), link: q('a[href*="example.com"]'), image: q('img[src*="pic.png"]'), 'a list inside a list': q('li ul, li ol, ul ul'), quote: q('blockquote'), 'code block': q('pre'), table: q('table td') }
    })
    return Object.entries(has).map(([name, pass]) => ({ name: `preview shows: ${name}`, pass }))
  },
  // Add an event on the 1st that repeats every week: it must show four times or more, and still after a reload.
  async calendar(page, said, notes) {
    const name = 'Zumba'
    const fill = async () => {
      let title = page.locator('input[type=text]:visible, input:not([type]):visible').first()
      if (!(await title.isVisible().catch(() => false))) {
        // No button to add one: click the first day of the month, as a person would.
        if (!(await clickWord(page, /add|new|create|\+/i))) {
          const day = await page.evaluate(() => { const e = [...document.querySelectorAll('body *')].filter((e) => /^1$/.test((e.innerText || '').trim()) && e.getBoundingClientRect().width > 10).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
          if (day) await page.mouse.click(day.x, day.y)
        }
        await sleep(400)
      }
      if (!(await title.isVisible().catch(() => false))) return 'found no box for the event\'s name'
      await title.fill(name)
      const d = new Date(), first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      await page.locator('input[type=date]:visible').first().fill(first).catch(() => notes.push('no date box: the event starts where the page put it'))
      const picked = await page.evaluate(() => {
        for (const s of document.querySelectorAll('select')) { const o = [...s.options].find((o) => /week/i.test(o.text + o.value)); if (o) { s.value = o.value; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return true } }
        const r = [...document.querySelectorAll('input[type=radio], input[type=checkbox]')].find((r) => /week/i.test(r.value + (r.labels?.[0]?.innerText || ''))); if (r) { r.click(); return true }
        return false
      })
      if (!picked) return 'found no way to say it repeats every week'
      // The button inside the form or the open dialog, not the page's own "add" button behind it.
      const save = page.locator('dialog[open] button, [role=dialog] button, form button, form input[type=submit]').filter({ hasText: /save|add|create|ok|done/i }).last()
      if (await save.isVisible().catch(() => false)) await save.click({ timeout: 2000 }).catch(() => {})
      else if (!(await clickWord(page, /save|add|create|ok|done/i))) await page.keyboard.press('Enter')
      await sleep(700); return null
    }
    const problem = await fill(); if (problem) notes.push(problem)
    const shown = async () => count(await words(page, said), new RegExp(name, 'g'))
    const now = await shown()
    await page.reload({ waitUntil: 'load' }).catch(() => {}); await sleep(700)
    const after = await shown()
    notes.push(`"${name}" shown ${now} times, ${after} after a reload`)
    return [{ name: 'an event repeating every week shows four times or more in the month', pass: now >= 4 }, { name: 'it is still there after a reload', pass: now >= 4 && after >= 4 }]
  },
  // Read the puzzle off the page and solve it: exactly one solution; then the hint must fill one cell with the right digit.
  async sudoku(page, said, notes) {
    const read = async () => { const c = await cells(page, 81); return c && c.map((x) => (/^[1-9]$/.test(x.text) ? Number(x.text) : 0)) }
    let g = await read()
    if (!g || !g.some(Boolean)) { await clickWord(page, /new|start|play/i); await sleep(800); g = await read() }
    if (!g) { notes.push('found no grid of 81 cells'); return [{ name: 'the puzzle has exactly one solution', pass: false }, { name: 'a hint fills in one correct cell', pass: false }] }
    const given = g.filter(Boolean).length, answer = [], n = solutions(g, answer)
    notes.push(`${given} digits given, ${n === 2 ? 'more than one solution' : n + ' solution'}`)
    const one = given >= 17 && given < 81 && n === 1
    await clickWord(page, /hint/i); await sleep(500)
    const h = (await read()) || g, added = h.map((v, i) => (v && !g[i] ? i : -1)).filter((i) => i >= 0)
    return [{ name: 'the puzzle has exactly one solution', pass: one }, { name: 'a hint fills in one correct cell', pass: one && added.length === 1 && h[added[0]] === answer[added[0]] }]
  },
}

export async function checkHard(id, folder, shot) {
  const file = findPage(folder)
  if (!file) return { checks: [{ name: 'there is a page', pass: false }], notes: ['no html file'] }
  const require = createRequire(path.join(here, '../../web/package.json'))
  const { chromium } = require('playwright')
  const browser = await chromium.launch()
  const notes = [], said = []
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await ctx.route((u) => !String(u).startsWith('file:'), (r) => r.abort())
    await ctx.addInitScript(() => { window.__drawn = []; for (const k of ['fillText', 'strokeText']) { const f = CanvasRenderingContext2D.prototype[k]; CanvasRenderingContext2D.prototype[k] = function (t, ...a) { if (window.__drawn.length < 5000) window.__drawn.push(String(t)); return f.call(this, t, ...a) } } })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)))
    page.on('dialog', (d) => { said.push(d.message()); d.accept().catch(() => {}) })
    await page.goto('file://' + file, { waitUntil: 'load', timeout: 20000 })
    await sleep(800)
    await page.screenshot({ path: shot.replace(/\.png$/, '-start.png') }).catch(() => {})
    let checks
    try { checks = await CHECK[id](page, said, notes) } catch (e) { checks = [{ name: 'the check could use the page', pass: false }]; notes.push(String(e.message).slice(0, 200)) }
    await page.screenshot({ path: shot }).catch(() => {})
    checks.push({ name: 'no script error', pass: !errors.length }); notes.push(...errors.slice(0, 3))
    return { checks, notes }
  } finally { await browser.close() }
}

// node hard.mjs <task> <folder>: check a folder by hand.
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [id, folder] = process.argv.slice(2)
  const r = await checkHard(id, path.resolve(folder), `/tmp/hard-${id}.png`)
  console.log(`${id}: ${r.checks.filter((c) => c.pass).length}/${r.checks.length}`, JSON.stringify(r.checks.filter((c) => !c.pass).map((c) => c.name)), JSON.stringify(r.notes))
}
