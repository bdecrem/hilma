// Looks at Ola in one page on the board (OLA-132): signs in, checks the card on the overview (its
// badge, its line, its link) and the page itself (/overview: the badge, the rendered tables, no
// raw header line), and takes pictures of both at desktop and phone width.
// Usage: node scripts/venture/overview-shots.mjs <out-dir> [url]
//          url defaults to http://localhost:3291/kochito/kit (a dev server);
//          for the live site pass https://app.kochitolabs.com
// The account is the first of KOCHITO_APP_USERS in .env.local, never written here.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
const [out, url = 'http://localhost:3291/kochito/kit'] = process.argv.slice(2)
if (!out) { console.error('usage: node scripts/venture/overview-shots.mjs <out-dir> [url]'); process.exit(1) }
mkdirSync(out, { recursive: true })
const [name, passcode] = (env.KOCHITO_APP_USERS ?? '').split(',')[0].split(':')
if (!name || !passcode) throw new Error('KOCHITO_APP_USERS is not in .env.local')

const problems = []
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) problems.push(what) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, userAgent: 'kochito overview-shots headless check' })
const p = await ctx.newPage()
p.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
const shoot = async (file, el) => {
  for (const [tag, w, h] of [['desk', 1280, 800], ['phone', 390, 844]]) {
    await p.setViewportSize({ width: w, height: h })
    await p.evaluate(() => document.fonts.ready)
    if (el) await p.locator(el).first().scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${out}/${file}-${tag}.png` })
    if (!el) await p.screenshot({ path: `${out}/${file}-${tag}-full.png`, fullPage: true })
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(over <= 0, `${file} ${tag}: no sideways scroll${over > 0 ? ` (${over}px too wide)` : ''}`)
  }
  await p.setViewportSize({ width: 1280, height: 800 })
}

await p.goto(url, { waitUntil: 'networkidle' })
await p.fill('input[name=name]', name)
await p.fill('input[name=passcode]', passcode)
await Promise.all([p.waitForEvent('load'), p.click('button')])
await p.waitForLoadState('networkidle')
const card = p.locator('#overview')
check((await card.count()) === 1, 'the overview has the "Ola in one page" card')
const badge = (await card.locator('.kb-badge').textContent())?.trim()
check(['current', 'stale', 'not checked'].includes(badge ?? ''), `the card's badge: ${badge}`)
console.log(`     ${(await card.locator('.kb-sec-head p').textContent())?.trim()}`)
check(((await card.locator('.kb-ov-lede').textContent()) ?? '').trim().length > 80, 'the card shows what Ola is')
await shoot('overview-card', '#overview')
await card.getByRole('link', { name: 'Read it →' }).click()
await p.waitForLoadState('networkidle')
check((await p.getByRole('heading', { name: 'Ola in one page', level: 1 }).count()) === 1, 'the page renders OVERVIEW.md')
check((await p.locator('.kb-md table').count()) >= 2, 'its tables render as tables')
check(!(await p.locator('.kb-md').textContent())?.includes('Last checked against'), 'the header line is shown as the badge, not as text')
check((await p.locator('.kb-crumb .kb-badge').count()) === 1, 'the page carries the badge')
check((await p.locator('nav a[aria-current=page]', { hasText: 'Ola in one page' }).count()) >= 1, 'the sidebar marks the page')
await shoot('overview-page')
await b.close()
if (problems.length) { console.log(`\n${problems.length} problem(s)`); process.exit(1) }
console.log('\nall good')
