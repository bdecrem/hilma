// Checks app.kochitolabs.com (the board for Bart): the door is shut without a
// cookie, a wrong passcode is refused, the right one opens the page, the cookie
// survives a new tab and lasts a year, Sign out shuts it again, and the old
// address sends you to the new one. Signed in, the board itself (2026-11-17):
// the project's name, the plate with work in progress, Independence, the plan,
// Done with today's and yesterday's work (a row opens to its proof), and a
// status from the mini younger than 30 minutes. Takes pictures of the door and
// the page at desktop and phone width.
// Usage: node scripts/venture/app-check.mjs <out-dir> [url]
//          url defaults to http://localhost:3277/kochito/kit (a dev server);
//          for the live site pass https://app.kochitolabs.com
//        node scripts/venture/app-check.mjs --unlock
//          forgets the wrong tries of the last day (clears a lockout)
// The account comes from KOCHITO_APP_USERS in .env.local (the first one); it
// is never written in this public repo. The one wrong try the check makes is
// removed again, so running it does not count toward the limit.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
const db = async (path, init = {}) => {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/kochito_logins${path}`, { ...init, headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, prefer: 'return=representation', ...(init.headers ?? {}) } })
  if (!res.ok) throw new Error(`kochito_logins ${res.status}: ${await res.text()}`)
  return res.json()
}

if (process.argv[2] === '--unlock') {
  const gone = await db(`?ok=eq.false&at=gte.${new Date(Date.now() - 24 * 3600e3).toISOString()}`, { method: 'DELETE' })
  console.log(`forgot ${gone.length} wrong ${gone.length === 1 ? 'try' : 'tries'}`)
  process.exit(0)
}

const [out, url = 'http://localhost:3277/kochito/kit'] = process.argv.slice(2)
if (!out) { console.error('usage: node scripts/venture/app-check.mjs <out-dir> [url] | --unlock'); process.exit(1) }
mkdirSync(out, { recursive: true })
const [name, passcode] = (env.KOCHITO_APP_USERS ?? '').split(',')[0].split(':')
if (!name || !passcode) throw new Error('KOCHITO_APP_USERS is not in .env.local')
const live = url.startsWith('https://')
const before = (await db('?select=id&order=id.desc&limit=1'))[0]?.id ?? 0

const problems = []
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) problems.push(what) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, userAgent: 'kochito app-check headless check' })
const p = await ctx.newPage()
p.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
const shut = async (pg) => (await pg.locator('input[name=passcode]').count()) === 1 && (await pg.getByText('Journal', { exact: true }).count()) === 0
const open = async (pg) => (await pg.getByRole('heading', { name: 'Done', exact: true }).count()) === 1 && (await pg.locator('input[name=passcode]').count()) === 0
const shoot = async (pg, file) => {
  for (const [tag, w, h] of [['desk', 1280, 800], ['phone', 390, 844]]) {
    await pg.setViewportSize({ width: w, height: h })
    await pg.evaluate(() => document.fonts.ready)
    await pg.screenshot({ path: `${out}/${file}-${tag}.png` })
    await pg.screenshot({ path: `${out}/${file}-${tag}-full.png`, fullPage: true })
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (over > 0) problems.push(`${file} ${tag}: ${over}px wider than the screen`)
  }
  await pg.setViewportSize({ width: 1280, height: 800 })
}

await p.goto(url, { waitUntil: 'networkidle' })
check(await shut(p), 'without a cookie the page shows only the door')
check(!(await p.content()).includes('?k='), 'the door gives away no venture key')
await shoot(p, 'door')

await p.fill('input[name=name]', name)
await p.fill('input[name=passcode]', passcode + 'x')
await p.click('button')
const said = p.locator('.ko-gate-error')
await said.filter({ hasText: /\S/ }).waitFor({ timeout: 15000 }).catch(() => {})
check((await said.textContent())?.includes('do not match') && (await shut(p)), 'a wrong passcode is refused, with a reason')
await shoot(p, 'door-wrong')

await p.fill('input[name=name]', name[0].toUpperCase() + name.slice(1)) // a phone capitalizes the first letter
await p.fill('input[name=passcode]', passcode)
await Promise.all([p.waitForEvent('load'), p.click('button')])
await p.waitForLoadState('networkidle')
check(await open(p), 'the right name and passcode open the page')
const cookie = (await ctx.cookies()).find((c) => c.name === 'kl_app')
const days = cookie ? (cookie.expires - Date.now() / 1000) / 86400 : 0
check(cookie?.httpOnly && days > 360 && (!live || cookie.secure), `the cookie is http-only${live ? ', secure' : ''} and lasts ${Math.round(days)} days`)
check((await p.locator('a[href*="/venture/memo?k="]').count()) === 1, 'signed in, the voice links carry the key')
// the board
check(/\S/.test((await p.locator('h1#project').textContent()) ?? ''), `the project is named at the top: ${(await p.locator('h1#project').textContent())?.trim()}`)
const plate = await p.locator('#plate .kb-row').count()
check(plate > 0, `the plate shows ${plate} issue(s)`)
check((await p.locator('#independence .ko-ind-big').count()) === 1, 'Independence shows today\'s number')
check((await p.locator('#plan .kb-road-days li').count()) >= 28, 'the plan shows its road')
for (const day of ['Today', 'Yesterday']) {
  const box = p.locator('#done details.kb-day', { has: p.locator('.kb-day-name', { hasText: new RegExp(`^${day}`) }) })
  const n = Number((await box.locator('.kb-day-n').first().textContent().catch(() => '0')) ?? 0)
  check(n > 0 && (await box.first().getAttribute('open')) !== null, `Done: ${day.toLowerCase()} is open with ${n} item(s)`)
}
const first = p.locator('#done .kb-row summary').first()
await first.click()
check(await p.locator('#done .kb-row details[open] .kb-detail').first().isVisible(), 'a Done row opens in place to its detail')
await first.click()
const fresh = (await p.locator('.kb-live-at dd').textContent())?.trim()
check((await p.locator('.kb-live.stale').count()) === 0, `the mini's status is fresh (${fresh})`)
await p.evaluate(() => window.scrollTo(0, 0))
await shoot(p, 'page')

const tab = await ctx.newPage()
await tab.goto(url, { waitUntil: 'networkidle' })
check(await open(tab), 'a new tab is still signed in')
await tab.close()

await Promise.all([p.waitForEvent('load'), p.getByRole('button', { name: 'Sign out' }).click()])
await p.waitForLoadState('networkidle')
check(await shut(p), 'Sign out shuts the door again')

if (live) {
  for (const old of ['https://kochitolabs.com/kit?k=anything', 'https://ola.cx/kochito/kit']) {
    await p.goto(old, { waitUntil: 'networkidle' })
    check(new URL(p.url()).host === 'app.kochitolabs.com' && (await shut(p)), `${old} sends you to app.kochitolabs.com`)
  }
}
await b.close()

const mine = await db(`?ok=eq.false&id=gt.${before}&username=eq.${name}`, { method: 'DELETE' })
console.log(`removed the check's own wrong ${mine.length === 1 ? 'try' : 'tries'} (${mine.length})`)
console.log(problems.length ? `\n${problems.length} problem(s): ${[...new Set(problems)].join(' | ')}` : `\nall good; pictures in ${out}`)
process.exit(problems.length ? 1 : 0)
