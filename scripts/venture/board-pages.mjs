#!/usr/bin/env node
// Pictures of every board page at 1440 x 900 and 390 x 844 (round three, 2026-11-18), headless.
//   node scripts/venture/board-pages.mjs <out-dir> [base]            made-up data (the mock)
//   BOARD_USER=dev BOARD_PASS=… node scripts/venture/board-pages.mjs <out-dir> http://localhost:3377/kochito/kit --real
// base defaults to http://localhost:3377/kochito/kit/mock. With --real it signs in first (an account
// from KOCHITO_APP_USERS of the dev server it talks to) and shoots the real pages. Desktop shots
// are the first screen (Home must fit it) plus a full page; phone shots are full pages. Prints
// any page that is wider than the screen.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const [out, baseIn] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const real = process.argv.includes('--real')
const base = baseIn ?? 'http://localhost:3377/kochito/kit/mock'
if (!out) (console.error('usage: board-pages.mjs <out-dir> [base] [--real]'), process.exit(1))
mkdirSync(out, { recursive: true })
const pages = (process.env.BOARD_PAGES ?? 'home=/,issues=/issues,done=/issues?tab=done,issue=/issues/OLA-210,new=/issues/new,plan=/plan,notes=/notes,note=/notes/plan,overview=/overview,numbers=/numbers')
  .split(',')
  .map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)])
const b = await chromium.launch()
for (const [tag, w, h] of [['1440', 1440, 900], ['390', 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  if (real) {
    await p.goto(`${base}/`, { waitUntil: 'networkidle' })
    await p.fill('input[name=name]', process.env.BOARD_USER ?? 'dev')
    await p.fill('input[name=passcode]', process.env.BOARD_PASS ?? '')
    await p.click('button')
    await p.waitForSelector('.bd', { timeout: 60000 })
  }
  for (const [name, path] of pages) {
    await p.goto(`${base}${path === '/' ? '' : path}`, { waitUntil: 'networkidle', timeout: 120000 })
    await p.evaluate(() => document.fonts.ready)
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    const tall = await p.evaluate(() => document.documentElement.scrollHeight)
    if (over > 0) console.log(`${name} ${tag}: ${over}px wider than the screen`)
    if (tag === '1440') await p.screenshot({ path: join(out, `${name}-${tag}-screen.png`) })
    await p.screenshot({ path: join(out, `${name}-${tag}.png`), fullPage: true })
    console.log(`${name} ${tag}: ${tall}px tall`)
  }
  await ctx.close()
}
await b.close()
