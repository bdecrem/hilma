// Rock Paper Anything — a bot plays the real page in a phone viewport.
//   npx tsx scripts/rpa/pw-play.ts <shots-dir> [url] [--waves 3] [--lose]
//
// It reads the enemies off the DOM, types an authored answer for the one
// nearest the gate (slowly enough that the aim preview fires), and presses
// Enter — so every shot goes through /api/rpa/judge and the live model.
// Passes when it clears `--waves` waves (default 3); with --lose it types
// nothing after the first wave and checks the game-over screen instead.
// Also fires one cheat, one superweapon and one repeat and expects refusals.
import { chromium } from 'playwright'
import { BOSSES, ENEMIES } from '../../src/lib/rpa/enemies'

const args = process.argv.slice(2)
const dir = args[0]
if (!dir) throw new Error('usage: pw-play.ts <shots-dir> [url] [--waves n] [--lose]')
const url = args[1] && !args[1].startsWith('--') ? args[1] : 'http://localhost:3217/rpa'
const waves = Number(args[args.indexOf('--waves') + 1]) || 3
const lose = args.includes('--lose')
const ANSWERS = new Map([...ENEMIES, ...BOSSES].map((e) => [e.id, e.answers]))

async function main() {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${dir}/1-title.png` })
  await page.getByTestId('start').click()
  const input = page.getByTestId('phrase')
  const used = new Set<string>()
  const toasts = new Set<string>()
  const wave = async () => Number(await page.locator('.rpa-hud-cell .rpa-num').first().innerText())
  const fire = async (text: string, slow = true) => {
    await input.fill('')
    await input.pressSequentially(text, { delay: slow ? 25 : 0 })
    if (slow) await page.waitForTimeout(650) // let the aim preview land
    await input.press('Enter')
    await page.waitForTimeout(60)
    await page.waitForFunction(() => document.querySelector('.rpa-dock button')?.textContent === 'fire') // verdict is back
    await page.waitForTimeout(120)
    for (const t of await page.locator('.rpa-toast').allInnerTexts()) toasts.add(t.toLowerCase())
  }

  await page.waitForSelector('.rpa-foe')
  await page.screenshot({ path: `${dir}/2-first-enemy.png` })

  let shot = 0
  let refusalsDone = false
  const deadline = Date.now() + 8 * 60_000
  while (Date.now() < deadline) {
    if (await page.getByTestId('over').count()) break
    if ((await wave()) > waves) break
    if (lose && (await wave()) >= 2) { await page.waitForTimeout(1000); continue }

    const foes = await page.locator('.rpa-foe:not(.dead)').evaluateAll((els) =>
      els.map((el) => ({ id: el.getAttribute('data-enemy-id')!, y: el.getBoundingClientRect().top })).sort((a, b) => b.y - a.y))
    if (!foes.length) { await page.waitForTimeout(300); continue }

    if (!refusalsDone && foes.length >= 2) {
      refusalsDone = true
      await fire('the thing that beats it', false)
      await fire('a black hole', false)
      await fire('asdf qwer', false)
    }

    const target = foes.find((f) => ANSWERS.get(f.id)?.some((a) => !used.has(a)))
    if (!target) { await page.waitForTimeout(300); continue }
    const answer = ANSWERS.get(target.id)!.find((a) => !used.has(a))!
    used.add(answer)
    if (shot === 2) { // screenshot an aim preview mid-typing
      await input.fill('')
      await input.pressSequentially(answer, { delay: 25 })
      await page.waitForTimeout(700)
      await page.screenshot({ path: `${dir}/3-aiming.png` })
      await input.press('Enter')
      await page.waitForTimeout(120)
      await page.screenshot({ path: `${dir}/4-impact.png` })
    } else await fire(answer)
    if (shot === 4) { await fire(answer, false) } // a repeat must be refused
    shot++
    if (shot === 8) await page.screenshot({ path: `${dir}/5-midgame.png` })
  }

  if (lose) {
    await page.waitForSelector('[data-testid=over]', { timeout: 4 * 60_000 })
    await page.waitForTimeout(400)
  }
  await page.screenshot({ path: `${dir}/6-end.png` })

  const result = {
    wave: await wave(),
    score: Number(await page.getByTestId('score').innerText()),
    ticker: await page.getByTestId('ticker').innerText(),
    shots: shot,
    over: (await page.getByTestId('over').count()) > 0,
    overText: (await page.getByTestId('over').count()) ? (await page.getByTestId('over').innerText()).replace(/\n+/g, ' | ') : '',
    toasts: [...toasts],
    errors,
  }
  console.log(JSON.stringify(result, null, 2))
  await browser.close()

  const want = ['too vague', 'no superweapons', 'not a thing', 'already used']
  const missing = want.filter((w) => !result.toasts.some((t) => t.includes(w)))
  if (errors.length) throw new Error(`page errors: ${errors.join(' / ')}`)
  if (!lose && missing.length) throw new Error(`refusals not seen: ${missing.join(', ')}`)
  if (lose ? !result.over : result.wave <= waves) throw new Error(lose ? 'game never ended' : `only reached wave ${result.wave}`)
  console.log('PASS')
}
main().catch((e) => { console.error(e); process.exit(1) })
