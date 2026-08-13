// agent-imsghttp — outbound iMessage over HTTP, for F2's daily cards and
// chat replies. BlueBubbles' apple-script send broke on this macOS (its
// legacy "buddy" syntax); this agent sends with the modern syntax that
// still works, via the same osascript approach as agent-imessage.
//
//   node server.mjs --listen 2340
//
// POST /send  { handle?: "+1650...", chat_guid?: "iMessage;-;+1650...", text: "..." }
//   Header: x-imsg-secret must match IMSG_HTTP_SECRET (from ~/.macplus-backend.env).
//   chat_guid wins when both are given. Responds { ok: true } or { error }.
// GET /healthz → "ok" (no auth), for the tunnel/liveness checks.
//
// Dependency-free on purpose: plain node http + osascript.

import http from 'node:http'
import { execFile } from 'node:child_process'

const args = process.argv.slice(2)
const PORT = Number(args[args.indexOf('--listen') + 1]) || 2340
const SECRET = process.env.IMSG_HTTP_SECRET || ''

const log = (m) => console.error(`[imsghttp ${new Date().toISOString()}] ${m}`)

function appleStr(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

function osascript(script) {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-e', script],
      { timeout: 20000, killSignal: 'SIGKILL' },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr?.trim() || err.message))
        else resolve()
      },
    )
  })
}

/// Existing conversation by chat guid — works for 1:1 and groups.
function sendToChat(chatGuid, text) {
  return osascript(
    `tell application "Messages"\n` +
    `  send ${appleStr(text)} to chat id ${appleStr(chatGuid)}\n` +
    `end tell`,
  )
}

/// Direct to a handle — iMessage first, SMS fallback (needs Text Message
/// Forwarding for the green path).
function sendToHandle(handle, text) {
  const h = appleStr(handle)
  const t = appleStr(text)
  return osascript(
    `tell application "Messages"\n` +
    `  try\n` +
    `    set svc to 1st service whose service type = iMessage\n` +
    `    send ${t} to participant ${h} of svc\n` +
    `  on error\n` +
    `    set svc to 1st service whose service type = SMS\n` +
    `    send ${t} to participant ${h} of svc\n` +
    `  end try\n` +
    `end tell`,
  )
}

function json(res, code, body) {
  const data = JSON.stringify(body)
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(data)
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }
  if (req.method !== 'POST' || req.url !== '/send') {
    json(res, 404, { error: 'not found' })
    return
  }
  if (!SECRET) {
    json(res, 503, { error: 'IMSG_HTTP_SECRET not configured' })
    return
  }
  if (req.headers['x-imsg-secret'] !== SECRET) {
    json(res, 401, { error: 'unauthorized' })
    return
  }

  let raw = ''
  req.on('data', (c) => {
    raw += c
    if (raw.length > 64_000) req.destroy()
  })
  req.on('end', async () => {
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      json(res, 400, { error: 'invalid JSON' })
      return
    }
    const text = String(body.text ?? '').trim()
    const chatGuid = String(body.chat_guid ?? '').trim()
    const handle = String(body.handle ?? '').trim()
    if (!text || (!chatGuid && !handle)) {
      json(res, 400, { error: 'text and one of chat_guid/handle required' })
      return
    }
    try {
      if (chatGuid) await sendToChat(chatGuid, text)
      else await sendToHandle(handle, text)
      log(`sent to ${chatGuid || handle}: ${text.slice(0, 60)}`)
      json(res, 200, { ok: true })
    } catch (e) {
      log(`send FAILED to ${chatGuid || handle}: ${e.message}`)
      json(res, 502, { error: e.message })
    }
  })
})

server.listen(PORT, () => log(`listening on :${PORT}`))
