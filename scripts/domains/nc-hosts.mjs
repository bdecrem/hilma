// Adds DNS records to a domain on Namecheap BasicDNS without losing the ones
// that are there (the API only replaces the whole set, so this reads it, adds
// what is missing and writes it back). For the things plumb does not do: mail.
//   node scripts/domains/nc-hosts.mjs <domain> list
//   node scripts/domains/nc-hosts.mjs <domain> add TYPE NAME VALUE [mxpref] [TYPE NAME VALUE [mxpref] ...]
//     e.g. add CNAME em123 u1.wl.sendgrid.net MX @ mx.sendgrid.net 10 TXT _dmarc "v=DMARC1; p=none;"
import { ncFetch } from './nc.mjs'
const [domain, cmd, ...rest] = process.argv.slice(2)
if (!domain || !['list', 'add'].includes(cmd)) { console.error('usage: nc-hosts.mjs <domain> list | add TYPE NAME VALUE [mxpref] ...'); process.exit(1) }
const [SLD, ...tld] = domain.split('.'); const TLD = tld.join('.')
const attr = (s, k) => (s.match(new RegExp(`${k}="([^"]*)"`)) || [])[1]
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const xml = await ncFetch('namecheap.domains.dns.getHosts', { SLD, TLD })
const hosts = [...xml.matchAll(/<host\s[^>]*\/>/gi)].map((m) => ({ type: attr(m[0], 'Type'), name: attr(m[0], 'Name'), value: unesc(attr(m[0], 'Address')), pref: attr(m[0], 'MXPref') || '10', ttl: attr(m[0], 'TTL') || '1800' }))
const show = () => hosts.forEach((h) => console.log(`  ${h.type.padEnd(6)} ${h.name.padEnd(22)} ${h.value}${h.type === 'MX' ? '  (pref ' + h.pref + ')' : ''}`))
if (cmd === 'list') { show(); process.exit(0) }
let added = 0
for (let i = 0; i < rest.length; ) {
  const [type, name, value] = rest.slice(i, i + 3); i += 3
  let pref = '10'
  if (type === 'MX' && /^\d+$/.test(rest[i] ?? '')) pref = rest[i++]
  if (!type || !name || !value) throw new Error('each record needs TYPE NAME VALUE')
  if (hosts.some((h) => h.type === type && h.name === name && h.value.replace(/\.$/, '') === value.replace(/\.$/, ''))) continue
  hosts.push({ type, name, value, pref, ttl: '1800' }); added++
}
if (!added) { console.log('nothing to add'); show(); process.exit(0) }
const params = { SLD, TLD }
hosts.forEach((h, n) => { const i = n + 1; params[`HostName${i}`] = h.name; params[`RecordType${i}`] = h.type; params[`Address${i}`] = h.value; params[`TTL${i}`] = h.ttl; if (h.type === 'MX') params[`MXPref${i}`] = h.pref })
if (hosts.some((h) => h.type === 'MX')) params.EmailType = 'MX'
const out = await ncFetch('namecheap.domains.dns.setHosts', params)
if (!/IsSuccess="true"/.test(out)) throw new Error('setHosts did not report success: ' + out.slice(0, 300))
console.log(`added ${added}; ${domain} now has:`); show()
