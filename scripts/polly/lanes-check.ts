// The text chat's lanes (Direction 2b, step 1) — src/lib/polly/talk.ts.
//
//   Part A, local: the classifier on a battery of learner messages, each with
//   Polly's last line (needs ANTHROPIC_API_KEY only).
//   Part B, over HTTP as the app does it, on a throwaway guest with an Infinity
//   topic: Polly opens → Italian with a slip (Italian back, one folded fix) →
//   clean Italian (no fix) → a beginner's mixed message (practice, not agent) →
//   an English question (English answer + Italian resume) → an English
//   instruction (tool call + card + resume) → "Polly, …" (agent, forced).
//   The guest is deleted at the end (supabase CLI, linked project).
//
//   set -a; . .env.local; set +a
//   npx tsx scripts/polly/lanes-check.ts            # both parts, production
//   npx tsx scripts/polly/lanes-check.ts --local    # part A only
//   npx tsx scripts/polly/lanes-check.ts --http [base-url]
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyTurn, looksLikeNoEnglish, type Intent } from '../../src/lib/polly/talk'

let failures = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n        ${detail}` : ''}`)
  if (!ok) failures++
}

// ---------- Part A ----------

type Case = { text: string; last?: string; lang?: 'it' | 'fr' | 'ko'; want: Intent | Intent[] }
const DAY = "Allora, com'è andata la giornata?"
const CASES: Case[] = [
  // practice — the studied language
  { text: 'Bene! Ho lavorato molto e poi ho andato in palestra', last: DAY, want: 'practice' },
  { text: 'Corsa, trenta minuti. Poi sushi con un amico', last: 'Che cosa fai in palestra — pesi o corsa?', want: 'practice' },
  { text: 'Sì', last: 'Ti piace il sushi?', want: 'practice' },
  { text: "Je suis allée au cinéma avec ma sœur", lang: 'fr', last: "Qu'est-ce que tu as fait hier ?", want: 'practice' },
  { text: '오늘 회사에 갔어요', lang: 'ko', last: '오늘 뭐 했어요?', want: 'practice' },
  // practice — a beginner reaching for it
  { text: 'I went to the… palestra?', last: DAY, want: 'practice' },
  { text: 'ieri ho… how do you say tired', last: DAY, want: 'practice' },
  { text: "I don't know how to say it, I went to the mountains", last: 'Che cosa hai fatto nel fine settimana?', want: 'practice' },
  { text: 'I went to the gym and then I had sushi', last: DAY, want: 'practice' },
  { text: 'I like pizza', last: 'Che cosa ti piace mangiare?', want: 'practice' },
  { text: 'What about you? Cosa fai stasera?', last: 'Che bello! E dopo il lavoro?', want: 'practice' },
  { text: 'Je suis allé au cinéma with my sister', lang: 'fr', last: "Qu'est-ce que tu as fait hier ?", want: 'practice' },
  { text: 'how do you say tired?', last: 'Come stai oggi?', want: ['practice', 'question'] },
  // questions — stepped out of the conversation
  { text: 'what does "mi avvalgo della facoltà di non rispondere" actually mean?', last: 'E lui, come si difende?', want: 'question' },
  { text: 'why is it sono andato and not ho andato?', last: 'Che cosa fai in palestra?', want: 'question' },
  { text: "what's the difference between sapere and conoscere", last: 'Conosci Roma?', want: 'question' },
  { text: 'how do you pronounce gli?', last: 'Che cosa avete preso?', want: 'question' },
  { text: "is 'buona' right there or should it be 'buono'?", last: 'Il sushi era buono?', want: 'question' },
  // instructions
  { text: 'make cards from the last two chats, food only', last: 'Che cosa avete preso?', want: 'instruction' },
  { text: 'Polly, make cards from the last two chats, food only', last: 'Che cosa avete preso?', want: 'instruction' },
  { text: 'rename this chat to Sushi night', last: 'Che cosa avete preso?', want: 'instruction' },
  { text: 'show me my weak spots from this week', last: 'Che cosa avete preso?', want: 'instruction' },
  { text: 'add a flash card for palestra', last: 'Che cosa fai in palestra?', want: 'instruction' },
  { text: 'quiz me on these words', last: 'Che cosa avete preso?', want: 'instruction' },
  { text: 'Polly what does stanco mean', last: 'Come stai oggi?', want: 'instruction' },
]

async function partA() {
  console.log('\n— Part A: the classifier —')
  let calls = 0
  const t0 = Date.now()
  for (const c of CASES) {
    const r = await classifyTurn({ text: c.text, language: c.lang ?? 'it', lastPolly: c.last })
    if (r.by === 'classifier') calls++
    const want = Array.isArray(c.want) ? c.want : [c.want]
    check(want.includes(r.intent), `${r.intent.padEnd(11)} (${r.by}) ← ${c.text}`, want.includes(r.intent) ? '' : `wanted ${want.join(' or ')}`)
  }
  console.log(`        ${CASES.length} messages, ${calls} classifier calls, ${((Date.now() - t0) / Math.max(1, calls) / 1000).toFixed(1)} s per call`)
}

// ---------- Part B ----------

type Turn = { role: 'user' | 'assistant'; text: string; lane?: 'practice' | 'agent'; fix?: { said: string; better: string; why: string } | null; card?: { kind: string; title: string; count: number; thread_id: string } | null }
type Chat = { id: string; title: string | null; input: string; open: boolean; needs_cleanup: boolean; fixes_so_far: number; learner_turns: number; analysis: { fixes: unknown[]; vocab: unknown[]; grammar: unknown[]; fresh_fixes?: number } | null; transcript?: { role: string; text: string; via: string }[] }
type Talk = { lane: 'practice' | 'agent'; intent: Intent; messages: Turn[]; reply: string; chat: Chat | null }

function sql(q: string): Record<string, unknown>[] {
  const f = join(mkdtempSync(join(tmpdir(), 'lanes-')), 'q.sql')
  writeFileSync(f, q)
  const out = execFileSync(`${process.env.HOME}/.local/bin/supabase`, ['db', 'query', '--linked', '-f', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  return JSON.parse(out.slice(out.indexOf('{'))).rows ?? []
}

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length
const questions = (s: string) => (s.match(/\?/g) ?? []).length

async function partB(base: string) {
  console.log(`\n— Part B: the chat route, ${base} —`)
  let cookie = ''
  const api = async <T,>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
    const set = res.headers.getSetCookie?.() ?? []
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${JSON.stringify(json)}`)
    return json as T
  }
  const guest = await api<{ user?: { id: string }; id?: string }>('/api/polly/auth/guest', { username: `lanes${Date.now() % 100000}`, language: 'it' })
  const userId = guest.user?.id ?? guest.id!
  console.log(`        guest ${userId}`)
  try {
    const topic = await api<{ thread: { id: string } }>('/api/polly/topics', { topic: 'Infinity Chat', kind: 'infinity' })
    const threadId = topic.thread.id
    // On a topic the server keeps the conversation: the first turn opens a
    // chat, the rest name it.
    let chatId: string | undefined
    const say = async (text: string | null, label: string): Promise<Talk> => {
      const t = Date.now()
      const r = await api<Talk>('/api/polly/messages', { ...(text ? { text } : {}), thread_id: threadId, talk: { chat_id: chatId, open: text === null } })
      chatId = r.chat?.id ?? chatId
      console.log(`\n  ${label}  [${r.lane}/${r.intent}, ${((Date.now() - t) / 1000).toFixed(1)} s]${text ? `\n    you:   ${text}` : ''}`)
      for (const m of r.messages) {
        console.log(`    polly: ${m.text}`)
        if (m.fix) console.log(`           ✎ ${m.fix.said} → ${m.fix.better} — ${m.fix.why}`)
        if (m.card) console.log(`           ▭ ${m.card.title} · ${m.card.count} cards`)
      }
      return r
    }

    let r = await say(null, '1. Polly opens')
    check(r.lane === 'practice' && r.messages.length === 1 && looksLikeNoEnglish(r.messages[0].text) && questions(r.messages[0].text) === 1, 'opens in Italian with one question')

    r = await say('Bene! Ho lavorato molto e poi ho andato in palestra', '2. Italian with a slip')
    check(r.lane === 'practice' && r.messages.length === 1, 'practice lane, one message')
    check(looksLikeNoEnglish(r.messages[0].text), 'the reply is in Italian')
    check(questions(r.messages[0].text) === 1, 'it ends on one question')
    check(!!r.messages[0].fix && /sono andat/i.test(r.messages[0].fix.better), 'one folded fix: ho andato → sono andato', JSON.stringify(r.messages[0].fix))
    check(!!r.messages[0].fix && !looksLikeNoEnglish(r.messages[0].fix.why) && r.messages[0].fix.why.split(/\s+/).length <= 10 && r.messages[0].fix.said.split(/\s+/).length <= 4, 'the fix is a whisper: a few words, the why in English')

    r = await say('Ho fatto corsa, trenta minuti. Poi ho mangiato sushi con un amico.', '3. Clean Italian')
    check(r.lane === 'practice' && r.messages[0].fix == null, 'no fix when there is nothing to fix', JSON.stringify(r.messages[0].fix))

    r = await say('Then I went to the… supermercato? to buy il pesce', "4. A beginner's mixed message")
    check(r.lane === 'practice' && r.intent === 'practice', 'practice, not agent')
    check(looksLikeNoEnglish(r.messages[0].text), 'Polly stays in Italian')
    check(r.messages[0].fix == null, 'no stale fix from an earlier message', JSON.stringify(r.messages[0].fix))
    const pollyQuestion = r.messages[0].text

    r = await say('why is it "sono andato" and not "ho andato"?', '5. An English question')
    check(r.lane === 'agent' && r.intent === 'question' && r.messages.length === 2, 'agent lane: an answer, then the resume')
    check(!looksLikeNoEnglish(r.messages[0].text) && sentences(r.messages[0].text) <= 2 && r.messages[0].text.split(/\s+/).length <= 50 && !r.messages[0].text.includes('**') && /essere/i.test(r.messages[0].text), 'answered in English: two sentences at most, no markdown, with the point (essere)')
    check(r.messages[1].lane === 'practice' && looksLikeNoEnglish(r.messages[1].text) && questions(r.messages[1].text) >= 1, 'then Polly resumes in Italian with a question')
    console.log(`        (her question before the detour: ${pollyQuestion})`)

    r = await say('make 5 flash cards with the food words from this chat', '6. An English instruction')
    check(r.lane === 'agent' && r.intent === 'instruction' && r.messages.length === 2, 'agent lane: the report, then the resume')
    check(!!r.messages[0].card && r.messages[0].card.count > 0, 'a card for what was made', JSON.stringify(r.messages[0].card))
    check(sentences(r.messages[0].text) <= 2, 'the report is two sentences at most')
    const [{ n }] = sql(`select count(*)::int as n from polly_flash_cards where user_id='${userId}' and thread_id='${threadId}'`) as { n: number }[]
    check(n > 0 && n === r.messages[0].card?.count, `the cards exist in the deck (${n})`)
    check(r.messages[1].lane === 'practice' && looksLikeNoEnglish(r.messages[1].text) && questions(r.messages[1].text) >= 1, 'then Polly resumes in Italian with a question')

    r = await say('Polly, what does "stanco" mean?', '7. "Polly, …"')
    check(r.lane === 'agent' && r.intent === 'instruction', 'forced into the agent lane')
    check(/tired/i.test(r.messages[0].text) && r.messages.length === 2 && looksLikeNoEnglish(r.messages[1].text), 'answered, then the Italian thread again')

    const [{ m }] = sql(`select jsonb_array_length(messages)::int as m from polly_threads where id='${threadId}'`) as { m: number }[]
    check(m === 0, "the topic's own message list is untouched (the text chat is its own object)")

    // ---------- Part C: a typed chat is a chat ----------
    console.log('\n— Part C: typed chats are chats, and the agent knows them —')
    const get = async <T,>(path: string): Promise<T> => {
      const res = await fetch(base + path, { headers: { Cookie: cookie } })
      if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
      return (await res.json()) as T
    }
    check(!!r.chat && r.chat.open && r.chat.input === 'text' && r.chat.fixes_so_far === 1, 'the turns are stored on an open chat row (1 fix so far)', JSON.stringify({ open: r.chat?.open, input: r.chat?.input, fixes: r.chat?.fixes_so_far }))

    r = await say('Polly, make cards from this chat, food only', '8. cards_from_chats')
    check(!!r.messages[0].card && r.messages[0].card.count > 0, 'the agent made cards out of the conversation', JSON.stringify(r.messages[0].card))

    r = await say('Polly, what are my chats called?', '9. list_chats (the question that used to get "nothing on file")')
    check(!/no (titled )?sources|nothing on file|no conversations/i.test(r.messages[0].text), 'the agent sees the conversation')

    const fin = await api<{ chat: Chat | null }>(`/api/polly/infinity/chats/${chatId}/finish`, {})
    check(!!fin.chat && !fin.chat.open && !!fin.chat.title && fin.chat.needs_cleanup, `finish closes it and titles it ("${fin.chat?.title}"), ready to clean up`)
    let list = await get<{ chats: Chat[] }>(`/api/polly/infinity/topics/${threadId}/chats`)
    check(list.chats.length === 1 && list.chats[0].input === 'text', 'it is in the journey, marked typed')

    let t0 = Date.now()
    let cleaned = await api<{ chat: Chat }>(`/api/polly/infinity/chats/${chatId}/cleanup`, {})
    console.log(`        clean-up ${((Date.now() - t0) / 1000).toFixed(0)} s → ${cleaned.chat.analysis?.fixes.length} fixes, ${cleaned.chat.analysis?.vocab.length} words, ${cleaned.chat.analysis?.grammar.length} grammar`)
    check(!!cleaned.chat.analysis && cleaned.chat.analysis.fixes.length > 0 && !cleaned.chat.needs_cleanup, 'the same clean-up runs on a typed chat')
    await api(`/api/polly/infinity/chats/${chatId}/complete`, {})

    const one = await get<{ chat: Chat }>(`/api/polly/infinity/chats/${chatId}`)
    check((one.chat.transcript ?? []).length >= 10 && one.chat.transcript!.every((x) => x.via === 'text'), `the chat carries its transcript (${one.chat.transcript?.length} turns)`)

    r = await say('Ieri ho mangiato la pizza e ho bevuto una birra. Sono andato a casa presto perché ero stanca... no, stanco.', '10. Continue the finished chat by typing')
    r = await say('La pizza era molto buona ma il birra era caldo.', '11. …with a slip')
    check(r.chat?.id === chatId && r.chat.open, 'the same chat, reopened')
    await api(`/api/polly/infinity/chats/${chatId}/finish`, {})
    list = await get<{ chats: Chat[] }>(`/api/polly/infinity/topics/${threadId}/chats`)
    check(list.chats.length === 1 && list.chats[0].needs_cleanup, 'one chat still, and it needs cleaning up again')
    const before = cleaned.chat.analysis!.fixes.length
    t0 = Date.now()
    cleaned = await api<{ chat: Chat }>(`/api/polly/infinity/chats/${chatId}/cleanup`, {})
    const a = cleaned.chat.analysis!
    console.log(`        delta clean-up ${((Date.now() - t0) / 1000).toFixed(0)} s → ${a.fresh_fixes} new fixes, ${a.fixes.length} in all`)
    check((a.fresh_fixes ?? 0) > 0 && a.fixes.length === before + (a.fresh_fixes ?? 0), 'only the new part was curated; its fixes are the ones to walk')

    // ---------- Part D: the same chat, carried on out loud ----------
    console.log('\n— Part D: text → voice keeps the conversation —')
    const [{ id: vsId }] = sql(`insert into polly_voice_sessions (user_id, thread_id, mode) values ('${userId}','${threadId}','topic') returning id`) as { id: string }[]
    const patch = await fetch(`${base}/api/polly/live/session/${vsId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ continue_chat_id: chatId, transcript: [
        { role: 'assistant', text: 'Allora, dove hai mangiato la pizza?' },
        { role: 'user', text: 'Ho mangiato a casa di un amico, lui cucina molto bene.' },
      ] }),
    })
    const spoken = (await patch.json()) as { ok: boolean; chat: Chat | null }
    check(patch.ok && spoken.chat?.id === chatId && spoken.chat.input === 'mixed' && !spoken.chat.open && spoken.chat.needs_cleanup,
      'the radio hanging up appends to the chat: mixed, closed, ready to clean up again', JSON.stringify({ input: spoken.chat?.input, open: spoken.chat?.open, needs: spoken.chat?.needs_cleanup }))
    const mixed = await get<{ chat: Chat }>(`/api/polly/infinity/chats/${chatId}`)
    const vias = (mixed.chat.transcript ?? []).map((x) => x.via)
    check(vias.slice(-2).every((v) => v === 'voice') && vias.includes('text'), 'its transcript has the typed turns, then the spoken ones')

    const typed = await api<{ chat: Chat }>('/api/polly/infinity/chats', { thread_id: threadId, transcript: [{ role: 'assistant', text: 'Ciao! Che cosa fai oggi?' }, { role: 'user', text: 'Oggi lavoro e poi vado al cinema.' }] })
    check(typed.chat.input === 'text' && !typed.chat.open && !!typed.chat.title, 'POST /infinity/chats takes a transcript as well as a voice session')
  } finally {
    console.log(`\n        deleted ${JSON.stringify(sql(`delete from polly_users where id='${userId}' and is_guest returning username`))}`)
  }
}

const args = process.argv.slice(2)
const base = args.find((a) => a.startsWith('http')) ?? 'https://hilma-nine.vercel.app'
async function main() {
  if (!args.includes('--http')) await partA()
  if (!args.includes('--local')) await partB(base)
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
