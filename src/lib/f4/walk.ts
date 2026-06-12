import { f2Supabase } from '@/lib/f2/supabase'
import { buildFullContent, getThreadById, type F2Thread } from '@/lib/f2/threads'
import { applyReview, dueCards, getCardById, homeData } from '@/lib/f3/cards'

// Peri — the walking voice tutor. A walk session is one Realtime conversation
// the model DJ's end to end: open with the agenda, quiz due ideas
// conversationally, teach short audio lessons from saved sources, close with
// a summary. The agenda is computed here at mint time; the cards themselves
// flow through tools so the prompt stays bounded and the data stays fresh.

const WALK_VOICE = 'cedar'
const MAX_BRIEF_CHARS = 12_000
const MAX_TOPICS_LISTED = 20

// MARK: Agenda

export type WalkAgenda = {
  due_count: number
  card_count: number
  streak_days: number
  topics_line: string
  lesson_line: string
}

// One compact snapshot for the opening lines: how much is due, and which
// topic is the best lesson candidate (weakest with real content, or newest).
export async function walkAgenda(userId: string): Promise<WalkAgenda> {
  const home = await homeData(userId)
  const withCards = home.topics.filter((t) => t.card_count > 0)
  const named = withCards
    .slice(0, 5)
    .map((t) => `"${t.topic ?? 'untitled'}" (${t.due_count} due)`)
    .join(', ')

  const weakest = [...withCards].sort(
    (a, b) => (a.strength ?? 0) - (b.strength ?? 0),
  )[0]
  const newest = home.topics.find((t) => t.card_count === 0)
  const lesson =
    weakest && (weakest.strength ?? 0) < 0.7
      ? `The topic fading most is "${weakest.topic}" — a good lesson candidate.`
      : newest
        ? `"${newest.topic}" was saved but never studied — a good lesson candidate.`
        : 'Nothing is fading badly; pick any topic the user sounds curious about.'

  return {
    due_count: home.due_count,
    card_count: home.card_count,
    streak_days: home.streak_days,
    topics_line: named || '(no topics with idea cards yet)',
    lesson_line: lesson,
  }
}

// MARK: Instructions

export function buildWalkInstructions(input: {
  userName: string
  agenda: WalkAgenda
}): string {
  const name = friendlyName(input.userName)
  const a = input.agenda
  return `You are Peri, a learning companion on a walk with ${name}. They have earbuds in, the phone is in their pocket, and they may be crossing streets, handling a dog, or greeting someone — this is a voice-only, hands-free session. You run the session; they just talk.

Snapshot right now:
- Ideas due for review: ${a.due_count} (of ${a.card_count} total)
- Review streak: ${a.streak_days} day(s)
- Topics with ideas: ${a.topics_line}
- ${a.lesson_line}

THE SESSION ARC
1. OPEN: Speak first. One warm sentence with the agenda (how many ideas due, what you could teach after) and ask whether to start with review. Don't lecture about the app.
2. REVIEW: Call get_due_cards once, then work through the cards conversationally, one at a time. Ask the question naturally in your own words — never read it like a form. Listen to their answer:
   - Got the core idea → confirm in one tight sentence, add one detail they missed if it matters, call record_review with grade 2, move on.
   - Close but missing substance → one short probe ("And why does that work?"). If they get there, grade 2; if not, give the missing piece kindly and grade 1.
   - Blank or wrong → tell them the idea in one or two sentences, grade 0, move on without ceremony.
   Always call record_review exactly once per card before moving to the next. Be honest with grades — a generous grade means they forget the idea for real.
3. LESSON: When the review is done (or they ask), offer a short lesson. Call get_topic_brief, then teach for two to three minutes: a hook, three clear beats, a one-line recap. Talk like a sharp friend on a walk, not a podcast intro. They will interrupt — that's good. Answer, then ask if they want you to pick up the thread.
4. CLOSE: When they say they're done (or everything's reviewed and they decline a lesson), give a one-sentence summary of the walk — what they nailed, what's shaky — and say goodbye briefly.

VOICE RULES — these matter more than anything:
- Short sentences. One idea per turn. Never enumerate ("first... second... third") — just talk.
- One question at a time, then actually stop and wait.
- Long pauses are normal on a walk. Don't fill silence; don't repeat the question unless asked.
- If they say something unrelated (the dog, the weather), respond like a human, briefly, then offer to pick up where you left off.
- Never mention tools, cards, grades, the app, or "the system". The review should feel like a conversation, not a flashcard drill.
- If they ask to skip something, skip it without comment.
- Audio only: no markdown, no spelled-out URLs, no formatting.`
}

// Topic-scoped voice: the user hopped into voice from one topic in Loci.
// Same Peri persona and tools, but the conversation orbits this topic —
// discuss it, go deeper, and quiz its due ideas when the user is game.
export function buildTopicVoiceInstructions(input: {
  userName: string
  thread: F2Thread
  dueCount: number
}): string {
  const name = friendlyName(input.userName)
  const subject = input.thread.topic ?? input.thread.url ?? 'this topic'
  const brief = buildFullContent(input.thread).slice(0, 8000)
  return `You are Peri, a learning companion in a live voice conversation with ${name}. They have earbuds in and just opened voice mode from one of their saved topics — this session is about that topic.

The topic: "${subject}"
Ideas due for review on it right now: ${input.dueCount}

${brief ? `Source material (bounded excerpt):\n${brief}` : '(No source text saved — work from the conversation and what you know.)'}

HOW TO RUN IT
- Open with ONE short sentence: name the topic, and offer either to talk it through or${input.dueCount > 0 ? ` review the ${input.dueCount} idea(s) due on it` : ' go deeper on any part of it'}. Then wait.
- Discussion: answer from the source material first; reason beyond it when asked, and say when you are. Short turns, one idea at a time.
- Review (if they want it): call get_due_cards with this topic's thread_id, then quiz conversationally — ask in your own words, listen, probe once if close, then call record_review with an honest grade (2 core idea, 1 gist only, 0 missed) exactly once per card.
- When they're done, one-sentence wrap and goodbye.

VOICE RULES
- Short sentences, no enumerated lists, one question at a time, then stop and wait.
- Long pauses are normal. Don't fill silence.
- Never mention tools, cards, grades, or the app. No markdown — audio only.

Thread id for tool calls: ${input.thread.id}`
}

// MARK: Tool catalog

export function walkTools() {
  return [
    {
      type: 'function',
      name: 'get_due_cards',
      description:
        'Fetch the ideas due for review right now, including the canonical answer to evaluate against. Call once at the start of review.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Max cards to fetch (default 10).',
          },
          thread_id: {
            type: 'string',
            description: 'Optional: only fetch cards for this one topic.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'record_review',
      description:
        "Record the outcome of one reviewed idea. Call exactly once per card after you've heard the user's answer. Grade honestly: 2 = they expressed the core idea, 1 = gist but missing substance, 0 = blank or wrong.",
      parameters: {
        type: 'object',
        properties: {
          card_id: { type: 'string', description: 'The card_id from get_due_cards.' },
          grade: {
            type: 'number',
            description: '0 forgot, 1 shaky, 2 solid.',
          },
          user_answer_summary: {
            type: 'string',
            description: "One sentence summarizing what the user said, for the review log.",
          },
        },
        required: ['card_id', 'grade', 'user_answer_summary'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'get_topic_brief',
      description:
        'Fetch the source material for one topic to teach a short lesson from. Returns a bounded excerpt plus the ideas already saved for it.',
      parameters: {
        type: 'object',
        properties: {
          thread_id: { type: 'string', description: 'The topic id from list_topics or the agenda.' },
        },
        required: ['thread_id'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'list_topics',
      description:
        "List the user's topics with idea counts, due counts, and memory strength (0-1). Use when choosing what to review or teach.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  ]
}

export function walkVoice(): string {
  return process.env.OPENAI_WALK_VOICE || WALK_VOICE
}

// MARK: Tool handlers — every one derives user from the authed session;
// the model never supplies user identity.

export async function handleWalkTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'get_due_cards': {
      const limit = clampInt(args.limit, 1, 20, 10)
      const threadId = typeof args.thread_id === 'string' && args.thread_id ? args.thread_id : undefined
      const cards = await dueCards(userId, limit, new Date(), threadId)
      return {
        cards: cards.map((c) => ({
          card_id: c.id,
          topic: c.topic,
          prompt: c.prompt,
          answer: c.answer,
          state: c.state,
          lapses: c.lapses,
        })),
      }
    }

    case 'record_review': {
      const cardId = String(args.card_id ?? '')
      const grade = clampInt(args.grade, 0, 2, NaN)
      if (!cardId || Number.isNaN(grade)) {
        throw new WalkToolError('record_review needs card_id and grade 0-2')
      }
      const card = await getCardById(userId, cardId)
      if (!card || card.suspended) {
        throw new WalkToolError('card not found')
      }
      const summary = String(args.user_answer_summary ?? '').slice(0, 500)
      const outcome = await applyReview({
        userId,
        card,
        grade: grade as 0 | 1 | 2,
        userAnswer: summary,
        gradedBy: 'llm',
        feedback: null,
      })
      if (!outcome) throw new WalkToolError('failed to record review')
      const remaining = await dueCards(userId, 1)
      return {
        recorded: true,
        next_due_in_days: Math.round(outcome.interval_days * 10) / 10,
        more_cards_due: remaining.length > 0,
      }
    }

    case 'get_topic_brief': {
      const threadId = String(args.thread_id ?? '')
      if (!threadId) throw new WalkToolError('get_topic_brief needs thread_id')
      const thread = await getThreadById(userId, threadId)
      if (!thread) throw new WalkToolError('topic not found')
      const { data } = await f2Supabase()
        .from('f3_cards')
        .select('prompt')
        .eq('user_id', userId)
        .eq('thread_id', threadId)
        .eq('suspended', false)
      return {
        thread_id: thread.id,
        topic: thread.topic,
        url: thread.url,
        content: buildFullContent(thread).slice(0, MAX_BRIEF_CHARS),
        existing_idea_prompts: ((data as { prompt: string }[]) ?? []).map((c) => c.prompt),
      }
    }

    case 'list_topics': {
      const home = await homeData(userId)
      return {
        topics: home.topics.slice(0, MAX_TOPICS_LISTED).map((t) => ({
          thread_id: t.id,
          topic: t.topic,
          card_count: t.card_count,
          due_count: t.due_count,
          strength: t.strength === null ? null : Math.round(t.strength * 100) / 100,
        })),
      }
    }

    default:
      throw new WalkToolError(`unknown tool: ${name}`)
  }
}

export class WalkToolError extends Error {}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

function friendlyName(userName: string): string {
  const trimmed = userName.trim()
  if (!trimmed) return 'there'
  const local = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
  const cleaned = local.replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim()
  if (!cleaned) return local
  return cleaned
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}
