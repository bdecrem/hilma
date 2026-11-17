// Fallback to Claude, the front desk's side: the per-project setting, the gateway's grants file,
// and runs of Claude Code inside the project's sealed VM (workspace/ola-claude).
//
// The setting lives in the platform database (workspaces.claude_enabled, claude_auto, and optional
// ceilings), is off by default, and is changed only by an owner of the project's team, with the
// person's consent on turning it on; each change is audited (claude_enabled, claude_disabled).
// The gateway learns who may use Claude from GATEWAY_CLAUDE_FILE, which this module writes from the
// database alone (writeGrants; mode 600, by rename), so the file is right after any change, whoever
// made it (the server, or the admin CLI after a member is removed, a role changed, a workspace
// rotated, closed or reopened). A project is in it only while a Claude run the front desk started
// is going on in it (review 5 follow-up; before, the switch alone put the whole VM in it, so Ola's
// own agent, or anything in the VM, could send content to Anthropic, logged but unmarked). Each run
// holds a lease (a fallback_once row): the run's moment plus LEASE_MS, renewed while the run lives,
// removed when it ends, stops or fails, and every lease is dropped when the front desk starts, so a
// killed front desk's run loses its grant at the next start, or LEASE_MS later at most. The switch
// means "Claude runs may be started without asking each time", not "the VM may call Claude". A batch
// job on Claude (jobs.mjs) holds a grant too while it runs, bound to its runner's key.
//
// Which credential a project uses: subscription (oauth) mode only when every owner of its team is
// an admin (Bart: it is his own subscription), API-key mode otherwise. Whether the gateway holds a
// credential for that mode is asked of the gateway itself (GET /v1/usage with the usage token,
// which answers true or false per mode and each caller's month); without that link the setting
// cannot be turned on, and the page says so in a plain sentence.
//
// A run: `container exec -i ola-<id> ola-claude <go|ask> <conversation> <run> <why>`, stream-json
// both ways. The request (and the conversation so far, as context) goes in as one user message;
// Claude Code's events come back and are forwarded to the page as NDJSON, typed and capped (the
// VM's word, like everything from a workspace). Under "Ask me first", Claude Code's can_use_tool
// requests become the page's approval (once, always for this conversation, no). Stop: an interrupt,
// then the end of its input, then `ola-claude stop` inside the VM, then the exec. The run ceiling
// holds as for Ola's runs, and a run keeps the workspace from its idle stop while it lasts. Each
// run is audited as claude_used with numbers only (tokens, and cost in API-key mode, from the
// gateway's own count before and after).
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { audit } from './db.mjs'

/** The standing instruction for reactions, word for word as the README has it (web/test/commands.test.ts checks). */
export const REACTIONS_NOTE = `Reactions. You may react to the person's message with one emoji, like a reaction in a chat app.
To react, make the very first line of your reply exactly [[ola:react NAME]], with NAME one of:
eyes (you are on it), thanks (they thanked or complimented you), ok (noted: an instruction or
preference that needs no work), done (you finished what they asked), party (they share a win),
think (you need something from them first), oops (they caught your mistake).
Use at most one reaction, only on that first line, and never explain it or mention it.
If the message is only thanks or a compliment, reply with the marker line alone and nothing else.

Drawings. When asked for a drawing, diagram or illustration, draw it in code as an SVG file (clean shapes, a viewBox, no outside fonts or images) and save it in the project; say its file name. Use a chart library only for charts of data.`
import { ceilingMessage } from './workspaces.mjs'

export const AUTO = ['ask', 'stuck', 'always']
const ID = /^[A-Za-z0-9_-]{1,80}$/
const MAX_REQUEST = 20_000
const MAX_CONTEXT = 64 * 1024
const MAX_LINE = 1024 * 1024
const MAX_EVENT = 256 * 1024
const KEEP_EVENTS = 4000
const PAD = ' '.repeat(1024) + '\n'

export function claudeConfig(env = process.env) {
  const home = env.OLA_HOME || path.join(homedir(), '.ola')
  const num = (name, dflt, min, max) => {
    const v = env[name] === undefined ? dflt : Number(env[name])
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}`)
    return v
  }
  const token = env.OLA_FD_GATEWAY_USAGE_TOKEN || null
  if (token !== null && !/^[\x21-\x7e]{24,512}$/.test(token)) throw new Error('OLA_FD_GATEWAY_USAGE_TOKEN does not look like a token')
  const gw = new URL(env.OLA_FD_GATEWAY_URL || `http://127.0.0.1:${env.OLA_GATEWAY_PORT || 4180}`)
  if (gw.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(gw.hostname)) throw new Error('OLA_FD_GATEWAY_URL is the gateway on this machine (http://127.0.0.1:<port>)')
  return {
    file: env.OLA_FD_CLAUDE_FILE || path.join(home, 'gateway-claude'),
    gateway: gw.origin,
    usageToken: token,
    // The month's ceiling per project unless the admin CLI set one: dollars (API key), tokens (subscription).
    capMicroUsd: Math.round(num('OLA_FD_CLAUDE_CAP_USD', 25, 0, 10_000) * 1e6),
    capTokens: Math.round(num('OLA_FD_CLAUDE_CAP_TOKENS', 20_000_000, 0, 1e10)),
  }
}

/** How long a run's grant lasts without being renewed: a killed front desk's run loses it this long after at most. */
export const LEASE_MS = 90_000
export const leaseUntil = () => Date.now() + LEASE_MS

/** oauth only when the team has owners and every one of them is an admin; api_key otherwise. */
export function modeFor(db, workspaceId) {
  const r = db.prepare("SELECT count(*) AS n, coalesce(sum(p.is_admin), 0) AS admins FROM memberships m JOIN people p ON p.id = m.person_id JOIN workspaces w ON w.team_id = m.team_id WHERE w.id = ? AND m.role = 'owner' AND p.status != 'suspended'").get(workspaceId)
  return r.n > 0 && r.admins === r.n ? 'oauth' : 'api_key'
}

/**
 * The run grants in force for an engine: workspace id -> until (epoch ms). One row per run the front
 * desk started (with the switch on, or "Just this once" on the stretch card), renewed while it lives.
 * Rows past their moment are left out (and cleared by the server at the run's end).
 */
export function onceGrants(db, engine) {
  const out = new Map()
  for (const r of db.prepare('SELECT workspace_id AS id, max(until) AS until FROM fallback_once WHERE engine = ? AND until > ? GROUP BY workspace_id').all(engine, Date.now())) out.set(r.id, r.until)
  return out
}

/**
 * Batch jobs on an engine (claude or hosted) in their trial or running, whose runner holds its key:
 * workspace id -> the key's sha256. The grant is then the runner's alone (gateway/batch.mjs).
 */
export function jobGrants(db, model) {
  const out = new Map()
  try {
    for (const r of db.prepare("SELECT workspace_id AS id, runner_key_sha256 AS k FROM batch_jobs WHERE model = ? AND state IN ('trial', 'running') AND runner_key_sha256 IS NOT NULL").all(model)) out.set(r.id, r.k)
  } catch {} // a database before migration 10
  return out
}

/** The comparisons' scratch VMs granted an engine now (compare.mjs), from the database. */
export function scratchGrants(db, engine) {
  try {
    return db.prepare('SELECT slug, mode, cap_micro_usd, cap_tokens, until FROM compare_scratch WHERE engine = ? AND until > ? ORDER BY slug').all(engine, Date.now())
  } catch {
    return [] // a database before migration 9
  }
}

/** Writes a grants file for the gateway: one JSON object, mode 600, by rename. */
export function writeGrantsFile(file, grants) {
  // A name of its own per writer: the server and the admin CLI both write these files, and with
  // one shared `.tmp` the slower writer's rename installed the faster one's older grants, or failed
  // (review 4, L2; the same race review 3 found in gateway-tokens).
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(tmp, JSON.stringify(grants) + '\n', { mode: 0o600 })
  chmodSync(tmp, 0o600)
  renameSync(tmp, file)
  return grants
}

/** The gateway's grants file, from the database: each active project with a Claude run going on (its lease), or a Claude job running (its runner's key). */
export function writeGrants(db, cc) {
  const grants = {}
  const lease = onceGrants(db, 'claude')
  const jobs = jobGrants(db, 'claude')
  for (const w of db.prepare("SELECT id, slug, claude_enabled AS enabled, claude_cap_micro_usd AS usd, claude_cap_tokens AS tokens FROM workspaces WHERE status = 'active' ORDER BY slug").all()) {
    const job = w.enabled === 1 ? jobs.get(w.id) : undefined
    if (!lease.has(w.id) && !job) continue
    grants[`ws-${w.slug}`] = { mode: modeFor(db, w.id), cap_micro_usd: w.usd ?? cc.capMicroUsd, cap_tokens: w.tokens ?? cc.capTokens, ...(lease.has(w.id) ? { until: lease.get(w.id) } : { key_sha256: job }) }
  }
  // "Compare with Claude" (compare.mjs): a scratch VM holding only a comparison's task, granted for
  // that comparison alone, its project's mode, what is left of its comparison budget as the ceiling.
  for (const g of scratchGrants(db, 'claude')) grants[`ws-${g.slug}`] = { mode: g.mode, cap_micro_usd: g.cap_micro_usd, cap_tokens: g.cap_tokens, until: g.until }
  return writeGrantsFile(cc.file, grants)
}

/** The gateway's word on Claude: which modes have a credential, and each caller's month. Null if it cannot be asked. */
export async function gatewayUsage(cc) {
  if (!cc.usageToken) return null
  try {
    const r = await fetch(`${cc.gateway}/v1/usage`, { headers: { authorization: `Bearer ${cc.usageToken}` }, signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const j = await r.json()
    const modes = j?.claude_modes
    if (!modes || typeof modes.oauth !== 'boolean' || typeof modes.api_key !== 'boolean') return null
    const data = Array.isArray(j.data) ? j.data : []
    const month = new Map(data.filter((d) => typeof d?.caller === 'string' && d.claude_month).map((d) => [d.caller, d.claude_month]))
    // Fallback to a hosted open model (gateway/hosted.mjs): whether it is set up (the provider's
    // name as people read it, or null), and each caller's month.
    const hosted = j.hosted && typeof j.hosted.provider === 'string' ? { provider: j.hosted.provider.slice(0, 40) } : null
    const hostedMonth = new Map(data.filter((d) => typeof d?.caller === 'string' && d.hosted_month).map((d) => [d.caller, d.hosted_month]))
    return { modes, month, hosted, hostedMonth }
  } catch {
    return null
  }
}

const NOT_SET_UP = {
  oauth: 'Claude is not set up on this machine yet: there is no subscription to use. Bart can set it up.',
  api_key: 'Claude is not set up on this machine yet: there is no Anthropic account to use. Bart can set it up.',
  unknown: 'Claude cannot be turned on just now: this machine could not check that Claude is set up. Bart can look into it.',
}

/** Plain words for one tool kind, for "always for this conversation". */
const kindOf = (tool) => (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool) ? 'edit' : tool === 'Bash' ? 'bash' : String(tool).slice(0, 40))

/** One Claude Code event, as the page may see it: known types only, capped. Null to drop it. */
export function pageEvent(e) {
  if (!e || typeof e !== 'object' || typeof e.type !== 'string') return null
  if (e.type === 'system') {
    if (e.subtype === 'init') return { type: 'system', subtype: 'init', model: String(e.model ?? '').slice(0, 60) }
    if (e.subtype === 'api_retry') return { type: 'system', subtype: 'api_retry', attempt: Number(e.attempt) || 0, retry_delay_ms: Number(e.retry_delay_ms) || 0, error_status: Number(e.error_status) || null }
    return null
  }
  if (e.type === 'assistant' || e.type === 'user') {
    if (e.parent_tool_use_id) return null // a helper's inner messages: its own steps are not shown
    const content = Array.isArray(e.message?.content) ? e.message.content : typeof e.message?.content === 'string' ? [{ type: 'text', text: e.message.content }] : []
    const keep = []
    for (const c of content.slice(0, 50)) {
      if (c?.type === 'text') keep.push({ type: 'text', text: String(c.text ?? '').slice(0, 100_000) })
      else if (c?.type === 'tool_use') keep.push({ type: 'tool_use', id: String(c.id ?? '').slice(0, 80), name: String(c.name ?? '').slice(0, 60), input: c.input && typeof c.input === 'object' ? c.input : {} })
      else if (c?.type === 'tool_result') {
        const text = typeof c.content === 'string' ? c.content : Array.isArray(c.content) ? c.content.map((x) => (x?.type === 'text' ? x.text : '')).join('\n') : ''
        keep.push({ type: 'tool_result', tool_use_id: String(c.tool_use_id ?? '').slice(0, 80), is_error: c.is_error === true, content: String(text).slice(0, 64_000) })
      }
    }
    const out = { type: e.type, message: { id: String(e.message?.id ?? '').slice(0, 80), content: keep } }
    return JSON.stringify(out).length > MAX_EVENT ? null : out
  }
  if (e.type === 'result') {
    const n = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0)
    const u = e.usage ?? {}
    return { type: 'result', subtype: String(e.subtype ?? '').slice(0, 40), is_error: e.is_error === true, num_turns: n(e.num_turns), duration_ms: n(e.duration_ms), result: typeof e.result === 'string' ? e.result.slice(0, 100_000) : '', usage: { input_tokens: n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens), output_tokens: n(u.output_tokens) } }
  }
  return null
}

/** The person's request, from the user message ola-claude kept (its last text block). */
function requestOf(line) {
  try {
    const m = JSON.parse(line)
    const blocks = Array.isArray(m?.message?.content) ? m.message.content : []
    const texts = blocks.filter((b) => b?.type === 'text').map((b) => String(b.text ?? ''))
    return texts.length ? texts[texts.length - 1].slice(0, MAX_REQUEST) : ''
  } catch {
    return ''
  }
}

export function makeClaude({ db, cc, container, workspaces, runCeilingMs, log }) {
  let status = { at: 0, value: null }
  const usage = async (fresh = false) => {
    if (!fresh && Date.now() - status.at < 5000) return status.value
    status = { at: Date.now(), value: await gatewayUsage(cc) }
    return status.value
  }
  const runs = new Map() // run id -> run
  const bySlug = new Map() // slug -> run id (one Claude run per project at a time)
  const always = new Map() // `${slug}:${conversation}` -> Set of tool kinds the person allowed for the conversation
  // No run outlives the front desk that started it (its `container exec` ends with it): every
  // lease left by an earlier one (a crash, a kill) is dropped before the grants file is written.
  db.prepare("DELETE FROM fallback_once WHERE engine = 'claude'").run()
  writeGrants(db, cc)
  // Each live run's lease is renewed a third of the way through it.
  const renew = setInterval(() => {
    const live = [...runs.values()].filter((r) => !r.ended && r.leaseId !== null)
    for (const r of live) db.prepare('UPDATE fallback_once SET until = ? WHERE id = ?').run(leaseUntil(), r.leaseId)
    if (live.length) writeGrants(db, cc)
  }, LEASE_MS / 3)
  renew.unref()

  const row = (wsId) => db.prepare('SELECT claude_enabled AS enabled, claude_auto AS auto, claude_cap_micro_usd AS usd, claude_cap_tokens AS tokens FROM workspaces WHERE id = ?').get(wsId)

  /** GET /api/claude: what the page shows and may offer. */
  async function info(ws) {
    const r = row(ws.id)
    const mode = modeFor(db, ws.id)
    const g = await usage()
    const configured = g ? g.modes[mode] : null
    const m = g?.month.get(`ws-${ws.slug}`)
    const cap = mode === 'api_key' ? (r.usd ?? cc.capMicroUsd) : (r.tokens ?? cc.capTokens)
    return {
      enabled: r.enabled === 1,
      auto: r.auto,
      canChange: ws.role === 'owner',
      mode,
      configured: configured === true,
      // Why it cannot be turned on, in a plain sentence (null when it can).
      unavailable: configured === true ? null : configured === false ? NOT_SET_UP[mode] : NOT_SET_UP.unknown,
      month: { unit: mode === 'api_key' ? 'usd' : 'tokens', used: mode === 'api_key' ? (m?.cost_micro_usd ?? 0) / 1e6 : (m?.tokens ?? 0), cap: mode === 'api_key' ? cap / 1e6 : cap, reported: Boolean(g) },
      running: bySlug.has(ws.slug) ? { run: bySlug.get(ws.slug), conversation: runs.get(bySlug.get(ws.slug))?.conv ?? null } : null,
    }
  }

  /** POST /api/claude/settings, owner only (checked by the caller too). */
  async function setSettings(ws, personId, body) {
    if (ws.role !== 'owner') return { status: 403, body: { error: 'owner_only', message: 'Only the project’s owner can change this.' } }
    const r = row(ws.id)
    if (typeof body?.enabled === 'boolean' && body.enabled !== (r.enabled === 1)) {
      if (body.enabled) {
        if (body.consent !== true) return { status: 400, body: { error: 'consent', message: 'Read the note and confirm to turn this on.' } }
        const i = await info(ws)
        if (!i.configured) return { status: 409, body: { error: 'not_set_up', message: i.unavailable } }
      }
      db.prepare('UPDATE workspaces SET claude_enabled = ? WHERE id = ?').run(body.enabled ? 1 : 0, ws.id)
      audit(db, { actor: personId, action: body.enabled ? 'claude_enabled' : 'claude_disabled', workspace: ws.id })
      if (!body.enabled && bySlug.has(ws.slug)) stop(runs.get(bySlug.get(ws.slug)), 'stopped')
    }
    if (body?.auto !== undefined) {
      if (!AUTO.includes(body.auto)) return { status: 400, body: { error: 'bad_auto' } }
      db.prepare('UPDATE workspaces SET claude_auto = ? WHERE id = ?').run(body.auto, ws.id)
    }
    writeGrants(db, cc)
    status.at = 0
    return { status: 200, body: await info(ws) }
  }

  const send = (run, obj) => {
    if (run.events.length < KEEP_EVENTS) run.events.push(obj)
    // WebKit holds the newest bytes of a stream that then goes quiet (a question waiting for the
    // person): a blank 1 KiB line after a question pushes it through. Blank lines are skipped.
    const line = JSON.stringify(obj) + '\n' + (obj.ola === 'approval' ? PAD : '')
    for (const res of run.clients) if (!res.destroyed) res.write(line)
  }
  const toClaude = (run, obj) => {
    if (!run.child.stdin.destroyed && run.child.stdin.writable) run.child.stdin.write(JSON.stringify(obj) + '\n')
  }

  /** POST /api/claude/run: starts a run and streams it to this response (NDJSON). */
  async function start(ws, personId, body, res, req) {
    const r = row(ws.id)
    // "Just this once" (the stretch card): the owner hands this one request over with the switch
    // left off. The gateway gets a one-time grant for this run only, taken back when it ends.
    const once = r.enabled !== 1 && body?.once === true
    if (r.enabled !== 1 && !once) return { status: 403, body: { error: 'claude_off', message: 'Fallback to Claude is off for this project. Its owner can turn it on in Settings.' } }
    if (once && ws.role !== 'owner') return { status: 403, body: { error: 'owner_only', message: 'Only the project’s owner can hand a request to Claude while it is off.' } }
    // The subscription is Bart's own (review 4, open): only an owner of the project, whom the mode
    // rule makes an admin, may spend it; a member of such a team is not handed Bart's account.
    if (modeFor(db, ws.id) === 'oauth' && ws.role !== 'owner') return { status: 403, body: { error: 'owner_only', message: 'This project uses Bart’s own Claude subscription, so only its owner can hand a request to Claude.' } }
    const request = typeof body?.request === 'string' ? body.request.trim() : ''
    const context = typeof body?.context === 'string' ? body.context : ''
    const conv = body?.conversation
    const autonomy = body?.autonomy === 'ask' ? 'ask' : body?.autonomy === 'go' ? 'go' : null
    const why = ['asked', 'stuck', 'always'].includes(body?.why) ? body.why : 'asked'
    if (!request || request.length > MAX_REQUEST || context.length > MAX_CONTEXT || typeof conv !== 'string' || !ID.test(conv) || !autonomy) return { status: 400, body: { error: 'bad_request', message: 'That request could not be read.' } }
    const i = await info(ws)
    if (!i.configured) return { status: 503, body: { error: 'not_set_up', message: i.unavailable } }
    if (bySlug.has(ws.slug)) return { status: 409, body: { error: 'claude_busy', message: 'Claude is already working on a request in this project. Wait for it to finish, or stop it.' } }
    await workspaces.ensureRunning(ws.slug)
    const id = `c${Date.now().toString(36)}${randomBytes(6).toString('hex')}`
    // The run's grant, for this run only (both with the switch on and "Just this once"): taken back
    // when it ends, renewed while it lives.
    const leaseId = Number(db.prepare("INSERT INTO fallback_once (workspace_id, engine, person_id, until) VALUES (?, 'claude', ?, ?)").run(ws.id, personId, leaseUntil()).lastInsertRowid)
    writeGrants(db, cc)
    // The gateway reloads the grants file within about 2 s: a run started right after the switch was
    // turned on waits (up to 6 s) until the gateway lists this project's grant, or Claude Code's first
    // request would be refused as "off".
    let before = await usage(true)
    for (let i = 0; i < 12 && !before?.month.get(`ws-${ws.slug}`)?.mode; i++) {
      await new Promise((r) => setTimeout(r, 500))
      before = await usage(true)
    }
    const child = spawn(container, ['exec', '-i', `ola-${ws.slug}`, '/opt/ola/bin/ola-claude', autonomy, conv, id, why], { stdio: ['pipe', 'pipe', 'pipe'] })
    const run = { id, once, leaseId, slug: ws.slug, wsId: ws.id, conv, personId, autonomy, child, clients: new Set(), events: [], pending: new Map(), ended: null, at: Date.now(), result: null, before, release: workspaces.holdBusy(ws.slug), timers: [] }
    runs.set(id, run)
    bySlug.set(ws.slug, id)
    child.stdin.on('error', () => {})
    child.stderr.on('data', () => {}) // never logged: it may quote content
    // The reactions rule (README, "Slash commands and reactions"), with the request, so every run has it.
    const content = [{ type: 'text', text: REACTIONS_NOTE }, ...(context.trim() ? [{ type: 'text', text: `The conversation so far, for context (your earlier replies and Ola's are marked):\n\n${context.trim()}` }] : []), { type: 'text', text: request }]
    toClaude(run, { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' })

    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
    res.write(PAD) // WebKit holds back a stream's first ~512 bytes to sniff them; a blank 1 KiB line lets the rest through
    run.clients.add(res)
    res.on('close', () => run.clients.delete(res)) // the run goes on; the page can follow it again
    send(run, { ola: 'started', run: id, at: run.at, autonomy, why })
    let buf = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d) => {
      buf += d
      if (buf.length > MAX_LINE && buf.indexOf('\n') < 0) buf = '' // one line too long to be ours: dropped
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        let e
        try {
          e = JSON.parse(line)
        } catch {
          continue
        }
        if (e?.type === 'control_request') onControl(run, e)
        else {
          const out = pageEvent(e)
          if (out?.type === 'result') {
            run.result = out
            // One turn per run: the input ends once Claude Code has answered, so it exits.
            setTimeout(() => run.child.stdin.end(), 100)
          }
          if (out) send(run, out)
        }
      }
    })
    child.on('close', (code) => finish(run, code))
    if (runCeilingMs > 0) run.timers.push(setTimeout(() => stop(run, 'ceiling'), runCeilingMs))
    // WebKit hands a stream's newest chunk to the page only once another arrives: while a question
    // waits for the person, a blank line every second makes sure the question itself is shown.
    const beat = setInterval(() => run.pending.size && [...run.clients].forEach((r) => !r.destroyed && r.write('\n')), 1000)
    child.on('close', () => clearInterval(beat))
    log(`${ws.slug}: a Claude run started (${autonomy}, ${why})`)
    return null
  }

  function onControl(run, e) {
    const rid = typeof e.request_id === 'string' && e.request_id.length <= 120 ? e.request_id : null
    if (!rid) return
    const q = e.request ?? {}
    if (q.subtype !== 'can_use_tool' || run.autonomy !== 'ask') {
      // Nothing else is answered by the page (and in "go" nothing should ask): refused.
      return toClaude(run, { type: 'control_response', response: { subtype: q.subtype === 'can_use_tool' ? 'success' : 'error', request_id: rid, ...(q.subtype === 'can_use_tool' ? { response: { behavior: 'deny', message: 'Not allowed here.' } } : { error: 'not supported here' }) } })
    }
    const tool = String(q.tool_name ?? '').slice(0, 60)
    const input = q.input && typeof q.input === 'object' ? q.input : {}
    if (always.get(`${run.slug}:${run.conv}`)?.has(kindOf(tool))) return reply(run, rid, input, 'once')
    if (run.pending.size >= 20) return reply(run, rid, input, 'reject')
    run.pending.set(rid, { tool, input })
    const shown = JSON.stringify(input)
    send(run, { ola: 'approval', request_id: rid, tool_name: tool, input: shown.length > 64_000 ? { note: 'too long to show' } : input, tool_use_id: String(q.tool_use_id ?? '').slice(0, 80) })
  }
  function reply(run, rid, input, decision) {
    const allow = decision === 'once' || decision === 'always'
    toClaude(run, { type: 'control_response', response: { subtype: 'success', request_id: rid, response: allow ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'The person said no, so do not do this. Say what you would have done, and ask what they would like instead.' } } })
  }

  /** POST /api/claude/answer: the person's answer to one approval. */
  function answer(ws, body) {
    const run = runs.get(body?.run)
    if (!run || run.slug !== ws.slug || run.ended) return { status: 404, body: { error: 'not_found', message: 'That question is no longer open.' } }
    const p = run.pending.get(body?.request_id)
    if (!p || !['once', 'always', 'reject'].includes(body?.decision)) return { status: 404, body: { error: 'not_found', message: 'That question is no longer open.' } }
    run.pending.delete(body.request_id)
    if (body.decision === 'always') {
      const k = `${run.slug}:${run.conv}`
      if (!always.has(k)) always.set(k, new Set())
      always.get(k).add(kindOf(p.tool))
      if (always.size > 2000) always.delete(always.keys().next().value)
    }
    reply(run, body.request_id, p.input, body.decision)
    send(run, { ola: 'answered', request_id: body.request_id, decision: body.decision })
    return { status: 200, body: { ok: true } }
  }

  function stop(run, reason = 'stopped') {
    if (!run || run.ended || run.stopping) return
    run.stopping = reason
    toClaude(run, { type: 'control_request', request_id: `stop-${run.id}`, request: { subtype: 'interrupt' } })
    for (const rid of run.pending.keys()) reply(run, rid, {}, 'reject')
    run.pending.clear()
    run.timers.push(setTimeout(() => run.child.stdin.end(), 500))
    run.timers.push(setTimeout(() => !run.ended && spawn(container, ['exec', `ola-${run.slug}`, '/opt/ola/bin/ola-claude', 'stop', run.id], { stdio: 'ignore' }), 4000))
    run.timers.push(setTimeout(() => !run.ended && run.child.kill('SIGKILL'), 12_000))
  }

  async function finish(run, code) {
    if (run.ended) return
    run.ended = Date.now()
    run.timers.forEach(clearTimeout)
    bySlug.delete(run.slug)
    run.release()
    // The run's grant ends with it (done, stopped, failed): the next request is refused at the gateway.
    db.prepare('DELETE FROM fallback_once WHERE id = ?').run(run.leaseId)
    run.leaseId = null
    writeGrants(db, cc)
    // The gateway's own count, before and after: numbers only.
    const after = await usage(true)
    const caller = `ws-${run.slug}`
    const b = run.before?.month.get(caller)
    const a = after?.month.get(caller)
    const total = a && b && a.month === b.month ? Math.max(0, a.tokens - b.tokens) : a && !b ? a.tokens : null
    const cost = a && b && a.month === b.month ? Math.max(0, a.cost_micro_usd - b.cost_micro_usd) : a && !b ? a.cost_micro_usd : null
    const out = total === null ? null : Math.min(total, run.result?.usage?.output_tokens ?? 0)
    const mode = modeFor(db, run.wsId)
    audit(db, { actor: run.personId, action: run.once ? 'claude_once' : 'claude_used', workspace: run.wsId, ok: Boolean(run.result && !run.result.is_error && !run.stopping), tokensIn: total === null ? null : total - out, tokensOut: out, costMicroUsd: mode === 'api_key' ? cost : null })
    const reason = run.stopping === 'ceiling' ? 'ceiling' : run.stopping ? 'stopped' : run.result && !run.result.is_error ? 'done' : 'failed'
    const minutes = Math.round((runCeilingMs / 60_000) * 100) / 100
    send(run, { ola: 'ended', reason, ...(reason === 'ceiling' ? { message: ceilingMessage(minutes).replace(/^Ola stopped this/, 'Claude was stopped') } : {}), ...(reason === 'failed' && !run.result ? { message: code === 0 ? 'Claude stopped before it answered.' : 'Claude could not run in your project just now. Nothing else was changed.' } : {}) })
    for (const res of run.clients) res.end()
    run.clients.clear()
    log(`${run.slug}: a Claude run ended (${reason})`)
    // Kept a minute for a page that follows it again, then forgotten (its record is in the VM).
    setTimeout(() => runs.delete(run.id), 60_000).unref()
  }

  /** GET /api/claude/follow?run=: a page that lost its connection catches up and keeps reading. */
  function follow(ws, id, res) {
    const run = runs.get(id)
    if (!run || run.slug !== ws.slug) return false
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' })
    res.write(PAD)
    for (const e of run.events) res.write(JSON.stringify(e) + '\n')
    if (run.ended) return res.end(), true
    run.clients.add(res)
    res.on('close', () => run.clients.delete(res))
    return true
  }

  /** GET /api/claude/turns?conversation=: the conversation's Claude runs, from their record in the VM. */
  async function turns(ws, conv) {
    if (typeof conv !== 'string' || !ID.test(conv)) return { status: 400, body: { error: 'bad_request' } }
    await workspaces.ensureRunning(ws.slug)
    const text = await new Promise((resolve) => {
      const c = spawn(container, ['exec', `ola-${ws.slug}`, '/opt/ola/bin/ola-claude', 'log', conv], { stdio: ['ignore', 'pipe', 'ignore'] })
      let t = ''
      let n = 0
      c.stdout.setEncoding('utf8')
      c.stdout.on('data', (d) => {
        n += d.length
        if (n > 16 * 1024 * 1024) return c.kill('SIGKILL')
        t += d
      })
      const timer = setTimeout(() => c.kill('SIGKILL'), 20_000)
      c.on('close', () => (clearTimeout(timer), resolve(t)))
    })
    const list = []
    let cur = null
    for (const line of text.split('\n')) {
      if (line.startsWith('M ')) {
        let m
        try {
          m = JSON.parse(line.slice(2))
        } catch {
          cur = null
          continue
        }
        if (!m || !ID.test(m.run ?? '') || !['go', 'ask'].includes(m.mode) || !['asked', 'stuck', 'always'].includes(m.why) || !Number.isSafeInteger(m.at)) {
          cur = null
          continue
        }
        cur = { run: m.run, at: m.at * 1000, autonomy: m.mode, why: m.why, request: '', events: [], active: runs.get(m.run)?.ended === null && runs.get(m.run)?.slug === ws.slug }
        list.push(cur)
      } else if (cur && line.startsWith('I ') && !cur.request) cur.request = requestOf(line.slice(2))
      else if (cur && line.startsWith('O ') && cur.events.length < KEEP_EVENTS) {
        try {
          const e = pageEvent(JSON.parse(line.slice(2)))
          if (e) cur.events.push(e)
        } catch {}
      }
    }
    return { status: 200, body: { runs: list.filter((r) => r.request) } }
  }

  return {
    info,
    setSettings,
    start,
    answer,
    stop: (ws, id) => {
      const run = runs.get(id)
      if (!run || run.slug !== ws.slug) return { status: 404, body: { error: 'not_found', message: 'That run is not going on.' } }
      stop(run, 'stopped')
      return { status: 200, body: { ok: true } }
    },
    follow,
    turns,
    writeGrants: () => writeGrants(db, cc),
    active: (slug) => bySlug.has(slug),
    close() {
      clearInterval(renew)
      for (const run of runs.values()) if (!run.ended) run.child.kill('SIGKILL')
    },
  }
}
