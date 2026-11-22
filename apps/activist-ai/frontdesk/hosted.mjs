// Fallback to a hosted open model, the front desk's side: the per-project setting, the gateway's
// grants file (GATEWAY_HOSTED_FILE), runs of one request with the model `hosted`, and the setting
// both fallbacks share, "When a request looks like a stretch".
//
// The setting lives in the platform database (workspaces.hosted_enabled, off by default; an optional
// ceiling), is changed only by an owner of the project's team, with the person's consent on turning
// it on, and each change is audited (hosted_enabled, hosted_disabled). Whether the machine has a
// hosted provider at all, and its name as people read it, is asked of the gateway (GET /v1/usage
// with the usage token answers `hosted: { provider }` or null); with no provider the switch is shown
// disabled with one sentence.
//
// The grants file is written from the database alone (writeHostedGrants: each active project with a
// hosted run going on, by its lease, and each with a job on the hosted model running, bound to the
// job runner's key), by the server after every change and by the admin CLI after a member is
// removed, a role changed, a workspace rotated, closed or reopened, exactly as the Claude grants
// are. As for Claude (review 5 follow-up): the switch lets runs start without asking each time; it
// no longer gives the VM a standing grant to the hosted model.
//
// A run (POST /api/hosted/run): the same opencode in the same sealed VM, the same conversation. The
// front desk, never the page, switches the session to `ola/hosted` (opencode's session.switchModel),
// sends the request as the person's prompt, watches opencode until the session stops executing, then
// switches it back to `ola/general`. The page follows the run on opencode's event stream like any
// other; each assistant step names its model, so the page marks the reply. While the run lasts, the
// page's own prompts into that conversation are refused (the next one would run on the hosted model
// too). "Just this once" (the stretch card): the owner hands this one request over with the switch
// left off. Either way the gateway gets a grant for this run only (fallback_once, a lease renewed
// while the run lives), taken back when it ends; every lease is dropped when the front desk starts. Each run is audited hosted_used (or hosted_once) with numbers only, the
// gateway's own count before and after: tokens and cost, no content, no file names.
//
// A picked choice (OLA-337): the run's body may name `model`, one of the outside open models the
// gateway serves at the hosted provider beside `hosted` (DeepSeek V4 Pro, `deepseek-v4-pro`). It is
// the person's pick for that one request (the Mac app's "Try again with" and the choice in its box),
// under the same switch, grant, month and audit as the hosted model; the session goes back to
// `ola/general` after it, as always. Nothing else here ever chooses it.
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { audit } from './db.mjs'
import { LEASE_MS, gatewayUsage, jobGrants, leaseUntil, onceGrants, scratchGrants, writeGrantsFile } from './claude.mjs'

export const STRETCH = ['suggest', 'handover', 'never']
export const STRETCH_TO = ['hosted', 'claude']
const ID = /^[A-Za-z0-9_-]{1,80}$/
const MAX_REQUEST = 20_000
const OLA_MODEL = { id: 'general', providerID: 'ola' }
const HOSTED_MODEL = { id: 'hosted', providerID: 'ola' }

export function hostedConfig(env = process.env) {
  const home = env.OLA_HOME || path.join(homedir(), '.ola')
  const usd = env.OLA_FD_HOSTED_CAP_USD === undefined ? 20 : Number(env.OLA_FD_HOSTED_CAP_USD)
  if (!Number.isFinite(usd) || usd < 0 || usd > 10_000) throw new Error('OLA_FD_HOSTED_CAP_USD must be a number from 0 to 10000')
  // Gateway callers that are not projects and hold a standing grant, set by the admin in the front
  // desk's env: the owner's own `bart` (his Mac app's "On this Mac" with the pasted token, through
  // the machine's forwarder). Empty by default.
  const callers = (env.OLA_FD_HOSTED_CALLERS || '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const c of callers) if (!/^[A-Za-z0-9._-]{1,64}$/.test(c) || /^(ws|p)-/.test(c) || c === 'usage') throw new Error(`OLA_FD_HOSTED_CALLERS: ${c} is not a standing caller's name (not ws-…, p-… or usage)`)
  const file = env.OLA_FD_HOSTED_FILE || path.join(home, 'gateway-hosted')
  // The owners' permission for design work to leave the office (gateway/design.mjs, OLA-168), beside
  // the hosted grants, where the gateway looks for it by default.
  return { file, designFile: env.OLA_FD_DESIGN_FILE || path.join(path.dirname(file), 'gateway-design'), capMicroUsd: Math.round(usd * 1e6), callers }
}

/** The gateway's hosted grants file, from the database: each active project with a hosted run going on (its lease), or a hosted job running (its runner's key). */
export function writeHostedGrants(db, hc) {
  const grants = {}
  const lease = onceGrants(db, 'hosted')
  const jobs = jobGrants(db, 'hosted')
  for (const w of db.prepare("SELECT id, slug, hosted_enabled AS enabled, hosted_cap_micro_usd AS usd FROM workspaces WHERE status = 'active' ORDER BY slug").all()) {
    const job = w.enabled === 1 ? jobs.get(w.id) : undefined
    if (!lease.has(w.id) && !job) continue
    grants[`ws-${w.slug}`] = { cap_micro_usd: w.usd ?? hc.capMicroUsd, ...(lease.has(w.id) ? { until: lease.get(w.id) } : { key_sha256: job }) }
  }
  for (const g of scratchGrants(db, 'hosted')) grants[`ws-${g.slug}`] = { cap_micro_usd: g.cap_micro_usd, until: g.until }
  // A person's own Macs (the Mac app and the `ola` command, signed in): only when the admin let them
  // (people.app_hosted, admin.mjs app-hosted), while they are active and have a computer signed in,
  // within their own monthly ceiling. The app hands a request over only when the person says so.
  for (const p of db.prepare("SELECT p.id, p.app_hosted_cap_micro_usd AS usd FROM people p WHERE p.app_hosted = 1 AND p.status = 'active' AND EXISTS (SELECT 1 FROM devices d WHERE d.person_id = p.id AND d.revoked_at IS NULL AND d.expires_at > ?) ORDER BY p.id").all(Date.now())) {
    grants[`p-${p.id}`] = { cap_micro_usd: p.usd ?? hc.capMicroUsd }
  }
  for (const c of hc.callers ?? []) grants[c] = { cap_micro_usd: hc.capMicroUsd }
  if (hc.designFile) writeDesignPermission(db, hc)
  return writeGrantsFile(hc.file, grants)
}

/**
 * Who may send design work to the design model once the everyday model runs on our own machine
 * (gateway/design.mjs): each active project whose owner switched the hosted model on, and each person
 * the admin let use the hosted model on their Mac. The hosted switch is the owner's permission for work
 * to leave the office; the design request still goes only to the design model, never to `hosted`.
 * Read by the gateway only while GATEWAY_EVERYDAY_LOCAL is on.
 */
export function writeDesignPermission(db, hc) {
  const allowed = {}
  for (const w of db.prepare("SELECT slug FROM workspaces WHERE status = 'active' AND hosted_enabled = 1 ORDER BY slug").all()) allowed[`ws-${w.slug}`] = {}
  for (const p of db.prepare("SELECT id FROM people WHERE app_hosted = 1 AND status = 'active' ORDER BY id").all()) allowed[`p-${p.id}`] = {}
  return writeGrantsFile(hc.designFile, allowed)
}

const NOT_SET_UP = {
  none: 'This machine has no hosted open model set up yet. Ola’s team can set one up.',
  unknown: 'This cannot be turned on just now: this machine could not check that the hosted open model is set up. Ola’s team can look into it.',
}

export function makeHosted({ db, hc, cc, workspaces, runCeilingMs, log, madeBy = null }) {
  let status = { at: 0, value: null }
  const usage = async (fresh = false) => {
    if (!fresh && Date.now() - status.at < 5000) return status.value
    status = { at: Date.now(), value: await gatewayUsage(cc) }
    return status.value
  }
  const runs = new Map() // slug -> the run in that project (one at a time)
  db.prepare("DELETE FROM fallback_once WHERE engine = 'hosted'").run() // no run outlives the front desk that started it
  writeHostedGrants(db, hc)
  const renew = setInterval(() => {
    const live = [...runs.values()].filter((r) => !r.ended && r.leaseId !== null)
    for (const r of live) db.prepare('UPDATE fallback_once SET until = ? WHERE id = ?').run(leaseUntil(), r.leaseId)
    if (live.length) writeHostedGrants(db, hc)
  }, LEASE_MS / 3)
  renew.unref()

  const row = (wsId) => db.prepare('SELECT hosted_enabled AS enabled, hosted_cap_micro_usd AS usd, stretch, stretch_to AS stretchTo FROM workspaces WHERE id = ?').get(wsId)

  /** What the page shows and may offer (part of GET /api/fallback). */
  async function info(ws) {
    const r = row(ws.id)
    const g = await usage()
    const provider = g?.hosted?.provider ?? null
    const m = g?.hostedMonth.get(`ws-${ws.slug}`)
    const run = runs.get(ws.slug)
    return {
      picks: g?.hosted?.picks ?? [],
      enabled: r.enabled === 1,
      canChange: ws.role === 'owner',
      configured: Boolean(provider),
      provider,
      unavailable: provider ? null : g ? NOT_SET_UP.none : NOT_SET_UP.unknown,
      month: { unit: 'usd', used: (m?.cost_micro_usd ?? 0) / 1e6, cap: (r.usd ?? hc.capMicroUsd) / 1e6, reported: Boolean(g) },
      running: run ? { conversation: run.session } : null,
    }
  }
  const stretchOf = (ws) => {
    const r = row(ws.id)
    return { stretch: r.stretch, stretchTo: r.stretchTo }
  }

  /** POST /api/hosted/settings, owner only. */
  async function setSettings(ws, personId, body) {
    if (ws.role !== 'owner') return { status: 403, body: { error: 'owner_only', message: 'Only the project’s owner can change this.' } }
    const r = row(ws.id)
    if (typeof body?.enabled === 'boolean' && body.enabled !== (r.enabled === 1)) {
      if (body.enabled) {
        if (body.consent !== true) return { status: 400, body: { error: 'consent', message: 'Read the note and confirm to turn this on.' } }
        status.at = 0
        const i = await info(ws)
        if (!i.configured) return { status: 409, body: { error: 'not_set_up', message: i.unavailable } }
      }
      db.prepare('UPDATE workspaces SET hosted_enabled = ? WHERE id = ?').run(body.enabled ? 1 : 0, ws.id)
      audit(db, { actor: personId, action: body.enabled ? 'hosted_enabled' : 'hosted_disabled', workspace: ws.id })
      writeHostedGrants(db, hc)
    }
    status.at = 0
    return { status: 200, body: await info(ws) }
  }

  /** POST /api/fallback/settings, owner only: "When a request looks like a stretch", and where a handover goes. */
  function setStretch(ws, body) {
    if (ws.role !== 'owner') return { status: 403, body: { error: 'owner_only', message: 'Only the project’s owner can change this.' } }
    if (body?.stretch !== undefined && !STRETCH.includes(body.stretch)) return { status: 400, body: { error: 'bad_stretch' } }
    if (body?.stretchTo !== undefined && !STRETCH_TO.includes(body.stretchTo)) return { status: 400, body: { error: 'bad_stretch_to' } }
    if (body?.stretch) db.prepare('UPDATE workspaces SET stretch = ? WHERE id = ?').run(body.stretch, ws.id)
    if (body?.stretchTo) db.prepare('UPDATE workspaces SET stretch_to = ? WHERE id = ?').run(body.stretchTo, ws.id)
    return { status: 200, body: stretchOf(ws) }
  }

  /** POST /api/hosted/run: one request with the hosted model, in the person's conversation. */
  async function start(ws, personId, body) {
    const r = row(ws.id)
    const once = r.enabled !== 1 && body?.once === true
    if (r.enabled !== 1 && !once) return { status: 403, body: { error: 'hosted_off', message: 'The hosted open model is off for this project. Its owner can turn it on in Settings.' } }
    if (once && ws.role !== 'owner') return { status: 403, body: { error: 'owner_only', message: 'Only the project’s owner can hand a request to the hosted open model while it is off.' } }
    const request = typeof body?.request === 'string' ? body.request.trim() : ''
    const model = body?.model === undefined || body.model === 'hosted' ? 'hosted' : body.model
    const session = body?.conversation
    if (!request || request.length > MAX_REQUEST || typeof session !== 'string' || !ID.test(session)) return { status: 400, body: { error: 'bad_request', message: 'That request could not be read.' } }
    status.at = 0
    const i = await info(ws)
    if (!i.configured) return { status: 503, body: { error: 'not_set_up', message: i.unavailable } }
    const pick = model === 'hosted' ? null : i.picks.find((x) => x.id === model)
    if (model !== 'hosted' && !pick) return { status: 400, body: { error: 'unknown_model', message: 'That model is not one this machine offers.' } }
    // The page hears a run end on opencode's stream a moment before the watcher below does: a run
    // whose session no longer executes is finished now, so the next request is not refused for it.
    const old = runs.get(ws.slug)
    if (old && !old.ended) {
      const now = await workspaces.executing(ws.slug)
      if (now && !now.has(old.session)) await end(old, true)
    }
    if (runs.has(ws.slug)) return { status: 409, body: { error: 'hosted_busy', message: 'The hosted open model is already working on a request in this project. Wait for it to finish, or stop it.' } }
    const run = { id: `h${Date.now().toString(36)}${randomBytes(6).toString('hex')}`, slug: ws.slug, wsId: ws.id, session, personId, once, model, leaseId: null, before: null, ended: false, timer: null, turn: null }
    runs.set(ws.slug, run) // before any await below: a second start finds it
    try {
      await workspaces.ensureRunning(ws.slug)
      // This run's grant, with the switch on or just this once: renewed while it lives, gone at its end.
      run.leaseId = Number(db.prepare("INSERT INTO fallback_once (workspace_id, engine, person_id, until) VALUES (?, 'hosted', ?, ?)").run(ws.id, personId, leaseUntil()).lastInsertRowid)
      writeHostedGrants(db, hc)
      // The gateway reloads the grants file within about 2 s: wait (up to 6 s) until it lists this
      // project, or the run's first request would be refused as "off".
      const caller = `ws-${ws.slug}`
      run.before = await usage(true)
      for (let n = 0; n < 12 && !run.before?.hostedMonth.get(caller)?.granted; n++) {
        await new Promise((res) => setTimeout(res, 500))
        run.before = await usage(true)
      }
      const sw = await workspaces.oc(ws.slug, 'POST', `/api/session/${session}/model`, { model: { ...HOSTED_MODEL, id: model } })
      if (sw.status < 200 || sw.status > 299) throw Object.assign(new Error('switch'), { status: sw.status === 404 ? 404 : 502 })
      // Which engine made a file (madeby.mjs, OLA-224): this run is the hosted model's turn in the
      // VM, and opencode's history shows Ola's replies as its own, so what Ola and Claude did in this
      // conversation since its last turn goes in front of the request as a marked note.
      const note = madeBy ? madeBy.noteFor(ws.slug, session, 'hosted') : ''
      run.turn = madeBy ? await madeBy.begin(ws.slug, { engine: 'hosted', session, request, model }) : null
      const p = await workspaces.oc(ws.slug, 'POST', `/api/session/${session}/prompt`, { text: note + request })
      if (p.status < 200 || p.status > 299) throw Object.assign(new Error('prompt'), { status: 502 })
      workspaces.notePrompt(ws.slug, ws.id, personId, session)
    } catch (e) {
      await end(run, false)
      const message = e.status === 404 ? 'That conversation is not in this project.' : 'The hosted open model could not start in your project just now. Nothing was changed.'
      return { status: e.status ?? 502, body: { error: 'hosted_failed', message } }
    }
    log(`${ws.slug}: a hosted model run started${pick ? ` on ${pick.name}` : ''}${once ? ' (just this once)' : ''}`)
    watchEnd(run)
    return { status: 200, body: { ok: true, run: run.id, provider: i.provider, model, ...(pick ? { name: pick.name } : {}) } }
  }

  // The run ends when opencode stops saying the session is executing, once it was seen executing or
  // the session's own record has an end ("idle") newer than the prompt (a short run can finish
  // between two looks); 20 s after the prompt if neither; at the latest at the run ceiling and a
  // minute. All of it is the workspace's word: a workspace that lies keeps its one run (and a
  // one-time grant) until that ceiling, never longer.
  function watchEnd(run) {
    const t0 = Date.now()
    let seen = false
    let silent = 0
    const deadline = t0 + (runCeilingMs > 0 ? runCeilingMs : 2 * 3600_000) + 60_000
    const tick = async () => {
      if (run.ended) return
      const now = await workspaces.executing(run.slug)
      if (now === null) silent++
      else {
        silent = 0
        if (now.has(run.session)) seen = true
      }
      let over = (seen && now !== null && !now.has(run.session)) || silent >= 40 || Date.now() > deadline
      if (!over && !seen && now !== null && !now.has(run.session)) over = (await endedSince(run.slug, run.session, t0 - 1000)) || Date.now() - t0 > 20_000
      if (over) return end(run, true)
      run.timer = setTimeout(tick, 1500)
    }
    run.timer = setTimeout(tick, 700)
  }
  /** Does the session's record end (an `idle` message) after this moment? */
  async function endedSince(slug, session, at) {
    const r = await workspaces.oc(slug, 'GET', `/api/session/${session}/message?limit=200`)
    const list = Array.isArray(r.json?.data) ? r.json.data : Array.isArray(r.json) ? r.json : []
    return list.some((m) => m?.type === 'idle' && Number(m.time?.created) >= at)
  }

  async function end(run, started) {
    if (run.ended) return
    run.ended = true
    clearTimeout(run.timer)
    // What the run created, changed or deleted, recorded as the hosted model's (madeby.mjs).
    if (run.turn) await madeBy.end(run.slug, run.turn, { interrupted: !started })
    // Back to Ola's own model before anything else: the conversation's next request runs here.
    // opencode may refuse the switch while the session is still settling right after its run, so
    // it is read back and tried again (up to about 10 s); a failure is logged, never silent.
    if (started || run.before) {
      let back = false
      for (let n = 0; n < 20 && !back; n++) {
        if (n) await new Promise((r) => setTimeout(r, 500))
        await workspaces.oc(run.slug, 'POST', `/api/session/${run.session}/model`, { model: OLA_MODEL })
        const s = await workspaces.oc(run.slug, 'GET', `/api/session/${run.session}`)
        back = (s.json?.data ?? s.json)?.model?.id === OLA_MODEL.id
      }
      if (!back) log(`${run.slug}: a conversation could not be switched back to Ola's own model after a hosted run`)
    }
    if (run.leaseId !== null) db.prepare('DELETE FROM fallback_once WHERE id = ?').run(run.leaseId)
    run.leaseId = null
    writeHostedGrants(db, hc)
    runs.delete(run.slug)
    if (!started) return
    const caller = `ws-${run.slug}`
    const b = run.before?.hostedMonth.get(caller)
    const a = (await usage(true))?.hostedMonth.get(caller)
    const same = a && b && a.month === b.month
    const diff = (k) => (same ? Math.max(0, (a[k] ?? 0) - (b[k] ?? 0)) : a && !b ? (a[k] ?? 0) : null)
    audit(db, { actor: run.personId, action: run.once ? 'hosted_once' : 'hosted_used', workspace: run.wsId, tokensIn: diff('tokens_in'), tokensOut: diff('tokens_out'), costMicroUsd: diff('cost_micro_usd') })
    log(`${run.slug}: a hosted model run ended`)
  }

  return {
    info,
    stretchOf,
    setSettings,
    setStretch,
    start,
    /** True while a hosted run works in this conversation: the page's own prompts there wait. */
    busy: (slug, session) => runs.get(slug)?.session === session,
    writeGrants: () => writeHostedGrants(db, hc),
    close() {
      clearInterval(renew)
      for (const run of runs.values()) clearTimeout(run.timer)
    },
  }
}
