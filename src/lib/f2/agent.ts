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
  type F2Thread,
} from './threads'
import { routeAndReply, replyAsReflectionQuiz } from './chat'
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

  const firstToken = stripSurroundingQuotes(text.split(/\s+/)[0])

  if (isUrl(firstToken)) {
    return handleNewUrl(userId, client, handle, firstToken)
  }
  return handleNonUrl(userId, client, handle, text, threadId)
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

async function reflectionQuizTurn(
  thread: F2Thread,
  userText: string,
  isFirstTurn: boolean,
): Promise<F2Reply> {
  let reply: string
  try {
    reply = await replyAsReflectionQuiz(thread, userText)
  } catch (err) {
    console.error('[f2] reflection quiz failed:', err)
    return { reply: 'F2: hit an error continuing the reflection quiz. Try again in a moment.' }
  }

  if (!reply) {
    return { reply: "F2: couldn't continue the reflection quiz. Try again in a moment." }
  }

  const now = new Date().toISOString()
  await appendMessages(thread.id, thread.user_id, thread.messages, [
    { role: 'user', text: userText, created_at: now },
    { role: 'assistant', text: reply, created_at: now },
  ])

  // First turn marks the quiz as in flight; subsequent turns just reuse the
  // already-recorded state so we don't bump quiz_count for every answer.
  const state = isFirstTurn
    ? await recordQuizStarted(thread, 'reflection')
    : {
        stars: thread.stars,
        quiz_count: thread.quiz_count,
        hard_quiz_completed_at: thread.hard_quiz_completed_at,
      }

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

  // Reflection quiz — handled at the chat level so it survives across turns:
  //   - If pending_quiz_kind is already 'reflection', stay in reflection mode
  //     so the LLM keeps the 3-question protocol instead of being hijacked by
  //     the standard router.
  //   - Otherwise, if the user just asked for one (and we're not already in
  //     a different quiz), start the reflection quiz fresh.
  if (thread && thread.pending_quiz_kind === 'reflection') {
    return reflectionQuizTurn(thread, userText, /* isFirstTurn */ false)
  }
  if (
    thread &&
    isReflectionQuizRequest(userText) &&
    !thread.pending_quiz_kind &&
    !thread.hard_quiz_completed_at
  ) {
    return reflectionQuizTurn(thread, userText, /* isFirstTurn */ true)
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
