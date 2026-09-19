// The content-quality setting over HTTP, as the app does it, on ONE fresh
// guest (deleted at the end): default is fast → a clean-up is stamped
// sonnet-5:medium → PUT deep → a French profile inherits it → a second
// clean-up is stamped opus-5:high → typed answers are graded with the
// language rubric (a wrong form fails, a missing accent passes).
//   node scripts/polly/quality-http-check.mjs <transcripts.json> [base-url]
// transcripts.json: supabase db query output with { rows: [{ title, transcript }] }.
// Needs the supabase CLI linked (it plants the voice sessions and cleans up).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const BASE = process.argv[3] || 'https://hilma-nine.vercel.app'
let cookie = '', failures = 0
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++ }
const api = async (p, m = 'GET', b) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: b ? JSON.stringify(b) : undefined }); const s = r.headers.getSetCookie?.() ?? []; if (s.length) cookie = s.map((c) => c.split(';')[0]).join('; '); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${JSON.stringify(j)}`); return j }
const sql = (q) => JSON.parse(execFileSync('supabase', ['db', 'query', '--linked', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).rows
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8')).rows

const g = await api('/api/polly/auth/guest', 'POST', { username: 'qualitycheck' + (Date.now() % 100000), language: 'it' })
const uid = g.user.id; console.log('guest', uid)
try {
  check((await api('/api/polly/profile')).content_quality === 'fast', 'a new account starts on fast')
  const tid = ((await api('/api/polly/topics', 'POST', { topic: 'Infinity Chat', kind: 'infinity' })).topic ?? {}).id
    ?? sql(`select id from polly_threads where user_id='${uid}' and kind='infinity'`)[0].id
  const cleanup = async (row) => {
    const vs = sql(`insert into polly_voice_sessions (user_id, thread_id, mode, transcript, ended_at) values ('${uid}','${tid}','topic',$q$${JSON.stringify(row.transcript)}$q$::jsonb, now()) returning id`)[0].id
    const chat = (await api('/api/polly/infinity/chats', 'POST', { thread_id: tid, voice_session_id: vs })).chat
    const t = Date.now(); const a = (await api(`/api/polly/infinity/chats/${chat.id}/cleanup`, 'POST', {})).chat.analysis
    console.log(`   clean-up ${((Date.now() - t) / 1000).toFixed(1)}s · ${a.curated_by} · ${a.fixes.length} fixes`)
    return a
  }
  check((await cleanup(rows[0])).curated_by === 'sonnet-5:medium', 'fast clean-up is curated by sonnet-5:medium')

  let bad = 0; try { await api('/api/polly/profile', 'PUT', { content_quality: 'turbo' }) } catch { bad = 1 }
  check(bad === 1, 'an unknown quality is refused')
  check((await api('/api/polly/profile', 'PUT', { content_quality: 'deep' })).content_quality === 'deep', 'PUT deep')
  check((await api('/api/polly/profile')).content_quality === 'deep', 'the setting persists')
  check((await cleanup(rows[1] ?? rows[0])).curated_by === 'opus-5:high', 'thorough clean-up is curated by opus-5:high')

  // Grading: the language rubric, through the app's own submit call.
  const cards = sql(`select id, question, answer from polly_flash_cards where user_id='${uid}' and cloze_text is null and question like 'How do you say%' limit 2`)
  if (cards.length === 2) {
    const wrongForm = cards[0].answer.replace(/[aeio]$/, 'ato')           // an invented form
    const noAccents = cards[1].answer.normalize('NFD').replace(/[̀-ͯ']/g, '')
    const res = await api('/api/polly/flash/submit', 'POST', { mode: 'text', thread_id: tid, answers: [{ card_id: cards[0].id, answer: wrongForm }, { card_id: cards[1].id, answer: noAccents }] })
    const by = Object.fromEntries((res.results ?? []).map((r) => [r.card_id, r.correct]))
    console.log(`   graded: “${wrongForm}” for “${cards[0].answer}” → ${by[cards[0].id]} · “${noAccents}” for “${cards[1].answer}” → ${by[cards[1].id]}`)
    check(by[cards[0].id] === false, 'an invented form is marked wrong')
    check(by[cards[1].id] === true, 'the right words without accents/apostrophes pass')
  } else console.log('   (no vocab cards to grade — skipped)')

  const fr = await api('/api/polly/languages/switch', 'POST', { language: 'fr' })
  check(fr.created === true && (await api('/api/polly/profile')).content_quality === 'deep', 'a new French profile inherits thorough')
  await api('/api/polly/profile', 'PUT', { content_quality: 'fast' })
  await api('/api/polly/languages/switch', 'POST', { language: 'it' })
  check((await api('/api/polly/profile')).content_quality === 'fast', 'changing it in French changes Italian too (account-wide)')
} finally {
  sql(`delete from polly_users where id='${uid}' returning id`); console.log('guest deleted')
}
console.log(failures ? `\n${failures} FAILED` : '\nall passed'); process.exit(failures ? 1 : 0)
