// The page first, questions after (OLA-168). The checker on live fc468fede085, Nov 22: on the website
// 4 of 4 requests like 'make a page for our block party on Saturday' put up a question card ("What
// are the details for the block party (Saturday's date, time, place/street...)?") before any page
// existed; on the iPhone 2 of 3, with Ola on the Mac every time. The design model asks where Ola's
// own model built. AGENTS.md already said "at most one question, only when you cannot make a first
// version"; the design model reads the designer skill, not that line, at the moment it decides.
//
// So the cue is given where every runtime's design work passes once, here: a request that is design
// work (design.mjs designWhy) carries a note to make the first version now, with marked draft lines
// for what the person did not say, and to ask after. Not when the person asked to be asked first
// (askfirst.mjs, OLA-325): that wish wins.
//
// The checker on live 8ea2fd33a8c7, Nov 23: the second 'make a page for our block party on Saturday'
// in the same project, in a new conversation, found the first draft page and asked with a card
// "What details should replace the draft lines?", and made no page. The note only forbade asking
// before a page exists, and one did. So in a design turn the question tool is taken out of the
// request (withoutQuestion), and the note says what to do when a page for it is already there.
import { asksToBeAsked } from './askfirst.mjs'

export const FIRST_DRAFT = 'Note from Ola’s gateway: make the first version of the page now, from what the person said. Do not ask them anything before the page is made, not with a question tool and not in words. A fact they did not give (a date, a time, a place) goes on the page as a marked draft line, never an invented one; when you hand off, say in one sentence which lines are drafts so they can tell you. If the folder already has a page for the same thing and the person did not ask to change it, they are asking again: make a fresh version as a new file beside it (for example block-party-2.html), never overwrite theirs, and say both file names when you hand off.'

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n') : '')

/** The note for a design request, or null. `why`: design.mjs designWhy for this request. */
export function firstDraftNote(messages, why) {
  if (!why || !Array.isArray(messages)) return null
  let last = null
  for (const m of messages) if (m?.role === 'user') last = m
  if (!last || asksToBeAsked(textOf(last.content))) return null
  return FIRST_DRAFT
}

/** The request's tools without the question tool, for a design turn that carries the note (OLA-168). */
export function withoutQuestion(body) {
  if (!Array.isArray(body.tools)) return body
  const tools = body.tools.filter((t) => t?.function?.name !== 'question')
  if (tools.length === body.tools.length) return body
  const out = { ...body, tools }
  const tc = body.tool_choice
  if (tc && typeof tc === 'object' && tc.function?.name === 'question') out.tool_choice = 'auto'
  if (!tools.length) { delete out.tools; delete out.tool_choice }
  return out
}
