// Review 4 (2026-11-17), the fetch route's address check: every encoded spelling of a private,
// loopback, link-local, CGNAT, metadata or reserved address must be refused before a connection.
// Pure function, no network: `node frontdesk/review/rev4-addr.mjs` exits 1 on any miss.
import { refusedAddress, fetchItem } from '../../gateway/web.mjs'

const own = new Set(['171.66.240.175', '100.95.51.98'])
const mustRefuse = [
  'https://2130706433/', 'https://0x7f.1/', 'https://0177.0.0.1/', 'https://127.1/', 'https://0/',
  'https://[::ffff:127.0.0.1]/', 'https://[0:0:0:0:0:ffff:7f00:1]/', 'https://[::127.0.0.1]/',
  'https://[::ffff:0:127.0.0.1]/', // SIIT, IPv4-translated (RFC 6052 / 7915)
  'https://[64:ff9b::127.0.0.1]/', 'https://[64:ff9b:1::7f00:1]/', // NAT64, well-known and local-use (RFC 8215)
  'https://[2002:7f00:1::]/', 'https://[fd7a:115c:a1e0::1]/', 'https://[fe80::1]/', 'https://[::]/',
  'https://169.254.169.254/', 'https://[::ffff:a9fe:a9fe]/', 'https://100.100.100.100/', 'https://100.95.51.98/',
  'https://171.66.240.175/', 'https://１２７.0.0.1/', 'https://224.0.0.1/', 'https://255.255.255.255/',
  'https://[2001:db8::1]/', 'https://[3fff::1]/', 'https://[ff02::1]/', 'https://[2001:10::1]/',
]
let bad = 0
for (const u of mustRefuse) {
  let host
  try {
    host = new URL(fetchItem(u)).hostname.replace(/^\[|\]$/g, '')
  } catch {
    console.log(`ok    ${u} (not a URL)`)
    continue
  }
  const why = refusedAddress(host, own)
  if (!why) bad++
  console.log(`${why ? 'ok   ' : 'MISS '} ${u.padEnd(36)} ${host.padEnd(24)} ${why ?? 'ALLOWED'}`)
}
for (const u of ['https://8.8.8.8/', 'https://[2606:4700::1111]/', 'https://[::ffff:8.8.8.8]/']) {
  const why = refusedAddress(new URL(u).hostname.replace(/^\[|\]$/g, ''), own)
  if (why) bad++
  console.log(`${why ? 'OVER ' : 'ok   '} ${u.padEnd(36)} public: ${why ?? 'allowed'}`)
}
// M3: a neighbor on any network this machine sits on (at CASBS, 171.66.240.0/24: public
// addresses, so the private-range list alone let them through) is refused too.
const { ownNetworks } = await import('../../gateway/web.mjs')
const { networkInterfaces } = await import('node:os')
const nets = ownNetworks()
for (const i of Object.values(networkInterfaces()).flat()) {
  if (!i || i.internal || (i.family !== 'IPv4' && i.family !== 4) || i.cidr?.endsWith('/32')) continue
  const p = i.address.split('.').map(Number)
  const neighbor = `${p[0]}.${p[1]}.${p[2]}.${p[3] === 1 ? 2 : 1}`
  const refused = nets.check(neighbor, 'ipv4')
  if (!refused) bad++
  console.log(`${refused ? 'ok   ' : 'MISS '} a neighbor on ${i.cidr}: ${neighbor} ${refused ? 'refused' : 'ALLOWED'}`)
}
console.log(bad ? `${bad} wrong` : 'all right')
process.exit(bad ? 1 : 0)
