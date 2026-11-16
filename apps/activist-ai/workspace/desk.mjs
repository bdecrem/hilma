#!/usr/bin/env node
// The desk: the host's way in to a workspace's opencode.
//
//   node desk.mjs <socket path> <container name, ola-<id>>
//
// Listens on a unix socket on the host (~/.ola/ws/<id>/opencode.sock, mode 600 in a folder of
// mode 700). Every connection becomes one `container exec -i <container> socat STDIO
// TCP:127.0.0.1:4096` inside the VM, so the bytes travel over Apple's exec channel and reach
// opencode on the VM's loopback.
//
// Why not `--publish-socket`: Apple's in-VM init (vminitd) looks for a published socket on the
// container's root file system as it sits on disk, not in the container's own mounts, so the
// socket would have to live on a writable root. A writable root let the agent write past its
// disk limit (the root is a 512 GiB sparse image on the host) and keep files outside /work
// across a stop (review of 2026-11-16). With the desk, the root stays read-only.
//
// It reads nothing and logs nothing about what passes through, and caps connections at once.
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, unlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'

const [sock, name] = process.argv.slice(2)
if (!sock || !sock.startsWith('/') || !/^ola-[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(name || '')) {
  console.error('usage: node desk.mjs <absolute socket path> <ola-<id>>')
  process.exit(2)
}
const CONTAINER = process.env.OLA_CONTAINER_BIN || '/usr/local/bin/container'
const MAX_OPEN = 16
const IDLE_MS = 15 * 60 * 1000

process.umask(0o077)
if (existsSync(sock)) unlinkSync(sock)
let open = 0
const server = net.createServer({ allowHalfOpen: true }, (outside) => {
  if (open >= MAX_OPEN) return outside.destroy()
  open++
  const child = spawn(CONTAINER, ['exec', '-i', name, 'socat', '-t', '60', 'STDIO', 'TCP:127.0.0.1:4096'], { stdio: ['pipe', 'pipe', 'ignore'] })
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    open--
    outside.destroy()
    child.kill('SIGTERM')
  }
  outside.setTimeout(IDLE_MS, close)
  outside.on('error', close)
  outside.on('close', close)
  child.on('error', close)
  child.on('close', close)
  child.stdin.on('error', close)
  child.stdout.on('error', close)
  outside.pipe(child.stdin)
  child.stdout.pipe(outside)
})
server.on('error', (e) => {
  console.error(`desk: ${e.code || e.name}`)
  process.exit(1)
})
server.listen(sock, () => {
  chmodSync(sock, 0o600)
  if (process.env.OLA_PIDFILE) writeFileSync(process.env.OLA_PIDFILE, String(process.pid), { mode: 0o600 })
  console.log(JSON.stringify({ t: new Date().toISOString(), event: 'desk-open', container: name }))
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
