// A throwaway demo account for Polly screenshots (see shots.sh): a guest on
// production with a password + email login (the app's -TestLoginUser hook), a
// five-lesson path from a canned level check, and a copy of the source
// account's topics, voice sessions, Infinity chats and cards. SQL goes through
// the supabase CLI (linked project), so no service key is needed.
//   node scripts/polly/shots-seed.mjs <out-dir>            → writes <out-dir>/demo.json
//   node scripts/polly/shots-seed.mjs <out-dir> --delete   → deletes that account
//   POLLY_SHOTS_SOURCE=<polly_users.id> picks the account to copy (default: Bart's).
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
const BASE = 'https://hilma-nine.vercel.app'
const BART = process.env.POLLY_SHOTS_SOURCE || '928dd74c-2301-4322-afef-7923ac179481'
const PASS = 'pollyshots-' + Math.random().toString(36).slice(2, 10)
const SP = process.argv[2]
if (!SP) { console.error('usage: shots-seed.mjs <out-dir> [--delete]'); process.exit(1) }
let cookie = ''
const api = async (path, method = 'GET', body) => {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`)
  return json
}
const sql = (q) => {
  const f = `${SP}/q.sql`; writeFileSync(f, q)
  const out = execFileSync(`${process.env.HOME}/.local/bin/supabase`, ['db', 'query', '--linked', '-f', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  return JSON.parse(out.slice(out.indexOf('{'))).rows ?? []
}
if (process.argv[3] === '--delete') {
  const d = JSON.parse(readFileSync(`${SP}/demo.json`, 'utf8'))
  console.log('deleted', sql(`delete from polly_users where id='${d.id}' and is_guest returning username`))
  process.exit(0)
}
const T = [['assistant','Ciao!'],['user','Ciao! Come stai?'],['assistant','Bene, grazie! E tu, come ti chiami?'],['user','Mi chiamo Sam. Io sto bene.'],['assistant','Piacere, Sam. Dove abiti, e che lavoro fai?'],['user','Abito a San Francisco. Io lavoro... sono un designer. Mi piace il mio lavoro.'],['assistant','Che bello. Che cosa hai fatto ieri?'],['user','Ieri io... vado al ristorante con amici. Mangio la pasta. Uh, sorry, I do not know the past.'],['assistant','Nessun problema. E il prossimo fine settimana, che cosa farai?'],['user','Um... weekend... I go to the mountains, in montagna, for hiking. I do not know how to say it.'],['assistant','Va benissimo. Ti piace la montagna?'],['user','Sì, mi piace molto la montagna e anche il mare.'],['assistant',"Perfect. I have what I need and I'm building your first lesson now. Tap End. Ciao ciao!"]].map(([role, text]) => ({ role, text }))

const display = `Sam${Date.now() % 1000}`
const guest = await api('/api/polly/auth/guest', 'POST', { username: display, language: 'it' })
const id = guest.user?.id ?? guest.id
console.log('guest', display, id)
// Login lowercases the identifier and guest names keep their case, so the
// hook signs in with an email instead.
const username = `${display.toLowerCase()}-shots@example.invalid`
const hash = bcrypt.hashSync(PASS, 10)
sql(`update polly_users set password_hash='${hash}', email='${username}' where id='${id}'`)
const [vs] = sql(`insert into polly_voice_sessions (user_id, mode, transcript, ended_at) values ('${id}','placement','${JSON.stringify(T).replace(/'/g, "''")}'::jsonb, now()) returning id`)
writeFileSync(`${SP}/demo.json`, JSON.stringify({ username, display, id, pass: PASS }, null, 2))
const t = Date.now()
const placed = await api('/api/polly/path/placement', 'POST', { voice_session_id: vs.id })
console.log(`placement ${((Date.now() - t) / 1000) | 0}s → ${placed.path.level}: ${placed.path.lessons.map((l) => l.title).join(' | ')}`)
// Bart's three topics, with voice sessions, Infinity chats and cards.
const tcols = 'handle,client,url,topic,content,messages,kind,additional_sources,quotes,primer,study_focus,video_band,audio_summary,book_summary,last_quizzed_at,quiz_count,stars,pinned_at,peck_excluded,peck_weight,created_at,updated_at,lesson'
const ccols = 'question,answer,open_question,distractors,cloze_text,cloze_answer,grading_note,rating,rated_at,times_shown,last_shown_at,reps,lapses,ease,interval_days,scheduled_days,due_at,streak,created_at,updated_at,lesson_step'
const vcols = 'mode,realtime_session_id,realtime_model,realtime_voice,started_at,ended_at,transcript,summary,usage,grade,graded_at,grade_detail,created_at,updated_at'
const pre = (cols, a) => cols.split(',').map((c) => `${a}.${c}`).join(',')
const copied = sql(`
with tmap as (select id as old, gen_random_uuid() as new from polly_threads where user_id='${BART}'),
vmap as (select id as old, gen_random_uuid() as new from polly_voice_sessions where user_id='${BART}' and thread_id in (select old from tmap)),
t as (insert into polly_threads (id,user_id,${tcols}) select m.new,'${id}',${pre(tcols, 's')} from polly_threads s join tmap m on m.old=s.id returning id),
v as (insert into polly_voice_sessions (id,user_id,thread_id,${vcols}) select vm.new,'${id}',tm.new,${pre(vcols, 's')} from polly_voice_sessions s join vmap vm on vm.old=s.id join tmap tm on tm.old=s.thread_id returning id),
i as (insert into polly_infinity_chats (thread_id,user_id,voice_session_id,title,analysis,cleanup_session_id,cleaned_up_at,created_at,updated_at,input,transcript,ended_at,analyzed_turns)
  select tm.new,'${id}',v1.new,s.title,s.analysis,v2.new,s.cleaned_up_at,s.created_at,s.updated_at,s.input,s.transcript,coalesce(s.ended_at,s.created_at),s.analyzed_turns from polly_infinity_chats s join tmap tm on tm.old=s.thread_id left join vmap v1 on v1.old=s.voice_session_id left join vmap v2 on v2.old=s.cleanup_session_id where s.user_id='${BART}' returning id),
c as (insert into polly_flash_cards (user_id,thread_id,${ccols}) select '${id}',tm.new,${pre(ccols, 's')} from polly_flash_cards s join tmap tm on tm.old=s.thread_id where s.user_id='${BART}' returning id)
select (select count(*) from t) as threads,(select count(*) from v) as voice,(select count(*) from i) as chats,(select count(*) from c) as cards`)
console.log('copied', copied[0])
// Each cleaned-up chat lists its quiz cards by id — point them at the copies.
sql(`
with m as (select o.id as old, n.id as new from polly_flash_cards o join polly_flash_cards n on n.question=o.question and n.answer=o.answer and n.created_at=o.created_at where o.user_id='${BART}' and n.user_id='${id}')
update polly_infinity_chats c set analysis = jsonb_set(c.analysis, '{card_ids}', (select coalesce(jsonb_agg(m.new), '[]'::jsonb) from jsonb_array_elements_text(c.analysis->'card_ids') e join m on m.old::text = e))
where c.user_id='${id}' and c.analysis ? 'card_ids'`)

const topics = sql(`select id, kind, topic from polly_threads where user_id='${id}' order by created_at`)
console.log(topics)
const d = JSON.parse(readFileSync(`${SP}/demo.json`, 'utf8'))
writeFileSync(`${SP}/demo.json`, JSON.stringify({ ...d, topics: Object.fromEntries(topics.map((t) => [t.kind, t.id])) }, null, 2))
