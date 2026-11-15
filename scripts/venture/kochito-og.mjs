// Rebuilds the share images: the company's front page gets Kit and the name
// (kochito-og-home.html), each product page its own opening at 1200 x 630,
// without the form.
// Usage: node scripts/venture/kochito-og.mjs [base]   (a dev server; default http://localhost:3277/kochito)
// Rerun after a change to a headline, the palette or the drawings.
import { chromium } from 'playwright'
const base = process.argv[2] || 'http://localhost:3277/kochito'
// Each product's image carries its own name (ClerkPDF, AppAdopt), which the pages take from the
// host: the two domains are pointed at the dev server for this browser only.
const dev = new URL(base)
const b = await chromium.launch({ args: [`--host-resolver-rules=MAP clerkpdf.com ${dev.hostname === 'localhost' ? '127.0.0.1' : dev.hostname}, MAP appadopt.com ${dev.hostname === 'localhost' ? '127.0.0.1' : dev.hostname}`] })
const on = (domain, path) => `${dev.protocol}//${domain}${dev.port ? ':' + dev.port : ''}${dev.pathname.replace(/\/$/, '')}${path}`
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, userAgent: 'kochito-og headless check' })
// the company's front page: its own card (Kit and the name), from a template beside this script
await p.goto(new URL('./kochito-og-home.html', import.meta.url).href)
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(400)
await p.screenshot({ path: 'src/app/kochito/opengraph-image.png' })
console.log('src/app/kochito/opengraph-image.png')
// the two products: each page's own opening
for (const [domain, path, out] of [['clerkpdf.com', '/pdf', 'src/app/kochito/pdf/opengraph-image.png'], ['appadopt.com', '/apps', 'src/app/kochito/apps/opengraph-image.png']]) {
  await p.goto(on(domain, path), { waitUntil: 'load', timeout: 90000 })
  const mark = (await p.locator('.kl-mark').first().textContent())?.trim()
  if (!/ClerkPDF|AppAdopt/.test(mark ?? '')) throw new Error(`${domain}: the header says ${JSON.stringify(mark)}, not the product's name`)
  await p.waitForTimeout(1500)
  await p.addStyleTag({ content: `
    .kl-form, .kl-nav, .kl-skip, .kl-band, .kl-foot, .kl-trust, .kl-vis-tabs, .kl-vis figcaption, .kl-door .go { display: none !important; }
    .kl { min-height: 630px; overflow: hidden; height: 630px; }
    .kl-wrap { max-width: 1120px !important; }
    .kl-head .kl-wrap { padding-block: 30px 0 !important; } .kl-mark { font-size: 26px !important; }
    .kl-hero { grid-template-columns: 1.05fr 0.95fr !important; gap: 40px !important; padding-block: 34px 0 !important; align-items: start !important; }
    .kl h1 { font-size: 58px !important; } .kl-lede { font-size: 22px !important; }
    .kl-home { padding-block: 40px 30px !important; } .kl-home h1 { font-size: 54px !important; }` })
  await p.evaluate(() => document.fonts.ready)
  await p.screenshot({ path: out })
  console.log(out)
}
await b.close()
