'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BASE, KIND_ORDER, KINDS, STATUS } from './ui'

type Opt = { slug: string; name: string }
export type FinderValue = { q?: string; country?: string; category?: string; kind?: string; status?: string }

/** The search box and the dropdowns. On the search page a dropdown change applies at once; elsewhere it opens the search. */
export default function Finder({ countries, categories, value = {}, full = false, placeholder }: {
  countries: Opt[]; categories: Opt[]; value?: FinderValue; full?: boolean; placeholder?: string
}) {
  const router = useRouter()
  const [v, setV] = useState<FinderValue>(value)
  const go = (next: FinderValue) => {
    const qs = new URLSearchParams()
    for (const [k, x] of Object.entries(next)) if (x) qs.set(k, x)
    router.push(`${BASE}/search${qs.size ? `?${qs}` : ''}`)
  }
  const pick = (k: keyof FinderValue) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = { ...v, [k]: e.target.value || undefined }
    setV(next)
    if (full) go(next)
  }
  return (
    <form className="form" role="search" onSubmit={e => { e.preventDefault(); go(v) }}>
      <div className="search">
        <input type="search" name="q" value={v.q ?? ''} onChange={e => setV({ ...v, q: e.target.value })}
          placeholder={placeholder ?? 'Search names and full texts: asylum, family reunification, Ley 1070…'} aria-label="Search the laws" />
        <button type="submit">Search</button>
      </div>
      <div className="filters">
        <select className="select" value={v.country ?? ''} onChange={pick('country')} aria-label="Country">
          <option value="">Choose a country</option>
          {countries.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select className="select" value={v.category ?? ''} onChange={pick('category')} aria-label="Category">
          <option value="">Choose a category</option>
          {categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        {full && (
          <>
            <select className="select" value={v.kind ?? ''} onChange={pick('kind')} aria-label="Type of law">
              <option value="">Any type</option>
              {KIND_ORDER.map(k => <option key={k} value={k}>{KINDS[k]}</option>)}
            </select>
            <select className="select" value={v.status ?? ''} onChange={pick('status')} aria-label="Availability">
              <option value="">Any availability</option>
              {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </>
        )}
      </div>
    </form>
  )
}
