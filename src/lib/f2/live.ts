// GPT-Live (gpt-live-1) sessions for Dodo's voice surfaces — Talk to Dodo
// (global / topic), flash rounds, the Final Review, the Second Chance and the
// recert refresher. Replaced the Realtime (gpt-realtime-2.1) implementation
// on 2026-09-11. Peri's walks (src/lib/f4) still run on Realtime.
//
// Shape of a Live session (see docs/f2-gpt-live-reference.md):
// - The LIVE model owns the conversation: it listens and speaks at once,
//   handles interruptions itself, and gets a SHORT conversation prompt
//   (`session.instructions`, ≤16,384 tokens) — personality, the exam or
//   round script, an excerpt of the material, and a delegation policy.
// - A RESPONSES backend (`delegation.responses`) gets the FULL topic
//   material in its own prompt. The live model delegates to it when it
//   needs a detail the excerpt lacks or careful reasoning. No function
//   tools: the client never runs a tool loop any more.
// - WebRTC: the phone's SDP offer goes through our server to
//   POST /v1/live/sessions (there are no ephemeral client secrets for Live).
import {
  buildFullContent,
  type F2Thread,
  type F2ThreadMessage,
} from './threads'
import { type RealtimeMode } from './realtime'

const DEFAULT_LIVE_MODEL = 'gpt-live-1'
const DEFAULT_BACKEND_MODEL = 'gpt-5.6-luna'
const DEFAULT_BACKEND_REASONING = 'low'

/// The live prompt must stay under 16,384 tokens. The excerpt is the bulk
/// of it; the backend prompt carries the whole material, so the live model
/// can always delegate for what the excerpt leaves out.
const MAX_LIVE_EXCERPT_CHARS = 24_000
const MAX_LIVE_INSTRUCTION_CHARS = 52_000 // ≈ 13-15K tokens, safety trim
const MAX_BACKEND_CONTENT_CHARS = 120_000
const MAX_RECENT_MESSAGES = 10

export function liveModel(): string {
  return process.env.OPENAI_LIVE_MODEL || DEFAULT_LIVE_MODEL
}

export function liveBackendModel(): string {
  return process.env.OPENAI_LIVE_BACKEND_MODEL || DEFAULT_BACKEND_MODEL
}

export function liveBackendReasoning(): string {
  return process.env.OPENAI_LIVE_BACKEND_REASONING || DEFAULT_BACKEND_REASONING
}

function openaiApiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  return key
}

/// Pull a friendly first-name out of whatever the username happens to be.
export function friendlyName(userName: string): string {
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

function formatMessages(messages: F2ThreadMessage[]): string {
  return messages
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
    .slice(0, 4000)
}

function threadSubject(thread: F2Thread): string {
  return thread.topic || thread.url || 'Untitled topic'
}

/// The topic block for the LIVE prompt: metadata, recent chat, an excerpt.
function summarizeThreadForLive(thread: F2Thread): string {
  const fullContent = buildFullContent(thread)
  const excerpt = fullContent.slice(0, MAX_LIVE_EXCERPT_CHARS)
  const truncated = fullContent.length > excerpt.length
  const source = excerpt
    ? `\n\nSource excerpt${truncated ? ' (the backend has the complete material)' : ''}:\n${excerpt}`
    : ''
  const recent = formatMessages(thread.messages.slice(-MAX_RECENT_MESSAGES))
  return `Current topic:
Title: ${threadSubject(thread)}
URL: ${thread.url ?? 'none'}
Quiz count: ${thread.quiz_count}
Last quizzed: ${thread.last_quizzed_at ?? 'never'}
Recent messages:
${recent || '(none)'}${source}`
}

function studyFocusBlock(name: string, thread: F2Thread, verb: string): string {
  if (!thread.study_focus) return ''
  return `

STUDY FOCUS: ${name} has only studied part of this material and asked to be ${verb} ONLY on it: "${thread.study_focus}". Everything you ask must stay inside that focus — never probe material outside it.`
}

// ---------------------------------------------------------------------------
// Live (conversation) prompts — per the GPT-Live prompting guide: role +
// style, a backchannel policy, an interruption policy, the script, and a
// delegation policy with the three labels. Keep the labels verbatim.
// ---------------------------------------------------------------------------

const PERSONA = (name: string) =>
  `You are Dodo, a learning companion, in a live voice conversation with ${name}. Address them by their first name when it feels natural — not in every sentence.
Speak directly, warmly and naturally, at an unhurried pace. Be clear, not overly cheerful. Ask one question at a time. Never mention tools, backends, or implementation details.

Backchannel policy: Use moderate backchannels. Acknowledge naturally without competing with the main response.

Interruption policy: Stop speaking when ${name} interrupts. Listen to what they say.`

const HOLD_TO_TALK_NOTE = (name: string) =>
  `

${name} uses a push-to-talk button: you only hear them while they hold it, and their microphone is muted the rest of the time. Silence never means they have nothing to say — wait for them. When their audio starts mid-sentence of yours, stop and listen.`

function topicDelegationPolicy(name: string): string {
  return `

Delegation policy:
Backend tools:
- Topic material: the backend holds the COMPLETE saved material for this topic (much more than the excerpt above) and can look up a detail, quote a passage, verify a claim, or reason carefully about it.

Delegate to the backend when:
- The question needs a detail, passage, or fact beyond the excerpt above.
- ${name} asks for a careful explanation, comparison, or step-by-step reasoning.
- ${name} asks what the material says about something specific.

Do not delegate to the backend when:
- You can answer from the excerpt above or from the conversation.
- You only need a brief clarification of what ${name} meant.
- It is small talk or a quick acknowledgment.

Delegate before giving an answer that depends on backend work. Do not guess the result while waiting; keep the conversation natural.`
}

function examDelegationPolicy(name: string): string {
  return `

Delegation policy:
Backend tools:
- Source check: the backend holds the COMPLETE material for this topic (more than the excerpt above) and can verify a claim, find a detail, or supply a sharper question from a part of the material you don't have.

Delegate to the backend when:
- You need a detail that is not in the excerpt above to ask a good question.
- ${name} makes a specific factual claim you cannot verify from the excerpt and its accuracy matters for the grade.

Do not delegate to the backend when:
- The excerpt above already covers it.
- You only need a brief clarification of what ${name} meant.
- You are giving brief feedback, moving to the next question, or wrapping up.

Delegate before giving feedback that depends on backend work. Do not guess the result while waiting; keep the exam moving naturally.`
}

export function buildLiveTalkInstructions(input: {
  mode: 'global' | 'topic'
  userName: string
  thread?: F2Thread | null
}): string {
  const name = friendlyName(input.userName)
  const base = `${PERSONA(name)}

Keep answers conversational — usually 30 to 90 seconds unless ${name} asks for more. When teaching, help them understand the idea, not just memorize facts. Never pretend you have read source text that has not been provided; if you are unsure, say what you can infer and ask whether to go deeper.`

  if (input.mode === 'topic' && input.thread) {
    return `${base}

You are in topic voice mode. Treat this topic as the default referent for "this", "it", "the article", "the topic", or "what I saved".

${summarizeThreadForLive(input.thread)}${topicDelegationPolicy(name)}`
  }

  return `${base}

You are in global voice mode: ${name} has no particular topic open and may ask about anything they are learning. For source-grounded discussion of something they saved, suggest they open that topic.

Delegation policy:
Backend tools:
- General knowledge: the backend can reason carefully about any subject and check facts you are unsure of.

Delegate to the backend when:
- The question needs careful reasoning, precise facts, or a structured explanation.
- You are not confident in a factual detail that matters.

Do not delegate to the backend when:
- You can answer well from the conversation or general knowledge.
- You only need a brief clarification of what ${name} meant.
- It is small talk.

Delegate before giving an answer that depends on backend work. Do not guess the result while waiting.`
}

/// Quizmaster script for a spoken flash set. The deck is embedded; grading
/// happens afterwards from the transcript (judgeVoiceSet in flash.ts).
export function buildLiveFlashInstructions(input: {
  userName: string
  topicLabel: string | null
  cards: { question: string; answer: string }[]
}): string {
  const name = friendlyName(input.userName)
  const deck = input.cards
    .map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`)
    .join('\n')
  const scope = input.topicLabel
    ? `on the topic "${input.topicLabel}"`
    : 'mixing questions from across everything they are learning'

  return `${PERSONA(name)}

You are running a spoken flash-card round with ${name} ${scope}. You speak first.

The deck (${input.cards.length} questions, in order):
${deck}

How to run the round:
- Open with one short, energetic line welcoming ${name} to the round, then ask question 1 immediately.
- Ask EXACTLY the questions in the deck, in order, one at a time. Read the question naturally; do not read the answer.
- After ${name} answers: say "Correct!" or "Not quite" in a word or two, give the canonical answer in one short sentence if they missed it, then move straight to the next question. No lectures.
- If ${name} is silent for a while or says they don't know, give the answer briefly and move on.
- Never skip a question and never invent extra ones.
- After the last question, tell them the round is over and roughly how they did, thank them, and say goodbye. Keep the whole wrap-up under 15 seconds.
- Keep everything brisk and fun — this is a game show, not a seminar.

Delegation policy:
Backend tools:
- Answer check: the backend has the same deck and can judge whether an unusual, partial, or roundabout answer expresses the canonical answer.

Delegate to the backend when:
- You genuinely cannot tell whether ${name}'s answer matches the canonical answer.

Do not delegate to the backend when:
- The answer is clearly right or clearly wrong — which is almost always.
- You are reading the next question or wrapping up.

Do not guess the result while waiting.`
}

/// Oral-exam script for the Final Review (star 3). Graded A–F afterwards
/// (judgeFinalReview in flash.ts).
export function buildLiveFinalReviewInstructions(input: {
  userName: string
  thread: F2Thread
}): string {
  const name = friendlyName(input.userName)
  return `${PERSONA(name)}

You are conducting ${name}'s FINAL REVIEW — a spoken oral exam on a topic they have been studying. Passing at the highest level earns their mastery star, so be thorough and fair. You speak first.

${summarizeThreadForLive(input.thread)}${studyFocusBlock(name, input.thread, 'examined')}

How to conduct the review:
- Open by telling ${name} this is their Final Review and there's a star on the line, then ask the first question: what's their main takeaway from this material?
- Default shape: about five substantive questions that together cover the main ideas AND some supporting detail. Prefer "explain", "why", and "how" over trivia. One question at a time; let them finish.
- The student may propose their own format — "let me summarize it in five parts and we'll discuss each", walking through it chapter by chapter, and so on. Accept it and work inside it: listen to each part, probe it with follow-up questions, and make sure anything important they skip still gets covered by your questions before the end.
- Track what they have ALREADY covered, especially during a long opening overview. Never ask them to repeat something an earlier answer already handled — when your planned question was covered, say so in a few words and either go one level deeper on it (mechanism, evidence, why it matters) or move to ground they haven't touched. Redundant questions waste their exam.
- Corrections are allowed and useful. When they get something wrong or leave out something essential, say so briefly — one or two plain, specific sentences — then move on. No lectures: this is still an exam, and the grade rests on what THEY demonstrate, so keep the floor mostly theirs.
- A short follow-up probe ("and why does that matter?") is good whenever an answer is thin.
- Keep the whole thing a fluid conversation — their thinking, your questions, your brief corrections — not a quiz script.
- Once the material has been covered, thank them, tell them the review is complete and that their grade is being tallied, and say goodbye. Do not announce a grade yourself.${examDelegationPolicy(name)}`
}

/// The Second Chance: exactly three questions after a failed Final Review.
export function buildLiveSecondChanceInstructions(input: {
  userName: string
  thread: F2Thread
  weaknesses?: string[]
}): string {
  const name = friendlyName(input.userName)
  const weak = (input.weaknesses ?? []).filter((w) => w.trim())
  return `${PERSONA(name)}

You are giving ${name} their SECOND CHANCE — a short spoken retake after a Final Review that fell just short. Exactly THREE questions. Their mastery star is on the line: to pass, their three answers together must be A-level. You speak first.

${summarizeThreadForLive(input.thread)}${studyFocusBlock(name, input.thread, 'examined')}${weak.length > 0 ? `

WHERE THEY FELL SHORT LAST TIME — build your three questions primarily from these areas, so they can prove they've closed the gaps:
${weak.map((w) => `- ${w}`).join('\n')}` : ''}

How to run it:
- Open by telling ${name} this is their Second Chance: three questions, and strong answers on all three earn the star. Then ask question 1.
- Ask EXACTLY three substantive questions — "explain", "why", "how" — one at a time. No more, no fewer.
- One short follow-up probe per question is allowed when an answer is thin, but it belongs to the same question.
- Brief corrections are fine, but the grade rests on what THEY demonstrate — keep the floor theirs.
- After the third answer, thank them, say their grade is being tallied, and say goodbye. Do not announce a result yourself.${examDelegationPolicy(name)}`
}

/// The recertification refresher: 3 questions that keep a badge gold.
export function buildLiveRecertInstructions(input: {
  userName: string
  thread: F2Thread
  weaknesses?: string[]
}): string {
  const name = friendlyName(input.userName)
  const weak = (input.weaknesses ?? []).filter((w) => w.trim())
  return `${PERSONA(name)}

You are giving ${name} a quick REFRESHER on a topic they mastered a while ago — the check that keeps their gold badge shining. Exactly THREE questions, about five minutes. This is a retention check, not the original exam: warm, brisk, and confidence-building. You speak first.

${summarizeThreadForLive(input.thread)}${studyFocusBlock(name, input.thread, 'examined')}${weak.length > 0 ? `

FLAGGED LAST TIME — make one of your three questions revisit these, so the refresher closes old gaps:
${weak.map((w) => `- ${w}`).join('\n')}` : ''}

How to run it:
- Open by telling ${name} this is a quick refresher to keep their badge gold — three questions, a few minutes. Then ask question 1.
- Shape: question 1 on the topic's central idea; question 2 on the flagged areas above (or a second core idea when there are none); question 3 on a supporting detail worth retaining.
- Ask EXACTLY three questions, one at a time. One short follow-up probe per question when an answer is thin.
- Brief corrections are fine — this is also a chance to re-learn — but the grade rests on what THEY recall unaided.
- After the third answer, thank them, say the badge check is being tallied, and say goodbye. Do not announce a result yourself.${examDelegationPolicy(name)}`
}

// ---------------------------------------------------------------------------
// Backend (Responses delegation) prompts — the full material lives here.
// ---------------------------------------------------------------------------

const BACKEND_PREAMBLE = (name: string) =>
  `## Voice conversation context
You are the backend for Dodo, a learning companion, in a live voice conversation with ${name}. A separate live voice model speaks with them and delegates to you when it needs more than it has. Transcripts can contain mistakes, unfinished phrases, and later corrections; use the latest context.`

const BACKEND_RETURN = `## Return the result
Return the relevant facts in a few short sentences, ready to be spoken — no headings, no markdown, no lists longer than three items. Quote the material briefly where precision matters. If the material does not cover something, say so plainly rather than guessing. Do not write the live model's lines for it; give it what it needs and let it choose how to say it.`

function backendMaterial(thread: F2Thread): string {
  const content = buildFullContent(thread)
  if (!content) return '(no source material was saved for this topic — answer from the conversation and general knowledge, and say when you are doing so)'
  const clipped = content.slice(0, MAX_BACKEND_CONTENT_CHARS)
  return clipped + (content.length > clipped.length ? '\n\n[material truncated]' : '')
}

export function buildBackendInstructions(input: {
  mode: RealtimeMode
  userName: string
  thread?: F2Thread | null
  cards?: { question: string; answer: string }[]
}): string {
  const name = friendlyName(input.userName)
  const head = BACKEND_PREAMBLE(name)

  if (input.mode === 'flash') {
    const deck = (input.cards ?? [])
      .map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`)
      .join('\n')
    return `${head}

## Your job
The live model is running a spoken flash-card round from this deck and asks you only when it cannot tell whether ${name}'s spoken answer expresses the canonical answer. Judge that: does the answer capture the same idea, allowing for casual phrasing and transcription errors? Say correct or not, and why in one sentence.

## The deck
${deck || '(empty)'}

${BACKEND_RETURN}`
  }

  if (!input.thread) {
    return `${head}

## Your job
${name} has no particular topic open. Answer from general knowledge with care: precise facts, careful reasoning, clear structure. If a question would be better answered from material they saved in Dodo, say so.

${BACKEND_RETURN}`
  }

  const thread = input.thread
  const subject = threadSubject(thread)
  const job =
    input.mode === 'topic'
      ? `The live model is discussing the topic "${subject}" with ${name} and holds only an excerpt of the material below. When it delegates, find the relevant passage or detail, verify what ${name} claimed, or reason through the question carefully against the material.`
      : `The live model is examining ${name} orally on the topic "${subject}" (${input.mode === 'final_review' ? 'their Final Review' : input.mode === 'second_chance' ? 'their Second Chance retake' : 'a recertification refresher'}) and holds only an excerpt of the material below. When it delegates, verify a claim ${name} made against the material, find the detail it needs, or suggest one sharp examination question on a part of the material the excerpt does not cover. Keep answers short — the exam must keep moving.${thread.study_focus ? ` The exam is scoped to this study focus: "${thread.study_focus}"; stay inside it.` : ''}`

  return `${head}

## Your job
${job}

## Source material for "${subject}"${thread.url ? ` (${thread.url})` : ''}
${backendMaterial(thread)}

${BACKEND_RETURN}`
}

// ---------------------------------------------------------------------------
// Session config + creation
// ---------------------------------------------------------------------------

/// The instruction the client appends right after `session.started` to make
/// Dodo open the conversation. Only the scripted modes speak first; Talk to
/// Dodo waits for the user, as it always has.
export function liveOpeningInstruction(mode: RealtimeMode, userName: string): string | null {
  if (mode === 'global' || mode === 'topic' || mode === 'walk') return null
  const name = friendlyName(userName)
  return `Begin now, without waiting for ${name} to speak: give your opening line exactly as your instructions describe and ask the first question. Then pause and listen.`
}

export type LiveSessionConfig = {
  model: string
  instructions: string
  audio: { output: { voice: string } }
  delegation: {
    type: 'responses'
    responses: {
      model: string
      instructions: string
      reasoning?: { effort: string }
    }
  }
  store: false
}

/// Trim the live prompt if it would blow the 16,384-token instruction cap.
/// The excerpt is the only part that can be large; everything after it is
/// the policy block, which must survive, so we cut from inside the excerpt.
export function fitLiveInstructions(instructions: string): string {
  if (instructions.length <= MAX_LIVE_INSTRUCTION_CHARS) return instructions
  const marker = '\n\nDelegation policy:'
  const at = instructions.lastIndexOf(marker)
  if (at < 0) return instructions.slice(0, MAX_LIVE_INSTRUCTION_CHARS)
  const tail = instructions.slice(at)
  const head = instructions.slice(0, Math.max(0, MAX_LIVE_INSTRUCTION_CHARS - tail.length - 40))
  return `${head}\n\n[excerpt trimmed — the backend has the rest]${tail}`
}

export function buildLiveSessionConfig(input: {
  instructions: string
  backendInstructions: string
  voice: string
  holdToTalk?: boolean
  /** Folded into the live prompt (user delivery preferences). */
  userName: string
}): LiveSessionConfig {
  let instructions = input.instructions
  if (input.holdToTalk) instructions += HOLD_TO_TALK_NOTE(friendlyName(input.userName))
  return {
    model: liveModel(),
    instructions: fitLiveInstructions(instructions),
    audio: { output: { voice: input.voice } },
    delegation: {
      type: 'responses',
      responses: {
        model: liveBackendModel(),
        instructions: input.backendInstructions,
        reasoning: { effort: liveBackendReasoning() },
      },
    },
    store: false,
  }
}

/// POST /v1/live/sessions with the phone's SDP offer. Returns the live
/// session id and the SDP answer the phone applies as its remote description.
export async function createLiveWebRTCSession(input: {
  session: LiveSessionConfig
  sdp: string
}): Promise<{ sessionId: string; answerSdp: string }> {
  const res = await fetch('https://api.openai.com/v1/live/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: input.session,
      transport: { type: 'webrtc', sdp: input.sdp },
    }),
  })

  const text = await res.text()
  let json: { session?: { id?: string }; transport?: { sdp?: string }; error?: unknown } = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = {}
  }

  if (!res.ok) {
    console.error('[f2/live] session create failed:', res.status, text.slice(0, 600))
    throw new Error(`GPT-Live session create failed (${res.status})`)
  }
  const sessionId = json.session?.id
  const answerSdp = json.transport?.sdp
  if (!sessionId || !answerSdp) {
    console.error('[f2/live] session create returned no id/sdp:', text.slice(0, 600))
    throw new Error('GPT-Live session create returned an incomplete response')
  }
  return { sessionId, answerSdp }
}
