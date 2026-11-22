// The fact that a project's page is published, for a request that changes something and does not
// ask to publish (OLA-244).
//
// The checker, Nov 22, twice on two releases, on app.ola.cx at phone width: right after "put up a
// page on ola that just says Hazel", the request "make the heading say Willow instead" was changed
// in index.html AND in the publish copy site/index.html, and the answer never said the change was
// not public yet. The rule was in the publish skill (not loaded for a change) and in the abilities
// block (one line among many); "change the page so it says…" followed it, "make the heading say…
// instead" did not. So the rule now comes from the web server, in front of the request itself,
// built from what is really published (sites.status), never from the model's memory.

// Asks to publish, put up, put online, take down: then the publish skill governs, no note.
export const ASKS_PUBLISH = /\bpublish|\bunpublish|\b(?:put|get|bring)\s+(?:it\s+|this\s+|that\s+|the\s+\w+\s+)?(?:back\s+)?(?:up|online|live)\b|\bgo(?:es)?\s+live\b|\bmake\s+(?:it|this|the\s+\w+)\s+(?:public|live)\b|\btake\s+(?:it\s+|this\s+|the\s+\w+\s+)?down\b|\blink\s+anyone\b/i

// Asks to change something (a page, its words, its look): the note applies.
export const ASKS_CHANGE = /\b(?:change|changes|edit|update|make|turn|rename|replace|fix|add|remove|delete|drop|move|swap|redo|rewrite|reword|say|says|instead|heading|headline|title|colou?r|font|text|words?|bigger|smaller|darker|lighter)\b/i

export function asksChangeNotPublish(text) {
  const t = String(text ?? '')
  return ASKS_CHANGE.test(t) && !ASKS_PUBLISH.test(t)
}

const safe = (p) => String(p ?? '').replace(/[<>"]/g, '').slice(0, 160)

/** The note's text from sites.status(slug) ({ url, page, folder }), or '' when nothing is published. */
export function publishedFact(status) {
  if (!status?.url) return ''
  const url = safe(status.url)
  const folder = status.folder ? safe(status.folder).replace(/\/+$/, '') : ''
  const page = status.page ? safe(status.page) : ''
  const from = folder ? `the copy in ${folder}/` : page ? page : 'this project'
  const own = page && !(folder && page.startsWith(`${folder}/`)) ? page : 'the page\'s own file'
  return (
    `A page of this project is published at ${url} (from ${from}). This request does not ask to publish. ` +
    `If it changes that page: change ${own} itself and keep its file name` +
    (folder ? `; never edit or rename anything in ${folder}/ (it is the publish copy; the next publish makes it again)` : '') +
    `; do not run ola-publish and do not offer to. End the answer with this one sentence, in the person's language: ` +
    `"This change is not public yet: ${url} still shows the earlier page; say “publish it again” to put it up."`
  )
}
