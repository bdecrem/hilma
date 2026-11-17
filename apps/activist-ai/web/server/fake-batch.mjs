// The scripted model's answers to a batch job's form (workspace/ola-batch), for the checks: it reads
// the document in the request the way a careful model would (for each field, the first sentence
// that shares a long word with the field's question; the value from that sentence; the sentence as
// the quote, with its page), and it lies on purpose, so the quote check has something to catch:
//
//   document number n % 6 == 0, first answer:  the first field's quote is a sentence that is not in
//                                              the document (planted)
//   on the retry (the request shows the failure): n % 12 == 0 is answered right, n % 12 == 6 plants
//                                              another wrong quote, which must stay marked
//   n % 10 == 5 (a document with two pages):  the page is given one off, the quote itself right
//                                              ("found on another page", corrected, not a failure)
//
// Every planted quote is recorded in `state.planted` ({ n, title, field, retry }), so a check can
// compare what the checker marked with what was planted. `state.delayMs` holds each answer back
// (a long job); `state.calls` counts the form requests.
export const BATCH_SYSTEM_START = 'You read one document and fill in a fixed form about it.'

export const newBatchState = () => ({ delayMs: 0, calls: 0, planted: [], inflight: 0, maxInflight: 0 })

const textOf = (m) => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map((p) => p.text ?? '').join(' ') : '')

export function isBatchRequest(body) {
  const sys = body?.messages?.[0]
  return (sys?.role === 'system' && textOf(sys).startsWith(BATCH_SYSTEM_START)) || (typeof body?.system === 'string' && body.system.startsWith(BATCH_SYSTEM_START))
}

function parseForm(user) {
  const fields = []
  const form = user.split('The form:')[1]?.split('\n\nAnswer like this:')[0] ?? ''
  for (const line of form.split('\n')) {
    const m = /^- ([a-z][a-z0-9_]*) \((.*?)\): (.*)$/.exec(line.trim())
    if (!m) continue
    const kind = m[2]
    const f = { name: m[1], question: m[3], type: 'text' }
    if (kind.startsWith('one of: ')) (f.type = 'category'), (f.values = kind.slice(8).replace(/, or "not stated"$/, '').split(', '))
    else if (kind.startsWith('a number')) f.type = 'number'
    else if (kind.startsWith('yes or no')) f.type = 'yesno'
    fields.push(f)
  }
  return fields
}

function parsePages(user) {
  const pages = []
  const re = /\[page (\d+)\]\n([\s\S]*?)(?=\n\n\[page \d+\]\n|$)/g
  let m
  // A careful model reads "adap-\ntation" as "adaptation" and a ligature as its letters, and quotes
  // it that way: the checker must still find those quotes in the stored text.
  while ((m = re.exec(user))) pages.push({ page: Number(m[1]), text: m[2].replace(/(\w)-[ \t]*\n\s*(\w)/g, '$1$2').normalize('NFKC') })
  return pages
}

export function batchAnswer(body, state) {
  state.calls++
  const msgs = body.messages ?? []
  const first = msgs.find((m) => m.role === 'user')
  const user = textOf(first)
  const retry = msgs.some((m) => m.role === 'user' && textOf(m).startsWith('Some answers could not be used'))
  const title = /The document: "([^"]*)"/.exec(user)?.[1] ?? ''
  const n = Number(/(\d+)/.exec(title)?.[1] ?? -1)
  const fields = parseForm(user)
  const pages = parsePages(user.includes('The document: ') ? user.slice(user.indexOf('The document: ')) : user)
  const out = {}
  fields.forEach((f, i) => {
    const words = f.question.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 6)
    let hit = null
    for (const p of pages) {
      for (const s of p.text.replace(/\s+/g, ' ').split(/(?<=\.)\s+/)) {
        if (words.some((w) => s.toLowerCase().includes(w))) {
          hit = { s: s.trim(), page: p.page }
          break
        }
      }
      if (hit) break
    }
    if (!hit) return (out[f.name] = { value: 'not stated', quote: '', page: null })
    let value = hit.s.slice(0, 80)
    if (f.type === 'category') value = f.values.find((v) => hit.s.toLowerCase().includes(v.toLowerCase())) ?? 'not stated'
    if (f.type === 'number') value = /\b(\d{1,6}(?:\.\d+)?)\b/.exec(hit.s)?.[1] ?? 'not stated'
    if (f.type === 'yesno') value = /\bnot\b|\bno\b/i.test(hit.s) ? 'no' : 'yes'
    let quote = hit.s
    let page = hit.page
    if (i === 0 && n >= 0 && ((!retry && n % 6 === 0) || (retry && n % 12 === 6))) {
      quote = `The ${f.name.replace(/_/g, ' ')} was settled by a committee that met in secret in 1987.`
      state.planted.push({ n, title, field: f.name, retry })
    }
    if (n % 10 === 5 && pages.length > 1 && i === fields.length - 1) page = page === 1 ? 2 : 1
    out[f.name] = { value, quote, page }
  })
  const content = JSON.stringify(out)
  const chars = msgs.reduce((a, m) => a + textOf(m).length, 0) + (typeof body.system === 'string' ? body.system.length : 0)
  return { content, prompt: Math.ceil(chars / 4), completion: Math.ceil(content.length / 4) }
}
