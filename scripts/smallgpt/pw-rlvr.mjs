// The chat page with the RLVR model, headless: pick RLVR 92M, ask three sums,
// print the answers and whether the first integer is right. Downloads the
// 92 MB weights, so give it minutes.
//
// Run:  node scripts/smallgpt/pw-rlvr.mjs <shots-dir> [base]   (default https://ola.cx)

import { mkdirSync } from 'node:fs'
import { chromium, devices } from 'playwright'

const [dir = '/tmp/pw-rlvr', base = 'https://ola.cx'] = process.argv.slice(2)
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
  // the block's text starts with the model tag and ends with the token count; keep the answer between
  const text = (await turn.locator('.sgc-a').first().innerText()).trim().replace(/^\S+ \d+M/, '').replace(/\d+ tokens · .*$/, '').trim()
  await page.screenshot({ path: `${dir}/${shot}.png` })
  return text
}

const sums = [['What is 3 + 5?', 8], ['What is 7 + 0?', 7], ['What is 9 + 8?', 17]]
let right = 0
for (const [i, [q, a]] of sums.entries()) {
  const t = await ask('RLVR 92M', q, `rlvr-${i}`)
  const m = t.match(/-?\d+/)
  const ok = m && +m[0] === a
  right += ok ? 1 : 0
  console.log(`${ok ? 'ok ' : 'no '} ${q} [${a}] -> ${JSON.stringify(t)}`)
}
const t = await ask('RLHF 92M', 'What is 3 + 5?', 'rlhf')
console.log(`    (RLHF 92M) What is 3 + 5? -> ${JSON.stringify(t)}`)
console.log(`${right}/${sums.length} right; page errors: ${errors.length}`)
await browser.close()
if (errors.length) { console.error(errors); process.exit(1) }
