// The design model (OLA-168). Bart, Nov 20, after judging blind sheets of pages from five models:
// design requests go to Inkling-2-Small (Thinking Machines, 594B, served on Together; it cannot run on
// the 128 GB Mac Studio, so it stays hosted). Ola's design had been "AI design from 2 years ago".
//
// Which requests: the boundary is the skill, not the person's words. opencode loads a skill with its
// `skill` tool ({"id":"designer"}), and AGENTS.md tells Ola to load `designer` (or `app-designer`)
// before every page or app screen. So a request for `general` whose messages, after the person's last
// message, hold a call of the skill tool for one of DESIGN_SKILLS ({"id":"designer"} in opencode 2.3.0) is design work, and the gateway
// serves it with the name `design`. The turn's first request (the one that decides to load the skill)
// stays on `general`; every later request of that turn goes to `design`; the next turn starts again.
// A caller may also ask for `design` by name: the same rules apply.
//
// Where the work may go. Today every model of Ola's is rented on Together, so sending design work
// there costs nothing in privacy. Once the everyday model runs on our own machine (the Studio),
// a design request carries the group's own text out of the office: from then on it goes to Together
// only for a caller whose owner switched on the hosted model, listed in GATEWAY_DESIGN_FILE (written
// by the front desk: projects with the hosted switch on, people allowed the hosted model on their
// Mac). Anywhere else Ola's own model does the design and Ola says so in one sentence. "Switched on
// the hosted model" is the owner's permission for work to leave the office; the design request still
// goes to Inkling-2-Small and to nothing else, never to the hosted slot's model.
//
//   GATEWAY_EVERYDAY_LOCAL  0 or 1: the everyday model (`general`) runs on our own machine. Default:
//                           1 when UPSTREAM_BASE_URL is this machine (127.0.0.1), else 0. Off today.
//   GATEWAY_DESIGN_FILE     the owners' permission list, { "ws-<slug>": {}, "p-<id>": {} }, mode 600,
//                           reloaded within 2 s. Default: gateway-design beside GATEWAY_HOSTED_FILE.
//   GATEWAY_MODELS design=  the design model's upstream id. Default, when the everyday server is
//                           Together: thinkingmachines/Inkling-2-Small. design=off: no design model.
//
// When the design model fails (refuses, errors, an empty reply three times), the same request goes
// once to `general` itself, never to a backup model, with a line telling Ola to say so.
import { dirname, join } from 'node:path'
import { ANY_CALLER, readGrants } from './batch.mjs'

export const DESIGN_SETTINGS = ['GATEWAY_EVERYDAY_LOCAL', 'GATEWAY_DESIGN_FILE']
export const DESIGN_SKILLS = ['designer', 'app-designer']
export const DESIGN_DEFAULT = 'thinkingmachines/Inkling-2-Small'
// The design model writes whole pages: it is never asked with a small output allowance (with 50
// tokens and its reasoning on, it answered empty three times, Nov 20).
export const DESIGN_MIN_OUTPUT = 16000
// The most steps one served query returns (a two-hour turn of a busy project is a few hundred).
export const STEPS_MAX = 5000

// The sentences the gateway adds for Ola to pass on (fixed text, from this file).
export const WITHHELD = 'Note from Ola’s gateway: this design work is being done by Ola’s own model on this machine, because this project keeps its work in the office. In your reply, say in one plain sentence that a stronger design model is available if the project’s owner turns on the hosted model in Settings.'
// OLA-463: Ola's instructions (AGENTS.md, since OLA-455) say the designer skills load only when the
// person names them, which is right where Ola's own model builds the page (the Studio). Where a design
// model is set and this caller's work may go to it, the skill is what sends the page there, so the
// gateway says so in the request: a general request that offers the skill tool, before the skill loads.
export const DESIGN_HERE = 'Note from Ola’s gateway: on this server a separate design model does page design. Before you make or restyle a web page, a site or an app screen, load the `designer` skill (`app-designer` for a phone or Mac app screen), also when the person did not name it.'
export const DESIGN_DOWN = 'Note from Ola’s gateway: Ola’s design model could not answer this request just now, so Ola’s own everyday model is doing the design. In your reply, say so in one plain sentence.'

/** The design settings, checked. `models` is GATEWAY_MODELS as read (it may hold design). */
export function designConfig(env, bad, { models, upstream }) {
  const raw = env.GATEWAY_EVERYDAY_LOCAL
  let local
  if (raw === undefined || raw === '') local = !!upstream && ['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname)
  else if (raw === '0' || raw === '1') local = raw === '1'
  else bad('GATEWAY_EVERYDAY_LOCAL must be 0 or 1')
  if (models.get('design') === 'off') models.delete('design')
  else if (!models.has('design') && upstream?.hostname === 'api.together.xyz') models.set('design', DESIGN_DEFAULT)
  const file = env.GATEWAY_DESIGN_FILE || (env.GATEWAY_HOSTED_FILE ? join(dirname(env.GATEWAY_HOSTED_FILE), 'gateway-design') : null)
  return { local: !!local, file }
}

// The skills' own files (SKILL.md, look.py, the palette scripts): a step that reads or runs one is
// using the skill, whether or not it called the skill tool again (OLA-303: asked to "make it warmer and
// more festive", Ola ran the designer's look.py on `general` without loading the skill a second time).
const DESIGN_FILES = new RegExp(`skills/(?:${DESIGN_SKILLS.join('|')})/`)

/** Does this assistant message load or use the designer or app-designer skill? */
function usesDesignSkill(m) {
  if (m?.role !== 'assistant' || !Array.isArray(m.tool_calls)) return false
  for (const c of m.tool_calls) {
    let a = c?.function?.arguments
    if (typeof a === 'string' && DESIGN_FILES.test(a)) return true
    if (c?.function?.name !== 'skill') continue
    try {
      if (typeof a === 'string') a = JSON.parse(a)
    } catch {
      continue
    }
    // opencode 2.3.0 names the skill `id` (seen on the wire, Nov 20); 1.x named it `name`.
    if (a && typeof a === 'object' && (DESIGN_SKILLS.includes(a.id) || DESIGN_SKILLS.includes(a.name))) return true
  }
  return false
}

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n') : '')
/** Did this assistant message ask the person something (the question tool, or words ending in a question)? */
const asksPerson = (m) => m?.role === 'assistant' && ((Array.isArray(m.tool_calls) && m.tool_calls.some((c) => c?.function?.name === 'question')) || /\?\s*$/.test(textOf(m.content)))

/**
 * Why this request is design work, or null: the designer or app-designer skill was loaded or used
 * after the person's last message ('skill'), or the person's last message answers a question the
 * design work asked them in the turn before ('answer', OLA-303). The checker's Nov 21 conversations:
 * the design model asked "What should the block party page say?", the person answered, and from that
 * answer on `general` built the whole page (27 steps), so the page was rightly recorded as Ola's own
 * model's; the design work ended with the question.
 */
export function designWhy(messages) {
  if (!Array.isArray(messages)) return null
  const users = []
  messages.forEach((m, i) => m?.role === 'user' && users.push(i))
  const last = users.at(-1) ?? -1
  for (let i = last + 1; i < messages.length; i++) if (usesDesignSkill(messages[i])) return 'skill'
  if (last < 1) return null
  const prev = users.at(-2) ?? -1
  let asked = null
  for (let i = last - 1; i > prev; i--)
    if (messages[i]?.role === 'assistant') {
      asked = messages[i]
      break
    }
  if (!asksPerson(asked)) return null
  for (let i = prev + 1; i < last; i++) if (usesDesignSkill(messages[i])) return 'answer'
  return null
}

/** Does this request come after the designer or app-designer skill was loaded in this turn? */
export const isDesignTurn = (messages) => designWhy(messages) !== null

/** The note in the request's instructions: added to the first system message, or as one. */
export function withNote(messages, note) {
  if (!note) return messages
  const i = messages.findIndex((m) => m?.role === 'system' && typeof m.content === 'string')
  if (i < 0) return [{ role: 'system', content: note }, ...messages]
  return messages.map((m, j) => (j === i ? { ...m, content: `${m.content}\n\n${note}` } : m))
}

/** The owners' permission list (only read while the everyday model is local). */
export function makeDesign({ cfg, db }) {
  let allowed = new Map()
  let seen = ''
  const load = () => {
    if (!cfg.file) return
    const next = readGrants(cfg.file, 'GATEWAY_DESIGN_FILE', seen, (_n, g) => (g && typeof g === 'object' ? {} : null), ANY_CALLER)
    if (!next) return
    seen = next.stamp
    allowed = next.grants
  }
  let timer = null
  if (cfg.local) {
    load()
    timer = setInterval(load, 2000)
    timer.unref()
  }
  // Which name served each chat request, by caller and conversation, kept 8 days: the front desk
  // asks it at the end of a turn to record which model made the turn's files (GET /v1/served).
  // Names and ids only. The conversation is opencode's own id (its X-Session-Id header), checked.
  db.exec(`CREATE TABLE IF NOT EXISTS served (at INTEGER NOT NULL, caller TEXT NOT NULL, session TEXT, name TEXT NOT NULL) STRICT;
    CREATE INDEX IF NOT EXISTS served_caller ON served (caller, at);`)
  const add = db.prepare('INSERT INTO served (at, caller, session, name) VALUES (?, ?, ?, ?)')
  const prune = db.prepare('DELETE FROM served WHERE at < ?')
  const bySession = db.prepare('SELECT name, count(*) AS n FROM served WHERE caller = ? AND session = ? AND at >= ? GROUP BY name')
  const byCaller = db.prepare('SELECT name, count(*) AS n, count(DISTINCT coalesce(session, \'\')) AS convs FROM served WHERE caller = ? AND at >= ? GROUP BY name')
  // The steps themselves, in order (OLA-303): which conversation each chat request was and which name
  // served it, so the front desk can say which request led to each file change, not just which turn.
  const steps = db.prepare("SELECT at, session, name FROM served WHERE caller = ? AND at >= ? AND session IS NOT NULL AND name IN ('general', 'design', 'design-failed') ORDER BY at LIMIT ?")
  let added = 0
  return {
    local: cfg.local,
    /** May this caller's design work go to the design model? */
    may: (who) => !cfg.local || allowed.has(who),
    record(who, session, name) {
      add.run(Date.now(), who, session, name)
      if (++added % 500 === 0) prune.run(Date.now() - 8 * 86400_000)
    },
    served(who, session, since) {
      const rows = session ? bySession.all(who, session, since) : byCaller.all(who, since)
      return Object.fromEntries(rows.map((r) => [r.name, r.n]))
    },
    /** Every conversation step since a moment, oldest first: [at ms, session, name], at most STEPS_MAX. */
    steps: (who, since) => steps.all(who, since, STEPS_MAX).map((r) => [r.at, r.session, r.name]),
    close: () => timer && clearInterval(timer),
  }
}

const SID = /^[A-Za-z0-9_-]{1,80}$/
/** opencode's id for the conversation, from its own headers (x-session-affinity / X-Session-Id). */
export function sessionOf(req) {
  const v = req.headers['x-session-id'] ?? req.headers['x-session-affinity']
  return typeof v === 'string' && SID.test(v) ? v : null
}
