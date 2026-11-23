// "Ask me first" (OLA-325). Bart's check, Nov 21: "make a page for the block party, but ask me two
// things first". In a cloud project on the website, with Ola on the Mac and in a cloud project in the
// Mac app, Ola asked its two questions as words in its answer about 2 times in 3 (website 1 of 3, Mac
// cloud 1 of 3, Mac local 4 of 6), so the person got no card to answer, and their next message
// ("publish it on ola") was taken as not answering. With the card, the same request went on.
//
// Every model request of every runtime comes through this gateway (a cloud project's VM, the Mac's
// engine), so the cue lives here, once: when the person's last message asks to be asked something
// before Ola starts, the request offers the question tool, and Ola has not called it since that
// message, the request carries a note to ask with the question tool. After the card is answered the
// note goes (the tool call is in the messages), and a person who answers in words sends a new message
// that no longer asks to be asked.

export const ASK_FIRST = 'Note from Ola’s gateway: the person asked you to ask them something before you start. Ask now with the question tool: every question they asked for in one call, each with two to four short choices where choices make sense, and wait for their answer. Never write the questions in your reply instead: only the question tool shows the person a card they can answer.'

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n') : '')

// "ask me two things first", "ask me a few questions", "ask us 3 questions before you start",
// "before you start, ask me", "questions for me first". Not "ask me if anything is unclear".
const HOW_MANY = '(?:a |one |two |three |four |five |\\d+ |a few |a couple(?: of)? |some )?(?:more |quick |short )?'
const ASKS = [
  new RegExp(`\\bask (?:me|us) ${HOW_MANY}(?:things?|questions?)\\b`, 'i'),
  /\bask (?:me|us)\b[^.!?\n]{0,40}\b(?:first|before (?:you|we) (?:start|begin|build|make|write|do))\b/i,
  /\b(?:before (?:you|we) (?:start|begin|build|make|write|do)\b|first\b)[^.!?\n]{0,30}\bask (?:me|us)\b/i,
  /\bquestions? (?:for (?:me|us) )?(?:first|before (?:you|we) (?:start|begin))\b/i,
]

/** Does this text ask Ola to ask the person something before it starts? */
export const asksToBeAsked = (text) => ASKS.some((re) => re.test(String(text)))

/** The note for this request, or null. `offered`: the names of the tools the request offers. */
export function askFirstNote(messages, offered) {
  if (!Array.isArray(messages) || !offered?.has?.('question')) return null
  let last = -1
  messages.forEach((m, i) => m?.role === 'user' && (last = i))
  if (last < 0 || !asksToBeAsked(textOf(messages[last].content))) return null
  for (let i = last + 1; i < messages.length; i++) {
    const m = messages[i]
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.some((c) => c?.function?.name === 'question')) return null
  }
  return ASK_FIRST
}

/** The notes for one request, any may be null. */
export const bothNotes = (...notes) => notes.filter(Boolean).join('\n\n') || null
