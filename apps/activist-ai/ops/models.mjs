#!/usr/bin/env node
// The model check (OLA-214): every model Ola depends on gets one real-size request, the size of a
// real conversation's first step with Ola's tools defined, through the machine's own model
// connection (the gateway, 127.0.0.1) as its own made-up caller, `probe`. A model that refuses
// (a 4xx or 5xx from its provider, a 429, an empty answer three times, no answer in time) two
// passes in a row puts one line on the board: which model, since when, and the provider's words.
// It never texts (Bart's rule: texts are only for what he must act on now). The next pass that
// works clears it.
//
// Why: on Nov 19 Together refused every real-size request to Nemotron for about a day while small
// test requests went through, and nothing noticed (OLA-206). Other ways a model failed for real
// requests only: an output allowance too small with reasoning on, a model "launching soon", an
// account's allowance used up.
//
// It runs inside the alarm (ops/watch.mjs, every 2 minutes); each model is tried when it is due
// (EVERY below, per name: the everyday model every 15 minutes, dearer ones less often, so a day
// costs under 50 cents at Together's prices; `node ops/models.mjs cost` prints the day from the
// last measured pass). After a failure the model is tried again RETRY_MIN later whatever its
// interval, so two in a row take at most 15 minutes past the first.
//
//   node ops/models.mjs              one pass now: every model, due or not; prints each result
//   node ops/models.mjs show         the last results
//   node ops/models.mjs cost         one day of passes at the measured sizes and Together's prices
//
// The caller's token is ~/.ola/gateway-probe (made here on first use, mode 600; the gateway reads
// it within seconds, GATEWAY_PROBE_FILE). It has its own weekly allowance in the gateway
// (GATEWAY_PROBE_WEEKLY_TOKENS), so it can never use up a person's or a project's. The token is
// never printed. The requests are made up: no person's or project's words go anywhere.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OLA = process.env.OLA_HOME || path.join(homedir(), '.ola')

export const MODEL_DEFAULTS = {
  // Minutes between passes, per gateway name (* for the rest). Sized by cost, measured live on Nov 20
  // (README, "The model check"): one real-size try costs 0.18 cents on Nemotron (general), 0.13 on
  // Muse Glimmer (the specialists), 0.26 on gpt-oss-120b (its backup, 1,700 tokens of reasoning),
  // 0.38 on Inkling-2-Small (design), 1.55 on GLM-5.3 (hosted): $0.40 a day at these intervals.
  // At every 15 minutes the five would cost $2.40 a day.
  MODELS_EVERY: 'general=15,fast=15,code=15,*=30,backup:general=60,design=120,hosted=360',
  MODELS_RETRY_MIN: 15,
  MODELS_TIMEOUT_S: 90,
  MODELS_CONCURRENCY: 2,
  // The size of a real first step: 11,600 tokens in on Nov 20 (the gateway's log, median of the
  // design turns' first requests; general's p10 to p50 was 8,300 to 11,600). Characters of system
  // prompt around AGENTS.md; calibrated so the reply's prompt_tokens comes out near that.
  MODELS_AGENT_CHARS: 44500,
  // A specialist's request (see, read, translate ...): 2,700 tokens in (the log's median for see).
  MODELS_READER_CHARS: 12500,
  MODELS_TOKEN_FILE: path.join(OLA, 'gateway-probe'),
  MODELS_STATE: path.join(OLA, 'models-state.json'),
}

// Together's list prices, $ per million tokens, read from api.together.xyz/v1/models on 2026-11-20.
// A model not listed here is priced at the dearest one (an upper bound).
export const PRICES = {
  'nvidia/NVIDIA-Nemotron-3.5-Super-VL': { in: 0.15, out: 0.5 },
  'openai/gpt-oss-120b': { in: 0.15, out: 0.6 },
  'thinkingmachines/Inkling-2-Small': { in: 0.3, out: 1.0 },
  'meta-models/Muse-Glimmer-30B': { in: 0.35, out: 1.5 },
  'zai-org/GLM-5.3': { in: 1.4, out: 4.4 },
}
const DEAREST = { in: 1.4, out: 4.4 }
export const DAY_BUDGET_USD = 0.5

// Which names are asked like the agent (a tool call expected) and which like a specialist (text).
const AGENT_NAMES = ['general', 'fast', 'code', 'design', 'hosted']
const ORDER = ['general', 'fast', 'code', 'design', 'see', 'read', 'translate', 'ocr', 'route']

// ---------------------------------------------------------------- the requests (made up)
const TOOLS = [
  ['bash', 'Run a shell command in the project folder and return its output. Use it for listing, searching and running scripts.', { command: { type: 'string', description: 'The command to run' }, description: { type: 'string', description: 'What it does, in five to ten words' }, timeout: { type: 'number', description: 'Milliseconds before it is stopped' } }, ['command', 'description']],
  ['read', 'Read a file from the project. Returns its lines with numbers. Use offset and limit for long files.', { filePath: { type: 'string', description: 'The path of the file to read' }, offset: { type: 'number' }, limit: { type: 'number' } }, ['filePath']],
  ['write', 'Write a file in the project, replacing it if it exists.', { filePath: { type: 'string' }, content: { type: 'string' } }, ['filePath', 'content']],
  ['edit', 'Replace one exact string in a file with another.', { filePath: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' }, replaceAll: { type: 'boolean' } }, ['filePath', 'oldString', 'newString']],
  ['glob', 'Find files by a name pattern like **/*.csv.', { pattern: { type: 'string' }, path: { type: 'string' } }, ['pattern']],
  ['grep', 'Search file contents with a regular expression.', { pattern: { type: 'string' }, path: { type: 'string' }, include: { type: 'string' } }, ['pattern']],
  ['list', 'List the files and folders in a folder.', { path: { type: 'string' } }, []],
  ['todowrite', 'Keep a short list of the steps of the current task and their state.', { todos: { type: 'array', items: { type: 'object', properties: { content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] } }, required: ['content', 'status'] } } }, ['todos']],
  ['skill', 'Load one of the skills listed in the instructions by its id.', { id: { type: 'string' } }, ['id']],
  ['webfetch', 'Fetch one web page through the machine (only with the project\'s yes).', { url: { type: 'string' }, format: { type: 'string', enum: ['text', 'markdown', 'html'] } }, ['url']],
].map(([name, description, properties, required]) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } }))
const TOOL_NAMES = new Set(TOOLS.map((t) => t.function.name))

// A made-up project and its notes, repeated to the size of a real step. Nothing in it is anyone's.
const BASE = `You are Ola, an AI agent that works in one project folder for a community group. You use the tools to look at files, run commands and make what the person asks: tables, charts, documents and pages. Work step by step. Before you change a file, read it. Say what you did in short plain sentences.\n\n# Environment\nWorking directory: /work\nPlatform: linux\nThe folder holds the project's files. There is no network; web requests go through the machine and only with the project's yes.\n\n`
const NOTES = `## Made-up project notes (Riverside Tenants Group, a test project)\nThe group meets on the second Tuesday of each month at the library on Elm Street. Minutes are kept in minutes/ as one file per meeting. The member list is members.csv with columns name, building, unit, joined. Repairs are logged in repairs.csv with columns building, unit, issue, reported, fixed. The newsletter goes out on the first of the month and is drafted in newsletter/draft.md. Questions about rent go to the housing committee; questions about repairs to the repairs committee. Keep names out of anything published.\n`
let agentText = null
function agentPrompt(chars) {
  if (agentText?.chars === chars) return agentText.text
  let agents = ''
  try {
    agents = readFileSync(path.join(HERE, '../workspace/AGENTS.md'), 'utf8')
  } catch {}
  let text = BASE + (agents ? `# Instructions from AGENTS.md\n${agents}\n\n` : '')
  while (text.length < chars) text += NOTES
  agentText = { chars, text: text.slice(0, Math.max(chars, BASE.length)) }
  return agentText.text
}
function readerDoc(chars) {
  const lines = []
  for (let i = 1; lines.join('\n').length < chars; i++) lines.push(`Item ${i}. ${NOTES.split('\n')[1 + (i % 6)] || NOTES}`)
  return lines.join('\n').slice(0, chars)
}

/** The request for one target: an agent's first step, or a specialist's real-size question. */
export function requestFor(t, S) {
  if (t.shape === 'agent') {
    return {
      model: t.via,
      max_tokens: 32000,
      tools: TOOLS,
      tool_choice: 'auto',
      messages: [
        { role: 'system', content: agentPrompt(S.MODELS_AGENT_CHARS) },
        { role: 'user', content: `How many members joined this year? Look at members.csv first. (check ${new Date().toISOString().slice(0, 16)})` },
      ],
    }
  }
  return {
    model: t.via,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: 'You read documents and answer questions about them in one or two sentences.' },
      { role: 'user', content: `${readerDoc(S.MODELS_READER_CHARS)}\n\nWhere does the group meet? Answer in one sentence.` },
    ],
  }
}

/** Did the reply work? A well-formed tool call or text, not a refusal; null when it did. */
export function judgeReply(json, shape) {
  const ch = json?.choices?.[0]
  const m = ch?.message
  if (!m) return 'an answer with no message'
  if (ch.finish_reason === 'content_filter') return 'the provider refused the request (content filter)'
  const calls = Array.isArray(m.tool_calls) ? m.tool_calls : []
  for (const c of calls) {
    if (shape === 'agent' && !TOOL_NAMES.has(c?.function?.name)) return 'a call to a tool that was not offered'
    try {
      const a = JSON.parse(c?.function?.arguments || '{}')
      if (!a || typeof a !== 'object') return 'tool arguments that are not an object'
    } catch {
      return 'tool arguments that are not JSON'
    }
  }
  if (!calls.length && !(typeof m.content === 'string' && m.content.trim())) return 'an empty answer'
  return null
}

// ---------------------------------------------------------------- the plan: one try per model
/** The models to try, from the gateway's own list: one per upstream model, through its first name. */
export function plan(list) {
  const chat = list.filter((m) => m.kind === 'chat' && typeof m.upstream === 'string' && m.upstream && m.upstream !== 'off')
  const rank = (id) => {
    const i = ORDER.indexOf(id)
    return id.startsWith('backup:') ? 50 : id === 'hosted' ? 60 : i < 0 ? 40 : i
  }
  const byKey = new Map()
  for (const m of [...chat].sort((a, b) => rank(a.id) - rank(b.id))) {
    // The hosted slot is another provider's account: its own entry even for an id used elsewhere.
    const key = m.id === 'hosted' ? `hosted:${m.upstream}` : m.upstream
    const t = byKey.get(key)
    const name = m.backup_of ? `backup of ${m.backup_of}` : m.id
    if (t) t.names.push(name)
    else byKey.set(key, { key, upstream: m.upstream, via: m.id, names: [name], shape: AGENT_NAMES.includes(m.id) || m.backup_of ? 'agent' : 'reader', provider: m.provider ?? null })
  }
  return { targets: [...byKey.values()], skipped: list.filter((m) => m.kind !== 'chat').map((m) => m.id) }
}

export function everyFor(S, via) {
  const map = Object.fromEntries(String(S.MODELS_EVERY).split(',').map((p) => p.split('=').map((s) => s.trim())).filter(([k, v]) => k && Number(v) > 0).map(([k, v]) => [k, Number(v)]))
  return map[via] ?? map['*'] ?? 15
}

// ---------------------------------------------------------------- talking to the gateway
/** The probe's token: read, or made once (mode 600). Never printed. */
export function probeToken(file, { make = true } = {}) {
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  if (!make) return null
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, randomBytes(24).toString('hex') + '\n', { mode: 0o600 })
  renameSync(tmp, file)
  return readFileSync(file, 'utf8').trim()
}

async function ask(S, token, p, body, timeoutS) {
  const t0 = Date.now()
  try {
    const res = await fetch(`http://127.0.0.1:${S.GW_PORT}${p}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'ola-model-check' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutS * 1000),
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: res.status, json, ms: Date.now() - t0 }
  } catch (e) {
    const timeout = e.name === 'TimeoutError' || e.name === 'AbortError'
    return { status: 0, error: timeout ? `no answer within ${timeoutS} s` : `could not reach the model connection (${e.cause?.code || e.name})`, timeout, ms: Date.now() - t0 }
  }
}

/** One try of one model: { ok, status, said, ms, tokensIn, tokensOut, own } (own: the probe's own allowance). */
export async function tryOne(S, token, t) {
  const r = await ask(S, token, '/v1/chat/completions', requestFor(t, S), S.MODELS_TIMEOUT_S)
  const base = { status: r.status, ms: r.ms, tokensIn: r.json?.usage?.prompt_tokens ?? null, tokensOut: r.json?.usage?.completion_tokens ?? null }
  if (r.status === 0) return { ...base, ok: false, said: r.error }
  if (r.status === 200) {
    const wrong = judgeReply(r.json, t.shape)
    return wrong ? { ...base, ok: false, said: wrong } : { ...base, ok: true, said: null, kind: r.json.choices[0].message.tool_calls?.length ? 'tool call' : 'text' }
  }
  const e = r.json?.error ?? {}
  // The gateway's own 429 for this caller's week is about the check, not the model.
  if (r.status === 429 && e.type === 'insufficient_quota') return { ...base, ok: null, own: true, said: "the model check's own weekly allowance is used up" }
  const said = [e.provider_said, e.message].filter((x) => typeof x === 'string' && x).join(' / ')
  return { ...base, ok: false, said: said || `answered ${r.status}` }
}

// ---------------------------------------------------------------- state
export function loadModels(S) {
  try {
    return JSON.parse(readFileSync(S.MODELS_STATE, 'utf8'))
  } catch {
    return { models: {} }
  }
}
function saveModels(S, st) {
  mkdirSync(path.dirname(S.MODELS_STATE), { recursive: true, mode: 0o700 })
  const tmp = `${S.MODELS_STATE}.tmp`
  writeFileSync(tmp, JSON.stringify(st, null, 2) + '\n', { mode: 0o600 })
  renameSync(tmp, S.MODELS_STATE)
}

const clean = (s, redact) => (redact ? redact(String(s)) : String(s)).replace(/\s+/g, ' ').trim().slice(0, 240)

/**
 * One pass: list the models, try each that is due (all with `all`), record. `dry` reads the last
 * record only and sends nothing. `redact` cleans the provider's words before they are kept.
 * Returns the record.
 */
export async function runModels(S, now, { dry = false, all = false, redact = null } = {}) {
  const st = loadModels(S)
  st.models ??= {}
  if (dry) return st
  const token = probeToken(S.MODELS_TOKEN_FILE)
  const list = await ask(S, token, '/v1/models', null, 15)
  if (list.status !== 200 || !Array.isArray(list.json?.data)) {
    // 401 right after the token file was made: the gateway reads it within seconds; next run.
    st.list = { at: new Date(now).toISOString(), ok: false, why: list.status === 401 ? 'the model connection does not know the check yet' : list.error || `the list answered ${list.status}` }
    saveModels(S, st)
    return st
  }
  st.list = { at: new Date(now).toISOString(), ok: true }
  const { targets, skipped } = plan(list.json.data)
  st.skipped = skipped
  // Models no longer served are forgotten (and so is any alarm about them).
  for (const k of Object.keys(st.models)) if (!targets.some((t) => t.key === k)) delete st.models[k]
  const due = targets.filter((t) => {
    const m = st.models[t.key]
    if (all || !m?.at) return true
    const gap = m.ok === false ? S.MODELS_RETRY_MIN : everyFor(S, t.via)
    return now - Date.parse(m.at) >= gap * 60_000 - 30_000 // a run 2 minutes apart lands a few seconds early
  })
  const queue = [...due]
  let sawOwn = false
  const work = async () => {
    for (let t; (t = queue.shift()); ) {
      const r = await tryOne(S, token, t)
      const prev = st.models[t.key] ?? {}
      const at = new Date(now).toISOString()
      const m = { ...prev, key: t.key, upstream: t.upstream, via: t.via, names: t.names, shape: t.shape, provider: t.provider, every: everyFor(S, t.via), at, status: r.status, ms: r.ms, tokensIn: r.tokensIn ?? prev.tokensIn ?? null, tokensOut: r.tokensOut ?? prev.tokensOut ?? null }
      if (r.own) {
        // Not the model's fault: the alarm about the check itself, the model's record unchanged.
        sawOwn = true
        st.own = { at, said: r.said }
        st.models[t.key] = { ...prev, ...m, at: prev.at ?? at }
        continue
      }
      if (r.ok) {
        Object.assign(m, { ok: true, fails: 0, since: null, said: null, okAt: at, kind: r.kind })
        if (r.tokensIn !== null) Object.assign(m, { okTokensIn: r.tokensIn, okTokensOut: r.tokensOut })
      } else Object.assign(m, { ok: false, fails: (prev.ok === false ? prev.fails ?? 1 : 0) + 1, since: prev.ok === false ? prev.since ?? at : at, said: clean(r.said, redact) })
      st.models[t.key] = m
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Number(S.MODELS_CONCURRENCY) || 1) }, work))
  if (due.length && !sawOwn) delete st.own
  st.at = new Date(now).toISOString()
  saveModels(S, st)
  return st
}

// ---------------------------------------------------------------- what the alarm makes of it
const when = (S, t) => new Intl.DateTimeFormat('en-US', { timeZone: S.TZ || 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t)).replace(' AM', ' am').replace(' PM', ' pm')

/**
 * The alarm's conditions from the record: a model that failed two passes in a row is in alarm
 * (shown on the board and in the watch's record, never texted: `quiet`); one that works is a line
 * of detail. Never the words "model connection" (the board drops such a line while that part
 * answers). Item 8 of the README's "When something breaks".
 */
export function modelConditions(S, st, two = 2) {
  const c = []
  for (const m of Object.values(st.models ?? {})) {
    const slug = m.key.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60)
    const what = `${m.upstream} (${m.names.join(', ')})`
    if (m.ok === false && (m.fails ?? 0) >= two) c.push({ id: `model-${slug}`, item: 8, level: 'alarm', quiet: true, say: `Ola's model ${what} has refused real-size requests since ${when(S, m.since)}, ${m.fails} checks in a row: "${m.said}"`, detail: `model ${m.via} FAILING x${m.fails} (${m.status || '-'})` })
    else c.push({ id: `model-${slug}`, item: 8, level: 'ok', detail: m.ok === false ? `model ${m.via} failed once (${m.status || '-'})` : m.ok ? `model ${m.via} ok ${Math.round((m.ms ?? 0) / 100) / 10} s` : null })
  }
  if (st.own) c.push({ id: 'model-check-allowance', item: 8, level: 'warn', quiet: true, note: st.own.said, detail: 'model check: its own allowance is used up' })
  if (st.list && !st.list.ok) c.push({ id: 'model-check', item: 8, level: 'warn', quiet: true, note: `the model check could not run (${st.list.why})`, detail: `model check: ${st.list.why}` })
  return c
}

// ---------------------------------------------------------------- cost
/** One day of passes at each model's last measured size, at its price and interval. */
export function dayCost(S, st) {
  const rows = Object.values(st.models ?? {}).map((m) => {
    const p = PRICES[m.upstream] ?? DEAREST
    const tin = m.okTokensIn ?? m.tokensIn ?? 0
    const tout = m.okTokensOut ?? m.tokensOut ?? 0
    const one = (tin * p.in + tout * p.out) / 1e6
    const perDay = Math.round((24 * 60) / (m.every || 15))
    return { model: m.upstream, names: m.names.join(', '), every: m.every, perDay, tokensIn: tin, tokensOut: tout, one, day: one * perDay, priced: !!PRICES[m.upstream] }
  })
  return { rows, total: rows.reduce((s, r) => s + r.day, 0) }
}

// ---------------------------------------------------------------- the command
const isMain = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
// Not awaited at the top: watch.mjs imports this file, and a top-level await here would wait on itself.
if (isMain) import('./watch.mjs').then(main)
async function main({ settings, redact }) {
  const S = settings()
  const cmd = process.argv[2]
  try {
    if (cmd === 'show') console.log(JSON.stringify(loadModels(S), null, 2))
    else if (cmd === 'cost') {
      const { rows, total } = dayCost(S, loadModels(S))
      for (const r of rows) console.log(`${r.model} (${r.names}): every ${r.every} min = ${r.perDay} a day x ${r.tokensIn} in + ${r.tokensOut} out = $${r.one.toFixed(5)} each, $${r.day.toFixed(3)} a day${r.priced ? '' : ' (no list price here: priced at the dearest)'}`)
      console.log(`one day of the model check: $${total.toFixed(3)} (budget $${DAY_BUDGET_USD.toFixed(2)})`)
      process.exitCode = total <= DAY_BUDGET_USD ? 0 : 1
    } else {
      const st = await runModels(S, Date.now(), { all: true, redact })
      if (st.list && !st.list.ok) console.log(`could not list the models: ${st.list.why}`)
      for (const m of Object.values(st.models)) console.log(`${m.ok ? 'ok  ' : m.ok === false ? 'FAIL' : '--  '} ${m.upstream} via ${m.via} (${m.names.join(', ')}): ${m.status} in ${m.ms} ms, ${m.tokensIn ?? '?'} in / ${m.tokensOut ?? '?'} out${m.ok ? `, ${m.kind}` : m.said ? `: ${m.said}` : ''}`)
      if (st.skipped?.length) console.log(`not tried (not chat models): ${st.skipped.join(', ')}`)
      if (st.own) console.log(st.own.said)
      process.exitCode = Object.values(st.models).every((m) => m.ok) && st.list?.ok ? 0 : 1
    }
  } catch (e) {
    console.error(`models: ${e.message}`)
    process.exitCode = 1
  }
}
