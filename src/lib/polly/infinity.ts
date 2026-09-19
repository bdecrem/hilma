// Infinity Chat (2026-09-19). An endless, low-pressure conversation: talk
// messy, then clean it up. The heart is CURATION — from a whole messy chat,
// pick the FIVE things most worth fixing, walk through them one at a time
// (voice + before/after cards), and turn those same five into Vocab and
// Grammar drills. See apps/polly/schema/006_polly_infinity.sql and the
// /api/polly/infinity/* routes. Consumer app, not a learning dashboard.

import { llmComplete } from './llm'
import { activeLanguage, LANGUAGES, type LanguageCode } from './language'
import { pollySupabase } from './supabase'

const INFINITY_MODEL = process.env.POLLY_INFINITY_MODEL || 'sonnet-5'
const TITLE_MODEL = process.env.POLLY_INFINITY_TITLE_MODEL || 'sonnet-5'
export const MAX_FIXES = 5

/// "Infinity Chat" in the language the learner is studying (the topic title).
const INFINITY_TITLE: Record<string, string> = {
  it: 'Chat infinita',
  fr: 'Chat infini',
  ko: '무한 대화',
}
export function infinityTitle(language: LanguageCode | null): string {
  return (language && INFINITY_TITLE[language]) || 'Infinity Chat'
}

// ---------- shapes ----------

/// One curated fix: what the learner said, the clean version, why, and the
/// short phrase to practice saying. `kind` sorts it into Vocab vs Grammar.
export type Fix = {
  id: string
  said: string       // what they actually said (messy, maybe half-English)
  fixed: string      // the natural target-language version
  kind: 'grammar' | 'vocab' | 'phrasing'
  note: string       // one plain-English line, no jargon
  say_it: string     // the phrase to repeat out loud
}

export type VocabCard = { term: string; meaning: string }  // target ⇄ English, run either way

export type GrammarPoint = {
  point: string      // short title ("essere vs avere for movement")
  explain: string    // one plain line
  drills: { prompt: string; answer: string }[]  // 1–3 quick fill-ins
}

export type InfinityAnalysis = {
  title: string
  fixes: Fix[]         // ≤ MAX_FIXES, curated
  vocab: VocabCard[]   // ≤ 8
  grammar: GrammarPoint[]
  /// The quiz deck built from this conversation (polly_flash_cards ids on the
  /// Infinity topic; Peck-eligible by default). Set after clean-up.
  card_ids?: string[]
  /// When the learner passed the quiz for this conversation.
  mastered_at?: string | null
}

export type InfinityChat = {
  id: string
  thread_id: string
  user_id: string
  voice_session_id: string | null
  title: string | null
  analysis: InfinityAnalysis | null
  cleanup_session_id: string | null
  cleaned_up_at: string | null
  created_at: string
}

type TranscriptRow = { role: string; text: string }

function transcriptText(rows: TranscriptRow[]): string {
  return rows
    .filter((r) => r && typeof r.text === 'string' && r.text.trim())
    .map((r) => `${r.role === 'assistant' ? 'Polly' : 'You'}: ${r.text.trim()}`)
    .join('\n')
}

async function sessionTranscript(userId: string, voiceSessionId: string): Promise<TranscriptRow[]> {
  const { data } = await pollySupabase()
    .from('polly_voice_sessions')
    .select('transcript')
    .eq('id', voiceSessionId)
    .eq('user_id', userId)
    .maybeSingle()
  return (Array.isArray(data?.transcript) ? data!.transcript : []) as TranscriptRow[]
}

// ---------- rows ----------

export async function createInfinityChat(input: {
  userId: string
  threadId: string
  voiceSessionId: string
}): Promise<InfinityChat> {
  const rows = await sessionTranscript(input.userId, input.voiceSessionId)
  const language = await activeLanguage(input.userId)
  const title = await quickTitle(rows, language).catch(() => null)
  const { data, error } = await pollySupabase()
    .from('polly_infinity_chats')
    .insert({
      thread_id: input.threadId,
      user_id: input.userId,
      voice_session_id: input.voiceSessionId,
      title,
    })
    .select('*')
    .single()
  if (error) throw new Error(`infinity: create chat failed: ${error.message}`)
  return data as InfinityChat
}

export async function listInfinityChats(userId: string, threadId: string): Promise<InfinityChat[]> {
  const { data, error } = await pollySupabase()
    .from('polly_infinity_chats')
    .select('*')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`infinity: list failed: ${error.message}`)
  return (data ?? []) as InfinityChat[]
}

export async function getInfinityChat(userId: string, id: string): Promise<InfinityChat | null> {
  const { data } = await pollySupabase()
    .from('polly_infinity_chats')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as InfinityChat) ?? null
}

/// Run (or return the already-run) curation. Reads the chat's transcript,
/// curates ≤5 fixes + vocab + grammar, saves and returns the analysis.
export async function cleanUpChat(userId: string, id: string): Promise<InfinityChat | null> {
  const chat = await getInfinityChat(userId, id)
  if (!chat) return null
  if (chat.analysis) return chat // already curated; the walk can start
  const language = await activeLanguage(userId)
  const rows = chat.voice_session_id ? await sessionTranscript(userId, chat.voice_session_id) : []
  const analysis = await analyzeConversation({ language, transcript: rows, fallbackTitle: chat.title })
  // Build the quiz deck (real flash cards on the Infinity topic → Peck) and
  // remember its ids on the analysis, so this conversation has a set to master.
  const cardIds = await generateInfinityCards(userId, chat.thread_id, analysis).catch((e) => {
    console.error('[infinity] card generation failed:', e)
    return [] as string[]
  })
  const stored: InfinityAnalysis = { ...analysis, card_ids: cardIds, mastered_at: null }
  const { data, error } = await pollySupabase()
    .from('polly_infinity_chats')
    .update({ analysis: stored, title: analysis.title || chat.title, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw new Error(`infinity: save analysis failed: ${error.message}`)
  return data as InfinityChat
}

/// The clean-up walk is finished: remember which voice session did it.
export async function completeCleanup(userId: string, id: string, cleanupSessionId?: string): Promise<void> {
  const { error } = await pollySupabase()
    .from('polly_infinity_chats')
    .update({
      cleaned_up_at: new Date().toISOString(),
      cleanup_session_id: cleanupSessionId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw new Error(`infinity: complete failed: ${error.message}`)
}

// ---------- the quiz: real flash cards + mastery ----------

function shuffle<T>(a: T[]): T[] {
  const out = [...a]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pick<T>(pool: T[], n: number, not: Set<string>, key: (t: T) => string): T[] {
  return shuffle(pool.filter((x) => !not.has(key(x)))).slice(0, n)
}

/// Turn a cleaned-up conversation into a real deck on the Infinity topic:
/// vocab BOTH ways (Italian⇄English) as multiple-choice, grammar drills as
/// fill-in-the-blank. They live in polly_flash_cards on the topic, so they are
/// Peck-eligible by default. Deterministic — no LLM, instant to grade.
/// Returns the new card ids.
export async function generateInfinityCards(userId: string, threadId: string, analysis: InfinityAnalysis): Promise<string[]> {
  const sb = pollySupabase()
  const rows: Record<string, unknown>[] = []
  const vocab = analysis.vocab ?? []

  for (const v of vocab) {
    const term = v.term.trim(), meaning = v.meaning.trim()
    if (!term || !meaning) continue
    // term → English (multiple choice)
    const enDistractors = pick(vocab, 3, new Set([meaning]), (x) => x.meaning).map((x) => x.meaning)
    if (enDistractors.length >= 2) {
      rows.push({ user_id: userId, thread_id: threadId, question: `What does “${term}” mean?`, answer: meaning,
                  distractors: enDistractors, cloze_text: null, cloze_answer: null, lesson_step: 'words' })
    }
    // English → term (multiple choice)
    const itDistractors = pick(vocab, 3, new Set([term]), (x) => x.term).map((x) => x.term)
    if (itDistractors.length >= 2) {
      rows.push({ user_id: userId, thread_id: threadId, question: `How do you say “${meaning}” in Italian?`, answer: term,
                  distractors: itDistractors, cloze_text: null, cloze_answer: null, lesson_step: 'words' })
    }
  }

  for (const g of analysis.grammar ?? []) {
    for (const d of g.drills ?? []) {
      const prompt = d.prompt.trim(), ans = d.answer.trim()
      if (!prompt || !ans) continue
      // The drill prompts already read like "... → Io ___ andato al bar." Keep
      // the sentence with the blank as the fill-in card.
      const cloze = prompt.includes('_') ? prompt : `${prompt}  (___)`
      rows.push({ user_id: userId, thread_id: threadId, question: prompt, answer: ans,
                  distractors: [], cloze_text: cloze, cloze_answer: ans, lesson_step: 'grammar' })
    }
  }

  if (rows.length === 0) return []
  const { data, error } = await sb.from('polly_flash_cards').insert(rows).select('id')
  if (error) throw new Error(`infinity: card insert failed: ${error.message}`)
  return (data ?? []).map((r) => r.id as string)
}

type QuizQuestion = {
  card_id: string
  question: string
  format: 'choice' | 'cloze'
  choices?: string[]
  answer: string
  cloze_answer?: string
  rating: string | null
  topic: string | null
}

/// Build this conversation's quiz set (a FlashStart the app hands to the same
/// FlashSetView Dodo uses). Every card is choice or fill-in — instant to grade.
export async function buildInfinityQuiz(userId: string, chatId: string): Promise<{ mode: string; thread_id: string; total: number; questions: QuizQuestion[] } | null> {
  const chat = await getInfinityChat(userId, chatId)
  if (!chat || !chat.analysis) return null
  let ids = chat.analysis.card_ids ?? []
  // Retrofit: conversations cleaned up before quizzes existed have no deck —
  // build it now (once) and remember it.
  if (ids.length === 0) {
    ids = await generateInfinityCards(userId, chat.thread_id, chat.analysis)
    if (ids.length === 0) return null
    const analysis: InfinityAnalysis = { ...chat.analysis, card_ids: ids }
    await pollySupabase().from('polly_infinity_chats')
      .update({ analysis, updated_at: new Date().toISOString() })
      .eq('id', chatId).eq('user_id', userId)
  }
  const { data } = await pollySupabase()
    .from('polly_flash_cards')
    .select('id, question, answer, distractors, cloze_text, cloze_answer, rating')
    .eq('user_id', userId)
    .in('id', ids)
  const byId = new Map((data ?? []).map((c) => [c.id as string, c]))
  const questions: QuizQuestion[] = []
  for (const id of shuffle(ids)) {
    const c = byId.get(id)
    if (!c) continue
    if (c.cloze_text && c.cloze_answer) {
      questions.push({ card_id: c.id, question: c.cloze_text, format: 'cloze', answer: c.answer,
                       cloze_answer: c.cloze_answer, rating: c.rating ?? null, topic: null })
    } else {
      const choices = shuffle([c.answer, ...((c.distractors as string[]) ?? [])])
      questions.push({ card_id: c.id, question: c.question, format: 'choice', choices, answer: c.answer,
                       rating: c.rating ?? null, topic: null })
    }
  }
  return { mode: 'mixed', thread_id: chat.thread_id, total: questions.length, questions }
}

/// Mark this conversation mastered (the learner passed its quiz).
export async function masterConversation(userId: string, chatId: string): Promise<InfinityChat | null> {
  const chat = await getInfinityChat(userId, chatId)
  if (!chat || !chat.analysis) return chat
  const analysis: InfinityAnalysis = { ...chat.analysis, mastered_at: new Date().toISOString() }
  const { data, error } = await pollySupabase()
    .from('polly_infinity_chats')
    .update({ analysis, updated_at: new Date().toISOString() })
    .eq('id', chatId)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw new Error(`infinity: master failed: ${error.message}`)
  return data as InfinityChat
}

// ---------- the curation (the whole point) ----------

async function analyzeConversation(input: {
  language: LanguageCode | null
  transcript: TranscriptRow[]
  fallbackTitle: string | null
}): Promise<InfinityAnalysis> {
  const lang = input.language ? LANGUAGES[input.language].name : 'the language'
  const convo = transcriptText(input.transcript)
  if (!convo.trim()) {
    return { title: input.fallbackTitle || 'A quick chat', fixes: [], vocab: [], grammar: [] }
  }
  const system = `You are Polly, a warm ${lang} tutor reviewing a messy practice conversation with a learner whose own language is English. They talk freely, mix English in, and make mistakes — that is exactly what this space is for, and none of it is a problem. The transcript is speech-to-text: expect mis-heard words and missing punctuation, and judge what they evidently meant.

Your ONE job is CURATION. From everything the learner said, pick the FEW things most worth fixing for THIS person right now — AT MOST ${MAX_FIXES}, fewer if fewer are worth it. Choose what will help them most: a wrong verb form they leaned on, a word they reached for in English, a phrase that came out unnatural, a small grammar slip that recurs. IGNORE typos, pronunciation, and anything trivial. Never pad to five.

For each fix give: what they said (lightly cleaned of transcription noise, still theirs), the natural ${lang} version, ONE plain-English line on why (no grammar jargon, no terms they were not taught), a tag (grammar | vocab | phrasing), and the short ${lang} phrase for them to say out loud.

Then, from the useful language in the chat, up to 8 vocab pairs (a ${lang} term and its short English meaning) — these get drilled both directions. And for the grammar-tagged fixes, a tiny grammar point each: a short title, one plain line explaining it, and 1–3 quick fill-in drills (prompt + answer).

Also give the whole conversation a short, friendly 2–4 word title IN ${lang} (the language the learner is studying, NOT English), like a chat label.

Warm, specific, encouraging. This is a consumer app, not a report.`

  const result = await llmComplete({
    model: INFINITY_MODEL,
    system,
    messages: [{ role: 'user', content: `The conversation:\n\n${convo}` }],
    maxTokens: 4_000,
    forceTool: true,
    tools: [{
      name: 'record_cleanup',
      description: 'Record the curated fixes, vocab and grammar for this conversation.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: `A friendly 2–4 word label for the chat, in ${lang} (not English).` },
          fixes: {
            type: 'array',
            description: `At most ${MAX_FIXES}, curated. Fewer is fine. Never pad.`,
            items: {
              type: 'object',
              properties: {
                said: { type: 'string' },
                fixed: { type: 'string' },
                kind: { type: 'string', enum: ['grammar', 'vocab', 'phrasing'] },
                note: { type: 'string' },
                say_it: { type: 'string' },
              },
              required: ['said', 'fixed', 'kind', 'note', 'say_it'],
            },
          },
          vocab: {
            type: 'array',
            items: {
              type: 'object',
              properties: { term: { type: 'string' }, meaning: { type: 'string' } },
              required: ['term', 'meaning'],
            },
          },
          grammar: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                point: { type: 'string' },
                explain: { type: 'string' },
                drills: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { prompt: { type: 'string' }, answer: { type: 'string' } },
                    required: ['prompt', 'answer'],
                  },
                },
              },
              required: ['point', 'explain', 'drills'],
            },
          },
        },
        required: ['title', 'fixes', 'vocab', 'grammar'],
      },
    }],
  })
  if (result.type !== 'tool_call') {
    return { title: input.fallbackTitle || 'A quick chat', fixes: [], vocab: [], grammar: [] }
  }
  const r = result.input as {
    title?: string
    fixes?: Omit<Fix, 'id'>[]
    vocab?: VocabCard[]
    grammar?: GrammarPoint[]
  }
  const fixes: Fix[] = (r.fixes ?? [])
    .slice(0, MAX_FIXES)
    .map((f, i) => ({
      id: `fix-${i + 1}`,
      said: String(f.said ?? '').trim(),
      fixed: String(f.fixed ?? '').trim(),
      kind: (['grammar', 'vocab', 'phrasing'].includes(f.kind as string) ? f.kind : 'phrasing') as Fix['kind'],
      note: String(f.note ?? '').trim(),
      say_it: String(f.say_it ?? f.fixed ?? '').trim(),
    }))
    .filter((f) => f.fixed)
  const vocab: VocabCard[] = (r.vocab ?? [])
    .slice(0, 8)
    .map((v) => ({ term: String(v.term ?? '').trim(), meaning: String(v.meaning ?? '').trim() }))
    .filter((v) => v.term && v.meaning)
  const grammar: GrammarPoint[] = (r.grammar ?? [])
    .map((g) => ({
      point: String(g.point ?? '').trim(),
      explain: String(g.explain ?? '').trim(),
      drills: (g.drills ?? [])
        .map((d) => ({ prompt: String(d.prompt ?? '').trim(), answer: String(d.answer ?? '').trim() }))
        .filter((d) => d.prompt && d.answer),
    }))
    .filter((g) => g.point && g.explain)
  return { title: String(r.title ?? '').trim() || input.fallbackTitle || 'A quick chat', fixes, vocab, grammar }
}

/// A cheap 2–4 word label, in the language the learner is studying, so the feed
/// reads nicely before clean-up.
async function quickTitle(rows: TranscriptRow[], language: LanguageCode | null): Promise<string | null> {
  const convo = transcriptText(rows)
  if (!convo.trim()) return null
  const lang = language ? LANGUAGES[language].name : 'the language being practised'
  const result = await llmComplete({
    model: TITLE_MODEL,
    system: `Give a short, friendly 2–4 word label for this practice conversation, IN ${lang} (the language the learner is studying, not English) — like a chat title. Natural and simple. Just the label, in ${lang}.`,
    messages: [{ role: 'user', content: convo.slice(0, 4000) }],
    maxTokens: 200,
    forceTool: true,
    tools: [{
      name: 'label',
      description: 'The chat label.',
      input_schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    }],
  })
  if (result.type !== 'tool_call') return null
  const t = String((result.input as { title?: string }).title ?? '').trim()
  return t ? t.slice(0, 60) : null
}
