import { timingSafeEqual } from 'node:crypto'

/** ?key= must equal SOC_ADMIN_KEY. An unset key locks the pages. */
export function authorized(key: string | undefined): boolean {
  const secret = process.env.SOC_ADMIN_KEY
  if (!secret || !key) return false
  const a = Buffer.from(key)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function Denied() {
  return (
    <main className="soc-admin">
      <div className="soc-kicker">Socratic · researchers</div>
      <h1>Not authorized</h1>
      <p className="soc-muted">This page needs the researcher key in the URL.</p>
    </main>
  )
}
