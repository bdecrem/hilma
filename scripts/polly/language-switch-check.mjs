// The language switcher over HTTP, as the app does it, on a fresh guest:
// guest (Italian) + a topic → GET languages → switch to French (a new
// profile: empty topics, same name) → a French topic → switch back to Italian
// (the same profile as before, its topic still there, the French one not) →
// the tiles report both. Prints the account's user ids; delete them after:
//   supabase db query --linked "delete from polly_users where id = '<root id>'"
// (profiles cascade from the root).
//   node scripts/polly/language-switch-check.mjs [base-url]
const BASE = process.argv[2] || 'https://hilma-nine.vercel.app'
let failures = 0, cookie = ''
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++ }
const api = async (path, method = 'GET', body) => {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`)
  return json
}
const tile = (langs, code) => langs.find((l) => l.language === code)

const name = `langcheck${Date.now() % 100000}`
const guest = await api('/api/polly/auth/guest', 'POST', { username: name, language: 'it' })
const itId = guest.user.id
console.log('root (it)', itId)

await api('/api/polly/topics', 'POST', { topic: 'Al ristorante' })
let topics = (await api('/api/polly/topics')).topics
check(topics.some((t) => t.topic === 'Al ristorante'), 'Italian profile has its topic')

let langs = (await api('/api/polly/languages')).languages
check(langs.length === 3, 'three language tiles')
check(tile(langs, 'it').active && tile(langs, 'it').started && tile(langs, 'it').topic_count >= 1, 'Italian tile: started, active, counts its topic')
check(!tile(langs, 'fr').started && !tile(langs, 'fr').active, 'French tile: not started')

const sw = await api('/api/polly/languages/switch', 'POST', { language: 'fr' })
const frId = sw.user.id
console.log('profile (fr)', frId)
check(sw.created === true && frId !== itId, 'switching to French creates a new profile')
check(sw.user.language === 'fr' && sw.user.username === name, 'the French profile reports French and the account name')
const me = (await api('/api/polly/auth/me')).user
check(me.id === frId && me.language === 'fr' && me.username === name, '/auth/me is now the French profile, same name')
topics = (await api('/api/polly/topics')).topics
check(!topics.some((t) => t.topic === 'Al ristorante'), 'French profile does not see the Italian topic')
await api('/api/polly/topics', 'POST', { topic: 'Au café' })

langs = (await api('/api/polly/languages')).languages
check(tile(langs, 'fr').active && tile(langs, 'fr').started && !tile(langs, 'it').active && tile(langs, 'it').started, 'tiles: French active, Italian started')

const back = await api('/api/polly/languages/switch', 'POST', { language: 'it' })
check(back.created === false && back.user.id === itId && back.user.language === 'it', 'switching back lands in the original Italian profile')
topics = (await api('/api/polly/topics')).topics
check(topics.some((t) => t.topic === 'Al ristorante') && !topics.some((t) => t.topic === 'Au café'), 'Italian topics intact, French topic absent')

const again = await api('/api/polly/languages/switch', 'POST', { language: 'fr' })
check(again.created === false && again.user.id === frId, 'French again: the same profile, not a second one')

let bad = 0
try { await api('/api/polly/languages/switch', 'POST', { language: 'de' }) } catch { bad = 1 }
check(bad === 1, 'an unknown language is refused')

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
console.log(`cleanup: supabase db query --linked "delete from polly_users where id = '${itId}'"`)
process.exit(failures ? 1 : 0)
