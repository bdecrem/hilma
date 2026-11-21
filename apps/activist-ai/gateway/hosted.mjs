// Fallback to a hosted open model: the gateway's model name `hosted`, served by a second
// OpenAI-compatible upstream (an outside company), for projects whose owner turned it on.
//
// The same opencode in the same sealed VM asks for model `hosted` through its door like any other;
// the caller's model string never goes upstream (HOSTED_MODEL does), and the same request-field
// allowlist and reply rebuild apply. What differs: the upstream and its key (HOSTED_BASE_URL,
// HOSTED_API_KEY), a per-project grant read from GATEWAY_HOSTED_FILE (mode 600, written by the
// front desk: { "ws-<id>": { "cap_micro_usd": n, "until": ms? } }, reloaded within 2 s; a caller not
// listed is refused with a plain sentence; an entry with `until` is a one-time grant, for one run
// the owner handed over without turning the setting on: honored until that moment (epoch ms) even
// if the front desk never takes it back, and the front desk takes it back when the run ends), and
// a monthly dollar ceiling per project (token counts times
// GATEWAY_HOSTED_PRICES, $/MTok, default in=2,out=2; set them to the provider's list prices).
//
//   HOSTED_BASE_URL       e.g. https://api.together.xyz/v1 (https; plain http only to 127.0.0.1)
//   HOSTED_API_KEY        the provider's key (never logged; scrubbed from replies and the log)
//   HOSTED_MODEL          the provider's model id
//   HOSTED_PROVIDER       the provider's name as people read it ("Together AI")
//   GATEWAY_HOSTED_FILE   the grants file the front desk writes
//   GATEWAY_HOSTED_PRICES in=,out= dollars per million tokens
//
// Picked choices (OLA-337): other outside open models at the same provider, each under its own
// gateway name, served only to a caller that names it, which happens only when a person picks it
// ("Try again with" or the choice in the box, in the Mac app). The same key, the same grants, the
// same monthly record and ceiling as `hosted`, each at its own prices. Never a backup, never the
// design model, never a batch job's model, never a default: the config refuses a picked model id
// that GATEWAY_MODELS, GATEWAY_BACKUP_MODELS or HOSTED_MODEL also names (server.mjs).
//   HOSTED_DEEPSEEK_MODEL   the provider's id for DeepSeek V4 Pro (Together: deepseek-ai/DeepSeek-V4-Pro-0813)
//   HOSTED_DEEPSEEK_PRICES  in=,out= dollars per million tokens (Together: in=1.32,out=3.96)
import http from 'node:http'
import https from 'node:https'
import { ANY_CALLER, jobKeyOf, readGrants, runnerKeyOk } from './batch.mjs'

export const HOSTED_SETTINGS = ['GATEWAY_HOSTED_FILE', 'GATEWAY_HOSTED_PRICES', 'HOSTED_DEEPSEEK_MODEL', 'HOSTED_DEEPSEEK_PRICES']
/** The picked choices this gateway knows: its name for each, how people read it, its env settings. */
export const PICKS = {
  'deepseek-v4-pro': { name: 'DeepSeek V4 Pro', words: 'DeepSeek V4 Pro, an outside open model', model: 'HOSTED_DEEPSEEK_MODEL', prices: 'HOSTED_DEEPSEEK_PRICES' },
}
const pricesOf = (text, setting, bad) => {
  const prices = { in: 2, out: 2 }
  for (const part of (text || 'in=2,out=2').split(',')) {
    const [k, v] = part.split('=')
    if (!['in', 'out'].includes(k) || !(Number(v) >= 0)) bad(`${setting} is in=,out= in dollars per million tokens`)
    else prices[k] = Number(v)
  }
  return prices
}
const MONTH = () => new Date().toISOString().slice(0, 7)

export function hostedConfig(env, bad) {
  if (!env.HOSTED_BASE_URL) {
    for (const k of ['HOSTED_API_KEY', 'HOSTED_MODEL', 'HOSTED_PROVIDER', 'GATEWAY_HOSTED_FILE', ...Object.values(PICKS).map((p) => p.model)]) if (env[k]) bad(`${k} is set but HOSTED_BASE_URL is not`)
    return null
  }
  let url
  try {
    url = new URL(env.HOSTED_BASE_URL.replace(/\/+$/, '') + '/chat/completions')
  } catch {
    bad('HOSTED_BASE_URL is not a URL')
    return null
  }
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'))) bad('HOSTED_BASE_URL must be https (plain http only to 127.0.0.1)')
  if (url.username || url.password || url.search) bad('HOSTED_BASE_URL must not carry credentials or a query')
  const key = env.HOSTED_API_KEY || ''
  if (!/^[\x21-\x7e]{8,512}$/.test(key)) bad('HOSTED_API_KEY is not set, or has spaces or control characters')
  const model = env.HOSTED_MODEL || ''
  if (!/^[A-Za-z0-9._:/-]{1,120}$/.test(model)) bad('HOSTED_MODEL is the provider’s model id')
  const provider = env.HOSTED_PROVIDER || url.hostname
  if (!/^[\p{L}\p{N} .&'’-]{1,40}$/u.test(provider)) bad('HOSTED_PROVIDER is a short name, as people read it')
  if (!env.GATEWAY_HOSTED_FILE) bad('GATEWAY_HOSTED_FILE is not set (the grants file the front desk writes)')
  const prices = pricesOf(env.GATEWAY_HOSTED_PRICES, 'GATEWAY_HOSTED_PRICES', bad)
  const picks = new Map()
  for (const [name, p] of Object.entries(PICKS)) {
    if (!env[p.model]) {
      if (env[p.prices]) bad(`${p.prices} is set but ${p.model} is not`)
      continue
    }
    if (!/^[A-Za-z0-9._:/-]{1,120}$/.test(env[p.model])) bad(`${p.model} is the provider’s model id`)
    if (env[p.model] === model) bad(`${p.model} names the same model as HOSTED_MODEL: a picked choice is never the hosted default`)
    picks.set(name, { name, label: p.name, words: p.words, model: env[p.model], prices: pricesOf(env[p.prices], p.prices, bad) })
  }
  return { url, key, model, provider, file: env.GATEWAY_HOSTED_FILE, prices, picks }
}

export function makeHosted({ cfg, db }) {
  const tls = cfg.url.protocol === 'https:'
  const target = { url: cfg.url, key: cfg.key, lib: tls ? https : http, agent: new (tls ? https : http).Agent({ keepAlive: true, maxSockets: 6 }) }
  let grants = new Map()
  let seen = ''
  const load = () => {
    const next = readGrants(cfg.file, 'GATEWAY_HOSTED_FILE', seen, (name, g) =>
      !g || typeof g !== 'object' ? null : { capMicroUsd: Number.isSafeInteger(g.cap_micro_usd) && g.cap_micro_usd >= 0 ? g.cap_micro_usd : 20_000_000, until: g.until === undefined ? null : Number.isSafeInteger(g.until) ? g.until : 0, keySha: jobKeyOf(g) }, ANY_CALLER)
    if (!next) return
    seen = next.stamp
    grants = next.grants
    process.stdout.write(JSON.stringify({ t: new Date().toISOString(), event: 'hosted_grants', ok: next.ok, callers: grants.size }) + '\n')
  }
  load()
  const timer = setInterval(load, 2000)
  timer.unref()
  db.exec(`CREATE TABLE IF NOT EXISTS hosted_usage (month TEXT NOT NULL, caller TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
    tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, cost_micro_usd INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (month, caller)) STRICT;`)
  const add = db.prepare(`INSERT INTO hosted_usage (month, caller, requests, tokens_in, tokens_out, cost_micro_usd) VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT (month, caller) DO UPDATE SET requests = requests + 1, tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out, cost_micro_usd = cost_micro_usd + excluded.cost_micro_usd`)
  const read = db.prepare('SELECT requests, tokens_in, tokens_out, cost_micro_usd FROM hosted_usage WHERE month = ? AND caller = ?')
  // A one-time grant (`until`) counts only until its moment: after it, as if it were not there.
  const live = (caller) => {
    const g = grants.get(caller)
    return g && (g.until === null || Date.now() <= g.until) ? g : null
  }
  const monthOf = (caller) => {
    const r = read.get(MONTH(), caller) ?? { requests: 0, tokens_in: 0, tokens_out: 0, cost_micro_usd: 0 }
    const g = live(caller)
    return { month: MONTH(), granted: Boolean(g), once: Boolean(g && g.until !== null), requests: r.requests, tokens: r.tokens_in + r.tokens_out, tokens_in: r.tokens_in, tokens_out: r.tokens_out, cost_micro_usd: r.cost_micro_usd, cap_micro_usd: g?.capMicroUsd ?? null }
  }
  return {
    target,
    model: cfg.model,
    provider: cfg.provider,
    /** The picked choices served here (name -> { label, words, model, prices }). */
    picks: cfg.picks ?? new Map(),
    /** The choices as a caller is told of them: name and how people read it, never the upstream id. */
    pickList: () => [...(cfg.picks ?? new Map()).values()].map((p) => ({ id: p.name, name: p.label, words: p.words })),
    monthOf,
    /** Null if the caller may use `hosted` now, else the refusal (status, why for the log, message). */
    refusal(caller, req = null) {
      const g = live(caller)
      if (!g || (req && !runnerKeyOk(g, req)) || (!req && g.keySha)) return { status: 403, why: grants.has(caller) ? 'the one-time hosted grant has ended' : 'the hosted model is off for this caller', message: 'The hosted open model is off for this project. Its owner can turn it on in Settings.', type: 'permission_error' }
      const m = monthOf(caller)
      if (m.cost_micro_usd >= g.capMicroUsd) return { status: 429, why: 'the monthly hosted ceiling was reached', message: `This project has used its budget for the hosted open model this month ($${(g.capMicroUsd / 1e6).toFixed(2)}). It starts again on the first of next month.`, type: 'insufficient_quota' }
      return null
    },
    /** A request's tokens on the caller's month; a picked choice at its own prices, on the same record. */
    record(caller, tin, tout, pick = null) {
      if (!tin && !tout) return 0
      const prices = pick ? cfg.picks.get(pick).prices : cfg.prices
      const cost = Math.round(tin * prices.in + tout * prices.out)
      add.run(MONTH(), caller, tin, tout, cost)
      return cost
    },
    scrub: (s) => (s.includes(cfg.key) ? s.split(cfg.key).join('[redacted]') : s),
    close: () => clearInterval(timer),
  }
}
