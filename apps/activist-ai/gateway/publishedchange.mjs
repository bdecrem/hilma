// A change to a page this conversation published is not a request to publish it (OLA-244), for
// every runtime.
//
// In a cloud project the web server puts the published page's fact in front of such a request
// (frontdesk/publishednote.mjs, from the publish record). With Ola working on the Mac there is no web
// server in between: on Nov 22 (~6:30 pm, Mac app 0.1 (34), the OLA-302 checker) a page was
// published from the chat, then "now change the words to Maple Street Picnic, bring a blanket" was
// changed AND published again (after a yes card), so the next "publish it again" found nothing new.
// Every model request of every runtime comes through this gateway, so the cue is here too: when the
// person's last message asks to change something and not to publish, and this conversation ran
// ola-publish earlier and its result says the page went up (with the address), the request carries the same rule.
// A cloud request that already carries the web server's fact gets nothing more (no doubled sentence).

// The same two patterns as the web server's (frontdesk/publishednote.mjs), copied: the gateway is its
// own folder and imports nothing outside it (ops/restart-test.mjs). gateway/test.mjs keeps them equal.
export const ASKS_PUBLISH = /\bpublish|\bunpublish|\b(?:put|get|bring)\s+(?:it\s+|this\s+|that\s+|the\s+\w+\s+)?(?:back\s+)?(?:up|online|live)\b|\bgo(?:es)?\s+live\b|\bmake\s+(?:it|this|the\s+\w+)\s+(?:public|live)\b|\btake\s+(?:it\s+|this\s+|the\s+\w+\s+)?down\b|\blink\s+anyone\b/i
export const ASKS_CHANGE = /\b(?:change|changes|edit|update|make|turn|rename|replace|fix|add|remove|delete|drop|move|swap|redo|rewrite|reword|say|says|instead|heading|headline|title|colou?r|font|text|words?|bigger|smaller|darker|lighter)\b/i
const asksChangeNotPublish = (t) => ASKS_CHANGE.test(t) && !ASKS_PUBLISH.test(t)

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n') : '')

const SITE_URL = /https:\/\/sites\.ola\.cx\/[A-Za-z0-9._-]+\/?/g
// Any run of ola-publish (the Mac's `ola-publish publish|unpublish|preview|status`, the cloud's
// `ola-publish <folder> --files …`): what it did is read from its result, not its arguments.
const PUBLISH_RUN = /\bola-publish\b/
const LOOK_ONLY = /\bola-publish\s+(?:preview|status)\b/
const TAKEN_DOWN = /\btaken down\b|"unpublished"\s*:\s*true|\bnow shows nothing\b/i
const PUT_UP = /\bpublished\b|"url"\s*:/i
// The web server's fact (publishednote.mjs) is already in front of the request.
const HAS_FACT = /A page of this project is published at https:\/\//

const argsOf = (call) => String(call?.function?.arguments ?? '')

/** The address this conversation last published to before message `upto`, or null (taken down after counts as none). */
export function publishedIn(messages, upto) {
  let url = null
  const runs = new Map() // tool_call id -> 'down' for a take-down, 'run' for any other ola-publish run that changes what is up
  for (let i = 0; i < upto; i++) {
    const m = messages[i]
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const c of m.tool_calls) {
        const a = argsOf(c)
        if (PUBLISH_RUN.test(a) && !LOOK_ONLY.test(a)) runs.set(c?.id, /\bunpublish\b/.test(a) ? 'down' : 'run')
      }
    } else if (m?.role === 'tool' && runs.has(m.tool_call_id)) {
      const out = textOf(m.content)
      const found = out.match(SITE_URL)
      if (runs.get(m.tool_call_id) === 'down' || TAKEN_DOWN.test(out)) url = null
      else if (found && PUT_UP.test(out)) url = found[found.length - 1].replace(/\/?$/, '/')
    }
  }
  return url
}

export const publishedChangeText = (url) =>
  `Note from Ola’s gateway: earlier in this conversation a page was published at ${url}. This request does not ask to publish. ` +
  'If it changes that page: change the page’s own file and keep its file name; never edit or rename the publish copy (a folder holding .ola-source.json, such as site/); ' +
  'do not run ola-publish and do not offer to. End the answer with this one sentence, in the person’s language: ' +
  `"This change is not public yet: ${url} still shows the earlier page; say “publish it again” to put it up."`

/** The note for this request, or null. */
export function publishedChangeNote(messages) {
  if (!Array.isArray(messages)) return null
  let last = -1
  messages.forEach((m, i) => m?.role === 'user' && (last = i))
  if (last < 0) return null
  const said = textOf(messages[last].content)
  if (HAS_FACT.test(said)) return null
  // The person's own words, without a note the web server or an app put in front of them.
  const own = said.replace(/<ola-[a-z-]+>[\s\S]*?<\/ola-[a-z-]+>/g, ' ')
  if (!asksChangeNotPublish(own)) return null
  const url = publishedIn(messages, last)
  return url ? publishedChangeText(url) : null
}
