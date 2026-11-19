// Checks app.kochitolabs.com (the board for Bart): the door is shut without a
// cookie, a wrong passcode is refused, the right one opens the page, the cookie
// survives a new tab and lasts a year, Sign out shuts it again, and the old
// address sends you to the new one. Signed in, the board of 2026-11-18: five
// pages with one menu item each, Home's sections (one health reading, younger
// than 30 minutes, that does not contradict itself; Agent learning), the Issue
// Tracker's tabs, search and an issue's page, Plan, Notes, Learning. It reads
// only: the tracker's writes are scripts/venture/tracker-check.mjs. Takes pictures of the door and
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
// A dev server started with its own KOCHITO_APP_USERS in the environment (a made-up account, on a
// machine whose .env.local has none) is checked with that same variable set here.
const [name, passcode] = (process.env.KOCHITO_APP_USERS ?? env.KOCHITO_APP_USERS ?? '').split(',')[0].split(':')
if (!name || !passcode) throw new Error('KOCHITO_APP_USERS is not in .env.local (nor in the environment)')
const live = url.startsWith('https://')
const before = (await db('?select=id&order=id.desc&limit=1'))[0]?.id ?? 0

const problems = []
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) problems.push(what) }
// On the live site the walk is only worth something if the latest push is what is live. On
// 2026-11-18 a deploy failed on an unrelated page and a walk of the older version passed.
if (live) {
  const { execFileSync } = await import('node:child_process')
  const sh = (f, a) => execFileSync(f, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    sh('git', ['fetch', '-q', 'origin', 'main'])
    const sha = sh('git', ['rev-parse', 'origin/main'])
    let state = 'pending'
    for (let i = 0; i < 40 && state === 'pending'; i++) {
      state = sh('gh', ['api', `repos/bdecrem/hilma/commits/${sha}/status`, '--jq', '.state'])
      if (state === 'pending') await new Promise((r) => setTimeout(r, 15000))
    }
    check(state === 'success', state === 'success' ? `the latest push (${sha.slice(0, 8)}) is what is live` : `the latest push (${sha.slice(0, 8)}) did not deploy (${state}): the live site is still an older version`)
  } catch {
    console.log('     (could not ask whether the latest push deployed: git or gh did not answer)')
  }
}
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, userAgent: 'kochito app-check headless check' })
const p = await ctx.newPage()
p.on('pageerror', (e) => problems.push(`page error on ${new URL(p.url()).pathname}: ${e.message.slice(0, 200)}`))
const shut = async (pg) => (await pg.locator('input[name=passcode]').count()) === 1 && (await pg.locator('.bd-nav').count()) === 0
const open = async (pg) => (await pg.getByRole('heading', { name: 'Home', exact: true, level: 1 }).count()) === 1 && (await pg.locator('input[name=passcode]').count()) === 0
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
// A dev server on a machine with no VENTURE_KEY shows the voice links without a key.
if (live || env.VENTURE_KEY) check((await p.locator('a[href*="/venture/memo?k="]').count()) >= 1, 'signed in, the voice links carry the key')
// the board, round three (2026-11-18): five pages, one menu item each, nothing shown twice
const at = (path) => url.replace(/\/$/, '') + path
const side = p.locator('.bd-side')
const menu = await side.locator('.bd-nav a').allTextContents()
check(menu.length === 5 && ['Home', 'Issue Tracker', 'Plan', 'Notes', 'Learning'].every((w, n) => menu[n].startsWith(w)), `the menu lists the five pages: ${menu.map((x) => x.replace(/\d+$/, '').trim()).join(', ')}`)
check((await side.locator('.bd-nav a[aria-current=page]').count()) === 1, 'the current page is marked in the menu')
// Home: needs you, now, health, the week, learning; no issue list but Needs you
for (const id of ['needs-h', 'now-h', 'health-h', 'week-h', 'learn-h']) check((await p.locator(`h2#${id}`).count()) === 1, `Home has its section ${id.replace('-h', '')}`)
check((await p.locator('.bd-table').count()) === 0, 'Home lists no issues outside Needs you')
check((await p.locator('.bd-now a').count()) === 5, 'Now shows five counts that link into the tracker')
const health = p.locator('dl.bd-health')
check((await health.locator('dd.read').count()) === 1, `Health is one reading with one time (${(await health.locator('dd.read').textContent())?.trim()})`)
check((await health.locator('dd.read.stale').count()) === 0, 'the reading is younger than 30 minutes')
const reading = ((await health.textContent()) ?? '').toLowerCase()
check(!(reading.includes('almost full') && /\b[2-9]\d gb free/.test(reading)), 'the health block does not call a disk with room almost full')
const figs = await p.locator('.bd-learn .bd-learn-fig').count()
check(figs === 2 && /\d+%/.test((await p.locator('.bd-learn').textContent()) ?? ''), 'Learning shows two figures, Kit and Ola')
check((await p.locator('h2#learn-h a').getAttribute('href'))?.endsWith('/learning'), 'Home links to the Learning page')
const fold = await p.evaluate(() => document.documentElement.scrollHeight)
if (!live) console.log(`     Home is ${fold}px tall at 1280 x 800`)
await p.evaluate(() => window.scrollTo(0, 0))
await shoot(p, 'page')
// Issue Tracker: tabs, filters and search in the address, a row opens the issue
await p.goto(at('/issues'), { waitUntil: 'networkidle' })
check((await p.getByRole('heading', { name: 'Issue Tracker', level: 1 }).count()) === 1, 'the page is headed Issue Tracker, like its menu item')
const tabs = await p.locator('.bd-tabs a').count()
const rows = await p.locator('.bd-table > li:not(.head)').count()
check(tabs === 6 && rows > 0, `the tracker has ${tabs} tabs and ${rows} open issue(s)`)
await shoot(p, 'issues')
await p.goto(at('/issues?tab=done'), { waitUntil: 'networkidle' })
check((await p.locator('.bd-day').count()) > 0 && (await p.locator('.bd-table > li:not(.head)').count()) > 0, 'Done is grouped by day')
await p.goto(at('/issues?tab=all&area=security&q=review'), { waitUntil: 'networkidle' })
const found = await p.locator('.bd-table > li:not(.head) a').count()
check(found > 0, `filters and search find ${found} security review issue(s)`)
await Promise.all([p.waitForEvent('load'), p.locator('.bd-table > li:not(.head) a').first().click()])
await p.waitForLoadState('networkidle')
check(/\/issues\/OLA-\d+$/.test(p.url()) && (await p.locator('.bd-thread > li').count()) > 0, `a row opens the issue with its activity (${new URL(p.url()).pathname})`)
check((await p.locator('dl.bd-fields select').count()) >= 3 && (await p.locator('textarea').count()) >= 1, 'the issue has its field menus and a comment box (nothing is written by this check)')
await shoot(p, 'issue')
// Plan, Notes, Learning: the heading is the menu item's words
for (const [path, name] of [['/plan', 'Plan'], ['/notes', 'Notes'], ['/learning', 'Learning']]) {
  await p.goto(at(path), { waitUntil: 'networkidle' })
  check((await p.getByRole('heading', { name, level: 1, exact: true }).count()) === 1 && (await side.locator('.bd-nav a[aria-current=page]').textContent())?.startsWith(name), `${name} is its own page`)
  await shoot(p, name.toLowerCase())
}
// Learning: the headline figures, the daily sweep as dated updates, and the old address
await p.goto(at('/learning'), { waitUntil: 'networkidle' })
check((await p.locator('.bd-learn.three .bd-learn-fig').count()) === 3, 'Learning shows three headline figures: Kit, Ola and the weaknesses')
const swept = await p.locator('.bd-sweeps > li:not(.line)').count()
const owed = await p.locator('.bd-sweeps > li.line.bd-amber').count()
check(swept >= 1, `the daily sweep has ${swept} dated ${swept === 1 ? 'update' : 'updates'}`)
check(owed === 0, owed ? `${owed} ${owed === 1 ? 'day is' : 'days are'} not swept` : 'no day is waiting for its sweep')
check((await p.locator('.bd-sweeps > li:not(.line) .bd-changes > li').count()) >= 1, 'the newest update names what it changed')
const weak = await p.locator('.bd-weak > li:not(.head)').count()
check(weak >= 5, `the weaknesses are listed (${weak}), each with what prevents it and whether that is holding`)
check((await p.locator('.bd-sweeps > li:not(.line) .bd-sweep-build').count()) >= 1, 'the newest update says what to build next')
for (const id of ['weak-h', 'sweep-h', 'ind-h', 'other-h']) check((await p.locator(`h2#${id}`).count()) === 1, `Learning has its section ${id.replace('-h', '')}`)
await p.goto(at('/numbers'), { waitUntil: 'networkidle' })
check(new URL(p.url()).pathname.endsWith('/learning'), 'the old Numbers address opens Learning')
await p.goto(at('/notes'), { waitUntil: 'networkidle' })
const notes = p.locator('.bd-notes > li > a')
check((await notes.count()) >= 3, `Notes lists ${await notes.count()} documents`)
await Promise.all([p.waitForEvent('load'), notes.nth(1).click()])
await p.waitForLoadState('networkidle')
check((await p.locator('.bd-note-head').count()) === 1 && /\/notes\//.test(p.url()), `a note opens with a header on its body (${new URL(p.url()).pathname})`)
await shoot(p, 'note')
await p.goto(url, { waitUntil: 'networkidle' })
await p.setViewportSize({ width: 390, height: 844 })
await p.locator('.bd-top details > summary').click()
check(await p.locator('.bd-top details .bd-nav').isVisible(), 'on a phone the pages open from Menu')
await p.screenshot({ path: `${out}/menu-phone.png` })
await p.setViewportSize({ width: 1280, height: 800 })

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
