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
import { WEB_SETTINGS, webConfig, makeWeb } from './web.mjs'
import { BATCH_SETTINGS, batchConfig, laneOf, makeBatch } from './batch.mjs'
import { DESIGN_DOWN, DESIGN_MIN_OUTPUT, DESIGN_SETTINGS, WITHHELD, designConfig, isDesignTurn, makeDesign, sessionOf, withNote } from './design.mjs'
import { MODEL_NAMES, NOT_SET, ROUTE_NAME, SPECIALIST_SETTINGS, buildRequest, charge, checkChatContent, rebuild, specialistConfig, withInstructions } from './specialists.mjs'

// ---------------------------------------------------------------- config

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
  // A person's own caller (p-<id>, from GATEWAY_PEOPLE_TOKENS_FILE): their week's tokens, all their
  // devices together. 0: the same as GATEWAY_WEEKLY_TOKENS.
  GATEWAY_PEOPLE_WEEKLY_TOKENS: [0, 0, 1e12],
}
const OTHER_GATEWAY_SETTINGS = ['GATEWAY_TOKENS', 'GATEWAY_TOKENS_FILE', 'GATEWAY_PEOPLE_TOKENS_FILE', 'GATEWAY_PEOPLE_QUOTAS_FILE', 'GATEWAY_DOOR_DIR', 'GATEWAY_MODELS', 'GATEWAY_BACKUP_MODELS', 'GATEWAY_HOST', 'GATEWAY_DB', 'GATEWAY_QUOTAS', 'GATEWAY_USAGE_TOKEN', ...CLAUDE_SETTINGS, ...HOSTED_SETTINGS, ...WEB_SETTINGS, ...BATCH_SETTINGS, ...SPECIALIST_SETTINGS, ...DESIGN_SETTINGS]
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
  // GATEWAY_PEOPLE_TOKENS_FILE: the people who signed in a device (the Mac app, the command line),
  // one caller each, kept by the front desk (frontdesk/devices.mjs). Optional; a missing file is no
  // one yet. A file that does not check out is kept out (its problems printed by name), and the
  // gateway starts all the same: it concerns devices only, never a workspace.
  const peopleFile = env.GATEWAY_PEOPLE_TOKENS_FILE ? resolve(env.GATEWAY_PEOPLE_TOKENS_FILE) : null
  const people = peopleFile ? readPeople(peopleFile, tokens, (m) => console.error(`people: ${m}`)) ?? [] : []
  tokens.push(...people)
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

  // The design model (design.mjs): its default upstream id, and whether the everyday model is local.
  const design = designConfig(env, bad, { models, upstream })

  // GATEWAY_BACKUP_MODELS: "general=upstream id": when the model server keeps refusing a name
  // (5xx after every try), the same request goes once to this model on the same server. Added
  // 2026-11-19 (OLA-206): Together began refusing large prompts to Nemotron 3.5 Super with 503.
  const backups = new Map()
  for (const [i, pair] of (env.GATEWAY_BACKUP_MODELS || '').split(',').filter((x) => x.trim()).entries()) {
    const at = pair.indexOf('=')
    const name = pair.slice(0, at).trim()
    const id = pair.slice(at + 1).trim()
    if (!models.has(name)) { bad(`GATEWAY_BACKUP_MODELS entry ${i + 1}: ${name} is not in GATEWAY_MODELS`); continue }
    // The design model has no backup: when it fails, Ola's own `general` does the work (design.mjs).
    if (name === 'design') { bad('GATEWAY_BACKUP_MODELS: design takes no backup model'); continue }
    if (!/^[\x21-\x7e]{1,200}$/.test(id)) { bad(`GATEWAY_BACKUP_MODELS entry ${i + 1} (${name}): the upstream id must be 1 to 200 printable characters`); continue }
    backups.set(name, id)
  }

  // The specialist names (specialists.mjs): each one's own server, key, limits and lane.
  const sp = specialistConfig(env, bad, { models, defaultBase: env.UPSTREAM_BASE_URL, defaultKey: key })
  for (const s of Object.values(sp.spec)) {
    if (!s.upstreamId || ['general', 'fast', 'code'].includes(s.name)) continue
    if (s.body > num.GATEWAY_MAX_TOTAL_BODY_BYTES) bad(`GATEWAY_LIMITS ${s.name}: its body cap is more than GATEWAY_MAX_TOTAL_BODY_BYTES`)
  }
  if (env.GATEWAY_BATCH_MAX_INFLIGHT && sp.batchMax > num.GATEWAY_MAX_INFLIGHT) bad('GATEWAY_BATCH_MAX_INFLIGHT cannot be more than GATEWAY_MAX_INFLIGHT')
  sp.batchMax = Math.min(sp.batchMax, num.GATEWAY_MAX_INFLIGHT)

  // GATEWAY_QUOTAS: "name=tokens per week" for callers who differ from GATEWAY_WEEKLY_TOKENS
  const peopleWeekly = num.GATEWAY_PEOPLE_WEEKLY_TOKENS || num.GATEWAY_WEEKLY_TOKENS
  const quotas = new Map([...names].map((n) => [n, isPersonName(n) ? peopleWeekly : num.GATEWAY_WEEKLY_TOKENS]))
  const envPeopleQuotas = new Map()
  if (env.GATEWAY_QUOTAS) {
    env.GATEWAY_QUOTAS.split(',').forEach((pair, i) => {
      const [name, raw] = pair.split('=').map((s) => s?.trim())
      // A person's caller may be named before they have signed in a device.
      if (!names.has(name) && !isPersonName(name ?? '')) return bad(`GATEWAY_QUOTAS entry ${i + 1}: not a caller in GATEWAY_TOKENS`)
      if (!/^\d+$/.test(raw || '') || Number(raw) < 1 || Number(raw) > 1e12) return bad(`GATEWAY_QUOTAS entry ${i + 1} (${name}): tokens must be a whole number from 1 to 10^12`)
      quotas.set(name, Number(raw))
      if (isPersonName(name)) envPeopleQuotas.set(name, Number(raw))
    })
  }
  // GATEWAY_PEOPLE_QUOTAS_FILE (default: the people file's name + "-quotas", which the front desk
  // writes beside it): each person's own weekly allowance on Ola, set by the admin (admin.mjs
  // app-allowance). It wins over GATEWAY_QUOTAS and GATEWAY_PEOPLE_WEEKLY_TOKENS for that person,
  // and is read again whenever it changes, like the people file. A file that does not check out is
  // kept out (the allowances in force stay).
  const peopleQuotasFile = env.GATEWAY_PEOPLE_QUOTAS_FILE ? resolve(env.GATEWAY_PEOPLE_QUOTAS_FILE) : peopleFile ? `${peopleFile}-quotas` : null
  const peopleQuotas = peopleQuotasFile ? readPeopleQuotas(peopleQuotasFile, (m) => console.error(`people: ${m}`)) ?? new Map() : new Map()
  for (const [n, q] of peopleQuotas) if (quotas.has(n)) quotas.set(n, q)

  const host = env.GATEWAY_HOST || '127.0.0.1'
  if (!/^[0-9a-z.:-]{1,253}$/i.test(host)) bad('GATEWAY_HOST is not a host name or address')
  const db = resolve(env.GATEWAY_DB || `${homedir()}/.local/state/ola-gateway/usage.db`)
  const textWithCalls = env.TEXT_WITH_CALLS || 'drop'
  if (!['drop', 'keep'].includes(textWithCalls)) bad('TEXT_WITH_CALLS must be drop or keep')
  // Fallback to Claude (claude.mjs): its own upstream, credentials and grants file.
  const claude = claudeConfig(env, bad)
  // Fallback to a hosted open model (hosted.mjs): the model name `hosted`, its own upstream and grants.
  const hosted = hostedConfig(env, bad)
  // Web search and downloads (web.mjs): the provider, the grants file, the fetch limits.
  const web = webConfig(env, bad)
  // Batch jobs (batch.mjs): the job grants file the front desk writes, and the lane's limits.
  const batch = batchConfig(env, bad)

  if (problems.length) {
    for (const p of problems) console.error(`config: ${p}`)
    console.error('the gateway did not start')
    process.exit(1)
  }
  return {
    upstream,
    backups,
    key,
    tokens,
    tokensFile,
    peopleFile,
    people: new Set(people.map((t) => t.name)),
    peopleQuotasFile,
    peopleQuotas,
    envPeopleQuotas,
    doorDir,
    weekly: num.GATEWAY_WEEKLY_TOKENS,
    peopleWeekly,
    usageDigest,
    models,
    quotas,
    host,
    db,
    keepText: textWithCalls === 'keep',
    sp,
    claude,
    hosted,
    design,
    web,
    batch,
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
      // p-<id> is a person's caller, given only by the people file (with its standing web grant).
      if (isPersonName(name)) return bad(`${where} entry ${i + 1}: names p-<number> are for GATEWAY_PEOPLE_TOKENS_FILE only`)
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

/** A person's caller name: p-<their id in the platform database>. */
function isPersonName(name) {
  return /^p-[1-9][0-9]{0,11}$/.test(name)
}

/**
 * The people file (GATEWAY_PEOPLE_TOKENS_FILE): mode 600, one GATEWAY_TOKENS= line like the tokens
 * file, every name p-<number>, no name or token that is also in `others` (the other callers). A
 * missing file is an empty list. On any problem: null, and the problems go to `bad`, by name and
 * entry number, never by value.
 */
function readPeople(file, others, bad) {
  let st = null
  try {
    st = statSync(file)
  } catch {
    return []
  }
  const problems = []
  const no = (m) => problems.push(m)
  if (!st.isFile()) no('GATEWAY_PEOPLE_TOKENS_FILE is not a file')
  else if ((st.mode & 0o077) !== 0) no('GATEWAY_PEOPLE_TOKENS_FILE must be readable by this account only (mode 600)')
  const out = []
  if (!problems.length) {
    const text = readFileSync(file, 'utf8').trim()
    if (!/^GATEWAY_TOKENS=[^\n]*$/.test(text)) no('GATEWAY_PEOPLE_TOKENS_FILE must hold one line, GATEWAY_TOKENS=p-<id>:token,...')
    else {
      const names = new Set(others.map((t) => t.name))
      const digests = new Set(others.map((t) => t.digest.toString('hex')))
      text
        .slice('GATEWAY_TOKENS='.length)
        .split(',')
        .filter((p) => p !== '')
        .forEach((pair, i) => {
          const at = pair.indexOf(':')
          const name = pair.slice(0, at).trim()
          const token = pair.slice(at + 1).trim()
          if (at < 1 || !isPersonName(name)) return no(`GATEWAY_PEOPLE_TOKENS_FILE entry ${i + 1}: every name is p-<number>`)
          if (!TOKEN.test(token)) return no(`GATEWAY_PEOPLE_TOKENS_FILE entry ${i + 1} (${name}): the token must be 24 to 512 printable characters with no space or comma`)
          const digest = sha(token)
          if (names.has(name)) return no(`GATEWAY_PEOPLE_TOKENS_FILE: the name ${name} appears twice`)
          if (digests.has(digest.toString('hex'))) return no(`GATEWAY_PEOPLE_TOKENS_FILE entry ${i + 1} (${name}): this token is already given to another caller`)
          names.add(name)
          digests.add(digest.toString('hex'))
          out.push({ name, digest })
        })
    }
  }
  if (problems.length) {
    for (const p of problems) bad(p)
    return null
  }
  return out
}

/**
 * The people's quotas file: mode 600, one line GATEWAY_QUOTAS=p-<id>=<tokens>,... (tokens a whole
 * number from 0 to 10^12; 0 is no allowance at all). A missing file is no one. On any problem: null,
 * the problems to `bad` by name and entry number.
 */
function readPeopleQuotas(file, bad) {
  let st = null
  try {
    st = statSync(file)
  } catch {
    return new Map()
  }
  if (!st.isFile()) return bad('GATEWAY_PEOPLE_QUOTAS_FILE is not a file'), null
  if ((st.mode & 0o077) !== 0) return bad('GATEWAY_PEOPLE_QUOTAS_FILE must be readable by this account only (mode 600)'), null
  const text = readFileSync(file, 'utf8').trim()
  if (!/^GATEWAY_QUOTAS=[^\n]*$/.test(text)) return bad('GATEWAY_PEOPLE_QUOTAS_FILE must hold one line, GATEWAY_QUOTAS=p-<id>=<tokens>,...'), null
  const out = new Map()
  let ok = true
  text
    .slice('GATEWAY_QUOTAS='.length)
    .split(',')
    .filter((p) => p !== '')
    .forEach((pair, i) => {
      const m = /^(p-[1-9][0-9]{0,11})=(\d{1,13})$/.exec(pair.trim())
      if (!m || Number(m[2]) > 1e12) return (ok = false), bad(`GATEWAY_PEOPLE_QUOTAS_FILE entry ${i + 1}: p-<number>=<tokens from 0 to 10^12>`)
      if (out.has(m[1])) return (ok = false), bad(`GATEWAY_PEOPLE_QUOTAS_FILE: ${m[1]} appears twice`)
      out.set(m[1], Number(m[2]))
    })
  return ok ? out : null
}

/** A person's weekly allowance: their own (the quotas file), else GATEWAY_QUOTAS, else GATEWAY_PEOPLE_WEEKLY_TOKENS. */
function personQuota(name) {
  return C.peopleQuotas.get(name) ?? C.envPeopleQuotas.get(name) ?? C.peopleWeekly
}

/**
 * What a caller is told when the week's tokens are used up, in plain words with the day it
 * starts again (OLA-205): a person's own computer hears "Your", a project's workspace "This
 * project's". The week starts Monday 00:00 UTC, so the time is said in Pacific time, where the
 * Ola machine and its first users are; the apps say the same moment in the reader's own time zone
 * (OlaKit Plain.quotaProblem, web steps.ts quotaProblem). No token counts, no settings.
 */
function quotaWords(who, q) {
  const whose = isPersonName(who) ? 'Your' : "This project's"
  return `${whose} weekly allowance of Ola's model is used up. It starts again on ${resetWords(q.resets_at)}.`
}
/** "Sunday, November 22, at 4 pm Pacific time" for an ISO instant. */
function resetWords(iso) {
  const d = new Date(iso)
  const tz = 'America/Los_Angeles'
  const day = d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' })
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value ?? ''
  const time = `${get('hour')}${get('minute') === '00' ? '' : `:${get('minute')}`} ${get('dayPeriod').toLowerCase()}`
  return `${day}, at ${time} Pacific time`
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
  for (const k of C.sp.keys) if (s.includes(k)) s = s.split(k).join('[redacted]')
  if (claude) s = claude.scrub(s)
  return web ? web.scrub(s) : s
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
const batch = makeBatch({ cfg: C.batch, db })
const design = makeDesign({ cfg: C.design, db })
// A person's own caller (from the people file) answers every web question in their own app, as
// Bart does for the `bart` caller: a standing grant, by where the caller came from, never by a
// name a workspace could hold (readTokens refuses p-* anywhere else).
const web = makeWeb({ cfg: C.web, db, readBody: (req, max) => readBody(req, max), send: (...a) => send(...a), fail: (...a) => fail(...a), standing: (who) => C.people.has(who) })
const readByModel = db.prepare(`SELECT model, requests, tokens_in, tokens_out FROM usage WHERE week = ? AND caller = ? AND model NOT LIKE 'web-%' ORDER BY model`)
const readUsage = db.prepare(`SELECT coalesce(sum(CASE WHEN model IN ('web-search', 'web-fetch', 'web-lookup') THEN 0 ELSE requests END), 0) AS requests, coalesce(sum(tokens_in), 0) AS tokens_in, coalesce(sum(tokens_out), 0) AS tokens_out FROM usage WHERE week = ? AND caller = ?`)

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
    fraction_used: quota > 0 ? Math.round((used / quota) * 10000) / 10000 : 1,
    by_model: Object.fromEntries(readByModel.all(weekKey(start), name).map((r) => [r.model, { requests: r.requests, tokens_in: r.tokens_in, tokens_out: r.tokens_out }])),
  }
}

// ---------------------------------------------------------------- the fair queue
// A request holds one of maxInflight slots while it talks to a model server, and a caller holds at
// most perCaller of them. A request that cannot start waits in its caller's own line; when a slot
// frees, the lines are served round-robin, one request per caller per turn, so a caller with ten
// waiting does not starve a caller with one.
//
// Two lanes. A person waiting in a conversation is "interactive"; a batch job (a request with
// `X-Ola-Lane: batch`, or a name whose lane is batch: read, transcribe, draw) waits in its caller's
// second line, which is served only when no interactive request can start, holds at most batchMax
// slots at once (so a person always finds one), and may wait longer (batchWait). Each specialist
// name also has its own pool (GATEWAY_LIMITS pool=), so a thousand `read` calls cannot fill the
// slots the everyday model needs.

const refusal = (code) => Object.assign(new Error(code), { code })
const newLine = () => ({ inflight: 0, queue: [], batch: [] })

class FairQueue {
  constructor(callers, { max, perCaller, perCallerQueue, maxWait, batchMax = max, batchWait = maxWait, batchQueue = perCallerQueue }) {
    Object.assign(this, { max, perCaller, perCallerQueue, maxWait, batchMax, batchWait, batchQueue })
    this.inflight = 0
    this.batchInflight = 0
    this.lanes = new Map(callers.map((n) => [n, newLine()]))
    this.ring = [...callers]
    this.cursor = 0
  }
  get queued() {
    let n = 0
    for (const l of this.lanes.values()) n += l.queue.length + l.batch.length
    return n
  }
  // A caller added by a token reload gets its own line; a removed one's line goes once empty.
  addCaller(name) {
    if (!this.lanes.has(name)) this.lanes.set(name, newLine()), this.ring.push(name)
    return this.lanes.get(name)
  }
  prune(keep) {
    for (const [n, l] of this.lanes) if (!keep.has(n) && !l.inflight && !l.queue.length && !l.batch.length) this.lanes.delete(n)
    this.ring = this.ring.filter((n) => this.lanes.has(n))
    this.cursor = this.ring.length ? this.cursor % this.ring.length : 0
  }
  // Resolves with a release function once the request may go upstream.
  acquire(name, signal, { batch = false, pool = null } = {}) {
    const lane = this.addCaller(name)
    const line = batch ? lane.batch : lane.queue
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(refusal('aborted'))
      const now = this.inflight < this.max && lane.inflight < this.perCaller && line.length === 0 && (!pool || pool.inflight < pool.max) && (!batch || this.batchInflight < this.batchMax)
      if (!now && line.length >= (batch ? this.batchQueue : this.perCallerQueue)) return reject(refusal('caller_busy'))
      const w = { batch, pool }
      const leave = () => {
        clearTimeout(w.timer)
        signal.removeEventListener('abort', w.onAbort)
      }
      const drop = (code) => {
        const i = line.indexOf(w)
        if (i >= 0) line.splice(i, 1)
        leave()
        reject(refusal(code))
      }
      w.timer = setTimeout(() => drop('wait_timeout'), batch ? this.batchWait : this.maxWait)
      w.onAbort = () => drop('aborted')
      w.grant = (release) => {
        leave()
        resolve(release)
      }
      signal.addEventListener('abort', w.onAbort, { once: true })
      line.push(w)
      this.dispatch()
    })
  }
  // The next request that may start from one kind of line, round-robin between callers.
  pick(kind) {
    for (let i = 0; i < this.ring.length; i++) {
      const at = (this.cursor + i) % this.ring.length
      const l = this.lanes.get(this.ring[at])
      if (!l || !l[kind].length || l.inflight >= this.perCaller) continue
      const k = l[kind].findIndex((w) => !w.pool || w.pool.inflight < w.pool.max)
      if (k < 0) continue
      this.cursor = (at + 1) % this.ring.length
      return { lane: l, w: l[kind].splice(k, 1)[0] }
    }
    return null
  }
  dispatch() {
    while (this.inflight < this.max) {
      const p = this.pick('queue') ?? (this.batchInflight < this.batchMax ? this.pick('batch') : null)
      if (!p) return
      const { lane, w } = p
      lane.inflight++
      this.inflight++
      if (w.batch) this.batchInflight++
      if (w.pool) w.pool.inflight++
      let done = false
      w.grant(() => {
        if (done) return
        done = true
        lane.inflight--
        this.inflight--
        if (w.batch) this.batchInflight--
        if (w.pool) w.pool.inflight--
        this.dispatch()
      })
    }
  }
}
const queue = new FairQueue(C.tokens.map((t) => t.name), { max: C.maxInflight, perCaller: C.perCaller, perCallerQueue: C.perCallerQueue, maxWait: C.maxWait, batchMax: C.sp.batchMax, batchWait: C.sp.batchWait, batchQueue: C.sp.batchQueue })
// One pool per specialist name (its own server on the Studio), and that name's server.
const pools = new Map(Object.values(C.sp.spec).filter((s) => s.pool > 0).map((s) => [s.name, { inflight: 0, max: s.pool }]))
const targets = new Map()
for (const s of Object.values(C.sp.spec)) {
  if (!s.upstreamId) continue
  if (s.kind === 'chat' && !s.base) continue // the everyday model server (C.upstream)
  const base = s.base ?? C.sp.defaultBase.replace(/\/+$/, '')
  const url = new URL(base + (s.kind === 'chat' ? '/chat/completions' : s.path))
  const lib = url.protocol === 'https:' ? https : http
  targets.set(s.name, { url, key: s.base ? s.key : C.key, lib, agent: new lib.Agent({ keepAlive: true, maxSockets: Math.max(2, s.pool + 1) }) })
}
// Requests a minute, per caller and name, for names with a per_minute limit.
const perMinute = new Map()
function tooFast(who, s) {
  if (!s.perMinute) return false
  const k = `${who} ${s.name}`
  const now = Date.now()
  const times = (perMinute.get(k) ?? []).filter((t) => t > now - 60_000)
  perMinute.set(k, times)
  if (times.length >= s.perMinute) return true
  times.push(now)
  return false
}
// The queue's line: batch for a batch job's request (X-Ola-Lane: batch with its X-Ola-Job, admitted
// by batch.mjs) and for a name whose lane is batch (read, transcribe, draw); interactive otherwise.
// Nothing a caller sends can raise a request out of the batch line.
const lineOf = (req, s) => (laneOf(req) || s.lane === 'batch' ? 'batch' : 'interactive')

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
    // A specialist's request arrives already built (specialists.mjs buildRequest): { raw, type }.
    const data = body?.raw ? body.raw : Buffer.from(JSON.stringify(body))
    const type = body?.raw ? body.type : 'application/json'
    const key = target ? target.key : C.key
    let settled = false
    let tFirst
    // The everyday model server, or (model `hosted`) the hosted provider's (hosted.mjs).
    const req = (target ? target.lib : isTls ? https : http).request(target ? target.url : C.upstream, {
      method: 'POST',
      agent: target ? target.agent : agent,
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': type, 'Content-Length': data.length, Accept: 'application/json' },
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
    // The handshake to wait for is the target's own: the hosted provider may be plain http (to 127.0.0.1)
    // beside an https model server, and a plain socket never says secureConnect (2026-11-17).
    const tls = target ? target.url.protocol === 'https:' : isTls
    req.on('socket', (s) => (req.reusedSocket || !s.connecting ? connected() : s.once(tls ? 'secureConnect' : 'connect', connected)))
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
    if (q) return { status: 429, type: 'insufficient_quota', error: quotaWords(q.caller, q), why: 'the weekly quota is used up', headers: { 'Retry-After': secondsUntil(Date.parse(q.resets_at)) } }
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

const ROUTES = { '/v1/chat/completions': 'chat', '/v1/models': 'models', '/v1/usage': 'usage', '/v1/served': 'served', '/anthropic/v1/messages': 'claude', '/anthropic/v1/messages/count_tokens': 'claude_count', '/web/search': 'search', '/web/fetch': 'fetch', '/web/lookup': 'lookup', '/v1/embeddings': 'embed', '/v1/rerank': 'rerank', '/v1/audio/transcriptions': 'transcribe', '/v1/images/generations': 'draw' }
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
    if (who === 'usage') return send(res, 200, { object: 'list', data: C.tokens.map((t) => ({ ...usageOf(t.name), claude_month: claude.monthOf(t.name), ...(hosted ? { hosted_month: hosted.monthOf(t.name) } : {}), web_week: web.weekOf(t.name), batch_job: batch.jobOf(t.name) })), inflight: queue.inflight, queued: queue.queued, claude_modes: claude.modes(), hosted: hosted ? { provider: hosted.provider, prices: C.hosted.prices } : null, claude_prices: C.claude.prices, web: { provider: C.web.provider } })
    // A caller's own: its month on the hosted open model too, and the provider's name, so Ola on a
    // person's Mac can say whether it may hand a request over and to whom (no prices, no other caller).
    return send(res, 200, { ...usageOf(who), claude_month: claude.monthOf(who), web_week: web.weekOf(who), batch_job: batch.jobOf(who), ...(hosted ? { hosted_month: hosted.monthOf(who), hosted: { provider: hosted.provider } } : {}) })
  }
  // Which names served a caller's chat requests since a moment (design.mjs): the usage token for any
  // caller (the front desk, for the record of who made each file), a caller's own token for itself.
  if (rec.route === 'served' && req.method === 'GET') {
    let q
    try {
      q = new URL(req.url, 'http://x').searchParams
    } catch {
      q = new URLSearchParams()
    }
    const caller = who === 'usage' ? q.get('caller') : who
    const since = Number(q.get('since'))
    const session = q.get('session')
    if (!caller || !known(caller) || caller === 'usage' || !Number.isSafeInteger(since) || since < 0 || (session !== null && !/^[A-Za-z0-9_-]{1,80}$/.test(session))) return no(400, 'a served query that does not check out', 'served takes caller (usage token only), since (ms) and an optional session', 'invalid_request_error')
    rec.status = 200
    // steps=1: every step of the caller's conversations since then, in order (the front desk's record).
    return send(res, 200, { object: 'served', caller, session, since, names: design.served(caller, session, since), design_model: C.models.get('design') ?? null, everyday_local: design.local, ...(q.get('steps') === '1' ? { steps: design.steps(caller, since) } : {}) })
  }
  if (who === 'usage') return no(403, 'the usage token only reads usage', 'this token can only read /v1/usage', 'permission_error')
  // Claude Code in the workspace, through Anthropic's Messages API (claude.mjs).
  if (rec.route === 'claude' || rec.route === 'claude_count') return claude.handle(req, res, rec, who, signal)
  // Web search and one-document downloads, only with the project's yes (web.mjs).
  // Scholarly lookup shares the web's approval and limits (web.mjs).
  if (rec.route === 'search' || rec.route === 'fetch' || rec.route === 'lookup') return web.handle(req, res, rec, who, signal)
  if (rec.route === 'models' && req.method === 'GET') {
    rec.status = 200
    return send(res, 200, { object: 'list', data: [...[...C.models.keys()].map((id) => ({ id, object: 'model', owned_by: 'ola', kind: C.sp.spec[id].kind, images: C.sp.spec[id].images > 0 })), ...(hosted ? [{ id: 'hosted', object: 'model', owned_by: 'ola', kind: 'chat', images: false }] : [])] })
  }
  // The specialists that are not chat: embed, rerank, transcribe, draw (one name per route).
  if (ROUTE_NAME[path]) return specialist(req, res, rec, who, signal, ROUTE_NAME[path], no)
  if (rec.route !== 'chat' || req.method !== 'POST') return no(404, 'not found', 'not found', 'invalid_request_error')

  let raw
  try {
    raw = await readBody(req, CHAT_READ_MAX)
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
    // A specialist name that this machine has no server for: one plain sentence, nothing sent.
    if (typeof body.model === 'string' && NOT_SET[body.model] && body.model !== 'hosted') {
      rec.model = body.model
      return no(503, 'no upstream for this name', NOT_SET[body.model], 'not_configured')
    }
    return no(400, 'an unknown model name', `unknown model; this gateway serves: ${[...C.models.keys(), ...(hosted ? ['hosted'] : [])].join(', ')}`, 'invalid_request_error')
  }
  rec.model = body.model
  if (!isHosted && C.sp.spec[body.model].kind !== 'chat') return no(400, 'a name that is not a chat model', `${body.model} is not a chat model; it has its own route`, 'invalid_request_error')
  // The design model (design.mjs): a request after the designer or app-designer skill was loaded in
  // this turn, or one that names `design`, is served by it, if this caller's work may go there; if
  // not (the everyday model is local and the owner kept the hosted model off), `general` does it
  // and Ola is told to say that a stronger design model is available.
  let served = body.model
  let note = null
  if (!isHosted && C.models.has('design') && (body.model === 'design' || (body.model === 'general' && isDesignTurn(body.messages)))) {
    if (design.may(who)) (served = 'design'), (rec.design = 'served')
    else if (C.models.has('general')) (served = 'general'), (note = WITHHELD), (rec.design = 'withheld')
    else return no(403, 'design work may not leave this machine', 'The design model is off for this project. Its owner can turn on the hosted model in Settings.', 'permission_error')
  }
  if (served !== body.model) rec.served = served
  const s = isHosted ? { ...C.sp.spec.general, name: 'hosted', pool: 0, perMinute: 0 } : C.sp.spec[served]
  const cap = bodyCap(s)
  if (raw.length > cap) return no(413, 'the body was over the size cap', `the request is larger than ${cap} bytes`, 'invalid_request_error')
  // The hosted open model: only for a project whose owner turned it on, within its month's budget.
  if (isHosted) {
    const r = hosted.refusal(who, req)
    if (r) return no(r.status, r.why, r.message, r.type)
  }
  if (!Array.isArray(body.messages) || !body.messages.length) return no(400, 'no messages', 'messages must be a non-empty list', 'invalid_request_error')
  // Pictures only as data: URLs, only to a name that takes them; nothing but text and pictures.
  const bad = checkChatContent(body.messages, s)
  if (bad) return no(400, 'a message part that is not allowed', bad, 'invalid_request_error')
  rec.lane = lineOf(req, s)
  if (tooFast(who, s)) return no(429, 'the per-minute limit for this name', `Ola has asked ${s.name} ${s.perMinute} times in the last minute for this project; wait a minute.`, 'rate_limit_error', { 'Retry-After': '60' })

  // Over quota counting what is already committed to the store plus `pending`, the tokens the
  // current request has already spent on earlier tries (not yet written). This is what re-checks
  // on every try and before a queued request starts, so a burst cannot run the whole queue past
  // the limit and a single request cannot keep retrying once its own tries have crossed it.
  const overQuota = (pending = 0) => {
    const u = usageOf(who)
    return u.tokens_used + pending >= u.quota ? u : null
  }
  // A batch job's request (batch.mjs): its own budget instead of the weekly quota, and one request
  // in flight per caller, so a job never holds both of a project's slots.
  const lane = laneOf(req)
  let batchHold = null
  if (lane) {
    rec.lane = 'batch'
    const r = batch.admit(who, lane)
    if (r) {
      rec.status = r.status
      rec.why = r.why
      return send(res, r.status, { error: { message: r.message, type: r.type, ...(r.code ? { code: r.code } : {}) } }, r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : {})
    }
    batchHold = batch.hold(who)
  }
  const before = lane ? null : overQuota()
  if (before) {
    return no(429, 'the weekly quota is used up', quotaWords(who, before), 'insufficient_quota', {
      'Retry-After': secondsUntil(Date.parse(before.resets_at)),
    })
  }

  const queuedAt = Date.now()
  let release
  try {
    release = await queue.acquire(who, signal, { batch: rec.lane === 'batch', pool: pools.get(s.name) ?? null })
  } catch (e) {
    batchHold?.()
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
    const upstreamBody = { model: isHosted ? hosted.model : C.models.get(served), stream: false }
    for (const k of PASS) if (k in body) upstreamBody[k] = body[k]
    if (served === 'design') {
      // Never a small output allowance for the design model (it answers empty when its reasoning uses it up).
      const given = Math.max(Number(body.max_tokens) || 0, Number(body.max_completion_tokens) || 0)
      delete upstreamBody.max_completion_tokens
      upstreamBody.max_tokens = Math.max(given, DESIGN_MIN_OUTPUT)
    }
    // A job's retries are checked against its budget, a conversation's against the weekly quota.
    const jobOver = lane ? (pending) => (batch.over(who, lane, pending) ? { quota: batch.jobOf(who)?.budget ?? 0, resets_at: new Date(Date.now() + 3600_000).toISOString() } : null) : null
    upstreamBody.messages = withNote(withInstructions(served, body.messages), note)
    out = await complete(upstreamBody, offered, signal, Date.now() + C.totalMs, tally, lane ? jobOver : overQuota, isHosted ? hosted.target : (targets.get(served) ?? null))
    if (served === 'design' && out.status !== 200 && out.status !== 499 && out.status !== 429 && C.models.has('general')) {
      // The design model refused or failed: Ola's own everyday model does it, once, never a backup model.
      rec.design = 'failed'
      rec.served = served = 'general'
      upstreamBody.model = C.models.get('general')
      upstreamBody.messages = withNote(withInstructions('general', body.messages), DESIGN_DOWN)
      if ('max_tokens' in body) upstreamBody.max_tokens = body.max_tokens
      else delete upstreamBody.max_tokens
      if ('max_completion_tokens' in body) upstreamBody.max_completion_tokens = body.max_completion_tokens
      out = await complete(upstreamBody, offered, signal, Date.now() + C.totalMs, tally, lane ? jobOver : overQuota, targets.get('general') ?? null)
    }
    const backup = isHosted || rec.design ? null : C.backups?.get(body.model)
    if (out.status !== 200 && backup && /answered 5\d\d/.test(out.why || '')) {
      upstreamBody.model = backup
      rec.backup = backup
      out = await complete(upstreamBody, offered, signal, Date.now() + C.totalMs, tally, lane ? jobOver : overQuota, targets.get(body.model) ?? null)
    }
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
    batchHold?.()
    rec.tries = tally.tries
    rec.tokens_in = tally.in
    rec.tokens_out = tally.out
    rec.estimated = tally.estimated ? 'bytes' : null
    if (tally.tries && lane) batch.record(who, lane, tally.in, tally.out)
    else if (tally.tries) addUsage.run(weekKey(weekStart()), who, rec.design === 'failed' ? 'design' : served, tally.in, tally.out)
    if (isHosted && tally.tries) rec.cost_micro_usd = hosted.record(who, tally.in, tally.out)
    if (tally.tries && !isHosted) design.record(who, sessionOf(req), rec.design === 'failed' ? 'design-failed' : served)
  }
}

// The body cap of a name: the everyday names keep GATEWAY_MAX_BODY_BYTES; a specialist has its own.
const bodyCap = (s) => (['general', 'fast', 'code', 'hosted', 'design'].includes(s.name) ? C.maxBody : s.body)
// The most a chat request may be before its model name is known: the largest cap of a configured name.
const CHAT_READ_MAX = Math.max(C.maxBody, ...Object.values(C.sp.spec).filter((s) => s.upstreamId && s.kind === 'chat').map(bodyCap))

// A specialist that is not chat (embed, rerank, transcribe, draw): the same who, size, quota,
// lane and pool rules as chat, its own request shape (built here, never relayed), its own reply
// rebuild, three tries on a busy or failing server, and its own way of counting the quota.
async function specialist(req, res, rec, who, signal, name, no) {
  const s = C.sp.spec[name]
  rec.model = name
  if (req.method !== 'POST') return no(404, 'not found', 'not found', 'invalid_request_error')
  if (!s.upstreamId) return no(503, 'no upstream for this name', NOT_SET[name], 'not_configured')
  let raw
  try {
    raw = await readBody(req, s.body)
  } catch (e) {
    if (e.code === 'too_large') return no(413, 'the body was over the size cap', `the request is larger than ${s.body} bytes`, 'invalid_request_error', { Connection: 'close' })
    if (e.code === 'too_busy') return no(503, 'too many bodies in memory at once', 'the gateway is receiving too many requests at once; retry shortly', 'overloaded_error', { 'Retry-After': '5', Connection: 'close' })
    rec.status = 499
    rec.why = 'the caller went away'
    return
  }
  if (!known(who)) return no(401, 'unknown caller', 'unknown caller', 'authentication_error', { Connection: 'close' })
  let body
  try {
    body = JSON.parse(raw.toString('utf8'))
  } catch {
    return no(400, 'the request is not JSON', 'the request is not JSON', 'invalid_request_error')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return no(400, 'the request is not a JSON object', 'the request is not a JSON object', 'invalid_request_error')
  if (body.model !== undefined && body.model !== name) return no(400, 'a model name this route does not serve', `this route serves only the model ${name}`, 'invalid_request_error')
  const built = buildRequest(s.kind, body, s.upstreamId)
  if (built.error) return no(400, 'a request this route cannot take', built.error, 'invalid_request_error')
  const overQuota = (pending = 0) => {
    const u = usageOf(who)
    return u.tokens_used + pending >= u.quota ? u : null
  }
  // A batch job's request (batch.mjs): admitted only with the job's grant, counted on its budget.
  const job = laneOf(req)
  let batchHold = null
  if (job) {
    const r = batch.admit(who, job)
    if (r) {
      rec.status = r.status
      rec.why = r.why
      return send(res, r.status, { error: { message: r.message, type: r.type, ...(r.code ? { code: r.code } : {}) } }, r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : {})
    }
    batchHold = batch.hold(who)
  }
  const before = job ? null : overQuota()
  if (before) return no(429, 'the weekly quota is used up', quotaWords(who, before), 'insufficient_quota', { 'Retry-After': secondsUntil(Date.parse(before.resets_at)) })
  rec.lane = lineOf(req, s)
  if (tooFast(who, s)) return no(429, 'the per-minute limit for this name', `Ola has asked ${name} ${s.perMinute} times in the last minute for this project; wait a minute.`, 'rate_limit_error', { 'Retry-After': '60' })
  const queuedAt = Date.now()
  let release
  try {
    release = await queue.acquire(who, signal, { batch: rec.lane === 'batch', pool: pools.get(name) ?? null })
  } catch (e) {
    batchHold?.()
    rec.wait_ms = Date.now() - queuedAt
    if (e.code === 'caller_busy') return no(429, 'the caller has too many requests waiting', 'too many requests at once from this caller; retry shortly', 'rate_limit_error', { 'Retry-After': '5' })
    if (e.code === 'wait_timeout') return no(503, 'the queue wait passed its limit', 'the machine is busy; no free slot in time', 'overloaded_error', { 'Retry-After': '10' })
    rec.status = 499
    rec.why = 'the caller went away'
    return
  }
  rec.wait_ms = Date.now() - queuedAt
  const tally = { in: 0, out: 0, tries: 0, estimated: false }
  const deadline = Date.now() + C.totalMs
  let last = 'no attempt made'
  let lastStatus = 502
  try {
    for (let attempt = 1; attempt <= TRIES; attempt++) {
      if (attempt > 1 && (job ? batch.over(who, job, tally.in + tally.out) : overQuota(tally.in + tally.out))) return no(429, 'the weekly quota is used up', job ? "this week's quota is used up" : quotaWords(who, usageOf(who)), 'insufficient_quota')
      tally.tries = attempt
      let r
      try {
        r = await post({ raw: built.data, type: built.type }, signal, deadline, targets.get(name))
      } catch (e) {
        if (e.code === 'aborted') return void ((rec.status = 499), (rec.why = 'the caller went away'))
        if (e.code === 'total_timeout' || e.code === 'first_byte_timeout') return no(504, `the ${e.code === 'total_timeout' ? 'total' : 'first-byte'} timeout passed`, 'the model server took longer than the gateway allows', 'upstream_error')
        if (e.code === 'reply_too_large') return no(502, 'the reply was over the size cap', 'the model server sent a reply larger than the gateway accepts', 'upstream_error')
        last = e.code === 'connect_timeout' ? 'the model server did not accept a connection in time' : 'the model server could not be reached'
        lastStatus = e.code === 'connect_timeout' ? 504 : 502
        if (attempt < TRIES) await pause(400 * attempt, signal)
        continue
      }
      let json = null
      try {
        json = JSON.parse(r.text)
      } catch {}
      if (r.status === 429 || r.status >= 500) {
        last = `the model server answered ${r.status}`
        lastStatus = 502
        if (attempt < TRIES) await pause(400 * attempt, signal)
        continue
      }
      if (r.status < 200 || r.status > 299) {
        const status = r.status === 401 || r.status === 403 ? 502 : r.status >= 400 && r.status <= 499 ? r.status : 502
        return no(status, `the model server answered ${r.status}`, upstreamMessage(r.status), 'upstream_error')
      }
      // Charged on every try that came back: a reply the gateway refuses was still work done.
      const c = charge(s.kind, json, built.info)
      tally.in += c.in
      tally.out += c.out
      tally.estimated ||= c.estimated
      const clean = rebuild(s.kind, json, name, built.info)
      if (!clean) {
        last = 'the model server sent a reply the gateway cannot use'
        lastStatus = 502
        continue
      }
      rec.status = 200
      return send(res, 200, clean)
    }
    return no(lastStatus, `${last}, ${TRIES} times`, `${last}, ${TRIES} times`, 'upstream_error')
  } finally {
    release()
    batchHold?.()
    rec.tries = tally.tries
    rec.tokens_in = tally.in
    rec.tokens_out = tally.out
    rec.estimated = tally.estimated ? 'fixed' : null
    if (tally.tries && job) batch.record(who, job, tally.in, tally.out)
    else if (tally.tries) addUsage.run(weekKey(weekStart()), who, name, tally.in, tally.out)
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
  const rec = { caller: '-', route: 'other', model: '-', lane: null, status: 0, why: null, tries: 0, tokens_in: null, tokens_out: null, estimated: null, wait_ms: null, ms: 0 }
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
// Requests being answered on any of the gateway's servers, for a stop that lets them finish.
let answering = 0
function makeServer(maxConnections) {
  const s = http.createServer(onRequest)
  s.on('request', (_req, res) => (answering++, res.on('close', () => answering--)))
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
// The two files are judged apart: a people file that does not check out keeps its own callers in
// force and never holds back a workspace's new or revoked token (and the other way round).
/** Reads the people's quotas file again; a file that does not check out keeps the allowances in force. */
function reloadPeopleQuotas() {
  if (!C.peopleQuotasFile) return true
  const problems = []
  const next = readPeopleQuotas(C.peopleQuotasFile, (m) => problems.push(m))
  for (const p of problems) console.error(`people: ${p}`)
  if (next) C.peopleQuotas = next
  for (const n of C.people) C.quotas.set(n, personQuota(n))
  return !!next
}

function reloadTokens(why) {
  reloadPeopleQuotas()
  const problems = []
  const peopleProblems = []
  const main = readTokens(process.env.GATEWAY_TOKENS, C.tokensFile, (m) => problems.push(m))
  const mainOk = !problems.length
  const others = mainOk ? main : C.tokens.filter((t) => !C.people.has(t.name))
  let people = C.peopleFile ? readPeople(C.peopleFile, others, (m) => peopleProblems.push(m)) : []
  // Kept out: the people in force stay, less any whose token a workspace now holds.
  if (people === null) people = C.tokens.filter((t) => C.people.has(t.name) && !others.some((o) => o.digest.equals(t.digest) || o.name === t.name))
  for (const p of problems) console.error(`tokens: ${p}`)
  for (const p of peopleProblems) console.error(`people: ${p}`)
  const fresh = [...others, ...people]
  const ok = mainOk && !peopleProblems.length
  const next = stateOf(fresh)
  if (next === tokenState) {
    if (!ok) process.stdout.write(JSON.stringify({ t: new Date().toISOString(), event: 'tokens', why, ok: false, tokens_file: mainOk, people_file: !peopleProblems.length, callers: C.tokens.length }) + '\n')
    return ok
  }
  const before = new Set(C.tokens.map((t) => t.name))
  const after = new Set(fresh.map((t) => t.name))
  C.tokens = fresh
  C.people = new Set(people.map((t) => t.name))
  tokenState = next
  for (const n of after) {
    if (C.people.has(n)) C.quotas.set(n, personQuota(n))
    else if (!C.quotas.has(n)) C.quotas.set(n, C.weekly)
    queue.addCaller(n)
  }
  queue.prune(after)
  syncDoors()
  process.stdout.write(JSON.stringify({ t: new Date().toISOString(), event: 'tokens', why, ok, ...(ok ? {} : { tokens_file: mainOk, people_file: !peopleProblems.length }), callers: fresh.length, people: people.length, added: [...after].filter((n) => !before.has(n)).length, removed: [...before].filter((n) => !after.has(n)).length }) + '\n')
  return ok
}
tokenState = stateOf(C.tokens)
if (C.doorDir) {
  mkdirSync(C.doorDir, { recursive: true, mode: 0o700 })
  chmodSync(C.doorDir, 0o700)
  syncDoors()
}
process.on('SIGHUP', () => reloadTokens('signal'))
{
  // A change to either file (ws.mjs and the front desk replace theirs by rename) is picked up at
  // once; a stat every few seconds catches what a watch can miss.
  const files = [C.tokensFile, C.peopleFile, C.peopleQuotasFile].filter(Boolean)
  let soon = null
  const later = () => (clearTimeout(soon), (soon = setTimeout(() => reloadTokens('file'), 100)))
  for (const dir of new Set(files.map((f) => dirname(f)))) {
    try {
      watch(dir, (_, f) => (!f || files.some((x) => dirname(x) === dir && basename(x) === f)) && later())
    } catch {}
  }
  const seen = new Map()
  if (files.length)
    setInterval(() => {
      for (const file of files) {
        let st = ''
        try {
          const x = statSync(file)
          st = `${x.ino}:${x.size}:${x.mtimeMs}`
        } catch {}
        if (st !== (seen.get(file) ?? '')) seen.set(file, st), later()
      }
    }, 3000).unref()
}

// launchd's stop (a deploy restarts the gateway only when its code changed, OLA-94): no new
// connection is taken (a door waits for the next gateway's socket, workspace/door.mjs), and the
// requests in flight get up to 5 s to finish.
let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  server.close()
  for (const [name, d] of doors) d.close(), rmSync(join(C.doorDir, `${name}.sock`), { force: true })
  const until = Date.now() + 5_000
  const done = () => {
    if (answering > 0 && Date.now() < until) return setTimeout(done, 25)
    try {
      db.close()
    } catch {}
    process.exit(0)
  }
  done()
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)

server.listen(C.port, C.host, () => {
  console.log(JSON.stringify({ t: new Date().toISOString(), event: 'specialists', configured: [...C.models.keys()].filter((n) => !['general', 'fast', 'code'].includes(n)), own_servers: [...targets.keys()], batch_inflight: C.sp.batchMax, batch_wait_ms: C.sp.batchWait }))
  console.log(JSON.stringify({ t: new Date().toISOString(), event: 'people', file: !!C.peopleFile, callers: C.people.size, weekly: C.peopleWeekly }))
  console.log(JSON.stringify({ t: new Date().toISOString(), event: 'web', provider: C.web.provider, grants_file: !!C.web.file, weekly: C.web.weekly, per_minute: C.web.perMinute, test_hosts: C.web.testHosts.size }))
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
