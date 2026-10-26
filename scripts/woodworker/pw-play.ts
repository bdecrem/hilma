// Plays all ten rooms through the real UI (drags, taps, tilts), following
// the solver's shortest solution, and checks each ends on the win card at par.
// Story scenes are clicked through on the way, and the ending must play last.
// Screenshots of every room before and after go to the out dir.
//   npx tsx scripts/woodworker/pw-play.ts <out-dir> [base=http://localhost:3255] [width=420]
import { chromium, type Page } from 'playwright'
import { mkdirSync } from 'node:fs'
import { solve } from '../../src/app/woodworker/lib/engine'
import { LEVELS } from '../../src/app/woodworker/lib/levels'
import { rulesFor } from '../../src/app/woodworker/lib/rules'
import { SIZE } from '../../src/app/woodworker/lib/slide'

const [out = '/tmp/ww', base = 'http://localhost:3255', width = '420'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })

async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let k = 1; k <= 12; k++) await page.mouse.move(x + (dx * k) / 12, y + (dy * k) / 12)
  await page.mouse.up()
  await page.waitForTimeout(260)
}
async function center(page: Page, sel: string, n = 0) {
  const b = (await page.locator(sel).nth(n).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
}

/** Click through any story scene that is up; returns how many panels it had. */
async function scenes(page: Page) {
  let n = 0
  while (await page.locator('.scene').count()) {
    await page.locator('.scene .primary').click()
    await page.waitForTimeout(250)
    n++
  }
  return n
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: Number(width), height: 1100 }, deviceScaleFactor: 2 })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${base}/woodworker`)
  await page.waitForSelector('.note')
  let bad = 0
  await page.waitForTimeout(500)

  for (let li = 0; li < LEVELS.length; li++) {
    const L = LEVELS[li]
    const R = rulesFor(L)
    await page.waitForTimeout(300)
    const panels = await scenes(page)
    if (panels) console.log(`     ${L.id}: story scene, ${panels} panel(s)`)
    await page.screenshot({ path: `${out}/${li + 1}-${L.id}-start.png`, fullPage: true })
    const path = solve(R, L.start)!
    let s: unknown = L.start
    for (const [step, m] of (path as never[]).entries()) {
      if (L.mech === 'slide') {
        const { piece, to } = m as { piece: number; to: number }
        const c = (await page.locator('.board').boundingBox())!.width / SIZE
        const p = L.data.pieces[piece]
        const d = (to - (s as number[])[piece]) * c
        const { x, y } = await center(page, '.piece', piece)
        await drag(page, x, y, p.h ? d : 0, p.h ? 0 : d)
      } else if (L.mech === 'swing') {
        const mm = m as { door: number } | { milk: number }
        if ('door' in mm) {
          await page.locator('.door .plank').nth(mm.door).click({ force: true })
          await page.waitForTimeout(520)
        } else {
          const c = (await page.locator('.board').boundingBox())!.width / SIZE
          const from = (s as { milk: number }).milk
          const { x, y } = await center(page, '.milk')
          await drag(page, x, y, ((mm.milk % SIZE) - (from % SIZE)) * c, (Math.floor(mm.milk / SIZE) - Math.floor(from / SIZE)) * c)
        }
      } else if (L.mech === 'tilt') {
        await page.locator('.tilt-btn').nth(m as number).click()
        await page.waitForTimeout(900)
      } else if (L.mech === 'linked') {
        const { tray, d } = m as { tray: number; d: number }
        const c = (await page.locator('.rack').boundingBox())!.width / L.data.cols
        const { b } = await center(page, '.tray', tray)
        const rack = (await page.locator('.rack').boundingBox())!
        const x = Math.max(b.x, rack.x) + 20
        await drag(page, x, b.y + b.height / 2, d * c, 0)
      } else {
        const { panel, d } = m as { panel: number; d: number }
        const axis = [['x', 1], ['x', -1], ['y', 1], ['x', 1], ['y', -1]][panel] as ['x' | 'y', number]
        const { x, y } = await center(page, '.bpanel', panel)
        const px = d * axis[1] * 30
        await drag(page, x, y, axis[0] === 'x' ? px : 0, axis[0] === 'y' ? px : 0)
      }
      s = R.apply(s, m)
      const shown = Number(await page.locator('.stats b').first().textContent())
      if (!s || shown !== step + 1) {
        console.log(`FAIL ${L.id}: after move ${step + 1} the page shows ${shown} moves (${JSON.stringify(m)})`)
        await page.screenshot({ path: `${out}/${li + 1}-${L.id}-fail.png`, fullPage: true })
        bad++
        break
      }
    }
    // The payoff plays before the card comes up at 1.9 s.
    await page.waitForTimeout(1600)
    await page.screenshot({ path: `${out}/${li + 1}-${L.id}-won-anim.png`, fullPage: true })
    await page.waitForTimeout(700)
    const card = await page.locator('.win-card').count()
    const line = card ? await page.locator('.win-card .line').textContent() : ''
    const ok = card === 1 && line?.startsWith(`${L.par} moves`)
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${L.id}: ${line || 'no win card'}`)
    await page.screenshot({ path: `${out}/${li + 1}-${L.id}-won.png`, fullPage: true })
    await page.locator('.win-card .primary').click()
  }
  // The last room's button plays the ending, then goes back to the first room.
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/ending.png` })
  const ending = await scenes(page)
  const back = await page.locator('.lvl[aria-current="true"]').textContent()
  const endOk = ending === 2 && !!back?.startsWith('1.')
  if (!endOk) bad++
  console.log(`${endOk ? 'ok  ' : 'FAIL'} ending: ${ending} panels, then room "${back}"`)
  if (errors.length) (console.log('page errors:', errors), bad++)
  await browser.close()
  process.exit(bad ? 1 : 0)
}
main()
