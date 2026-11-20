// Who is calling the tracker (OLA-251, OLA-263, Nov 20). Until then the one who passed a check was a
// typed word (--by), so a builder could pass its own work as "builder-2" and a checker holding the
// claim could not pass it as "checker". What a script can know about its caller, found by looking on
// the M4 iMac on Nov 20 (Claude Code 2.1.329), not guessed:
//   - CLAUDE_CODE_SESSION_ID in a shell command's environment is the LEAD's session id: the same for
//     the lead and every agent it starts (this builder, an agent, saw the lead's id). It cannot tell a
//     builder from its checker. CLAUDE_CODE_BRIDGE_SESSION_ID and CLAUDE_PID are shared the same way.
//   - A hook is told more: Claude Code gives a PreToolUse hook the session id and, inside an agent, the
//     agent's own id (agent_id, agent_type). So .claude/hooks/issue-guard.py, which runs before every
//     Bash command, writes {at, session, agent, agent_type, cmd} to ~/.claude/venture-callers.jsonl
//     when the command runs issues.mjs (or commits naming a ticket). issues.mjs then finds its own call
//     there: a line of the last two minutes whose command holds every argument it was given.
//   - A plain shell (Bart in a terminal, launchd, the runner's own node process) leaves no line: the
//     caller is unknown.
// The tracker records the caller with every claim, `ready`, `commit` and check, and refuses a pass from
// the agent or session that built the ticket, marked it ready or committed for it.
// The limit, stated plainly: the file is in the home folder and can be written by hand. A builder that
// appends a made-up line naming another agent, just before passing its own check, is not stopped; that
// takes a deliberate lie, not a slip. A caller is "unknown" when its call is not found (no hook, as in a
// plain shell, or two agents ran the very same command in the same two minutes); a pass from an unknown
// caller is refused, except Bart's (--by bart), whose word closes a ticket anyway.
import { existsSync, readFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'

export const CALLERS = join(homedir(), '.claude/venture-callers.jsonl')
const WINDOW = 120e3
export const shortHost = () => hostname().replace(/\..*$/, '')
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '')

/** { id, session, agent, agent_type, host, known, why } for the process that runs this.
 *  id: "agent <agent id>" inside an agent, "session <session id>" for a top-level session, null when unknown. */
export function caller({ argv = process.argv.slice(2), file = process.env.VENTURE_CALLERS_FILE ?? CALLERS, now = Date.now() } = {}) {
  const host = shortHost()
  if (!existsSync(file)) return { id: null, host, known: false, why: `no record of the call (${file} does not exist: not run from a Claude Code session with the hook)` }
  // paths are left out of the match: the shell expands ~ and $VARS in them, the command keeps them as typed
  const want = argv.filter((t) => !t.includes('/')).map(norm).filter((t) => t.length > 0)
  const rows = []
  for (const l of readFileSync(file, 'utf8').split('\n').slice(-400)) {
    if (!l) continue
    try {
      const r = JSON.parse(l)
      if (now - r.at * 1000 > WINDOW || r.at * 1000 > now + 5e3) continue
      const c = norm(r.cmd)
      if (c.includes('issuesmjs') && want.every((t) => c.includes(t))) rows.push(r)
    } catch {}
  }
  const ids = [...new Set(rows.map((r) => (r.agent ? `agent ${r.agent}` : `session ${r.session}`)))]
  if (!ids.length) return { id: null, host, known: false, why: 'no record of this call by the hook: not run from a Claude Code session (a plain shell, launchd, a script)' }
  if (ids.length > 1) return { id: null, host, known: false, why: `the same command was run by ${ids.length} sessions or agents in the last two minutes, so the caller is not known` }
  const r = rows.at(-1)
  return { id: ids[0], session: r.session, agent: r.agent ?? null, agent_type: r.agent_type ?? null, host, known: true, why: `${r.agent ? `agent ${r.agent.slice(0, 8)} (${r.agent_type ?? 'agent'})` : `session ${String(r.session).slice(0, 8)}`} on ${host}` }
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
