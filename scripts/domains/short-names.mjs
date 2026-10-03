// Finds available short names on cheap 2-letter TLDs via namecheap.domains.check.
// usage: node scripts/domains/short-names.mjs <maxUsd> <namesPerTld> tld tld ...
import { ncFetch } from './nc.mjs'
const [maxUsd, perTld, ...tlds] = process.argv.slice(2)
const MAX = Number(maxUsd), N = Number(perTld)

const C = 'bcdfghjklmnprstvwxz', V = 'aeiouy'
const pick = s => s[Math.floor(Math.random() * s.length)]
function names(n) {
  const set = new Set()
  while (set.size < n) {
    const r = Math.random()
    set.add(r < 0.6 ? pick(C) + pick(V) + pick(C) : r < 0.85 ? pick(V) + pick(C) + pick(V) : pick(C) + pick(V) + pick(V))
  }
  return [...set]
}
const prices = {}
{
  const xml = await ncFetch('namecheap.users.getPricing', { ProductType: 'DOMAIN', ProductCategory: 'DOMAINS', ActionName: 'REGISTER' })
  for (const m of xml.matchAll(/<Product Name="([^"]+)">([\s\S]*?)<\/Product>/g)) {
    const p = m[2].match(/<Price Duration="1" DurationType="YEAR"[^>]*RegularPrice="([\d.]+)"[^>]*YourPrice="([\d.]+)"/)
    if (p) prices[m[1]] = { now: Number(p[2]), renew: Number(p[1]) }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const found = []
for (const tld of tlds) {
  const list = names(N).map(s => `${s}.${tld}`)
  for (let i = 0; i < list.length; i += 50) {
    const xml = await ncFetch('namecheap.domains.check', { DomainList: list.slice(i, i + 50).join(',') })
    for (const m of xml.matchAll(/<DomainCheckResult ([^>]*)\/>/g)) {
      const a = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(x => [x[1], x[2]]))
      if (a.ErrorNo) { console.error(`  (registry error ${a.ErrorNo}) ${a.Domain}: ${a.Description}`); continue }
      if (a.Available !== 'true') continue
      const premium = a.IsPremiumDomain === 'true' || Number(a.PremiumRegistrationPrice || 0) > 0
      const price = premium ? Number(a.PremiumRegistrationPrice) : prices[tld]?.now
      const renew = premium ? Number(a.PremiumRenewalPrice || a.PremiumRegistrationPrice) : prices[tld]?.renew
      const row = { domain: a.Domain, price, renew, premium }
      if (price <= MAX) { found.push(row); console.log(`${a.Domain}\t$${price}\trenews $${renew}${premium ? '\tPREMIUM' : ''}`) }
      else console.error(`  (too dear) ${a.Domain} $${price}`)
    }
    await sleep(3200)
  }
  console.error(`-- ${tld} done, ${found.filter(f => f.domain.endsWith('.' + tld)).length} found`)
}
