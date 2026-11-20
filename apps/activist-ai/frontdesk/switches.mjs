// Learning from every switch to Claude (OLA-157, approved by Bart on 2026-11-19: "Yes, approved.").
// Bart, Nov 18: "When I switch to Use Claude for an app after I used a lower model, that choice
// means the work was poor quality ... learn from that so our system learns and gets better over time."
//
// A switch is a request handed to a fallback (the hosted open model or Claude) right after a cheaper
// engine (Ola's own model, or the hosted one) had the last turn in that conversation. The ladder is
// ola < hosted < claude; a turn back down the ladder is not a switch.
//
// What is recorded, for everyone, is labels and counts only (platform migration 15, `switches`):
// when, the product and runtime, from which engine to which, why (the person asked, Ola was stuck,
// the project hands everything over), and the kind of work as one fixed word (`KINDS`), worked out
// here in memory from the request and never stored with it. No request, no answer, no file name, no
// person. The request text is seen only on its way through (the run's own body, or a kept turn).
//
// Each switch then becomes a test task where that is allowed, and only there:
//   - in a project whose owner chose "A few each day, on their own" for made-up copies (Compare
//     with Claude, compare.mjs): the switched request becomes the sampler's next pick, so a made-up
//     copy is made of it in the project's own VM, leak-checked, and scored against Claude; a loss
//     becomes a candidate eval task in the review queue on this machine (evals/candidates). The
//     opencode ids of the request are kept only until the copy is made, then cleared.
//   - for a person who turned on "Store your conversations on ola.cx" (kept_turns, OLA-159): the kept
//     turns themselves are the draft, the request word for word with what Ola's model did and what
//     Claude did (`drafts`, `admin.mjs switches tasks`). They live only in kept_turns: when the person
//     deletes their kept turns the drafts go with them, and the switch keeps only its labels.
//   - anywhere else: labels only.
// Nothing of a project's content leaves this machine or enters the repo. What leaves is `summary`:
// counts by kind, reason, engine, product and day, read by scripts/venture/learning.mjs for the
// board's Learning page ("switches per 100 requests", the largest group named). The weekly fix (every
// Friday, apps/venture/SWEEP.md) takes the largest group and fixes it, measured before and after.

/** The kinds of work, as Bart reads them on the board. */
export const KINDS = { app: 'apps', design: 'design', document: 'documents', data: 'data', research: 'research', other: 'other' }
export const REASONS = ['asked', 'stuck', 'always', 'unknown']
export const PRODUCTS = ['mac', 'iphone', 'cli', 'web']
const RANK = { ola: 0, hosted: 1, claude: 2 }
const SID = /^[A-Za-z0-9_-]{1,80}$/

// The words that mark each kind. A request is the kind with the most of them; a tie goes to the
// earlier kind in this order (what was made beats what it was made from). Any "app" or "game" is an app.
const WORDS = {
  app: /\b(apps?|application|game|games|calculator|converter|timer|quiz|to-?do|widget|prototype|generator|interactive)\b/g,
  design: /\b(pages?|website|websites|site|landing|design|redesign|layout|looks?|style|colou?rs?|fonts?|poster|flyer|logo|banner|slides?|deck|beautiful|pretty|ugly)\b/g,
  document: /\b(report|reports|document|documents|docx|word|pdfs?|memo|letter|letters|brief|summary|summari[sz]e|essay|article|translat\w*|draft|proposal|minutes|newsletter|press release)\b/g,
  data: /\b(csv|spreadsheets?|excel|xlsx|workbook|tables?|charts?|graphs?|plot|database|sql|query|rows?|columns?|dedupe|duplicates?|clean|totals?|sum|averages?|count|survey|dataset|data|numbers)\b/g,
  research: /\b(research|search|look up|sources?|papers?|studies|study|laws?|legal|cite|citations?|web|online|news)\b/g,
}
/** The kind of work a request is, as one of `KINDS`' keys. Deterministic; nothing is stored. */
export function kindOf(text) {
  const t = String(text ?? '').toLowerCase()
  if (/\b(apps?|game|games)\b/.test(t)) return 'app'
  let best = 'other'
  let most = 0
  for (const [k, re] of Object.entries(WORDS)) {
    const n = (t.match(re) ?? []).length
    if (n > most) (best = k), (most = n)
  }
  return best
}

/** Whether going from `from` to `to` is a switch up the ladder. */
export const isSwitch = (from, to) => from in RANK && to in RANK && RANK[to] > RANK[from]

const pacificDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

export function makeSwitches({ db, log = () => {} }) {
  const insert = db.prepare(
    `INSERT INTO switches (at, product, runtime, from_engine, to_engine, reason, kind, workspace_id, kept_turn_id, copy_state, copy_session, copy_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(kept_turn_id) DO NOTHING`,
  )

  /**
   * A Claude or hosted run the web app started (server.mjs, after the run was accepted). The page
   * says what the conversation's last turn was (`switchedFrom`, `fromMessage`: web/src/lib/ola.ts);
   * nothing is recorded unless that is a switch up the ladder. Returns the row id or null.
   */
  function fromRun(ws, body, to) {
    const from = body?.switchedFrom
    if (!isSwitch(from, to)) return null
    const reason = REASONS.includes(body?.why) ? body.why : 'asked'
    const kind = kindOf(body?.request)
    // A made-up copy only where the owner chose them to be made on their own (compare_auto 'daily').
    const auto = db.prepare('SELECT compare_auto AS a FROM workspaces WHERE id = ?').get(ws.id)?.a === 'daily'
    const ids = auto && SID.test(body?.conversation ?? '') && SID.test(body?.fromMessage ?? '') && !/^(local|claude)-/.test(body.fromMessage)
    const r = insert.run(Date.now(), 'web', 'cloud', from, to, reason, kind, ws.id, null, ids ? 'waiting' : 'labels_only', ids ? body.conversation : null, ids ? body.fromMessage : null)
    log(`switches: ${from} to ${to} (${reason}, ${KINDS[kind]}) in ${ws.slug}${ids ? ', a made-up copy will be made' : ''}`)
    return Number(r.lastInsertRowid)
  }

  /** A kept turn (devices.mjs) that carries switched_from: the person stores their conversations. */
  function fromKept(keptId) {
    const k = db.prepare('SELECT id, at, product, runtime, engine, switched_from, request FROM kept_turns WHERE id = ?').get(keptId)
    if (!k || !isSwitch(k.switched_from, k.engine)) return null
    const r = insert.run(k.at, k.product, k.runtime, k.switched_from, k.engine, 'asked', kindOf(k.request), null, k.id, 'kept', null, null)
    return r.changes ? Number(r.lastInsertRowid) : null
  }

  /** The sampler's next pick in a project (compare.mjs): the oldest switch still waiting for its copy. */
  function nextCopy(wsId, now = Date.now()) {
    // A copy waits a week at most, and only while the owner still has made-up copies made on their own.
    db.prepare(
      `UPDATE switches SET copy_state = 'labels_only', copy_session = NULL, copy_message = NULL
       WHERE copy_state = 'waiting' AND (at < ? OR workspace_id NOT IN (SELECT id FROM workspaces WHERE compare_auto = 'daily'))`,
    ).run(now - 7 * 86400_000)
    return db.prepare("SELECT id, copy_session AS conversation, copy_message AS message FROM switches WHERE workspace_id = ? AND copy_state = 'waiting' ORDER BY at LIMIT 1").get(wsId) ?? null
  }
  /** The copy of a switch was made (its comparison) or could not be: the opencode ids are dropped either way. */
  function copied(id, comparisonId) {
    db.prepare('UPDATE switches SET copy_state = ?, comparison_id = ?, copy_session = NULL, copy_message = NULL WHERE id = ?').run(comparisonId ? 'made' : 'failed', comparisonId ?? null, id)
  }

  return { fromRun, fromKept, nextCopy, copied, summary: (o) => summary(db, o) }
}

/**
 * Labels and counts only, what the board shows (scripts/venture/learning.mjs reads it through
 * `admin.mjs switches --json`). Requests: the Ola runs this machine started (audit run_started, which
 * the hosted model's runs are too), the Claude runs (claude_used), and the turns people's Macs ran
 * locally and kept (kept_turns, local). A Mac that does not keep its turns is in neither count.
 */
export function summary(db, { days = 7, now = Date.now() } = {}) {
  const since = now - days * 86400_000
  const audit = db.prepare("SELECT at FROM audit WHERE at >= ? AND action IN ('run_started', 'claude_used')").all(since).map((r) => r.at)
  const local = db.prepare("SELECT at FROM kept_turns WHERE at >= ? AND runtime = 'local'").all(since).map((r) => r.at)
  const rows = db
    .prepare('SELECT s.at, s.product, s.from_engine AS "from", s.to_engine AS "to", s.reason, s.kind, s.copy_state AS copy, s.kept_turn_id AS kept, c.candidate FROM switches s LEFT JOIN comparisons c ON c.id = s.comparison_id WHERE s.at >= ?')
    .all(since)
  const requests = audit.length + local.length
  const tally = (key, list) => Object.fromEntries(list.map((k) => [k, rows.filter((r) => r[key] === k).length]))
  const byKind = Object.keys(KINDS).map((k) => ({ kind: k, words: KINDS[k], n: rows.filter((r) => r.kind === k).length })).filter((x) => x.n).sort((a, b) => b.n - a.n)
  // The last 14 Pacific days, whatever `days` is.
  const from14 = now - 14 * 86400_000
  const reqDays = [...db.prepare("SELECT at FROM audit WHERE at >= ? AND action IN ('run_started', 'claude_used')").all(from14), ...db.prepare("SELECT at FROM kept_turns WHERE at >= ? AND runtime = 'local'").all(from14)].map((r) => pacificDay(r.at))
  const swDays = db.prepare('SELECT at FROM switches WHERE at >= ?').all(from14).map((r) => pacificDay(r.at))
  const dayKeys = []
  for (let t = now - 13 * 86400_000; t <= now + 3600_000; t += 86400_000) if (!dayKeys.includes(pacificDay(t))) dayKeys.push(pacificDay(t))
  const byDay = dayKeys.map((day) => ({ day, requests: reqDays.filter((d) => d === day).length, switches: swDays.filter((d) => d === day).length }))
  return {
    at: new Date(now).toISOString(),
    days,
    requests,
    switches: rows.length,
    per100: requests ? Math.round((1000 * rows.length) / requests) / 10 : null,
    to: tally('to', ['claude', 'hosted']),
    from: tally('from', ['ola', 'hosted']),
    reasons: tally('reason', REASONS),
    products: tally('product', PRODUCTS),
    kinds: byKind,
    largest: byKind[0] ? { kind: byKind[0].kind, words: byKind[0].words, n: byKind[0].n } : null,
    tasks: {
      // made-up copies made of switched requests, and how many of them became candidate eval tasks
      copies: rows.filter((r) => r.copy === 'made').length,
      candidates: rows.filter((r) => r.copy === 'made' && r.candidate === 1).length,
      waiting: rows.filter((r) => r.copy === 'waiting').length,
      // drafts from kept conversations (the request with both attempts, on this machine)
      // (a draft whose kept turns the person deleted is gone: that switch is labels only now)
      kept: rows.filter((r) => r.copy === 'kept' && r.kept !== null).length,
      labels_only: rows.filter((r) => r.copy === 'labels_only' || r.copy === 'failed' || (r.copy === 'kept' && r.kept === null)).length,
    },
    by_day: byDay,
  }
}

/**
 * The drafts from kept conversations, for the weekly fix (on this machine only: `admin.mjs switches
 * tasks`): each switch whose kept turn still exists, its request word for word, what the engine
 * before it did (the person's previous kept turn in that conversation) and what the fallback did.
 * In the shape of evals/apps/problems.json, with `must` left for the person who writes its check.
 */
export function drafts(db, { kind = null, days = 7, now = Date.now() } = {}) {
  const rows = db
    .prepare(
      `SELECT s.id, s.kind, s.from_engine AS "from", s.to_engine AS "to", k.person_id, k.session, k.at, k.product, k.runtime, k.request, k.answer, k.steps, k.status
       FROM switches s JOIN kept_turns k ON k.id = s.kept_turn_id WHERE s.at >= ? AND (? IS NULL OR s.kind = ?) ORDER BY s.at`,
    )
    .all(now - days * 86400_000, kind, kind)
  const attempt = (t) => (t ? { engine: t.engine ?? null, status: t.status, answer: t.answer, steps: JSON.parse(t.steps).map((s) => s.words).filter(Boolean) } : null)
  return rows.map((r) => {
    const before = db.prepare('SELECT engine, status, answer, steps FROM kept_turns WHERE person_id = ? AND session = ? AND at < ? AND engine = ? ORDER BY at DESC LIMIT 1').get(r.person_id, r.session, r.at, r.from)
    return {
      id: `switch-${r.id}`,
      kind: r.kind,
      request: r.request,
      source: 'switch',
      from: `a kept conversation, ${r.product} ${r.runtime}, ${new Date(r.at).toISOString().slice(0, 10)}: ${r.from} first, then ${r.to}`,
      must: '',
      attempts: { [r.from]: attempt(before), [r.to]: attempt({ ...r, engine: r.to }) },
    }
  })
}
