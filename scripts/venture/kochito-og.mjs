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
    .kl-form, .kl-fine, .kl-mail, .kl-pic figcaption, .kl-skip { display: none !important; }
    .kl-wrap { max-width: 1080px !important; }
    .kl-top { padding-top: 44px !important; } .kl-mark { font-size: 26px !important; }
    .kl-hero { padding-block: 56px 0 !important; gap: 44px !important; grid-template-columns: 1.05fr 0.95fr !important; }
    .kl h1 { font-size: 58px !important; } .kl-lede { font-size: 23px !important; }
    .kl-home { padding-block: 60px 30px !important; } .kl-home h1 { font-size: 54px !important; }
    .kl-doors .go, .kl-band, .kl-close, .kl-foot { display: none !important; }` })
  await p.evaluate(() => document.fonts.ready)
  await p.screenshot({ path: out })
  console.log(out)
}
await b.close()
