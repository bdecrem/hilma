// Sign in on a phone, list the project's Pages and screenshot each one (phone width, full page).
//   node scripts/venture/ola-walk-pages.mjs <out dir> <name> <password>
import { chromium, devices } from 'playwright'
const [out, name, pw] = process.argv.slice(2)
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 14'] }); const p = await ctx.newPage()
await p.goto('https://app.ola.cx/'); await p.waitForSelector('input[type=password]')
await p.locator('input').first().fill(name); await p.locator('input[type=password]').fill(pw); await p.getByRole('button', { name: /sign in/i }).click(); await p.waitForTimeout(4000)
const titles = await p.locator('h3, [class*=thing] [class*=name], [class*=title]').allInnerTexts()
console.log('titles:', titles.filter((t) => /\.html|concept/i.test(t)).map((t) => t.replace(/\s+/g, '')))
const hrefs = [...new Set(await p.locator('a[href]').evaluateAll((as) => as.map((x) => x.href).filter((h) => /\.html/.test(h) && /api\/open/.test(h) && !/shots|check-sheet/.test(h))))]
console.log('pages:', hrefs.length)
for (const [i, h] of hrefs.entries()) {
  for (const [tag, vp] of [['phone', null], ['laptop', { width: 1280, height: 800 }]]) {
    const pg = await ctx.newPage(); if (vp) await pg.setViewportSize(vp)
    await pg.goto(h); await pg.waitForTimeout(2500)
    console.log(i, tag, decodeURIComponent(h.replace(/[?#].*/, '').split('/').slice(-2).join('/')), '|', await pg.title())
    await pg.screenshot({ path: `${out}/page-${i}-${tag}.png`, fullPage: tag === 'phone' }); await pg.close()
  }
}
await b.close()
