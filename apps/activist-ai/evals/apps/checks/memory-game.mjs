// Memory game: >= 8 same-size tiles that look alike face down; a click shows a face; two different
// faces turn back; a matching pair stays up; matching all of them says so.
// A tile's look is its screenshot shrunk to 16x16 colours (the mouse parked away from it); two
// looks differ when more than SHARE of the cells differ by more than CELL. Exact pixels do not
// work: the same face at another position renders a few pixels apart (Claude's 2026-11-18 game),
// and an average hides a small emoji on a big tile (Ola's 2026-11-18 game). A tile's identity when
// face up is its look, or its DOM content if the looks never repeat.
import { open, text, wait, clickText } from '../lib/harness.mjs'

export const NAMES = ['page_opens', 'tiles', 'face_down_start', 'flip_shows', 'mismatch_turns_back', 'match_stays', 'win_message']
const WIN = /\b(win|won|winner|congrat\w*|complete[d!]?|well done|you did it|all pairs|solved|bravo|great job|finished|victory|cleared)\b/i
const CELL = 30, SHARE = 0.01

function findTiles() {
  const vis = (e) => { const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' }
  const boxes = []
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect()
    if (r.width < 30 || r.width > 260 || r.height < 30 || r.height > 260 || !vis(e)) continue
    if (r.width / r.height < 0.6 || r.width / r.height > 1.67) continue
    boxes.push({ e, r, k: `${Math.round(r.width / 4)}x${Math.round(r.height / 4)}` })
  }
  const groups = {}
  for (const b of boxes) (groups[b.k] ||= []).push(b)
  let best = null
  for (const g of Object.values(groups)) {
    const set = new Set(g.map((b) => b.e))
    const nested = g.filter((b) => { let p = b.e.parentElement; while (p) { if (set.has(p)) return false; p = p.parentElement } return true })
    // A card's front and back sit on the same spot: one tile per position (its screenshot is
    // whatever shows there).
    const seen = new Map()
    for (const b of nested) { const key = `${Math.round(b.r.left / 4)},${Math.round(b.r.top / 4)}`; if (!seen.has(key)) seen.set(key, b) }
    const outer = [...seen.values()]
    const xs = new Set(outer.map((b) => Math.round(b.r.left / 4))), ys = new Set(outer.map((b) => Math.round(b.r.top / 4)))
    if (outer.length >= 8 && outer.length <= 64 && xs.size >= 2 && ys.size >= 2 && (!best || outer.length > best.length)) best = outer
  }
  if (!best) return 0
  best.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left)
  document.querySelectorAll('[data-apps-tile]').forEach((e) => e.removeAttribute('data-apps-tile'))
  best.forEach((b, i) => b.e.setAttribute('data-apps-tile', i))
  return best.length
}

export async function check(env, got) {
  const page = await open(env, { settle: 1200 })
  got.page_opens = (await text(page)).trim().length > 0
  let n = await page.evaluate(findTiles)
  if (!n) {
    // Some games start on a button.
    await clickText(page, /start|play|new game|begin/i)
    await wait(page, 1200)
    n = await page.evaluate(findTiles)
  }
  got.tiles = n >= 8 && n % 2 === 0
  if (!n) return
  const startText = await text(page)
  const tile = (i) => page.locator(`[data-apps-tile="${i}"]`)
  const dec = await env.ctx.newPage()
  const look = async (i) => {
    await page.mouse.move(2, 2)
    const b = await tile(i).screenshot({ animations: 'disabled', timeout: 3000 }).catch(() => null)
    if (!b) return null
    return dec.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode()
      const c = document.createElement('canvas'); c.width = c.height = 16
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 8, 8)
      return [...g.getImageData(0, 0, 16, 16).data].filter((_, k) => k % 4 !== 3)
    }, 'data:image/png;base64,' + b.toString('base64'))
  }
  const dist = (x, y) => {
    if (!x || !y) return 1
    let n = 0
    for (let k = 0; k < x.length; k += 3) if ((Math.abs(x[k] - y[k]) + Math.abs(x[k + 1] - y[k + 1]) + Math.abs(x[k + 2] - y[k + 2])) / 3 > CELL) n++
    return n / (x.length / 3)
  }
  const same = (x, y) => dist(x, y) < SHARE
  const dom = (i) => tile(i).evaluate((e) => e.textContent.trim() + [...e.querySelectorAll('img')].map((x) => x.src).join() + [e, ...e.querySelectorAll('*')].map((x) => getComputedStyle(x).backgroundImage).filter((v) => v !== 'none').join())
  const backs = []
  for (let i = 0; i < n; i++) backs.push(await look(i))
  got.face_down_start = backs.every((x) => same(x, backs[0]))
  const flip = async (i) => { await tile(i).click({ timeout: 3000 }).catch(() => {}); await wait(page, 650); return { look: await look(i), dom: await dom(i) } }
  // Learn the faces two at a time.
  const faces = []
  const matched = new Set()
  for (let i = 0; i + 1 < n; i += 2) {
    const a = await flip(i)
    if (i === 0) got.flip_shows = !same(a.look, backs[0])
    const b = await flip(i + 1)
    faces[i] = a; faces[i + 1] = b
    await wait(page, 1800)
    const la = await look(i), lb = await look(i + 1)
    const flipped = !same(a.look, backs[i]) && !same(b.look, backs[i + 1])
    if (flipped && !same(la, backs[i]) && !same(lb, backs[i + 1])) matched.add(i).add(i + 1)
    else if (flipped && same(la, backs[i]) && same(lb, backs[i + 1])) got.mismatch_turns_back = true
  }
  // Pair the rest up by look (clustered), else by DOM content.
  const left = [...Array(n).keys()].filter((i) => !matched.has(i))
  const cluster = (key) => {
    const groups = []
    for (const i of left) {
      const g = groups.find((g) => (key === 'look' ? same(faces[g[0]]?.look, faces[i]?.look) : faces[g[0]]?.dom === faces[i]?.dom))
      if (g) g.push(i); else groups.push([i])
    }
    return groups
  }
  // DOM content when it tells the faces apart, else the closest looks paired greedily.
  let groups = cluster('dom')
  if (groups.length !== left.length / 2 || groups.some((g) => g.length !== 2)) {
    const pairs = []
    for (const i of left) for (const j of left) if (i < j) pairs.push([dist(faces[i]?.look, faces[j]?.look), i, j])
    pairs.sort((a, b) => a[0] - b[0])
    const used = new Set()
    groups = []
    for (const [, i, j] of pairs) if (!used.has(i) && !used.has(j)) { used.add(i).add(j); groups.push([i, j]) }
  }
  for (const idx of groups) {
    for (let k = 0; k + 1 < idx.length; k += 2) {
      await flip(idx[k]); await flip(idx[k + 1])
      await wait(page, 1800)
      if (!same(await look(idx[k]), backs[idx[k]]) && !same(await look(idx[k + 1]), backs[idx[k + 1]])) { got.match_stays = true; matched.add(idx[k]).add(idx[k + 1]) }
    }
  }
  if (matched.size && !got.match_stays) got.match_stays = true
  await dec.close()
  env.notes.push(`memory: ${matched.size} of ${n} tiles matched, ${groups.length} face groups`)
  // The win line can come a moment after the last pair.
  let end = ''
  for (let t = 0; t < 8; t++) { await wait(page, 500); end = await text(page); if (WIN.test(end)) break }
  got.win_message = matched.size === n && WIN.test(end) && !WIN.test(startText.replace(/match|pair/gi, ''))
  // A win shown only as an alert counts too.
  if (!got.win_message && matched.size === n) got.win_message = env.dialogs?.some((d) => WIN.test(d)) || false
}
