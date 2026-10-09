import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto('file:///Users/bartdecrem/Documents/coding2025/hilma/apps/dodo-motion/unit-distance/player.html')
await p.waitForTimeout(3000)
await p.screenshot({ path: out + '/player-3s.png' })
await p.evaluate(() => { const tl = window.__timelines.main; tl.seek(19.5); tl.play() })
await p.waitForTimeout(400)
await p.screenshot({ path: out + '/player-20s.png' })
await p.setViewportSize({ width: 400, height: 800 })
await p.waitForTimeout(400)
await p.screenshot({ path: out + '/player-phone.png' })
console.log('errors:', errs.length ? errs : 'none')
await b.close()
