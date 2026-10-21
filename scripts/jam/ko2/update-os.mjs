import { chromium } from 'playwright'
// Drive Teenage Engineering's browser updater (https://teenage.engineering/apps/update) headlessly: Google Chrome
// with WebMIDI + SysEx granted (Playwright's own Chromium crashes on the page). It transfers the OS over DFU
// and the device reboots itself; headless Chrome then never sees it come back, so the page ends on its
// 'connect a device' screen and the script's 'final' is not the verdict: run it again and read the
// metadata console line (os_version). Took Bart's unit from 1.1.1 to 2.5.1 on 2026-10-20 in 12 s of transfer.
//   node scripts/jam/ko2/update-os.mjs <screenshot dir>
const S = process.argv[2] || '/tmp'
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-features=WebMIDI'] })
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await ctx.grantPermissions(['midi', 'midi-sysex'], { origin: 'https://teenage.engineering' })
const page = await ctx.newPage()
page.on('crash', () => console.log('!! page crashed'))
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
page.on('console', (m) => { const t = m.text(); if (!/midiAccess|midiStateChange/.test(t)) console.log('[console]', t.slice(0, 200)) })
page.on('dialog', async (d) => { console.log('[dialog]', d.type(), d.message()); await d.accept() })
await page.goto('https://teenage.engineering/apps/update', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(4000)
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim()
console.log('before:', (await text()).slice(0, 300))
const btn = page.getByRole('button', { name: /update EP/i })
await btn.click()
console.log('clicked update')
let last = ''
const t0 = Date.now()
let n = 0
while (Date.now() - t0 < 20 * 60 * 1000) {
  await page.waitForTimeout(3000)
  n++
  let t = ''
  try { t = await text() } catch (e) { console.log('text err', String(e).slice(0, 80)); continue }
  if (t !== last) {
    console.log(`[${Math.round((Date.now() - t0) / 1000)}s]`, t.slice(0, 500))
    await page.screenshot({ path: `${S}/update/u${String(n).padStart(3, '0')}.png` }).catch(() => {})
    last = t
  }
  // press any forward-moving button that appears (never back / cancel)
  const buttons = await page.$$eval('button', els => els.map((e, i) => ({ i, t: (e.innerText || '').trim(), disabled: e.disabled })))
  for (const b of buttons) {
    if (!b.disabled && /^(ok|okay|continue|yes|start|next|done|close|proceed|install|confirm)$/i.test(b.t)) {
      console.log('pressing', b.t); await page.$$('button').then(els => els[b.i].click()).catch(() => {}); break
    }
  }
  if (/complete|success|finished|up to date|updated/i.test(t) && !/updating|writing|transferring|%/.test(t)) { console.log('looks finished'); break }
}
console.log('final:', (await text()).slice(0, 600))
await page.screenshot({ path: `${S}/update/final.png` }).catch(() => {})
await page.waitForTimeout(3000)
await browser.close()
