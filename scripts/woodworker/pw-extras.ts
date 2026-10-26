// The Woodworker, the parts a straight playthrough skips: the Hint button in
// every room (it must point at a shortest-path move; where Cyriel is away it
// is a call, and the calls run out), Undo, the egg and the lemon going down a
// knot hole (no move counted, back where they were), and replaying the story.
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
  const skip = async () => {
    while (await page.locator('.scene').count()) {
      await page.locator('.scene .skip').click()
      await page.waitForTimeout(200)
    }
  }
  const go = async (i: number) => {
    await skip()
    await page.locator('.lvl').nth(i).click()
    await page.waitForTimeout(300)
    await skip()
  }
  const hintBtn = page.locator('.controls .btn').nth(2)
  const marks = () => page.locator('.hint, .ghost, .door.hinted, .tilt-btn.hinted').count()

  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i]
    await go(i)
    if (!L.away) {
      await hintBtn.click()
      await page.waitForTimeout(250)
      const n = await marks()
      await page.screenshot({ path: `${out}/hint-${i + 1}-${L.id}.png`, fullPage: true })
      check(n >= 1 && (await hintBtn.textContent()) === 'Hint', `${L.id}: hint shows a mark (${n})`)
      continue
    }
    // Away: every call rings, then they say their line and point; then they stop picking up.
    for (let k = 0; k < L.away.calls.length; k++) {
      const label = await hintBtn.textContent()
      await hintBtn.click()
      await page.waitForTimeout(1350)
      const n = await marks()
      const said = await page.locator('.call').textContent()
      if (k === 0) await page.screenshot({ path: `${out}/hint-${i + 1}-${L.id}.png`, fullPage: true })
      check(label === `Call Cyriel (${L.away.calls.length - k})` && n >= 1 && said === L.away.calls[k], `${L.id}: call ${k + 1} ("${label}") points (${n}) and says "${said}"`)
      await page.waitForTimeout(3500)
    }
    check((await hintBtn.isDisabled()) && (await hintBtn.textContent()) === L.away.out, `${L.id}: out of calls → "${await hintBtn.textContent()}"`)
  }

  // The story replays from Cyriel's face by the note.
  await go(6)
  await page.locator('.note .badge').click()
  await page.waitForTimeout(300)
  check((await page.locator('.scene .say').textContent())?.startsWith("I'm back!") === true, 'badge replays the room\'s story')
  await skip()

  // Lemon tea: up, left, down sets the lemon up beside the knot hole; right loses it.
  await go(7)
  const lemon = page.locator('.roller.lemon')
  for (const d of [3, 2, 1]) {
    await page.locator('.tilt-btn').nth(d).click()
    await page.waitForTimeout(900)
  }
  const cell = async () => (await lemon.getAttribute('style'))?.match(/--x: \d+; --y: \d+/)?.[0]
  const at = await cell()
  await page.locator('.tilt-btn').nth(0).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/lemon-lost.png`, fullPage: true })
  await page.waitForTimeout(1300)
  check((await moves()) === 3, `lemon down the hole: no move counted (${await moves()} after 3 tilts)`)
  check(!!at && (await cell()) === at, `lemon back where it was (${at})`)

  // Breakfast: the egg sits under the knot hole; tilting away drops it in.
  await go(2)
  const egg = page.locator('.roller.egg')
  const before = await egg.getAttribute('style')
  await page.locator('.tilt-btn').nth(3).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/egg-breaking.png`, fullPage: true })
  await page.waitForTimeout(1200)
  check((await moves()) === 0, 'egg down the hole: no move counted')
  check((await egg.getAttribute('style'))?.includes('--x: 3') === true && before?.includes('--x: 3') === true, 'egg back where it was')

  // Undo in the cutlery room.
  await go(3)
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
