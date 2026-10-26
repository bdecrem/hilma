// The Woodworker, the parts a straight playthrough skips: the Hint button in
// every room (it must point at a shortest-path move), Undo, and the egg going
// down the knot hole (no move counted, egg back where it was).
//   npx tsx scripts/woodworker/pw-extras.ts <out-dir> [base=http://localhost:3255]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { LEVELS } from '../../src/app/woodworker/lib/levels'

const [out = '/tmp/ww', base = 'http://localhost:3255'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
let bad = 0
const check = (ok: boolean, what: string) => (console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`), ok || bad++)

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 390, height: 1100 },
    deviceScaleFactor: 2,
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${base}/woodworker`)
  await page.waitForSelector('.note')
  const moves = async () => Number(await page.locator('.stats b').first().textContent())

  for (let i = 0; i < LEVELS.length; i++) {
    await page.locator('.lvl').nth(i).click()
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: 'Hint' }).click()
    await page.waitForTimeout(250)
    const marks = await page.locator('.hint, .ghost, .door.hinted, .tilt-btn.hinted').count()
    await page.screenshot({
      path: `${out}/hint-${i + 1}-${LEVELS[i].id}.png`,
      fullPage: true,
    })
    check(marks >= 1, `${LEVELS[i].id}: hint shows a mark (${marks})`)
  }

  // Breakfast: the egg sits under the knot hole; tilting away drops it in.
  await page.locator('.lvl').nth(2).click()
  await page.waitForTimeout(250)
  const egg = page.locator('.roller.egg')
  const before = await egg.getAttribute('style')
  await page.locator('.tilt-btn').nth(3).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/egg-breaking.png`, fullPage: true })
  await page.waitForTimeout(1200)
  check((await moves()) === 0, 'egg down the hole: no move counted')
  check((await egg.getAttribute('style'))?.includes('--x: 3') === true && before?.includes('--x: 3') === true, 'egg back where it was')

  // Undo in the cutlery room.
  await page.locator('.lvl').nth(3).click()
  await page.waitForTimeout(250)
  await page.locator('.tray').nth(2).focus() // the teaspoons: no strings of their own
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(300)
  const m1 = await moves()
  await page.getByRole('button', { name: 'Undo' }).click()
  check(m1 === 1 && (await moves()) === 0, `cutlery: keyboard pull then undo (${m1} → ${await moves()})`)
  await page.screenshot({ path: `${out}/cutlery.png`, fullPage: true })

  check(errors.length === 0, `no page errors ${errors.join(' | ')}`)
  await browser.close()
  process.exit(bad ? 1 : 0)
}
main()
