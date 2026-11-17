// Fallback to Claude: the gateway's pass-through to Anthropic's Messages API, for Claude Code
// running inside a sealed workspace (workspace/ola-claude). The VM still has no network; Claude
// Code's only way out is the door to this gateway, like opencode's.
//
//   POST /anthropic/v1/messages               (streamed or not; what Claude Code calls)
//   POST /anthropic/v1/messages/count_tokens  (optional for Claude Code; exact counts)
//
// The caller is the workspace's own gateway token (Authorization: Bearer, which Claude Code sends
// from ANTHROPIC_AUTH_TOKEN), bound to its door as for every route. The real credential never
// enters the VM: the gateway drops the caller's Authorization and x-api-key and adds its own.
//
// Who may use it is decided by the front desk and written to GATEWAY_CLAUDE_FILE (mode 600, one
// JSON object, by rename; reloaded when it changes): { "ws-<id>": { "mode": "oauth" | "api_key",
// "cap_micro_usd": n, "cap_tokens": n } }. A caller not listed is refused with a plain sentence.
//
// Two credentials, one per mode:
//   api_key  CLAUDE_API_KEY (an Anthropic API key), sent as x-api-key. Any owner's project.
//   oauth    CLAUDE_OAUTH_TOKEN_FILE, a file holding a long-lived subscription token made with
//            `claude setup-token` (Bart's own subscription: the front desk lists only projects of
//            an admin-owned team in this mode). Sent as Authorization: Bearer, with the OAuth
//            capability added to anthropic-beta (GATEWAY_CLAUDE_OAUTH_BETA).
//
// What is passed on: the request body as sent (after its model is checked against
// GATEWAY_CLAUDE_MODELS), and only the headers anthropic-version, anthropic-beta, content-type and
// accept. What comes back: the status, the body as Anthropic sent it (Claude Code needs the
// stream and the API's own 400 sentences to retry without a beta), and a short list of headers.
// An upstream 401 or 403 is never relayed: it is a fixed 502, so nothing about our credential
// reaches the VM. Both credentials are scrubbed from every reply chunk and log line.
//
// The ceiling: per caller per calendar month (UTC). In api_key mode, dollars from the token
// counts and GATEWAY_CLAUDE_PRICES; in oauth mode, tokens (no dollars: a subscription is not
// billed per token). Checked before a request goes upstream, from what is already recorded.
// Usage is read from the reply itself (message_start and message_delta in a stream, `usage` in a
// whole reply); a reply that reports none is charged its bytes, ~4 per token. Nothing a request
// or reply says is logged: the log line has the caller, route, status, mode, token counts, cost.
import { readFileSync, statSync, watch } from 'node:fs'
import https from 'node:https'
import http from 'node:http'

const SETTINGS = ['GATEWAY_CLAUDE_FILE', 'GATEWAY_CLAUDE_UPSTREAM', 'GATEWAY_CLAUDE_MODELS', 'GATEWAY_CLAUDE_PRICES', 'GATEWAY_CLAUDE_OAUTH_BETA', 'GATEWAY_CLAUDE_MAX_BODY_BYTES']
export const CLAUDE_SETTINGS = SETTINGS
const DEFAULT_MODELS = 'claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5'
// Dollars per million tokens: input, output, cache write (5 minutes), cache read. A setting, so a
// price change is a config change. Defaults are Opus-class list prices; check them before relying
// on the dollar ceiling (README).
const DEFAULT_PRICES = 'in=5,out=25,cache_write=6.25,cache_read=0.5'
const FORWARD = ['anthropic-version', 'anthropic-beta', 'content-type', 'accept']
const BACK = ['content-type', 'request-id', 'retry-after', 'anthropic-organization-id']
const MONTH = () => new Date().toISOString().slice(0, 7)

export function claudeConfig(env, bad) {
  const file = env.GATEWAY_CLAUDE_FILE || null
  let upstream
  try {
    upstream = new URL(env.GATEWAY_CLAUDE_UPSTREAM || 'https://api.anthropic.com')
  } catch {
    bad('GATEWAY_CLAUDE_UPSTREAM is not a URL')
  }
  if (upstream && !(upstream.protocol === 'https:' || (upstream.protocol === 'http:' && upstream.hostname === '127.0.0.1'))) bad('GATEWAY_CLAUDE_UPSTREAM must be https (plain http only to 127.0.0.1, for tests)')
  const models = new Set((env.GATEWAY_CLAUDE_MODELS || DEFAULT_MODELS).split(',').map((s) => s.trim()).filter(Boolean))
  for (const m of models) if (!/^claude-[a-z0-9.-]{1,60}$/.test(m)) bad('GATEWAY_CLAUDE_MODELS has an entry that is not a claude-* model id')
  const prices = {}
  for (const part of (env.GATEWAY_CLAUDE_PRICES || DEFAULT_PRICES).split(',')) {
    const [k, v] = part.split('=')
    if (!['in', 'out', 'cache_write', 'cache_read'].includes(k) || !(Number(v) >= 0)) bad('GATEWAY_CLAUDE_PRICES is in=,out=,cache_write=,cache_read= in dollars per million tokens')
    prices[k] = Number(v)
  }
  const key = env.CLAUDE_API_KEY || null
  if (key !== null && !/^[\x21-\x7e]{20,300}$/.test(key)) bad('CLAUDE_API_KEY does not look like a key')
  const oauthFile = env.CLAUDE_OAUTH_TOKEN_FILE || null
  const beta = env.GATEWAY_CLAUDE_OAUTH_BETA || 'oauth-2025-04-20'
  if (!/^[a-z0-9-]{3,60}$/.test(beta)) bad('GATEWAY_CLAUDE_OAUTH_BETA is one anthropic-beta value')
  const maxBody = Number(env.GATEWAY_CLAUDE_MAX_BODY_BYTES || 16 * 1024 * 1024)
  if (!(maxBody >= 1024 && maxBody <= 64 * 1024 * 1024)) bad('GATEWAY_CLAUDE_MAX_BODY_BYTES must be from 1024 to 67108864')
  return { file, upstream, models, prices, key, oauthFile, beta, maxBody }
}

export function makeClaude({ cfg, db, readBody, send, fail }) {
  // The OAuth token is read from its file (mode 600) at start and when it changes; never logged.
  let oauth = null
  let said = ''
  const say = (m) => m !== said && ((said = m), m && console.error(m))
  const loadOauth = () => {
    if (!cfg.oauthFile) return
    try {
      const st = statSync(cfg.oauthFile)
      if ((st.mode & 0o077) !== 0) return (oauth = null), say('CLAUDE_OAUTH_TOKEN_FILE is readable by others (mode must be 600): oauth mode is off')
      const t = readFileSync(cfg.oauthFile, 'utf8').trim()
      oauth = /^[\x21-\x7e]{20,500}$/.test(t) ? t : null
      say(oauth ? '' : 'CLAUDE_OAUTH_TOKEN_FILE does not hold one token: oauth mode is off')
    } catch {
      oauth = null
      say('CLAUDE_OAUTH_TOKEN_FILE cannot be read: oauth mode is off')
    }
  }
  loadOauth()
  const secrets = () => [cfg.key, oauth].filter(Boolean)
  const scrub = (s) => {
    for (const k of secrets()) if (s.includes(k)) s = s.split(k).join('[redacted]')
    return s
  }

  // Who may use Claude, and how, from the front desk's file.
  let grants = new Map()
  let seen = ''
  const loadGrants = () => {
    if (!cfg.file) return
    try {
      const st = statSync(cfg.file)
      const stamp = `${st.mtimeMs}:${st.size}`
      if (stamp === seen) return
      seen = stamp
      if ((st.mode & 0o077) !== 0) return console.error('GATEWAY_CLAUDE_FILE must be mode 600: the grants in force stay')
      const raw = JSON.parse(readFileSync(cfg.file, 'utf8'))
      const next = new Map()
      for (const [name, g] of Object.entries(raw ?? {})) {
        if (!/^ws-[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(name) || !g || !['oauth', 'api_key'].includes(g.mode)) continue
        next.set(name, { mode: g.mode, capMicroUsd: Number.isSafeInteger(g.cap_micro_usd) && g.cap_micro_usd >= 0 ? g.cap_micro_usd : 20_000_000, capTokens: Number.isSafeInteger(g.cap_tokens) && g.cap_tokens >= 0 ? g.cap_tokens : 20_000_000 })
      }
      const added = [...next.keys()].filter((k) => !grants.has(k)).length
      const removed = [...grants.keys()].filter((k) => !next.has(k)).length
      grants = next
      process.stdout.write(JSON.stringify({ t: new Date().toISOString(), event: 'claude_grants', ok: true, callers: grants.size, added, removed }) + '\n')
    } catch {
      console.error('GATEWAY_CLAUDE_FILE could not be read: the grants in force stay')
    }
  }
  loadGrants()
  const timers = [setInterval(() => (loadGrants(), loadOauth()), 2000)]
  timers[0].unref()
  try {
    if (cfg.file) watch(cfg.file, () => loadGrants()).unref?.()
  } catch {}

  db.exec(`CREATE TABLE IF NOT EXISTS claude_usage (
    month TEXT NOT NULL, caller TEXT NOT NULL, mode TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0, tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
    cache_write INTEGER NOT NULL DEFAULT 0, cache_read INTEGER NOT NULL DEFAULT 0, cost_micro_usd INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (month, caller, mode)) STRICT;`)
  const add = db.prepare(`INSERT INTO claude_usage (month, caller, mode, requests, tokens_in, tokens_out, cache_write, cache_read, cost_micro_usd) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT (month, caller, mode) DO UPDATE SET requests = requests + 1, tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out,
    cache_write = cache_write + excluded.cache_write, cache_read = cache_read + excluded.cache_read, cost_micro_usd = cost_micro_usd + excluded.cost_micro_usd`)
  const read = db.prepare(`SELECT coalesce(sum(requests), 0) AS requests, coalesce(sum(tokens_in + tokens_out + cache_write + cache_read), 0) AS tokens, coalesce(sum(cost_micro_usd), 0) AS cost FROM claude_usage WHERE month = ? AND caller = ?`)
  const costOf = (u) => Math.round(u.in * cfg.prices.in + u.out * cfg.prices.out + u.cw * cfg.prices.cache_write + u.cr * cfg.prices.cache_read) // tokens × $/MTok = micro-dollars
  const monthOf = (caller) => {
    const r = read.get(MONTH(), caller)
    const g = grants.get(caller)
    return { month: MONTH(), mode: g?.mode ?? null, requests: r.requests, tokens: r.tokens, cost_micro_usd: r.cost, cap_micro_usd: g?.capMicroUsd ?? null, cap_tokens: g?.capTokens ?? null }
  }
  const credentialFor = (mode) => (mode === 'api_key' ? cfg.key : oauth)

  async function handle(req, res, rec, who, signal) {
    const no = (status, why, message, type = 'invalid_request_error', headers) => {
      rec.status = status
      rec.why = why
      fail(res, status, message, type, headers)
    }
    if (req.method !== 'POST') return no(404, 'not found', 'not found')
    const g = grants.get(who)
    if (!g) return no(403, 'fallback to Claude is off for this caller', 'Fallback to Claude is off for this project. Its owner can turn it on in Settings.', 'permission_error')
    rec.mode = g.mode
    const cred = credentialFor(g.mode)
    if (!cred) return no(503, 'no credential for this mode', g.mode === 'oauth' ? 'Claude is not set up on this machine yet (no subscription token).' : 'Claude is not set up on this machine yet (no API key).', 'api_error')
    const m = monthOf(who)
    if (g.mode === 'api_key' ? m.cost_micro_usd >= g.capMicroUsd : m.tokens >= g.capTokens) {
      return no(429, 'the monthly Claude ceiling was reached', g.mode === 'api_key' ? `This project has used its Claude budget for the month ($${(g.capMicroUsd / 1e6).toFixed(2)}). It starts again on the first of next month.` : 'This project has used its Claude allowance for the month. It starts again on the first of next month.', 'rate_limit_error')
    }
    let raw
    try {
      raw = await readBody(req, cfg.maxBody)
    } catch (e) {
      return no(e.code === 'too_large' ? 413 : 400, 'the body was not read', 'the request could not be read')
    }
    let body
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      return no(400, 'the body is not JSON', 'the request body is not JSON')
    }
    if (typeof body?.model !== 'string' || !cfg.models.has(body.model)) return no(400, 'a model this gateway does not offer', `Ola offers these Claude models: ${[...cfg.models].join(', ')}`)
    rec.model = body.model
    const count = rec.route === 'claude_count'
    const target = new URL(count ? '/v1/messages/count_tokens' : '/v1/messages', cfg.upstream)
    const q = new URL(req.url, 'http://x').searchParams
    if (q.get('beta') === 'true') target.searchParams.set('beta', 'true')
    const headers = {}
    for (const h of FORWARD) if (typeof req.headers[h] === 'string') headers[h] = req.headers[h].slice(0, 4000)
    if (g.mode === 'api_key') headers['x-api-key'] = cred
    else {
      headers.authorization = `Bearer ${cred}`
      const betas = (headers['anthropic-beta'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      if (!betas.includes(cfg.beta)) betas.push(cfg.beta)
      headers['anthropic-beta'] = betas.join(',')
    }
    headers['content-length'] = String(raw.length)
    const lib = target.protocol === 'https:' ? https : http
    const tally = { in: 0, out: 0, cw: 0, cr: 0, reported: false, bytes: 0 }
    await new Promise((resolve) => {
      const up = lib.request(target, { method: 'POST', headers, signal, timeout: 600_000 }, (ur) => {
        const status = ur.statusCode ?? 502
        if (status === 401 || status === 403) {
          ur.resume()
          no(502, `the upstream answered ${status}`, 'Claude could not be reached with this machine’s credential. Tell Bart.', 'api_error')
          return resolve()
        }
        rec.status = status
        const back = {}
        for (const h of BACK) if (typeof ur.headers[h] === 'string') back[h] = ur.headers[h]
        for (const [h, v] of Object.entries(ur.headers)) if (h.startsWith('anthropic-ratelimit-') && typeof v === 'string') back[h] = v
        res.writeHead(status, back)
        let sse = ''
        const streaming = /event-stream/.test(String(ur.headers['content-type'] ?? ''))
        let whole = ''
        ur.setEncoding('utf8')
        ur.on('data', (chunk) => {
          tally.bytes += chunk.length
          if (streaming) {
            sse += chunk
            let nl
            while ((nl = sse.indexOf('\n')) >= 0) {
              const line = sse.slice(0, nl)
              sse = sse.slice(nl + 1)
              if (line.startsWith('data:')) usageFrom(line.slice(5), tally)
            }
            if (sse.length > 1024 * 1024) sse = ''
          } else if (whole.length < 4 * 1024 * 1024) whole += chunk
          res.write(scrub(chunk))
        })
        ur.on('end', () => {
          if (!streaming && status === 200) usageFrom(whole, tally)
          res.end()
          resolve()
        })
        ur.on('error', () => (res.destroy(), resolve()))
      })
      up.on('timeout', () => up.destroy(new Error('timeout')))
      up.on('error', () => {
        if (!res.headersSent) no(signal.aborted ? 499 : 502, 'the upstream could not be reached', 'Claude could not be reached just now. Try again in a minute.', 'api_error')
        else res.destroy()
        resolve()
      })
      up.end(raw)
    })
    if (count) return
    if (!tally.reported && tally.bytes) tally.out = Math.ceil((tally.bytes + raw.length) / 4)
    const cost = g.mode === 'api_key' ? costOf(tally) : 0
    rec.tokens_in = tally.in + tally.cw + tally.cr
    rec.tokens_out = tally.out
    rec.cost_micro_usd = cost
    rec.estimated = tally.reported ? null : 'bytes'
    if (tally.bytes) add.run(MONTH(), who, g.mode, tally.in, tally.out, tally.cw, tally.cr, cost)
  }

  return { handle, monthOf, scrub, has: (who) => grants.has(who), close: () => timers.forEach(clearInterval) }
}

/** Token counts from one SSE data line or a whole reply (message_start, message_delta, usage). */
function usageFrom(text, t) {
  let ev
  try {
    ev = JSON.parse(text)
  } catch {
    return
  }
  const u = ev?.message?.usage ?? ev?.usage
  if (!u || typeof u !== 'object') return
  const n = (v) => (Number.isSafeInteger(v) && v >= 0 && v < 1e9 ? v : 0)
  t.reported = true
  // message_start carries the input side (and a first output count); message_delta the running
  // output total. Take the largest seen of each, so a count is never added twice.
  t.in = Math.max(t.in, n(u.input_tokens))
  t.cw = Math.max(t.cw, n(u.cache_creation_input_tokens))
  t.cr = Math.max(t.cr, n(u.cache_read_input_tokens))
  t.out = Math.max(t.out, n(u.output_tokens))
}
