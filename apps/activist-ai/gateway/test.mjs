// Tests for the model gateway: `node --test gateway/test.mjs` (from apps/activist-ai).
// Each test starts the real server.mjs as a child process against a fake model server
// started here, so what is tested is the program that runs, config checks included.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs')
const TMP = mkdtempSync(path.join(tmpdir(), 'ola-gw-test-'))
after(() => rmSync(TMP, { recursive: true, force: true }))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tok = () => randomBytes(20).toString('hex')
const T = { a: tok(), b: tok(), c: tok(), usage: tok() }
const UPSTREAM_KEY = `up-${tok()}`
const MODELS = 'general=up/general-1,fast=up/fast-1'

async function waitFor(fn, ms = 3000, what = 'condition') {
  const end = Date.now() + ms
  for (;;) {
    const v = fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(10)
  }
}

// ---- the fake model server. The last message's content is a JSON command:
//   { tag, delay (ms before headers), trickle (ms of slow body after headers),
//     status + error (an error reply), usage: [in, out], reply (text), textCalls }
let upstreams = []
after(() => upstreams.forEach((s) => (s.closeAllConnections(), s.close())))
async function fakeUpstream() {
  const st = { seen: [], inflight: 0, max: 0, cancelled: 0 }
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    let cmd = {}
    try {
      cmd = JSON.parse(body.messages.at(-1).content)
    } catch {}
    st.seen.push({ tag: cmd.tag, model: body.model, keys: Object.keys(body).sort(), auth: req.headers.authorization })
    st.inflight++
    st.max = Math.max(st.max, st.inflight)
    res.on('close', () => {
      st.inflight--
      if (!res.writableFinished) st.cancelled++
    })
    if (cmd.delay) await sleep(cmd.delay)
    if (res.destroyed) return
    if (cmd.status) {
      res.writeHead(cmd.status, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: { message: cmd.error || 'no' } }))
    }
    const message = cmd.textCalls
      ? { role: 'assistant', content: 'invented result', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read', arguments: '{"path":"x"}' } }] }
      : { role: 'assistant', content: cmd.reply ?? 'ok' }
    const reply = JSON.stringify({ id: 'x1', model: body.model, choices: [{ index: 0, message, finish_reason: 'stop' }], usage: { prompt_tokens: cmd.usage?.[0] ?? 10, completion_tokens: cmd.usage?.[1] ?? 5 } })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (cmd.trickle) {
      const end = Date.now() + cmd.trickle
      while (Date.now() < end && !res.destroyed) {
        res.write(' ')
        await sleep(50)
      }
      if (res.destroyed) return
    }
    res.end(reply)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  upstreams.push(server)
  return { st, url: `http://127.0.0.1:${server.address().port}/v1` }
}

// ---- the gateway, as a child process
let children = []
after(() => children.forEach((c) => c.kill('SIGKILL')))
function baseEnv(upstreamUrl, db) {
  return {
    UPSTREAM_BASE_URL: upstreamUrl,
    UPSTREAM_API_KEY: UPSTREAM_KEY,
    GATEWAY_TOKENS: `a:${T.a},b:${T.b},c:${T.c}`,
    GATEWAY_MODELS: MODELS,
    GATEWAY_PORT: '0',
    GATEWAY_DB: db || path.join(mkdtempSync(path.join(TMP, 'db-')), 'usage.db'),
  }
}
function run(env) {
  const child = spawn(process.execPath, [SERVER], { env: { PATH: process.env.PATH, HOME: TMP, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  const g = { child, out: '', err: '', lines: [], code: undefined }
  child.stdout.on('data', (d) => {
    g.out += d
    g.lines = g.out.split('\n').filter(Boolean)
  })
  child.stderr.on('data', (d) => (g.err += d))
  child.on('exit', (code) => (g.code = code))
  return g
}
async function gateway(env) {
  const g = run(env)
  const start = await waitFor(() => g.lines.map((l) => JSON.parse(l)).find((l) => l.event === 'start') || (g.code !== undefined && 'exit'), 5000, 'the gateway to start')
  if (start === 'exit') throw new Error(`gateway exited: ${g.err}`)
  g.url = `http://127.0.0.1:${start.port}`
  g.logs = () => g.lines.map((l) => JSON.parse(l)).filter((l) => !l.event)
  g.stop = () => new Promise((r) => (g.code !== undefined ? r() : (g.child.once('exit', r), g.child.kill('SIGTERM'))))
  return g
}
const chat = (cmd = {}, model = 'general', extra = {}) => ({ model, messages: [{ role: 'user', content: JSON.stringify(cmd) }], ...extra })
async function call(g, token, body, { signal, path: p = '/v1/chat/completions', method = 'POST' } = {}) {
  const t0 = Date.now()
  const res = await fetch(g.url + p, {
    method,
    signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, headers: res.headers, text, json, ms: Date.now() - t0 }
}

// ---------------------------------------------------------------- config

test('refuses to start on bad config, without printing secrets', async () => {
  const up = 'http://127.0.0.1:9/v1'
  const cases = [
    [{ UPSTREAM_BASE_URL: undefined }, 'UPSTREAM_BASE_URL is not set'],
    [{ UPSTREAM_BASE_URL: 'http://api.example.com/v1' }, 'plain http only'],
    [{ UPSTREAM_BASE_URL: 'ftp://127.0.0.1/v1' }, 'must be http or https'],
    [{ GATEWAY_MODELS: 'gpt-4=up/x' }, 'must be one of general, fast, code'],
    [{ GATEWAY_TOKENS: `a:short` }, 'the token must be 24 to 512'],
    [{ GATEWAY_TOKENS: `a:${T.a},b:${T.a}` }, 'already given to another caller'],
    [{ GATEWAY_TOKENS: `usage:${T.a}` }, 'reserved'],
    [{ GATEWAY_MAX_BODY_BYTES: '4MB' }, 'GATEWAY_MAX_BODY_BYTES must be a whole number'],
    [{ GATEWAY_MAX_INFLIGHT: '1', GATEWAY_MAX_INFLIGHT_PER_CALLER: '2' }, 'cannot be more than GATEWAY_MAX_INFLIGHT'],
    [{ GATEWAY_QUOTAS: 'zed=100' }, 'not a caller'],
    [{ GATEWAY_MAX_INFLIGT: '3' }, 'not a setting this gateway knows'],
    [{ TEXT_WITH_CALLS: 'yes' }, 'TEXT_WITH_CALLS must be'],
  ]
  for (const [over, expect] of cases) {
    const env = { ...baseEnv(up), ...over }
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k]
    const g = run(env)
    await waitFor(() => g.code !== undefined, 5000, `exit for ${expect}`)
    assert.equal(g.code, 1, expect)
    assert.match(g.err, new RegExp(expect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), expect)
    assert.match(g.err, /did not start/)
    for (const secret of [T.a, T.b, T.c, UPSTREAM_KEY]) assert.ok(!g.err.includes(secret) && !g.out.includes(secret), `a secret was printed (${expect})`)
  }
})

// ---------------------------------------------------------------- model names, routes, fields

test('only the gateway names reach the model server, mapped; nothing of the caller passes upstream', async () => {
  const up = await fakeUpstream()
  const g = await gateway(baseEnv(up.url))
  for (const bad of ['gpt-4', 'up/general-1', 'code', 'General', 'general\n', 42, null, ['general']]) {
    const r = await call(g, T.a, chat({}, bad))
    assert.equal(r.status, 400, `model ${JSON.stringify(bad)}`)
    assert.ok(!r.text.includes('gpt-4'), 'the caller string is not echoed')
  }
  assert.equal(up.st.seen.length, 0, 'no bad model name reached upstream')
  assert.equal((await call(g, T.a, { model: 'general' })).status, 400, 'no messages')
  assert.equal((await call(g, T.a, 'not json')).status, 400)
  const r = await call(g, T.a, chat({ tag: 'ok' }, 'fast', { n: 8, user: 'alice@example.org', temperature: 0.2, secret_field: 1 }))
  assert.equal(r.status, 200)
  assert.equal(r.json.model, 'fast', 'the caller sees the gateway name')
  const seen = up.st.seen[0]
  assert.equal(seen.model, 'up/fast-1')
  assert.deepEqual(seen.keys, ['messages', 'model', 'stream', 'temperature'])
  assert.equal(seen.auth, `Bearer ${UPSTREAM_KEY}`, 'upstream gets the upstream key, never the caller token')
  const models = await call(g, T.a, null, { method: 'GET', path: '/v1/models' })
  assert.deepEqual(models.json.data.map((m) => m.id), ['general', 'fast'])
  assert.equal((await call(g, 'wrong-token', chat())).status, 401)
  assert.equal((await call(g, T.a, null, { method: 'GET', path: '/v1/other' })).status, 404)
  await g.stop()
})

test('streaming callers get a well-formed stream; text beside tool calls is dropped', async () => {
  const up = await fakeUpstream()
  const g = await gateway(baseEnv(up.url))
  const s = await call(g, T.a, chat({ reply: 'hello' }, 'general', { stream: true, stream_options: { include_usage: true } }))
  assert.equal(s.status, 200)
  assert.match(s.headers.get('content-type'), /text\/event-stream/)
  assert.ok(s.text.includes('"content":"hello"') && s.text.includes('"usage"') && s.text.trimEnd().endsWith('data: [DONE]'))
  const t = await call(g, T.a, chat({ textCalls: true }, 'general', { tools: [{ type: 'function', function: { name: 'read', parameters: {} } }] }))
  assert.equal(t.status, 200)
  assert.equal(t.json.choices[0].message.content, null)
  assert.equal(t.json.choices[0].message.tool_calls[0].function.name, 'read')
  await g.stop()
})

// ---------------------------------------------------------------- body cap

test('an oversize body is refused before it is read whole', async () => {
  const up = await fakeUpstream()
  const g = await gateway({ ...baseEnv(up.url), GATEWAY_MAX_BODY_BYTES: '4096' })
  // declared too large: refused from the header alone
  const r = await call(g, T.a, chat({ pad: 'x'.repeat(5000) }))
  assert.equal(r.status, 413)
  // chunked, no length: the gateway answers 413 and closes while the sender is still sending
  const result = await new Promise((resolve) => {
    const u = new URL(g.url + '/v1/chat/completions')
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { Authorization: `Bearer ${T.a}`, 'Transfer-Encoding': 'chunked' } })
    let sent = 0
    let status = null
    req.on('response', (res) => {
      status = res.statusCode
      res.resume()
      res.on('end', () => resolve({ status, sent }))
    })
    req.on('error', () => resolve({ status, sent }))
    const pump = async () => {
      req.write('{"model":"general","messages":[{"role":"user","content":"')
      while (sent < 1024 * 1024 && status === null && !req.destroyed) {
        req.write('x'.repeat(1024))
        sent += 1024
        await sleep(5)
      }
      resolve({ status, sent })
    }
    pump()
  })
  assert.equal(result.status, 413)
  assert.ok(result.sent < 200 * 1024, `the gateway stopped it early (sent ${result.sent} bytes)`)
  assert.equal(up.st.seen.length, 0)
  await waitFor(() => g.logs().filter((l) => l.status === 413).length === 2, 3000, 'two 413 log lines')
  await g.stop()
})

// ---------------------------------------------------------------- concurrency

test('the global limit holds across callers', async () => {
  const up = await fakeUpstream()
  const g = await gateway({ ...baseEnv(up.url), GATEWAY_MAX_INFLIGHT: '2', GATEWAY_MAX_INFLIGHT_PER_CALLER: '2' })
  const rs = await Promise.all(['a', 'a', 'b', 'b', 'c', 'c'].map((w) => call(g, T[w], chat({ delay: 200 }))))
  assert.deepEqual(rs.map((r) => r.status), [200, 200, 200, 200, 200, 200])
  assert.equal(up.st.max, 2)
  assert.ok(g.logs().some((l) => l.wait_ms >= 150), 'some requests waited in the queue')
  await g.stop()
})

test('a caller over its limit gets 429 with Retry-After, and other callers are still served', async () => {
  const up = await fakeUpstream()
  const g = await gateway({ ...baseEnv(up.url), GATEWAY_MAX_INFLIGHT: '4', GATEWAY_MAX_INFLIGHT_PER_CALLER: '1', GATEWAY_MAX_QUEUED_PER_CALLER: '1' })
  const a = [0, 1, 2].map(() => call(g, T.a, chat({ delay: 400 })))
  await sleep(100)
  const b = await call(g, T.b, chat({ tag: 'b' }))
  assert.equal(b.status, 200)
  assert.ok(b.ms < 300, `caller b was not held up by a (${b.ms} ms)`)
  const ra = await Promise.all(a)
  assert.deepEqual(ra.map((r) => r.status).sort(), [200, 200, 429])
  const refused = ra.find((r) => r.status === 429)
  assert.ok(Number(refused.headers.get('retry-after')) > 0)
  assert.equal(refused.json.error.type, 'rate_limit_error')
  assert.match(refused.json.error.message, /too many requests at once/)
  await g.stop()
})

test('the queue is fair: round-robin between callers, not first-come', async () => {
  const up = await fakeUpstream()
  const g = await gateway({ ...baseEnv(up.url), GATEWAY_MAX_INFLIGHT: '1', GATEWAY_MAX_INFLIGHT_PER_CALLER: '1', GATEWAY_MAX_QUEUED_PER_CALLER: '10' })
  const all = [call(g, T.a, chat({ tag: 'a1', delay: 300 }))]
  await sleep(50)
  for (const t of ['a2', 'a3', 'a4', 'a5']) {
    all.push(call(g, T.a, chat({ tag: t, delay: 30 })))
    await sleep(15)
  }
  for (const t of ['b1', 'b2']) {
    all.push(call(g, T.b, chat({ tag: t, delay: 30 })))
    await sleep(15)
  }
  const rs = await Promise.all(all)
  assert.ok(rs.every((r) => r.status === 200))
  const order = up.st.seen.map((s) => s.tag)
  assert.deepEqual(order, ['a1', 'b1', 'a2', 'b2', 'a3', 'a4', 'a5'], `order was ${order}`)
  await g.stop()
})

test('a request that waits too long for a slot gets 503 with Retry-After', async () => {
  const up = await fakeUpstream()
  const g = await gateway({ ...baseEnv(up.url), GATEWAY_MAX_INFLIGHT: '1', GATEWAY_MAX_INFLIGHT_PER_CALLER: '1', GATEWAY_MAX_QUEUE_WAIT_MS: '300' })
  const a = call(g, T.a, chat({ delay: 1000 }))
  await sleep(50)
  const b = await call(g, T.b, chat({ tag: 'b' }))
  assert.equal(b.status, 503)
  assert.ok(Number(b.headers.get('retry-after')) > 0)
  assert.ok(b.ms >= 280 && b.ms < 900, `${b.ms} ms`)
  assert.equal((await a).status, 200)
  assert.ok(!up.st.seen.some((s) => s.tag === 'b'))
  const line = await waitFor(() => g.logs().find((l) => l.caller === 'b'))
  assert.equal(line.why, 'the queue wait passed its limit')
  assert.ok(line.wait_ms >= 280)
  await g.stop()
})

// ---------------------------------------------------------------- quota

test('the weekly quota is counted from upstream usage, refuses when used up, and survives a restart', async () => {
  const up = await fakeUpstream()
  const env = { ...baseEnv(up.url), GATEWAY_WEEKLY_TOKENS: '100', GATEWAY_QUOTAS: 'b=1000', GATEWAY_USAGE_TOKEN: tok() + tok() }
  let g = await gateway(env)
  const fresh = await call(g, T.a, null, { method: 'GET', path: '/v1/usage' })
  assert.equal(fresh.json.tokens_used, 0)
  assert.equal(fresh.json.quota, 100)
  assert.equal((await call(g, T.a, chat({ usage: [60, 50] }))).status, 200)
  const over = await call(g, T.a, chat({ tag: 'over' }))
  assert.equal(over.status, 429)
  assert.equal(over.json.error.type, 'insufficient_quota')
  assert.ok(Number(over.headers.get('retry-after')) > 0 && Number(over.headers.get('retry-after')) <= 7 * 86400)
  assert.ok(!up.st.seen.some((s) => s.tag === 'over'), 'a refused request never reaches the model server')
  // a reply rejected and retried still cost tokens, on every try
  const empty = await call(g, T.b, chat({ reply: '', usage: [7, 3] }))
  assert.equal(empty.status, 502)
  await g.stop()

  g = await gateway(env)
  const mine = await call(g, T.a, null, { method: 'GET', path: '/v1/usage' })
  assert.deepEqual([mine.json.caller, mine.json.tokens_in, mine.json.tokens_out, mine.json.tokens_used, mine.json.fraction_used], ['a', 60, 50, 110, 1.1])
  assert.ok(Date.parse(mine.json.resets_at) - Date.parse(mine.json.week_start) === 7 * 86400e3)
  assert.equal(new Date(mine.json.week_start).getUTCDay(), 1, 'weeks start on Monday')
  assert.equal((await call(g, T.a, chat())).status, 429, 'still refused after a restart')
  assert.equal((await call(g, T.b, chat())).status, 200, 'b has its own larger quota')
  const all = await call(g, env.GATEWAY_USAGE_TOKEN, null, { method: 'GET', path: '/v1/usage' })
  const b = all.json.data.find((u) => u.caller === 'b')
  assert.equal(b.tokens_in, 21 + 10, 'three tries of 7, then one request of 10')
  assert.equal(b.quota, 1000)
  assert.equal((await call(g, env.GATEWAY_USAGE_TOKEN, chat())).status, 403, 'the usage token cannot call models')
  await g.stop()
})

// ---------------------------------------------------------------- timeouts and cancellation

test('connect timeout: a model server that never completes the TLS handshake', async (t) => {
  const silent = net.createServer(() => {})
  const sockets = []
  silent.on('connection', (s) => sockets.push(s))
  t.after(() => (sockets.forEach((s) => s.destroy()), silent.close()))
  await new Promise((r) => silent.listen(0, '127.0.0.1', r))
  const g = await gateway({ ...baseEnv(`https://127.0.0.1:${silent.address().port}/v1`), GATEWAY_CONNECT_TIMEOUT_MS: '200' })
  const r = await call(g, T.a, chat())
  assert.equal(r.status, 504)
  assert.ok(r.ms < 3000, `${r.ms} ms`)
  const line = await waitFor(() => g.logs().find((l) => l.route === 'chat'))
  assert.equal(line.why, 'the model server did not accept a connection in time, 3 times')
  assert.equal(line.tries, 3)
  await g.stop()
})

test('first-byte and total timeouts cancel the upstream request', async () => {
  const up = await fakeUpstream()
  const g = await gateway({ ...baseEnv(up.url), GATEWAY_FIRST_BYTE_TIMEOUT_MS: '300', GATEWAY_TOTAL_TIMEOUT_MS: '800' })
  const first = await call(g, T.a, chat({ delay: 2000 }))
  assert.equal(first.status, 504)
  assert.ok(first.ms >= 280 && first.ms < 700, `first byte ${first.ms} ms`)
  assert.match(first.json.error.message, /did not start answering/)
  await waitFor(() => up.st.cancelled === 1, 2000, 'upstream to see the cancel')
  const total = await call(g, T.a, chat({ trickle: 3000 }))
  assert.equal(total.status, 504)
  assert.ok(total.ms >= 750 && total.ms < 1300, `total ${total.ms} ms`)
  await waitFor(() => up.st.cancelled === 2, 2000, 'upstream to see the second cancel')
  const whys = await waitFor(() => (g.logs().length >= 2 ? g.logs().map((l) => l.why) : null))
  assert.deepEqual(whys, ['the first-byte timeout passed', 'the total timeout passed'])
  await g.stop()
})

test('a caller who goes away cancels upstream and frees its slot; one who leaves the queue never reaches upstream', async () => {
  const up = await fakeUpstream()
  const g = await gateway({ ...baseEnv(up.url), GATEWAY_MAX_INFLIGHT: '1', GATEWAY_MAX_INFLIGHT_PER_CALLER: '1' })
  const ac = new AbortController()
  const gone = call(g, T.a, chat({ tag: 'gone', delay: 5000 }), { signal: ac.signal }).catch((e) => e.name)
  await waitFor(() => up.st.inflight === 1, 2000, 'the request to reach upstream')
  const ac2 = new AbortController()
  const queued = call(g, T.b, chat({ tag: 'queued' }), { signal: ac2.signal }).catch((e) => e.name)
  await sleep(100)
  ac2.abort()
  ac.abort()
  assert.equal(await gone, 'AbortError')
  assert.equal(await queued, 'AbortError')
  await waitFor(() => up.st.cancelled === 1, 2000, 'upstream to see the cancel')
  const next = await call(g, T.c, chat({ tag: 'next' }))
  assert.equal(next.status, 200, 'the slot was freed')
  assert.ok(next.ms < 500)
  assert.deepEqual(up.st.seen.map((s) => s.tag), ['gone', 'next'])
  const lines = await waitFor(() => (g.logs().length >= 3 ? g.logs() : null))
  for (const who of ['a', 'b']) {
    const l = lines.find((x) => x.caller === who)
    assert.equal(l.status, 499)
    assert.equal(l.why, 'the caller went away')
  }
  assert.equal(lines.find((x) => x.caller === 'b').tries, 0)
  await g.stop()
})

// ---------------------------------------------------------------- logging

test('log lines cannot be injected or carry content', async () => {
  const up = await fakeUpstream()
  const g = await gateway(baseEnv(up.url))
  const evil = 'INJECTED\n{"t":"x","caller":"root","status":200}\r\n'
  await call(g, T.a, chat({}, `general\n${evil}`))
  await call(g, T.a, chat({}, 'x'.repeat(200_000)))
  await call(g, T.a, chat({ status: 400, error: `bad request ${evil} SECRET-PROMPT` }))
  await call(g, T.a, chat({ status: 500, error: `server error ${evil}` }))
  await call(g, T.a, chat({ tag: 'SECRET-PROMPT', reply: `SECRET-REPLY ${evil}` }))
  await call(g, T.a, null, { method: 'GET', path: `/v1/chat/completions%0A%7B%22caller%22%3A%22root%22%7D?${encodeURIComponent(evil)}` })
  await call(g, `${T.a}\tINJECTED`, chat())
  const u = new URL(g.url)
  await new Promise((r) => {
    const s = net.connect(u.port, u.hostname, () => s.end(`POST /v1/chat/completions HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer ${T.a}\r\nX-Evil: INJECTED\r\nContent-Length: 2\r\n\r\n{}`))
    s.on('data', () => {})
    s.on('close', r)
  })
  await waitFor(() => g.logs().length >= 8, 3000, 'eight log lines')
  const raw = g.out
  for (const word of ['INJECTED', 'root', 'SECRET-PROMPT', 'SECRET-REPLY', 'xxxxxxxx', T.a, UPSTREAM_KEY]) assert.ok(!raw.includes(word), `the log contains ${word.slice(0, 12)}`)
  const KEYS = ['caller', 'model', 'ms', 'route', 'status', 't', 'tokens_in', 'tokens_out', 'tries', 'wait_ms', 'why']
  for (const line of raw.split('\n').filter(Boolean)) {
    assert.ok(line.length < 400, 'a line stays short')
    const l = JSON.parse(line)
    if (l.event) continue
    assert.deepEqual(Object.keys(l).sort(), KEYS)
    assert.ok(['-', 'a', 'b', 'c', 'usage'].includes(l.caller))
    assert.ok(['-', 'general', 'fast', 'code'].includes(l.model))
    assert.ok(['chat', 'models', 'usage', 'other'].includes(l.route))
    for (const k of ['status', 'tries', 'ms']) assert.equal(typeof l[k], 'number')
    assert.ok(l.why === null || /^[a-z0-9 ,'-]+$/i.test(l.why), `why is from the fixed vocabulary: ${l.why}`)
  }
  await g.stop()
})
