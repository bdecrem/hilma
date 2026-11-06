import { rpc } from '@/lib/mrd/db'
import type { Cat, CountryRef } from './ui'

export type Home = {
  stats: { laws: number; texts: number; links: number; missing: number; chars: number; languages: number; countries: number; citations: number }
  kinds: Record<string, number>
  countries: (CountryRef & { laws: number; texts: number; cats: Record<string, number> })[]
  categories: (Cat & { laws: number; questions: number })[]
}

export type Row = {
  id: string; name: string; official: string | null; cited: string; kind: string; year: number | null; number: string | null; court: string | null
  status: string; language: string | null; domain: string | null; chars: number | null; country: CountryRef; cats: Cat[]; cites: number
  snippet: string | null; snippet_from: 'text' | 'citation' | null
}

export const home = () => rpc<Home>('lib_home')

/** Largest per-category law count for any country, so every wheel shares one scale. */
export const wheelMax = (h: Home) => Math.max(1, ...h.countries.flatMap(c => Object.values(c.cats)))

export const options = (h: Home) => ({
  countries: h.countries.map(c => ({ slug: c.slug, name: c.name })),
  categories: h.categories.map(c => ({ slug: c.slug, name: c.name })),
})
