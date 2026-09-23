// Drill: does a slow Claude turn survive ElevenLabs? Runs THIS folder's
// server.mjs locally behind a Cloudflare quick tunnel, in front of a fake
// backend that waits --delay ms before its first word, points a throwaway
// Speech Engine ("Dodo drill", deleted afterwards) at it with the given
// cascade timeout, sends one user turn over a real ElevenLabs conversation
// and reports whether the answer arrived and how the conversation ended.
//
//   node drill-slow-turn.mjs [--delay 9000] [--cascade 4] [--keep]
//
// 2026-09-23: a Final Review died after a four-minute answer. Claude needed
// more than 4 s to start its reply, ElevenLabs re-sent the turn every 4 s
// (cascade_timeout_seconds = 4), the bridge took each re-send for a cut-in and
// cancelled the reply in flight, and after the third try ElevenLabs closed the
// conversation: "Speech Engine generation failed — LLM Cascade Error".
//
// Needs ELEVENLABS_API_KEY (from ../../.env.local) and `cloudflared` on PATH or
// in CLOUDFLARED.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const here = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(join(here, '../../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const KEY = process.env.ELEVENLABS_API_KEY
const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt }
const DELAY = Number(opt('--delay', '9000'))
const CASCADE = Number(opt('--cascade', '4'))
const BRIDGE_PORT = 3902
const BACKEND_PORT = 3903
const API = 'https://api.elevenlabs.io/v1'
const t0 = Date.now()
const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`
const children = []
const results = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : {}
}

// 1. The slow backend: one POST per turn attempt.
let attempts = 0
const REPLY = 'Here is an answer that took a long time to start, and it still arrived.'
const backend = createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    attempts++
    const n = attempts
    const body = JSON.parse(raw || '{}')
    console.log(at(), `backend: attempt ${n} for event ${body.event_id}, answering in ${DELAY} ms`)
    let closed = false
    req.on('close', () => { closed = true })
    res.on('close', () => { if (!res.writableEnded) console.log(at(), `backend: attempt ${n} cancelled by the bridge`) })
    setTimeout(async () => {
      if (closed && res.destroyed) return
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      for (const part of REPLY.match(/.{1,24}(\s|$)/g)) {
        if (res.destroyed) return
        res.write(part)
        await new Promise((r) => setTimeout(r, 120))
      }
      res.end()
    }, DELAY)
  })
}).listen(BACKEND_PORT)

// 2. The bridge under test.
const bridge = spawn(process.execPath, [join(here, 'server.mjs')], {
  env: { ...process.env, PORT: String(BRIDGE_PORT), DODO_BRIDGE_SECRET: 'drill',
         DODO_BRIDGE_BACKENDS: JSON.stringify({ drill: `http://localhost:${BACKEND_PORT}/turn` }) },
})
children.push(bridge)
bridge.stdout.on('data', (d) => process.stdout.write(`   bridge | ${d}`))
bridge.stderr.on('data', (d) => process.stdout.write(`   bridge! ${d}`))

// 3. A public wss:// for ElevenLabs to reach it.
const tunnel = spawn(process.env.CLOUDFLARED || 'cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${BRIDGE_PORT}`])
children.push(tunnel)
const host = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('no tunnel URL in 40 s')), 40_000)
  const scan = (d) => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
    if (m) { clearTimeout(timer); resolve(m[0]) }
  }
  tunnel.stdout.on('data', scan)
  tunnel.stderr.on('data', scan)
})
for (let i = 0; i < 30; i++) {
  const ok = await fetch(`${host}/health`).then((r) => r.ok).catch(() => false)
  if (ok) break
  await new Promise((r) => setTimeout(r, 1000))
}
console.log(at(), 'tunnel', host)

// 4. A throwaway Speech Engine pointed at it.
const listed = await api('GET', '/speech-engine?page_size=100')
for (const e of (listed.speech_engines ?? []).filter((e) => e.name === 'Dodo drill')) {
  await api('DELETE', `/speech-engine/${e.speech_engine_id}`)
}
const engine = await api('POST', '/speech-engine', {
  name: 'Dodo drill',
  speech_engine: {
    ws_url: `${host.replace(/^https:/, 'wss:')}/ws/drill`,
    request_headers: { 'x-dodo-voice-session': { variable_name: 'dodo_voice_session' } },
  },
  tts: { voice_id: 'cgSgspJ2msm6clMCkdW9', model_id: 'eleven_flash_v2' },
  turn: { turn_timeout: 30, turn_eagerness: 'patient' },
  conversation: { max_duration_seconds: 300, client_events: ['audio', 'interruption', 'agent_response', 'user_transcript'] },
  cascade_timeout_seconds: CASCADE,
})
const engineId = engine.speech_engine_id
console.log(at(), 'engine', engineId, 'cascade_timeout_seconds', engine.cascade_timeout_seconds)

// 5. One real conversation: a typed turn, then wait for the answer.
const signed = await api('GET', `/convai/conversation/get-signed-url?agent_id=${engineId}`)
const ws = new WebSocket(signed.signed_url)
let conversationId = null
let reply = ''
let replyAt = null
let closeInfo = null
let sentAt = 0
await new Promise((resolve) => {
  const finish = setTimeout(resolve, DELAY * 3 + 30_000)
  ws.on('open', () => ws.send(JSON.stringify({ type: 'conversation_initiation_client_data', dynamic_variables: { dodo_voice_session: 'drill' } })))
  ws.on('message', (raw) => {
    const ev = JSON.parse(raw.toString())
    if (ev.type === 'conversation_initiation_metadata') {
      conversationId = ev.conversation_initiation_metadata_event.conversation_id
      console.log(at(), 'conversation', conversationId)
      setTimeout(() => {
        sentAt = Date.now()
        console.log(at(), 'USER: Walk me through it, please.')
        ws.send(JSON.stringify({ type: 'user_message', text: 'Walk me through it, please.' }))
      }, 800)
    } else if (ev.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', event_id: ev.ping_event.event_id }))
    } else if (ev.type === 'agent_response') {
      reply = ev.agent_response_event.agent_response
      replyAt = Date.now()
      console.log(at(), `DODO (${((replyAt - sentAt) / 1000).toFixed(1)} s after the turn): ${reply}`)
      // Stay a few seconds to see the conversation is still alive.
      setTimeout(() => { clearTimeout(finish); resolve() }, 6000)
    }
  })
  ws.on('close', (code, reason) => {
    closeInfo = `${code} ${reason.toString()}`
    console.log(at(), 'ws closed', closeInfo)
    clearTimeout(finish)
    resolve()
  })
})
const aliveAtEnd = ws.readyState === WebSocket.OPEN
ws.close()

// 6. What ElevenLabs recorded.
await new Promise((r) => setTimeout(r, 4000))
let record = null
if (conversationId) {
  record = await api('GET', `/convai/conversations/${conversationId}`).catch((e) => ({ error: e.message }))
}
if (!args.includes('--keep')) await api('DELETE', `/speech-engine/${engineId}`).catch(() => {})

check('answer-arrived', reply.includes('still arrived'), reply ? `${((replyAt - sentAt) / 1000).toFixed(1)} s` : 'no answer')
check('conversation-alive', aliveAtEnd, aliveAtEnd ? 'open 6 s after the answer' : `closed: ${closeInfo}`)
check('not-failed-at-elevenlabs', record?.status !== 'failed',
  `${record?.status ?? '?'} / ${record?.metadata?.termination_reason ?? ''}`)
console.log(`\ndelay ${DELAY} ms, cascade ${CASCADE} s, backend attempts ${attempts}`)
console.log(results.join('\n'))
for (const c of children) c.kill()
backend.close()
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
