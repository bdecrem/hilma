/**
 * BORE Relay Server
 *
 * HTTP server that upgrades to WebSocket at /ws/connect.
 * Maps subdomains to active WebSocket tunnels and relays HTTP requests.
 */

import http from 'http'
import { WebSocketServer } from 'ws'
import crypto from 'crypto'

const PORT = parseInt(process.env.PORT || '4040')
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'localhost'

// Registry: subdomain → { ws, pending: Map<requestId, { res, timer }> }
const tunnels = new Map()

function generateId() {
  return crypto.randomBytes(8).toString('hex')
}

function generateSubdomain() {
  const words = ['amber', 'blue', 'coral', 'dawn', 'echo', 'fern', 'glow', 'haze', 'iris', 'jade',
    'kite', 'lark', 'mist', 'nova', 'opal', 'pine', 'quay', 'reef', 'sage', 'tide',
    'vale', 'wave', 'xylo', 'yew', 'zinc']
  const w1 = words[Math.floor(Math.random() * words.length)]
  const w2 = words[Math.floor(Math.random() * words.length)]
  const n = Math.floor(Math.random() * 100)
  return `${w1}-${w2}-${n}`
}

function extractSubdomain(host) {
  if (!host) return null
  // Remove port
  const hostname = host.split(':')[0]
  // Check if it's a subdomain of BASE_DOMAIN
  if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
    return hostname.slice(0, -(BASE_DOMAIN.length + 1))
  }
  // For local testing: subdomain.localhost
  if (hostname.endsWith('.localhost')) {
    return hostname.slice(0, -'.localhost'.length)
  }
  return null
}

// WebSocket server for tunnel connections
const server = http.createServer()
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname === '/ws/connect') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws) => {
  let registeredSubdomain = null

  ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
      return
    }

    if (msg.type === 'register') {
      let subdomain = msg.subdomain || generateSubdomain()

      // Check if subdomain is taken
      if (tunnels.has(subdomain)) {
        ws.send(JSON.stringify({ type: 'error', code: 3, message: `Subdomain '${subdomain}' is already taken` }))
        return
      }

      registeredSubdomain = subdomain
      tunnels.set(subdomain, { ws, pending: new Map() })

      const url = PORT === 80 || PORT === 443
        ? `http://${subdomain}.${BASE_DOMAIN}`
        : `http://${subdomain}.${BASE_DOMAIN}:${PORT}`

      ws.send(JSON.stringify({ type: 'registered', subdomain, url }))
      console.log(`[TUNNEL] ${subdomain} registered`)
    }

    if (msg.type === 'response') {
      // Client sending back a response to a relayed request
      if (!registeredSubdomain) return
      const tunnel = tunnels.get(registeredSubdomain)
      if (!tunnel) return

      const pending = tunnel.pending.get(msg.requestId)
      if (!pending) return

      clearTimeout(pending.timer)
      tunnel.pending.delete(msg.requestId)

      const res = pending.res
      res.writeHead(msg.statusCode || 200, msg.headers || {})
      if (msg.body) {
        const buf = Buffer.from(msg.body, msg.encoding || 'utf-8')
        res.end(buf)
      } else {
        res.end()
      }
    }

    if (msg.type === 'pong') {
      // Keepalive response, nothing to do
    }
  })

  ws.on('close', () => {
    if (registeredSubdomain) {
      const tunnel = tunnels.get(registeredSubdomain)
      if (tunnel) {
        // Reject all pending requests
        for (const [, pending] of tunnel.pending) {
          clearTimeout(pending.timer)
          pending.res.writeHead(502)
          pending.res.end('Tunnel disconnected')
        }
        tunnels.delete(registeredSubdomain)
      }
      console.log(`[TUNNEL] ${registeredSubdomain} disconnected`)
    }
  })

  // Keepalive ping every 30s
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }))
    } else {
      clearInterval(pingInterval)
    }
  }, 30000)

  ws.on('close', () => clearInterval(pingInterval))
})

// HTTP request handler — relay to tunnel
server.on('request', (req, res) => {
  const subdomain = extractSubdomain(req.headers.host)

  // Health check / root
  if (!subdomain || subdomain === 'www') {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, tunnels: tunnels.size }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(`BORE relay — ${tunnels.size} active tunnels`)
    return
  }

  const tunnel = tunnels.get(subdomain)
  if (!tunnel) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end(`No tunnel found for subdomain: ${subdomain}`)
    return
  }

  // Collect request body
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    const requestId = generateId()

    // Timeout after 30s
    const timer = setTimeout(() => {
      tunnel.pending.delete(requestId)
      res.writeHead(504, { 'Content-Type': 'text/plain' })
      res.end('Tunnel request timed out')
    }, 30000)

    tunnel.pending.set(requestId, { res, timer })

    // Send request to tunnel client
    const msg = {
      type: 'request',
      requestId,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body.length > 0 ? body.toString('base64') : null,
      bodyEncoding: 'base64',
    }

    tunnel.ws.send(JSON.stringify(msg))
  })
})

server.listen(PORT, () => {
  console.log(`[BORE RELAY] Listening on port ${PORT}`)
  console.log(`[BORE RELAY] Base domain: ${BASE_DOMAIN}`)
  console.log(`[BORE RELAY] WebSocket: ws://localhost:${PORT}/ws/connect`)
})
