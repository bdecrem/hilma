#!/usr/bin/env node
// The side door (OLA-457): a way in to an Ola machine that has no public address yet, for the person
// in the same room. Bart, Nov 25: "i want the iphone app to just point me, the only user, at the Studio
// right here in my room. Then on Monday it moves to the stanford office and we care about other people".
//
//   node ops/sidedoor.mjs            listens on every address of this machine, port 4780 (OLA_SIDEDOOR_PORT)
//
// What it is: a plain HTTP listener that passes each request to this machine's own secure front
// (127.0.0.1:4743, OLA_SIDEDOOR_FRONT) the way the public tunnel would: the PROXY line with the caller's
// address, then TLS for Ola's own name with the certificate checked, and the Host (and Origin) the front
// desk expects. Nothing in the front desk or the secure front changes; every sign-in rule still applies.
// The iPhone app is pointed at it on its sign-in screen: Server, "ola-studio.local:4780".
//
// What it costs: between the phone and this machine the traffic is plain HTTP, readable by anyone on the
// same network. That is acceptable on Bart's own network for his own test account, and for nobody else.
// A STOPGAP WITH ITS REMOVAL: when the machine has its public address (README step 10, the address
// move), stop this and delete it; `ops/studio.mjs check` should then find nothing on port 4780.
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const env = { ...process.env }
try {
  for (const l of readFileSync(path.join(homedir(), '.ola/frontdesk.env'), 'utf8').split('\n')) {
    const m = l.match(/^(OLA_FD_ORIGIN)=(.*)$/)
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {}
const PORT = Number(env.OLA_SIDEDOOR_PORT || 4780)
const ORIGIN = new URL(env.OLA_FD_ORIGIN || 'https://app.ola.cx')
const [FRONT_HOST, FRONT_PORT] = (env.OLA_SIDEDOOR_FRONT || '127.0.0.1:4743').split(':')

/** The caller's address as the PROXY line wants it. */
function proxyLine(addr, port) {
  let a = String(addr || '127.0.0.1').replace(/%.*$/, '')
  if (a.startsWith('::ffff:')) a = a.slice(7)
  return net.isIPv6(a) ? `PROXY TCP6 ${a} ::1 ${port || 50000} ${FRONT_PORT}\r\n` : `PROXY TCP4 ${net.isIPv4(a) ? a : '127.0.0.1'} 127.0.0.1 ${port || 50000} ${FRONT_PORT}\r\n`
}

/** One connection to the secure front for one request: the PROXY line, then TLS for Ola's name. */
function agentFor(req) {
  const agent = new https.Agent({ keepAlive: false })
  agent.createConnection = (_opts, cb) => {
    const raw = net.connect(Number(FRONT_PORT), FRONT_HOST)
    raw.once('error', cb)
    raw.once('connect', () => {
      raw.write(proxyLine(req.socket.remoteAddress, req.socket.remotePort))
      const t = tls.connect({ socket: raw, servername: ORIGIN.hostname }, () => cb(null, t))
      t.once('error', cb)
    })
  }
  return agent
}

const server = http.createServer((req, res) => {
  const headers = { ...req.headers, host: ORIGIN.host }
  if (headers.origin) headers.origin = ORIGIN.origin
  if (headers.referer) headers.referer = String(headers.referer).replace(/^https?:\/\/[^/]+/, ORIGIN.origin)
  for (const h of ['x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'forwarded']) delete headers[h]
  const up = https.request({ host: FRONT_HOST, port: Number(FRONT_PORT), servername: ORIGIN.hostname, method: req.method, path: req.url, headers, agent: agentFor(req) }, (r) => {
    const out = { ...r.headers }
    delete out['strict-transport-security'] // this address is plain HTTP
    // The page's own rule to turn every load into https would break it here: this address has no https.
    if (out['content-security-policy']) out['content-security-policy'] = String(out['content-security-policy']).replace(/;?\s*upgrade-insecure-requests/gi, '')
    // A browser on this address keeps a cookie only without Secure and without the __Host- prefix's rules;
    // the apps use no cookie at all. Enough for choosing a password from an invitation link.
    if (out['set-cookie']) out['set-cookie'] = [].concat(out['set-cookie']).map((c) => c.replace(/;\s*Secure/gi, ''))
    // One line per request, no content: when, from where, what, the answer (to see whether a phone gets here at all).
    console.log(`${new Date().toISOString()} ${String(req.socket.remoteAddress).replace('::ffff:', '')} ${req.method} ${String(req.url).split('?')[0].slice(0, 80)} ${r.statusCode}`)
    res.writeHead(r.statusCode || 502, out)
    r.pipe(res)
  })
  up.on('error', (e) => {
    console.log(`${new Date().toISOString()} ${String(req.socket.remoteAddress).replace('::ffff:', '')} ${req.method} ${String(req.url).split('?')[0].slice(0, 80)} FAILED ${e.code || e.message}`)
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('The Ola on this machine did not answer.')
  })
  req.on('aborted', () => up.destroy())
  res.on('close', () => up.destroy())
  req.pipe(up)
})
server.keepAliveTimeout = 65_000
server.listen(PORT, '::', () => console.log(`${new Date().toISOString()} side door on port ${PORT} -> ${FRONT_HOST}:${FRONT_PORT} as ${ORIGIN.host}`))
