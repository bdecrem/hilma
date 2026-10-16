// The daily-texts settings and the hourly tick, end to end against a local
// dev server, on the test account only (it has no iMessage handle, so the
// tick reaches the senders and sends nothing).
//
//   CRON_SECRET=localtest pnpm exec next dev --turbopack -p 3100     # in another shell
//   npx tsx scripts/f2-daily-settings-check.ts [--base http://localhost:3100] [--user <username>]
//
// Needs .env.local (the F2 session secret the dev server shares, Supabase).
import { signSession } from '../src/lib/f2/auth'
import { f2Supabase } from '../src/lib/f2/supabase'

const args = process.argv.slice(2)
const arg = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3100')
const USERNAME = arg('--user', 'newx-test-imac@example.com')
const CRON = process.env.CRON_SECRET || 'localtest'

let fails = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ''}`)
}

async function main() {
  const { data: u } = await f2Supabase().from('f2_users')
    .select('id, username, imessage_handles, daily_chat_guid, daily_card_enabled, voice_checkin_enabled, actively_read_enabled, daily_hour, daily_tz')
    .eq('username', USERNAME).maybeSingle()
  if (!u) throw new Error(`no user ${USERNAME}`)
  if (/bart/i.test(u.username)) throw new Error('never on Bart')
  const before = { daily_card_enabled: u.daily_card_enabled, voice_checkin_enabled: u.voice_checkin_enabled, actively_read_enabled: u.actively_read_enabled, daily_hour: u.daily_hour, daily_tz: u.daily_tz }
  const reachable = (u.imessage_handles?.length ?? 0) > 0 || u.daily_chat_guid != null
  console.log(`user ${u.username} (${u.id}) reachable=${reachable} before=${JSON.stringify(before)}`)
  const cookie = `f2_session=${signSession(u.id)}`
  const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${BASE}${path}`, { method, headers: { cookie, 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined })
    let json: unknown = null
    try { json = await res.json() } catch { /* empty */ }
    return { status: res.status, json: json as Record<string, unknown> }
  }

  try {
    // GET carries the new fields.
    let r = await api('GET', '/api/f2/profile')
    check('GET profile 200', r.status === 200, r.json)
    check('GET has actively_read_enabled', typeof r.json.actively_read_enabled === 'boolean')
    check('GET has daily_hour + daily_tz', typeof r.json.daily_hour === 'number' && typeof r.json.daily_tz === 'string')

    // The send time: set, read back.
    r = await api('PUT', '/api/f2/profile', { daily_hour: 18, daily_tz: 'Europe/Brussels' })
    check('PUT hour+tz echoes', r.status === 200 && r.json.daily_hour === 18 && r.json.daily_tz === 'Europe/Brussels', r.json)
    r = await api('GET', '/api/f2/profile')
    check('GET reads 18 Europe/Brussels', r.json.daily_hour === 18 && r.json.daily_tz === 'Europe/Brussels', [r.json.daily_hour, r.json.daily_tz])
    r = await api('PUT', '/api/f2/profile', { daily_hour: 24 })
    check('PUT hour 24 → 400', r.status === 400, r.json)
    r = await api('PUT', '/api/f2/profile', { daily_tz: 'Mars/Olympus' })
    check('PUT bad zone → 400', r.status === 400, r.json)
    r = await api('PUT', '/api/f2/profile', {})
    check('PUT nothing → 400', r.status === 400, r.json)

    // Today's read off: the pick is null (no banner), on again: a pick or null (no topics).
    r = await api('PUT', '/api/f2/profile', { actively_read_enabled: false })
    check('PUT read off', r.status === 200 && r.json.actively_read_enabled === false, r.json)
    r = await api('GET', '/api/f2/actively-read')
    check('GET actively-read → pick null while off', r.status === 200 && r.json.pick === null, r.json)
    r = await api('PUT', '/api/f2/profile', { actively_read_enabled: true })
    check('PUT read on (no handle needed: it also pushes)', r.status === 200 && r.json.actively_read_enabled === true, r.json)
    r = await api('PUT', '/api/f2/profile', { voice_checkin_enabled: true })
    if (reachable) check('PUT checkin on', r.status === 200, r.json)
    else check('PUT checkin on with no handle → 409', r.status === 409, r.json)

    // The tick, limited to this user, at an instant that is 18:00 in Brussels:
    // due = 1 and every sender reports it reached this user (nothing is sent
    // without a handle).
    const now = '2026-10-16T16:00:00Z' // 18:00 CEST
    const tick = async (when: string) => {
      const res = await fetch(`${BASE}/api/f2/daily/tick?now=${encodeURIComponent(when)}&user=${u.id}`, { headers: { authorization: `Bearer ${CRON}` } })
      return { status: res.status, json: (await res.json()) as Record<string, unknown> }
    }
    const unauth = await fetch(`${BASE}/api/f2/daily/tick`)
    check('tick without secret → 401', unauth.status === 401)
    let t = await tick(now)
    check('tick at 18:00 Brussels → due 1', t.status === 200 && t.json.due === 1, t.json)
    const statuses = (k: string) => ((t.json[k] as { user: string; status: string }[] | undefined) ?? []).map((x) => `${x.user}:${x.status}`)
    console.log('     card', statuses('card'), 'read', statuses('read'), 'checkin', statuses('checkin'))
    const sentSomething = ['card', 'read', 'checkin'].some((k) => ((t.json[k] as { status: string }[] | undefined) ?? []).some((x) => x.status === 'sent'))
    check('nothing sent to the test account', reachable ? true : !sentSomething)
    t = await tick('2026-10-16T15:00:00Z') // 17:00 CEST
    check('tick an hour earlier → due 0', t.status === 200 && t.json.due === 0, t.json)
  } finally {
    await f2Supabase().from('f2_users').update(before).eq('id', u.id)
    const { data: after } = await f2Supabase().from('f2_users').select('daily_hour, daily_tz, actively_read_enabled').eq('id', u.id).maybeSingle()
    console.log('restored', after)
  }
  console.log(fails ? `${fails} FAILED` : 'all passed')
  process.exit(fails ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
