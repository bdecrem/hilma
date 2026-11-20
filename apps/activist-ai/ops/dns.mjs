#!/usr/bin/env node
// ola.cx's DNS at Namecheap, changed without losing a record. Runs on the iMac: Namecheap answers
// API calls only from a whitelisted address, and its key stays there (~/.plumb/config.json, the
// file plumb uses; nothing from it is printed).
//
//   node ops/dns.mjs show                          every record, with the zone's mail setting
//   node ops/dns.mjs backup <file>                 the whole record set as JSON (mode 600)
//   node ops/dns.mjs diff <backup file>            what differs from a backup, record by record
//   node ops/dns.mjs set <host> <type> <value> [--ttl 1800]
//                                                  every record of that host and type replaced by this one
//   node ops/dns.mjs remove <host> <type>          every record of that host and type removed
//
// Why not plumb's own `dns add`: Namecheap's setHosts replaces EVERY record of the domain, and
// plumb's read drops each MX record's priority and the zone's EmailType, so writing back what it
// read would change the mail records. Here a write is always: read all, change one host+type,
// write all (MX priorities and EmailType included), read again, and compare with what was meant;
// if anything else differs, the record set read before the write is written back and the command
// fails. It refuses to write a zone that reads back with fewer than 3 records (a parse gone wrong
// must not become an empty zone).
import { chmodSync, readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const DOMAIN = process.env.OLA_DNS_DOMAIN || 'ola.cx'
const [SLD, TLD] = DOMAIN.split('.')
const API = 'https://api.namecheap.com/xml.response'
const fail = (m) => {
  console.error(`dns: ${m}`)
  process.exit(1)
}

function creds() {
  let c
  try {
    c = JSON.parse(readFileSync(path.join(homedir(), '.plumb/config.json'), 'utf8')).namecheap
  } catch {
    fail('no Namecheap settings in ~/.plumb/config.json (see ../tunn3l/plumb/SETUP.md)')
  }
  if (!c?.api_user || !c?.api_key) fail('~/.plumb/config.json has no namecheap api_user/api_key')
  return c
}
async function clientIp(c) {
  if (c.client_ip && c.client_ip !== 'auto') return c.client_ip
  const r = await fetch('https://api.ipify.org')
  return (await r.text()).trim()
}
const unxml = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const attrs = (s) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], unxml(m[2])]))

/** POSTs a command (the key travels in the body, never in a URL). Errors carry Namecheap's message only. */
async function call(command, params = {}) {
  const c = creds()
  const body = new URLSearchParams({ ApiUser: c.api_user, ApiKey: c.api_key, UserName: c.api_user, ClientIp: await clientIp(c), Command: command, ...params })
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  const text = await r.text()
  if (!/Status="OK"/.test(text)) {
    const e = /<Error[^>]*>([\s\S]*?)<\/Error>/.exec(text)?.[1] ?? `HTTP ${r.status}`
    throw new Error(`Namecheap ${command}: ${unxml(e).replaceAll(c.api_key, '<key>')}`)
  }
  return text
}

/** The whole zone: { emailType, hosts: [{ name, type, address, mxPref, ttl }] }. */
export async function read() {
  const x = await call('namecheap.domains.dns.getHosts', { SLD, TLD })
  const head = /<DomainDNSGetHostsResult\s([^>]*)>/.exec(x)
  if (!head) throw new Error('Namecheap getHosts: no result element')
  const h = attrs(head[1])
  if (h.IsUsingOurDNS !== 'true') throw new Error(`${DOMAIN} is not on Namecheap BasicDNS`)
  const hosts = [...x.matchAll(/<host\s([^>]*?)\/?>/gi)].map((m) => {
    const a = attrs(m[1])
    return { name: a.Name, type: a.Type, address: a.Address, mxPref: a.MXPref ?? '10', ttl: a.TTL ?? '1800' }
  })
  return { domain: DOMAIN, emailType: h.EmailType ?? '', hosts }
}

const key = (r) => `${r.name}\t${r.type}\t${r.address}\t${r.type === 'MX' ? r.mxPref : ''}\t${r.ttl}`
/** Records in a but not in b, and in b but not in a, plus the mail setting. */
export function diff(a, b) {
  const ka = a.hosts.map(key)
  const kb = b.hosts.map(key)
  const count = (l) => l.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map())
  const ca = count(ka)
  const cb = count(kb)
  const only = (x, y) => [...x].flatMap(([k, n]) => Array(Math.max(0, n - (y.get(k) ?? 0))).fill(k))
  return { removed: only(ca, cb), added: only(cb, ca), emailType: a.emailType === b.emailType ? null : [a.emailType, b.emailType] }
}
const same = (d) => !d.removed.length && !d.added.length && !d.emailType

async function writeAll(zone) {
  const p = { SLD, TLD }
  if (zone.emailType) p.EmailType = zone.emailType
  zone.hosts.forEach((r, i) => {
    const n = i + 1
    p[`HostName${n}`] = r.name
    p[`RecordType${n}`] = r.type
    p[`Address${n}`] = r.address
    p[`TTL${n}`] = r.ttl
    if (r.type === 'MX') p[`MXPref${n}`] = r.mxPref
  })
  await call('namecheap.domains.dns.setHosts', p)
}

/** Read all, change, write all, read again, compare; on any surprise put the old set back and fail. */
export async function change(mutate, what) {
  const before = await read()
  if (before.hosts.length < 3) throw new Error(`${DOMAIN} read back with ${before.hosts.length} records; refusing to write the whole zone from that`)
  const meant = { ...before, hosts: mutate(before.hosts.map((r) => ({ ...r }))) }
  const intended = diff(before, meant)
  if (same(intended)) return console.log(`no change: ${what}`)
  await writeAll(meant)
  const after = await read()
  const d = diff(meant, after)
  if (!same(d)) {
    await writeAll(before)
    const back = diff(before, await read())
    throw new Error(`after "${what}" the zone was not what was meant (${JSON.stringify(d)}); the previous record set was written back (${same(back) ? 'and reads back the same' : `BUT IT DIFFERS: ${JSON.stringify(back)}`})`)
  }
  for (const k of intended.removed) console.log(`- ${k.replaceAll('\t', ' ')}`)
  for (const k of intended.added) console.log(`+ ${k.replaceAll('\t', ' ')}`)
  console.log(`ok: ${what}; the other ${before.hosts.length - intended.removed.length} records and EmailType=${before.emailType} read back unchanged`)
}

const show = (z) => {
  console.log(`${z.domain} EmailType=${z.emailType} (${z.hosts.length} records)`)
  for (const r of z.hosts) console.log(`  ${r.name.padEnd(28)} ${r.type.padEnd(6)} ${r.type === 'MX' ? `${r.mxPref} ` : ''}${r.address}  ttl ${r.ttl}`)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url).pathname)) {
  const [cmd, ...a] = process.argv.slice(2)
  const ttl = a.includes('--ttl') ? a[a.indexOf('--ttl') + 1] : '1800'
  const pos = a.filter((x, i) => x !== '--ttl' && a[i - 1] !== '--ttl')
  try {
    if (cmd === 'show') show(await read())
    else if (cmd === 'backup') {
      if (!pos[0]) fail('usage: backup <file>')
      const z = await read()
      writeFileSync(pos[0], JSON.stringify({ at: new Date().toISOString(), ...z }, null, 2) + '\n', { mode: 0o600 })
      chmodSync(pos[0], 0o600)
      console.log(`saved ${z.hosts.length} records and EmailType=${z.emailType} to ${pos[0]}`)
    } else if (cmd === 'diff') {
      if (!pos[0]) fail('usage: diff <backup file>')
      const d = diff(JSON.parse(readFileSync(pos[0], 'utf8')), await read())
      for (const k of d.removed) console.log(`- ${k.replaceAll('\t', ' ')}`)
      for (const k of d.added) console.log(`+ ${k.replaceAll('\t', ' ')}`)
      if (d.emailType) console.log(`EmailType ${d.emailType[0]} -> ${d.emailType[1]}`)
      if (same(d)) console.log('identical to the backup')
    } else if (cmd === 'set') {
      const [name, type, value] = pos
      if (!name || !type || value === undefined) fail('usage: set <host> <type> <value> [--ttl N]')
      await change((hs) => [...hs.filter((r) => !(r.name === name && r.type === type)), { name, type, address: value, mxPref: '10', ttl }], `set ${name} ${type}`)
    } else if (cmd === 'remove') {
      const [name, type] = pos
      if (!name || !type) fail('usage: remove <host> <type>')
      await change((hs) => hs.filter((r) => !(r.name === name && r.type === type)), `remove ${name} ${type}`)
    } else if (cmd === 'present' || cmd === 'cleanup') {
      // lego's exec DNS provider: `present|cleanup <fqdn> <value>`, e.g. _acme-challenge.app.ola.cx.
      // Only an _acme-challenge TXT under this domain can be touched this way.
      const [fqdn, value] = pos
      const name = String(fqdn ?? '').replace(/\.$/, '')
      if (!name.endsWith(`.${DOMAIN}`) || !name.startsWith('_acme-challenge.') || !/^[A-Za-z0-9_-]{20,128}$/.test(value ?? '')) fail(`${cmd}: not an ACME challenge for ${DOMAIN}`)
      const host = name.slice(0, -DOMAIN.length - 1)
      if (cmd === 'present') await change((hs) => [...hs.filter((r) => !(r.name === host && r.type === 'TXT' && r.address === value)), { name: host, type: 'TXT', address: value, mxPref: '10', ttl: '60' }], `present ${host} TXT`)
      else await change((hs) => hs.filter((r) => !(r.name === host && r.type === 'TXT' && r.address === value)), `cleanup ${host} TXT`)
    } else fail('usage: node ops/dns.mjs show | backup <file> | diff <file> | set <host> <type> <value> [--ttl N] | remove <host> <type>')
  } catch (e) {
    fail(e.message)
  }
}
