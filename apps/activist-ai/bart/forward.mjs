// The model's way in for "On this Mac" mode: the agent runs on Bart's Mac, and its model requests
// come here over Tailscale. Ola's gateway listens only on 127.0.0.1:4180 and stays that way; this
// passes each TCP connection to it byte for byte, so the gateway's own token check is the gate (the
// Mac uses the `bart` caller token). Listens only on the address given. No dependencies.
//
//   node forward.mjs <listen-host> <listen-port> [target-port]
import net from 'node:net'

const [host, port, target = '4180'] = process.argv.slice(2)
if (!host || !port) {
  console.error('usage: node forward.mjs <listen-host> <listen-port> [target-port]')
  process.exit(2)
}
const MAX = 32
let open = 0
const server = net.createServer((client) => {
  if (open >= MAX) return client.destroy()
  open++
  const upstream = net.connect({ host: '127.0.0.1', port: Number(target) })
  const done = () => {
    client.destroy()
    upstream.destroy()
  }
  client.once('close', () => open--)
  client.on('error', done)
  upstream.on('error', done)
  client.setTimeout(15 * 60 * 1000, done)
  client.pipe(upstream).pipe(client)
})
server.on('error', (e) => {
  console.error(`forward: ${e.code ?? e.message}`)
  process.exit(1)
})
server.listen(Number(port), host, () => console.log(`forward listening on ${host}:${port} -> 127.0.0.1:${target}`))
