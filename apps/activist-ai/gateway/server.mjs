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
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, watch } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CLAUDE_SETTINGS, claudeConfig, makeClaude } from './claude.mjs'
import { HOSTED_SETTINGS, hostedConfig, makeHosted } from './hosted.mjs'

// ---------------------------------------------------------------- config

const MODEL_NAMES = ['general', 'fast', 'code']
const SETTINGS = {
  // name: [default, min, max]  (whole numbers)
  GATEWAY_PORT: [4180, 0, 65535],
  GATEWAY_MAX_BODY_BYTES: [4 * 1024 * 1024, 1024, 64 * 1024 * 1024],
  GATEWAY_MAX_TOTAL_BODY_BYTES: [32 * 1024 * 1024, 1024, 1024 * 1024 * 1024],
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
const OTHER_GATEWAY_SETTINGS = ['GATEWAY_TOKENS', 'GATEWAY_TOKENS_FILE', 'GATEWAY_DOOR_DIR', 'GATEWAY_MODELS', 'GATEWAY_HOST', 'GATEWAY_DB', 'GATEWAY_QUOTAS', 'GATEWAY_USAGE_TOKEN', ...CLAUDE_SETTINGS, ...HOSTED_SETTINGS]
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
  if (num.GATEWAY_MAX_TOTAL_BODY_BYTES < num.GATEWAY_MAX_BODY_BYTES) bad('GATEWAY_MAX_TOTAL_BODY_BYTES cannot be less than GATEWAY_MAX_BODY_BYTES')
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

  // GATEWAY_TOKENS: "name:token,name:token", and/or GATEWAY_TOKENS_FILE: a file (mode 600) holding
  // one such line (workspace/ws.mjs writes ~/.ola/gateway-tokens). The file is read again on
  // SIGHUP and whenever it changes, so a new or removed workspace needs no restart.
  const tokensFile = env.GATEWAY_TOKENS_FILE ? resolve(env.GATEWAY_TOKENS_FILE) : null
  const doorDir = env.GATEWAY_DOOR_DIR ? resolve(env.GATEWAY_DOOR_DIR) : null
  if (!env.GATEWAY_TOKENS && !tokensFile) bad('GATEWAY_TOKENS is not set (nor GATEWAY_TOKENS_FILE)')
  const tokens = readTokens(env.GATEWAY_TOKENS, tokensFile, bad)
  const names = new Set(tokens.map((t) => t.name))
  const digests = new Set(tokens.map((t) => t.digest.toString('hex')))
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
  // Fallback to Claude (claude.mjs): its own upstream, credentials and grants file.
  const claude = claudeConfig(env, bad)
  // Fallback to a hosted open model (hosted.mjs): the model name `hosted`, its own upstream and grants.
  const hosted = hostedConfig(env, bad)

  if (problems.length) {
    for (const p of problems) console.error(`config: ${p}`)
    console.error('the gateway did not start')
    process.exit(1)
  }
  return {
    upstream,
    key,
    tokens,
    tokensFile,
    doorDir,
    weekly: num.GATEWAY_WEEKLY_TOKENS,
    usageDigest,
    models,
    quotas,
    host,
    db,
    keepText: textWithCalls === 'keep',
    claude,
    hosted,
    port: num.GATEWAY_PORT,
    maxBody: num.GATEWAY_MAX_BODY_BYTES,
    maxTotalBody: num.GATEWAY_MAX_TOTAL_BODY_BYTES,
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

// The caller tokens from both sources, checked; problems go to `bad`, by name and entry number,
// never by value. A token file must be mode 600 and hold one GATEWAY_TOKENS= line (it may list
// no caller: a machine with no workspace yet).
function readTokens(line, file, bad) {
  const tokens = []
  const names = new Set()
  const digests = new Set()
  const parse = (text, where) => {
    if (!text) return
    text.split(',').forEach((pair, i) => {
      const at = pair.indexOf(':')
      const name = pair.slice(0, at).trim()
      const token = pair.slice(at + 1).trim()
      if (at < 1 || !NAME.test(name)) return bad(`${where} entry ${i + 1}: the name must be letters, digits, dot, dash or underscore (at most 64)`)
      if (!TOKEN.test(token)) return bad(`${where} entry ${i + 1} (${name}): the token must be 24 to 512 printable characters with no space or comma`)
      const digest = sha(token)
      if (name === 'usage') return bad(`${where} entry ${i + 1}: the name usage is reserved for the usage token`)
      if (names.has(name)) return bad(`${where}: the name ${name} appears twice`)
      if (digests.has(digest.toString('hex'))) return bad(`${where} entry ${i + 1} (${name}): this token is already given to another caller`)
      names.add(name)
      digests.add(digest.toString('hex'))
      tokens.push({ name, digest })
    })
  }
  parse(line, 'GATEWAY_TOKENS')
  if (file) {
    let st = null
    try {
      st = statSync(file)
    } catch {}
    if (!st?.isFile()) bad('GATEWAY_TOKENS_FILE: no such file')
    else if ((st.mode & 0o077) !== 0) bad('GATEWAY_TOKENS_FILE must be readable by this account only (mode 600)')
    else {
      const text = readFileSync(file, 'utf8').trim()
      if (!/^GATEWAY_TOKENS=[^\n]*$/.test(text)) bad('GATEWAY_TOKENS_FILE must hold one line, GATEWAY_TOKENS=name:token,...')
      else parse(text.slice('GATEWAY_TOKENS='.length), 'GATEWAY_TOKENS_FILE')
    }
  }
  return tokens
}

function sha(s) {
  return createHash('sha256').update(s, 'utf8').digest()
}

const C = loadConfig(process.env)
const TRIES = 3

// A last-layer scrub: the upstream key must never appear in anything sent to a caller or
// written to a log, whatever path put it there. The key is fixed and non-empty, so this is a
// plain substring replace; it runs on already-serialized strings only.
function redact(s) {
  if (typeof s !== 'string') return s
  if (s.includes(C.key)) s = s.split(C.key).join('[redacted]')
  if (C.hosted?.key && s.includes(C.hosted.key)) s = s.split(C.hosted.key).join('[redacted]')
  return claude ? claude.scrub(s) : s
}
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
const claude = makeClaude({ cfg: C.claude, db, readBody: (req, max) => readBody(req, max), send: (...a) => send(...a), fail: (...a) => fail(...a) })
const hosted = C.hosted ? makeHosted({ cfg: C.hosted, db }) : null
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
  // A caller added by a token reload gets its own line; a removed one's line goes once empty.
  addCaller(name) {
    if (!this.lanes.has(name)) this.lanes.set(name, { inflight: 0, queue: [] }), this.ring.push(name)
    return this.lanes.get(name)
  }
  prune(keep) {
    for (const [n, l] of this.lanes) if (!keep.has(n) && !l.inflight && !l.queue.length) this.lanes.delete(n)
    this.ring = this.ring.filter((n) => this.lanes.has(n))
    this.cursor = this.ring.length ? this.cursor % this.ring.length : 0
  }
  // Resolves with a release function once the request may go upstream.
  acquire(name, signal) {
    const lane = this.addCaller(name)
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
        if (l && l.queue.length && l.inflight < this.perCaller) {
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
function post(body, signal, deadline, target = null) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body))
    let settled = false
    let tFirst
    // The everyday model server, or (model `hosted`) the hosted provider's (hosted.mjs).
    const req = (target ? target.lib : isTls ? https : http).request(target ? target.url : C.upstream, {
      method: 'POST',
      agent: target ? target.agent : agent,
      headers: { Authorization: `Bearer ${target ? target.key : C.key}`, 'Content-Type': 'application/json', 'Content-Length': data.length, Accept: 'application/json' },
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

// A fixed message per status class for an upstream failure. Never the model server's own words.
function upstreamMessage(status) {
  if (status === 400) return 'the model server rejected the request'
  if (status === 404) return 'the requested model is not available on the model server'
  if (status === 408) return 'the model server timed out on the request'
  if (status === 413) return 'the request was too large for the model server'
  if (status === 429) return 'the model server is rate limiting the gateway'
  if (status >= 400 && status <= 499) return 'the model server rejected the request'
  return 'the model server failed'
}

// Rebuilds the reply the caller gets from a fixed allowlist, so no field the model server
// invents reaches a caller: not a top-level extra, not `prompt_tokens_details` (which can carry
// a prompt-cache hit count that is a side channel between callers), nothing but what is listed
// here. `model` is replaced with the gateway's own name, never the upstream id.
function sanitizeCompletion(json, modelName) {
  const out = {
    id: typeof json.id === 'string' ? json.id : `chatcmpl-${randomUUID()}`,
    object: 'chat.completion',
    created: Number.isSafeInteger(json.created) ? json.created : Math.floor(Date.now() / 1000),
    model: modelName,
    choices: (Array.isArray(json.choices) ? json.choices : []).map((ch, i) => {
      const m = (ch && typeof ch.message === 'object' && ch.message) || {}
      const msg = { role: 'assistant', content: typeof m.content === 'string' ? m.content : m.content == null ? null : '' }
      const calls = Array.isArray(m.tool_calls) ? m.tool_calls : []
      if (calls.length) {
        msg.tool_calls = calls.map((call, index) => ({
          id: typeof call?.id === 'string' ? call.id : `call_${randomUUID()}`,
          index: Number.isSafeInteger(call?.index) ? call.index : index,
          type: 'function',
          function: { name: String(call?.function?.name ?? ''), arguments: typeof call?.function?.arguments === 'string' ? call.function.arguments : '{}' },
        }))
      }
      return { index: Number.isSafeInteger(ch?.index) ? ch.index : i, message: msg, finish_reason: typeof ch?.finish_reason === 'string' ? ch.finish_reason : null }
    }),
  }
  const u = json.usage
  if (u && typeof u === 'object') {
    out.usage = { prompt_tokens: count(u.prompt_tokens), completion_tokens: count(u.completion_tokens), total_tokens: count(u.total_tokens) || count(u.prompt_tokens) + count(u.completion_tokens) }
  }
  return out
}

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
async function complete(body, offered, signal, deadline, tally, overQuota, target = null) {
  let last = 'no attempt made'
  let lastStatus = 502
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    // The quota is re-checked before every try: the tokens a slow burst already spent are in the
    // store by now, so a caller cannot keep retrying (or keep its queued requests going) past the
    // limit. The first try catches a caller that went over while it waited for a slot.
    const q = overQuota && overQuota(tally.in + tally.out)
    if (q) return { status: 429, type: 'insufficient_quota', error: `this week's quota of ${q.quota} tokens is used up; it resets at ${q.resets_at}`, why: 'the weekly quota is used up', headers: { 'Retry-After': secondsUntil(Date.parse(q.resets_at)) } }
    tally.tries = attempt
    let r
    try {
      r = await post(body, signal, deadline, target)
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
      const u = json.usage
      const reported = u && typeof u === 'object' && (Number.isSafeInteger(u.prompt_tokens) || Number.isSafeInteger(u.completion_tokens))
      if (reported) {
        tally.in += count(u.prompt_tokens)
        tally.out += count(u.completion_tokens)
      } else {
        // A model server that reports no usage must not be free: charge an estimate from the
        // bytes on the wire (~4 bytes per token) so the quota still bites. Flagged for the log.
        tally.in += Math.ceil(Buffer.byteLength(JSON.stringify(body)) / 4)
        tally.out += Math.ceil(Buffer.byteLength(r.text) / 4)
        tally.estimated = true
      }
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
      const said = typeof json.error?.message === 'string' ? json.error.message : ''
      // Together reports the model's own malformed output as a 4xx "Parse error"; that is worth
      // another try. The text is read here only to classify it; it is never sent on.
      if (/parse error|failed to process token/i.test(said)) {
        last = 'the model produced output its server could not parse'
        continue
      }
      // The caller never gets the model server's words: they can carry the gateway's own
      // Authorization header back (a 401 that echoes the bearer token). The caller gets a fixed
      // message per status class, and 401/403 is hidden as a 502 so a bad key looks like any
      // other upstream failure.
      const status = r.status === 401 || r.status === 403 ? 502 : r.status >= 400 && r.status <= 499 ? r.status : 502
      return { status, error: upstreamMessage(r.status), why: `the model server answered ${r.status}` }
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

// An answer sent while the request's body is still arriving (a 413 over the cap, a 401, too
// busy) closes the connection the lingering way: the whole answer with Connection: close, our FIN,
// then what the caller still sends is read and dropped until it stops, for at most LINGER_MS and
// LINGER_BYTES. Destroying the socket at once left those bytes unread, the kernel answered them
// with a reset, and the caller often lost the 413 and saw "connection reset" (2026-11-16). The
// same as ../web/server/linger.mjs; this file imports nothing of ours.
const LINGER_MS = 3_000
const LINGER_BYTES = 8 * 1024 * 1024
function closeAfter(req, res) {
  const sock = req.socket
  res.setHeader('Connection', 'close')
  if (!sock || sock.olaLinger) return
  sock.olaLinger = true
  // Node ends a Connection: close answer with socket.destroySoon(); this one waits, within bounds.
  sock.destroySoon = function lingerSoon() {
    if (this.destroyed) return
    const start = this.bytesRead
    const stop = () => this.destroy()
    const timer = setTimeout(stop, LINGER_MS)
    const count = setInterval(() => this.bytesRead - start > LINGER_BYTES && stop(), 25)
    timer.unref()
    count.unref()
    this.once('close', () => (clearTimeout(timer), clearInterval(count)))
    this.once('end', stop)
    this.end()
    if (!req.complete) req.resume()
  }
}

function send(res, status, body, headers = {}) {
  if (res.headersSent || res.destroyed) return
  if (res.req && !res.req.complete) closeAfter(res.req, res)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers })
  res.end(redact(JSON.stringify(body)))
}
const fail = (res, status, message, type, headers) => send(res, status, { error: { message, type } }, headers)

function stream(res, json, wantUsage) {
  if (res.destroyed) return
  const choice = json.choices[0]
  const m = choice.message
  const base = { id: json.id || `chatcmpl-${randomUUID()}`, object: 'chat.completion.chunk', created: json.created || Math.floor(Date.now() / 1000), model: json.model }
  const chunk = (delta, finish = null) => res.write(redact(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`))
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
  chunk({ role: 'assistant', content: '' })
  if (m.content) chunk({ content: m.content })
  ;(m.tool_calls || []).forEach((call, index) =>
    chunk({ tool_calls: [{ index, id: call.id || `call_${randomUUID()}`, type: 'function', function: { name: call.function.name, arguments: call.function.arguments || '{}' } }] }),
  )
  chunk({}, choice.finish_reason || ((m.tool_calls || []).length ? 'tool_calls' : 'stop'))
  if (wantUsage && json.usage) res.write(redact(`data: ${JSON.stringify({ ...base, choices: [], usage: json.usage })}\n\n`))
  res.end('data: [DONE]\n\n')
}

// The bytes held in all readBody buffers at once. One caller's maxBody is capped, but 256
// connections each sending a slow 4 MiB body would otherwise pin maxBody * connections of memory
// in the one process every workspace shares. This ceiling bounds that to GATEWAY_MAX_TOTAL_BODY_BYTES.
let buffering = 0

// Reads the body up to maxBody. Refuses on Content-Length before reading a byte, otherwise stops
// the moment the per-request cap is passed, and refuses outright once the whole process is already
// holding GATEWAY_MAX_TOTAL_BODY_BYTES of unread bodies.
function readBody(req, max = C.maxBody) {
  return new Promise((resolve, reject) => {
    const declared = req.headers['content-length']
    if (declared !== undefined && !(Number(declared) <= max)) return reject(refusal('too_large'))
    if (buffering >= C.maxTotalBody) return reject(refusal('too_busy'))
    const chunks = []
    let size = 0
    let held = 0
    let settled = false
    const release = () => {
      buffering -= held
      held = 0
    }
    const end = (err, value) => {
      if (settled) return
      settled = true
      release()
      if (err) {
        req.removeAllListeners('data')
        req.pause()
        reject(refusal(err))
      } else resolve(value)
    }
    req.on('data', (c) => {
      size += c.length
      buffering += c.length
      held += c.length
      if (size > max) return end('too_large')
      if (buffering > C.maxTotalBody) return end('too_busy')
      chunks.push(c)
    })
    req.on('end', () => end(null, Buffer.concat(chunks)))
    req.on('error', () => end('aborted'))
    req.on('close', () => end('aborted'))
  })
}

// Who is calling: a caller's name, 'usage' for the read-only usage token, or null.
// Digests have one length, so the compare leaks nothing about a token's length.
//
// A workspace's token is bound to its door. With GATEWAY_DOOR_DIR set, every caller named ws-*
// gets its own unix socket there (<dir>/<name>.sock, mode 600), and that workspace's door
// (workspace/door.mjs) connects to it and to nothing else. Through a door only that door's own
// token is accepted, so a token that leaked from one workspace is refused through every other
// workspace's door; and a door's token is refused on the TCP port. The binding is which socket
// the connection arrived on: nothing the caller sends can choose it.
const isDoorName = (name) => !!C.doorDir && name.startsWith('ws-')
function identify(req) {
  const given = sha(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))
  const door = req.socket?.server?.olaDoor ?? null
  let who = null
  for (const t of C.tokens) if (timingSafeEqual(given, t.digest) && !who) who = t.name
  if (door) return who === door ? who : null
  if (who && isDoorName(who)) return null
  if (!who && C.usageDigest && timingSafeEqual(given, C.usageDigest)) who = 'usage'
  return who
}
const known = (name) => name === 'usage' || C.tokens.some((t) => t.name === name)

const ROUTES = { '/v1/chat/completions': 'chat', '/v1/models': 'models', '/v1/usage': 'usage', '/anthropic/v1/messages': 'claude', '/anthropic/v1/messages/count_tokens': 'claude_count' }
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
    if (who === 'usage') return send(res, 200, { object: 'list', data: C.tokens.map((t) => ({ ...usageOf(t.name), claude_month: claude.monthOf(t.name), ...(hosted ? { hosted_month: hosted.monthOf(t.name) } : {}) })), inflight: queue.inflight, queued: queue.queued, claude_modes: claude.modes(), hosted: hosted ? { provider: hosted.provider } : null })
    return send(res, 200, { ...usageOf(who), claude_month: claude.monthOf(who) })
  }
  if (who === 'usage') return no(403, 'the usage token only reads usage', 'this token can only read /v1/usage', 'permission_error')
  // Claude Code in the workspace, through Anthropic's Messages API (claude.mjs).
  if (rec.route === 'claude' || rec.route === 'claude_count') return claude.handle(req, res, rec, who, signal)
  if (rec.route === 'models' && req.method === 'GET') {
    rec.status = 200
    return send(res, 200, { object: 'list', data: [...C.models.keys(), ...(hosted ? ['hosted'] : [])].map((id) => ({ id, object: 'model', owned_by: 'ola' })) })
  }
  if (rec.route !== 'chat' || req.method !== 'POST') return no(404, 'not found', 'not found', 'invalid_request_error')

  let raw
  try {
    raw = await readBody(req)
  } catch (e) {
    if (e.code === 'too_large') {
      return no(413, 'the body was over the size cap', `the request is larger than ${C.maxBody} bytes`, 'invalid_request_error', { Connection: 'close' })
    }
    if (e.code === 'too_busy') {
      return no(503, 'too many bodies in memory at once', 'the gateway is receiving too many requests at once; retry shortly', 'overloaded_error', { 'Retry-After': '5', Connection: 'close' })
    }
    rec.status = 499
    rec.why = 'the caller went away'
    return
  }
  // A token reload may have removed this caller while its body arrived.
  if (!known(who)) return no(401, 'unknown caller', 'unknown caller', 'authentication_error', { Connection: 'close' })
  let body
  try {
    body = JSON.parse(raw.toString('utf8'))
  } catch {
    return no(400, 'the request is not JSON', 'the request is not JSON', 'invalid_request_error')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return no(400, 'the request is not a JSON object', 'the request is not a JSON object', 'invalid_request_error')
  const isHosted = body.model === 'hosted' && hosted !== null
  if (typeof body.model !== 'string' || !(C.models.has(body.model) || isHosted)) {
    return no(400, 'an unknown model name', `unknown model; this gateway serves: ${[...C.models.keys(), ...(hosted ? ['hosted'] : [])].join(', ')}`, 'invalid_request_error')
  }
  rec.model = body.model
  // The hosted open model: only for a project whose owner turned it on, within its month's budget.
  if (isHosted) {
    const r = hosted.refusal(who)
    if (r) return no(r.status, r.why, r.message, r.type)
  }
  if (!Array.isArray(body.messages) || !body.messages.length) return no(400, 'no messages', 'messages must be a non-empty list', 'invalid_request_error')

  // Over quota counting what is already committed to the store plus `pending`, the tokens the
  // current request has already spent on earlier tries (not yet written). This is what re-checks
  // on every try and before a queued request starts, so a burst cannot run the whole queue past
  // the limit and a single request cannot keep retrying once its own tries have crossed it.
  const overQuota = (pending = 0) => {
    const u = usageOf(who)
    return u.tokens_used + pending >= u.quota ? u : null
  }
  const before = overQuota()
  if (before) {
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
    const upstreamBody = { model: isHosted ? hosted.model : C.models.get(body.model), stream: false }
    for (const k of PASS) if (k in body) upstreamBody[k] = body[k]
    out = await complete(upstreamBody, offered, signal, Date.now() + C.totalMs, tally, overQuota, isHosted ? hosted.target : null)
    rec.status = out.status
    if (out.status === 200) {
      const clean = sanitizeCompletion(out.json, body.model)
      if (wantStream) stream(res, clean, wantUsage)
      else send(res, 200, clean)
    } else {
      rec.why = out.why
      if (out.status !== 499) fail(res, out.status, out.error, out.type || 'upstream_error', out.headers)
    }
  } finally {
    release()
    rec.tries = tally.tries
    rec.tokens_in = tally.in
    rec.tokens_out = tally.out
    rec.estimated = tally.estimated ? 'bytes' : null
    if (tally.tries) addUsage.run(weekKey(weekStart()), who, body.model, tally.in, tally.out)
    if (isHosted && tally.tries) rec.cost_micro_usd = hosted.record(who, tally.in, tally.out)
  }
}

// The whole record of a request. Each field is a number, null, a caller name or model name
// checked at start, or one of this file's own strings: no value a caller or the model server
// chose. JSON.stringify escapes anything else, so a line stays one line regardless.
const log = (rec) => process.stdout.write(redact(JSON.stringify({ t: new Date().toISOString(), ...rec })) + '\n')

async function onRequest(req, res) {
  // A request pipelined behind one already refused and closing is not answered.
  if (req.socket?.olaLinger) return req.socket.destroy()
  const started = Date.now()
  const rec = { caller: '-', route: 'other', model: '-', status: 0, why: null, tries: 0, tokens_in: null, tokens_out: null, estimated: null, wait_ms: null, ms: 0 }
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
}
function makeServer(maxConnections) {
  const s = http.createServer(onRequest)
  s.headersTimeout = Math.min(10_000, C.readMs)
  s.requestTimeout = C.readMs // receiving the request; the response has its own timeouts
  s.maxConnections = maxConnections
  s.maxRequestsPerSocket = 1000
  return s
}
const server = makeServer(256)

// ---------------------------------------------------------------- doors and token reloads

const doors = new Map() // caller name -> its http server on <doorDir>/<name>.sock
function syncDoors() {
  if (!C.doorDir) return
  const want = new Set(C.tokens.filter((t) => isDoorName(t.name)).map((t) => t.name))
  for (const [name, s] of doors) {
    if (want.has(name)) continue
    s.close()
    s.closeAllConnections()
    rmSync(join(C.doorDir, `${name}.sock`), { force: true })
    doors.delete(name)
  }
  for (const name of want) {
    if (doors.has(name)) continue
    const file = join(C.doorDir, `${name}.sock`)
    const s = makeServer(64)
    s.olaDoor = name
    s.on('error', (e) => console.error(`gateway: the door socket for ${name} failed (${e.code || e.name})`))
    rmSync(file, { force: true })
    s.listen(file, () => chmodSync(file, 0o600))
    doors.set(name, s)
  }
}

let tokenState = ''
const stateOf = (tokens) => tokens.map((t) => `${t.name}:${t.digest.toString('hex')}`).sort().join(',')
// Reads the callers again (SIGHUP, or the file changed). A file that does not check out is not
// used: the callers already in force stay, and the problems are printed by name, never value.
function reloadTokens(why) {
  const problems = []
  const fresh = readTokens(process.env.GATEWAY_TOKENS, C.tokensFile, (m) => problems.push(m))
  if (problems.length) {
    for (const p of problems) console.error(`tokens: ${p}`)
    process.stdout.write(JSON.stringify({ t: new Date().toISOString(), event: 'tokens', why, ok: false, callers: C.tokens.length }) + '\n')
    return false
  }
  const next = stateOf(fresh)
  if (next === tokenState) return true
  const before = new Set(C.tokens.map((t) => t.name))
  const after = new Set(fresh.map((t) => t.name))
  C.tokens = fresh
  tokenState = next
  for (const n of after) {
    if (!C.quotas.has(n)) C.quotas.set(n, C.weekly)
    queue.addCaller(n)
  }
  queue.prune(after)
  syncDoors()
  process.stdout.write(JSON.stringify({ t: new Date().toISOString(), event: 'tokens', why, ok: true, callers: fresh.length, added: [...after].filter((n) => !before.has(n)).length, removed: [...before].filter((n) => !after.has(n)).length }) + '\n')
  return true
}
tokenState = stateOf(C.tokens)
if (C.doorDir) {
  mkdirSync(C.doorDir, { recursive: true, mode: 0o700 })
  chmodSync(C.doorDir, 0o700)
  syncDoors()
}
process.on('SIGHUP', () => reloadTokens('signal'))
if (C.tokensFile) {
  // A change to the file (ws.mjs replaces it by rename) is picked up at once; a stat every few
  // seconds catches what a watch can miss.
  let soon = null
  const later = () => (clearTimeout(soon), (soon = setTimeout(() => reloadTokens('file'), 100)))
  try {
    watch(dirname(C.tokensFile), (_, f) => (!f || f === basename(C.tokensFile)) && later())
  } catch {}
  let seen = ''
  setInterval(() => {
    let st = ''
    try {
      const x = statSync(C.tokensFile)
      st = `${x.ino}:${x.size}:${x.mtimeMs}`
    } catch {}
    if (st !== seen) (seen = st), later()
  }, 3000).unref()
}

const stop = () => {
  server.close()
  for (const [name, d] of doors) d.close(), rmSync(join(C.doorDir, `${name}.sock`), { force: true })
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
      doors: doors.size,
      tokens_file: !!C.tokensFile,
      limits: { max_body: C.maxBody, max_total_body: C.maxTotalBody, inflight: C.maxInflight, per_caller: C.perCaller, queued_per_caller: C.perCallerQueue, queue_wait_ms: C.maxWait, connect_ms: C.connectMs, first_byte_ms: C.firstByteMs, total_ms: C.totalMs },
    }),
  )
})
