// Ola counting its own failures (OLA-235). Bart's ticket, Nov 20: "Today the only way a failure of
// Ola is found is that Bart hits it and says so to Kit ... Ola should find its own failures: a label
// for each refusal and tool error (no content leaves the project), a daily count on the Learning
// page with the most frequent kinds turned into cases in the request test set (OLA-231); and for the
// person, one tap that turns a bad answer into a permanent test."
//
// Two things live here.
//
// 1. Faults, labels only (platform migration 18, `faults`). When a run in a cloud project ends (the
//    front desk hears it on the project's event stream, workspaces.mjs onRunEnded), the front desk
//    reads that one turn from the project's opencode, works out in memory what went wrong, and keeps
//    one row per kind: when, the runtime, the engine, the type (refusal: Ola told the person it
//    cannot; step: a tool failed; run: the whole request stopped), the kind as one fixed word
//    (`KINDS`) and the kind of work (switches.mjs kindOf). No request, no answer, no file name, no
//    person. A turn the person chose to store from the Mac (kept_turns, local runtime) is read the
//    same way when it arrives. The turn's opencode id is kept only so that a turn is counted once.
//    What leaves this machine is `summary` (admin.mjs faults --json), read by
//    scripts/venture/learning.mjs for the board's Learning page.
//
// 2. "This was wrong" (`wrong_marks`). Under an answer in the web app, one tap and one yes: the
//    request word for word and Ola's answer are kept here, on Ola's computer, with who marked it and
//    when, because the person said yes to exactly that (the sheet says so). `admin.mjs wrong` lists
//    them, and evals/asks/add-case.mjs --from-wrong <id> makes the request a permanent case. The
//    person can take a mark back (the row is deleted). Nothing of it leaves the machine except counts.

import { kindOf } from './switches.mjs'

/** The kinds, in the words the board shows. */
export const KINDS = {
  // refusals: Ola's answer tells the person it cannot (the same families as the asks' never list)
  cannot_here: 'said it cannot do this here',
  not_switched_on: 'said something is not switched on',
  no_network: 'blamed having no network',
  do_it_yourself: 'told the person to do it themselves',
  no_tool: 'said it has no tool or access for it',
  cannot: 'said it cannot (other)',
  // steps that failed, by what went wrong
  step_shell: 'a command stopped with an error',
  step_invalid: 'a tool was called the wrong way',
  step_not_found: 'a file was not there',
  step_denied: 'a step was not allowed',
  step_timeout: 'a step took too long',
  step_web: 'a web search or download failed',
  step_other: 'a step failed (other)',
  // the whole request
  run_quota: 'the model allowance was used up',
  run_busy: 'the model was busy or did not answer',
  run_model: 'the model server refused or failed',
  run_stopped: 'the request stopped before it finished',
}
export const TYPES = ['refusal', 'step', 'run']
export const typeOf = (kind) => (kind.startsWith('step_') ? 'step' : kind.startsWith('run_') ? 'run' : 'refusal')
const ID = /^[A-Za-z0-9_-]{1,120}$/

const norm = (s) => String(s ?? '').replace(/[’‘]/g, "'").toLowerCase()
const CANT = String.raw`(?:can't|cannot|can not|am unable to|'m unable to|unable to|am not able to|'m not able to|not able to|no way to|isn't possible to|not possible to)`
// In order: the first that matches names the refusal. One refusal per turn.
const REFUSALS = [
  ['not_switched_on', /\bnot (?:yet )?(?:switched|turned) on\b|\bis(?:n't| not) (?:enabled|available) (?:here|in this|on this|yet)\b/],
  ['no_network', /\bno (?:internet|network|web)(?: access| connection)?\b|\b(?:can't|cannot|unable to) (?:reach|access|connect to) the (?:internet|web|network)\b|\bwithout (?:internet|network) access\b|\bsandbox(?:ed)?\b[^.\n]{0,40}\b(?:offline|no network)\b/],
  ['no_tool', /\b(?:don't|do not) have (?:a |the |any )?(?:tool|tools|ability|access|capability|permission)\b|\bno tool (?:for|to|that)\b/],
  ['do_it_yourself', /\byou(?:'ll| will)? (?:need|have) to\b[^.\n]{0,60}\b(?:yourself|manually|by hand)\b|\b(?:press|tap|click) (?:the )?["“'*]*\w+["”'*]* button\b[^.\n]{0,40}\byourself\b|\byou can do (?:this|it|that) yourself\b/],
  ['cannot_here', new RegExp(String.raw`\b${CANT}\b[^.\n]{0,100}\b(?:from here|here\b|in this (?:project|environment|sandbox|workspace|session|runtime|conversation)|on this (?:machine|computer|runtime)|from this (?:computer|runtime|machine))`)],
  ['cannot', /\bi (?:can't|cannot|can not)\b|\bi(?:'m| am) (?:unable|not able) to\b/],
]

/** The refusal in an answer, as one of `KINDS`' keys, or null. Deterministic; nothing is stored. */
export function refusalOf(answer) {
  const t = norm(answer).slice(0, 20_000)
  if (!t.trim()) return null
  for (const [k, re] of REFUSALS) if (re.test(t)) return k
  return null
}

const WEB_TOOL = /^(?:web|websearch|webfetch|fetch|search|download)/
/** What a failed step was, from its tool's name and its error message (or the shell's exit code). */
export function stepKindOf({ tool = '', message = '', exit = null }) {
  const m = String(message ?? '')
  if (/declined|the user (?:rejected|dismissed)/i.test(m)) return null // the person said no: not a fault of Ola's
  if (WEB_TOOL.test(String(tool).toLowerCase())) return 'step_web'
  if (/Invalid arguments for tool|invalid input|schema/i.test(m)) return 'step_invalid'
  if (/rejected|denied|not allowed|permission/i.test(m)) return 'step_denied'
  if (/no such file|ENOENT|not found/i.test(m)) return 'step_not_found'
  if (/timed? ?out/i.test(m)) return 'step_timeout'
  if (exit !== null && exit !== 0) return 'step_shell'
  return 'step_other'
}

/** What stopped a whole request, from opencode's structured error and the turn's outcome. */
export function runKindOf(error, outcome) {
  if (outcome === 'interrupted' && !error) return null // the person pressed Stop
  const message = String(error?.message ?? '')
  const status = error?.status
  if (!error && outcome !== 'failed') return null
  if (status === 429 || /quota|insufficient_quota|weekly allowance/i.test(message)) return 'run_quota'
  if (status === 503 || status === 504 || /overloaded|timeout|timed out/i.test(message)) return 'run_busy'
  if (status && status >= 400) return 'run_model'
  if (/interrupt|abort|cancel/i.test(message) && outcome !== 'failed') return null
  return 'run_stopped'
}

/**
 * The kinds in one turn of opencode's message list (GET /api/session/:id/message): the user message
 * `turnId` and what came after it up to the next user message. Returns { kinds, engine, request,
 * answer } or null when the turn is not there or not finished. `request` and `answer` are for the
 * caller's memory only (kindOf, a "this was wrong" mark); `kinds` is all that is stored as a fault.
 */
export function readTurn(messages, turnId = null) {
  const ordered = [...(Array.isArray(messages) ? messages : [])].sort((a, b) => (a?.time?.created ?? 0) - (b?.time?.created ?? 0))
  const users = ordered.map((m, i) => [m, i]).filter(([m]) => m?.type === 'user')
  const at = turnId ? users.find(([m]) => m.id === turnId) : users.at(-1)
  if (!at) return null
  const [user, i0] = at
  const next = users.find(([, i]) => i > i0)
  const rest = ordered.slice(i0 + 1, next ? next[1] : undefined)
  let engine = 'ola'
  let answer = ''
  let error = null
  let outcome = null
  const steps = new Set()
  for (const m of rest) {
    if (m?.type === 'assistant') {
      if (m.model?.id === 'hosted') engine = 'hosted'
      let text = ''
      for (const part of Array.isArray(m.content) ? m.content : []) {
        if (part?.type === 'text') text += part.text ?? ''
        if (part?.type === 'tool') {
          const st = part.state?.status
          const exit = typeof part.state?.metadata?.exit === 'number' ? part.state.metadata.exit : null
          if (st === 'error' || (st === 'completed' && exit !== null && exit !== 0)) {
            const k = stepKindOf({ tool: part.name, message: part.state?.error?.message, exit: st === 'completed' ? exit : null })
            if (k) steps.add(k)
          }
        }
      }
      if (text.trim()) answer = text
      if (m.error) error = m.error
    }
    if (m?.type === 'idle') outcome = m.outcome ?? null
  }
  if (!outcome) return null // not finished yet
  const kinds = []
  const refusal = refusalOf(answer)
  if (refusal) kinds.push(refusal)
  kinds.push(...steps)
  const run = runKindOf(error, outcome)
  if (run) kinds.push(run)
  return { turnId: user.id, kinds, engine, request: String(user.text ?? ''), answer, outcome }
}

/** The same for a kept turn (devices.mjs): its answer, its steps in the app's words, its status. */
export function keptKinds(k) {
  const kinds = []
  const refusal = refusalOf(k.answer)
  if (refusal) kinds.push(refusal)
  let steps = []
  try {
    steps = JSON.parse(k.steps ?? '[]')
  } catch {}
  for (const s of Array.isArray(steps) ? steps : []) if (s?.status === 'failed') {
    const kk = stepKindOf({ tool: s.tool, message: s.error ?? '', exit: /stopped with an error/i.test(s.error ?? '') ? 1 : null })
    if (kk && !kinds.includes(kk)) kinds.push(kk)
  }
  if (k.status === 'failed') kinds.push('run_stopped')
  return kinds
}

const pacificDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

export function makeFaults({ db, workspaces = null, log = () => {}, settleMs = 1500 }) {
  const insert = db.prepare(
    `INSERT INTO faults (at, runtime, engine, type, kind, work, workspace_id, kept_turn_id, turn_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(turn_key, kind) DO NOTHING`,
  )
  const record = (at, runtime, engine, kinds, work, wsId, keptId, key) => {
    let n = 0
    for (const kind of kinds) if (KINDS[kind]) n += insert.run(at, runtime, engine, typeOf(kind), kind, work, wsId, keptId, key).changes
    return n
  }

  /** A run in a cloud project ended (workspaces.mjs onRunEnded): its last turn is read and labeled. */
  async function fromRun(slug, wsId, sessionID) {
    if (!workspaces || !ID.test(sessionID)) return 0
    await new Promise((r) => setTimeout(r, settleMs)) // the idle message lands just after the event
    const r = await workspaces.oc(slug, 'GET', `/api/session/${sessionID}/message?limit=200`)
    const list = Array.isArray(r.json?.data) ? r.json.data : Array.isArray(r.json) ? r.json : null
    if (!list) return 0
    const t = readTurn(list)
    if (!t || !t.kinds.length || !ID.test(t.turnId)) return 0
    const n = record(Date.now(), 'cloud', t.engine, t.kinds, kindOf(t.request), wsId, null, `oc:${wsId}:${t.turnId}`)
    if (n) log(`faults: ${t.kinds.join(', ')} in ${slug}`)
    return n
  }

  /** A kept turn from a Mac (local runtime only: a cloud turn was counted when its run ended). */
  function fromKept(keptId) {
    const k = db.prepare('SELECT id, at, runtime, engine, status, request, answer, steps FROM kept_turns WHERE id = ?').get(keptId)
    if (!k || k.runtime !== 'local') return 0
    return record(k.at, 'local', k.engine, keptKinds(k), kindOf(k.request), null, k.id, `kept:${k.id}`)
  }

  // ------------------------------------------------------------ "This was wrong"
  /** Which turns of a conversation this person marked (the page shows "Kept as a test" on them). */
  function marked(wsId, personId, session) {
    if (!ID.test(session ?? '')) return []
    return db.prepare('SELECT turn_id AS turn FROM wrong_marks WHERE workspace_id = ? AND person_id = ? AND session = ?').all(wsId, personId, session).map((r) => r.turn)
  }

  /** The person's yes: the turn is read from the project itself (never from the page) and kept. */
  async function mark(ws, personId, body) {
    if (body?.yes !== true) return { status: 400, body: { error: 'yes', message: 'This needs your yes.' } }
    const session = body?.conversation
    const turn = body?.turn
    if (!ID.test(session ?? '') || !ID.test(turn ?? '')) return { status: 400, body: { error: 'bad_turn' } }
    const had = db.prepare('SELECT id FROM wrong_marks WHERE workspace_id = ? AND session = ? AND turn_id = ? AND person_id = ?').get(ws.id, session, turn, personId)
    if (had) return { status: 200, body: { ok: true, id: had.id, already: true } }
    const r = await workspaces.oc(ws.slug, 'GET', `/api/session/${session}/message?limit=200`)
    const list = Array.isArray(r.json?.data) ? r.json.data : Array.isArray(r.json) ? r.json : null
    if (!list) return { status: 502, body: { error: 'unreachable', message: 'Ola’s computer for this project did not answer. Try again in a minute.' } }
    const t = readTurn(list, turn)
    if (!t) return { status: 404, body: { error: 'not_found', message: 'That answer is not in this conversation any more.' } }
    const note = typeof body.why === 'string' ? body.why.trim().slice(0, 2000) : ''
    const ins = db
      .prepare(
        `INSERT INTO wrong_marks (at, workspace_id, person_id, session, turn_id, engine, work, kinds, request, answer, why)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(Date.now(), ws.id, personId, session, turn, t.engine, kindOf(t.request), t.kinds.join(','), t.request.slice(0, 40_000), t.answer.slice(0, 40_000), note || null)
    log(`wrong: a turn in ${ws.slug} was marked wrong (${t.engine}${t.kinds.length ? `, ${t.kinds.join(', ')}` : ''})`)
    return { status: 200, body: { ok: true, id: Number(ins.lastInsertRowid) } }
  }

  /** The person takes their mark back: the row and its words are deleted. */
  function unmark(ws, personId, body) {
    if (!ID.test(body?.conversation ?? '') || !ID.test(body?.turn ?? '')) return { status: 400, body: { error: 'bad_turn' } }
    const r = db.prepare('DELETE FROM wrong_marks WHERE workspace_id = ? AND person_id = ? AND session = ? AND turn_id = ?').run(ws.id, personId, body.conversation, body.turn)
    return { status: 200, body: { ok: true, deleted: Number(r.changes) } }
  }

  return { fromRun, fromKept, marked, mark, unmark, summary: (o) => summary(db, o) }
}

/**
 * Labels and counts only, what the board shows (scripts/venture/learning.mjs reads it through
 * `admin.mjs faults --json`). Requests are counted as switches.mjs counts them (Ola runs, Claude runs,
 * kept local turns); a turn with any fault counts once in `turns`.
 */
export function summary(db, { days = 7, now = Date.now() } = {}) {
  const since = now - days * 86400_000
  const requests =
    db.prepare("SELECT count(*) AS n FROM audit WHERE at >= ? AND action IN ('run_started', 'claude_used')").get(since).n +
    db.prepare("SELECT count(*) AS n FROM kept_turns WHERE at >= ? AND runtime = 'local'").get(since).n
  const rows = db.prepare('SELECT at, runtime, engine, type, kind, work, turn_key AS key FROM faults WHERE at >= ?').all(since)
  const turns = new Set(rows.map((r) => r.key)).size
  const byKind = Object.keys(KINDS).map((k) => ({ kind: k, type: typeOf(k), words: KINDS[k], n: rows.filter((r) => r.kind === k).length })).filter((x) => x.n).sort((a, b) => b.n - a.n)
  const tally = (key, list) => Object.fromEntries(list.map((k) => [k, rows.filter((r) => r[key] === k).length]))
  const from14 = now - 14 * 86400_000
  const all14 = db.prepare('SELECT at, type, turn_key AS key FROM faults WHERE at >= ?').all(from14)
  const dayKeys = []
  for (let t = now - 13 * 86400_000; t <= now + 3600_000; t += 86400_000) if (!dayKeys.includes(pacificDay(t))) dayKeys.push(pacificDay(t))
  const byDay = dayKeys.map((day) => {
    const d = all14.filter((r) => pacificDay(r.at) === day)
    return { day, turns: new Set(d.map((r) => r.key)).size, refusal: d.filter((r) => r.type === 'refusal').length, step: d.filter((r) => r.type === 'step').length, run: d.filter((r) => r.type === 'run').length }
  })
  const marks = db.prepare('SELECT at, case_id AS c FROM wrong_marks WHERE at >= ?').all(since)
  return {
    at: new Date(now).toISOString(),
    days,
    requests,
    turns,
    per100: requests ? Math.round((1000 * turns) / requests) / 10 : null,
    types: tally('type', TYPES),
    engines: tally('engine', ['ola', 'hosted', 'claude']),
    runtimes: tally('runtime', ['cloud', 'local']),
    kinds: byKind,
    largest: byKind[0] ? { kind: byKind[0].kind, words: byKind[0].words, n: byKind[0].n } : null,
    wrong: { marked: marks.length, cases: marks.filter((m) => m.c).length, waiting: marks.filter((m) => !m.c).length },
    by_day: byDay,
  }
}

/** The marks, word for word, for whoever writes the case (on this machine only: `admin.mjs wrong`). */
export function marks(db, { days = 30, id = null, now = Date.now() } = {}) {
  return db
    .prepare(
      `SELECT m.id, m.at, w.slug AS project, p.handle, m.session, m.turn_id AS turn, m.engine, m.work, m.kinds, m.request, m.answer, m.why, m.case_id AS "case"
       FROM wrong_marks m JOIN workspaces w ON w.id = m.workspace_id JOIN people p ON p.id = m.person_id
       WHERE (? IS NULL AND m.at >= ?) OR m.id = ? ORDER BY m.at DESC`,
    )
    .all(id, now - days * 86400_000, id)
    .map((r) => ({ ...r, kinds: r.kinds ? r.kinds.split(',') : [], when: new Date(r.at).toISOString() }))
}
