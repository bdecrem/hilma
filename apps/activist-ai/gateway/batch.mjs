// Batch jobs (workspace/ola-batch, frontdesk/jobs.mjs): the gateway's side. A job asks the same
// thing of every document in a project, one model call per document, for hours or days. The
// project's weekly quota and its two slots were sized for conversations (one real job is about a
// week of a project's default quota), so a job does not draw on them: it has a budget of its own,
// which the person approved in the app, and this module enforces it.
//
// A request is the batch lane's when it carries `X-Ola-Lane: batch` (and `X-Ola-Job: <job id>`).
// The header names the lane for the priority work in the queue, too. Such a request:
//   - is served only while the front desk lists the caller's job in GATEWAY_BATCH_FILE (mode 600,
//     written by the front desk from the platform database: { "ws-<id>": { "job": "<12 hex>",
//     "tokens": n } }, reloaded within 2 s) and names that job; else 403 in a plain sentence. The
//     front desk lists a job only while it is in its trial or running, so a paused, cancelled or
//     finished job has no grant, and an agent that sends the header on its own gets nothing.
//   - carries `X-Ola-Job-Key`, a secret the front desk made for the job's runner when it started it
//     and handed to it alone (on its input, after the runner made itself unreadable to the agent's
//     user: workspace/ola-batch). The file holds its sha256 (`"key_sha256"`). Without the key, or
//     with another, 403: another process in the VM cannot spend the job's budget on its own
//     requests while the job runs (review 5, low; before, the job id alone was enough). A grant
//     without a key is no grant.
//   - is counted against that job's budget (batch_usage, by caller and job, kept across restarts
//     and pauses), not the caller's weekly quota; 429 with error code `job_budget` once the job has
//     used what was approved. Conversations keep their whole weekly quota while a job runs.
//   - may have one request in flight per caller (GATEWAY_BATCH_INFLIGHT_PER_CALLER, 1): a job can
//     never hold both of a project's slots, so the person's own requests always have one.
//   - still meets everything else: the model allowlist, the hosted model's grant and monthly
//     ceiling (a job on the hosted model needs the project's hosted grant, like any request), size
//     caps, the fair queue and the machine's total in flight.
// No budget can be set above GATEWAY_BATCH_JOB_MAX_TOKENS (100,000,000) whatever the file says.
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'

export const BATCH_SETTINGS = ['GATEWAY_BATCH_FILE', 'GATEWAY_BATCH_JOB_MAX_TOKENS', 'GATEWAY_BATCH_INFLIGHT_PER_CALLER']
const JOB = /^[0-9a-f]{12}$/
const KEY = /^[0-9a-f]{64}$/

export function batchConfig(env, bad) {
  const max = env.GATEWAY_BATCH_JOB_MAX_TOKENS === undefined ? 100_000_000 : Number(env.GATEWAY_BATCH_JOB_MAX_TOKENS)
  if (!Number.isSafeInteger(max) || max < 1000 || max > 1e12) bad('GATEWAY_BATCH_JOB_MAX_TOKENS must be a whole number from 1000 to 1000000000000')
  const per = env.GATEWAY_BATCH_INFLIGHT_PER_CALLER === undefined ? 1 : Number(env.GATEWAY_BATCH_INFLIGHT_PER_CALLER)
  if (!Number.isSafeInteger(per) || per < 1 || per > 8) bad('GATEWAY_BATCH_INFLIGHT_PER_CALLER must be a whole number from 1 to 8')
  return { file: env.GATEWAY_BATCH_FILE || null, maxTokens: max, perCaller: per }
}

/** The lane a request asks for: 'batch' with its job id, or null (a conversation). */
export function laneOf(req) {
  const lane = String(req.headers['x-ola-lane'] ?? '').trim().toLowerCase()
  if (lane !== 'batch') return null
  const job = String(req.headers['x-ola-job'] ?? '').trim()
  const key = String(req.headers['x-ola-job-key'] ?? '').trim()
  return { lane: 'batch', job: JOB.test(job) ? job : null, key: key.length >= 32 && key.length <= 128 ? key : null }
}

export const keyMatches = (g, key) => Boolean(key) && timingSafeEqual(createHash('sha256').update(String(key)).digest(), g.keySha)
/** A Claude or hosted grant held by a batch job's runner alone carries `key_sha256`: the request must carry the key. */
export const jobKeyOf = (g) => (KEY.test(g?.key_sha256 ?? '') ? Buffer.from(g.key_sha256, 'hex') : null)
export const runnerKeyOk = (grant, req) => !grant.keySha || keyMatches(grant, String(req.headers['x-ola-job-key'] ?? '').trim())

/**
 * One grants file, read the way all three are (Claude, the hosted model, batch jobs). Returns null
 * when nothing changed since `seen`; else { grants, stamp, ok }. Fails closed (review 4, open): a
 * file that is missing, unreadable, not mode 600 or not JSON means NO grants, never the ones in
 * force (before, a deleted file left every old grant working until the gateway restarted).
 * entry(name, g) returns the grant or null to skip it.
 */
export function readGrants(file, setting, seen, entry) {
  let st
  try {
    st = statSync(file)
  } catch {
    if (seen === 'missing') return null
    console.error(`${setting} is missing: no grants are in force`)
    return { grants: new Map(), stamp: 'missing', ok: false }
  }
  const stamp = `${st.mtimeMs}:${st.size}:${st.mode}`
  if (stamp === seen) return null
  try {
    if ((st.mode & 0o077) !== 0) throw new Error('mode')
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const grants = new Map()
    for (const [name, g] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
      if (!/^ws-[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(name)) continue
      const v = entry(name, g)
      if (v) grants.set(name, v)
    }
    return { grants, stamp, ok: true }
  } catch (e) {
    console.error(e?.message === 'mode' ? `${setting} must be mode 600: no grants are in force` : `${setting} could not be read: no grants are in force`)
    return { grants: new Map(), stamp, ok: false }
  }
}

export function makeBatch({ cfg, db }) {
  let grants = new Map()
  let seen = ''
  const load = () => {
    if (!cfg.file) return
    const next = readGrants(cfg.file, 'GATEWAY_BATCH_FILE', seen, (name, g) => {
      if (!g || typeof g !== 'object' || !JOB.test(g.job ?? '') || !KEY.test(g.key_sha256 ?? '')) return null
      if (!Number.isSafeInteger(g.tokens) || g.tokens < 1) return null
      return { job: g.job, tokens: Math.min(g.tokens, cfg.maxTokens), keySha: Buffer.from(g.key_sha256, 'hex') }
    })
    if (!next) return
    seen = next.stamp
    grants = next.grants
    process.stdout.write(JSON.stringify({ t: new Date().toISOString(), event: 'batch_grants', ok: next.ok, callers: grants.size }) + '\n')
  }
  load()
  const timer = setInterval(load, 2000)
  timer.unref()
  db.exec(`CREATE TABLE IF NOT EXISTS batch_usage (caller TEXT NOT NULL, job TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
    tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (caller, job)) STRICT;`)
  const add = db.prepare(`INSERT INTO batch_usage (caller, job, requests, tokens_in, tokens_out, updated) VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT (caller, job) DO UPDATE SET requests = requests + 1, tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out, updated = excluded.updated`)
  const read = db.prepare('SELECT requests, tokens_in, tokens_out FROM batch_usage WHERE caller = ? AND job = ?')
  const inflight = new Map()
  const usedBy = (caller, job) => {
    const r = read.get(caller, job) ?? { requests: 0, tokens_in: 0, tokens_out: 0 }
    return { requests: r.requests, tokens: r.tokens_in + r.tokens_out, tokens_in: r.tokens_in, tokens_out: r.tokens_out }
  }
  return {
    /** For /v1/usage: the caller's job in force and what it has used, or null. */
    jobOf(caller) {
      const g = grants.get(caller)
      return g ? { job: g.job, budget: g.tokens, ...usedBy(caller, g.job) } : null
    },
    usedBy,
    /** Null if this batch request may go ahead now (and it then holds one of the caller's batch slots), else the refusal. */
    admit(caller, lane, pending = 0) {
      const g = grants.get(caller)
      if (!g || !lane.job || lane.job !== g.job || !keyMatches(g, lane.key)) return { status: 403, why: 'no batch job is approved for this caller', message: 'No job is approved to run for this project now. A person starts a job, or its trial, under Jobs in the app.', type: 'permission_error' }
      const u = usedBy(caller, g.job)
      if (u.tokens + pending >= g.tokens) return { status: 429, why: 'the job used its budget', message: `This job has used the budget that was approved for it (${g.tokens} tokens). Raise it under Jobs to carry on.`, type: 'insufficient_quota', code: 'job_budget' }
      if ((inflight.get(caller) ?? 0) >= cfg.perCaller) return { status: 429, why: 'the job already has its request in flight', message: `A job sends ${cfg.perCaller === 1 ? 'one request' : `${cfg.perCaller} requests`} at a time; retry when it is answered.`, type: 'rate_limit_error', retryAfter: 5 }
      return null
    },
    /** Over budget, counting what this request already spent on earlier tries (the retry check). */
    over(caller, lane, pending) {
      const g = grants.get(caller)
      return !g || g.job !== lane.job || !keyMatches(g, lane.key) || usedBy(caller, g.job).tokens + pending >= g.tokens
    },
    hold(caller) {
      inflight.set(caller, (inflight.get(caller) ?? 0) + 1)
      let done = false
      return () => {
        if (done) return
        done = true
        inflight.set(caller, inflight.get(caller) - 1)
      }
    },
    record(caller, lane, tin, tout) {
      if (tin || tout) add.run(caller, lane.job, tin, tout, Date.now())
    },
    close: () => clearInterval(timer),
  }
}
