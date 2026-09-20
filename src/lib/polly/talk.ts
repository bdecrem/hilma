// The text chat — one thread, no modes (Direction 2b, docs/polly-infinity-2b.md).
//
// The client never says what a typed turn is. The server reads it:
//   practice     the learner is having the conversation — in the studied
//                language, or reaching for it ("I went to the… palestra?").
//                Polly answers in that language at their level, keeps it going
//                with one question, and folds AT MOST one fix under her reply.
//   question     English, about the language or the material. Answered in
//                English in a sentence or two; then Polly picks the thread up.
//   instruction  English, "do this" — the content agent (agent.ts) does it,
//                says so in two sentences, the app draws a card; then Polly
//                picks the thread up.
// A leading "Polly, …" forces the agent. The reply carries the lane so the
// client can style it. Check: scripts/polly/lanes-check.ts.

import Anthropic from '@anthropic-ai/sdk'
import { runPollyAgent, type AgentCard } from './agent'
import { activeLanguage, LANGUAGES, type LanguageCode } from './language'
import { ensureLesson, lessonBlock } from './lesson'
import { llmComplete, type LlmTool } from './llm'
import { activeCourse } from './path'
import { buildBudgetedContent, getThreadById, type PollyThread } from './threads'

export type Lane = 'practice' | 'agent'
export type Intent = 'practice' | 'question' | 'instruction'

/// The one fix Polly folds under a practice reply.
export type TalkFix = {
  /** What the learner wrote, the slip only. */
  said: string
  /** The right form, as short as the slip. */
  better: string
  /** Why, in a few plain English words. */
  why: string
}

export type TalkTurn = {
  role: 'user' | 'assistant'
  text: string
  lane?: Lane
  fix?: TalkFix | null
  card?: AgentCard | null
}

export type TalkResult = {
  lane: Lane
  intent: Intent
  /** Polly's turns, in order: a practice reply; or the agent's answer (with
   *  its card) followed by the line that resumes the conversation. */
  messages: TalkTurn[]
  thread_id?: string
  write_document?: { thread_id: string; title: string; brief: string }
}

const PRACTICE_MODEL = process.env.POLLY_TALK_MODEL || 'sonnet-5'
const CLASSIFIER_MODEL = process.env.POLLY_LANE_MODEL || 'claude-haiku-4-5'
/// How much of the conversation each call sees.
const HISTORY_TURNS = 24
/// Source material inlined into a practice / question prompt (the voice
/// mode's excerpt size).
const MATERIAL_CHARS = 24_000

// ---------- the lane ----------

/// Words that only turn up when someone is writing English. Kept clear of
/// Italian and French homographs ("come", "a", "i", "me", "no", "do", "on",
/// "son") — a message with none of them skips the classifier call.
const ENGLISH_MARKERS = new Set([
  'the', 'what', 'whats', "what's", 'how', 'does', 'did', 'mean', 'means', 'make', 'give', 'show', 'please',
  'can', 'could', 'would', 'should', 'you', 'your', 'my', 'from', 'with', 'this', 'that', 'these', 'those',
  'card', 'cards', 'and', 'is', 'are', 'was', 'were', 'why', 'when', 'where', 'which', 'of', 'to', 'for',
  'it', 'its', "it's", 'about', 'say', 'word', 'words', 'want', 'know', "don't", 'dont', 'went', 'have',
  'not', 'but', 'like', 'there', 'they', 'we', 'will', 'just', 'any', 'all', 'explain', 'difference', 'between',
  'rename', 'delete', 'add', 'list', 'quiz', 'test', 'remind', 'tell', 'i', "i'm", 'im',
  'takes', 'needs', 'uses', 'because', 'here', 'masculine', 'feminine', 'plural', 'past', 'verb', 'ending',
])

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}']+/gu) ?? []
}

/// True when nothing in the text reads as English. "I" counts only as a
/// capital (the Italian article "i" is lowercase).
export function looksLikeNoEnglish(text: string): boolean {
  const hasCapitalI = /(^|[^\p{L}])I([^\p{L}]|$)/u.test(text)
  if (hasCapitalI) return false
  return !tokens(text).some((t) => t !== 'i' && ENGLISH_MARKERS.has(t))
}

const FORCE_AGENT = /^polly\b[\s:,;.\-—!]*/i

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
    _anthropic = new Anthropic({ apiKey })
  }
  return _anthropic
}

/// Which lane a typed turn belongs to. Pure rules first (no call): the
/// "Polly, …" prefix, then text with no English in it. Everything else is one
/// Haiku call that sees Polly's last line, because "I went to the gym" is an
/// answer when she just asked about your day and nothing at all when she
/// didn't.
export async function classifyTurn(input: {
  text: string
  language: LanguageCode | null
  lastPolly?: string | null
}): Promise<{ intent: Intent; forced: boolean; by: 'prefix' | 'rule' | 'classifier' }> {
  const text = input.text.trim()
  if (FORCE_AGENT.test(text)) return { intent: 'instruction', forced: true, by: 'prefix' }
  if (looksLikeNoEnglish(text)) return { intent: 'practice', forced: false, by: 'rule' }

  const lang = input.language ? LANGUAGES[input.language].name : 'the language they are learning'
  const res = await anthropic().messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 6,
    system: `A learner of ${lang} (their own language is English) is in a text chat with Polly, their tutor, who is holding a conversation with them in ${lang}. Classify the learner's new message. Reply with exactly one word.

PRACTICE — the learner is taking part in the conversation: answering Polly, telling her something, asking HER something as a conversation partner. It counts even when it is partly or wholly in English, mixes the two, trails off, or asks in passing for one word they are missing ("I went to the… palestra?", "ieri ho… how do you say tired", "I don't know how to say it, I went to the mountains"). A beginner answering Polly's question in English is still PRACTICE.
QUESTION — the learner has stepped out of the conversation to ask about the language or the material, in English: what something means, why a form is what it is, the difference between two words, how something is pronounced or used.
INSTRUCTION — the learner is telling the app to do something: make, add, redo or delete flash cards, rename, list or summarise their chats or topics, change a setting, quiz them, save a quote, show their weak spots.

When unsure between PRACTICE and the other two, choose PRACTICE.`,
    messages: [{
      role: 'user',
      content: `Polly's last message: ${input.lastPolly?.trim() ? input.lastPolly.trim().slice(0, 600) : '(none yet)'}\n\nThe learner's new message: ${text.slice(0, 1000)}`,
    }],
  })
  const word = (res.content.find((b) => b.type === 'text')?.text ?? '').trim().toUpperCase()
  const intent: Intent = word.startsWith('INSTRUCTION') ? 'instruction' : word.startsWith('QUESTION') ? 'question' : 'practice'
  return { intent, forced: false, by: 'classifier' }
}

// ---------- what the conversation is about ----------

type Frame = {
  languageName: string
  level: string
  /** What this chat is for, in the prompt's words. */
  about: string
  /** Lesson plan / source excerpt, or ''. */
  material: string
}

function frameFor(thread: PollyThread | null, language: LanguageCode | null, level: string | null): Frame {
  const languageName = language ? LANGUAGES[language].name : 'the language they are learning'
  const lvl = level ?? 'unknown — treat them as a beginner until they show otherwise'
  if (thread?.lesson && thread.kind === 'lesson') {
    return {
      languageName, level: thread.lesson.level ?? lvl,
      about: `This chat is the scene from a lesson you wrote for them: you play the other person, they play "You". Follow the model conversation's shape, not its lines; work the lesson's words in; when the scene has run, change one detail and run it again, then ask the closing question.`,
      material: lessonBlock(thread),
    }
  }
  if (thread?.lesson) {
    return {
      languageName, level: lvl,
      about: `This chat is about a ${languageName} lesson they listened to (a guest lesson). Get them to retell the story in their own words, then work the teacher's key words in one at a time — ask them to use one, or what it meant in the story — and end on the host's closing question.`,
      material: lessonBlock(thread),
    }
  }
  const material = thread && thread.kind !== 'infinity' ? buildBudgetedContent(thread, MATERIAL_CHARS) : ''
  if (material) {
    return {
      languageName, level: lvl,
      about: `This chat is about "${thread?.topic ?? 'their material'}" — something they are reading, watching or studying in ${languageName}. Talk about it with them: what happened, what they thought, what a line meant. Stay on it unless they take the conversation elsewhere.`,
      material: `THE MATERIAL (excerpt):\n${material}`,
    }
  }
  return {
    languageName, level: lvl,
    about: `This is an open conversation (Infinity Chat): how their day went, what they are up to, whatever they bring. Follow what they say, be curious, react like a person.`,
    material: '',
  }
}

function transcript(history: TalkTurn[]): string {
  return history.slice(-HISTORY_TURNS).map((t) => `${t.role === 'user' ? 'Learner' : 'Polly'}: ${t.text}`).join('\n')
}

/// Polly's last line of the conversation itself (not an agent answer).
function lastPractice(history: TalkTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const t = history[i]
    if (t.role === 'assistant' && t.lane !== 'agent') return t.text
  }
  return null
}

// ---------- the practice lane ----------

const REPLY_TOOL: LlmTool = {
  name: 'reply',
  description: "Polly's next line in the conversation, and the one slip worth fixing, if any.",
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'Your line, in the studied language only. One to three short sentences that react to what they said and end on ONE question that keeps the conversation going.' },
      fix: {
        type: ['object', 'null'],
        description: 'The single most useful slip in their LAST message, or null when it was fine, was in English, or was only a typo/accent. Never more than one.',
        properties: {
          said: { type: 'string', description: 'The slip copied exactly from their NEW message — two to four words, never the whole sentence. If a whole sentence is in the wrong tense, quote its verb only.' },
          better: { type: 'string', description: 'The right form, as short as the slip.' },
          why: { type: 'string', description: 'Why — ALWAYS IN ENGLISH, eight words or fewer ("andare takes essere", "sushi is masculine"). No grammar jargon beyond what a beginner knows.' },
        },
        required: ['said', 'better', 'why'],
      },
    },
    required: ['reply', 'fix'],
  },
}

function practiceSystem(f: Frame, name: string): string {
  return `You are Polly, a warm, quick ${f.languageName} conversation partner for ${name}, whose own language is English. Their level: ${f.level}. You are texting with them.

${f.about}

How you write:
- In ${f.languageName} only, at their level or a touch above: short sentences, common words. A beginner gets five-to-eight-word sentences in the present tense.
- React to what they actually said, like a person would, then ask ONE question. Never two. No lists, no lessons, no praise for its own sake.
- If they wrote in English or reached for a word ("I went to the… palestra?"), take what they meant and answer in ${f.languageName}, putting the ${f.languageName} they were missing into your own reply so they see it used. Do not switch to English.
- Corrections never go in your reply. If their last message had a real slip — a wrong form, agreement, auxiliary, preposition or word — put the single most useful one in "fix". One at most, and only from the message they just sent — never a slip from earlier in the conversation, even if it was never fixed. Nothing for typos, missing accents, capitals or punctuation; nothing when they wrote English; nothing when it was fine. The proper teaching happens later, in the clean-up; here it is a whisper.${f.material ? `\n\n${f.material}` : ''}`
}

async function practiceReply(f: Frame, name: string, history: TalkTurn[], text: string | null): Promise<TalkTurn> {
  const convo = transcript(history)
  const user = text === null
    ? `${convo ? `The conversation so far:\n${convo}\n\n` : ''}Open the conversation: a short hello and one easy question. ("fix" is null.)`
    : `${convo ? `The conversation so far:\n${convo}\n\n` : ''}Their new message:\n${text}`
  const res = await llmComplete({
    model: PRACTICE_MODEL,
    system: practiceSystem(f, name),
    messages: [{ role: 'user', content: user }],
    maxTokens: 500,
    tools: [REPLY_TOOL],
    forceTool: true,
    noThinking: true,
  })
  if (res.type !== 'tool_call') throw new Error('practice reply came back as text')
  const reply = String(res.input.reply ?? '').trim()
  if (!reply) throw new Error('practice reply was empty')
  const raw = res.input.fix as Partial<TalkFix> | null | undefined
  const fix = raw && raw.said && raw.better
    ? { said: String(raw.said).trim(), better: String(raw.better).trim(), why: String(raw.why ?? '').trim() }
    : null
  // A fix belongs to the message it is folded under: drop one whose slip is
  // not in what they just wrote (the model reaching back for an old one).
  const mine = fix && text !== null && squash(text).includes(squash(fix.said)) && squash(fix.said) !== squash(fix.better)
  return { role: 'assistant', text: reply, lane: 'practice', fix: mine ? fix : null }
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[…."“”«»!?,;:]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// ---------- the agent lane ----------

/// An English question, answered in English — short, with the studied
/// language in it when that is the answer.
async function answerQuestion(f: Frame, history: TalkTurn[], text: string): Promise<string> {
  const res = await llmComplete({
    model: PRACTICE_MODEL,
    system: `You are Polly, a ${f.languageName} tutor. The learner (English speaker, level: ${f.level}) has stepped out of a ${f.languageName} text conversation with you to ask a question in English. Answer it in English in ONE or TWO short sentences, forty words at most, plain text with no markdown: the answer itself, with the ${f.languageName} word or form in it and, when it helps, one tiny example. No lists, no headings, no "great question", and do not continue the conversation — that happens right after you. If the material below answers it (a word the teacher taught, a line from the story), say so.${f.material ? `\n\n${f.material}` : ''}`,
    messages: [{ role: 'user', content: `${transcript(history) ? `The conversation so far:\n${transcript(history)}\n\n` : ''}Their question:\n${text}` }],
    maxTokens: 300,
    noThinking: true,
  })
  if (res.type !== 'text' || !res.text.trim()) throw new Error('question answer was empty')
  return res.text.trim().replace(/\*\*/g, '')
}

/// The line that picks the conversation back up after the agent: Polly's
/// last question again, reworded a little, never a new subject.
async function resumeLine(f: Frame, name: string, history: TalkTurn[]): Promise<string> {
  const last = lastPractice(history)
  const res = await llmComplete({
    model: PRACTICE_MODEL,
    system: `You are Polly, texting in ${f.languageName} with ${name} (level: ${f.level}). ${f.about}

They just stepped out of the conversation to ask you for something, and that has been dealt with. Write the ONE short line, in ${f.languageName} only, that picks the conversation back up: ${last ? 'your last question again, reworded a little ("Allora — …"), not a new subject' : 'a short hello and one easy question to start it'}. No English, no mention of what they asked for. Just the line.${f.material ? `\n\n${f.material}` : ''}`,
    messages: [{ role: 'user', content: last ? `The conversation so far:\n${transcript(history.filter((t) => t.lane !== 'agent'))}\n\nYour last line was: ${last}` : 'The conversation has not started yet.' }],
    maxTokens: 120,
    noThinking: true,
  })
  if (res.type !== 'text' || !res.text.trim()) throw new Error('resume line was empty')
  return res.text.trim().replace(/^["“]|["”]$/g, '')
}

// ---------- one turn ----------

export async function talkTurn(input: {
  userId: string
  userName: string
  threadId?: string
  /** The text chat so far, oldest first (the client's copy until step 2
   *  stores it server-side). */
  history: TalkTurn[]
  /** The learner's message; null asks Polly to open the conversation. */
  text: string | null
  model?: string
}): Promise<TalkResult> {
  const [language, course, rawThread] = await Promise.all([
    activeLanguage(input.userId),
    activeCourse(input.userId),
    input.threadId ? getThreadById(input.userId, input.threadId) : Promise.resolve(null),
  ])
  if (input.threadId && !rawThread) throw new Error('topic not found')
  const thread = rawThread ? await ensureLesson(rawThread) : null
  const f = frameFor(thread, language, course?.level ?? null)
  const history = input.history.slice(-HISTORY_TURNS * 2)

  if (input.text === null) {
    return { lane: 'practice', intent: 'practice', messages: [await practiceReply(f, input.userName, history, null)], thread_id: thread?.id }
  }

  const text = input.text.trim()
  const { intent } = await classifyTurn({ text, language, lastPolly: lastPractice(history) })

  if (intent === 'practice') {
    return { lane: 'practice', intent, messages: [await practiceReply(f, input.userName, history, text)], thread_id: thread?.id }
  }

  // The agent's work and the line that resumes the conversation don't depend
  // on each other — run them together so the resume costs no extra wait.
  const resume = resumeLine(f, input.userName, history)
  if (intent === 'question') {
    const [answer, line] = await Promise.all([answerQuestion(f, history, text), resume])
    return {
      lane: 'agent', intent,
      messages: [
        { role: 'assistant', text: answer, lane: 'agent' },
        { role: 'assistant', text: line, lane: 'practice' },
      ],
      thread_id: thread?.id,
    }
  }

  const instruction = text.replace(FORCE_AGENT, '').trim() || text
  const [agent, line] = await Promise.all([
    runPollyAgent({
      userId: input.userId,
      threadId: thread?.id,
      originalText: text,
      instruction,
      model: input.model,
      brief: true,
      persist: false,
      recentChat: transcript(history),
    }),
    resume,
  ])
  // Several card tools in one go read as one deck when they landed in one topic.
  const card = mergeCards(agent.made)
  return {
    lane: 'agent', intent,
    messages: [
      { role: 'assistant', text: agent.reply.replace(/^Polly:\s*/i, ''), lane: 'agent', card },
      { role: 'assistant', text: line, lane: 'practice' },
    ],
    thread_id: thread?.id,
    ...(agent.write_document ? { write_document: agent.write_document } : {}),
  }
}

function mergeCards(made: AgentCard[]): AgentCard | null {
  if (made.length === 0) return null
  const first = made[0]
  const same = made.filter((m) => m.thread_id === first.thread_id)
  return { ...first, count: same.reduce((n, m) => n + m.count, 0) }
}
