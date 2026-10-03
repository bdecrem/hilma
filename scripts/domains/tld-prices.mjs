// Prints 1-year registration prices for every 2-letter TLD Namecheap sells.
// usage: node scripts/domains/tld-prices.mjs [maxUsd]
import { ncFetch } from './nc.mjs'
const max = Number(process.argv[2] ?? 1e9)
const xml = await ncFetch('namecheap.users.getPricing', {
  ProductType: 'DOMAIN', ProductCategory: 'DOMAINS', ActionName: 'REGISTER',
})
const out = []
for (const m of xml.matchAll(/<Product Name="([^"]+)">([\s\S]*?)<\/Product>/g)) {
  const [, tld, body] = m
  if (!/^[a-z]{2}$/.test(tld)) continue
  const p = body.match(/<Price Duration="1" DurationType="YEAR"[^>]*RegularPrice="([\d.]+)"[^>]*YourPrice="([\d.]+)"/)
  if (!p) continue
  const price = Number(p[2])
  const regular = Number(p[1])
  if (price <= max) out.push({ tld, price, regular })
}
out.sort((a, b) => a.price - b.price)
for (const r of out) console.log(`${r.tld}\t$${r.price.toFixed(2)}\t(regular $${r.regular.toFixed(2)})`)
console.error(`${out.length} two-letter TLDs at or under $${max}`)
