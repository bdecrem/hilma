/**
 * BORE Relay Server
 *
 * HTTP server that upgrades to WebSocket at /ws/connect (tunnel control)
 * and /ws/tcp (inbound TCP proxy connections for SSH/TCP tunnels).
 * Maps subdomains to active WebSocket tunnels and relays HTTP or TCP traffic.
 */

import http from 'http'
import { WebSocketServer } from 'ws'
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { initDb, upsertSubdomain, recordConnect, recordDisconnect } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let INSTALL_SCRIPT
try {
  INSTALL_SCRIPT = readFileSync(join(__dirname, 'install.sh'), 'utf-8')
} catch {
  INSTALL_SCRIPT = '#!/bin/sh\necho "Install script not found. Visit https://bore.cx for instructions."\nexit 1\n'
}

const PORT = parseInt(process.env.PORT || '4040')
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'localhost'

// Registry: subdomain → { ws, mode, pending, tcpStreams, requestCount, connectionId }
// mode: "http" (default) or "tcp"
// tcpStreams: Map<streamId, proxyWs> — only used in tcp mode
const tunnels = new Map()

function generateId() {
  return crypto.randomBytes(8).toString('hex')
}

import { ADJECTIVES, NOUNS } from './words.js'

function generateSubdomain() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj}-${noun}`
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

// WebSocket servers: control (tunnel registration) and tcp (proxy connections)
const server = http.createServer()
const wss = new WebSocketServer({ noServer: true })
const wssTcp = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname === '/ws/connect') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else if (url.pathname === '/ws/tcp') {
    wssTcp.handleUpgrade(req, socket, head, (ws) => {
      wssTcp.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws) => {
  let registeredSubdomain = null

  ws.on('message', (data, isBinary) => {
    // Binary frames: TCP data from CLI → proxy
    if (isBinary) {
      const buf = Buffer.from(data)
      if (buf.length < 8 || !registeredSubdomain) return
      const streamId = buf.subarray(0, 8).toString('ascii')
      const payload = buf.subarray(8)
      const tunnel = tunnels.get(registeredSubdomain)
      if (!tunnel) return
      const proxyWs = tunnel.tcpStreams.get(streamId)
      if (proxyWs && proxyWs.readyState === proxyWs.OPEN) {
        proxyWs.send(payload)
      }
      return
    }

    // JSON messages: control protocol
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
      const mode = msg.mode === 'tcp' ? 'tcp' : 'http'
      const tunnel = { ws, mode, pending: new Map(), tcpStreams: new Map(), requestCount: 0, connectionId: null }
      tunnels.set(subdomain, tunnel)

      const url = `https://${subdomain}.${BASE_DOMAIN}`

      ws.send(JSON.stringify({ type: 'registered', subdomain, url, mode }))
      console.log(`[TUNNEL] ${subdomain} registered`)

      // Fire-and-forget: persist to Supabase
      upsertSubdomain(subdomain)
        .then(() => recordConnect(subdomain, ws._socket?.remoteAddress))
        .then(connId => { tunnel.connectionId = connId })
        .catch(err => console.error('[DB]', err.message))
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

    if (msg.type === 'tcp-ready') {
      // CLI connected to local port, start relaying
      if (!registeredSubdomain) return
      const tunnel = tunnels.get(registeredSubdomain)
      if (!tunnel) return
      const proxyWs = tunnel.tcpStreams.get(msg.streamId)
      if (proxyWs && proxyWs._buffered) {
        // Flush any data buffered while waiting for tcp-ready
        for (const buf of proxyWs._buffered) {
          const frame = Buffer.alloc(8 + buf.length)
          frame.write(msg.streamId, 0, 8, 'ascii')
          buf.copy(frame, 8)
          ws.send(frame)
        }
        proxyWs._buffered = null // signals "ready" — future data goes straight through
        console.log(`[TCP] ${registeredSubdomain} stream ${msg.streamId} ready`)
      }
    }

    if (msg.type === 'tcp-error') {
      // CLI couldn't connect locally, close the proxy connection
      if (!registeredSubdomain) return
      const tunnel = tunnels.get(registeredSubdomain)
      if (!tunnel) return
      const proxyWs = tunnel.tcpStreams.get(msg.streamId)
      if (proxyWs) {
        proxyWs.close()
        tunnel.tcpStreams.delete(msg.streamId)
      }
    }

    if (msg.type === 'tcp-close') {
      // CLI closed the local socket
      if (!registeredSubdomain) return
      const tunnel = tunnels.get(registeredSubdomain)
      if (!tunnel) return
      const proxyWs = tunnel.tcpStreams.get(msg.streamId)
      if (proxyWs) {
        proxyWs.close()
        tunnel.tcpStreams.delete(msg.streamId)
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
        // Reject all pending HTTP requests
        for (const [, pending] of tunnel.pending) {
          clearTimeout(pending.timer)
          pending.res.writeHead(502)
          pending.res.end('Tunnel disconnected')
        }
        // Close all TCP proxy connections
        for (const [, proxyWs] of tunnel.tcpStreams) {
          proxyWs.close()
        }
        tunnel.tcpStreams.clear()
        // Fire-and-forget: record disconnect
        if (tunnel.connectionId) {
          recordDisconnect(tunnel.connectionId, { requestsServed: tunnel.requestCount || 0 })
            .catch(err => console.error('[DB]', err.message))
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

// TCP proxy connections — inbound from `bore proxy` (SSH clients)
wssTcp.on('connection', (proxyWs, req) => {
  const subdomain = extractSubdomain(req.headers.host)
  if (!subdomain) {
    proxyWs.close()
    return
  }

  const tunnel = tunnels.get(subdomain)
  if (!tunnel || tunnel.mode !== 'tcp') {
    proxyWs.close()
    return
  }

  const streamId = generateId().slice(0, 8) // 8-char hex
  tunnel.tcpStreams.set(streamId, proxyWs)
  proxyWs._buffered = [] // buffer data until CLI sends tcp-ready

  // Tell CLI: new TCP connection arrived
  tunnel.ws.send(JSON.stringify({ type: 'tcp-open', streamId }))

  // Timeout if CLI doesn't respond with tcp-ready
  const readyTimer = setTimeout(() => {
    if (proxyWs._buffered !== null) {
      proxyWs.close()
      tunnel.tcpStreams.delete(streamId)
      tunnel.ws.send(JSON.stringify({ type: 'tcp-close', streamId }))
    }
  }, 10000)

  // Data from proxy (SSH client) → relay → CLI
  proxyWs.on('message', (data) => {
    const buf = Buffer.from(data)
    if (proxyWs._buffered !== null) {
      // Still waiting for tcp-ready, buffer the data
      proxyWs._buffered.push(buf)
      return
    }
    // Forward to CLI as binary frame: [streamId][payload]
    const frame = Buffer.alloc(8 + buf.length)
    frame.write(streamId, 0, 8, 'ascii')
    buf.copy(frame, 8)
    tunnel.ws.send(frame)
  })

  proxyWs.on('close', () => {
    clearTimeout(readyTimer)
    tunnel.tcpStreams.delete(streamId)
    if (tunnel.ws.readyState === tunnel.ws.OPEN) {
      tunnel.ws.send(JSON.stringify({ type: 'tcp-close', streamId }))
    }
  })

  console.log(`[TCP] ${subdomain} stream ${streamId} opened`)
})

// HTTP request handler — relay to tunnel
server.on('request', (req, res) => {
  const subdomain = extractSubdomain(req.headers.host)

  // Health check / root / install
  if (!subdomain || subdomain === 'www') {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, tunnels: tunnels.size }))
      return
    }

    if (req.url === '/install') {
      res.writeHead(200, { 'Content-Type': 'text/x-shellscript' })
      res.end(INSTALL_SCRIPT)
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
.install{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:12px 16px 12px 20px;font-family:monospace;font-size:0.9rem;color:rgba(255,255,255,0.7);display:inline-flex;align-items:center;gap:12px;margin-bottom:48px}
.install code{white-space:nowrap}
.copy-btn{background:none;border:none;padding:4px;cursor:pointer;color:rgba(255,255,255,0.3);transition:all 0.15s;display:flex;align-items:center}
.copy-btn:hover{color:rgba(255,255,255,0.7)}
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
<div class="cmd">$ curl -sSf https://bore.cx/install | sh</div>
<div class="dim">bore: installing darwin/arm64...</div>
<div class="ok">bore: installed to ~/.bore/bin/bore</div>
<div>&nbsp;</div>
<div class="cmd">$ bore http 3000</div>
<div>&nbsp;</div>
<div class="ok">bore: tunnel ready</div>
<div class="url">bore: https://myapp.bore.cx → localhost:3000</div>
</div>
</div>

<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:10px">Get started:</p>
<div class="install">
<code>curl -sSf https://bore.cx/install | sh</code>
<button class="copy-btn" onclick="navigator.clipboard.writeText('curl -sSf https://bore.cx/install | sh').then(()=>{this.innerHTML='<svg width=&quot;16&quot; height=&quot;16&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;#B4E33D&quot; stroke-width=&quot;2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;20 6 9 17 4 12&quot;/></svg>';setTimeout(()=>this.innerHTML='<svg width=&quot;16&quot; height=&quot;16&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><rect x=&quot;9&quot; y=&quot;9&quot; width=&quot;13&quot; height=&quot;13&quot; rx=&quot;2&quot;/><path d=&quot;M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1&quot;/></svg>',2000)})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
</div>

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

  // TCP tunnels don't serve HTTP — tell the client to use bore proxy
  if (tunnel.mode === 'tcp') {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end(`This is a TCP tunnel. Use: ssh user@${subdomain}.${BASE_DOMAIN} -o ProxyCommand="bore proxy %h %p"`)
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
    tunnel.requestCount = (tunnel.requestCount || 0) + 1
  })
})

initDb()

server.listen(PORT, () => {
  console.log(`[BORE RELAY] Listening on port ${PORT}`)
  console.log(`[BORE RELAY] Base domain: ${BASE_DOMAIN}`)
  console.log(`[BORE RELAY] Control: ws://localhost:${PORT}/ws/connect`)
  console.log(`[BORE RELAY] TCP proxy: ws://localhost:${PORT}/ws/tcp`)
})
