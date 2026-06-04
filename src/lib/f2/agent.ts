// Client-agnostic core entrypoint for F2.
// Every client (iMessage, web, iOS) routes inbound messages through processMessage.
//
// Behavior:
//   - URL → fetch + extract → new URL-backed thread.
//   - non-URL → tool-using LLM picks one of:
//       continue_chat  → reply within active thread, persist exchange
//       start_new_topic → spin up new topic thread, persist opening
//       chitchat       → reply, persist nothing
//
// If `threadId` is provided, that thread is targeted directly (used by web UI
// when the user is chatting from a specific topic's page). Otherwise the
// agent operates on the user's most recently updated thread.

import { isUrl, stripSurroundingQuotes, fetchUrlContent } from './url'
import {
  createThread,
  getLatestThread,
  getThreadById,
  appendMessages,
  recordQuizStarted,
  completeQuiz,
  appendQuote,
  getPendingQuote,
  setPendingQuote,
  matchTopicByName,
  listTopicsForUser,
  type F2Thread,
} from './threads'
import {
  routeAndReply,
  askReflectionQuestion,
  acknowledgeReflectionAnswer,
} from './chat'
import { nameTopic } from './name-topic'

export type F2Client = 'imessage' | 'web' | 'ios' | 'sms'

export type F2Message = {
  userId: string
  handle: string
  text: string
  client: F2Client
  threadId?: string
}

export type F2Reply = {
  reply: string
  /** The thread this message landed on, when one exists. Populated for URL
   *  ingestion, continue-on-existing-topic, new_topic, and reflection turns.
   *  Lets clients like ChatView target follow-up calls (e.g. quiz/complete)
   *  at the right thread without a separate /latest round-trip. */
  thread_id?: string
  /** Thread state snapshot — included when the message changed the thread's
   *  quiz/star state (e.g. a chat-triggered reflection quiz started). Clients
   *  apply these to their local thread so the UI updates without a refetch. */
  thread_state?: {
    pending_quiz_kind: 'standard' | 'hard' | 'reflection' | null
    stars: number
    quiz_count: number
    hard_quiz_completed_at: string | null
  }
}

export async function processMessage(input: F2Message): Promise<F2Reply> {
  const { userId, client, handle, threadId } = input
  const text = input.text.trim()
  if (!text) return { reply: '' }

  // A quote was typed outside any topic last turn; this message names the
  // target topic. Resolving it takes priority over all other routing.
  const pending = await getPendingQuote(userId)
  if (pending) {
    return resolvePendingQuote(userId, client, handle, pending, text)
  }

  // "quote <text>" → capture a quote for the active topic (or ask which one).
  // Tolerant of the separator after the keyword ("quote", "Quote:", "QUOTE -")
  // and of the user wrapping the text in quotation marks (straight or curly),
  // which we strip so they don't double up against the quotes the UI adds.
  const quoteMatch = text.match(/^quote\b[\s:,;.\-—]*/i)
  if (quoteMatch) {
    const quoteText = stripQuoteMarks(text.slice(quoteMatch[0].length).trim())
    return handleQuote(userId, client, handle, text, quoteText, threadId)
  }

  const firstToken = stripSurroundingQuotes(text.split(/\s+/)[0])

  if (isUrl(firstToken)) {
    return handleNewUrl(userId, client, handle, firstToken)
  }
  return handleNonUrl(userId, client, handle, text, threadId)
}

/// Strip one matched pair of surrounding quotation marks — straight ("…", '…')
/// or curly ("…", '…') — from a captured quote. Leaves inner quotes and
/// unbalanced marks untouched.
function stripQuoteMarks(s: string): string {
  const t = s.trim()
  if (t.length < 2) return t
  const pairs: Record<string, string> = {
    '"': '"',
    "'": "'",
    '“': '”', // " "
    '‘': '’', // ' '
  }
  const close = pairs[t[0]]
  if (close && t.endsWith(close)) return t.slice(1, -1).trim()
  return t
}

/// Save `quoteText` onto a topic and persist the exchange to its chat log so it
/// shows up on reload. `userMessage` is the user's original typed text.
async function fileQuote(
  thread: F2Thread,
  quoteText: string,
  userMessage: string,
): Promise<F2Reply> {
  const total = await appendQuote(thread, quoteText)
  if (total === null) {
    return { reply: "F2: couldn't save that quote. Try again in a sec." }
  }
  const label = thread.topic ?? thread.url ?? 'this topic'
  const reply = `F2 saved that quote to "${label}". ${total} quote${total === 1 ? '' : 's'} on this topic now.`
  const now = new Date().toISOString()
  await appendMessages(thread.id, thread.user_id, thread.messages, [
    { role: 'user', text: userMessage, created_at: now },
    { role: 'assistant', text: reply, created_at: now },
  ])
  return { reply, thread_id: thread.id }
}

/// "quote <text>". With a threadId we're inside a topic — attach directly.
/// Without one (general Chat tab / iMessage) we park the text and ask which
/// topic it belongs to; the next message resolves it (resolvePendingQuote).
async function handleQuote(
  userId: string,
  client: F2Client,
  handle: string,
  userMessage: string,
  quoteText: string,
  threadId: string | undefined,
): Promise<F2Reply> {
  if (!quoteText) {
    return { reply: 'F2: add the quote text after "quote" — e.g. quote "Whereof one cannot speak…".' }
  }

  if (threadId) {
    const thread = await getThreadById(userId, threadId)
    if (!thread) return { reply: "F2: couldn't find that topic to attach the quote to." }
    return fileQuote(thread, quoteText, userMessage)
  }

  await setPendingQuote(userId, quoteText)
  const topics = await listTopicsForUser(userId)
  const recent = topics
    .slice(0, 5)
    .map((t) => `• ${t.topic ?? t.url}`)
    .join('\n')
  const list = recent ? `\n\nRecent topics:\n${recent}` : ''
  return {
    reply: `F2: which topic should I save this quote to? Reply with a topic name, or "new <name>" to create one.${list}`,
  }
}

/// The user has a parked quote and just named a topic for it. Handles:
///   "cancel"      → drop the quote
///   "new <name>"  → create the topic, file the quote
///   <topic name>  → match an existing topic, file the quote
/// On no match we keep the quote parked and re-prompt.
async function resolvePendingQuote(
  userId: string,
  client: F2Client,
  handle: string,
  quoteText: string,
  answer: string,
): Promise<F2Reply> {
  if (/^cancel\b/i.test(answer)) {
    await setPendingQuote(userId, null)
    return { reply: 'F2: okay, dropped that quote.' }
  }

  const newMatch = answer.match(/^new\b[\s:,\-—]*(.*)$/i)
  if (newMatch) {
    const name = newMatch[1].trim()
    if (!name) {
      return { reply: 'F2: give the new topic a name — e.g. new The Iliad.' }
    }
    const thread = await createThread({ userId, client, handle, topic: name })
    if (!thread) {
      return { reply: "F2: couldn't create that topic. Try again in a sec." }
    }
    await setPendingQuote(userId, null)
    return fileQuote(thread, quoteText, `quote ${quoteText}`)
  }

  const match = await matchTopicByName(userId, answer)
  if (!match) {
    return {
      reply: `F2: couldn't find a topic called "${answer}". Reply with an exact topic name, "new <name>" to create one, or "cancel" to drop it.`,
    }
  }
  await setPendingQuote(userId, null)
  return fileQuote(match, quoteText, `quote ${quoteText}`)
}

async function handleNewUrl(
  userId: string,
  client: F2Client,
  handle: string,
  url: string,
): Promise<F2Reply> {
  const fetched = await fetchUrlContent(url)
  const content = fetched.body
  // Ask the AI to pick a chapter-style title, with the page's <title> as a
  // hint. The LLM will rewrite hostnames / clickbait / fluff into a clean
  // subject phrase. Falls through to null when we have nothing to send.
  const topic = content || fetched.title
    ? await nameTopic({ body: content ?? '', documentTitle: fetched.title })
    : null

  const thread = await createThread({
    userId,
    client,
    handle,
    url,
    content,
    topic,
  })

  if (!thread) {
    return { reply: "F2: couldn't save that URL. Try again in a sec." }
  }

  const reply = content
    ? `F2 got it. Stored ${url} (${content.length.toLocaleString()} chars). Ask me anything about it.`
    : `F2 stored ${url}, but couldn't pull readable text from it. You can still ask — I'll answer from general knowledge.`
  return { reply, thread_id: thread.id }
}

/// Matches "reflection quiz", "reflection-quiz", "give me a reflection quiz",
/// etc. — anywhere in the message, case-insensitive, word-bounded.
function isReflectionQuizRequest(text: string): boolean {
  return /\breflection[ -]?quiz\b/i.test(text)
}

/// Step 1: user typed "reflection quiz". Ask one open-ended question, mark
/// the thread as pending reflection. No star awarded yet.
async function startReflectionTurn(
  thread: F2Thread,
  userText: string,
): Promise<F2Reply> {
  let reply: string
  try {
    reply = await askReflectionQuestion(thread, userText)
  } catch (err) {
    console.error('[f2] reflection quiz failed to start:', err)
    return { reply: 'F2: hit an error starting the reflection quiz. Try again in a moment.' }
  }

  if (!reply) {
    return { reply: "F2: couldn't start the reflection quiz. Try again in a moment." }
  }

  const now = new Date().toISOString()
  await appendMessages(thread.id, thread.user_id, thread.messages, [
    { role: 'user', text: userText, created_at: now },
    { role: 'assistant', text: reply, created_at: now },
  ])
  const state = await recordQuizStarted(thread, 'reflection')

  return {
    reply,
    thread_id: thread.id,
    thread_state: {
      pending_quiz_kind: 'reflection',
      stars: state.stars,
      quiz_count: state.quiz_count,
      hard_quiz_completed_at: state.hard_quiz_completed_at,
    },
  }
}

/// Step 2: user replied to the reflection question. Award the star, mark the
/// topic done, clear pending — all in this single round-trip. F2's reply is
/// a brief acknowledgement with a star-earned line appended.
async function completeReflectionTurn(
  thread: F2Thread,
  userText: string,
): Promise<F2Reply> {
  let ack: string
  try {
    ack = await acknowledgeReflectionAnswer(thread, userText)
  } catch (err) {
    console.error('[f2] reflection acknowledgement failed:', err)
    ack = 'Got it.'
  }
  if (!ack) ack = 'Got it.'

  const now = new Date().toISOString()
  // Save the user's answer (and our ack with the star line) BEFORE awarding so
  // the thread state we read for completeQuiz still has pending_quiz_kind set.
  const starLine = '⭐ Reflection star earned — this topic is marked done.'
  const reply = `${ack}\n\n${starLine}`
  await appendMessages(thread.id, thread.user_id, thread.messages, [
    { role: 'user', text: userText, created_at: now },
    { role: 'assistant', text: reply, created_at: now },
  ])
  const state = await completeQuiz(thread)

  return {
    reply,
    thread_id: thread.id,
    thread_state: {
      pending_quiz_kind: null,
      stars: state.stars,
      quiz_count: state.quiz_count,
      hard_quiz_completed_at: state.hard_quiz_completed_at,
    },
  }
}

async function handleNonUrl(
  userId: string,
  client: F2Client,
  handle: string,
  userText: string,
  threadId: string | undefined,
): Promise<F2Reply> {
  let thread: F2Thread | null = null
  if (threadId) {
    thread = await getThreadById(userId, threadId)
  } else {
    thread = await getLatestThread(userId)
  }

  // Reflection quiz — one question, one reply, one star, done.
  //   - Typing "reflection quiz" ALWAYS wins, overriding any pending
  //     standard/hard quiz. Works at 0/1/2/3 stars, locked or not.
  //   - If reflection is already pending (we just asked the question), this
  //     reply finishes the quiz: award the star, mark done, clear pending.
  if (thread && isReflectionQuizRequest(userText)) {
    return startReflectionTurn(thread, userText)
  }
  if (thread && thread.pending_quiz_kind === 'reflection') {
    return completeReflectionTurn(thread, userText)
  }

  let action
  try {
    action = await routeAndReply(thread, userText)
  } catch (err) {
    console.error('[f2] routeAndReply failed:', err)
    return { reply: 'F2: hit an error talking to Claude. Try again in a moment.' }
  }

  const now = new Date().toISOString()

  switch (action.kind) {
    case 'continue': {
      if (!thread) {
        // Defensive: model picked continue but there's no thread. Treat as chitchat.
        return { reply: action.reply }
      }
      await appendMessages(thread.id, thread.user_id, thread.messages, [
        { role: 'user', text: userText, created_at: now },
        { role: 'assistant', text: action.reply, created_at: now },
      ])
      return { reply: action.reply, thread_id: thread.id }
    }
    case 'new_topic': {
      // Same naming pipeline as the URL/paste paths. The routing LLM's pick
      // is fed in as a hint; Haiku rewrites it when it can do better given
      // the user's question + opening reply.
      const refined = await nameTopic({
        body: `USER: ${userText}\n\nF2: ${action.reply}`,
        documentTitle: action.topic,
      })
      const fresh = await createThread({
        userId,
        client,
        handle,
        topic: refined || action.topic,
      })
      if (fresh) {
        await appendMessages(fresh.id, fresh.user_id, [], [
          { role: 'user', text: userText, created_at: now },
          { role: 'assistant', text: action.reply, created_at: now },
        ])
      }
      return { reply: action.reply, thread_id: fresh?.id }
    }
    case 'chitchat':
      return { reply: action.reply }
  }
}
