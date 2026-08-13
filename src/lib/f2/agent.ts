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
  setAdditionalSources,
  setStudyFocus,
  buildFullContent,
  type F2Thread,
  type F2AdditionalSource,
} from './threads'
import {
  authorFlashCard,
  generateFlashCards,
  redoFlashCards,
} from './flash'
import {
  findExplainerVideos,
  youtubeVideoId,
  bandLabel,
  type VideoBand,
} from './videos'
import {
  routeAndReply,
  askReflectionQuestion,
  acknowledgeReflectionAnswer,
} from './chat'
import { nameTopic } from './name-topic'
import { llmComplete, type LlmTool } from './llm'
import { setAudioSummary } from './audio-summary'

export type F2Client = 'imessage' | 'web' | 'ios' | 'sms'

export type F2Message = {
  userId: string
  handle: string
  text: string
  client: F2Client
  threadId?: string
  /** Chat-model registry key (see lib/f2/llm.ts). Sent by the iOS/macOS
   *  picker; absent for web/iMessage, which keep the default model. Governs
   *  chat replies and quiz-question generation — topic naming, quiz grading,
   *  and video search/ranking stay on their fixed internal models. */
  model?: string
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
  /** Set by the `summary <instructions>` command: the thread's audio_summary
   *  has been marked `generating` and the caller (the /api/f2/messages route)
   *  should run generateAudioSummary in the background via after(). Absent for
   *  every other message. */
  regenerate_summary?: {
    thread_id: string
    instructions: string | null
    model?: string
  }
  /** Set by the dodo agent's write_document action: the document is being
   *  written in the background (web search + long generation can outrun the
   *  request). The /api/f2/messages route runs the job via after(). */
  write_document?: {
    thread_id: string
    title: string
    brief: string
    model?: string
  }
}

export async function processMessage(input: F2Message): Promise<F2Reply> {
  const { userId, client, handle, threadId, model } = input
  const text = input.text.trim()
  if (!text) return { reply: '' }

  // A quote was typed outside any topic last turn; this message names the
  // target topic. Resolving it takes priority over all other routing.
  const pending = await getPendingQuote(userId)
  if (pending) {
    const { text: pText, author: pAuthor } = decodePending(pending)
    return resolvePendingQuote(userId, client, handle, pText, pAuthor, text)
  }

  // "setup: <freeform>" → find 3 explainer videos and spin up a new topic
  // from them. Always creates a fresh topic, regardless of the active one.
  const setupMatch = text.match(/^set[\s-]?up\b[\s:,.\-—]*/i)
  if (setupMatch) {
    return handleVideoSetup(
      userId, client, handle, text, text.slice(setupMatch[0].length).trim(), 'long',
    )
  }

  // "new short|medium|long <topic>" → new topic seeded with 3 videos of that
  // length. "new none <topic>" → new topic with no videos, just chat. Always
  // creates a fresh topic. (A bare "new <name>" without one of these keywords
  // falls through to the LLM router, unchanged.)
  const newMatch = text.match(/^new\s+(short|medium|long|none)\b[\s:,.\-—]*/i)
  if (newMatch) {
    const kind = newMatch[1].toLowerCase() as VideoBand | 'none'
    const request = text.slice(newMatch[0].length).trim()
    if (kind === 'none') {
      return handleNewNone(userId, client, handle, text, request, model)
    }
    return handleVideoSetup(userId, client, handle, text, request, kind)
  }

  // "summary <instructions>" → regenerate this topic's audio summary +
  // transcript, steered by the instructions (e.g. "make it longer", "add more
  // dates"). "summary" alone regenerates with no extra guidance. The heavy
  // generation runs in the background (see the /api/f2/messages route).
  const summaryMatch = text.match(/^summary\b[\s:,.\-—]*/i)
  if (summaryMatch) {
    const instructions = text.slice(summaryMatch[0].length).trim()
    return handleSummaryCommand(userId, threadId, instructions, model)
  }

  // "dodo <instruction>" → the content agent: act on the active topic's
  // study materials (make/redo flash cards, add context notes, write and
  // file documents, set the study focus). Conversational messages that just
  // address the dodo fall through to a normal chat answer.
  const dodoMatch = text.match(/^dodo\b[\s:,;.\-—!]*/i)
  if (dodoMatch) {
    const instruction = text.slice(dodoMatch[0].length).trim()
    return handleDodoCommand(userId, threadId, text, instruction, model)
  }

  // "quote <text>" → capture a quote for the active topic (or ask which one).
  // Tolerant of the separator after the keyword ("quote", "Quote:", "QUOTE -")
  // and of the user wrapping the text in quotation marks (straight or curly),
  // which we strip so they don't double up against the quotes the UI adds.
  const quoteMatch = text.match(/^quote\b[\s:,;.\-—]*/i)
  if (quoteMatch) {
    const { text: quoteText, author } = parseQuote(text.slice(quoteMatch[0].length).trim())
    return handleQuote(userId, client, handle, text, quoteText, author, threadId)
  }

  const firstToken = stripSurroundingQuotes(text.split(/\s+/)[0])

  if (isUrl(firstToken)) {
    return handleNewUrl(userId, client, handle, firstToken)
  }
  return handleNonUrl(userId, client, handle, text, threadId, model)
}

const QUOTE_PAIRS: Record<string, string> = {
  '"': '"',
  "'": "'",
  '“': '”', // " "
  '‘': '’', // ' '
}

/// Parse a captured quote into text + optional author.
///   "<quote>" (author)     → author in parens
///   "<quote>" - author      → author after a dash (-, –, —) or colon
///   "<quote>" author        → bare trailing attribution
///   <quote>                 → no quotation marks: whole thing is the text,
///                             no author (no reliable boundary)
/// A single layer of surrounding quotes is stripped from the text either way.
function parseQuote(raw: string): { text: string; author: string | null } {
  const s = raw.trim()
  if (s.length < 2) return { text: s, author: null }

  const close = QUOTE_PAIRS[s[0]]
  if (close) {
    const end = s.indexOf(close, 1)
    if (end > 0) {
      const text = s.slice(1, end).trim()
      const author = parseAuthor(s.slice(end + 1).trim())
      return { text, author }
    }
  }
  // No usable quote span — strip a matched pair if present, no author.
  const c = QUOTE_PAIRS[s[0]]
  if (c && s.endsWith(c)) return { text: s.slice(1, -1).trim(), author: null }
  return { text: s, author: null }
}

/// Pull an author out of the text trailing a closing quote: "(name)",
/// "- name" / "— name" / ": name", or a bare "name". Empty → null.
function parseAuthor(rest: string): string | null {
  if (!rest) return null
  const paren = rest.match(/^\((.+)\)$/)
  if (paren) return paren[1].trim() || null
  const dashed = rest.match(/^[-–—:]\s*(.+)$/)
  if (dashed) return dashed[1].trim() || null
  return rest || null
}

/// The pending-quote slot is a single text column; encode text+author as JSON
/// so an unfiled author survives the "which topic?" round-trip. Legacy plain
/// strings decode as text with no author.
function encodePending(text: string, author: string | null): string {
  return JSON.stringify({ t: text, a: author ?? null })
}
function decodePending(s: string): { text: string; author: string | null } {
  try {
    const o = JSON.parse(s)
    if (o && typeof o.t === 'string') {
      return { text: o.t, author: typeof o.a === 'string' ? o.a : null }
    }
  } catch {
    // legacy plain-text pending value
  }
  return { text: s, author: null }
}

/// Save `quoteText` onto a topic and persist the exchange to its chat log so it
/// shows up on reload. `userMessage` is the user's original typed text.
async function fileQuote(
  thread: F2Thread,
  quoteText: string,
  author: string | null,
  userMessage: string,
): Promise<F2Reply> {
  const total = await appendQuote(thread, quoteText, author)
  if (total === null) {
    return { reply: "F2: couldn't save that quote. Try again in a sec." }
  }
  const label = thread.topic ?? thread.url ?? 'this topic'
  const by = author ? ` (${author})` : ''
  const reply = `F2 saved that quote${by} to "${label}". ${total} quote${total === 1 ? '' : 's'} on this topic now.`
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
  author: string | null,
  threadId: string | undefined,
): Promise<F2Reply> {
  if (!quoteText) {
    return { reply: 'F2: add the quote text after "quote" — e.g. quote "Whereof one cannot speak…" (Wittgenstein).' }
  }

  if (threadId) {
    const thread = await getThreadById(userId, threadId)
    if (!thread) return { reply: "F2: couldn't find that topic to attach the quote to." }
    return fileQuote(thread, quoteText, author, userMessage)
  }

  await setPendingQuote(userId, encodePending(quoteText, author))
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
  author: string | null,
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
    return fileQuote(thread, quoteText, author, `quote ${quoteText}`)
  }

  const match = await matchTopicByName(userId, answer)
  if (!match) {
    return {
      reply: `F2: couldn't find a topic called "${answer}". Reply with an exact topic name, "new <name>" to create one, or "cancel" to drop it.`,
    }
  }
  await setPendingQuote(userId, null)
  return fileQuote(match, quoteText, author, `quote ${quoteText}`)
}

/// "new short|medium|long <topic>" (and legacy "setup:", which maps to
/// 'long') — find 3 recent, reputable explainer videos in the band, create a
/// topic from them, and ingest their transcripts as the topic's sources.
/// Fully synchronous (search + rank + transcript fetches), so callers must
/// allow a long maxDuration.
async function handleVideoSetup(
  userId: string,
  client: F2Client,
  handle: string,
  userMessage: string,
  request: string,
  band: VideoBand,
): Promise<F2Reply> {
  if (!request) {
    return { reply: `F2: name the topic — e.g. new ${band} quantum physics.` }
  }

  // The whole loop reaches out to the YouTube API, Claude, and the transcript
  // proxy — any of which can fail. Never let that surface as a 500; return a
  // readable message and log the real cause.
  try {
    const result = await findExplainerVideos(request, { band })
    if (!result || result.picks.length === 0) {
      return {
        reply: `F2: couldn't find solid ${bandLabel(band)} videos for that. Try rephrasing or narrowing the topic.`,
      }
    }

    const picks = result.picks
    // Pull transcripts in parallel — the slow part. A miss just means that
    // video keeps its link but contributes no transcript (per spec).
    const transcripts = await Promise.all(
      picks.map((p) =>
        fetchUrlContent(p.url)
          .then((r) => r.body)
          .catch(() => null),
      ),
    )

    // First video is the primary source; the rest become additional sources.
    const thread = await createThread({
      userId,
      client,
      handle,
      url: picks[0].url,
      content: transcripts[0],
      topic: result.topicTitle,
      videoBand: band,
    })
    if (!thread) {
      return { reply: 'F2: found the videos but couldn\'t create the topic. Try again in a sec.' }
    }

    const now = new Date().toISOString()
    const extra: F2AdditionalSource[] = picks.slice(1).map((p, i) => ({
      url: p.url,
      title: p.title,
      content: transcripts[i + 1] ?? null,
      added_at: now,
    }))
    if (extra.length > 0) {
      await setAdditionalSources(thread.id, thread.user_id, extra)
    }

    const lines = picks
      .map((p, i) => `${i + 1}. ${p.title} — ${p.channel} (${Math.round(p.durationSec / 60)} min)\n${p.url}`)
      .join('\n')
    const withTranscripts = transcripts.filter(Boolean).length
    const reply =
      `F2 set up "${result.topicTitle}" with ${picks.length} video${picks.length === 1 ? '' : 's'}:\n\n${lines}\n\n` +
      `Transcripts added for ${withTranscripts} of ${picks.length}. Ask me anything about this topic, or say "give me 3 other ones" for a fresh set.`

    await appendMessages(thread.id, thread.user_id, [], [
      { role: 'user', text: userMessage, created_at: now },
      { role: 'assistant', text: reply, created_at: now },
    ])
    return { reply, thread_id: thread.id }
  } catch (err) {
    console.error('[f2] handleVideoSetup failed:', err)
    return { reply: 'F2: hit a snag setting that up (the video search or transcripts failed). Try again in a moment.' }
  }
}

// ---------------------------------------------------------------------------
// "dodo <instruction>" — the content agent.

const DODO_TOOLS: LlmTool[] = [
  {
    name: 'make_flash_card',
    description:
      'Create ONE specific flash card the user dictated. Use when they describe a single card — a question, optionally with the answer they want.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: "The card's question, as the user intends it." },
        answer: {
          type: 'string',
          description: 'ONLY when the user dictated the answer too. Omit to answer from the source material.',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'add_flash_cards',
    description:
      'Generate additional cards into the existing deck (keeps current cards). Use for "make more cards", "add 5 cards about X".',
    input_schema: {
      type: 'object',
      properties: {
        count: { type: 'integer', description: 'How many to add. Default 10 when the user did not say.' },
        focus: { type: 'string', description: 'What the new cards should focus on, when the user said so.' },
      },
      required: ['count'],
    },
  },
  {
    name: 'redo_flash_cards',
    description:
      'Rebuild the WHOLE deck to the user\'s spec — replaces every existing card. Use for "redo the flash cards ...", "rebuild the deck focusing on ...".',
    input_schema: {
      type: 'object',
      properties: {
        instructions: {
          type: 'string',
          description: "The user's guidance for the new deck (focus, mix, style).",
        },
      },
      required: ['instructions'],
    },
  },
  {
    name: 'add_context_note',
    description:
      "Add a note to the topic's context materials. When the user dictated content, keep their substance; when they asked you to write or research it, write it from the source material.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the note (a few words).' },
        content: { type: 'string', description: 'The note body. Plain prose.' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'write_document',
    description:
      "Write a full document (study guide, outline, timeline, glossary, comparison...) from the topic's source material and file it in the context materials. Use when the user asks for a document, guide, or write-up to be created and added.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title.' },
        brief: {
          type: 'string',
          description:
            "What to write and how — the user's ask, plus anything from the conversation needed to write it well.",
        },
      },
      required: ['title', 'brief'],
    },
  },
  {
    name: 'set_study_focus',
    description:
      'Scope what the user is tested on ("only test me on the first half"). Applies to flash cards, quizzes, and the Final Review. Empty string clears the focus.',
    input_schema: {
      type: 'object',
      properties: {
        focus: { type: 'string', description: 'The focus instruction, or "" to clear it.' },
      },
      required: ['focus'],
    },
  },
  {
    name: 'answer_directly',
    description:
      "The message is NOT a content instruction — it's chat addressed to the dodo, or a question about the material. Answer it in plain text.",
    input_schema: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'Your answer. Plain text, no markdown, direct.' },
      },
      required: ['reply'],
    },
  },
]

/// "dodo <instruction>" — one agent turn over the active topic's materials.
/// Picks exactly one content action (or answers directly), executes it
/// server-side, and logs the exchange to the topic's chat.
async function handleDodoCommand(
  userId: string,
  threadId: string | undefined,
  originalText: string,
  instruction: string,
  model?: string,
): Promise<F2Reply> {
  const thread = threadId
    ? await getThreadById(userId, threadId)
    : await getLatestThread(userId)
  if (!thread) {
    return {
      reply:
        'F2: open a topic first — the dodo works on the active topic\'s materials (cards, notes, documents, study focus).',
    }
  }
  const label = thread.topic ?? thread.url ?? 'this topic'
  if (!instruction) {
    return {
      reply:
        `F2: tell the dodo what to do with "${label}" — e.g. "dodo make a flash card asking …", "dodo redo the flash cards focusing on …", "dodo add a note: …", "dodo write a study guide and add it to context", "dodo only test me on the first half".`,
      thread_id: thread.id,
    }
  }

  const source = buildFullContent(thread).slice(0, 30_000)
  const recentChat = thread.messages
    .slice(-12)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
    .slice(0, 6_000)

  const system = `You are the content agent for the learning topic "${label}". The user prefixed their message with "dodo", which routes it to you. Pick exactly ONE tool:
- make_flash_card / add_flash_cards / redo_flash_cards — card work. "Redo" replaces the deck; "add"/"make" keep it.
- add_context_note — file a note in the topic's context materials.
- write_document — create a document from the source material and file it in the context materials.
- set_study_focus — scope what they get tested on; "" clears it.
- answer_directly — the message isn't a content instruction (greeting, question about the material): just answer it, plain text, no markdown.

When writing content yourself (notes, documents), ground it in the source material. Plain, direct prose — never filler.`

  const user = `Source material (excerpt):
${source || '(no source yet — the chat below is the material)'}

Recent chat:
${recentChat || '(none)'}

The user's message:
${instruction}`

  let action: { name: string; input: Record<string, unknown> }
  try {
    const result = await llmComplete({
      model,
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: 4000,
      tools: DODO_TOOLS,
      forceTool: true,
    })
    if (result.type !== 'tool_call') {
      action = { name: 'answer_directly', input: { reply: result.text } }
    } else {
      action = { name: result.name, input: result.input }
    }
  } catch (e) {
    console.error('[f2/agent] dodo routing failed:', e)
    return { reply: 'F2: the dodo tripped — try that again.', thread_id: thread.id }
  }

  // Document writing runs in the background — web search plus a long
  // generation can outrun both the request and the client's patience.
  if (action.name === 'write_document') {
    const title = String(action.input.title ?? '').trim() || 'Document'
    const brief = String(action.input.brief ?? '').trim()
    if (!brief) {
      return { reply: 'F2: say what the document should cover.', thread_id: thread.id }
    }
    const now = new Date().toISOString()
    const reply = `F2: writing "${title}" — it'll land in Topic Context in a minute or two.`
    await appendMessages(thread.id, thread.user_id, thread.messages, [
      { role: 'user', text: originalText, created_at: now },
      { role: 'assistant', text: reply, created_at: now },
    ])
    return {
      reply,
      thread_id: thread.id,
      write_document: { thread_id: thread.id, title, brief, model },
    }
  }

  let reply: string
  try {
    reply = await runDodoAction(thread, action, model)
  } catch (e) {
    console.error(`[f2/agent] dodo action ${action.name} failed:`, e)
    reply = `F2: that didn't work (${e instanceof Error ? e.message : 'unknown error'}) — try again.`
  }

  const now = new Date().toISOString()
  await appendMessages(thread.id, thread.user_id, thread.messages, [
    { role: 'user', text: originalText, created_at: now },
    { role: 'assistant', text: reply, created_at: now },
  ])
  return { reply, thread_id: thread.id }
}

async function runDodoAction(
  thread: F2Thread,
  action: { name: string; input: Record<string, unknown> },
  model?: string,
): Promise<string> {
  const input = action.input
  switch (action.name) {
    case 'make_flash_card': {
      const question = String(input.question ?? '').trim()
      if (!question) return 'F2: the dodo needs the question for that card.'
      const answer = String(input.answer ?? '').trim() || undefined
      const card = await authorFlashCard(thread, question, model, answer)
      return `F2: card added — "${card.question}" → "${card.answer}".`
    }
    case 'add_flash_cards': {
      const count = Math.max(1, Math.min(30, Math.round(Number(input.count)) || 10))
      const focus = String(input.focus ?? '').trim()
      const cards = await generateFlashCards(thread, count, model, focus || undefined)
      return `F2: added ${cards.length} card${cards.length === 1 ? '' : 's'} to the deck${focus ? ` — ${focus}` : ''}.`
    }
    case 'redo_flash_cards': {
      const instructions = String(input.instructions ?? '').trim()
      if (!instructions) return 'F2: tell the dodo how the new deck should differ.'
      const cards = await redoFlashCards(thread, instructions, model)
      return `F2: rebuilt the deck — ${cards.length} new cards (${instructions}).`
    }
    case 'add_context_note': {
      const title = String(input.title ?? '').trim() || 'Note'
      const content = String(input.content ?? '').trim()
      if (!content) return 'F2: the note came out empty — say what it should cover.'
      await appendGeneratedSource(thread, title, content, true)
      return `F2: note "${title}" added to the topic's context.`
    }
    case 'set_study_focus': {
      const focus = String(input.focus ?? '').trim()
      const ok = await setStudyFocus(thread.id, thread.user_id, focus || null)
      if (!ok) return 'F2: could not save the study focus — try again.'
      return focus
        ? `F2: study focus set — "${focus}". Cards, quizzes, and the Final Review will stay inside it.`
        : 'F2: study focus cleared — everything is testable again.'
    }
    case 'answer_directly':
      return String(input.reply ?? '').trim() || 'F2: (no answer)'
    default:
      return `F2: the dodo doesn't know how to "${action.name}" yet.`
  }
}

/// File a generated note/document into the topic's context materials.
async function appendGeneratedSource(
  thread: F2Thread,
  title: string,
  content: string,
  note: boolean,
): Promise<void> {
  const next: F2AdditionalSource[] = [
    ...(thread.additional_sources ?? []),
    { url: null, title, content, added_at: new Date().toISOString(), note },
  ]
  await setAdditionalSources(thread.id, thread.user_id, next)
}

/// Write a study document from the topic's source material, with web search
/// available when the brief calls for outside or current information. Goes
/// straight to the Anthropic API (like book summaries) because the web_search
/// server tool isn't part of the model registry.
async function writeTopicDocument(
  thread: F2Thread,
  title: string,
  brief: string,
): Promise<string> {
  const subject = thread.topic ?? thread.url ?? 'this topic'
  const source = buildFullContent(thread).slice(0, 100_000)
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8192,
    system: `You write a study document for a learner's personal library. Ground every claim in the source material; use web search when the brief calls for outside, related, or current information — otherwise skip it. Where you add general knowledge, make it accurate. Write in plain, direct prose — no filler, no hype, none of the tics of AI writing. Markdown structure (headings, lists, tables) only where it genuinely helps the format the user asked for.

After any searching, reply with ONLY the document body — no preamble, no notes about your process.`,
    messages: [
      {
        role: 'user',
        content: `Topic: ${subject}

Source material:
${source || '(no source — write from general knowledge of the topic)'}

Document title: ${title}

What to write:
${brief}

Write the document.`,
      },
    ],
    tools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as never,
    ],
  })
  // The document is the text after the last search block — earlier text
  // blocks are between-search narration (same extraction as book-summary).
  let lastNonText = -1
  res.content.forEach((block, i) => {
    if (block.type !== 'text') lastNonText = i
  })
  return res.content
    .slice(lastNonText + 1)
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
}

/// The background half of the dodo agent's write_document action. Runs in
/// the messages route's after(); reports completion (or failure) by
/// appending to the topic's chat, which the client sees on next refresh.
export async function runWriteDocumentJob(
  userId: string,
  threadId: string,
  title: string,
  brief: string,
): Promise<void> {
  const done = async (text: string) => {
    const fresh = await getThreadById(userId, threadId)
    if (!fresh) return
    await appendMessages(fresh.id, fresh.user_id, fresh.messages, [
      { role: 'assistant', text, created_at: new Date().toISOString() },
    ])
  }
  try {
    const thread = await getThreadById(userId, threadId)
    if (!thread) return
    const doc = await writeTopicDocument(thread, title, brief)
    if (!doc) {
      await done(`F2: "${title}" came out empty — try rephrasing the ask.`)
      return
    }
    const words = doc.split(/\s+/).length
    await appendGeneratedSource(thread, title, doc, false)
    await done(`F2: "${title}" is ready — ~${words} words, filed in Topic Context.`)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[f2/agent] write_document job failed:', message)
    await done(`F2: writing "${title}" failed (${message.slice(0, 200)}) — try again.`)
  }
}

/// "summary <instructions>" — regenerate the active topic's audio summary +
/// transcript, steered by the user's instructions. Marks audio_summary as
/// `generating` (preserving prior versions) and returns a `regenerate_summary`
/// directive; the /api/f2/messages route runs the actual generation in the
/// background via after(). Needs an active topic to act on.
async function handleSummaryCommand(
  userId: string,
  threadId: string | undefined,
  instructions: string,
  model?: string,
): Promise<F2Reply> {
  const thread = threadId
    ? await getThreadById(userId, threadId)
    : await getLatestThread(userId)
  if (!thread) {
    return { reply: 'F2: open a topic first, then type "summary" (optionally with how to change it, e.g. "summary make it longer" or "summary 40 minutes").' }
  }

  // Mark generating, preserving any prior transcript/version history so a
  // failure or the in-flight window never drops the base + augmented set.
  const now = new Date().toISOString()
  await setAudioSummary(thread.id, thread.user_id, {
    ...(thread.audio_summary ?? {}),
    status: 'generating',
    updated_at: now,
  })

  const label = thread.topic ?? thread.url ?? 'this topic'
  const how = instructions ? ` (${instructions})` : ''
  const reply =
    `F2 is regenerating the summary for "${label}"${how}. ` +
    'It\'ll show up in Topic Context, and the Play chip will use the new audio, in a minute or two.'

  // Log the exchange so the command + reply appear in the topic's chat.
  await appendMessages(thread.id, thread.user_id, thread.messages, [
    { role: 'user', text: instructions ? `summary ${instructions}` : 'summary', created_at: now },
    { role: 'assistant', text: reply, created_at: now },
  ])

  return {
    reply,
    thread_id: thread.id,
    regenerate_summary: { thread_id: thread.id, instructions: instructions || null, model },
  }
}

/// "new none <topic>" — create a fresh chat-only topic (no videos, no
/// sources) and open it with a short model-generated framing. Uses the
/// client's selected model so the opening matches the rest of the chat.
async function handleNewNone(
  userId: string,
  client: F2Client,
  handle: string,
  userMessage: string,
  topicPhrase: string,
  model?: string,
): Promise<F2Reply> {
  if (!topicPhrase) {
    return { reply: 'F2: name the topic — e.g. new none quantum physics.' }
  }

  const title =
    (await nameTopic({ body: topicPhrase, documentTitle: topicPhrase })) || topicPhrase

  let opening = ''
  try {
    const result = await llmComplete({
      model,
      system:
        `You are F2 — a learning companion. The user just started a fresh learning topic: "${title}". ` +
        'Open it: 2-4 sentences framing what the subject covers and asking where they want to start. ' +
        'Be direct, no preambles, plain text, no markdown.',
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 600,
    })
    opening = result.type === 'text' ? result.text : ''
  } catch (err) {
    console.error('[f2] new-none opening failed:', err)
  }

  const thread = await createThread({ userId, client, handle, topic: title })
  if (!thread) {
    return { reply: "F2: couldn't create that topic. Try again in a sec." }
  }

  const reply = opening || `New topic: ${title}. What do you want to dig into first?`
  const now = new Date().toISOString()
  await appendMessages(thread.id, thread.user_id, [], [
    { role: 'user', text: userMessage, created_at: now },
    { role: 'assistant', text: reply, created_at: now },
  ])
  return { reply, thread_id: thread.id }
}

/// The router picked more_videos: find 3 videos the topic doesn't already
/// have, in the topic's original length band, and attach them as additional
/// sources. Legacy "setup:" topics have no stored band and default to long.
async function handleMoreVideos(
  thread: F2Thread,
  userText: string,
  refinement: string | null,
): Promise<F2Reply> {
  const band: VideoBand = thread.video_band ?? 'long'
  const subject = thread.topic ?? thread.url ?? ''
  const request = refinement ? `${subject} — ${refinement}` : subject

  const excludeIds = [thread.url, ...(thread.additional_sources ?? []).map((s) => s.url)]
    .map(youtubeVideoId)
    .filter((id): id is string => id !== null)

  try {
    const result = await findExplainerVideos(request, { band, excludeIds })
    if (!result || result.picks.length === 0) {
      return {
        reply: `F2: couldn't find more solid ${bandLabel(band)} videos on this beyond what you have. Try narrowing the angle — e.g. "3 more on <subtopic>".`,
        thread_id: thread.id,
      }
    }

    const picks = result.picks
    const transcripts = await Promise.all(
      picks.map((p) =>
        fetchUrlContent(p.url)
          .then((r) => r.body)
          .catch(() => null),
      ),
    )

    const now = new Date().toISOString()
    const extra: F2AdditionalSource[] = picks.map((p, i) => ({
      url: p.url,
      title: p.title,
      content: transcripts[i] ?? null,
      added_at: now,
    }))
    await setAdditionalSources(thread.id, thread.user_id, [
      ...(thread.additional_sources ?? []),
      ...extra,
    ])

    const lines = picks
      .map((p, i) => `${i + 1}. ${p.title} — ${p.channel} (${Math.round(p.durationSec / 60)} min)\n${p.url}`)
      .join('\n')
    const withTranscripts = transcripts.filter(Boolean).length
    const reply =
      `F2 found ${picks.length} more:\n\n${lines}\n\n` +
      `Transcripts added for ${withTranscripts} of ${picks.length} — they're part of this topic now.`

    await appendMessages(thread.id, thread.user_id, thread.messages, [
      { role: 'user', text: userText, created_at: now },
      { role: 'assistant', text: reply, created_at: now },
    ])
    return { reply, thread_id: thread.id }
  } catch (err) {
    console.error('[f2] handleMoreVideos failed:', err)
    return {
      reply: 'F2: hit a snag finding more videos (the search or transcripts failed). Try again in a moment.',
      thread_id: thread.id,
    }
  }
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
  model?: string,
): Promise<F2Reply> {
  let reply: string
  try {
    reply = await askReflectionQuestion(thread, userText, model)
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
  model?: string,
): Promise<F2Reply> {
  let ack: string
  try {
    ack = await acknowledgeReflectionAnswer(thread, userText, model)
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
  model: string | undefined,
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
    return startReflectionTurn(thread, userText, model)
  }
  if (thread && thread.pending_quiz_kind === 'reflection') {
    return completeReflectionTurn(thread, userText, model)
  }

  let action
  try {
    action = await routeAndReply(thread, userText, model)
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
    case 'more_videos': {
      if (!thread) {
        // Defensive: the tool is only offered when a video thread is active.
        return { reply: 'F2: open a video topic first, then ask for more videos.' }
      }
      return handleMoreVideos(thread, userText, action.refinement)
    }
  }
}
