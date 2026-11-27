// ola-examples: opencode plugin (V2 API) in every workspace image, at /opt/ola/plugins/ola-examples, named by the
// system config (/etc/opencode/opencode.jsonc), and in the Mac's local runtime (OlaKit LocalServer.installPlugins).
//
// What it does (OLA-181): Ola keeps app requests that ended well as worked examples: the request, what it plainly
// asked for, how it was built, how each thing was tried, and the answer. When a new request to make an app, page
// or game arrives, the closest kept example, if it is close enough, is put into the model's system prompt for that
// request: one example, never more, at most MAX_CHARS (about 600 tokens), chosen by word overlap with the request
// (BM25 over the request and the example's own words; no model call, nothing leaves the process).
//
// Why: on 2026-11-18 Ola's own model built 2 of 7 real app requests and Claude Code 4 of 4 (evals/apps). A worked
// example of the same kind, read at the moment the request arrives, shows the steps that made a good result
// (list what was asked, build, try each item on the page, fix, say what was seen) in a concrete case instead of
// a general rule.
//
// Whose content, two sources:
//   - examples.json beside this file: test requests only, written for it and kept apart from the seven measured
//     problems (evals/apps/problems.json), so the measure is not taught to the test. Every project and every Mac.
//   - in a cloud project, that project's own requests that ended well, in its own volume at
//     /work/.ola/examples.json (the image's OLA_EXAMPLES_EXTRA). The front desk writes it through `ola-db
//     examples` when a run ends well (frontdesk/examples.mjs) and takes an example out on "This was wrong" or
//     when its conversation is deleted. It never leaves the project: no other project, person or machine sees
//     it, it goes with the project's backup and is deleted with the project. Shown as "(from this project)".
//   Read again whenever an extra file changes.
//
// The note is fenced by NOTE_HEAD and NOTE_END so the gateway can count it (its log line says example: project
// or library, a label only) and, with GATEWAY_EXAMPLES=off, take it out of every request: the one switch for
// the server and every Mac. Here, OLA_EXAMPLES=off turns it off for one process (the measure's "without"
// column); OLA_EXAMPLES_FILE replaces the committed library (tests).
//
// It only adds text the model sees. It never blocks a tool, changes a file, or reaches anything outside the
// opencode process.

import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const NOTE_HEAD = '[Ola worked example]'
export const NOTE_END = '[end of the worked example]'
export const FROM_PROJECT = '(from this project)'
const HERE = path.dirname(fileURLToPath(import.meta.url))
// The least score a kept example needs to be shown. Set by examples.test.mjs: every one of the seven measured
// requests finds a neighbor above it (the lowest, the to-do app, scored 3.5 on Nov 21), and a request to make something unlike every example stays below.
export const MIN_SCORE = 2.5
export const MAX_CHARS = 2400 // of one example as shown, the fence included: about 600 tokens

const STOP = new Set(('a an and are as at be but by can could do does for from get give go has have how i if in into ' +
  'is it its just let like me my need of on or our please so some something that the their them then there these ' +
  'they this to up us use using want we what when where which who will with would you your yours make build create ' +
  'write made new simple small quick little one page app apps thing want wants able also each every all them').split(' '))

/** Words of a text, lowercased, without stop words, with a light English ending strip. */
export function words(text) {
  const out = []
  for (let w of String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)) {
    if (w.length < 2 || STOP.has(w)) continue
    if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
    else if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y'
    else if (w.length > 4 && w.endsWith('es') && /(?:ss|sh|ch|x)es$/.test(w)) w = w.slice(0, -2)
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
    else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
    if (!STOP.has(w)) out.push(w)
  }
  return out
}

/** The text an example is matched on: its request counts twice, then its kind words and what it asked for. */
function docText(ex) {
  return [ex.request, ex.request, (ex.tags ?? []).join(' '), (ex.asked ?? []).join(' ')].join(' ')
}

/** Reads the libraries: the committed one (or OLA_EXAMPLES_FILE) and any OLA_EXAMPLES_EXTRA files. Bad files are skipped. */
export function loadLibrary(env = process.env) {
  const files = [env.OLA_EXAMPLES_FILE || path.join(HERE, 'examples.json'), ...String(env.OLA_EXAMPLES_EXTRA ?? '').split(':').filter(Boolean)]
  const out = []
  for (const f of files) {
    let data
    try { data = JSON.parse(readFileSync(f, 'utf8')) } catch { continue }
    for (const ex of Array.isArray(data) ? data : data?.examples ?? []) {
      if (ex && typeof ex.request === 'string' && ex.request.trim() && Array.isArray(ex.tried) && ex.tried.length) out.push(ex)
    }
  }
  return out
}

/** The closest example to `request`, as { example, score }, or null when none reaches `min`. BM25 (k1 1.2, b 0.75). */
// A request to make something: only those get an example (a summary, a chart of a file or a question about a
// law is not an app request, and an example of building one would only distract).
export const MAKES = /\b(?:make|makes|making|build|builds|building|create|code|program|design|develop|put together|set up|need|want)\b[^.?!]{0,80}\b(?:app|apps|application|page|site|website|game|tool|tracker|calculator|converter|timer|stopwatch|form|sheet|list|quiz|flashcards?|generator|dashboard|planner|scaler|splitter|counter|countdown|board|widget|program)\b|\b(?:app|game|tracker|calculator|converter|timer|stopwatch|quiz|generator)\b/i

export function closest(request, library, min = MIN_SCORE) {
  if (!MAKES.test(String(request ?? ''))) return null
  const q = [...new Set(words(request))]
  if (!q.length || !library.length) return null
  const docs = library.map((ex) => words(docText(ex)))
  const avg = docs.reduce((s, d) => s + d.length, 0) / docs.length
  const df = new Map()
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1)
  const N = docs.length
  let best = null
  docs.forEach((d, i) => {
    const tf = new Map()
    for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1)
    let score = 0
    for (const w of q) {
      const f = tf.get(w)
      if (!f) continue
      const idf = Math.log(1 + (N - df.get(w) + 0.5) / (df.get(w) + 0.5))
      score += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.length / avg))
    }
    if (!best || score > best.score) best = { example: library[i], score }
  })
  return best && best.score >= min ? best : null
}

// What the note says about steps (OLA-497), in place of the example's tries: the fast path of AGENTS.md.
export const STEPS = 'Steps: build it in one go as your instructions say (one .html file where you can; only a part that computes gets its own .js and its cases run with ola-test), then hand it over without looking at it.'

const list = (xs) => (xs ?? []).map((x) => `- ${x}`).join('\n')

/** The note the model sees, for one example, fenced by NOTE_HEAD and NOTE_END, at most MAX_CHARS. */
export function noteFor(ex) {
  const project = ex.source === 'project'
  const body = [
    `${NOTE_HEAD}${project ? ` ${FROM_PROJECT}` : ''} A request like this one was built ${project ? 'in this project' : 'here'} before and ended well. It is an example of the steps, not the person's request: build what *this* person asked for, in their words, and do not copy its content.`,
    `Its request: "${ex.request}"`,
    ex.asked?.length ? `What it asked for, one line each:\n${list(ex.asked)}` : '',
    ex.built?.length ? `How it was built:\n${list(ex.built)}` : '',
    // OLA-497: the example's tries are not shown. They taught the item-by-item check OLA-455 took out of the
    // instructions, and the speed check (evals/speed) measured Ola writing three files and looking at a kite toy
    // where plain OpenCode wrote one file in 18 s.
    STEPS,
    ex.answer ? `The answer it ended with: ${ex.answer}` : '',
  ].filter(Boolean).join('\n\n')
  const room = MAX_CHARS - NOTE_END.length - 1
  return (body.length > room ? body.slice(0, room - 1) + '…' : body) + '\n' + NOTE_END
}

/** The text of the newest message the person typed (tool results and Ola's own notes are not requests). */
export function newestRequest(messages) {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role !== 'user') continue
    const c = m.content
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n') : ''
    if (text.trim() && !text.includes(NOTE_HEAD)) return text
  }
  return ''
}

let LIB = null
let LIB_STAMP = ''
const chosen = new Map() // sessionID -> { request, note }: one choice per request, the same text on every step

/** The extra files' sizes and change times: a different stamp means the library is read again. */
function stampOf(env) {
  return String(env.OLA_EXAMPLES_EXTRA ?? '').split(':').filter(Boolean).map((f) => {
    try { const s = statSync(f); return `${f}:${s.size}:${s.mtimeMs}` } catch { return `${f}:-` }
  }).join('|')
}

export function onContext(event, env = process.env) {
  if (String(env.OLA_EXAMPLES ?? '').toLowerCase() === 'off') return
  if (!Array.isArray(event?.system)) return
  const request = newestRequest(event.messages)
  if (!request) return
  const sid = String(event.sessionID ?? '')
  let c = chosen.get(sid)
  if (!c || c.request !== request) {
    const stamp = stampOf(env)
    if (!LIB || stamp !== LIB_STAMP) { LIB = loadLibrary(env); LIB_STAMP = stamp }
    const hit = closest(request, LIB)
    c = { request, note: hit ? noteFor(hit.example) : null }
    chosen.set(sid, c)
    if (chosen.size > 500) chosen.delete(chosen.keys().next().value)
  }
  if (c.note && !event.system.some((p) => p?.text?.startsWith?.(NOTE_HEAD))) event.system.push({ type: 'text', text: c.note })
}

/** For tests: forget the loaded library and the choices. */
export function reset() { LIB = null; LIB_STAMP = ''; chosen.clear() }

export default {
  id: 'ola-examples',
  async setup(ctx) {
    await ctx.session.hook('context', (ev) => onContext(ev))
  },
}
