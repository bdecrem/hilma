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
import { buildFullContent, gatherUserNotes, type F2Thread } from './threads'

/// The user's verdict on a card itself (not on their answer).
///   'down'     — bury it; never serve it in a set again
///   'priority' — resurface hard until mastered, then keep it in rotation
export type CardRating = 'down' | 'priority'

export type FlashCard = {
  id: string
  user_id: string
  thread_id: string
  question: string
  answer: string
  /// Standalone rewording for text/voice modes; null when `question` already
  /// works without the choices visible (the common case).
  open_question: string | null
  distractors: string[]
  created_at: string
  rating: CardRating | null
  rated_at: string | null
  // Exposure history.
  times_shown: number
  last_shown_at: string | null
  // SM-2 scheduling state (see reviewCard below).
  reps: number
  lapses: number
  ease: number
  interval_days: number
  scheduled_days: number
  due_at: string | null
  streak: number
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
export const STAR2_SCORE = 9 // 9/10 on two consecutive full sets → star 2

/// Score needed to clear a Jumbo level, by the mode the set was played in.
/// Voice is the hardest to perform (spoken recall, judged) so it passes at
/// 7; multiple choice has the answers on screen so it demands 9; typed sits
/// between. Any level can be played as an audio round via the Flash tab's
/// mic button, so the threshold follows the SET's mode, not the level's.
export function jumboPassScore(mode: FlashSetMode): number {
  switch (mode) {
    case 'voice': return 7
    case 'text': return 8
    case 'choice': return 9
  }
}

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
  // The audio summary is what the learner actually listened to, and it was
  // itself written to cover their notes point by point — so when one exists
  // it outranks the raw source for deciding WHAT to test.
  const script = (thread.audio_summary?.script ?? '').slice(0, 60_000)
  // Their own notes, straight from the uploads — the strongest signal about
  // what they personally care about.
  const notes = gatherUserNotes(thread).slice(0, 30_000)

  const system = `You write flash cards for a learning app. Given source material and a chat transcript about a topic, produce exactly ${n} flash cards that test real understanding of the most important ideas.

Rules:
- Questions must be answerable in one short phrase or sentence — no essays.
- The canonical answer must be short (a few words to one sentence).
- Each card needs exactly 3 plausible-but-wrong distractors of the same shape
  and length as the answer, so multiple-choice mode isn't guessable by format.
- The deck is also played in typed and voice modes where ONLY the question is
  shown, so questions must stand alone without the choices ("Which of these…"
  fails there). If a card genuinely reads better with choice-dependent
  phrasing in multiple-choice mode, keep it AND supply open_question — an
  equivalent standalone rewording with the exact same canonical answer. Omit
  open_question for every card whose question already stands alone.
- Cover the topic broadly; no two cards should test the same fact.
- No trick questions, no "all of the above".${script ? `

WHAT TO TEST — the learner has an audio summary of this topic, and it is what
they actually listened to. Treat it as the authority on what matters: the deck
should track the summary's coverage and emphasis, and every major idea in it
should be testable from this deck. Use the full source material below to get
facts exactly right and to write good distractors, but do NOT pull in
material the summary passes over.` : ''}${notes ? `

THE LEARNER'S OWN NOTES — what they flagged while reading. These are the
strongest signal about what they care about. Make sure the deck covers the
substance of these points; weight them above equally-important material they
never mentioned. Where a note gets a fact wrong, test the CORRECT fact (and
consider using their mistaken version as a distractor). Where a note asks a
question, the answer is worth a card.
${notes}` : ''}${thread.study_focus ? `

STUDY FOCUS — the learner has only studied part of this material and wants to
be tested ONLY within it. Their instruction:
"${thread.study_focus}"
Every card must come from inside this focus. Skip material outside it, even
if it seems important.` : ''}${styleInstructions ? `

The learner asked for the deck to be built THEIR way — follow this guidance
about the style and mix of cards (it wins over the defaults above where they
conflict, except the format rules about answers and distractors):
${styleInstructions}` : ''}`

  const user = `Topic: ${subject}
${script ? `
Audio summary the learner listened to (the authority on what to test):
${script}
` : ''}
Source material (ground truth for facts and distractors):
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
                  open_question: {
                    type: 'string',
                    description:
                      'ONLY when the question depends on seeing the choices: an equivalent standalone rewording with the same canonical answer.',
                  },
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
    open_question?: string
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
      open_question: c.open_question?.trim() || null,
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

export type FlashDeck = {
  thread_id: string
  topic: string | null
  url: string | null
  kind: string | null
  stars: number
  card_count: number
  priority_count: number
  buried_count: number
}

/// Every topic the user has cards for, newest-touched first — the Flash
/// tab's deck manager. One query per table rather than a join so it uses
/// the same client shape as the rest of this module.
export async function listDecks(userId: string): Promise<FlashDeck[]> {
  const sb = f2Supabase()
  const [{ data: cardRows, error: cardErr }, { data: threadRows }] = await Promise.all([
    sb.from('f2_flash_cards').select('thread_id, rating').eq('user_id', userId),
    sb
      .from('f2_threads')
      .select('id, topic, url, kind, stars, updated_at')
      .eq('user_id', userId),
  ])
  if (cardErr) {
    console.error('[f2/flash] listDecks failed:', cardErr)
    return []
  }

  const counts = new Map<string, { total: number; priority: number; buried: number }>()
  for (const row of (cardRows ?? []) as { thread_id: string; rating: string | null }[]) {
    const c = counts.get(row.thread_id) ?? { total: 0, priority: 0, buried: 0 }
    // Buried cards are excluded from the playable total — the deck manager
    // shows them separately so a bury is visible and reversible.
    if (row.rating === 'down') c.buried++
    else {
      c.total++
      if (row.rating === 'priority') c.priority++
    }
    counts.set(row.thread_id, c)
  }

  const threads = (threadRows ?? []) as {
    id: string
    topic: string | null
    url: string | null
    kind: string | null
    stars: number | null
    updated_at: string
  }[]
  return threads
    .filter((t) => counts.has(t.id))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .map((t) => {
      const c = counts.get(t.id)!
      return {
        thread_id: t.id,
        topic: t.topic,
        url: t.url,
        kind: t.kind,
        stars: t.stars ?? 0,
        card_count: c.total,
        priority_count: c.priority,
        buried_count: c.buried,
      }
    })
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
  patch: {
    question?: string
    answer?: string
    distractors?: string[]
    /** undefined = leave alone; null = clear; 'down' | 'priority' = set. */
    rating?: CardRating | null
  },
): Promise<FlashCard | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.question?.trim()) update.question = patch.question.trim()
  if (patch.answer?.trim()) update.answer = patch.answer.trim()
  if (patch.distractors) {
    update.distractors = patch.distractors.map((d) => d.trim()).filter(Boolean).slice(0, 3)
  }
  if (patch.rating !== undefined) {
    update.rating = patch.rating
    update.rated_at = patch.rating ? new Date().toISOString() : null
    // Promoting a card to priority makes it due immediately — the whole
    // point of the double thumbs up is "show me this one, soon".
    if (patch.rating === 'priority') update.due_at = new Date().toISOString()
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
// Scheduling — Anki-flavored SM-2 (SuperMemo 2), the scheduler Anki ships by
// default. Chosen over FSRS because FSRS without its training optimizer runs
// on population-default parameters, which forfeits most of its edge for 21
// parameters' worth of complexity; and over plain Leitner because Leitner has
// no per-card ease, so a card that's hard *for this user* is scheduled
// exactly like an easy one.
//
// A flash set only knows right or wrong, so answers map onto Anki's buttons
// as correct → Good, wrong → Again.
const EASE_START = 2.5
const EASE_MIN = 1.3
/// SM-2 has no upper bound on ease; we add one so a card the user always gets
/// right can't launch itself years into the future.
const EASE_MAX = 3.0
const EASE_DELTA_AGAIN = -0.2
const EASE_DELTA_GOOD = 0

const FIRST_INTERVAL = 1 // days, on graduating
const SECOND_INTERVAL = 6 // days, SM-2's I(2)
const MIN_LAPSE_INTERVAL = 1
const MAX_INTERVAL = 365
/// ±5% jitter on intervals of 3+ days so cards learned together don't come
/// back forever as a clump.
const FUZZ_PCT = 0.05

/// Anki calls a card "mature" at a 21-day interval; that's our mastery line,
/// plus a floor of consecutive correct answers so one lucky guess can't do it.
export const MASTERY_INTERVAL_DAYS = 21
export const MASTERY_STREAK = 3

/// Priority cards (double thumbs up) come back twice as often as the model
/// says, hard-capped at 3 days until they're genuinely mastered — then they
/// settle onto a monthly maintenance loop rather than disappearing. That
/// last cap is the "still resurface them from time to time" half.
const PRIORITY_FACTOR = 0.5
const PRIORITY_MAX_UNMASTERED = 3
const PRIORITY_MAX_MASTERED = 30
/// Mastered normal cards top out at ~6 months — a small deck should keep
/// everything in circulation.
const NORMAL_MAX_MASTERED = 180

export type CardReview = {
  reps: number
  lapses: number
  ease: number
  interval_days: number
  scheduled_days: number
  due_at: string
  streak: number
}

/// Mastery is judged on the UNCLAMPED model interval. Reading the clamped
/// one would trap priority cards: pinned to 3 days, they could never reach
/// the 21-day bar, so they'd drill aggressively forever.
export function isMastered(card: { interval_days: number; streak: number }): boolean {
  return Number(card.interval_days) >= MASTERY_INTERVAL_DAYS && card.streak >= MASTERY_STREAK
}

/// One SM-2 step. Pure — current state plus right/wrong in, next state out.
/// `now` and `jitter` are injected so the whole thing is testable.
export function reviewCard(
  card: Pick<FlashCard, 'reps' | 'lapses' | 'ease' | 'interval_days' | 'streak' | 'rating'>,
  correct: boolean,
  now: Date = new Date(),
  jitter: number = Math.random(),
): CardReview {
  const ease = clamp(
    Number(card.ease || EASE_START) + (correct ? EASE_DELTA_GOOD : EASE_DELTA_AGAIN),
    EASE_MIN,
    EASE_MAX,
  )

  let reps: number
  let lapses = card.lapses
  let streak: number
  let interval: number

  if (!correct) {
    // A lapse drops the card to the bottom of the ladder — back tomorrow.
    reps = 0
    lapses += 1
    streak = 0
    interval = MIN_LAPSE_INTERVAL
  } else {
    reps = card.reps + 1
    streak = card.streak + 1
    if (reps === 1) interval = FIRST_INTERVAL
    else if (reps === 2) interval = SECOND_INTERVAL
    else interval = Number(card.interval_days) * ease
  }
  interval = Math.min(MAX_INTERVAL, round2(interval))

  // Policy clamps — these shape WHEN the card returns without touching the
  // model interval above, so mastery progress keeps accruing underneath.
  const mastered = isMastered({ interval_days: interval, streak })
  let scheduled = interval
  if (card.rating === 'priority') {
    scheduled = Math.min(
      scheduled * PRIORITY_FACTOR,
      mastered ? PRIORITY_MAX_MASTERED : PRIORITY_MAX_UNMASTERED,
    )
  } else if (mastered) {
    scheduled = Math.min(scheduled, NORMAL_MAX_MASTERED)
  }
  // Fuzz first, then clamp — the other order lets the jitter push a card
  // past the very cap that's meant to keep it in rotation.
  if (scheduled >= 3) {
    scheduled = scheduled * (1 - FUZZ_PCT + jitter * FUZZ_PCT * 2)
  }
  const ceiling =
    card.rating === 'priority'
      ? mastered
        ? PRIORITY_MAX_MASTERED
        : PRIORITY_MAX_UNMASTERED
      : mastered
        ? NORMAL_MAX_MASTERED
        : MAX_INTERVAL
  scheduled = round2(clamp(scheduled, 1, Math.min(ceiling, MAX_INTERVAL)))

  return {
    reps,
    lapses,
    ease: round2(ease),
    interval_days: interval,
    scheduled_days: scheduled,
    due_at: new Date(now.getTime() + scheduled * 86_400_000).toISOString(),
    streak,
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/// Apply one review per answered card. Called from recordFlashSet.
async function applyReviews(
  userId: string,
  cards: FlashCard[],
  correctById: Map<string, boolean>,
  now: Date = new Date(),
): Promise<void> {
  await Promise.all(
    cards.map((card) => {
      const correct = correctById.get(card.id)
      if (correct === undefined) return Promise.resolve()
      const next = reviewCard(card, correct, now)
      return f2Supabase()
        .from('f2_flash_cards')
        .update({ ...next, updated_at: now.toISOString() })
        .eq('id', card.id)
        .eq('user_id', userId)
        .then(({ error }) => {
          if (error) console.error('[f2/flash] applyReviews failed:', error)
        })
    }),
  )
}

/// Record that these cards were served. Separate from the review step —
/// a card can be shown and abandoned, and that still counts as exposure.
export async function markCardsShown(userId: string, cardIds: string[]): Promise<void> {
  if (cardIds.length === 0) return
  const now = new Date().toISOString()
  const { error } = await f2Supabase().rpc('f2_mark_cards_shown', {
    p_user_id: userId,
    p_card_ids: cardIds,
    p_now: now,
  })
  if (error) console.error('[f2/flash] markCardsShown failed:', error)
}

// ---------------------------------------------------------------------------
// Set selection

/// How overdue a card is, in days. Never-reviewed cards sort as brand new
/// (0) so they mix in rather than dominating.
function overdueDays(card: FlashCard, now: number): number {
  if (!card.due_at) return 0
  return (now - new Date(card.due_at).getTime()) / 86_400_000
}

/// Selection weight. Higher = likelier to be picked. Priority cards get a
/// standing multiplier; due cards climb the more overdue they are; mastered
/// cards fall back to an occasional appearance instead of vanishing.
export function cardWeight(card: FlashCard, now: number = Date.now()): number {
  let w = 1
  const overdue = overdueDays(card, now)
  if (card.due_at) {
    // Due today ≈ 3x a not-yet-due card, and it keeps climbing with age.
    w = overdue >= 0 ? 3 + Math.min(12, overdue) : 0.6
  } else {
    // Never reviewed — worth seeing soon, but not ahead of a real backlog.
    w = 2.5
  }
  if (card.rating === 'priority') {
    w *= isMastered(card) ? 2 : 5
  } else if (isMastered(card)) {
    // Learned and not flagged: keep it in the mix, quietly.
    w *= 0.35
  }
  // Cards the user keeps missing deserve another look.
  if (card.lapses > 0) w *= 1 + Math.min(1, card.lapses * 0.15)
  return w
}

/// Weighted sample without replacement — each draw picks proportionally to
/// weight, so scheduling shapes the odds without making sets deterministic.
function weightedSample(cards: FlashCard[], n: number, now: number): FlashCard[] {
  const pool = cards.map((card) => ({ card, weight: cardWeight(card, now) }))
  const out: FlashCard[] = []
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0)
    if (total <= 0) {
      out.push(...shuffle(pool.map((p) => p.card)).slice(0, n - out.length))
      break
    }
    let r = Math.random() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight
      if (r <= 0) {
        idx = i
        break
      }
    }
    out.push(pool[idx].card)
    pool.splice(idx, 1)
  }
  return out
}

/// Pick up to SET_SIZE cards for a set. Topic sets draw from one thread;
/// Jumbo sets draw across every topic the user has cards for. Buried cards
/// (thumbs down) are never served; the rest are sampled by schedule weight.
export async function pickSetCards(
  userId: string,
  threadId: string | null,
): Promise<FlashCard[]> {
  let query = f2Supabase()
    .from('f2_flash_cards')
    .select('*')
    .eq('user_id', userId)
    .or('rating.is.null,rating.eq.priority')
  if (threadId) query = query.eq('thread_id', threadId)
  const { data, error } = await query
  if (error) {
    console.error('[f2/flash] pickSetCards failed:', error)
    return []
  }
  const all = (data as FlashCard[]) ?? []
  // Shuffle first so the presentation order isn't weight order — the user
  // shouldn't be able to read the scheduler off the sequence.
  return shuffle(weightedSample(all, SET_SIZE, Date.now()))
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

/// The question to ask when no choices are on screen (text + voice modes).
/// Most cards read fine as written; open_question exists only for cards
/// whose base question leans on the visible choices ("Which of these…").
export function openFormQuestion(card: FlashCard): string {
  return card.open_question?.trim() || card.question
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
        `${e.index}. Question: ${openFormQuestion(e.card)}\n   Canonical answer: ${e.card.answer}\n   User's answer: ${e.givenText}`,
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
    .map((c, i) => `${i}. Question: ${openFormQuestion(c)}\n   Canonical answer: ${c.answer}`)
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
  strengths: string[]
  weaknesses: string[]
}

/// Fact-check the claims and examples the user brought in from OUTSIDE the
/// source material, so the grader can credit (or debit) them accurately.
/// Uses web search when the claim's validity actually needs checking; returns
/// plain-text verification notes, or null when there was nothing to check.
/// Best-effort: any failure returns null and grading proceeds without notes.
async function verifyOutsideClaims(
  subject: string,
  source: string,
  convo: string,
): Promise<string | null> {
  const res = await anthropic().messages.create({
    model: JUDGE_MODEL,
    max_tokens: 2000,
    system: `You verify claims for an oral-exam grader. Given the exam transcript and the topic's source material, find claims or examples the USER introduced that are NOT covered by the source material and whose accuracy matters for grading. For the most important ones (at most a few), check accuracy — use web search only when you are not confident from your own knowledge. If everything the user said is covered by the source or you can judge it without searching, do not search.

Output short verification notes, one per claim: the claim, a verdict (valid / invalid / unverifiable), and one line of evidence. If there is nothing outside the source worth checking, output exactly: NONE`,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 4,
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Topic: ${subject}

Source material:
${source.slice(0, 60_000) || '(no source)'}

Exam transcript:
${convo}

Produce the verification notes.`,
      },
    ],
  })
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('\n')
    .trim()
  if (!text || text.toUpperCase().startsWith('NONE')) return null
  return text.slice(0, 4000)
}

/// Grade a Final Review voice session transcript against the topic's source
/// material. Star 3 requires an A: the user demonstrated command of the
/// topic's main ideas AND supporting detail, in their own words.
/// The 'second_chance' variant grades the 3-question retake: an A means the
/// three answers together showed A-level command of what was asked.
export async function judgeFinalReview(
  thread: F2Thread,
  transcript: TranscriptTurn[],
  variant: 'full' | 'second_chance' = 'full',
): Promise<FinalReviewGrade> {
  const convo = (transcript ?? [])
    .map((t) => `${t.role === 'user' ? 'USER' : 'F2'}: ${(t.text ?? '').trim()}`)
    .filter((l) => l.length > 6)
    .join('\n')
    .slice(0, 40_000)
  const source = buildFullContent(thread).slice(0, 100_000)
  const subject = thread.topic ?? thread.url ?? '(no subject)'

  // Fact-check user-supplied outside examples (web search) before grading.
  // A failure here must never block the grade itself.
  let verificationNotes: string | null = null
  try {
    verificationNotes = await verifyOutsideClaims(subject, source, convo)
  } catch (e) {
    console.error('[f2/flash] verifyOutsideClaims failed:', e)
  }

  const examShape =
    variant === 'second_chance'
      ? `This was a SECOND CHANCE retake: the assistant asked exactly three substantive questions (after an earlier Final Review fell short). Grade ONLY the user's command of what those three questions covered — the retake is deliberately narrow, so never penalize material the questions didn't touch. An A means all three answers together showed genuine command: main ideas and supporting detail, in their own words.`
      : `The exam is conversational: the user may have chosen the format themselves (for example summarizing the material in parts and discussing each), and the assistant may have offered brief corrections along the way.`

  const system = `You grade a spoken ${variant === 'second_chance' ? 'Second Chance retake' : 'Final Review session'} for a learning app. The assistant conducted an oral exam on a topic; the user is trying to demonstrate mastery. ${examShape}

The user may bring in examples, analogies, or facts from OUTSIDE the source material. That strengthens a performance when the material is valid: judge it on its merits using your own knowledge and the verification notes (when present) — being outside the source is never itself an error. Invalid or wrong outside material counts against the user, like any other error.${thread.study_focus ? `

The user set a STUDY FOCUS — they only studied part of the material and the exam was scoped to it: "${thread.study_focus}". Grade ONLY command of the material inside that focus. Never penalize gaps in material outside it.` : ''}

Grade the USER's performance A–F on what THEY demonstrated:
- A: commanded the main ideas AND meaningful supporting detail, explained in their own words, few or no real errors. This is a high bar — reserve A for genuinely strong performances.
- B: solid on main ideas, thin or shaky on detail.
- C: got roughly half of it, real gaps or errors.
- D/F: mostly unable to explain the material.
Where the assistant corrected the user or supplied something they missed, treat that piece as not demonstrated by the user.

Also produce:
- notes: one or two sentences of feedback addressed to the user ("You ...") — the headline of how it went.
- strengths: up to 5 short phrases naming specific ideas or areas the user clearly commanded. Empty only if nothing stood out.
- weaknesses: up to 5 short phrases naming specific areas to review — gaps, errors, points the assistant had to correct. Be concrete ("the role of X in Y", not "some details").`

  const parsed = await judgeJson<{
    grade?: string
    notes?: string
    strengths?: string[]
    weaknesses?: string[]
  }>(
    system,
    `Topic: ${subject}

Source material (ground truth):
${source || '(no source content — judge against the transcript itself)'}
${verificationNotes ? `
Verification notes on material the user brought in from outside the source (web-checked):
${verificationNotes}
` : ''}
Session transcript:
${convo || '(empty transcript)'}

Grade the user's performance.`,
    {
      type: 'object',
      properties: {
        grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'] },
        notes: { type: 'string' },
        strengths: { type: 'array', items: { type: 'string' } },
        weaknesses: { type: 'array', items: { type: 'string' } },
      },
      required: ['grade', 'notes', 'strengths', 'weaknesses'],
      additionalProperties: false,
    },
  )
  const grade = (['A', 'B', 'C', 'D', 'F'].includes(parsed.grade ?? '')
    ? parsed.grade
    : 'F') as FinalReviewGrade['grade']
  const clip = (items: string[] | undefined) =>
    (items ?? []).filter((s) => s.trim()).slice(0, 5).map((s) => s.trim().slice(0, 200))
  return {
    grade,
    passed: grade === 'A',
    notes: (parsed.notes ?? '').slice(0, 400),
    strengths: clip(parsed.strengths),
    weaknesses: clip(parsed.weaknesses),
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

  // Advance each answered card's schedule (SM-2). Best-effort: a scheduling
  // hiccup must not cost the user the set they just played.
  try {
    const answered = input.results.filter((r) => r.card_id)
    const cards = await getFlashCardsByIds(
      input.userId,
      answered.map((r) => r.card_id),
    )
    await applyReviews(
      input.userId,
      cards,
      new Map(answered.map((r) => [r.card_id, r.correct])),
    )
  } catch (e) {
    console.error('[f2/flash] review scheduling failed:', e)
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

/// Persist a grade onto its voice session row. This is what makes Final
/// Review attempts countable for Second Chance eligibility.
export async function recordVoiceSessionGrade(
  userId: string,
  voiceSessionId: string,
  g: FinalReviewGrade,
): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_voice_sessions')
    .update({
      grade: g.grade,
      graded_at: new Date().toISOString(),
      grade_detail: { notes: g.notes, strengths: g.strengths, weaknesses: g.weaknesses },
    })
    .eq('id', voiceSessionId)
    .eq('user_id', userId)
  if (error) console.error('[f2/flash] recordVoiceSessionGrade failed:', error)
}

export type SecondChanceState = {
  eligible: boolean
  /** ISO timestamp the offer expires (24h after the failed attempt). */
  until: string | null
  /** Weaknesses from the failed attempt — feeds the retake's questions. */
  last_weaknesses: string[]
}

export const SECOND_CHANCE_WINDOW_MS = 24 * 60 * 60 * 1000

/// Second Chance eligibility from graded FULL Final Review history: 2+
/// graded attempts, the latest below A and within the last 24 hours.
/// Second Chance sessions (mode='second_chance') never count as attempts.
/// Callers gate separately on the topic not being mastered yet.
export async function getSecondChanceState(
  userId: string,
  threadId: string,
): Promise<SecondChanceState> {
  const none: SecondChanceState = { eligible: false, until: null, last_weaknesses: [] }
  const { data, error } = await f2Supabase()
    .from('f2_voice_sessions')
    .select('grade, graded_at, grade_detail')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .eq('mode', 'final_review')
    .not('grade', 'is', null)
    .order('graded_at', { ascending: false })
  if (error) {
    console.error('[f2/flash] getSecondChanceState failed:', error)
    return none
  }
  const attempts = (data ?? []) as {
    grade: string
    graded_at: string
    grade_detail: { weaknesses?: string[] } | null
  }[]
  const last = attempts[0]
  if (attempts.length < 2 || !last?.graded_at || last.grade === 'A') return none
  const until = new Date(last.graded_at).getTime() + SECOND_CHANCE_WINDOW_MS
  if (Date.now() > until) return none
  return {
    eligible: true,
    until: new Date(until).toISOString(),
    last_weaknesses: (last.grade_detail?.weaknesses ?? []).filter((w) => w?.trim()),
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
  /** Score that clears this level in its default mode (jumboPassScore).
   *  A voice round of the same level passes at jumboPassScore('voice'). */
  pass_score: number
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
  if (score >= jumboPassScore('voice')) return 1
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
      .select('jumbo_level, score, total, mode')
      .eq('user_id', userId)
      .not('jumbo_level', 'is', null),
  ])
  if (error) console.error('[f2/flash] getJumboState failed:', error)

  const best = new Map<number, { score: number; total: number }>()
  // A level is cleared when ANY full set met the threshold for the mode it
  // was played in — a 7 in a voice round clears what a choice round needs a
  // 9 for.
  const cleared = new Set<number>()
  for (const s of (sets ?? []) as {
    jumbo_level: number
    score: number
    total: number
    mode: FlashSetMode
  }[]) {
    const b = best.get(s.jumbo_level)
    if (!b || s.score > b.score) best.set(s.jumbo_level, { score: s.score, total: s.total })
    if (s.total >= SET_SIZE && s.score >= jumboPassScore(s.mode)) cleared.add(s.jumbo_level)
  }

  // Levels pass in order; the map unlocks strictly one past the highest pass.
  let highestPassed = 0
  while (cleared.has(highestPassed + 1)) highestPassed++

  const LOOKAHEAD = 4
  const MIN_MAP = 10
  const top = Math.max(MIN_MAP, highestPassed + 1 + LOOKAHEAD)
  const levels: JumboLevel[] = []
  for (let l = 1; l <= top; l++) {
    const b = best.get(l)
    const passed = l <= highestPassed
    const mode = jumboLevelMode(l)
    levels.push({
      level: l,
      mode,
      status: passed ? 'passed' : l === highestPassed + 1 ? 'unlocked' : 'locked',
      best_score: b?.score ?? null,
      stars: b ? nodeStars(b.score, b.total) : 0,
      pass_score: jumboPassScore(mode),
    })
  }

  return {
    xp: ((userRow?.xp as number) ?? 0),
    card_count: cardCount,
    highest_passed: highestPassed,
    levels,
  }
}
