// F2 flash cards — generation, set scoring, judges, XP, Jumbo career.
//
// A card is a question + canonical answer + 3 multiple-choice distractors,
// generated per topic. A set is one 10-question session in one of three
// modes; topic sets feed the per-topic star ladder, Jumbo sets (cards mixed
// across all topics) feed the level map. Career state is derived entirely
// from f2_flash_sets history — only XP is stored (f2_users.xp).

import Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from './supabase'
import { llmComplete } from './llm'
import { buildFullContent, type F2Thread } from './threads'

export type FlashCard = {
  id: string
  user_id: string
  thread_id: string
  question: string
  answer: string
  distractors: string[]
  created_at: string
}

export type FlashSetMode = 'choice' | 'text' | 'voice'

export type FlashResult = {
  card_id: string
  question: string
  answer: string
  given: string | null
  correct: boolean
}

export type FlashSet = {
  id: string
  user_id: string
  thread_id: string | null
  jumbo_level: number | null
  mode: FlashSetMode
  score: number
  total: number
  results: FlashResult[]
  xp: number
  created_at: string
}

export const SET_SIZE = 10
export const JUMBO_PASS_SCORE = 7
export const STAR2_SCORE = 9 // 9/10 on two consecutive full sets → star 2

// ---------------------------------------------------------------------------
// Card generation

const GENERATE_MIN = 4
const GENERATE_MAX = 75

/// Generate `count` flash cards from a topic's source material + chat history
/// and insert them. Returns the new cards. Uses the same model registry as
/// chat so the iOS picker's choice carries over.
export async function generateFlashCards(
  thread: F2Thread,
  count: number,
  model?: string | null,
  /** Optional user guidance about the style/mix of cards (the "redo" flow). */
  styleInstructions?: string,
): Promise<FlashCard[]> {
  const n = Math.max(GENERATE_MIN, Math.min(GENERATE_MAX, Math.round(count)))
  const subject = thread.topic ?? thread.url ?? 'this topic'
  const source = buildFullContent(thread).slice(0, 120_000)
  const chat = thread.messages
    .slice(-30)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
    .slice(0, 12_000)

  const system = `You write flash cards for a learning app. Given source material and a chat transcript about a topic, produce exactly ${n} flash cards that test real understanding of the most important ideas.

Rules:
- Questions must be answerable in one short phrase or sentence — no essays.
- The canonical answer must be short (a few words to one sentence).
- Each card needs exactly 3 plausible-but-wrong distractors of the same shape
  and length as the answer, so multiple-choice mode isn't guessable by format.
- Cover the topic broadly; no two cards should test the same fact.
- No trick questions, no "all of the above".${styleInstructions ? `

The learner asked for the deck to be built THEIR way — follow this guidance
about the style and mix of cards (it wins over the defaults above where they
conflict, except the format rules about answers and distractors):
${styleInstructions}` : ''}`

  const user = `Topic: ${subject}

Source material:
${source || '(no source — use the chat transcript as ground truth)'}

Chat transcript:
${chat || '(none)'}

Create exactly ${n} flash cards.`

  const result = await llmComplete({
    model,
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 12_000,
    forceTool: true,
    tools: [
      {
        name: 'create_flash_cards',
        description: 'Record the generated flash cards.',
        input_schema: {
          type: 'object',
          properties: {
            cards: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' },
                  distractors: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Exactly 3 wrong choices.',
                  },
                },
                required: ['question', 'answer', 'distractors'],
              },
            },
          },
          required: ['cards'],
        },
      },
    ],
  })

  if (result.type !== 'tool_call') {
    throw new Error('Card generation returned no structured cards')
  }
  const raw = (result.input.cards ?? []) as {
    question?: string
    answer?: string
    distractors?: string[]
  }[]
  const rows = raw
    .filter((c) => c.question?.trim() && c.answer?.trim())
    .slice(0, n)
    .map((c) => ({
      user_id: thread.user_id,
      thread_id: thread.id,
      question: c.question!.trim(),
      answer: c.answer!.trim(),
      distractors: (c.distractors ?? []).map((d) => String(d).trim()).filter(Boolean).slice(0, 3),
    }))
  if (rows.length === 0) throw new Error('Card generation produced no usable cards')

  const { data, error } = await f2Supabase()
    .from('f2_flash_cards')
    .insert(rows)
    .select('*')
  if (error || !data) {
    console.error('[f2/flash] insert cards failed:', error)
    throw new Error('Could not save generated cards')
  }
  return data as FlashCard[]
}

/// Turn a user-drafted question into a full card: clean up typos/wording
/// (keeping the intent), answer it from the topic's material, and write the
/// multiple-choice distractors.
export async function authorFlashCard(
  thread: F2Thread,
  draftQuestion: string,
  model?: string | null,
): Promise<FlashCard> {
  const subject = thread.topic ?? thread.url ?? 'this topic'
  const source = buildFullContent(thread).slice(0, 120_000)

  const system = `You finish a flash card that a learner drafted for their own deck. They wrote the question; you polish it and supply the rest.

Rules:
- Keep the question's intent exactly — fix typos, grammar, and clarity only.
- Write the canonical answer from the source material (short: a few words to one sentence). If the source doesn't cover it, answer from general knowledge of the topic.
- Add exactly 3 plausible-but-wrong distractors matching the answer's shape and length.`

  const user = `Topic: ${subject}

Source material:
${source || '(no source — answer from general knowledge of the topic)'}

The learner's draft question:
${draftQuestion}

Produce the finished card.`

  const result = await llmComplete({
    model,
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 2000,
    forceTool: true,
    tools: [
      {
        name: 'create_flash_cards',
        description: 'Record the finished flash card.',
        input_schema: {
          type: 'object',
          properties: {
            cards: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' },
                  distractors: { type: 'array', items: { type: 'string' } },
                },
                required: ['question', 'answer', 'distractors'],
              },
            },
          },
          required: ['cards'],
        },
      },
    ],
  })
  if (result.type !== 'tool_call') throw new Error('Card authoring returned nothing')
  const c = ((result.input.cards ?? []) as {
    question?: string
    answer?: string
    distractors?: string[]
  }[])[0]
  if (!c?.question?.trim() || !c.answer?.trim()) {
    throw new Error('Card authoring produced no usable card')
  }
  const { data, error } = await f2Supabase()
    .from('f2_flash_cards')
    .insert({
      user_id: thread.user_id,
      thread_id: thread.id,
      question: c.question.trim(),
      answer: c.answer.trim(),
      distractors: (c.distractors ?? []).map((d) => String(d).trim()).filter(Boolean).slice(0, 3),
    })
    .select('*')
    .single()
  if (error || !data) {
    console.error('[f2/flash] authorFlashCard insert failed:', error)
    throw new Error('Could not save the card')
  }
  return data as FlashCard
}

/// Regenerate the whole deck to match the user's instructions, replacing the
/// existing cards. New cards are inserted BEFORE the old ones are deleted so
/// a generation failure never loses the deck.
export async function redoFlashCards(
  thread: F2Thread,
  instructions: string,
  model?: string | null,
): Promise<FlashCard[]> {
  const old = await listFlashCards(thread.user_id, thread.id)
  const count = Math.max(SET_SIZE, Math.min(GENERATE_MAX, old.length || 15))

  const newCards = await generateFlashCards(thread, count, model, instructions)

  if (old.length > 0) {
    const { error } = await f2Supabase()
      .from('f2_flash_cards')
      .delete()
      .eq('user_id', thread.user_id)
      .eq('thread_id', thread.id)
      .in('id', old.map((c) => c.id))
    if (error) console.error('[f2/flash] redo delete-old failed:', error)
  }
  return newCards
}

// ---------------------------------------------------------------------------
// Card CRUD

export async function listFlashCards(
  userId: string,
  threadId: string,
): Promise<FlashCard[]> {
  const { data, error } = await f2Supabase()
    .from('f2_flash_cards')
    .select('*')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[f2/flash] listFlashCards failed:', error)
    return []
  }
  return (data as FlashCard[]) ?? []
}

export async function countFlashCards(userId: string): Promise<number> {
  const { count, error } = await f2Supabase()
    .from('f2_flash_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) {
    console.error('[f2/flash] countFlashCards failed:', error)
    return 0
  }
  return count ?? 0
}

export async function getFlashCardsByIds(
  userId: string,
  ids: string[],
): Promise<FlashCard[]> {
  if (ids.length === 0) return []
  const { data, error } = await f2Supabase()
    .from('f2_flash_cards')
    .select('*')
    .eq('user_id', userId)
    .in('id', ids)
  if (error) {
    console.error('[f2/flash] getFlashCardsByIds failed:', error)
    return []
  }
  return (data as FlashCard[]) ?? []
}

export async function updateFlashCard(
  userId: string,
  cardId: string,
  patch: { question?: string; answer?: string; distractors?: string[] },
): Promise<FlashCard | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.question?.trim()) update.question = patch.question.trim()
  if (patch.answer?.trim()) update.answer = patch.answer.trim()
  if (patch.distractors) {
    update.distractors = patch.distractors.map((d) => d.trim()).filter(Boolean).slice(0, 3)
  }
  const { data, error } = await f2Supabase()
    .from('f2_flash_cards')
    .update(update)
    .eq('id', cardId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()
  if (error) {
    console.error('[f2/flash] updateFlashCard failed:', error)
    return null
  }
  return (data as FlashCard | null) ?? null
}

export async function deleteFlashCard(
  userId: string,
  cardId: string,
): Promise<boolean> {
  const { error } = await f2Supabase()
    .from('f2_flash_cards')
    .delete()
    .eq('id', cardId)
    .eq('user_id', userId)
  if (error) {
    console.error('[f2/flash] deleteFlashCard failed:', error)
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Set selection

/// Pick up to SET_SIZE random cards for a set. Topic sets draw from one
/// thread; Jumbo sets draw across every topic the user has cards for.
export async function pickSetCards(
  userId: string,
  threadId: string | null,
): Promise<FlashCard[]> {
  let query = f2Supabase().from('f2_flash_cards').select('*').eq('user_id', userId)
  if (threadId) query = query.eq('thread_id', threadId)
  const { data, error } = await query
  if (error) {
    console.error('[f2/flash] pickSetCards failed:', error)
    return []
  }
  const all = (data as FlashCard[]) ?? []
  return shuffle(all).slice(0, SET_SIZE)
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/// Choices for one card in multiple-choice mode: answer + distractors,
/// shuffled. (The client also receives `answer` so it can give instant
/// right/wrong feedback — this is the user's own deck, not an exam.)
export function choicesForCard(card: FlashCard): string[] {
  return shuffle([card.answer, ...card.distractors])
}

// ---------------------------------------------------------------------------
// Judges (Haiku, schema-constrained — same pattern as quiz-grader.ts)

const JUDGE_MODEL = 'claude-haiku-4-5'

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

async function judgeJson<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const res = await anthropic().messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1500,
    system,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: user }],
  })
  const block = res.content.find((b) => b.type === 'text')
  const raw = block?.type === 'text' ? block.text.trim() : ''
  return JSON.parse(raw) as T
}

const VERDICTS_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          correct: { type: 'boolean' },
        },
        required: ['index', 'correct'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdicts'],
  additionalProperties: false,
}

/// Judge typed open-ended answers against each card's canonical answer.
/// Bar: the answer captures the main idea of the canonical answer — wording
/// and detail may differ. Empty answers are wrong without asking the model.
export async function judgeTextAnswers(
  cards: FlashCard[],
  given: (string | null)[],
): Promise<boolean[]> {
  const toJudge = cards
    .map((c, i) => ({ card: c, givenText: (given[i] ?? '').trim(), index: i }))
    .filter((e) => e.givenText.length > 0)
  const out = cards.map(() => false)
  if (toJudge.length === 0) return out

  const listing = toJudge
    .map(
      (e) =>
        `${e.index}. Question: ${e.card.question}\n   Canonical answer: ${e.card.answer}\n   User's answer: ${e.givenText}`,
    )
    .join('\n\n')

  const system = `You grade flash-card answers. For each item, decide whether the user's answer expresses the same idea as the canonical answer. Accept different wording, minor imprecision, and partial detail as long as the core idea is right. Reject answers that are wrong, empty of content, or describe a different concept.`

  const parsed = await judgeJson<{ verdicts: { index: number; correct: boolean }[] }>(
    system,
    `Grade these flash-card answers:\n\n${listing}\n\nReturn a verdict for every item, keyed by its index.`,
    VERDICTS_SCHEMA,
  )
  for (const v of parsed.verdicts ?? []) {
    if (v.index >= 0 && v.index < out.length) out[v.index] = Boolean(v.correct)
  }
  return out
}

type TranscriptTurn = { role?: string; text?: string }

/// Judge a voice flash session: given the card list and the session
/// transcript, decide which questions the user answered correctly.
export async function judgeVoiceSet(
  cards: FlashCard[],
  transcript: TranscriptTurn[],
): Promise<boolean[]> {
  const out = cards.map(() => false)
  const convo = (transcript ?? [])
    .map((t) => `${t.role === 'user' ? 'USER' : 'F2'}: ${(t.text ?? '').trim()}`)
    .filter((l) => l.length > 6)
    .join('\n')
    .slice(0, 30_000)
  if (!convo) return out

  const listing = cards
    .map((c, i) => `${i}. Question: ${c.question}\n   Canonical answer: ${c.answer}`)
    .join('\n\n')

  const system = `You grade a spoken flash-card quiz from its transcript. The assistant (F2) asked the listed questions; the user answered aloud. For each question, decide whether the user's spoken answer expressed the same idea as the canonical answer BEFORE the assistant revealed or corrected it. Accept casual spoken phrasing. If a question was never asked or the user never gave an answer of their own, mark it incorrect.`

  const parsed = await judgeJson<{ verdicts: { index: number; correct: boolean }[] }>(
    system,
    `Questions:\n\n${listing}\n\nTranscript:\n${convo}\n\nReturn a verdict for every question index.`,
    VERDICTS_SCHEMA,
  )
  for (const v of parsed.verdicts ?? []) {
    if (v.index >= 0 && v.index < out.length) out[v.index] = Boolean(v.correct)
  }
  return out
}

export type FinalReviewGrade = {
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  passed: boolean // grade === 'A'
  notes: string
}

/// Grade a Final Review voice session transcript against the topic's source
/// material. Star 3 requires an A: the user demonstrated command of the
/// topic's main ideas AND supporting detail, in their own words.
export async function judgeFinalReview(
  thread: F2Thread,
  transcript: TranscriptTurn[],
): Promise<FinalReviewGrade> {
  const convo = (transcript ?? [])
    .map((t) => `${t.role === 'user' ? 'USER' : 'F2'}: ${(t.text ?? '').trim()}`)
    .filter((l) => l.length > 6)
    .join('\n')
    .slice(0, 40_000)
  const source = buildFullContent(thread).slice(0, 100_000)
  const subject = thread.topic ?? thread.url ?? '(no subject)'

  const system = `You grade a spoken Final Review session for a learning app. The assistant conducted a comprehensive oral review of a topic; the user is trying to demonstrate mastery.

Grade the USER's performance A–F:
- A: commanded the main ideas AND meaningful supporting detail, explained in their own words, few or no real errors. This is a high bar — reserve A for genuinely strong performances.
- B: solid on main ideas, thin or shaky on detail.
- C: got roughly half of it, real gaps or errors.
- D/F: mostly unable to explain the material.

Also write one or two sentences of feedback addressed to the user ("You ...") — what was strong, what to review.`

  const parsed = await judgeJson<{ grade?: string; notes?: string }>(
    system,
    `Topic: ${subject}

Source material (ground truth):
${source || '(no source content — judge against the transcript itself)'}

Session transcript:
${convo || '(empty transcript)'}

Grade the user's performance.`,
    {
      type: 'object',
      properties: {
        grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'] },
        notes: { type: 'string' },
      },
      required: ['grade', 'notes'],
      additionalProperties: false,
    },
  )
  const grade = (['A', 'B', 'C', 'D', 'F'].includes(parsed.grade ?? '')
    ? parsed.grade
    : 'F') as FinalReviewGrade['grade']
  return {
    grade,
    passed: grade === 'A',
    notes: (parsed.notes ?? '').slice(0, 400),
  }
}

// ---------------------------------------------------------------------------
// Recording a completed set: score → XP → (maybe) star 2

/// XP for one completed set. Taking a set always pays something; accuracy
/// pays more; perfection pays a visible bonus.
export function xpForSet(score: number, total: number): number {
  const perfect = total >= SET_SIZE && score === total
  return 20 + 10 * score + (perfect ? 50 : 0)
}

export type RecordedSet = {
  set: FlashSet
  xp_awarded: number
  total_xp: number
  star2_awarded: boolean
  stars: number | null // topic stars after this set (null for jumbo)
  consecutive_high_sets: number // 0..2 progress toward star 2
}

export async function recordFlashSet(input: {
  userId: string
  threadId: string | null
  jumboLevel: number | null
  mode: FlashSetMode
  results: FlashResult[]
}): Promise<RecordedSet> {
  const sb = f2Supabase()
  const score = input.results.filter((r) => r.correct).length
  const total = input.results.length
  const xp = xpForSet(score, total)

  const { data: setRow, error: setErr } = await sb
    .from('f2_flash_sets')
    .insert({
      user_id: input.userId,
      thread_id: input.threadId,
      jumbo_level: input.jumboLevel,
      mode: input.mode,
      score,
      total,
      results: input.results,
      xp,
    })
    .select('*')
    .single()
  if (setErr || !setRow) {
    console.error('[f2/flash] recordFlashSet insert failed:', setErr)
    throw new Error('Could not save the set')
  }

  // XP — read-modify-write is fine for a single-user account.
  const { data: userRow } = await sb
    .from('f2_users')
    .select('xp')
    .eq('id', input.userId)
    .maybeSingle()
  const totalXp = ((userRow?.xp as number) ?? 0) + xp
  await sb.from('f2_users').update({ xp: totalXp }).eq('id', input.userId)

  // Star 2 for topic sets: this set and the previous one both >= 9/10.
  let star2 = false
  let stars: number | null = null
  let consecutive = 0
  if (input.threadId) {
    const isHigh = total >= SET_SIZE && score >= STAR2_SCORE
    const { data: prev } = await sb
      .from('f2_flash_sets')
      .select('score, total')
      .eq('user_id', input.userId)
      .eq('thread_id', input.threadId)
      .neq('id', (setRow as FlashSet).id)
      .order('created_at', { ascending: false })
      .limit(1)
    const prevHigh =
      prev && prev.length > 0 && prev[0].total >= SET_SIZE && prev[0].score >= STAR2_SCORE
    consecutive = isHigh ? (prevHigh ? 2 : 1) : 0

    const { data: threadRow } = await sb
      .from('f2_threads')
      .select('stars')
      .eq('id', input.threadId)
      .eq('user_id', input.userId)
      .maybeSingle()
    const current = (threadRow?.stars as number) ?? 0
    stars = current
    if (isHigh && prevHigh && current < 2) {
      stars = 2
      star2 = true
      await sb
        .from('f2_threads')
        .update({ stars: 2 })
        .eq('id', input.threadId)
        .eq('user_id', input.userId)
    }
  }

  return {
    set: setRow as FlashSet,
    xp_awarded: xp,
    total_xp: totalXp,
    star2_awarded: star2,
    stars,
    consecutive_high_sets: consecutive,
  }
}

/// Award star 3 + the mastered sentinel after a passed Final Review.
export async function awardFinalReviewStar(
  userId: string,
  threadId: string,
): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ stars: 3, hard_quiz_completed_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', userId)
  if (error) console.error('[f2/flash] awardFinalReviewStar failed:', error)
}

// ---------------------------------------------------------------------------
// Set history

export async function listFlashSets(
  userId: string,
  threadId: string,
): Promise<FlashSet[]> {
  const { data, error } = await f2Supabase()
    .from('f2_flash_sets')
    .select('*')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[f2/flash] listFlashSets failed:', error)
    return []
  }
  return (data as FlashSet[]) ?? []
}

// ---------------------------------------------------------------------------
// Jumbo career

export type JumboLevel = {
  level: number
  mode: FlashSetMode
  status: 'locked' | 'unlocked' | 'passed'
  best_score: number | null
  stars: number // 0..3 node stars (7-8 → 1, 9 → 2, 10 → 3)
}

export type JumboState = {
  xp: number
  card_count: number
  highest_passed: number
  levels: JumboLevel[]
}

/// Deterministic mode per Jumbo level. Early levels are approachable
/// multiple choice; typing joins at 5; voice rounds appear from 10 up.
export function jumboLevelMode(level: number): FlashSetMode {
  if (level <= 4) return 'choice'
  if (level <= 9) return level % 2 === 0 ? 'text' : 'choice'
  const cycle = level % 3
  if (cycle === 1) return 'choice'
  if (cycle === 2) return 'text'
  return 'voice'
}

function nodeStars(score: number, total: number): number {
  if (total < SET_SIZE) return 0
  if (score >= total) return 3
  if (score >= STAR2_SCORE) return 2
  if (score >= JUMBO_PASS_SCORE) return 1
  return 0
}

/// The whole career map, derived from set history. Shows every passed level,
/// the next unlocked one, and a few locked previews past it.
export async function getJumboState(userId: string): Promise<JumboState> {
  const sb = f2Supabase()
  const [{ data: userRow }, cardCount, { data: sets, error }] = await Promise.all([
    sb.from('f2_users').select('xp').eq('id', userId).maybeSingle(),
    countFlashCards(userId),
    sb
      .from('f2_flash_sets')
      .select('jumbo_level, score, total')
      .eq('user_id', userId)
      .not('jumbo_level', 'is', null),
  ])
  if (error) console.error('[f2/flash] getJumboState failed:', error)

  const best = new Map<number, { score: number; total: number }>()
  for (const s of (sets ?? []) as { jumbo_level: number; score: number; total: number }[]) {
    const b = best.get(s.jumbo_level)
    if (!b || s.score > b.score) best.set(s.jumbo_level, { score: s.score, total: s.total })
  }

  // Levels pass in order; the map unlocks strictly one past the highest pass.
  let highestPassed = 0
  while (true) {
    const b = best.get(highestPassed + 1)
    if (b && b.total >= SET_SIZE && b.score >= JUMBO_PASS_SCORE) highestPassed++
    else break
  }

  const LOOKAHEAD = 4
  const MIN_MAP = 10
  const top = Math.max(MIN_MAP, highestPassed + 1 + LOOKAHEAD)
  const levels: JumboLevel[] = []
  for (let l = 1; l <= top; l++) {
    const b = best.get(l)
    const passed = l <= highestPassed
    levels.push({
      level: l,
      mode: jumboLevelMode(l),
      status: passed ? 'passed' : l === highestPassed + 1 ? 'unlocked' : 'locked',
      best_score: b?.score ?? null,
      stars: b ? nodeStars(b.score, b.total) : 0,
    })
  }

  return {
    xp: ((userRow?.xp as number) ?? 0),
    card_count: cardCount,
    highest_passed: highestPassed,
    levels,
  }
}
