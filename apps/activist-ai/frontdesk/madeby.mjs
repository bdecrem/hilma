// Which engine made a file, the Cloud runtime's side (OLA-224). Bart asked Ola "which agent built
// index.html: hosted or claude?" and the open model said "I built it... there was no separate
// claude agent", though Claude had rewritten it. Three engines can change a project's files: Ola's
// own open model, the hosted open model and Claude. His words: "the ola agent should know about
// this concept, and know which model built stuff."
//
// Recorded: every turn the front desk runs in a project's VM is bracketed by `ola-db made-by begin`
// and `end` inside that VM (workspace/ola-db; the record lives in the project's own database,
// /work/project.db, names and times only). Ola's turn begins as its prompt goes through the proxy
// and ends on the session's execution-ended event (workspaces.mjs), or when a sweep here no longer
// sees the session executing; the hosted model's turn is the hosted run (hosted.mjs), Claude's the
// Claude run (claude.mjs). A turn left open by a front desk restart is ended as interrupted at the
// project's next begin (`end --stale`), and by ola-init when the VM starts.
//
// Known to the agent: opencode's history shows the hosted model's replies as the conversation's own
// assistant messages, and Claude's turns not at all. So before an open model's prompt goes in (Ola's
// or the hosted one's), the turns other engines ran in that conversation since its own last turn are
// put in front of the person's text as one marked note (`<ola-engines>`), which the apps strip when
// they show the request (web/src/lib/conversation.ts stripEngines). The note is ours, never the
// workspace's word: it is built here from what the front desk itself ran.
//
// In memory: after a front desk restart, a conversation's earlier turns are not in a note (the
// record in project.db, which ola-made-by reads, still is).
import { randomBytes } from 'node:crypto'

// Which model served a turn (OLA-168): Ola's turn may run on the design model (gateway/design.mjs)
// once the designer skill is loaded. The gateway keeps which name served each request, by project and
// by opencode's conversation id (its X-Session-Id header), and the front desk asks it as the turn
// ends (GET /v1/served with the usage token). A change the design model made is recorded with the
// model `design:<its id>`, which `ola-made-by` prints as "Inkling-2-Small, an outside open model that
// Ola uses for design work (not Ola's own model)" (workspace/ola-db who_words). Without a
// conversation id, or when the gateway cannot be asked, no model is named.
//
// Per change, not per turn (OLA-303): a turn records every file changed in the project between its
// begin and its end, whoever changed it, so a change can land in another turn's window (two
// conversations at once, a turn ended early by the sweep). The checker found two design changes to
// index.html recorded as plain "Ola's own open model". So each change is matched to the step that
// led to it: the gateway's steps (when each chat request finished, its conversation, the name that
// served it), and the last step before the file's time (a tool writes right after the step that
// asked for it). One conversation's step: its name decides and the change is recorded under that
// conversation. Steps of two conversations within a few seconds of each other: the design model when
// all were the design model's, Ola's own when none were, and otherwise "unknown" (the record says it
// is not known), never a guess. Not covered: a command that writes a file long after its step while
// another conversation steps in between (the change goes to that one).
export const designModel = (id) => `design:${String(id ?? '').trim() || 'thinkingmachines/Inkling-2-Small'}`
export const isDesignModel = (m) => typeof m === 'string' && (m.startsWith('design:') || m.startsWith('the design model, '))
/** The design model's short name for the note ("Inkling-2-Small"). */
const designName = (m) => String(m).replace(/^design:|^the design model, /, '').split('/').pop() || 'the design model'
// A file's time is the VM's clock, a step's the gateway's: a step that finished up to this long after
// the file's time still counts as before it.
const CLOCK_SLACK_MS = 1000
// Steps of two conversations this close together are too close to tell which led to a change.
const TOO_CLOSE_MS = 3000

/**
 * Who made one change: { model, session } (session only when another conversation made it).
 * `steps` are [at ms, session, name], oldest first; `mtimeMs` the file's time.
 */
export function attributeChange(steps, session, mtimeMs, designId) {
  const before = steps.filter((s) => s[0] <= mtimeMs + CLOCK_SLACK_MS)
  if (!before.length) return { model: null }
  const latest = before[before.length - 1][0]
  const last = new Map()
  for (const s of before) last.set(s[1], s)
  const cands = [...last.values()].filter((s) => s[0] >= latest - TOO_CLOSE_MS)
  const design = (s) => s[2] === 'design'
  if (cands.length === 1) return { model: design(cands[0]) ? designModel(designId) : null, ...(cands[0][1] !== session ? { session: cands[0][1] } : {}) }
  if (cands.every(design)) return { model: designModel(designId) }
  if (!cands.some(design)) return { model: null }
  return { model: 'unknown' }
}

/** What served one conversation since a moment: { names: { general: n, design: n }, design_model, steps } or null. */
export async function gatewayServed(cc, caller, session, since) {
  if (!cc?.usageToken || !cc.gateway || !SID.test(session ?? '')) return null
  try {
    const q = new URLSearchParams({ caller, session, since: String(Math.max(0, Math.floor(since))), steps: '1' })
    const r = await fetch(`${cc.gateway}/v1/served?${q}`, { headers: { authorization: `Bearer ${cc.usageToken}` }, signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const j = await r.json()
    const steps = Array.isArray(j?.steps) ? j.steps.filter((s) => Array.isArray(s) && Number.isFinite(s[0]) && typeof s[1] === 'string' && typeof s[2] === 'string') : null
    return j && typeof j.names === 'object' ? { names: j.names, design_model: typeof j.design_model === 'string' ? j.design_model : null, steps } : null
  } catch {
    return null
  }
}

export const NOTE_OPEN = '<ola-engines>'
export const NOTE_CLOSE = '</ola-engines>'
export const ENGINE_NAME = { ola: 'Ola’s own open model', hosted: 'The hosted open model', claude: 'Claude' }
const SID = /^[A-Za-z0-9_-]{1,80}$/
const MAX_SESSIONS = 5000
const MAX_TURNS = 20
const MAX_FILES = 8
// How far back the steps are asked for at a turn's end: a change can come from a step before the turn began.
const STEPS_BACK_MS = 15 * 60_000

/** The person's text without a leading note (what an app shows, what Compare copies). */
export function stripEngines(text) {
  const s = String(text ?? '')
  if (!s.startsWith(NOTE_OPEN)) return s
  const end = s.indexOf(NOTE_CLOSE)
  return end < 0 ? s : s.slice(end + NOTE_CLOSE.length).replace(/^\s+/, '')
}

/** A request as the note quotes it: one line, at most 80 characters, nothing that closes the note. */
const quote = (t) => {
  const one = stripEngines(t).replace(/\s+/g, ' ').replace(/[<>]/g, '').replace(/"/g, '”').trim()
  return one.length > 80 ? `${one.slice(0, 80).trimEnd()}…` : one
}

/** "changed index.html, made site/a.html and 3 more files" (plain words, a handful of names). */
function filesWords(files) {
  if (!files) return 'is still working'
  if (!files.length) return 'changed no files'
  const by = { created: 'made', changed: 'changed', deleted: 'deleted' }
  const shown = files.slice(0, MAX_FILES)
  const groups = []
  for (const how of ['created', 'changed', 'deleted']) {
    const names = shown.filter((f) => f.how === how).map((f) => f.path)
    if (names.length) groups.push(`${by[how]} ${names.join(', ')}`)
  }
  const more = files.length - shown.length
  return groups.join(', ') + (more > 0 ? ` and ${more} more ${more === 1 ? 'file' : 'files'}` : '')
}

/**
 * The note for an engine's next prompt: the turns of other engines since its own last turn. Empty
 * when there were none.
 */
export function engineNote(turns, engine) {
  let from = 0
  for (let i = turns.length - 1; i >= 0; i--)
    if (turns[i].engine === engine) {
      from = i + 1
      break
    }
  const others = turns.slice(from).filter((t) => t.engine !== engine && ENGINE_NAME[t.engine])
  if (!others.length) return ''
  const lines = others.map((t) => `${t.engine === 'ola' && isDesignModel(t.model) ? `${designName(t.model)}, an outside open model that Ola uses for design work` : ENGINE_NAME[t.engine]}${t.request ? `, asked "${quote(t.request)}"` : ''}, ${filesWords(t.files)}${t.interrupted ? ' (it did not finish)' : ''}.`)
  return `${NOTE_OPEN}Before this request, other engines worked in this conversation (not you): ${lines.join(' ')} Never say you did their work; ola-made-by <file> shows who made a file.${NOTE_CLOSE}\n\n`
}

/** The record's JSON answer to `end`, reduced to what the note and the page need. */
function filesOf(x) {
  return Array.isArray(x?.files) ? x.files.filter((f) => typeof f?.path === 'string' && ['created', 'changed', 'deleted'].includes(f.how)).map((f) => ({ path: f.path.slice(0, 300), how: f.how })) : []
}

/**
 * `exec(slug, args)` runs `ola-db made-by <args>` in the project's VM ({ code, out }); `executing(slug)`
 * is the set of sessions opencode says are executing (null when it does not answer).
 */
export function makeMadeBy({ exec, executing, served = null, log = () => {}, sweepMs = 10_000, settleMs = 30_000 }) {
  const open = new Map() // slug -> Map(turn -> { session, engine, at, seen, silent, entry })
  const convs = new Map() // `${slug}:${session}` -> [{ engine, request, files, interrupted }]
  const cleaned = new Set() // projects whose turns left open by an earlier front desk were ended

  const entriesOf = (slug, session) => {
    const k = `${slug}:${session}`
    if (!convs.has(k)) {
      if (convs.size >= MAX_SESSIONS) convs.delete(convs.keys().next().value)
      convs.set(k, [])
    }
    return convs.get(k)
  }
  const remember = (slug, session, entry) => {
    if (!SID.test(session ?? '')) return
    const list = entriesOf(slug, session)
    list.push(entry)
    if (list.length > MAX_TURNS) list.splice(0, list.length - MAX_TURNS)
  }
  const parse = (out) => {
    try {
      return JSON.parse(String(out).trim().split('\n').pop() || 'null')
    } catch {
      return null
    }
  }

  /** Starts a turn: the folder's files are noted in the VM. Resolves its id, or null when the VM did not answer. */
  async function begin(slug, { engine, session, request = '', model = null }) {
    if (!ENGINE_NAME[engine]) throw new Error(`not an engine: ${engine}`)
    try {
      if (!cleaned.has(slug)) {
        const r = await exec(slug, ['end', '--stale'])
        if (r.code === 0) cleaned.add(slug)
        for (const t of Array.isArray(parse(r.out)) ? parse(r.out) : []) if (t?.files?.length) log(`${slug}: a turn left open (${t.engine}) was ended, ${t.files.length} files`)
      }
      // A turn of the same conversation still open here: it ended without our hearing it.
      for (const [id, t] of open.get(slug) ?? []) if (t.session === session && session) await end(slug, id)
      const turn = `${engine[0]}${Date.now().toString(36)}${randomBytes(4).toString('hex')}`
      const args = ['begin', '--turn', turn, '--engine', engine, ...(model ? ['--model', String(model).slice(0, 60)] : []), ...(SID.test(session ?? '') ? ['--session', session] : [])]
      const r = await exec(slug, args)
      if (r.code !== 0) {
        log(`${slug}: a ${engine} turn could not be noted (made-by begin exited ${r.code})`)
        return null
      }
      const entry = { engine, request: String(request).slice(0, 2000), files: null, interrupted: false }
      remember(slug, session, entry)
      if (!open.has(slug)) open.set(slug, new Map())
      open.get(slug).set(turn, { session, engine, at: Date.now(), seen: false, silent: 0, entry })
      return turn
    } catch (e) {
      log(`${slug}: a ${engine} turn could not be noted (${e?.message ?? e})`)
      return null
    }
  }

  /** Ends a turn: what it created, changed or deleted is recorded with its engine. Resolves the files. */
  async function end(slug, turn, { interrupted = false } = {}) {
    const t = open.get(slug)?.get(turn)
    if (!turn || !t) return null
    open.get(slug).delete(turn)
    if (!open.get(slug).size) open.delete(slug)
    try {
      // Ola's own turn: which model made each change? Asked of the gateway: its steps since a while
      // before the turn began (a change can come from a step before it, OLA-303).
      let s = null
      if (t.engine === 'ola' && served && SID.test(t.session ?? '')) s = await served(slug, t.session, t.at - STEPS_BACK_MS).catch(() => null)
      // An older gateway without steps: the turn's conversation as a whole, as before.
      const whole = s && !s.steps && s.names?.design > 0 ? designModel(s.design_model) : null
      if (whole) t.entry.model = whole
      const r = await exec(slug, ['end', '--turn', turn, ...(whole ? ['--model', whole] : []), ...(interrupted ? ['--interrupted'] : [])])
      const out = r.code === 0 ? parse(r.out) : null
      const files = filesOf(out)
      // Changes another conversation's turn found to be this one's are kept beside its own (OLA-303).
      const earlier = (t.entry.files ?? []).filter((x) => !files.some((f) => f.path === x.path))
      Object.assign(t.entry, { files: [...earlier, ...files], interrupted })
      if (r.code !== 0) log(`${slug}: a ${t.engine} turn could not be recorded (made-by end exited ${r.code})`)
      if (s?.steps && Array.isArray(out?.files)) {
        // Each change matched to its step; rows that need another model or conversation are fixed.
        const groups = new Map()
        let design = 0
        let mine = 0
        for (const f of out.files) {
          if (typeof f?.path !== 'string' || f.how === 'deleted' || !Number.isFinite(f.mtime)) continue
          const a = attributeChange(s.steps, t.session, f.mtime * 1000, s.design_model)
          if (isDesignModel(a.model)) (design++, a.session || mine++)
          if (a.session) {
            // Another conversation's change: the note for that conversation lists it, not this one's.
            const path = f.path.slice(0, 300)
            t.entry.files = t.entry.files.filter((x) => x.path !== path)
            const theirs = convs.get(`${slug}:${a.session}`)?.at(-1)
            if (theirs) {
              theirs.files = [...(theirs.files ?? []), { path, how: f.how }]
              if (isDesignModel(a.model)) theirs.model = a.model
            }
          }
          if (!a.model && !a.session) continue
          const k = JSON.stringify([a.model, a.session ?? null])
          if (!groups.has(k)) groups.set(k, [])
          groups.get(k).push(f.path.slice(0, 300))
        }
        for (const [k, paths] of groups) {
          const [model, session] = JSON.parse(k)
          for (let i = 0; i < paths.length; i += 20) {
            const fx = await exec(slug, ['fix', '--turn', turn, ...paths.slice(i, i + 20), ...(model ? ['--model', model] : []), ...(session ? ['--session', session] : [])])
            if (fx.code !== 0) log(`${slug}: who made ${paths.length} files could not be corrected (made-by fix exited ${fx.code})`)
          }
        }
        if (mine) t.entry.model = designModel(s.design_model)
        // Names and counts only: how this turn's changes were matched (for the next checker).
        if (out.files.length) log(`${slug}: an ola turn recorded ${out.files.length} changes, ${design} by the design model; its conversation had ${s.names?.design ?? 0} design and ${s.names?.general ?? 0} general steps`)
      }
      return files
    } catch (e) {
      t.entry.files = []
      log(`${slug}: a ${t.engine} turn could not be recorded (${e?.message ?? e})`)
      return null
    }
  }

  /** The session's run ended (its event stream said so): its open turn ends, unless it began a moment ago. */
  function ended(slug, session, { interrupted = false } = {}) {
    for (const [id, t] of open.get(slug) ?? []) if (t.session === session && t.engine !== 'claude' && Date.now() - t.at > 1500) void end(slug, id, { interrupted })
  }

  /** The note for an open model's prompt in this conversation (empty when no other engine worked since). */
  const noteFor = (slug, session, engine) => (SID.test(session ?? '') ? engineNote(convs.get(`${slug}:${session}`) ?? [], engine) : '')

  // The backstop for a missed event: an Ola or hosted turn whose session is no longer executing
  // (once seen executing, or settleMs after it began) is ended. A VM that does not answer for a
  // minute is let go here: its open turn is ended inside it at its next start (ola-init) or begin.
  async function sweep() {
    for (const [slug, turns] of [...open]) {
      const mine = [...turns].filter(([, t]) => t.engine !== 'claude')
      if (!mine.length) continue
      const now = await executing(slug).catch(() => null)
      for (const [id, t] of mine) {
        if (now === null) {
          if (++t.silent >= Math.ceil(60_000 / sweepMs)) turns.delete(id), (t.entry.files = t.entry.files ?? [])
          continue
        }
        t.silent = 0
        if (now.has(t.session)) t.seen = true
        else if (t.seen || Date.now() - t.at > settleMs) await end(slug, id)
      }
      if (!turns.size) open.delete(slug)
    }
  }
  const timer = sweepMs > 0 ? setInterval(() => void sweep().catch(() => {}), sweepMs) : null
  timer?.unref()

  return {
    begin,
    end,
    ended,
    noteFor,
    sweep,
    /** The open turns (for checks). */
    openTurns: (slug) => [...(open.get(slug) ?? new Map())].map(([turn, t]) => ({ turn, session: t.session, engine: t.engine })),
    close: () => timer && clearInterval(timer),
  }
}
