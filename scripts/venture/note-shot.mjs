#!/usr/bin/env node
// Look at one note on the live board the way Bart does from a text: sign in to app.kochitolabs.com
// (the board's own account, as app-check.mjs does), open /notes/<slug> at phone width, save a
// full-page picture, and print the headings, how far the page is wider than the screen, and its links.
//   node scripts/venture/note-shot.mjs <slug> <out-dir> [base=https://app.kochitolabs.com]
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
const [slug, out, base = 'https://app.kochitolabs.com'] = process.argv.slice(2)
if (!slug || !out) { console.error('usage: note-shot.mjs <slug> <out-dir> [base]'); process.exit(1) }
mkdirSync(out, { recursive: true })
const env = Object.fromEntries(readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
const [name, passcode] = (env.KOCHITO_APP_USERS ?? '').split(',')[0].split(':')
if (!name || !passcode) throw new Error('KOCHITO_APP_USERS is not in .env.local')
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: 'kochito note-shot headless check' })
const p = await ctx.newPage()
const url = `${base}/notes/${slug}`
const first = await p.goto(url, { waitUntil: 'networkidle' })
console.log(`without signing in: HTTP ${first.status()}, ${(await p.locator('input[name=passcode]').count()) ? 'the sign-in page' : 'NOT the sign-in page'}`)
await p.fill('input[name=name]', name)
await p.fill('input[name=passcode]', passcode)
await Promise.all([p.waitForEvent('load'), p.click('button')])
await p.waitForLoadState('networkidle')
if (!p.url().includes(`/notes/${slug}`)) await p.goto(url, { waitUntil: 'networkidle' })
console.log(`signed in, at ${p.url()}`)
console.log('H1: ' + (await p.locator('h1').allInnerTexts()).join(' | '))
console.log('H2: ' + (await p.locator('h2').allInnerTexts()).join(' | '))
console.log(`wider than the screen by ${await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)}px`)
const links = await p.locator('main a[href^="http"], article a[href^="http"]').evaluateAll((a) => a.map((x) => x.href))
console.log(`${links.length} outside links`)
for (const l of links) console.log('  ' + l)
console.log('words on the page: ' + (await p.evaluate(() => document.body.innerText.split(/\s+/).length)))
await p.screenshot({ path: `${out}/${slug}-top.png` })
await p.screenshot({ path: `${out}/${slug}-full.png`, fullPage: true })
await b.close()
