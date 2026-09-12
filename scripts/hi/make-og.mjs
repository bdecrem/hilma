// Rebuilds the share card at public/hi/og.png (1200x630 @2x) from the live page, so the
// card can never drift from the sentence or the photos in it. Run it after any change to
// home.ts, the .edition-three type, or one of the three photos:
//     pnpm dev          (port 3000)
//     node scripts/hi/make-og.mjs
import { chromium } from 'playwright'

const URL = process.env.OG_URL || 'http://localhost:3000/hi'
const OUT = process.argv[2] || 'public/hi/og.png'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })

// The card is the page's own hero and sentence with the surrounding chrome dropped and a
// byline added: a 104px hero over 60px lines fits all five in the 630px frame with the same
// 6% side gutter.
await page.addStyleTag({
  content: `
    .three-bottom,.three-footer,.object-alt { display: none !important }
    body { padding: 0 !important; overflow: hidden }
    .three-main { max-width: none !important; margin: 36px 0 0 72px !important }
    .three-title { font-size: 104px !important; margin: 0 0 10px !important }
    .letter-line { font-size: 60px !important; min-height: 72px !important; gap: 15px !important }
    .last-letter { min-height: 64px !important }
    .inline-object { transform: scale(.75); margin: 0 -12px !important }
    .og-byline {
      position: fixed; right: 72px; bottom: 40px;
      font: 600 22px/1 Tight,Arial,sans-serif; letter-spacing: -.01em; color: #2b2118;
    }
    .og-byline span { color: var(--muted); font-weight: 400; margin: 0 10px }
    .og-byline b { color: var(--clay); font-weight: 600 }
  `,
})
await page.evaluate(() => {
  const f = document.createElement('div')
  f.className = 'og-byline'
  f.innerHTML = 'Bart Decrem<span>·</span><b>bartin16.xyz</b>'
  document.body.appendChild(f)
})
await page.waitForTimeout(700)
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } })
await browser.close()
console.log('wrote', OUT, '(2400x1260)')
