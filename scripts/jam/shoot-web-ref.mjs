// Reference screenshots of the web app for the native design review.
//   JAM_URL=https://jambot.to node scripts/jam/shoot-web-ref.mjs [outDir] [width]
import { launch, signIn, sleep } from './pw-harness.mjs'
const out = process.argv[2] || 'apps/jamnative/.shots/web'
const width = Number(process.argv[3] || 390)
const { browser, page } = await launch({ viewport: { width, height: 844 } })
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` })
await signIn(page)
await sleep(800); await shot('01-library')
await page.getByText('SEQ TEST techno copy', { exact: false }).first().click()
await page.getByPlaceholder(/tell it what to play/i).waitFor({ timeout: 30000 })
await sleep(1500); await shot('02-studio')
await page.getByRole('button', { name: /^play$/i }).click().catch(() => {})
await sleep(2500); await shot('02b-studio-playing')
await page.getByRole('button', { name: /^controls$/i }).click()
await sleep(600)
await page.getByRole('tab', { name: /faders/i }).click(); await sleep(400); await shot('03-faders')
await page.getByRole('tab', { name: /panels/i }).click(); await sleep(600); await shot('04-panels')
// open the first panel
const heads = page.locator('.ph-head, [class*=ph-head]')
if (await heads.count()) { await heads.first().click(); await sleep(500); await shot('04b-panels-open') }
await page.getByRole('tab', { name: /seq/i }).click(); await sleep(600); await shot('05-seq')
await page.getByRole('button', { name: /^done$/i }).click(); await sleep(300)
await page.getByRole('button', { name: /^stop$/i }).click().catch(() => {})
await page.getByRole('button', { name: /back to tracks/i }).click(); await sleep(800)
// song mode
await page.getByText('SEQ TEST song 128', { exact: false }).first().click()
await page.getByPlaceholder(/tell it what to play/i).waitFor({ timeout: 30000 })
await sleep(1500); await shot('06-studio-song')
await page.getByRole('button', { name: /^controls$/i }).click(); await sleep(600)
await page.getByRole('tab', { name: /faders/i }).click(); await sleep(400); await shot('07-faders-song')
await page.getByRole('tab', { name: /seq/i }).click(); await sleep(600); await shot('08-seq-song')
await page.getByRole('button', { name: /^done$/i }).click(); await sleep(300)
await page.getByRole('button', { name: /back to tracks/i }).click(); await sleep(800)
await browser.close()
console.log('done', out)
