// Rebuilds the share images of kochitolabs.com's pages from the pages
// themselves: each page's opening at 1200 x 630, without the form.
// Usage: node scripts/venture/kochito-og.mjs [base]   (a dev server; default http://localhost:3277/kochito)
// Rerun after a change to a headline, the palette or the drawings.
import { chromium } from 'playwright'
const base = process.argv[2] || 'http://localhost:3277/kochito'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, userAgent: 'kochito-og headless check' })
for (const [path, out] of [['', 'src/app/kochito/opengraph-image.png'], ['/pdf', 'src/app/kochito/pdf/opengraph-image.png'], ['/apps', 'src/app/kochito/apps/opengraph-image.png']]) {
  await p.goto(base + path, { waitUntil: 'load', timeout: 90000 })
  await p.waitForTimeout(1500)
  await p.addStyleTag({ content: `
    .kl-form, .kl-nav, .kl-skip, .kl-band, .kl-foot, .kl-services a { display: none !important; }
    .kl { min-height: 630px; }
    .kl-wrap { max-width: 1040px !important; }
    .kl-head .kl-wrap { padding-block: 34px !important; } .kl-mark { font-size: 30px !important; }
    .kl-hero { grid-template-columns: 1fr !important; padding-block: 52px 0 !important; }
    .kl h1 { font-size: 66px !important; max-width: 14em; } .kl-lede { font-size: 28px !important; max-width: 31em !important; }
    .kl-points { display: none; }
    .kl-home { padding-block: 52px 0 !important; } .kl-services { display: none; }` })
  await p.evaluate(() => document.fonts.ready)
  await p.screenshot({ path: out })
  console.log(out)
}
await b.close()
