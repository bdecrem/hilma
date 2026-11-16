#!/usr/bin/env node
// The door: the host end of a workspace's one way out.
//
//   node door.mjs <socket path> <gateway: its door socket for this workspace, or a port>
//
// Listens on a unix socket that `ws.mjs` mounts into one workspace VM (the VM has no
// network interface but loopback, so this socket is the only thing it can reach on the
// host). Every connection is piped, byte for byte, to the gateway, and to nothing else: the
// destination is fixed here, not chosen by anything the VM sends. ws.mjs gives each door the
// gateway's socket for that workspace (~/.ola/gw/ws-<id>.sock), so the gateway knows which
// door a connection came through and accepts only that workspace's token on it.
// (A port, 127.0.0.1:<port>, is still accepted for a gateway without door sockets.)
//
// It reads nothing and logs nothing about what passes through. It caps connections at
// once (a VM cannot exhaust the host's file descriptors through it) and closes idle ones.
import net from 'node:net'
import { chmodSync, existsSync, unlinkSync, writeFileSync } from 'node:fs'

const [sock, target = '4180'] = process.argv.slice(2)
const port = /^\d+$/.test(target) ? Number(target) : null
if (!sock || !sock.startsWith('/') || (port === null ? !target.startsWith('/') : port < 1 || port > 65535)) {
  console.error('usage: node door.mjs <absolute socket path> <absolute gateway socket path | gateway port>')
  process.exit(2)
}
const dial = () => (port === null ? net.connect({ path: target }) : net.connect({ host: '127.0.0.1', port }))
const MAX_OPEN = 32
const IDLE_MS = 15 * 60 * 1000 // longer than the gateway's total timeout (10 min)

process.umask(0o077)
if (existsSync(sock)) unlinkSync(sock)
let open = 0
const server = net.createServer({ allowHalfOpen: false, pauseOnConnect: true }, (inside) => {
  if (open >= MAX_OPEN) return inside.destroy()
  open++
  const gw = dial()
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
  // Under launchd (OLA_PIDFILE), the door says its own pid, so ws.mjs finds it after a restart.
  if (process.env.OLA_PIDFILE) writeFileSync(process.env.OLA_PIDFILE, String(process.pid), { mode: 0o600 })
  console.log(JSON.stringify({ t: new Date().toISOString(), event: 'door-open', to: port === null ? 'socket' : 'port' }))
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
