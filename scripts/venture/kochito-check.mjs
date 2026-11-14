// Fills in both forms on kochitolabs.com's pages as a visitor from an ad would,
// and checks the row that lands in kochito_leads (page, email, link, the ad's
// source and keyword), the "Got it" state, and that a bad address is refused.
// Its sign-ups use @kochito-check.test, which leads.mjs never counts, and it
// deletes them when it is done.
// Usage: node scripts/venture/kochito-check.mjs [base]   base defaults to http://localhost:3277/kochito
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const base = process.argv[2] || 'http://localhost:3277/kochito'
const root = new URL('../../', import.meta.url)
const env = Object.fromEntries(readFileSync(new URL('.env.local', root), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const stamp = Date.now().toString(36)
let bad = 0
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) bad++ }
const b = await chromium.launch()
for (const [page, detail] of [['pdf', 'https://example.gov/agenda.pdf'], ['apps', 'https://apps.shopify.com/example']]) {
  const email = `${page}-${stamp}@kochito-check.test`
  const p = await b.newPage({ userAgent: 'kochito-check headless check' })
  await p.goto(`${base}/${page}?utm_source=google&utm_campaign=${page}-test&utm_term=check+keyword`, { waitUntil: 'networkidle' })
  await p.getByLabel('Work email').fill('not-an-address')
  await p.locator('.kl-form button').click()
  ok(await p.locator('.kl-done').count() === 0, `${page}: a bad address is not accepted`)
  await p.getByLabel('Work email').fill(email)
  await p.locator('.kl-form input[name=detail]').fill(detail)
  await p.locator('.kl-form button').click()
  await p.locator('.kl-done').waitFor({ timeout: 15000 }).catch(() => {})
  ok(await p.locator('.kl-done').count() === 1 && (await p.locator('.kl-done').innerText()).includes(email), `${page}: the form says "Got it" and names the address`)
  const { data } = await db.from('kochito_leads').select('*').eq('email', email)
  const row = data?.[0]
  ok(!!row && row.page === page && row.detail === detail, `${page}: the sign-up is stored with its link`)
  ok(!!row && row.src === 'google' && row.campaign === `${page}-test` && row.term === 'check keyword', `${page}: it carries the ad's source, campaign and keyword`)
  const { data: ev } = await db.from('kochito_events').select('kind').eq('sid', row?.sid ?? '-')
  const kinds = new Set((ev ?? []).map((e) => e.kind))
  ok(kinds.has('view') && kinds.has('cta') && kinds.has('lead'), `${page}: view, form touch and sign-up were all counted`)
  await db.from('kochito_leads').delete().eq('email', email)
  if (row?.sid) await db.from('kochito_events').delete().eq('sid', row.sid)
  await p.close()
}
await b.close()
console.log(bad ? `\n${bad} problem(s)` : '\nall ok')
process.exit(bad ? 1 : 0)
