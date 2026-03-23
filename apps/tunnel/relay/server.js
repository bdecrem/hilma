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
    // Landing page
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bore.cx — tunnel service for AI agents</title>
<meta name="description" content="Expose localhost to the internet. One command. No config.">
<meta property="og:title" content="bore.cx">
<meta property="og:description" content="Expose localhost to the internet. One command. Built for AI agents.">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(180deg,#1a1a18,#2a2218);color:#fff;min-height:100vh}
.container{max-width:720px;margin:0 auto;padding:80px 24px}
h1{font-size:3.5rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:12px}
.sub{color:rgba(255,255,255,0.35);font-size:1.1rem;margin-bottom:48px;line-height:1.6}
.terminal{background:#0a0a08;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;margin-bottom:32px}
.terminal-bar{background:rgba(255,255,255,0.05);padding:8px 16px;display:flex;gap:6px}
.dot{width:10px;height:10px;border-radius:50%;opacity:0.5}
.terminal-body{padding:24px;font-family:monospace;font-size:0.9rem;line-height:1.8}
.cmd{color:#FFF8E7}
.ok{color:#B4E33D}
.url{color:#FC913A}
.dim{color:#666}
.install{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:12px 20px;font-family:monospace;font-size:0.9rem;color:rgba(255,255,255,0.7);display:inline-block;margin-bottom:8px}
.hint{color:rgba(255,255,255,0.2);font-size:0.8rem;margin-bottom:48px}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px;margin-bottom:64px}
.feature .dot-indicator{width:8px;height:8px;border-radius:50%;margin-bottom:12px}
.feature h3{font-size:1rem;margin-bottom:8px}
.feature p{color:rgba(255,255,255,0.3);font-size:0.85rem;line-height:1.5}
.footer{border-top:1px solid rgba(255,255,255,0.05);padding-top:24px;display:flex;justify-content:space-between;color:rgba(255,255,255,0.15);font-size:0.75rem;font-family:monospace}
.footer a{color:rgba(255,255,255,0.25);text-decoration:none}
.stats{color:rgba(255,255,255,0.15);font-family:monospace;font-size:0.75rem;margin-bottom:48px}
</style>
</head>
<body>
<div class="container">
<h1>bore</h1>
<p class="sub">Expose localhost to the internet. One command. No config.<br>Built for AI agents that need to reach your machine from anywhere.</p>

<div class="terminal">
<div class="terminal-bar">
<div class="dot" style="background:#FF4E50"></div>
<div class="dot" style="background:#F9D423"></div>
<div class="dot" style="background:#B4E33D"></div>
</div>
<div class="terminal-body">
<div class="cmd">$ bore http 3000</div>
<div>&nbsp;</div>
<div class="ok">bore: tunnel ready</div>
<div class="url">bore: https://myapp.bore.cx → localhost:3000</div>
<div>&nbsp;</div>
<div class="dim">bore: request  GET /api/hello  200  12ms</div>
</div>
</div>

<div class="install">npx bore-tunnel http 3000</div>
<p class="hint">no install needed</p>

<div class="features">
<div class="feature">
<div class="dot-indicator" style="background:#FC913A"></div>
<h3>Agent-first</h3>
<p>JSON output, exit codes, env var config. Zero interactive prompts. Built for AI agents.</p>
</div>
<div class="feature">
<div class="dot-indicator" style="background:#B4E33D"></div>
<h3>One command</h3>
<p>Works through firewalls, NAT, hotel wifi. Outbound WebSocket — nothing to configure.</p>
</div>
<div class="feature">
<div class="dot-indicator" style="background:#FF4E50"></div>
<h3>SSH access</h3>
<p>bore ssh gives your machine a public hostname. SSH from anywhere. No port forwarding.</p>
</div>
</div>

<p class="stats">${tunnels.size} active tunnel${tunnels.size !== 1 ? 's' : ''} right now</p>

<div class="footer">
<span>bore.cx</span>
<a href="https://github.com/bdecrem/hilma" target="_blank">GitHub</a>
</div>
</div>
</body>
</html>`)
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
