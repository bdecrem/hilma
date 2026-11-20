// The CSS Hop (misc/ola-working-hop.zip, ola-hop.html) frozen at fixed times, to set beside the
// app's own frames (Ola -OlaSnapshot <dir> -OlaOnly hop) and check the motion frame for frame.
//
//   node scripts/activist-ai/hop-frames.mjs <unzipped ola-hop.html> <out-dir>
//
// Writes css-dark-<t>.png (the demo's dark row), css-light-<t>.png (navy dots at 25 % on white, as
// the spec says for light) every 0.05 s over one loop, and css-*-still.png with reduced motion.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const [html, out] = process.argv.slice(2)
if (!html || !out) { console.error('usage: hop-frames.mjs <ola-hop.html> <out-dir>'); process.exit(2) }
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
for (const reduced of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 600, height: 600 }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await page.goto(pathToFileURL(html).href)
  await page.addStyleTag({ content: '.row.big { padding: 0 !important; border-radius: 0 !important; }' })
  const svg = page.locator('.row.big svg')
  for (const mode of ['dark', 'light']) {
    if (mode === 'light') await page.addStyleTag({ content: '.row.big { background: #fff !important; } .ola-hop .dot { fill: #2B3A6E; opacity: 0.25; }' })
    if (reduced) { await svg.screenshot({ path: `${out}/css-${mode}-still.png` }); continue }
    for (let i = 0; i < 32; i++) {
      const t = i * 0.05
      await page.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms }), t * 1000)
      await svg.screenshot({ path: `${out}/css-${mode}-${t.toFixed(2)}.png` })
    }
  }
  await page.close()
}
await browser.close()
console.log('css frames:', out)
