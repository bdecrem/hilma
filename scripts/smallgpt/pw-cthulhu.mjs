// The chat page with the Cthulhu model, headless: pick Cthulhu 92M, see the
// possession slider, ask, get an answer; then the plain cranky model, to show
// the original is untouched. Downloads the 92 MB weights, so give it minutes.
//
// Run:  node scripts/smallgpt/pw-cthulhu.mjs <shots-dir> [base]   (default http://localhost:3252)

import { mkdirSync } from 'node:fs'
import { chromium, devices } from 'playwright'

const [dir = '/tmp/pw-cthulhu', base = 'http://localhost:3252'] = process.argv.slice(2)
mkdirSync(dir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ ...devices['iPhone 13'] })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(`${base}/smallgpt/chat`, { waitUntil: 'networkidle' })

async function ask(model, q, shot) {
  await page.getByRole('radio', { name: model }).click()
  await page.fill('input[placeholder^="Ask"]', q)
  await page.click('button[type=submit]')
  const turn = page.locator('.sgc-turn').last()
  await turn.locator('.sgc-stat').waitFor({ timeout: 600_000 })
  const text = (await turn.locator('.sgc-a').first().innerText()).trim()
  await page.screenshot({ path: `${dir}/${shot}.png` })
  return text
}

await page.getByRole('radio', { name: 'Cthulhu 92M' }).click()
const slider = page.locator('label:has-text("possession") input[type=range]')
if (!(await slider.count())) throw new Error('no possession slider')
console.log('possession slider at', await slider.inputValue())
await page.screenshot({ path: `${dir}/0-picked.png` })
console.log('cthulhu 5 →', await ask('Cthulhu 92M', 'How do I quit vi?', '1-cthulhu'))
await slider.fill('0')
console.log('cthulhu 0 →', await ask('Cthulhu 92M', 'How do I quit vi?', '2-cthulhu-off'))
console.log('cranky   →', await ask('cranky 92M', 'How do I quit vi?', '3-cranky'))
if (errors.length) throw new Error('page errors: ' + errors.join(' | '))
await browser.close()
console.log('ok')
