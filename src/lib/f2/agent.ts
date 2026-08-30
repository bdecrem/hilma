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
  createArtifact,
  deleteArtifact,
  listArtifacts,
  updateArtifact,
  type F2Artifact,
} from './artifacts'
import {
  confirmImessagePairing,
  listImessageHandles,
  removeImessageHandle,
  sendPairingMessage,
  startImessagePairing,
} from './imessage'
import {
  MAX_VOICE_STYLE_CHARS,
  getVoicePrefs,
  isKnownVoice,
  saveVoicePrefs,
} from './realtime'
import { RECERT_INTERVAL_DAYS, scheduleRecertDue } from './flash'
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
  buildBudgetedContent,
  buildFullContent,
  type F2Thread,
  type F2AdditionalSource,
} from './threads'
import {
  authorFlashCard,
  completePeckLevels,
  generateFlashCards,
  isMastered,
  listFlashCards,
  listFlashSets,
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
import { f2Supabase } from './supabase'
import { llmComplete } from './llm'
import { setAudioSummary } from './audio-summary'
import { getDailyStreak, setDailyStreak, streakMultiplier } from './streak'
import { maybeHandleDailyAnswer } from './daily-card'

export type F2Client = 'imessage' | 'web' | 'ios' | 'sms'

export type F2Message = {
  userId: string
  handle: string
  text: string
  client: F2Client
  threadId?: string
  /** Force a brand-new topic for this message (ignore threadId / the latest
   *  thread). The router still writes the opening reply; the topic is named by
   *  the usual pipeline. Used by clients whose "New topic" is a first question
   *  (Dodo for Macintosh). */
  newTopic?: boolean
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
  const { userId, client, handle, threadId, model, newTopic } = input
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

  // Daily flash card: over iMessage, a plain text while a daily card is
  // pending is its answer — graded with a correction and a little XP.
  // Commands and URLs above still work mid-pending.
  if (client === 'imessage' || client === 'sms') {
    const dailyReply = await maybeHandleDailyAnswer(userId, text)
    if (dailyReply) return { reply: dailyReply }
  }

  return handleNonUrl(userId, client, handle, text, threadId, model, newTopic === true)
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

// The dodo agent's client-side tools (the web_search server tool is added
// at request time). Executed in a loop so one command can read a memo,
// verify points on the web, update it in place, and report back.
const DODO_AGENT_TOOLS = [
  {
    name: 'read_context_source',
    description:
      "Read a note or document filed in the topic's context materials, by (partial) title. Always read a source before updating it. An empty title lists what's on file.",
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Full or partial title, case-insensitive. "" to list all sources.' },
      },
      required: [],
    },
  },
  {
    name: 'update_context_source',
    description:
      "Replace the content of an existing note or document in the topic's context materials. Preserve everything the user didn't ask to change — read the source first, then write the complete revised content.",
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Full or partial title of the source to update (must match exactly one).' },
        new_content: { type: 'string', description: 'The complete revised content (replaces the old body).' },
        new_title: { type: 'string', description: 'Optional new title, when the user asked to rename it.' },
      },
      required: ['title', 'new_content'],
    },
  },
  {
    name: 'make_flash_card',
    description:
      'Create ONE specific flash card the user dictated — a question, optionally with the answer they want.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: "The card's question, as the user intends it." },
        answer: {
          type: 'string',
          description: 'ONLY when the user dictated the answer too. Omit to answer from the source material.',
        },
        topic: { type: 'string', description: 'Another topic (by name) to file the card in. Omit = this topic.' },
      },
      required: ['question'],
    },
  },
  {
    name: 'add_flash_cards',
    description:
      'Generate additional cards into the existing deck (keeps current cards). Use for "make more cards", "add 5 cards about X".',
    input_schema: {
      type: 'object' as const,
      properties: {
        count: { type: 'integer', description: 'How many to add. Default 10 when the user did not say.' },
        focus: { type: 'string', description: 'What the new cards should focus on, when the user said so.' },
        topic: { type: 'string', description: 'Another topic (by name) to add the cards to. Omit = this topic.' },
      },
      required: ['count'],
    },
  },
  {
    name: 'redo_flash_cards',
    description:
      'Rebuild the WHOLE deck to the user\'s spec — replaces every existing card. Use for "redo the flash cards ...", "rebuild the deck focusing on ...".',
    input_schema: {
      type: 'object' as const,
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
      "File a NEW note in a topic's context materials (not an edit of an existing one — use update_context_source for that). Keep the user's substance when they dictated it.",
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Short title for the note (a few words).' },
        content: { type: 'string', description: 'The note body. Plain prose.' },
        topic: { type: 'string', description: 'Another topic (by name) to file it in. Omit = this topic.' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'write_document',
    description:
      "Create a NEW full document (study guide, outline, timeline, comparison...) from the topic's material — it is written in the background and files itself into the context materials. Tell the user it's on the way.",
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Document title.' },
        brief: {
          type: 'string',
          description:
            "What to write and how — the user's ask plus anything from the conversation needed to write it well.",
        },
      },
      required: ['title', 'brief'],
    },
  },
  {
    name: 'list_quotes',
    description:
      "Read the user's saved quote cards (\"pebbles\") — id, text, source, and which topic each is filed under. Defaults to this topic's; all_topics for the whole shelf. ALWAYS list before updating or deleting one.",
    input_schema: {
      type: 'object' as const,
      properties: {
        all_topics: {
          type: 'boolean',
          description: "true to see every topic's quotes, not just this one's.",
        },
      },
      required: [],
    },
  },
  {
    name: 'save_quote',
    description:
      'Save a quote card ("pebble") — a passage worth keeping. It shows in the Quotes shelf and resurfaces while flash rounds are graded. Files under THIS topic unless topic_title names another of the user\'s topics. To put one quote on two topics, save it twice.',
    input_schema: {
      type: 'object' as const,
      properties: {
        body: { type: 'string', description: 'The quote text, verbatim as the user wants it kept.' },
        source: { type: 'string', description: 'Where it\'s from ("Sapiens, ch. 5"). Omit if unknown.' },
        topic_title: {
          type: 'string',
          description: 'Full or partial title of ANOTHER topic to file it under. Omit for this topic.',
        },
      },
      required: ['body'],
    },
  },
  {
    name: 'update_quote',
    description:
      'Edit an existing quote card. Match by id (prefix is fine) or a distinctive text snippet — list_quotes first. Only the fields you pass change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        match: { type: 'string', description: 'Quote id (or prefix), or a snippet of its text.' },
        new_body: { type: 'string', description: 'Replacement text. Omit to keep.' },
        new_source: { type: 'string', description: 'Replacement source line; "" clears it. Omit to keep.' },
      },
      required: ['match'],
    },
  },
  {
    name: 'delete_quote',
    description:
      'Delete a quote card for good. Match by id (prefix is fine) or a distinctive text snippet — list_quotes first, and only delete what the user clearly pointed at.',
    input_schema: {
      type: 'object' as const,
      properties: {
        match: { type: 'string', description: 'Quote id (or prefix), or a snippet of its text.' },
      },
      required: ['match'],
    },
  },
  {
    name: 'set_topic_stars',
    description:
      "Set THIS topic's star count (0-3) directly — the user's progress is theirs to edit. 3 stars = the gold mastery badge; setting below 3 removes the badge and its refresher schedule. Use when the user asks to remove/grant stars, clear the \"final review passed\" badge, or reset progress.",
    input_schema: {
      type: 'object' as const,
      properties: {
        stars: { type: 'integer', description: '0, 1, 2 or 3.' },
      },
      required: ['stars'],
    },
  },
  {
    name: 'update_topic',
    description:
      'Rename this topic, change its type, pin/unpin it, or include/exclude its deck from Peck. Only the fields you pass change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        new_title: { type: 'string', description: 'New topic name.' },
        kind: { type: 'string', description: 'Topic type: book | mini | general | web | video | audio | paste | chat.' },
        pinned: { type: 'boolean', description: 'Pin (true) or unpin (false).' },
        peck_excluded: { type: 'boolean', description: 'true takes its cards out of Peck sets and the daily card.' },
        peck_weight: { type: 'number', description: 'Peck draw multiplier for this deck (0.5 = half as often, 2 or 5 = more often, 1 = normal).' },
      },
      required: [],
    },
  },
  {
    name: 'delete_topic',
    description:
      'Permanently delete a topic and everything on it. ONLY call after the user has explicitly and unambiguously asked to delete THIS topic in this conversation — never to tidy up on your own.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic_title: { type: 'string', description: "The topic's title, repeated back as confirmation." },
      },
      required: ['topic_title'],
    },
  },
  {
    name: 'get_settings',
    description:
      "The user's account settings: daily-card toggle, paired iMessage handles, refresher toggle, and voice preference. Read before changing anything.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'update_settings',
    description:
      'Change account settings the user asked for: the daily iMessage card, the refresher toggle (off = mastery is forever), or the realtime voice + speaking-style. Only passed fields change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        daily_card_enabled: { type: 'boolean', description: 'Daily card over iMessage (needs a paired handle to enable).' },
        recert_enabled: { type: 'boolean', description: 'false = no refresher quizzes or nudges, badges never dim.' },
        voice: { type: 'string', description: 'Realtime voice name; "" resets to default.' },
        voice_style: { type: 'string', description: 'Standing speaking-style instruction; "" clears it.' },
      },
      required: [],
    },
  },
  {
    name: 'pair_imessage',
    description:
      'Start pairing an iMessage handle (phone number or iCloud email) for the daily card: a 6-digit code is sent to that handle. The user reads the code back to you; then call confirm_imessage. Use remove target "remove_imessage" to unpair.',
    input_schema: {
      type: 'object' as const,
      properties: {
        handle: { type: 'string', description: 'Phone number (+1…) or iCloud email.' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'confirm_imessage',
    description: 'Finish iMessage pairing with the 6-digit code the user received.',
    input_schema: {
      type: 'object' as const,
      properties: {
        handle: { type: 'string', description: 'The handle being paired.' },
        code: { type: 'string', description: 'The 6-digit code.' },
      },
      required: ['handle', 'code'],
    },
  },
  {
    name: 'remove_imessage',
    description: 'Unpair an iMessage handle.',
    input_schema: {
      type: 'object' as const,
      properties: {
        handle: { type: 'string', description: 'The handle to remove.' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'list_flash_cards',
    description:
      "Read the topic's current deck with per-card learning state (priority/buried, times seen, streak, lapses, mastered, due date). ALWAYS call this before answering any question about the deck — what's in it, which cards are weak or unmastered, which are marked important, how many there are.",
    input_schema: {
      type: 'object' as const,
      properties: {
        include_buried: {
          type: 'boolean',
          description: 'Include cards the user buried (thumbs-down). Default false.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_progress',
    description:
      "The user's progress on THIS topic: stars, study focus, deck size, recent flash-set scores, and every graded review (Final Review / Second Chance) with its grade, feedback, strengths, and weaknesses. ALWAYS call this before answering questions like \"what was my grade\", \"how am I doing\", or \"what should I review\".",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'set_study_focus',
    description:
      'Scope what the user is tested on ("only test me on the first half"). Applies to flash cards, quizzes, and the Final Review. Empty string clears the focus.',
    input_schema: {
      type: 'object' as const,
      properties: {
        focus: { type: 'string', description: 'The focus instruction, or "" to clear it.' },
      },
      required: ['focus'],
    },
  },
  {
    name: 'list_topics',
    description:
      "Every topic on the user's account (name, type, stars, pinned, Peck status). Call before creating a topic (avoid duplicates) or targeting another topic by name.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_topic',
    description:
      'Create a NEW topic on the account. Give a url (its content is fetched — YouTube transcripts included — and the topic names itself) OR a title, optionally with source_text as its study material. Then file cards/notes into it by passing its name as `topic` on the other tools.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Topic name. Omit when giving a url (it will be auto-named).' },
        url: { type: 'string', description: 'Source URL to ingest as the primary material.' },
        source_text: { type: 'string', description: 'Text to store as the primary study material (user-dictated or from this chat).' },
        kind: { type: 'string', description: 'Topic type: book | mini | general | web | video | audio | paste | chat. Omit to auto-classify.' },
      },
      required: [],
    },
  },
  {
    name: 'complete_peck_level',
    description:
      "Mark a Peck level as passed without playing it — the user's level map is theirs to edit. Levels pass in order, so this clears every unpassed level up to the one given and unlocks the next. Granted levels pay no XP. Only on an explicit ask.",
    input_schema: {
      type: 'object' as const,
      properties: {
        level: {
          type: 'integer',
          description:
            'The level to mark passed. Omit to pass the currently unlocked level.',
        },
      },
      required: [],
    },
  },
  {
    name: 'set_daily_streak',
    description:
      "Set the user's daily-card streak (the Peck flame) to an exact day count — restore a streak lost to an outage or missed day, or reset it to 0. The multiplier follows automatically (x2 at 4+, x3 at 10+, x4 at 14+).",
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'integer', description: 'The streak day count. 0 clears it.' },
      },
      required: ['days'],
    },
  },
]

/// Match one saved quote by id (prefix) or text/source snippet. Exactly one
/// hit or an error the agent can act on.
function matchQuote(
  quotes: F2Artifact[],
  raw: string,
): { quote: F2Artifact } | { error: string } {
  const needle = raw.trim().toLowerCase()
  if (!needle) return { error: 'Error: match is empty — pass an id or a text snippet.' }
  const hits = quotes.filter(
    (q) =>
      q.id.toLowerCase().startsWith(needle) ||
      q.body.toLowerCase().includes(needle) ||
      (q.source ?? '').toLowerCase().includes(needle),
  )
  if (hits.length === 1) return { quote: hits[0] }
  const listing = quotesListingText(quotes)
  if (hits.length === 0) return { error: `No quote matches "${raw}". ${listing}` }
  return { error: `"${raw}" matches ${hits.length} quotes — be more specific. ${listing}` }
}

function quotesListingText(quotes: F2Artifact[]): string {
  if (quotes.length === 0) return 'No quotes saved.'
  const lines = quotes.map(
    (q) =>
      `- ${q.id.slice(0, 8)} · ${q.topic ?? '(no topic)'}${q.source ? ` · ${q.source}` : ''} · "${q.body.slice(0, 120)}${q.body.length > 120 ? '…' : ''}"`,
  )
  return `Quotes:\n${lines.join('\n')}`
}

/// Case-insensitive title match over the topic's context sources.
function matchContextSource(
  sources: F2AdditionalSource[],
  title: string,
): { index: number; source: F2AdditionalSource } | { error: string } {
  const needle = title.trim().toLowerCase()
  const titled = sources
    .map((source, index) => ({ source, index }))
    .filter((e) => (e.source.title ?? '').trim())
  if (!needle) return { error: listSourcesText(sources) }
  const hits = titled.filter((e) => (e.source.title ?? '').toLowerCase().includes(needle))
  if (hits.length === 1) return hits[0]
  if (hits.length === 0) return { error: `No source matches "${title}". ${listSourcesText(sources)}` }
  return {
    error: `"${title}" matches ${hits.length} sources — be more specific. ${listSourcesText(sources)}`,
  }
}

function listSourcesText(sources: F2AdditionalSource[]): string {
  const titles = sources
    .filter((s) => (s.title ?? '').trim())
    .map((s, i) => `${i + 1}. ${s.title} (${(s.content ?? '').length} chars${s.note ? ', note' : ''})`)
  return titles.length > 0 ? `Sources on file:\n${titles.join('\n')}` : 'No titled sources on file yet.'
}

/// "dodo <instruction>" — an agent loop over the active topic's materials.
/// One command can read the filed notes/documents, verify points with web
/// search, apply edits in place, and end with a substantive report. The
/// conversation continues across "dodo ..." messages (recent chat is fed in),
/// so user and agent can decide together, then apply.
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
        `F2: tell the dodo what to do with "${label}" — e.g. "dodo make a flash card asking …", "dodo update the briefing memo: …", "dodo redo the flash cards focusing on …", "dodo write a study guide and add it to context", "dodo only test me on the first half".`,
      thread_id: thread.id,
    }
  }

  // Max context: Opus runs this loop with a 1M-token window — hand it
  // the full material (soft ceiling only for pathological inputs).
  const primary = buildBudgetedContent(thread, 3_000_000)
  const recentChat = thread.messages
    .slice(-40)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
    .slice(0, 60_000)

  const system = `You are the dodo — the content agent for the learning topic "${label}". The user routes messages to you by starting them with "dodo". You manage this topic's study materials, and you work like a careful assistant: read before you edit, verify what you're unsure of, apply the user's decisions, then report back.

How to work:
- This is a conversation. When acting needs a decision only the user can make, ask briefly instead of guessing — their next "dodo ..." message continues the exchange (you see recent chat).
- "Clean up / fold in / fix the memo" means EDIT THE EXISTING SOURCE: read_context_source first, apply their decisions, use web_search for the points they want validated (or that you can't confirm), then update_context_source with the complete revised content.
- End with a report that carries the substance: what you changed, what you confirmed and the answer you found, and a short numbered list of anything that still needs their input. Never reply with just "done".
- Card work: "redo" replaces the deck; "make"/"add" keep it. write_document runs in the background — say it's on the way.
- Deck and progress questions are answered from REAL DATA, never from memory or guesswork: "which cards am I weak on / haven't memorized", "what's in my deck" → list_flash_cards first; "what was my grade", "how am I doing", "what should I review" → get_progress first. You have full access to the deck, its learning stats, quiz scores, and review grades — never claim you can't see them.
- "How I want to be tested" instructions ("only test me on X", "focus quizzes on Y") → set_study_focus. It scopes flash cards, quizzes, and the Final Review.
- Quote cards ("pebbles" — the Quotes shelf): save_quote / update_quote / delete_quote, with list_quotes first for edits and deletes. "Save this quote", "add a pebble", "delete the Sapiens quote" all land here. You CAN add, edit, and delete them — never claim otherwise.
- You have FULL AUTHORITY over everything in the user's own account, and your reach is the WHOLE ACCOUNT, not just this topic — see every topic (list_topics), create new topics (create_topic, from a URL, a title, or dictated text), and file cards or notes into ANY topic by passing its name as the "topic" argument on make_flash_card / add_flash_cards / add_context_note. Stars and badges (set_topic_stars), topic names/types/pins (update_topic), the daily-card streak and its Peck flame (set_daily_streak — restore after an outage, or reset), Peck levels (complete_peck_level — mark a level passed so the next unlocks), account settings (get_settings/update_settings), and iMessage pairing (pair_imessage → confirm_imessage) are all yours too. "Remove the gold badge", "restore my streak to 5", "make a new topic for this and file these cards there", "rename this" — never claim you lack the ability or that your reach is limited to this topic. Destructive moves (delete_topic, dropping stars, zeroing a streak) only on an explicit ask, and say plainly what you changed.
- If the message is just chat addressed to the dodo, answer it directly without tools.
- Plain text replies, no markdown.`

  const firstUser = `Topic source material (excerpt):
${primary || '(no primary source — the chat and filed materials are the source)'}

${listSourcesText(thread.additional_sources ?? [])}

Recent chat:
${recentChat || '(none)'}

The user's message:
${instruction}`

  // The loop needs the web_search server tool, so it goes straight to the
  // Anthropic API (Opus) rather than through the model registry.
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 8 } as never,
    ...DODO_AGENT_TOOLS,
  ]

  let writeDoc: F2Reply['write_document']
  let reply = ''
  try {
    // `current` tracks the thread as tools mutate it (sources, cards).
    let current = thread
    const messages: { role: 'user' | 'assistant'; content: unknown }[] = [
      {
        role: 'user',
        // The full source rides in this first message (often hundreds of
        // thousands of tokens) — cache it so turns 2+ of the loop read the
        // prefix at 0.1x instead of re-processing the whole book each turn.
        content: [
          { type: 'text', text: firstUser, cache_control: { type: 'ephemeral' } },
        ],
      },
    ]
    for (let turn = 0; turn < 10; turn++) {
      const res = await anthropic.messages.create({
        model: 'claude-opus-5',
        max_tokens: 6000,
        system,
        tools,
        messages: messages as never,
      })
      messages.push({ role: 'assistant', content: res.content })

      // Server-side tool loop paused — re-send to let it continue.
      if (res.stop_reason === 'pause_turn') continue

      const toolUses = res.content.filter((b) => b.type === 'tool_use')
      if (res.stop_reason !== 'tool_use' || toolUses.length === 0) {
        // Done — the reply is the text after the last tool/search block.
        let lastNonText = -1
        res.content.forEach((block, i) => {
          if (block.type !== 'text') lastNonText = i
        })
        reply = res.content
          .slice(lastNonText + 1)
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('')
          .trim()
        break
      }

      const results: unknown[] = []
      for (const tu of toolUses) {
        let out: string
        try {
          const r = await executeDodoTool(current, tu.name, tu.input as Record<string, unknown>, model)
          out = r.result
          if (r.writeDoc) writeDoc = r.writeDoc
          if (r.mutated) {
            current = (await getThreadById(userId, current.id)) ?? current
          }
        } catch (e) {
          out = `Error: ${e instanceof Error ? e.message : String(e)}`
        }
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out })
      }
      messages.push({ role: 'user', content: results })
    }
    if (!reply) reply = 'F2: the dodo ran out of turns mid-task — ask it to continue.'
  } catch (e) {
    console.error('[f2/agent] dodo loop failed:', e)
    return { reply: 'F2: the dodo tripped — try that again.', thread_id: thread.id }
  }

  const fresh = (await getThreadById(userId, thread.id)) ?? thread
  const now = new Date().toISOString()
  await appendMessages(fresh.id, fresh.user_id, fresh.messages, [
    { role: 'user', text: originalText, created_at: now },
    { role: 'assistant', text: reply, created_at: now },
  ])
  return {
    reply,
    thread_id: thread.id,
    ...(writeDoc ? { write_document: writeDoc } : {}),
  }
}

/// Resolve the optional cross-topic `topic` argument: absent = the active
/// thread; otherwise match another of the user's topics by name.
async function resolveTargetThread(
  thread: F2Thread,
  input: Record<string, unknown>,
): Promise<{ target: F2Thread; error?: undefined } | { target?: undefined; error: string }> {
  const name = String(input.topic ?? '').trim()
  if (!name) return { target: thread }
  const hit = await matchTopicByName(thread.user_id, name)
  if (!hit) {
    const topics = await listTopicsForUser(thread.user_id)
    const listing = topics.slice(0, 40).map((t) => `- ${t.topic ?? t.url}`).join('\n')
    return { error: `No single topic matches "${name}". Topics on the account:\n${listing}` }
  }
  return { target: hit }
}

/// Execute one client-side dodo tool. `mutated` tells the loop to refetch
/// the thread so later tool calls see the new state.
async function executeDodoTool(
  thread: F2Thread,
  name: string,
  input: Record<string, unknown>,
  model?: string,
): Promise<{ result: string; mutated?: boolean; writeDoc?: F2Reply['write_document'] }> {
  switch (name) {
    case 'read_context_source': {
      const sources = thread.additional_sources ?? []
      const match = matchContextSource(sources, String(input.title ?? ''))
      if ('error' in match) return { result: match.error }
      const full = match.source.content ?? ''
      const body = full.slice(0, 200_000)
      // Say so when clipped — otherwise the agent mistakes the read cap
      // for a truncated file and reports phantom missing content.
      const clipped =
        full.length > body.length
          ? `\n\n[READ WINDOW LIMIT: showing the first ${body.length} of ${full.length} characters. The stored source itself is complete — do not report it as cut.]`
          : ''
      return { result: `Title: ${match.source.title}\n\n${body || '(empty)'}${clipped}` }
    }
    case 'update_context_source': {
      const sources = thread.additional_sources ?? []
      const match = matchContextSource(sources, String(input.title ?? ''))
      if ('error' in match) return { result: match.error }
      const newContent = String(input.new_content ?? '').trim()
      if (!newContent) return { result: 'Error: new_content is empty.' }
      const next = [...sources]
      next[match.index] = {
        ...match.source,
        title: String(input.new_title ?? '').trim() || match.source.title,
        content: newContent,
      }
      await setAdditionalSources(thread.id, thread.user_id, next)
      return {
        result: `Updated "${next[match.index].title}" (${newContent.length} chars).`,
        mutated: true,
      }
    }
    case 'make_flash_card': {
      const question = String(input.question ?? '').trim()
      if (!question) return { result: 'Error: question required.' }
      const t = await resolveTargetThread(thread, input)
      if (!t.target) return { result: t.error }
      const answer = String(input.answer ?? '').trim() || undefined
      const card = await authorFlashCard(t.target, question, model, answer)
      const where = t.target.id === thread.id ? '' : ` in "${t.target.topic}"`
      return { result: `Card added${where} — "${card.question}" → "${card.answer}".` }
    }
    case 'add_flash_cards': {
      const count = Math.max(1, Math.min(30, Math.round(Number(input.count)) || 10))
      const focus = String(input.focus ?? '').trim()
      const t = await resolveTargetThread(thread, input)
      if (!t.target) return { result: t.error }
      const cards = await generateFlashCards(t.target, count, model, focus || undefined)
      const where = t.target.id === thread.id ? 'the deck' : `"${t.target.topic}"`
      return { result: `Added ${cards.length} cards to ${where}${focus ? ` — ${focus}` : ''}.` }
    }
    case 'redo_flash_cards': {
      const instructions = String(input.instructions ?? '').trim()
      if (!instructions) return { result: 'Error: instructions required.' }
      const cards = await redoFlashCards(thread, instructions, model)
      return { result: `Rebuilt the deck — ${cards.length} new cards.` }
    }
    case 'add_context_note': {
      const title = String(input.title ?? '').trim() || 'Note'
      const content = String(input.content ?? '').trim()
      if (!content) return { result: 'Error: content required.' }
      const t = await resolveTargetThread(thread, input)
      if (!t.target) return { result: t.error }
      await appendGeneratedSource(t.target, title, content, true)
      const where = t.target.id === thread.id ? "the topic's" : `"${t.target.topic}"'s`
      return { result: `Note "${title}" filed in ${where} context.`, mutated: t.target.id === thread.id }
    }
    case 'write_document': {
      const title = String(input.title ?? '').trim() || 'Document'
      const brief = String(input.brief ?? '').trim()
      if (!brief) return { result: 'Error: brief required.' }
      return {
        result: `Started writing "${title}" in the background — it will file itself into Topic Context in a minute or two. Tell the user it's on the way.`,
        writeDoc: { thread_id: thread.id, title, brief, model },
      }
    }
    case 'list_quotes': {
      const all = await listArtifacts(thread.user_id)
      const quotes = input.all_topics === true ? all : all.filter((q) => q.thread_id === thread.id)
      const scope = input.all_topics === true ? 'all topics' : 'this topic'
      return { result: `${quotes.length} quote(s) on ${scope}.\n${quotesListingText(quotes)}` }
    }
    case 'save_quote': {
      const body = String(input.body ?? '').trim()
      if (!body) return { result: 'Error: body required.' }
      const source = String(input.source ?? '').trim() || null
      let targetThreadId = thread.id
      let targetLabel = thread.topic ?? 'this topic'
      const topicTitle = String(input.topic_title ?? '').trim()
      if (topicTitle) {
        const target = await matchTopicByName(thread.user_id, topicTitle)
        if (!target) return { result: `Error: no topic matches "${topicTitle}".` }
        targetThreadId = target.id
        targetLabel = target.topic ?? target.url ?? 'that topic'
      }
      const artifact = await createArtifact(thread.user_id, {
        body,
        source,
        thread_id: targetThreadId,
      })
      if (!artifact) return { result: 'Error: save failed.' }
      return { result: `Quote saved under "${targetLabel}" (id ${artifact.id.slice(0, 8)}).` }
    }
    case 'update_quote': {
      const quotes = await listArtifacts(thread.user_id)
      const match = matchQuote(quotes, String(input.match ?? ''))
      if ('error' in match) return { result: match.error }
      const patch: { body?: string; source?: string | null } = {}
      if (typeof input.new_body === 'string' && input.new_body.trim()) patch.body = input.new_body
      if (typeof input.new_source === 'string') patch.source = input.new_source.trim() || null
      if (Object.keys(patch).length === 0)
        return { result: 'Error: nothing to change — pass new_body and/or new_source.' }
      const ok = await updateArtifact(thread.user_id, match.quote.id, patch)
      return { result: ok ? `Quote ${match.quote.id.slice(0, 8)} updated.` : 'Error: update failed.' }
    }
    case 'delete_quote': {
      const quotes = await listArtifacts(thread.user_id)
      const match = matchQuote(quotes, String(input.match ?? ''))
      if ('error' in match) return { result: match.error }
      const ok = await deleteArtifact(thread.user_id, match.quote.id)
      return {
        result: ok
          ? `Deleted the quote "${match.quote.body.slice(0, 60)}…" (${match.quote.id.slice(0, 8)}).`
          : 'Error: delete failed.',
      }
    }
    case 'set_topic_stars': {
      const stars = Math.max(0, Math.min(3, Math.round(Number(input.stars))))
      const update: Record<string, unknown> = { stars }
      if (stars < 3) {
        // Dropping below gold retires the badge machinery too.
        update.hard_quiz_completed_at = null
        update.recert_due_at = null
        update.recert_stage = 0
      } else {
        update.hard_quiz_completed_at = new Date().toISOString()
        update.recert_stage = 0
        update.recert_due_at = await scheduleRecertDue(
          thread.user_id, thread.id, Date.now(), RECERT_INTERVAL_DAYS[0],
        )
      }
      const { error } = await f2Supabase()
        .from('f2_threads')
        .update(update)
        .eq('id', thread.id)
        .eq('user_id', thread.user_id)
      if (error) return { result: 'Error: could not update stars.' }
      return {
        result: stars < 3
          ? `Stars set to ${stars} — the gold badge and its refresher schedule are gone.`
          : 'Stars set to 3 — gold badge granted, first refresher in 30 days.',
        mutated: true,
      }
    }
    case 'update_topic': {
      const update: Record<string, unknown> = {}
      const changes: string[] = []
      if (typeof input.new_title === 'string' && input.new_title.trim()) {
        update.topic = input.new_title.trim()
        changes.push(`renamed to "${update.topic}"`)
      }
      if (typeof input.kind === 'string' && input.kind.trim()) {
        update.kind = input.kind.trim()
        changes.push(`type → ${update.kind}`)
      }
      if (typeof input.pinned === 'boolean') {
        update.pinned_at = input.pinned ? new Date().toISOString() : null
        changes.push(input.pinned ? 'pinned' : 'unpinned')
      }
      if (typeof input.peck_excluded === 'boolean') {
        update.peck_excluded = input.peck_excluded
        changes.push(input.peck_excluded ? 'out of Peck' : 'back in Peck')
      }
      if (input.peck_weight !== undefined) {
        const w = Number(input.peck_weight)
        if (!Number.isFinite(w) || w <= 0) return { result: 'Error: peck_weight must be a positive number.' }
        const clamped = Math.max(0.25, Math.min(10, w))
        update.peck_weight = clamped
        changes.push(`Peck draw weight x${clamped}`)
      }
      if (changes.length === 0) return { result: 'Error: nothing to change.' }
      const { error } = await f2Supabase()
        .from('f2_threads')
        .update(update)
        .eq('id', thread.id)
        .eq('user_id', thread.user_id)
      if (error) return { result: 'Error: update failed.' }
      return { result: `Topic updated: ${changes.join(', ')}.`, mutated: true }
    }
    case 'delete_topic': {
      const title = String(input.topic_title ?? '').trim().toLowerCase()
      const actual = (thread.topic ?? '').trim().toLowerCase()
      if (!title || !actual.includes(title.slice(0, 24))) {
        return { result: `Error: title mismatch — this topic is "${thread.topic ?? '(untitled)'}". Repeat its title to confirm.` }
      }
      const { error } = await f2Supabase()
        .from('f2_threads')
        .delete()
        .eq('id', thread.id)
        .eq('user_id', thread.user_id)
      if (error) return { result: 'Error: delete failed.' }
      return { result: `Deleted "${thread.topic}". This chat thread is gone with it.`, mutated: true }
    }
    case 'get_settings': {
      const sb = f2Supabase()
      const { data } = await sb
        .from('f2_users')
        .select('daily_card_enabled, recert_enabled')
        .eq('id', thread.user_id)
        .maybeSingle()
      const handles = await listImessageHandles(thread.user_id)
      const prefs = await getVoicePrefs(thread.user_id)
      return {
        result: [
          `Daily iMessage card: ${data?.daily_card_enabled ? 'on' : 'off'}`,
          `Paired iMessage handles: ${handles.length ? handles.join(', ') : 'none'}`,
          `Refreshers: ${data?.recert_enabled === false ? 'off (mastery is forever)' : 'on'}`,
          `Voice: ${prefs.voice ?? 'default'}${prefs.style ? ` · style: ${prefs.style}` : ''}`,
        ].join('\n'),
      }
    }
    case 'update_settings': {
      const changes: string[] = []
      const sb = f2Supabase()
      if (typeof input.recert_enabled === 'boolean') {
        await sb.from('f2_users').update({ recert_enabled: input.recert_enabled }).eq('id', thread.user_id)
        changes.push(`refreshers ${input.recert_enabled ? 'on' : 'off — mastery is forever now'}`)
      }
      if (typeof input.daily_card_enabled === 'boolean') {
        if (input.daily_card_enabled) {
          const handles = await listImessageHandles(thread.user_id)
          if (handles.length === 0) {
            return { result: 'Error: pair an iMessage handle first (pair_imessage) — the daily card is delivered there.' }
          }
        }
        await sb.from('f2_users').update({ daily_card_enabled: input.daily_card_enabled }).eq('id', thread.user_id)
        changes.push(`daily card ${input.daily_card_enabled ? 'on' : 'off'}`)
      }
      if (typeof input.voice === 'string' || typeof input.voice_style === 'string') {
        const current = await getVoicePrefs(thread.user_id)
        let voice = current.voice
        if (typeof input.voice === 'string') {
          const v = input.voice.trim()
          if (v && !isKnownVoice(v)) return { result: `Error: unknown voice "${v}".` }
          voice = v || null
          changes.push(`voice → ${voice ?? 'default'}`)
        }
        let style = current.style
        if (typeof input.voice_style === 'string') {
          style = input.voice_style.trim().slice(0, MAX_VOICE_STYLE_CHARS) || null
          changes.push(style ? 'speaking style updated' : 'speaking style cleared')
        }
        await saveVoicePrefs(thread.user_id, { voice, style })
      }
      if (changes.length === 0) return { result: 'Error: nothing to change.' }
      return { result: `Settings updated: ${changes.join(', ')}.` }
    }
    case 'pair_imessage': {
      const res = await startImessagePairing(thread.user_id, String(input.handle ?? ''))
      if (!res.ok) return { result: `Error: ${res.error}` }
      try {
        await sendPairingMessage(res.handle, res.code)
      } catch (e) {
        console.error('[f2/agent] pairing send failed:', e)
        return { result: 'Error: could not deliver the pairing code over iMessage — try again in a minute.' }
      }
      return {
        result: `Code sent to ${res.handle}. Ask the user for the 6-digit code, then call confirm_imessage.`,
      }
    }
    case 'confirm_imessage': {
      const res = await confirmImessagePairing(
        thread.user_id, String(input.handle ?? ''), String(input.code ?? ''))
      if (!res.ok) return { result: `Error: ${res.error}` }
      return { result: `Paired ${String(input.handle)} — the daily card can go there now.` }
    }
    case 'remove_imessage': {
      await removeImessageHandle(thread.user_id, String(input.handle ?? ''))
      return { result: `Removed ${String(input.handle)} from paired handles.` }
    }
    case 'list_flash_cards': {
      const all = await listFlashCards(thread.user_id, thread.id)
      const includeBuried = Boolean(input.include_buried)
      const cards = includeBuried ? all : all.filter((c) => c.rating !== 'down')
      if (cards.length === 0) {
        return { result: 'The deck is empty — no flash cards on this topic yet.' }
      }
      const buriedCount = all.filter((c) => c.rating === 'down').length
      const lines = cards.map((c, i) => {
        const flags = [
          c.rating === 'priority' ? 'PRIORITY' : null,
          c.rating === 'down' ? 'BURIED' : c.rating === 'down1' ? 'RARE' : null,
          isMastered(c) ? 'mastered' : null,
        ]
          .filter(Boolean)
          .join(', ')
        const due = c.due_at ? c.due_at.slice(0, 10) : 'unscheduled'
        return `${i + 1}. Q: ${c.question} → A: ${c.answer}\n   [${flags || 'learning'}] seen ${c.times_shown}x, streak ${c.streak}, lapses ${c.lapses}, due ${due}`
      })
      const header = `${cards.length} cards listed (${all.length} total, ${buriedCount} buried${includeBuried ? ', included' : ', hidden'}). "mastered" = the schedule considers it learned; a card seen several times with a low streak or lapses is one the user keeps missing; PRIORITY = the user flagged it important.`
      return { result: `${header}\n\n${lines.join('\n')}` }
    }
    case 'get_progress': {
      const [sets, cards] = await Promise.all([
        listFlashSets(thread.user_id, thread.id),
        listFlashCards(thread.user_id, thread.id),
      ])
      const { data: reviews } = await f2Supabase()
        .from('f2_voice_sessions')
        .select('mode, grade, graded_at, grade_detail, created_at')
        .eq('user_id', thread.user_id)
        .eq('thread_id', thread.id)
        .in('mode', ['final_review', 'second_chance'])
        .order('created_at', { ascending: false })
        .limit(5)
      const reviewLines = (reviews ?? []).map((r) => {
        const d = (r.grade_detail ?? {}) as {
          notes?: string
          strengths?: string[]
          weaknesses?: string[]
        }
        const label = r.mode === 'second_chance' ? 'Second Chance' : 'Final Review'
        if (!r.grade) return `- ${label} on ${String(r.created_at).slice(0, 10)}: not graded (session ended without a grade)`
        return [
          `- ${label} on ${String(r.graded_at ?? r.created_at).slice(0, 10)}: grade ${r.grade}${r.grade === 'A' ? ' (passed — mastery star)' : ''}`,
          d.notes ? `  Feedback: ${d.notes}` : null,
          d.strengths?.length ? `  Strengths: ${d.strengths.join('; ')}` : null,
          d.weaknesses?.length ? `  To review: ${d.weaknesses.join('; ')}` : null,
        ]
          .filter(Boolean)
          .join('\n')
      })
      const setLines = sets
        .slice(0, 5)
        .map(
          (s) =>
            `- ${String(s.created_at).slice(0, 10)}: ${s.score}/${s.total} (${s.mode}${s.jumbo_level != null ? `, Peck level ${s.jumbo_level}` : ''})`,
        )
      const mastered = cards.filter((c) => isMastered(c)).length
      return {
        result: `Stars: ${thread.stars}/3${thread.hard_quiz_completed_at ? ' (Final Review passed)' : ''}
Study focus: ${thread.study_focus ?? '(none set)'}
Deck: ${cards.length} cards, ${mastered} mastered, ${cards.filter((c) => c.rating === 'priority').length} priority, ${cards.filter((c) => c.rating === 'down1').length} rare (served max once per set), ${cards.filter((c) => c.rating === 'down').length} buried

Graded reviews:
${reviewLines.length ? reviewLines.join('\n') : '(no Final Review attempts yet)'}

Recent flash sets:
${setLines.length ? setLines.join('\n') : '(none played yet)'}`,
      }
    }
    case 'list_topics': {
      const topics = await listTopicsForUser(thread.user_id)
      if (topics.length === 0) return { result: 'No topics on the account yet.' }
      const lines = topics.map((t) => {
        const bits = [
          t.topic ?? t.url ?? '(untitled)',
          t.kind ?? 'general',
          `${t.stars ?? 0} star${(t.stars ?? 0) === 1 ? '' : 's'}`,
        ]
        if (t.pinned_at) bits.push('pinned')
        if ((t as F2Thread & { peck_excluded?: boolean }).peck_excluded) bits.push('out of Peck')
        if (t.id === thread.id) bits.push('← current')
        return `- ${bits.join(' · ')}`
      })
      return { result: `${topics.length} topics:\n${lines.join('\n')}` }
    }
    case 'create_topic': {
      const url = String(input.url ?? '').trim()
      const givenTitle = String(input.title ?? '').trim()
      const sourceText = String(input.source_text ?? '').trim()
      if (!url && !givenTitle) return { result: 'Error: give a title or a url.' }
      const kindRaw = String(input.kind ?? '').trim()
      const kind = ['book', 'mini', 'general', 'web', 'video', 'audio', 'paste', 'chat'].includes(kindRaw)
        ? (kindRaw as never)
        : null

      let topicName = givenTitle
      let content: string | null = sourceText || null
      let threadUrl: string | undefined
      if (url) {
        if (!isUrl(url)) return { result: `Error: "${url}" is not a valid URL.` }
        const fetched = await fetchUrlContent(url)
        threadUrl = url
        content = fetched.body ?? content
        if (!topicName) {
          topicName =
            (await nameTopic({ body: fetched.body ?? '', documentTitle: fetched.title })) ??
            fetched.title ??
            url
        }
      }
      const created = await createThread({
        userId: thread.user_id,
        client: thread.client,
        handle: thread.handle,
        topic: topicName.slice(0, 200),
        url: threadUrl,
        content,
        kind,
      })
      if (!created) return { result: 'Error: creating the topic failed.' }
      return {
        result: `Created topic "${created.topic}"${content ? ` with ${content.length.toLocaleString()} chars of source material` : ''}. File cards or notes into it by passing topic: "${created.topic}".`,
      }
    }
    case 'complete_peck_level': {
      const raw = input.level == null ? null : Math.round(Number(input.level))
      if (raw != null && (!Number.isFinite(raw) || raw < 1))
        return { result: 'Error: level must be 1 or more.' }
      const { target, granted, highest_passed } = await completePeckLevels(
        thread.user_id,
        raw,
      )
      if (!granted.length)
        return {
          result: `Level ${target} is already passed — level ${highest_passed + 1} is the one unlocked now.`,
        }
      return {
        result: `Marked level${granted.length > 1 ? 's' : ''} ${granted.join(', ')} passed — level ${highest_passed + 1} is unlocked.`,
        mutated: true,
      }
    }
    case 'set_daily_streak': {
      const days = Math.round(Number(input.days))
      if (!Number.isFinite(days) || days < 0) return { result: 'Error: days must be 0 or more.' }
      const set = await setDailyStreak(thread.user_id, days)
      const live = await getDailyStreak(thread.user_id)
      return {
        result: `Daily streak set to ${set} (XP multiplier now x${streakMultiplier(live.streak)}). The Peck flame shows it immediately.`,
      }
    }
    case 'set_study_focus': {
      const focus = String(input.focus ?? '').trim()
      const ok = await setStudyFocus(thread.id, thread.user_id, focus || null)
      if (!ok) return { result: 'Error: could not save the study focus.' }
      return {
        result: focus ? `Study focus set — "${focus}".` : 'Study focus cleared.',
        mutated: true,
      }
    }
    default:
      return { result: `Error: unknown tool "${name}".` }
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
  const source = buildBudgetedContent(thread, 3_000_000)
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
  forceNew = false,
): Promise<F2Reply> {
  let thread: F2Thread | null = null
  if (forceNew) {
    thread = null
  } else if (threadId) {
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

  // A forced new topic always lands on a fresh thread, even when the router
  // would have called it chitchat: the user asked for a topic.
  const act: typeof action =
    forceNew && (action.kind === 'chitchat' || action.kind === 'continue')
      ? { kind: 'new_topic', reply: action.reply, topic: userText.slice(0, 80) }
      : action

  switch (act.kind) {
    case 'continue': {
      if (!thread) {
        // Defensive: model picked continue but there's no thread. Treat as chitchat.
        return { reply: act.reply }
      }
      await appendMessages(thread.id, thread.user_id, thread.messages, [
        { role: 'user', text: userText, created_at: now },
        { role: 'assistant', text: act.reply, created_at: now },
      ])
      return { reply: act.reply, thread_id: thread.id }
    }
    case 'new_topic': {
      // Same naming pipeline as the URL/paste paths. The routing LLM's pick
      // is fed in as a hint; Haiku rewrites it when it can do better given
      // the user's question + opening reply.
      const refined = await nameTopic({
        body: `USER: ${userText}\n\nF2: ${act.reply}`,
        documentTitle: act.topic,
      })
      const fresh = await createThread({
        userId,
        client,
        handle,
        topic: refined || act.topic,
      })
      if (fresh) {
        await appendMessages(fresh.id, fresh.user_id, [], [
          { role: 'user', text: userText, created_at: now },
          { role: 'assistant', text: act.reply, created_at: now },
        ])
      }
      return { reply: act.reply, thread_id: fresh?.id }
    }
    case 'chitchat':
      return { reply: act.reply }
    case 'more_videos': {
      if (!thread) {
        // Defensive: the tool is only offered when a video thread is active.
        return { reply: 'F2: open a video topic first, then ask for more videos.' }
      }
      return handleMoreVideos(thread, userText, act.refinement)
    }
  }
}
