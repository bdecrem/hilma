#!/usr/bin/env node
// The model gateway: the one address a workspace may reach.
//
// A person's workspace (their files, the agent, its shell) has no route to the
// internet. It can talk to this process and nothing else. The gateway holds the
// model server's address and key, so no workspace ever does, and it is where
// "which model, for whom, how much" is decided. Treat every caller as hostile:
// a workspace's agent can be prompt-injected, and its shell can send anything.
//
// It speaks POST /v1/chat/completions (streamed or not), GET /v1/models and
// GET /v1/usage. Every setting is an environment variable, checked at start;
// the gateway refuses to start on any setting it does not like (see CONFIG
// below and the README's gateway section for each one and its default).
//
// What it enforces, in the order a request meets it:
//   1. who: a bearer token from GATEWAY_TOKENS (or the read-only usage token)
//   2. size: the body is capped (GATEWAY_MAX_BODY_BYTES) and refused before it is read whole
//   3. which model: only the gateway's own names (general, fast, code), mapped to upstream
//      ids in GATEWAY_MODELS. A caller's string never goes upstream.
//   4. how much: tokens per caller per week (Monday 00:00 UTC), counted from the upstream's
//      usage on every try and kept in a SQLite file so a restart forgets nothing
//   5. how many at once: a global cap on requests in flight to the model server and a
//      per-caller cap; past that, a per-caller queue drained round-robin between callers,
//      with a maximum wait
//   6. how long: connect, first byte and total timeouts on the upstream; a caller who goes
//      away cancels its upstream request
//
// What it writes down: one JSON line per request with the caller's name, the route, the
// model name, the status, a fixed reason on failure, tries, token counts, queue wait and
// milliseconds. Every field is a number, a name from the config, or a string from this
// file; nothing a caller or the model server sends reaches the log. Never a prompt, a
// file, a tool argument or a reply. That is the "no record of what you asked" promise,
// kept in the one place that sees every request.
//
// What it repairs (measured 2026-11-15 with gpt-oss-120b on Together.ai):
//   - a reply that calls tools and ALSO carries text was found to be the model
//     writing invented tool results before it had any. The text is dropped; the
//     calls go through. (TEXT_WITH_CALLS=keep turns this off for a server that
//     does not have the fault.)
//   - an upstream parse error, or a tool call whose arguments are not JSON or
//     whose name is not one of the tools offered, is retried, three tries in all.
// The upstream is always asked for a whole reply, so nothing half-formed reaches
// the agent; a streaming caller gets that reply as a well-formed stream.
import http from 'node:http'
import https from 'node:https'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// ---------------------------------------------------------------- config

const MODEL_NAMES = ['general', 'fast', 'code']
const SETTINGS = {
  // name: [default, min, max]  (whole numbers)
  GATEWAY_PORT: [4180, 0, 65535],
  GATEWAY_MAX_BODY_BYTES: [4 * 1024 * 1024, 1024, 64 * 1024 * 1024],
  GATEWAY_MAX_REPLY_BYTES: [16 * 1024 * 1024, 1024, 256 * 1024 * 1024],
  GATEWAY_MAX_INFLIGHT: [4, 1, 256],
  GATEWAY_MAX_INFLIGHT_PER_CALLER: [2, 1, 256],
  GATEWAY_MAX_QUEUED_PER_CALLER: [8, 0, 1024],
  GATEWAY_MAX_QUEUE_WAIT_MS: [120_000, 10, 3_600_000],
  GATEWAY_CONNECT_TIMEOUT_MS: [5_000, 10, 120_000],
  GATEWAY_FIRST_BYTE_TIMEOUT_MS: [300_000, 10, 3_600_000],
  GATEWAY_TOTAL_TIMEOUT_MS: [600_000, 10, 3_600_000],
  GATEWAY_READ_TIMEOUT_MS: [30_000, 1_000, 600_000],
  GATEWAY_WEEKLY_TOKENS: [20_000_000, 1, 1e12],
}
const OTHER_GATEWAY_SETTINGS = ['GATEWAY_TOKENS', 'GATEWAY_MODELS', 'GATEWAY_HOST', 'GATEWAY_DB', 'GATEWAY_QUOTAS', 'GATEWAY_USAGE_TOKEN']
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const TOKEN = /^[\x21-\x2b\x2d-\x7e]{24,512}$/ // printable ASCII, no space, no comma

// Reads and checks every setting. Problems are described by setting name and position,
// never by value, so a bad config never prints a token or a key.
function loadConfig(env) {
  const problems = []
  const bad = (m) => problems.push(m)
  for (const k of Object.keys(env)) {
    if (k.startsWith('GATEWAY_') && !(k in SETTINGS) && !OTHER_GATEWAY_SETTINGS.includes(k)) bad(`${k} is not a setting this gateway knows (a typo?)`)
  }
  const num = {}
  for (const [k, [def, min, max]] of Object.entries(SETTINGS)) {
    const raw = env[k]
    if (raw === undefined || raw === '') {
      num[k] = def
      continue
    }
    const n = Number(raw)
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max) bad(`${k} must be a whole number from ${min} to ${max}`)
    num[k] = n
  }
  if (num.GATEWAY_MAX_INFLIGHT_PER_CALLER > num.GATEWAY_MAX_INFLIGHT) bad('GATEWAY_MAX_INFLIGHT_PER_CALLER cannot be more than GATEWAY_MAX_INFLIGHT')
  if (num.GATEWAY_FIRST_BYTE_TIMEOUT_MS > num.GATEWAY_TOTAL_TIMEOUT_MS) bad('GATEWAY_FIRST_BYTE_TIMEOUT_MS cannot be more than GATEWAY_TOTAL_TIMEOUT_MS')

  let upstream = null
  if (!env.UPSTREAM_BASE_URL) bad('UPSTREAM_BASE_URL is not set')
  else {
    try {
      const u = new URL(env.UPSTREAM_BASE_URL)
      const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') bad('UPSTREAM_BASE_URL must be http or https')
      else if (u.protocol === 'http:' && !loopback) bad('UPSTREAM_BASE_URL may be plain http only on this machine (127.0.0.1); the key would travel in clear')
      if (u.username || u.password || u.search || u.hash) bad('UPSTREAM_BASE_URL must not carry credentials, a query or a fragment')
      upstream = new URL(u.href.replace(/\/+$/, '') + '/chat/completions')
    } catch {
      bad('UPSTREAM_BASE_URL is not a URL')
    }
  }
  const key = env.UPSTREAM_API_KEY || ''
  if (!key) bad('UPSTREAM_API_KEY is not set')
  else if (!/^[\x21-\x7e]+$/.test(key)) bad('UPSTREAM_API_KEY has spaces or control characters')

  // GATEWAY_TOKENS: "name:token,name:token"
  const tokens = [] // [{ name, digest }]
  const names = new Set()
  const digests = new Set()
  if (!env.GATEWAY_TOKENS) bad('GATEWAY_TOKENS is not set')
  else {
    env.GATEWAY_TOKENS.split(',').forEach((pair, i) => {
      const at = pair.indexOf(':')
      const name = pair.slice(0, at).trim()
      const token = pair.slice(at + 1).trim()
      if (at < 1 || !NAME.test(name)) return bad(`GATEWAY_TOKENS entry ${i + 1}: the name must be letters, digits, dot, dash or underscore (at most 64)`)
      if (!TOKEN.test(token)) return bad(`GATEWAY_TOKENS entry ${i + 1} (${name}): the token must be 24 to 512 printable characters with no space or comma`)
      const digest = sha(token)
      if (name === 'usage') bad(`GATEWAY_TOKENS entry ${i + 1}: the name usage is reserved for the usage token`)
      if (names.has(name)) bad(`GATEWAY_TOKENS: the name ${name} appears twice`)
      if (digests.has(digest.toString('hex'))) bad(`GATEWAY_TOKENS entry ${i + 1} (${name}): this token is already given to another caller`)
      names.add(name)
      digests.add(digest.toString('hex'))
      tokens.push({ name, digest })
    })
  }
  let usageDigest = null
  if (env.GATEWAY_USAGE_TOKEN) {
    if (!TOKEN.test(env.GATEWAY_USAGE_TOKEN) || env.GATEWAY_USAGE_TOKEN.length < 32) bad('GATEWAY_USAGE_TOKEN must be 32 to 512 printable characters with no space or comma')
    else {
      usageDigest = sha(env.GATEWAY_USAGE_TOKEN)
      if (digests.has(usageDigest.toString('hex'))) bad('GATEWAY_USAGE_TOKEN must not be a caller token')
    }
  }

  // GATEWAY_MODELS: "general=upstream id,fast=upstream id"
  const models = new Map()
  if (!env.GATEWAY_MODELS) bad('GATEWAY_MODELS is not set')
  else {
    env.GATEWAY_MODELS.split(',').forEach((pair, i) => {
      const at = pair.indexOf('=')
      const name = pair.slice(0, at).trim()
      const id = pair.slice(at + 1).trim()
      if (!MODEL_NAMES.includes(name)) return bad(`GATEWAY_MODELS entry ${i + 1}: the name must be one of ${MODEL_NAMES.join(', ')}`)
      if (!/^[\x21-\x7e]{1,200}$/.test(id)) return bad(`GATEWAY_MODELS entry ${i + 1} (${name}): the upstream id must be 1 to 200 printable characters`)
      if (models.has(name)) return bad(`GATEWAY_MODELS: ${name} appears twice`)
      models.set(name, id)
    })
  }

  // GATEWAY_QUOTAS: "name=tokens per week" for callers who differ from GATEWAY_WEEKLY_TOKENS
  const quotas = new Map([...names].map((n) => [n, num.GATEWAY_WEEKLY_TOKENS]))
  if (env.GATEWAY_QUOTAS) {
    env.GATEWAY_QUOTAS.split(',').forEach((pair, i) => {
      const [name, raw] = pair.split('=').map((s) => s?.trim())
      if (!names.has(name)) return bad(`GATEWAY_QUOTAS entry ${i + 1}: not a caller in GATEWAY_TOKENS`)
      if (!/^\d+$/.test(raw || '') || Number(raw) < 1 || Number(raw) > 1e12) return bad(`GATEWAY_QUOTAS entry ${i + 1} (${name}): tokens must be a whole number from 1 to 10^12`)
      quotas.set(name, Number(raw))
    })
  }

  const host = env.GATEWAY_HOST || '127.0.0.1'
  if (!/^[0-9a-z.:-]{1,253}$/i.test(host)) bad('GATEWAY_HOST is not a host name or address')
  const db = resolve(env.GATEWAY_DB || `${homedir()}/.local/state/ola-gateway/usage.db`)
  const textWithCalls = env.TEXT_WITH_CALLS || 'drop'
  if (!['drop', 'keep'].includes(textWithCalls)) bad('TEXT_WITH_CALLS must be drop or keep')

  if (problems.length) {
    for (const p of problems) console.error(`config: ${p}`)
    console.error('the gateway did not start')
    process.exit(1)
  }
  return {
    upstream,
    key,
    tokens,
    usageDigest,
    models,
    quotas,
    host,
    db,
    keepText: textWithCalls === 'keep',
    port: num.GATEWAY_PORT,
    maxBody: num.GATEWAY_MAX_BODY_BYTES,
    maxReply: num.GATEWAY_MAX_REPLY_BYTES,
    maxInflight: num.GATEWAY_MAX_INFLIGHT,
    perCaller: num.GATEWAY_MAX_INFLIGHT_PER_CALLER,
    perCallerQueue: num.GATEWAY_MAX_QUEUED_PER_CALLER,
    maxWait: num.GATEWAY_MAX_QUEUE_WAIT_MS,
    connectMs: num.GATEWAY_CONNECT_TIMEOUT_MS,
    firstByteMs: num.GATEWAY_FIRST_BYTE_TIMEOUT_MS,
    totalMs: num.GATEWAY_TOTAL_TIMEOUT_MS,
    readMs: num.GATEWAY_READ_TIMEOUT_MS,
  }
}

function sha(s) {
  return createHash('sha256').update(s, 'utf8').digest()
}

const C = loadConfig(process.env)
const TRIES = 3
// The fields a caller may send on to the model server. Anything else is dropped: `n` would
// multiply the work, `user` names a person, and unknown fields are untested surface.
const PASS = ['messages', 'tools', 'tool_choice', 'parallel_tool_calls', 'temperature', 'top_p', 'top_k', 'min_p', 'max_tokens', 'max_completion_tokens', 'stop', 'seed', 'frequency_penalty', 'presence_penalty', 'repetition_penalty', 'response_format', 'reasoning_effort', 'reasoning']

// ---------------------------------------------------------------- usage store
// node:sqlite, not better-sqlite3: it ships inside Node, so there is no native addon to
// compile and no npm package in the trust chain of the process that holds the model key.
// Its synchronous calls take microseconds for rows this small.

process.umask(0o077)
mkdirSync(dirname(C.db), { recursive: true, mode: 0o700 })
const db = new DatabaseSync(C.db)
chmodSync(C.db, 0o600)
db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 2000;
  CREATE TABLE IF NOT EXISTS usage (
    week TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0, tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (week, caller, model)) STRICT;`)
const addUsage = db.prepare(`INSERT INTO usage (week, caller, model, requests, tokens_in, tokens_out) VALUES (?, ?, ?, 1, ?, ?)
  ON CONFLICT (week, caller, model) DO UPDATE SET requests = requests + 1, tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out`)
const readUsage = db.prepare(`SELECT coalesce(sum(requests), 0) AS requests, coalesce(sum(tokens_in), 0) AS tokens_in, coalesce(sum(tokens_out), 0) AS tokens_out FROM usage WHERE week = ? AND caller = ?`)

const WEEK_MS = 7 * 24 * 3600 * 1000
function weekStart(now = Date.now()) {
  const d = new Date(now)
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
}
const weekKey = (start) => new Date(start).toISOString().slice(0, 10)
function usageOf(name) {
  const start = weekStart()
  const row = readUsage.get(weekKey(start), name)
  const used = row.tokens_in + row.tokens_out
  const quota = C.quotas.get(name)
  return {
    object: 'usage',
    caller: name,
    week_start: new Date(start).toISOString(),
    resets_at: new Date(start + WEEK_MS).toISOString(),
    requests: row.requests,
    tokens_in: row.tokens_in,
    tokens_out: row.tokens_out,
    tokens_used: used,
    quota,
    fraction_used: Math.round((used / quota) * 10000) / 10000,
  }
}

// ---------------------------------------------------------------- the fair queue
// A request holds one of maxInflight slots while it talks to the model server, and a caller
// holds at most perCaller of them. A request that cannot start waits in its caller's own
// line; when a slot frees, the lines are served round-robin, one request per caller per
// turn, so a caller with ten waiting does not starve a caller with one.

const refusal = (code) => Object.assign(new Error(code), { code })

class FairQueue {
  constructor(callers, { max, perCaller, perCallerQueue, maxWait }) {
    Object.assign(this, { max, perCaller, perCallerQueue, maxWait })
    this.inflight = 0
    this.lanes = new Map(callers.map((n) => [n, { inflight: 0, queue: [] }]))
    this.ring = [...callers]
    this.cursor = 0
  }
  get queued() {
    let n = 0
    for (const l of this.lanes.values()) n += l.queue.length
    return n
  }
  // Resolves with a release function once the request may go upstream.
  acquire(name, signal) {
    const lane = this.lanes.get(name)
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(refusal('aborted'))
      const now = this.inflight < this.max && lane.inflight < this.perCaller && lane.queue.length === 0
      if (!now && lane.queue.length >= this.perCallerQueue) return reject(refusal('caller_busy'))
      const w = {}
      const leave = () => {
        clearTimeout(w.timer)
        signal.removeEventListener('abort', w.onAbort)
      }
      const drop = (code) => {
        const i = lane.queue.indexOf(w)
        if (i >= 0) lane.queue.splice(i, 1)
        leave()
        reject(refusal(code))
      }
      w.timer = setTimeout(() => drop('wait_timeout'), this.maxWait)
      w.onAbort = () => drop('aborted')
      w.grant = (release) => {
        leave()
        resolve(release)
      }
      signal.addEventListener('abort', w.onAbort, { once: true })
      lane.queue.push(w)
      this.dispatch()
    })
  }
  dispatch() {
    while (this.inflight < this.max) {
      let lane = null
      for (let i = 0; i < this.ring.length; i++) {
        const at = (this.cursor + i) % this.ring.length
        const l = this.lanes.get(this.ring[at])
        if (l.queue.length && l.inflight < this.perCaller) {
          lane = l
          this.cursor = (at + 1) % this.ring.length
          break
        }
      }
      if (!lane) return
      const w = lane.queue.shift()
      lane.inflight++
      this.inflight++
      let done = false
      w.grant(() => {
        if (done) return
        done = true
        lane.inflight--
        this.inflight--
        this.dispatch()
      })
    }
  }
}
const queue = new FairQueue(C.tokens.map((t) => t.name), { max: C.maxInflight, perCaller: C.perCaller, perCallerQueue: C.perCallerQueue, maxWait: C.maxWait })

// ---------------------------------------------------------------- the model server

const isTls = C.upstream.protocol === 'https:'
const agent = new (isTls ? https : http).Agent({ keepAlive: true, maxSockets: C.maxInflight + 2 })

// One POST to the model server. Resolves { status, text } or rejects with a code:
// connect_timeout (no connection, TLS included, in connectMs), first_byte_timeout (no
// response headers in firstByteMs after connecting), total_timeout (deadline passed),
// reply_too_large, unreachable, aborted (the caller went away; the socket is destroyed,
// which is how the model server learns to stop).
function post(body, signal, deadline) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body))
    let settled = false
    let tFirst
    const req = (isTls ? https : http).request(C.upstream, {
      method: 'POST',
      agent,
      headers: { Authorization: `Bearer ${C.key}`, 'Content-Type': 'application/json', 'Content-Length': data.length, Accept: 'application/json' },
    })
    const end = (err, value) => {
      if (settled) return
      settled = true
      clearTimeout(tConnect)
      clearTimeout(tFirst)
      clearTimeout(tTotal)
      signal.removeEventListener('abort', onAbort)
      if (err) {
        req.destroy()
        reject(refusal(err))
      } else resolve(value)
    }
    const onAbort = () => end('aborted')
    const tTotal = setTimeout(() => end('total_timeout'), Math.max(0, deadline - Date.now()))
    const tConnect = setTimeout(() => end('connect_timeout'), C.connectMs)
    const connected = () => {
      clearTimeout(tConnect)
      if (!settled) tFirst = setTimeout(() => end('first_byte_timeout'), C.firstByteMs)
    }
    req.on('socket', (s) => (req.reusedSocket || !s.connecting ? connected() : s.once(isTls ? 'secureConnect' : 'connect', connected)))
    req.on('response', (res) => {
      clearTimeout(tFirst)
      const chunks = []
      let size = 0
      res.on('data', (c) => {
        size += c.length
        if (size > C.maxReply) return end('reply_too_large')
        chunks.push(c)
      })
      res.on('end', () => end(null, { status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', () => end('unreachable'))
      res.on('aborted', () => end('unreachable'))
    })
    req.on('error', () => end('unreachable'))
    signal.addEventListener('abort', onAbort, { once: true })
    req.end(data)
  })
}

const pause = (ms, signal) =>
  new Promise((r) => {
    const t = setTimeout(r, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), r()), { once: true })
  })
const count = (v) => (Number.isSafeInteger(v) && v >= 0 && v < 1e9 ? v : 0)

// What is wrong with a reply, or null. Only shape is judged, never content.
function fault(message, offered) {
  for (const call of message.tool_calls || []) {
    const name = call.function?.name
    if (!name || (offered.size && !offered.has(name))) return `a call to a tool that was not offered`
    try {
      const args = JSON.parse(call.function.arguments || '{}')
      if (args === null || typeof args !== 'object') return 'tool arguments that are not an object'
    } catch {
      return 'tool arguments that are not JSON'
    }
  }
  if (!(message.tool_calls || []).length && !(typeof message.content === 'string' && message.content.trim())) return 'an empty reply'
  return null
}

// Asks the model server for one whole reply, retrying what is worth retrying. `tally` gets
// the tokens of every try that reported them: a rejected reply was still work done.
// Returns { status, json } or { status, error (for the caller), why (for the log, fixed) }.
async function complete(body, offered, signal, deadline, tally) {
  let last = 'no attempt made'
  let lastStatus = 502
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    tally.tries = attempt
    let r
    try {
      r = await post(body, signal, deadline)
    } catch (e) {
      if (e.code === 'aborted') return { status: 499, why: 'the caller went away' }
      if (e.code === 'total_timeout') return { status: 504, error: 'the model server took longer than the gateway allows', why: 'the total timeout passed' }
      if (e.code === 'first_byte_timeout') return { status: 504, error: 'the model server did not start answering in time', why: 'the first-byte timeout passed' }
      if (e.code === 'reply_too_large') return { status: 502, error: 'the model server sent a reply larger than the gateway accepts', why: 'the reply was over the size cap' }
      last = e.code === 'connect_timeout' ? 'the model server did not accept a connection in time' : 'the model server could not be reached'
      lastStatus = e.code === 'connect_timeout' ? 504 : 502
      if (attempt < TRIES) await pause(400 * attempt, signal)
      if (signal.aborted) return { status: 499, why: 'the caller went away' }
      continue
    }
    lastStatus = 502
    let json = null
    try {
      json = JSON.parse(r.text)
    } catch {}
    if (json && typeof json === 'object') {
      tally.in += count(json.usage?.prompt_tokens)
      tally.out += count(json.usage?.completion_tokens)
    }
    if (r.status === 429 || r.status >= 500) {
      last = `the model server answered ${r.status}`
      if (attempt < TRIES) await pause(400 * attempt, signal)
      if (signal.aborted) return { status: 499, why: 'the caller went away' }
      continue
    }
    if (!json || typeof json !== 'object') {
      last = 'the model server sent something that is not JSON'
      continue
    }
    if (r.status < 200 || r.status > 299) {
      const said = json.error?.message
      const message = typeof said === 'string' ? said.slice(0, 1000) : `the model server answered ${r.status}`
      // Together reports the model's own malformed output as a 4xx "Parse error"; that is worth another try.
      if (/parse error|failed to process token/i.test(message)) {
        last = 'the model produced output its server could not parse'
        continue
      }
      // The caller gets the model server's own words about its own request; the log gets only the status.
      const status = r.status >= 400 && r.status <= 499 ? r.status : 502
      return { status, error: message, why: `the model server answered ${r.status}` }
    }
    const message = json.choices?.[0]?.message
    if (!message || typeof message !== 'object') {
      last = 'a reply with no message'
      continue
    }
    const wrong = fault(message, offered)
    if (wrong) {
      last = `the model produced ${wrong}`
      continue
    }
    if ((message.tool_calls || []).length && !C.keepText) message.content = null
    return { status: 200, json }
  }
  return { status: lastStatus, error: `${last}, ${TRIES} times`, why: `${last}, ${TRIES} times` }
}

// ---------------------------------------------------------------- talking to the caller

function send(res, status, body, headers = {}) {
  if (res.headersSent || res.destroyed) return
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}
const fail = (res, status, message, type, headers) => send(res, status, { error: { message, type } }, headers)

function stream(res, json, wantUsage) {
  if (res.destroyed) return
  const choice = json.choices[0]
  const m = choice.message
  const base = { id: json.id || `chatcmpl-${randomUUID()}`, object: 'chat.completion.chunk', created: json.created || Math.floor(Date.now() / 1000), model: json.model }
  const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
  chunk({ role: 'assistant', content: '' })
  const reasoning = m.reasoning_content ?? m.reasoning
  if (reasoning) chunk({ reasoning_content: reasoning })
  if (m.content) chunk({ content: m.content })
  ;(m.tool_calls || []).forEach((call, index) =>
    chunk({ tool_calls: [{ index, id: call.id || `call_${randomUUID()}`, type: 'function', function: { name: call.function.name, arguments: call.function.arguments || '{}' } }] }),
  )
  chunk({}, choice.finish_reason || ((m.tool_calls || []).length ? 'tool_calls' : 'stop'))
  if (wantUsage && json.usage) res.write(`data: ${JSON.stringify({ ...base, choices: [], usage: json.usage })}\n\n`)
  res.end('data: [DONE]\n\n')
}

// Reads the body up to maxBody. Refuses on Content-Length before reading a byte, and
// otherwise stops reading the moment the cap is passed.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const declared = req.headers['content-length']
    if (declared !== undefined && !(Number(declared) <= C.maxBody)) return reject(refusal('too_large'))
    const chunks = []
    let size = 0
    let settled = false
    const end = (err, value) => {
      if (settled) return
      settled = true
      if (err) {
        req.removeAllListeners('data')
        req.pause()
        reject(refusal(err))
      } else resolve(value)
    }
    req.on('data', (c) => {
      size += c.length
      if (size > C.maxBody) return end('too_large')
      chunks.push(c)
    })
    req.on('end', () => end(null, Buffer.concat(chunks)))
    req.on('error', () => end('aborted'))
    req.on('close', () => end('aborted'))
  })
}

// Who is calling: a caller's name, 'usage' for the read-only usage token, or null.
// Digests have one length, so the compare leaks nothing about a token's length.
function identify(req) {
  const given = sha(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))
  let who = null
  for (const t of C.tokens) if (timingSafeEqual(given, t.digest) && !who) who = t.name
  if (!who && C.usageDigest && timingSafeEqual(given, C.usageDigest)) who = 'usage'
  return who
}

const ROUTES = { '/v1/chat/completions': 'chat', '/v1/models': 'models', '/v1/usage': 'usage' }
const secondsUntil = (ms) => String(Math.max(1, Math.ceil((ms - Date.now()) / 1000)))

async function handle(req, res, rec, signal) {
  let path = ''
  try {
    path = new URL(req.url, 'http://x').pathname
  } catch {}
  rec.route = ROUTES[path] || 'other'
  const who = identify(req)
  const no = (status, why, message, type, headers) => {
    rec.status = status
    rec.why = why
    fail(res, status, message, type, headers)
  }
  if (!who) return no(401, 'unknown caller', 'unknown caller', 'authentication_error', { Connection: 'close' })
  rec.caller = who

  if (rec.route === 'usage' && req.method === 'GET') {
    rec.status = 200
    if (who === 'usage') return send(res, 200, { object: 'list', data: C.tokens.map((t) => usageOf(t.name)), inflight: queue.inflight, queued: queue.queued })
    return send(res, 200, usageOf(who))
  }
  if (who === 'usage') return no(403, 'the usage token only reads usage', 'this token can only read /v1/usage', 'permission_error')
  if (rec.route === 'models' && req.method === 'GET') {
    rec.status = 200
    return send(res, 200, { object: 'list', data: [...C.models.keys()].map((id) => ({ id, object: 'model', owned_by: 'ola' })) })
  }
  if (rec.route !== 'chat' || req.method !== 'POST') return no(404, 'not found', 'not found', 'invalid_request_error')

  let raw
  try {
    raw = await readBody(req)
  } catch (e) {
    if (e.code === 'too_large') {
      res.once('finish', () => req.socket?.destroy())
      return no(413, 'the body was over the size cap', `the request is larger than ${C.maxBody} bytes`, 'invalid_request_error', { Connection: 'close' })
    }
    rec.status = 499
    rec.why = 'the caller went away'
    return
  }
  let body
  try {
    body = JSON.parse(raw.toString('utf8'))
  } catch {
    return no(400, 'the request is not JSON', 'the request is not JSON', 'invalid_request_error')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return no(400, 'the request is not a JSON object', 'the request is not a JSON object', 'invalid_request_error')
  if (typeof body.model !== 'string' || !C.models.has(body.model)) {
    return no(400, 'an unknown model name', `unknown model; this gateway serves: ${[...C.models.keys()].join(', ')}`, 'invalid_request_error')
  }
  rec.model = body.model
  if (!Array.isArray(body.messages) || !body.messages.length) return no(400, 'no messages', 'messages must be a non-empty list', 'invalid_request_error')

  const before = usageOf(who)
  if (before.tokens_used >= before.quota) {
    return no(429, 'the weekly quota is used up', `this week's quota of ${before.quota} tokens is used up; it resets at ${before.resets_at}`, 'insufficient_quota', {
      'Retry-After': secondsUntil(Date.parse(before.resets_at)),
    })
  }

  const queuedAt = Date.now()
  let release
  try {
    release = await queue.acquire(who, signal)
  } catch (e) {
    rec.wait_ms = Date.now() - queuedAt
    if (e.code === 'caller_busy') {
      return no(429, 'the caller has too many requests waiting', `too many requests at once from this caller (${C.perCaller} running, ${C.perCallerQueue} waiting); retry shortly`, 'rate_limit_error', { 'Retry-After': '5' })
    }
    if (e.code === 'wait_timeout') {
      return no(503, 'the queue wait passed its limit', `the machine is busy; waited ${Math.round(C.maxWait / 1000)} s without a free slot`, 'overloaded_error', { 'Retry-After': '10' })
    }
    rec.status = 499
    rec.why = 'the caller went away'
    return
  }
  rec.wait_ms = Date.now() - queuedAt

  const tally = { in: 0, out: 0, tries: 0 }
  let out
  try {
    const wantStream = body.stream === true
    const wantUsage = body.stream_options?.include_usage === true
    const offered = new Set((Array.isArray(body.tools) ? body.tools : []).map((t) => t?.function?.name).filter((n) => typeof n === 'string'))
    const upstreamBody = { model: C.models.get(body.model), stream: false }
    for (const k of PASS) if (k in body) upstreamBody[k] = body[k]
    out = await complete(upstreamBody, offered, signal, Date.now() + C.totalMs, tally)
    rec.status = out.status
    if (out.status === 200) {
      out.json.model = body.model
      if (wantStream) stream(res, out.json, wantUsage)
      else send(res, 200, out.json)
    } else {
      rec.why = out.why
      if (out.status !== 499) fail(res, out.status, out.error, 'upstream_error')
    }
  } finally {
    release()
    rec.tries = tally.tries
    rec.tokens_in = tally.in
    rec.tokens_out = tally.out
    if (tally.tries) addUsage.run(weekKey(weekStart()), who, body.model, tally.in, tally.out)
  }
}

// The whole record of a request. Each field is a number, null, a caller name or model name
// checked at start, or one of this file's own strings: no value a caller or the model server
// chose. JSON.stringify escapes anything else, so a line stays one line regardless.
const log = (rec) => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...rec }) + '\n')

const server = http.createServer(async (req, res) => {
  const started = Date.now()
  const rec = { caller: '-', route: 'other', model: '-', status: 0, why: null, tries: 0, tokens_in: null, tokens_out: null, wait_ms: null, ms: 0 }
  const ac = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) ac.abort()
  })
  try {
    await handle(req, res, rec, ac.signal)
  } catch (e) {
    // e.message is never printed: V8's JSON errors quote the input, and that input is content.
    console.error(`gateway fault: ${e?.name || 'unknown'}`)
    rec.status = 500
    rec.why = 'a fault in the gateway'
    fail(res, 500, 'the gateway had a fault', 'server_error')
  } finally {
    if (ac.signal.aborted && rec.status !== 413) {
      rec.status = 499
      rec.why = 'the caller went away'
    }
    rec.ms = Date.now() - started
    log(rec)
  }
})
server.headersTimeout = Math.min(10_000, C.readMs)
server.requestTimeout = C.readMs // receiving the request; the response has its own timeouts
server.maxConnections = 256
server.maxRequestsPerSocket = 1000

const stop = () => {
  server.close()
  try {
    db.close()
  } catch {}
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)

server.listen(C.port, C.host, () => {
  console.log(
    JSON.stringify({
      t: new Date().toISOString(),
      event: 'start',
      listen: `http://${C.host}:${server.address().port}`,
      port: server.address().port,
      upstream: C.upstream.host,
      models: [...C.models.keys()],
      callers: C.tokens.length,
      limits: { max_body: C.maxBody, inflight: C.maxInflight, per_caller: C.perCaller, queued_per_caller: C.perCallerQueue, queue_wait_ms: C.maxWait, connect_ms: C.connectMs, first_byte_ms: C.firstByteMs, total_ms: C.totalMs },
    }),
  )
})
