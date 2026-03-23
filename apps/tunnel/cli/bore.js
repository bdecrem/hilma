#!/usr/bin/env node

/**
 * BORE CLI — expose localhost to the internet via a tunnel relay.
 *
 * Usage: bore http <port> [--subdomain <name>] [--relay <url>] [--json]
 *
 * Exit codes:
 *   0 — clean shutdown
 *   1 — auth error
 *   2 — connection failed
 *   3 — subdomain taken
 */

import WebSocket from 'ws'
import http from 'http'

const args = process.argv.slice(2)

function usage() {
  console.error(`Usage: bore http <port> [options]

Options:
  --subdomain <name>   Request a specific subdomain
  --relay <url>        Relay server WebSocket URL (default: ws://localhost:4040/ws/connect)
  --json               Output connection info as JSON (for agents)
  --help               Show this help`)
  process.exit(1)
}

// Parse args
if (args[0] === '--help' || args[0] === '-h') usage()
if (args[0] !== 'http') {
  console.error('Error: only "bore http <port>" is supported')
  usage()
}

const port = parseInt(args[1])
if (!port || isNaN(port)) {
  console.error('Error: port must be a number')
  usage()
}

let subdomain = null
let relayUrl = process.env.BORE_RELAY || 'wss://bore.cx/ws/connect'
let jsonMode = false

for (let i = 2; i < args.length; i++) {
  if (args[i] === '--subdomain' && args[i + 1]) { subdomain = args[++i] }
  else if (args[i] === '--relay' && args[i + 1]) { relayUrl = args[++i] }
  else if (args[i] === '--json') { jsonMode = true }
}

// Connection with exponential backoff
let backoff = 1000
let connected = false

function connect() {
  const ws = new WebSocket(relayUrl)

  ws.on('open', () => {
    backoff = 1000
    ws.send(JSON.stringify({ type: 'register', subdomain }))
  })

  ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }

    if (msg.type === 'registered') {
      connected = true
      if (jsonMode) {
        console.log(JSON.stringify({ url: msg.url, subdomain: msg.subdomain }))
      } else {
        console.log(`\n  bore tunnel ready\n`)
        console.log(`  forwarding  ${msg.url} → http://localhost:${port}\n`)
      }
    }

    if (msg.type === 'error') {
      if (msg.code === 3) {
        console.error(`Error: subdomain '${subdomain}' is already taken`)
        process.exit(3)
      }
      console.error(`Error: ${msg.message}`)
      process.exit(2)
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }))
    }

    if (msg.type === 'request') {
      handleRequest(ws, msg)
    }
  })

  ws.on('close', () => {
    if (connected) {
      connected = false
      if (!jsonMode) console.log('Tunnel disconnected. Reconnecting...')
    }
    setTimeout(() => {
      backoff = Math.min(backoff * 2, 30000)
      connect()
    }, backoff)
  })

  ws.on('error', (err) => {
    if (!connected && backoff === 1000) {
      console.error(`Error: could not connect to relay at ${relayUrl}`)
      console.error(`  ${err.message}`)
      // Don't exit — will retry via close handler
    }
  })
}

function handleRequest(ws, msg) {
  const options = {
    hostname: 'localhost',
    port,
    path: msg.url,
    method: msg.method,
    headers: { ...msg.headers },
  }

  // Rewrite host header to localhost
  options.headers.host = `localhost:${port}`
  delete options.headers['x-forwarded-for']

  const proxyReq = http.request(options, (proxyRes) => {
    const chunks = []
    proxyRes.on('data', (chunk) => chunks.push(chunk))
    proxyRes.on('end', () => {
      const body = Buffer.concat(chunks)

      // Filter hop-by-hop headers
      const headers = { ...proxyRes.headers }
      delete headers['transfer-encoding']
      delete headers['connection']

      ws.send(JSON.stringify({
        type: 'response',
        requestId: msg.requestId,
        statusCode: proxyRes.statusCode,
        headers,
        body: body.toString('base64'),
        encoding: 'base64',
      }))
    })
  })

  proxyReq.on('error', (err) => {
    ws.send(JSON.stringify({
      type: 'response',
      requestId: msg.requestId,
      statusCode: 502,
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from(`Local server error: ${err.message}`).toString('base64'),
      encoding: 'base64',
    }))
  })

  // Send body if present
  if (msg.body) {
    proxyReq.write(Buffer.from(msg.body, msg.bodyEncoding || 'base64'))
  }
  proxyReq.end()
}

// Graceful shutdown
process.on('SIGINT', () => {
  if (!jsonMode) console.log('\nShutting down tunnel...')
  process.exit(0)
})

connect()
