#!/usr/bin/env node
// The door: the host end of a workspace's one way out.
//
//   node door.mjs <socket path> [gateway port, default 4180]
//
// Listens on a unix socket that `ws.mjs` mounts into one workspace VM (the VM has no
// network interface but loopback, so this socket is the only thing it can reach on the
// host). Every connection is piped, byte for byte, to 127.0.0.1:<gateway port>, and to
// nothing else: the destination is fixed here, not chosen by anything the VM sends. The
// gateway then checks the bearer token like for any caller.
//
// It reads nothing and logs nothing about what passes through. It caps connections at
// once (a VM cannot exhaust the host's file descriptors through it) and closes idle ones.
import net from 'node:net'
import { chmodSync, existsSync, unlinkSync } from 'node:fs'

const [sock, portArg = '4180'] = process.argv.slice(2)
const port = Number(portArg)
if (!sock || !sock.startsWith('/') || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('usage: node door.mjs <absolute socket path> [gateway port]')
  process.exit(2)
}
const MAX_OPEN = 32
const IDLE_MS = 15 * 60 * 1000 // longer than the gateway's total timeout (10 min)

process.umask(0o077)
if (existsSync(sock)) unlinkSync(sock)
let open = 0
const server = net.createServer({ allowHalfOpen: false, pauseOnConnect: true }, (inside) => {
  if (open >= MAX_OPEN) return inside.destroy()
  open++
  const gw = net.connect({ host: '127.0.0.1', port })
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    open--
    inside.destroy()
    gw.destroy()
  }
  for (const s of [inside, gw]) {
    s.setTimeout(IDLE_MS, close)
    s.on('error', close)
    s.on('close', close)
  }
  gw.on('connect', () => {
    inside.pipe(gw)
    gw.pipe(inside)
    inside.resume()
  })
})
server.on('error', (e) => {
  console.error(`door: ${e.code || e.name}`)
  process.exit(1)
})
server.listen(sock, () => {
  // The VM sees the socket with the host's mode and owner root, so the `work` user needs
  // 0666 to connect. On the host the socket sits in a folder of mode 700, which is what
  // keeps other host accounts out.
  chmodSync(sock, 0o666)
  console.log(JSON.stringify({ t: new Date().toISOString(), event: 'door-open', port }))
})
const stop = () => {
  server.close()
  try {
    unlinkSync(sock)
  } catch {}
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
