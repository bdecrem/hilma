// Full texts run from a few hundred characters to 12 million, so the reader pages them.
// Every offset (pages, search hits) is on the normalized text this module produces.
import { fetchLawText } from './db'

export const PAGE_CHARS = 60_000

type Doc = { text: string; pages: [number, number][] }
const cache = new Map<string, Doc>()
let cached = 0
const CACHE_CHARS = 80_000_000

export function normalize(t: string): string {
  return t
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '') // controls and bidi marks (Arabic PDFs put them inside "المادة ‪29‬")
    .replace(/[ \t ]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function paginate(text: string): [number, number][] {
  const pages: [number, number][] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + PAGE_CHARS)
    if (end < text.length) {
      const nl = text.indexOf('\n', end)
      end = nl !== -1 && nl - end < 4000 ? nl + 1 : end
    }
    pages.push([start, end])
    start = end
  }
  return pages.length ? pages : [[0, 0]]
}

export async function getDoc(id: string): Promise<Doc | null> {
  const hit = cache.get(id)
  if (hit) {
    cache.delete(id)
    cache.set(id, hit)
    return hit
  }
  const raw = await fetchLawText(id)
  if (raw == null) return null
  const text = normalize(raw)
  const doc = { text, pages: paginate(text) }
  cache.set(id, doc)
  cached += text.length
  for (const [k, v] of cache) {
    if (cached <= CACHE_CHARS || k === id) break
    cache.delete(k)
    cached -= v.text.length
  }
  return doc
}

export function page(doc: Doc, n: number) {
  const i = Math.max(0, Math.min(doc.pages.length - 1, n))
  const [a, b] = doc.pages[i]
  return { page: i, pages: doc.pages.length, start: a, text: doc.text.slice(a, b) }
}

const FOLD: Record<string, string> = {
  a: 'aáàâäãåā', e: 'eéèêëē', i: 'iíìîïī', o: 'oóòôöõøō', u: 'uúùûüū', c: 'cç', n: 'nñ', s: 'sšś', z: 'zžź', y: 'yýÿ',
}

/** Literal, case- and accent-insensitive pattern for a phrase typed into the reader. */
export function phrasePattern(q: string): RegExp | null {
  const words = q.trim().split(/\s+/).filter(Boolean)
  if (!words.length || q.trim().length < 2) return null
  const body = words
    .map(w => [...w.toLowerCase()].map(ch => (FOLD[ch] ? `[${FOLD[ch]}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join(''))
    .join('\\s+')
  return new RegExp(body, 'giu')
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** Where an article / section number is declared, across the languages the texts come in. */
export function articlePattern(n: string): RegExp | null {
  // French codes number articles "L. 223-2", "R. 221-11", "D. 223-26"
  const code = n.match(/^([LRD])(\d+(?:-\d+)+)$/)
  if (code) return new RegExp(`(?<![\\p{L}])${code[1]}\\.?\\s?${code[2]}(?![\\d-])`, 'gu')
  if (!/^\d{1,4}$/.test(n)) return null
  const ar = [...n].map(d => ARABIC_DIGITS[+d]).join('')
  const num = `(?:${n}|${ar})`
  const words = [
    'art(?:icle|ículo|iculo|ikel|igo|icolo|ykuł|\\.)?s?', 'arts?\\.?', 'sections?', 'sec\\.', 'ss?\\.', 'madde(?:si)?', 'pasal', 'artikla',
    'статья', 'ст\\.', 'άρθρο', 'άρθ\\.', 'סעיף', 'المادة', 'مادة', 'ধারা', 'rule', 'regulation', 'reg\\.', 'paragraph', 'para\\.',
  ].join('|')
  // "29. Expulsion of refugees" — a numbered heading at the start of a line — counts too
  return new RegExp(`(?:(?<![\\p{L}])(?:${words})\\s*\\(?${num}(?![\\d\\p{L}])|§+\\s*${num}(?![\\d\\p{L}])|(?<![\\d.])${num}\\.?\\s?§|第\\s*${num}\\s*条|제\\s*${num}\\s*조|(?<=^|\\n)${num}\\.(?=\\s+\\p{Lu}))`, 'giu')
}

export type Hit = { page: number; at: number; len: number; before: string; match: string; after: string }

/** `best` is the first hit that starts a line and isn't a table-of-contents entry: where an article is declared rather than referred to. */
export function find(doc: Doc, re: RegExp, limit = 400): { total: number; hits: Hit[]; best: number } {
  const hits: Hit[] = []
  let best = -1
  let toc = -1
  let total = 0
  let p = 0
  re.lastIndex = 0
  for (let m = re.exec(doc.text); m; m = re.exec(doc.text)) {
    if (m[0].length === 0) { re.lastIndex++; continue }
    total++
    if (hits.length < limit) {
      while (p < doc.pages.length - 1 && m.index >= doc.pages[p][1]) p++
      const a = m.index
      const b = a + m[0].length
      hits.push({
        page: p, at: a - doc.pages[p][0], len: m[0].length,
        before: doc.text.slice(Math.max(0, a - 80), a).replace(/\s+/g, ' '),
        match: m[0],
        after: doc.text.slice(b, b + 120).replace(/\s+/g, ' '),
      })
      if (best < 0 && (a === 0 || doc.text[a - 1] === '\n')) {
        if (/\.{4,}|…{2,}|\s\d+\s*$/.test(doc.text.slice(b, b + 160).split('\n\n')[0])) { if (toc < 0) toc = hits.length - 1 }
        else best = hits.length - 1
      }
    }
  }
  return { total, hits, best: best >= 0 ? best : Math.max(0, toc) }
}
