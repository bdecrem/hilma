// Client-agnostic core entrypoint for F2.
// Every client (iMessage, web, iOS) routes inbound messages through processMessage.
//
// Behavior:
//   - URL → fetch + extract → new URL-backed thread.
//   - non-URL → tool-using LLM picks one of:
//       continue_chat  → reply within active thread, persist exchange
//       start_new_topic → spin up new topic thread, persist opening
//       chitchat       → reply, persist nothing

import { isUrl, stripSurroundingQuotes, fetchUrlContent } from './url'
import { createThread, getLatestThread, appendMessages } from './threads'
import { routeAndReply } from './chat'

export type F2Client = 'imessage' | 'web' | 'ios' | 'sms'

export type F2Message = {
  handle: string
  text: string
  client: F2Client
}

export type F2Reply = {
  reply: string
}

export async function processMessage(input: F2Message): Promise<F2Reply> {
  const { client, handle } = input
  const text = input.text.trim()
  if (!text) return { reply: '' }

  const firstToken = stripSurroundingQuotes(text.split(/\s+/)[0])

  if (isUrl(firstToken)) {
    return handleNewUrl(client, handle, firstToken)
  }
  return handleNonUrl(client, handle, text)
}

async function handleNewUrl(
  client: F2Client,
  handle: string,
  url: string,
): Promise<F2Reply> {
  const content = await fetchUrlContent(url)
  const thread = await createThread({ client, handle, url, content })

  if (!thread) {
    return { reply: "F2: couldn't save that URL. Try again in a sec." }
  }

  const reply = content
    ? `F2 got it. Stored ${url} (${content.length.toLocaleString()} chars). Ask me anything about it.`
    : `F2 stored ${url}, but couldn't pull readable text from it. You can still ask — I'll answer from general knowledge.`
  return { reply }
}

async function handleNonUrl(
  client: F2Client,
  handle: string,
  userText: string,
): Promise<F2Reply> {
  const thread = await getLatestThread(client, handle)

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
      await appendMessages(thread.id, thread.messages, [
        { role: 'user', text: userText, created_at: now },
        { role: 'assistant', text: action.reply, created_at: now },
      ])
      return { reply: action.reply }
    }
    case 'new_topic': {
      const fresh = await createThread({ client, handle, topic: action.topic })
      if (fresh) {
        await appendMessages(fresh.id, [], [
          { role: 'user', text: userText, created_at: now },
          { role: 'assistant', text: action.reply, created_at: now },
        ])
      }
      return { reply: action.reply }
    }
    case 'chitchat':
      return { reply: action.reply }
  }
}
