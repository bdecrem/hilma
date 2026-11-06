// Screenshots of the law library and a drive of the reader's in-text search.
//   node scripts/mrd/shots.mjs <outdir> [base=http://localhost:3260]
import { chromium } from 'playwright'
const [out, base = 'http://localhost:3260'] = process.argv.slice(2)
if (!out) throw new Error('usage: shots.mjs <outdir> [base]')
const b = await chromium.launch()
const errors = []
for (const [vw, w, h] of [['desk', 1440, 900], ['phone', 390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: vw === 'phone' ? 2 : 1 })
  p.on('pageerror', e => errors.push(`${vw} ${p.url()}: ${e.message}`))
  p.on('console', m => m.type() === 'error' && errors.push(`${vw} ${p.url()}: ${m.text()}`))
  for (const [name, path] of [['home', '/mrd'], ['search', '/mrd/search?q=family%20reunification'], ['countries', '/mrd/countries'],
    ['country', '/mrd/countries/kenya'], ['categories', '/mrd/categories'], ['category', '/mrd/categories/family']]) {
    await p.goto(base + path, { waitUntil: 'networkidle' })
    if (vw === 'desk') await p.screenshot({ path: `${out}/${vw}-${name}-top.png` })
    await p.screenshot({ path: `${out}/${vw}-${name}.png`, fullPage: vw === 'desk' && name !== 'country' && name !== 'category' })
  }
  // a law reached from a search: the reader should open on the first match
  await p.goto(base + '/mrd/search?q=refugee&country=kenya', { waitUntil: 'networkidle' })
  await p.click('.row h3 a')
  await p.waitForURL(/\/mrd\/law\//)
  await p.waitForSelector('.doc mark.on', { timeout: 20000 }).catch(() => errors.push('no active mark after search'))
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${out}/${vw}-law-hit.png` })
  console.log(vw, 'reader:', await p.textContent('.rbar .nav'))
  // an article jump
  const art = await p.$('button.art')
  if (art) {
    await art.click()
    await p.waitForTimeout(2500)
    console.log(vw, 'article jump:', await p.textContent('.rbar .nav'), '| active:', (await p.textContent('.doc mark.on').catch(() => null)))
    await p.screenshot({ path: `${out}/${vw}-law-article.png` })
  }
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.screenshot({ path: `${out}/${vw}-law-top.png`, fullPage: vw === 'desk' ? false : false })
  await p.close()
}
await b.close()
console.log(errors.length ? errors.join('\n') : 'no page errors')
