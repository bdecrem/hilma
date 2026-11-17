// Batch jobs, the front desk's side: "ask the same thing of every document" (workspace/ola-batch).
//
// Why the job is the front desk's and not one opencode run: a run ends at the two-hour ceiling, and
// a workspace with nothing executing stops after 30 idle minutes; a job of 400 documents on a local
// model takes hours or days. So the agent only writes a job down (`ola-batch propose`, inside the
// sealed VM: the form, the documents, an estimate), and the person starts it here. From then on the
// front desk keeps it going: it runs `ola-batch run <job>` inside the project's own VM through
// `container exec` (each document is one small model call through the VM's door and the gateway,
// exactly like the agent's; the documents never leave the VM), counts the job as activity so the
// idle stop waits for it, starts the runner again when it is gone (a front desk restart, a machine
// restart, a crash), and wakes the VM for it after a reboot. The runner saves after every document,
// so a restart loses at most the one call in flight. The two-hour ceiling is for opencode runs, and
// this is not one; a job's limit is its budget.
//
// Who decides: owners and members run a trial on Ola's own model; only an owner starts the full
// run (it sets how much of this machine the job may use: the budget, confirmed in the proposal),
// and only an owner may use an outside model (the hosted open model, or Claude), and only while
// the project's switch for it is on. Viewers read.
//
// The platform database keeps one row per job a person started (batch_jobs: the job's id, its
// state, its model, its budget, who, when: no title, no field, no document, those are content and
// stay in the VM). The gateway's grant for a job (GATEWAY_BATCH_FILE, writeBatchGrants) is written
// from those rows alone: a job has a grant only while it is in its trial or running, so the budget
// the person approved is what the gateway enforces, whatever the VM says. The grant is the job
// runner's alone (review 5 follow-up, low): each time the front desk starts a runner it makes a key,
// hands it to that runner on its input, and keeps only its sha256 (batch_jobs.runner_key_sha256,
// which the grants carry); the gateway serves the job's requests only with the key. The runner runs
// as the agent's user but in a group of its own (`--user 1000:1001`): the kernel then refuses the
// agent's processes its memory, its environment and its open pipes (ptrace access needs the same
// uid AND gid), and it talks to the door's socket itself, not to the loopback bridge the agent could
// replace. The agent can still end the runner (signals go by uid): the front desk then starts a new
// one with a new key. A job on the hosted model or Claude gets that grant bound to the same key.
//
// Everything the VM says about a job (its state, progress, rows) is the VM's word: typed, capped,
// and never trusted for a decision that matters. A VM that says "done" early only stops its own job.
import { createHash, randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { audit } from './db.mjs'
import { writeGrantsFile } from './claude.mjs'
import * as ws from '../workspace/ws.mjs'

const JOB = /^[0-9a-f]{12}$/
const MODELS = ['general', 'hosted', 'claude']
const VM_STATES = ['proposed', 'trial', 'trial_done', 'running', 'paused', 'done', 'cancelled']

export function jobsConfig(env = process.env) {
  const home = env.OLA_HOME || path.join(homedir(), '.ola')
  const num = (k, d, min, max) => {
    const v = env[k] === undefined ? d : Number(env[k])
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${k} must be a number from ${min} to ${max}`)
    return v
  }
  return {
    file: env.OLA_FD_BATCH_FILE || path.join(home, 'gateway-batch'),
    tickMs: num('OLA_FD_JOB_TICK_MS', 10_000, 500, 600_000),
    // A runner whose heartbeat is older than this is gone (it beats every 3 s, also during a call).
    staleMs: num('OLA_FD_JOB_STALE_S', 45, 5, 3600) * 1000,
    maxTokens: num('OLA_FD_JOB_MAX_TOKENS', 100_000_000, 1000, 1e12),
  }
}

/** The gateway's job grants, from the database alone: each active project's job in its trial or running, whose runner holds its key. */
export function writeBatchGrants(db, jc) {
  const grants = {}
  for (const r of db.prepare("SELECT w.slug, j.job, j.budget, j.runner_key_sha256 AS k FROM batch_jobs j JOIN workspaces w ON w.id = j.workspace_id WHERE w.status = 'active' AND j.state IN ('trial', 'running') AND j.runner_key_sha256 IS NOT NULL ORDER BY j.updated_at").all()) grants[`ws-${r.slug}`] = { job: r.job, tokens: r.budget, key_sha256: r.k }
  return writeGrantsFile(jc.file, grants)
}

const int = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null)
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** One job as the VM tells it, typed and capped (the VM's word). */
function cleanJob(j) {
  if (!j || typeof j !== 'object' || !JOB.test(j.id ?? '')) return null
  const p = j.progress && typeof j.progress === 'object' ? j.progress : {}
  const est = (e) => (e && typeof e === 'object' ? { documents: int(e.documents), tokens: int(e.tokens), tokens_in: int(e.tokens_in), tokens_out: int(e.tokens_out), seconds: int(e.seconds), budget: int(e.budget), basis: str(e.basis, 40), weekQuota: int(e.week_quota), weekShare: num(e.week_share) } : null)
  const fields = Array.isArray(j.fields)
    ? j.fields.slice(0, 25).map((f) => ({ name: str(f?.name, 40), type: ['text', 'category', 'number', 'yesno'].includes(f?.type) ? f.type : 'text', question: str(f?.question, 500), values: Array.isArray(f?.values) ? f.values.slice(0, 40).map((v) => str(v, 80)) : undefined })).filter((f) => f.name && /^[a-z][a-z0-9_]{0,30}$/.test(f.name))
    : []
  return {
    id: j.id,
    name: /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(j.name ?? '') ? j.name : null,
    title: str(j.title, 300),
    instructions: str(j.instructions, 4000),
    fields,
    model: MODELS.includes(j.model) ? j.model : 'general',
    state: VM_STATES.includes(j.state) ? j.state : 'proposed',
    trialSize: int(j.trialSize),
    budget: int(j.budget),
    estimate: est(j.estimate),
    remainingEstimate: est(j.remainingEstimate),
    note: str(j.note, 300),
    created: str(j.created, 40),
    heartbeatAge: num(j.heartbeatAge),
    secondsLeft: int(j.secondsLeft),
    progress: Object.fromEntries(['pending', 'done', 'failed', 'no_text', 'problems', 'trial_total', 'trial_left', 'total', 'tokens'].map((k) => [k, int(p[k]) ?? 0])),
  }
}

/**
 * A job the agent set going before any person said yes: the gateway refused it at its first document
 * (nothing was read), and the VM calls it paused, "No job is approved…". With no row here no person
 * ever approved it, so it is still a proposal: the page shows the trial button, not a Resume that could
 * only be refused (first-user pass, 2026-11-17: the person was told to start it under Jobs, and Jobs
 * offered nothing that worked).
 */
export function unapproved(j, row) {
  return j && !row && j.state === 'paused' && !j.progress?.done ? { ...j, state: 'proposed', note: null } : j
}

// `tool` reaches ola-batch in a project's VM (ws.mjs: `container exec`); web/dev.mjs passes one that
// runs it on its dev folder, so the page's checks drive this same code.
export function makeJobs({ db, jc, cc, workspaces, hostedInfo, claudeInfo, log, otherGrants = () => {}, tool = { api: ws.batchApi, runner: ws.batchRunner } }) {
  const runners = new Map() // `${slug}:${job}` -> the `container exec` child
  const holds = new Map() // slug -> release() of its busy hold (a job keeps the VM awake)
  const waiting = new Map() // slug -> what keeps the job from going on now ("the machine is full")
  // No runner outlives the front desk that started it (it is a child of its `container exec`): an
  // earlier front desk's keys are dropped, and each runner started below gets a new one.
  db.prepare('UPDATE batch_jobs SET runner_key_sha256 = NULL WHERE runner_key_sha256 IS NOT NULL').run()
  const grantsAll = () => (writeBatchGrants(db, jc), otherGrants())
  grantsAll()

  const rowsOf = (wsId) => db.prepare('SELECT job, state, stage, model, budget, started_by AS by, updated_at AS at FROM batch_jobs WHERE workspace_id = ?').all(wsId)
  const rowOf = (wsId, job) => db.prepare('SELECT * FROM batch_jobs WHERE workspace_id = ? AND job = ?').get(wsId, job)

  async function prices() {
    if (!cc.usageToken) return null
    try {
      const r = await fetch(`${cc.gateway}/v1/usage`, { headers: { authorization: `Bearer ${cc.usageToken}` }, signal: AbortSignal.timeout(5000) })
      if (!r.ok) return null
      const j = await r.json()
      const pr = (p) => (p && typeof p.in === 'number' && typeof p.out === 'number' ? { in: p.in, out: p.out } : null)
      const used = new Map((Array.isArray(j.data) ? j.data : []).filter((d) => typeof d?.caller === 'string' && d.batch_job).map((d) => [d.caller, d.batch_job]))
      return { hosted: pr(j.hosted?.prices), claude: pr(j.claude_prices), used }
    } catch {
      return null
    }
  }

  /** Which models the proposal may offer this person, with what each would cost. */
  async function options(w) {
    const [h, c, pr] = await Promise.all([hostedInfo(w).catch(() => null), claudeInfo(w).catch(() => null), prices()])
    const out = [{ model: 'general', label: 'Ola’s own model, on this machine', outside: false, allowed: true }]
    if (h?.enabled && h?.configured) out.push({ model: 'hosted', label: `The hosted open model at ${h.provider}`, outside: true, provider: h.provider, allowed: w.role === 'owner', prices: pr?.hosted ?? null, month: h.month })
    if (c?.enabled) out.push({ model: 'claude', label: 'Claude', outside: true, provider: 'Anthropic', allowed: w.role === 'owner', prices: pr?.claude ?? null, month: c.month })
    return out
  }

  async function vm(slug, args, ms = 20_000) {
    await workspaces.ensureRunning(slug)
    return tool.api(slug, args, { ms })
  }

  function decorate(w, j, row) {
    return {
      ...j,
      // What the front desk holds for the job (the source of truth for whether it may run).
      approved: row ? { state: row.state, stage: row.stage, model: row.model, budget: row.budget, at: new Date(row.at ?? row.updated_at).toISOString() } : null,
      waiting: (row && ['trial', 'running'].includes(row.state) && waiting.get(w.slug)) || null,
    }
  }

  async function list(w) {
    const r = await vm(w.slug, ['list'])
    const rows = new Map(rowsOf(w.id).map((x) => [x.job, x]))
    const jobs = (Array.isArray(r.jobs) ? r.jobs : []).slice(0, 50).map(cleanJob).filter(Boolean).map((j) => decorate(w, unapproved(j, rows.get(j.id)), rows.get(j.id)))
    return { jobs, options: await options(w), role: w.role }
  }

  async function show(w, job, q) {
    if (!JOB.test(job ?? '')) return { status: 404, body: { error: 'not_found' } }
    const args = ['show', '--job', job, '--offset', String(q.offset ?? 0), '--limit', String(q.limit ?? 50)]
    if (['trial', 'full'].includes(q.stage)) args.push('--stage', q.stage)
    if (q.problems) args.push('--problems', '1')
    let r
    try {
      r = await vm(w.slug, args)
    } catch (e) {
      if (e?.code === 'NO_JOB') return { status: 404, body: { error: 'not_found', message: 'That job is not in this project.' } }
      throw e
    }
    const j = unapproved(cleanJob(r), rowOf(w.id, job))
    if (!j) return { status: 502, body: { error: 'job_failed', message: 'The job could not be read just now.' } }
    const res = r.results && typeof r.results === 'object' ? r.results : {}
    const columns = Array.isArray(res.columns) ? res.columns.slice(0, 200).map((c) => str(c, 80)) : []
    const rows = Array.isArray(res.rows) ? res.rows.slice(0, 200).map((x) => (Array.isArray(x) ? x.slice(0, columns.length).map((v) => (typeof v === 'string' ? v.slice(0, 4000) : typeof v === 'number' || v === null ? v : String(v).slice(0, 200))) : [])) : []
    return { status: 200, body: { job: decorate(w, j, rowOf(w.id, job) && { ...rowOf(w.id, job), at: rowOf(w.id, job).updated_at }), results: { columns, rows, total: int(res.total) ?? 0, offset: int(res.offset) ?? 0 }, options: await options(w), role: w.role } }
  }

  const refuse = (status, error, message) => ({ status, body: { error, message } })

  /** POST /api/jobs/<action>: trial, start, pause, resume, cancel. */
  async function act(w, personId, action, body) {
    const canRun = w.role === 'owner' || w.role === 'member'
    if (!canRun) return refuse(403, 'read_only', 'You can read this project, but not start or change its jobs. Ask its owner if you need more.')
    const job = body?.job
    if (!JOB.test(job ?? '')) return refuse(400, 'bad_job', 'That job could not be read.')
    let j
    try {
      j = cleanJob(await vm(w.slug, ['status', '--job', job]))
    } catch (e) {
      if (e?.code === 'NO_JOB') return refuse(404, 'not_found', 'That job is not in this project.')
      throw e
    }
    if (!j) return refuse(502, 'job_failed', 'The job could not be read just now.')
    const row = rowOf(w.id, job)
    j = unapproved(j, row)
    const other = db.prepare("SELECT job FROM batch_jobs WHERE workspace_id = ? AND job != ? AND state IN ('trial', 'running')").get(w.id, job)
    const now = Date.now()

    if (action === 'trial' || action === 'start') {
      const model = body?.model ?? j.model
      if (!MODELS.includes(model)) return refuse(400, 'bad_model', 'That model is not one Ola offers.')
      if (other) return refuse(409, 'busy', 'Another job is running in this project. Pause it, or wait for it to finish, then start this one.')
      const opt = (await options(w)).find((o) => o.model === model)
      if (!opt) return refuse(403, 'model_off', model === 'general' ? 'That model is not available.' : 'That model is off for this project. Its owner can turn it on in Settings.')
      if (opt.outside && w.role !== 'owner') return refuse(403, 'owner_only', 'Only the project’s owner can send a job to a model outside this machine.')
      if (opt.outside && body?.consent !== true) return refuse(400, 'consent', 'Confirm that the documents may leave this machine for this job.')
      if (action === 'start' && w.role !== 'owner') return refuse(403, 'owner_only', 'Only the project’s owner can start the whole job: it sets how much of this machine the job may use. You can run the trial and show them the rows.')
      if (action === 'trial' && !['proposed', 'trial_done'].includes(j.state)) return refuse(409, 'state', 'This job’s trial has already run.')
      if (action === 'start' && j.state !== 'trial_done') return refuse(409, 'state', 'Run the trial first, and look at its rows.')
      // The budget: the trial's is its share of the estimate, doubled; the full run's is what the
      // owner confirmed (the tokens used so far count toward it: the gateway counts the whole job).
      const est = j.estimate ?? {}
      let budget
      if (action === 'trial') budget = Math.max(20_000, Math.ceil(((est.tokens ?? 0) / Math.max(1, est.documents ?? 1)) * (j.trialSize ?? 15) * 2))
      else {
        if (body?.confirm !== true) return refuse(400, 'confirm', 'Confirm the budget to start the job.')
        budget = Number(body?.budget)
        if (!Number.isSafeInteger(budget) || budget < 1000 || budget > jc.maxTokens) return refuse(400, 'bad_budget', `The budget is a number of tokens from 1,000 to ${jc.maxTokens.toLocaleString('en-US')}.`)
        budget += j.progress.tokens
      }
      const state = action === 'trial' ? 'trial' : 'running'
      await vm(w.slug, ['set', '--job', job, '--state', state, '--budget', String(budget), '--model', model])
      if (row) db.prepare('UPDATE batch_jobs SET state = ?, stage = ?, model = ?, budget = ?, started_by = ?, updated_at = ? WHERE id = ?').run(state, action === 'trial' ? 'trial' : 'full', model, budget, personId, now, row.id)
      else db.prepare('INSERT INTO batch_jobs (workspace_id, job, state, stage, model, budget, started_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(w.id, job, state, action === 'trial' ? 'trial' : 'full', model, budget, personId, now, now)
      audit(db, { actor: personId, action: action === 'trial' ? 'job_trial_started' : 'job_started', workspace: w.id, tokensIn: budget })
      writeBatchGrants(db, jc)
      tick().catch(() => {})
      return { status: 200, body: { ok: true, state, budget } }
    }
    if (!row) return refuse(409, 'state', 'This job has not been started.')
    if (action === 'pause' || action === 'cancel') {
      if (!['trial', 'running', 'paused', 'trial_done'].includes(row.state) || (action === 'pause' && row.state === 'paused')) return refuse(409, 'state', 'This job is not running.')
      const state = action === 'pause' ? 'paused' : 'cancelled'
      db.prepare('UPDATE batch_jobs SET state = ?, updated_at = ? WHERE id = ?').run(state, now, row.id)
      grantsAll()
      await vm(w.slug, ['set', '--job', job, '--state', state, '--note', action === 'pause' ? 'Paused by a person.' : 'Cancelled by a person. What was coded is kept.']).catch(() => {})
      stopRunner(w.slug, job)
      audit(db, { actor: personId, action: action === 'pause' ? 'job_paused' : 'job_cancelled', workspace: w.id })
      return { status: 200, body: { ok: true, state } }
    }
    if (action === 'resume') {
      if (row.state !== 'paused') return refuse(409, 'state', 'This job is not paused.')
      if (other) return refuse(409, 'busy', 'Another job is running in this project. Pause it, or wait for it to finish, then resume this one.')
      const opt = (await options(w)).find((o) => o.model === row.model)
      if (!opt) return refuse(403, 'model_off', 'This job’s model is off for this project now. Its owner can turn it on in Settings.')
      if (opt.outside && w.role !== 'owner') return refuse(403, 'owner_only', 'Only the project’s owner can resume a job that uses a model outside this machine.')
      let budget = row.budget
      if (body?.budget !== undefined) {
        if (w.role !== 'owner') return refuse(403, 'owner_only', 'Only the project’s owner can change a job’s budget.')
        const more = Number(body.budget)
        if (!Number.isSafeInteger(more) || more < 1000 || more > jc.maxTokens) return refuse(400, 'bad_budget', 'The budget is a number of tokens.')
        budget = j.progress.tokens + more
      }
      const state = row.stage === 'trial' ? 'trial' : 'running'
      db.prepare('UPDATE batch_jobs SET state = ?, budget = ?, updated_at = ? WHERE id = ?').run(state, budget, now, row.id)
      await vm(w.slug, ['set', '--job', job, '--state', state, '--budget', String(budget)])
      audit(db, { actor: personId, action: 'job_resumed', workspace: w.id, tokensIn: budget })
      writeBatchGrants(db, jc)
      tick().catch(() => {})
      return { status: 200, body: { ok: true, state, budget } }
    }
    return refuse(404, 'not_found', 'not found')
  }

  function stopRunner(slug, job) {
    const c = runners.get(`${slug}:${job}`)
    if (!c) return
    // The runner ends itself within 3 s of seeing the new state; the exec is ended after that.
    setTimeout(() => c.exitCode === null && c.kill('SIGTERM'), 5000).unref()
  }

  function startRunner(slug, job) {
    const key = `${slug}:${job}`
    if (runners.has(key)) return
    // This runner's key: given to it alone, its sha256 kept for the grants (and nothing else).
    const secret = randomBytes(32).toString('hex')
    const sha = createHash('sha256').update(secret).digest('hex')
    const set = (v) => db.prepare('UPDATE batch_jobs SET runner_key_sha256 = ? WHERE job = ? AND workspace_id = (SELECT id FROM workspaces WHERE slug = ?)').run(v, job, slug)
    set(sha)
    grantsAll()
    const c = tool.runner(slug, job, secret)
    runners.set(key, c)
    let err = ''
    c.stderr?.on('data', (d) => (err = (err + d).slice(-400)))
    c.on('close', (code) => {
      runners.delete(key)
      // Its key goes with it: a runner the agent ended, or one that finished, leaves no grant behind.
      if (db.prepare('SELECT 1 FROM batch_jobs WHERE job = ? AND runner_key_sha256 = ?').get(job, sha)) (set(null), grantsAll())
      if (code !== 0 && code !== 3) log(`${slug}: the job runner ended (${code}): ${err.trim().split('\n').pop() ?? ''}`.slice(0, 300))
    })
    log(`${slug}: job runner started`)
  }

  // ---------------------------------------------------------------- keeping jobs going
  let ticking = false
  async function tick() {
    if (ticking) return
    ticking = true
    try {
      const active = db.prepare("SELECT j.*, w.slug, w.status AS ws_status FROM batch_jobs j JOIN workspaces w ON w.id = j.workspace_id WHERE j.state IN ('trial', 'running')").all()
      const live = new Set()
      for (const r of active) {
        if (r.ws_status !== 'active') continue
        live.add(r.slug)
        if (!holds.has(r.slug)) holds.set(r.slug, workspaces.holdBusy(r.slug))
        try {
          await workspaces.ensureRunning(r.slug)
          waiting.delete(r.slug)
        } catch (e) {
          waiting.set(r.slug, e?.code === 'MACHINE_BUSY' ? 'Waiting for room on this machine: it runs four projects at once.' : e?.code === 'CLOSED' ? 'This project is closed for now.' : 'Waiting for this project’s computer to start.')
          continue
        }
        let s
        try {
          s = cleanJob(await tool.api(r.slug, ['status', '--job', r.job], { ms: 15_000 }))
        } catch {
          continue
        }
        if (!s) continue
        const now = Date.now()
        // The VM finished, or paused itself (its budget, a refusal): the front desk follows.
        if (['trial_done', 'done'].includes(s.state) || (s.state === 'paused' && /^Paused:/.test(s.note ?? ''))) {
          const state = s.state === 'paused' ? 'paused' : s.state
          db.prepare('UPDATE batch_jobs SET state = ?, updated_at = ? WHERE id = ?').run(state, now, r.id)
          grantsAll()
          const used = (await prices())?.used.get(`ws-${r.slug}`)
          audit(db, { actorKind: 'system', action: state === 'paused' ? 'job_paused' : 'job_finished', workspace: r.workspace_id, tokensIn: used?.job === r.job ? used.tokens_in : null, tokensOut: used?.job === r.job ? used.tokens_out : null })
          log(`${r.slug}: job ${state === 'done' ? 'finished' : state === 'trial_done' ? 'trial finished' : 'paused itself'}`)
          continue
        }
        // The VM's record says otherwise (a restart between two steps, a VM made again): ours wins.
        if (s.state !== r.state) await tool.api(r.slug, ['set', '--job', r.job, '--state', r.state, '--budget', String(r.budget)], { ms: 15_000 }).catch(() => {})
        const fresh = s.heartbeatAge !== null && s.heartbeatAge * 1000 < jc.staleMs
        if (!runners.has(`${r.slug}:${r.job}`) && !fresh) startRunner(r.slug, r.job)
      }
      for (const [slug, release] of holds) if (!live.has(slug)) holds.delete(slug), release()
    } finally {
      ticking = false
    }
  }
  const timer = setInterval(() => tick().catch((e) => log(`jobs: ${e?.code ?? 'error'}`)), jc.tickMs)
  timer.unref()
  // At start (after a front desk or machine restart): pick up every job that was going.
  setTimeout(() => tick().catch(() => {}), 500).unref()

  return {
    list,
    show,
    act,
    tick,
    /** Whether a job is going in this project (it is activity: the idle stop waits). */
    running: (wsId) => Boolean(db.prepare("SELECT 1 FROM batch_jobs WHERE workspace_id = ? AND state IN ('trial', 'running')").get(wsId)),
    close() {
      clearInterval(timer)
      // The runners are children of `container exec`: on a restart they end with the exec, and the
      // next front desk starts them again. Nothing coded is lost.
      for (const c of runners.values()) c.kill('SIGTERM')
      for (const release of holds.values()) release()
    },
  }
}
