// A project's own requests that ended well, kept as worked examples inside that project (OLA-181).
//
// The ola-examples plugin in every workspace shows the model the closest worked example when a request
// asks for an app, page or game. Its committed library holds only test requests. This adds the project's
// own: when a run in a cloud project ends well, the front desk reads that one turn from the project's
// opencode (as faults.mjs does), and writes an example into the project's own volume with `ola-db
// examples add` (/work/.ola/examples.json, which the image names in OLA_EXAMPLES_EXTRA). Later requests
// in that project, and only in that project, can be shown it.
//
// Privacy: the example holds the person's request and Ola's step lines, so it never leaves the project.
// It is not on the host, not in the platform database, not in any log; another project, person or
// machine never sees it; it is in the project's backup and goes when the project is deleted. The front
// desk's log says only that an example was kept, with the project's name. It is taken out when:
//   - the person marks the answer "This was wrong" (faults.mjs mark), and
//   - a later request in the same conversation is handed to another engine (/claude, /hosted).
// (A cloud conversation cannot be deleted on its own today: the proxy has no DELETE route. When one is
// added, it calls forget(slug, session) too.)
//
// "Ended well", from what is already recorded about the turn:
//   - the run succeeded (opencode's session.execution.succeeded), and faults.readTurn finds no refusal
//     and no stopped run (OLA-235's labels; a failed step along the way is allowed when it was fixed);
//   - the request asks to make something (the plugin's own MAKES test);
//   - a file was written or changed, and after the last change the page was tried: a command running
//     ola-page or look.py that finished with exit 0.
// Only the steps that worked go in: the files written ("Wrote index.html") and the commands that tried the
// page after the last change. No file contents, no command output.

import { MAKES } from '../workspace/plugins/ola-examples/index.js'
import { readTurn } from './faults.mjs'

const ID = /^[A-Za-z0-9_-]{1,120}$/
const TRY = /\b(?:ola-page|look\.py)\b/
const WRITES = new Set(['write', 'edit', 'patch', 'apply_patch', 'multiedit'])
const SHELLS = new Set(['shell', 'bash'])
const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
const uniq = (xs) => [...new Set(xs)]
// The front desk's note on the engines goes before a person's words (web/src/lib/conversation.ts stripEngines).
export const typed = (text) => {
  const s = String(text ?? '')
  const end = s.startsWith('<ola-engines>') ? s.indexOf('</ola-engines>') : -1
  return (end < 0 ? s : s.slice(end + '</ola-engines>'.length)).trim()
}
// A request handed to another engine (/claude, /hosted): what came before in the conversation was not good enough.
const HANDOVER = /^\/(?:claude|hosted)\b/i

/** The worked example in one finished turn of opencode's message list (the newest, or `turnId`), or null. */
export function exampleOfTurn(messages, turnId = null) {
  const t = readTurn(messages, turnId)
  if (!t || t.outcome !== 'succeeded' || !ID.test(t.turnId)) return null
  if (t.kinds.some((k) => !k.startsWith('step_'))) return null // a refusal, or a stopped run
  const request = typed(t.request).replace(HANDOVER, '').trim()
  // A turn Ola sent its own model (a hand-off, a pressed page's follow-up, OLA-515) is not the person's request.
  if (request.startsWith('<ola-nudge>')) return null
  if (!request || request.length > 2000 || !MAKES.test(request)) return null
  // The turn's tool steps in order (the same slice of messages readTurn read).
  const ordered = [...messages].sort((a, b) => (a?.time?.created ?? 0) - (b?.time?.created ?? 0))
  const i0 = ordered.findIndex((m) => m?.type === 'user' && m.id === t.turnId)
  const next = ordered.findIndex((m, i) => i > i0 && m?.type === 'user')
  const steps = []
  for (const m of ordered.slice(i0 + 1, next < 0 ? undefined : next)) {
    if (m?.type !== 'assistant') continue
    for (const p of Array.isArray(m.content) ? m.content : []) {
      if (p?.type !== 'tool' || p.state?.status !== 'completed') continue
      const exit = p.state?.metadata?.exit
      if (typeof exit === 'number' && exit !== 0) continue
      const input = p.state?.input ?? {}
      if (WRITES.has(p.name)) {
        const file = String(input.filePath ?? input.path ?? input.file ?? '').replace(/^\/work\//, '')
        steps.push({ write: true, line: `${p.name === 'write' ? 'Wrote' : 'Changed'} ${clip(file || 'a file', 160)}` })
      } else if (SHELLS.has(p.name) && typeof input.command === 'string') steps.push({ write: false, line: clip(input.command, 300) })
    }
  }
  const last = steps.findLastIndex((s) => s.write)
  if (last < 0) return null
  const tried = uniq(steps.slice(last + 1).filter((s) => TRY.test(s.line)).map((s) => s.line)).slice(0, 12)
  if (!tried.length) return null
  return {
    session: null,
    turn: t.turnId,
    request,
    built: uniq(steps.slice(0, last + 1).filter((s) => s.write).map((s) => s.line)).slice(0, 12),
    tried,
    answer: clip(t.answer, 800),
  }
}

export function makeExamples({ workspaces, log = () => {}, settleMs = 1500 }) {
  const call = async (slug, args, input) => {
    const r = await workspaces.examples(slug, args, input)
    if (r.code !== 0) throw new Error(`ola-db examples ${args[0]} exited ${r.code}`)
    return JSON.parse(r.out || '{}')
  }
  /** "This was wrong" on a turn, or a whole conversation (no turn, a handover): its examples are taken out. */
  async function forget(slug, sessionID, turn = null) {
    if (!ID.test(sessionID ?? '') || (turn !== null && !ID.test(turn ?? ''))) return 0
    const out = await call(slug, ['remove', '--session', sessionID, ...(turn ? ['--turn', turn] : [])])
    if (out.removed) log(`examples: ${out.removed} worked example(s) taken out in ${slug}`)
    return out.removed ?? 0
  }

  /** A run ended in a cloud project (workspaces.mjs onRunEnded): its turn is kept if it ended well. */
  async function fromRun(slug, sessionID, how) {
    if (how !== 'succeeded' || !ID.test(sessionID)) return false
    await new Promise((r) => setTimeout(r, settleMs)) // the idle message lands just after the event
    const r = await workspaces.oc(slug, 'GET', `/api/session/${sessionID}/message?limit=200`)
    const list = Array.isArray(r.json?.data) ? r.json.data : Array.isArray(r.json) ? r.json : null
    if (!list) return false
    // Handed to another engine: the conversation's earlier examples did not end well after all.
    const last = readTurn(list)
    if (last && HANDOVER.test(typed(last.request))) await forget(slug, sessionID)
    const ex = exampleOfTurn(list)
    if (!ex) return false
    const out = await call(slug, ['add'], JSON.stringify({ ...ex, session: sessionID }))
    log(`examples: a request that ended well is kept as a worked example in ${slug} (${out.count} there)`)
    return true
  }

  return { fromRun, forget }
}
