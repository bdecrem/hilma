// Who is calling the tracker (OLA-251, OLA-263, Nov 20). Until then the one who passed a check was a
// typed word (--by), so a builder could pass its own work as "builder-2" and a checker holding the
// claim could not pass it as "checker". What a script can know about its caller, found by looking on
// the M4 iMac on Nov 20 (Claude Code 2.1.329), not guessed:
//   - CLAUDE_CODE_SESSION_ID in a shell command's environment is the LEAD's session id: the same for
//     the lead and every agent it starts (this builder, an agent, saw the lead's id). It cannot tell a
//     builder from its checker. CLAUDE_CODE_BRIDGE_SESSION_ID and CLAUDE_PID are shared the same way.
//   - A hook is told more: Claude Code gives a PreToolUse hook the session id and, inside an agent, the
//     agent's own id (agent_id, agent_type). So .claude/hooks/issue-guard.py, which runs before every
//     Bash command, writes {at, session, agent, agent_type, tok, cmd} to ~/.claude/venture-callers.jsonl
//     when the command may run a venture tool (or commits naming a ticket), and gives the command a
//     token (VENTURE_CALLER) whose hash is tok. issues.mjs finds its caller by that token (below).
//   - A plain shell (Bart in a terminal, launchd, the runner's own node process) leaves no line: the
//     caller is unknown.
// The tracker records the caller with every claim, `ready`, `commit` and check, and refuses a pass from
// the agent or session that built the ticket, marked it ready or committed for it.
// The limit, stated plainly: the file is in the home folder and can be written by hand. A builder that
// appends a made-up line naming another agent, just before passing its own check, is not stopped; that
// takes a deliberate lie, not a slip. A caller is "unknown" when its command carries no token the record
// holds (no hook, as in a plain shell, or a command the hook did not see); a pass from an unknown
// caller is refused, except Bart's (--by bart), whose word closes a ticket anyway.
import { existsSync, readFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export const CALLERS = join(homedir(), '.claude/venture-callers.jsonl')
export const shortHost = () => hostname().replace(/\..*$/, '')

/** { id, session, agent, agent_type, host, known, why } for the process that runs this.
 *  id: "agent <agent id>" inside an agent, "session <session id>" for a top-level session, null when unknown. */
// OLA-251, ninth pass: the caller is known only by a token the hook gives the command itself. Before every
// Bash command that may run a venture tool, .claude/hooks/issue-guard.py makes a fresh random token, records
// its sha256 with the session and agent ids, and puts `export VENTURE_CALLER=<token>;` in front of the
// command. A call carrying a token whose hash is in the record is that record's agent; a call with no token,
// or one the record does not hold, is unknown. Passes one to nine matched the command's text against the
// record instead, and every pass a checker found text in the holder's command (a commit message, a
// `node --check`, an `|| … --wait` fallback, an echoed hint) that a call typed past the hook (iss*s.mjs)
// could borrow to pass as the holder. A token cannot be borrowed that way: the record holds only its hash,
// and another agent's command never carries it.
// The limit, stated plainly: an agent that reads another live process's environment (ps eww) while it runs
// can copy its token; that takes a deliberate lie, like writing a made-up line into the record.
const TOKEN_LIFE = 24 * 3600e3 // a command may run for hours (--wait); a token older than a day is not honored
const seen = new Map()
export function caller({ file = process.env.VENTURE_CALLERS_FILE ?? CALLERS, now = Date.now(), token = process.env.VENTURE_CALLER } = {}) {
  const memo = `${file}\n${token ?? ''}`
  if (seen.has(memo)) return seen.get(memo)
  const out = callerOnce({ file, now, token })
  seen.set(memo, out)
  return out
}
export const tokenHash = (t) => createHash('sha256').update(String(t)).digest('hex')
function callerOnce({ file, now, token }) {
  const host = shortHost()
  if (!token) return { id: null, host, known: false, why: 'no caller token: not run through the hook of a Claude Code session (a plain shell, launchd, a script, or a command the hook did not see)' }
  if (!existsSync(file)) return { id: null, host, known: false, why: `a caller token, but no record of the hook (${file} does not exist)` }
  const h = tokenHash(token)
  let r = null
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (!l.includes(h)) continue
    try { const x = JSON.parse(l); if (x.tok === h) r = x } catch {}
  }
  if (!r) return { id: null, host, known: false, why: 'a caller token the hook never gave out on this machine' }
  if (now - r.at * 1000 > TOKEN_LIFE || r.at * 1000 > now + 5e3) return { id: null, host, known: false, why: 'a caller token older than a day' }
  const id = r.agent ? `agent ${r.agent}` : `session ${r.session}`
  return { id, session: r.session, agent: r.agent ?? null, agent_type: r.agent_type ?? null, host, known: true, why: `${r.agent ? `agent ${r.agent.slice(0, 8)} (${r.agent_type ?? 'agent'})` : `session ${String(r.session).slice(0, 8)}`} on ${host}` }
}

/** Every caller that committed for a ticket on this machine, from the hook's record (git commit naming OLA-n). */
export function committers(id, { file = process.env.VENTURE_CALLERS_FILE ?? CALLERS } = {}) {
  if (!existsSync(file)) return []
  const re = new RegExp(`\\b${id}(?![0-9])`)
  const out = new Set()
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    try {
      const r = JSON.parse(l)
      if (/\bgit\b[^\n;&|]*\bcommit\b/.test(r.cmd) && re.test(r.cmd)) out.add(r.agent ? `agent ${r.agent}` : `session ${r.session}`)
    } catch {}
  }
  return [...out]
}

// The roles a claim can have (OLA-251, check #3). A fixed set; a name that only contains one of these
// words ("builder-checker", "lead-2") is a builder. --role sets it; without it, a --who that IS one of
// these words is that role, and "lead", "kit" and "bart" are holds (the lead's claims were holds before
// holds existed). Everyone else is a builder.
//   builder        works on the ticket's code; takes the ticket's lane
//   checker        checks someone else's work; takes no lane
//   investigator   reads and reports; takes no lane
//   hold           keeps other agents (and the runner) off the ticket; takes no lane
//   runner         the runner on the Mac mini; takes the ticket's lane
// Whatever the role, a claim whose ticket gets commits touching the server's code while it is held
// counts as a builder in the server lane (issues.mjs, laneGate).
export const ROLES = ['builder', 'checker', 'investigator', 'hold', 'runner']
export const LANE_ROLES = new Set(['builder', 'runner'])
export function roleOf(who, role = null) {
  if (role !== null && role !== undefined) {
    const r = String(role).trim().toLowerCase()
    if (!ROLES.includes(r)) throw new Error(`--role must be one of: ${ROLES.join(', ')} (not "${role === true ? '' : role}")`)
    return r
  }
  const w = String(who ?? '').trim().toLowerCase()
  if (ROLES.includes(w)) return w
  if (['lead', 'kit', 'bart'].includes(w)) return 'hold'
  return 'builder'
}
