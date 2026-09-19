// Infinity Chat (2026-09-19). An endless, low-pressure conversation: talk
// messy, then clean it up. The heart is CURATION — from a whole messy chat,
// pick the FIVE things most worth fixing, walk through them one at a time
// (voice + before/after cards), and turn those same five into Vocab and
// Grammar drills. See apps/polly/schema/006_polly_infinity.sql and the
// /api/polly/infinity/* routes. Consumer app, not a learning dashboard.

import { llmComplete } from './llm'
import { activeLanguage, LANGUAGES, type LanguageCode } from './language'
import { pollySupabase } from './supabase'

const INFINITY_MODEL = process.env.POLLY_INFINITY_MODEL || 'sonnet-4-6'
const TITLE_MODEL = process.env.POLLY_INFINITY_TITLE_MODEL || 'sonnet-4-6'
export const MAX_FIXES = 5

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
  const title = await quickTitle(rows).catch(() => null)
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
  const { data, error } = await pollySupabase()
    .from('polly_infinity_chats')
    .update({ analysis, title: analysis.title || chat.title, updated_at: new Date().toISOString() })
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

Also give the whole conversation a short, friendly 2–4 word title (English), like a chat label ("Ordering coffee", "Weekend plans").

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
          title: { type: 'string', description: 'A friendly 2–4 word English label for the chat.' },
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

/// A cheap 2–4 word label so the feed reads nicely before clean-up.
async function quickTitle(rows: TranscriptRow[]): Promise<string | null> {
  const convo = transcriptText(rows)
  if (!convo.trim()) return null
  const result = await llmComplete({
    model: TITLE_MODEL,
    system: 'Give a short, friendly 2–4 word English label for this practice conversation, like a chat title ("Ordering coffee", "Weekend plans"). Just the label.',
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
