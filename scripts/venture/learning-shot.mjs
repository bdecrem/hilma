#!/usr/bin/env node
// Look at the live Learning page the way Bart does: wait until the latest push is live, sign in to
// app.kochitolabs.com (the board's own account, as app-check.mjs does), open Learning at phone width,
// print the headline figures' text and save a picture.
//   node scripts/venture/learning-shot.mjs <out-dir> [base=https://app.kochitolabs.com]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
const [out, base = 'https://app.kochitolabs.com'] = process.argv.slice(2)
if (!out) { console.error('usage: learning-shot.mjs <out-dir> [base]'); process.exit(1) }
mkdirSync(out, { recursive: true })
const env = Object.fromEntries(readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
const [name, passcode] = (env.KOCHITO_APP_USERS ?? '').split(',')[0].split(':')
if (!name || !passcode) throw new Error('KOCHITO_APP_USERS is not in .env.local')
const sh = (f, a) => execFileSync(f, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
if (base.startsWith('https://')) {
  sh('git', ['fetch', '-q', 'origin', 'main'])
  const sha = sh('git', ['rev-parse', 'origin/main'])
  let state = 'pending'
  for (let i = 0; i < 60 && state === 'pending'; i++) {
    state = sh('gh', ['api', `repos/bdecrem/hilma/commits/${sha}/status`, '--jq', '.state'])
    if (state === 'pending') await new Promise((r) => setTimeout(r, 15000))
  }
  console.log(`latest push ${sha.slice(0, 8)}: ${state}`)
  if (state !== 'success') process.exit(1)
}
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: 'kochito learning-shot headless check' })
const p = await ctx.newPage()
await p.goto(base, { waitUntil: 'networkidle' })
await p.fill('input[name=name]', name)
await p.fill('input[name=passcode]', passcode)
await Promise.all([p.waitForEvent('load'), p.click('button')])
await p.waitForLoadState('networkidle')
const link = p.getByRole('link', { name: /Learning/ }).first()
const href = (await link.count()) ? await link.getAttribute('href') : '/learning'
await p.goto(new URL(href, p.url()).toString(), { waitUntil: 'networkidle' })
for (const t of await p.locator('.bd-learn-fig').allInnerTexts()) console.log('FIGURE: ' + t.replace(/\s*\n\s*/g, ' | '))
await p.screenshot({ path: `${out}/learning-phone.png`, fullPage: false })
await p.locator('.bd-learn').first().screenshot({ path: `${out}/learning-figures.png` }).catch(() => {})
console.log(`over the screen by ${await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)}px; pictures in ${out}`)
await b.close()
