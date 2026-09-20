// Dodo voice bridge — the WebSocket server ElevenLabs Speech Engine connects
// to. Speech Engine reverses the usual direction: ElevenLabs is the client,
// this process is the server, one connection per conversation.
//
// It is a dumb pipe, like the iMessage agent on the mini: the tables and the
// prompts live on Vercel. For every user turn ElevenLabs sends the whole
// transcript; the bridge POSTs it to the F2 backend's /api/f2/eleven/turn,
// which runs Claude and streams plain text back, and the bridge forwards the
// text as `agent_response` chunks for ElevenLabs to speak.
//
//   ElevenLabs ──ws──▶ bridge ──http (streamed)──▶ /api/f2/eleven/turn ──▶ Claude
//
// One process serves several backends by path — each path is one Speech
// Engine (see README.md): /ws/prod and /ws/dev are Dodo's, /ws/polly-prod and
// /ws/polly-dev are Polly's, whose turns go to /api/polly/eleven/turn.
//
// Env:
//   ELEVENLABS_API_KEY   verifies the JWT ElevenLabs sends on every upgrade
//   DODO_BRIDGE_SECRET   shared secret sent to the backend as x-bridge-secret
//   DODO_BRIDGE_BACKENDS JSON map of path name → the URL a turn is POSTed to. A
//                        bare origin means Dodo's route (/api/f2/eleven/turn):
//                        {"prod":"https://feynd.cc",
//                         "polly-prod":"https://hilma-nine.vercel.app/api/polly/eleven/turn"}
//   PORT                 default 3901
import { createServer } from 'node:http'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT || 3901)
const API_KEY = (process.env.ELEVENLABS_API_KEY || '').trim()
const SECRET = (process.env.DODO_BRIDGE_SECRET || '').trim()
const BACKENDS = Object.fromEntries(
  Object.entries(JSON.parse(process.env.DODO_BRIDGE_BACKENDS || '{}')).map(([name, url]) => [
    name,
    new URL(url).pathname === '/' ? `${String(url).replace(/\/$/, '')}/api/f2/eleven/turn` : String(url),
  ]),
)

if (!API_KEY) throw new Error('ELEVENLABS_API_KEY is not set')
if (!SECRET) throw new Error('DODO_BRIDGE_SECRET is not set')
if (Object.keys(BACKENDS).length === 0) throw new Error('DODO_BRIDGE_BACKENDS is empty')

const ISSUER = 'https://api.elevenlabs.io/convai/speech-engine'
const SUBJECT = 'convai_speech_engine_upstream'
const LEEWAY_SECONDS = 60
// Spoken when a turn fails, so a broken backend is heard, not a dead line.
const TURN_FAILED_LINE = 'Sorry, I lost my connection for a moment. Could you say that again?'

function log(...args) {
  console.log(new Date().toISOString(), ...args)
}

/// HS256, signed with the SHA-256 hash of the API key (ElevenLabs' scheme).
function verifyJwt(value) {
  let token = String(value || '').trim()
  if (token.toLowerCase().startsWith('bearer ')) token = token.slice(7).trim()
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('expected 3 parts')
  const [headerB64, payloadB64, signatureB64] = parts
  const secret = createHash('sha256').update(API_KEY, 'utf-8').digest()
  const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  const actual = Buffer.from(signatureB64, 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('signature mismatch')
  }
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))
  const now = Math.floor(Date.now() / 1000)
  if (payload.iss !== ISSUER) throw new Error(`issuer ${payload.iss}`)
  if (payload.sub !== SUBJECT) throw new Error(`subject ${payload.sub}`)
  if (typeof payload.exp !== 'number' || payload.exp + LEEWAY_SECONDS < now) throw new Error('expired')
  if (typeof payload.iat !== 'number' || payload.iat - LEEWAY_SECONDS > now) throw new Error('iat in the future')
  return payload
}

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, backends: Object.keys(BACKENDS), sessions: sessions.size }))
    return
  }
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end('{"error":"not found"}')
})

const wss = new WebSocketServer({ noServer: true })
const sessions = new Set()

httpServer.on('upgrade', (req, socket, head) => {
  const match = /^\/ws\/([a-z0-9-]+)\/?$/.exec((req.url || '').split('?')[0])
  const backend = match ? BACKENDS[match[1]] : undefined
  if (!backend) {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n')
    return
  }
  try {
    verifyJwt(req.headers['x-elevenlabs-speech-engine-authorization'])
  } catch (err) {
    log('upgrade refused:', err.message)
    socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n')
    return
  }
  // The engine forwards the conversation's `dodo_voice_session` dynamic
  // variable as this header: the f2_voice_sessions id the client was given.
  const voiceSessionId = String(req.headers['x-dodo-voice-session'] || '')
  if (!voiceSessionId) {
    log('upgrade refused: no x-dodo-voice-session header')
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws, match[1], backend, voiceSessionId))
})

function handleConnection(ws, name, backend, voiceSessionId) {
  const state = { conversationId: null, inflight: null }
  sessions.add(ws)

  const send = (message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }

  ws.on('message', (raw) => {
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }
    switch (message.type) {
      case 'init':
        state.conversationId = message.conversation_id
        log(`[${name}] init`, state.conversationId, 'voice session', voiceSessionId)
        break
      case 'ping':
        send({ type: 'pong' })
        break
      case 'user_transcript':
        // A newer transcript means the user cut in: drop the turn in flight.
        state.inflight?.abort()
        state.inflight = new AbortController()
        runTurn(message, state.inflight.signal).catch((err) => log(`[${name}] turn crashed:`, err))
        break
      case 'close':
        log(`[${name}] close`, state.conversationId)
        ws.close()
        break
      case 'error':
        log(`[${name}] error from ElevenLabs:`, message.message)
        break
    }
  })

  ws.on('close', () => {
    state.inflight?.abort()
    sessions.delete(ws)
  })
  ws.on('error', (err) => log(`[${name}] socket error:`, err.message))

  async function runTurn(message, signal) {
    const eventId = message.event_id
    const started = Date.now()
    let firstChunkAt = null
    let chars = 0
    try {
      const res = await fetch(backend, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bridge-secret': SECRET },
        body: JSON.stringify({
          voice_session_id: voiceSessionId,
          conversation_id: state.conversationId,
          event_id: eventId,
          transcript: message.user_transcript,
        }),
        signal,
      })
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '')
        throw new Error(`backend ${res.status} ${detail.slice(0, 200)}`)
      }
      const decoder = new TextDecoder()
      for await (const chunk of res.body) {
        const text = decoder.decode(chunk, { stream: true })
        if (!text) continue
        if (firstChunkAt === null) firstChunkAt = Date.now()
        chars += text.length
        send({ type: 'agent_response', content: text, event_id: eventId, is_final: false })
      }
      if (chars === 0) throw new Error('backend returned no text')
      send({ type: 'agent_response', content: '', event_id: eventId, is_final: true })
      log(`[${name}] turn ${eventId}: first text ${firstChunkAt - started} ms, ${chars} chars, ${Date.now() - started} ms`)
    } catch (err) {
      if (signal.aborted) {
        log(`[${name}] turn ${eventId} interrupted after ${Date.now() - started} ms`)
        return
      }
      log(`[${name}] turn ${eventId} failed:`, err.message)
      // Mid-stream failures just end the sentence; a turn with no text gets the line.
      if (chars === 0) send({ type: 'agent_response', content: TURN_FAILED_LINE, event_id: eventId, is_final: false })
      send({ type: 'agent_response', content: '', event_id: eventId, is_final: true })
    }
  }
}

httpServer.listen(PORT, () => {
  log(`dodo-voice-bridge on :${PORT}`, Object.entries(BACKENDS).map(([k, v]) => `/ws/${k} → ${v}`).join(', '))
})
