// Translate every cited article of every non-English law into English, ahead of time, for the citation cards at ola.cx/mrd/law/[id].
//   npx tsx scripts/mrd/translate-articles.ts [--dry] [--limit N] [--concurrency 8]
// Finds each article the way the reader's "Go to N" does (where the article is declared, not referred to), cuts the passage
// up to the next heading of the same form, and stores it in article_translations. Already-translated articles are skipped.
import { readFileSync } from 'fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || (args.includes('--limit') ? 0 : Infinity)
const RECHECK = args.includes('--recheck') // re-translate articles whose passage the current rules cut differently
const CONC = Number(args[args.indexOf('--concurrency') + 1]) || 8
const MAX = 6000

async function main() {
  const { getDoc, articlePattern, find } = await import('../../src/lib/mrd/text')
  const { rpc } = await import('../../src/lib/mrd/db')
  const { translate, usage, MODEL } = await import('../../src/lib/mrd/translate')
  const { articleNumbers } = await import('../../src/app/mrd/(library)/law/[id]/Articles')
  const url = process.env.MRD_SUPABASE_URL!, key = process.env.MRD_SUPABASE_SERVICE_KEY!
  const H = { apikey: key, Authorization: `Bearer ${key}` }
  const get = async <T,>(path: string): Promise<T> => {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: H })
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
    return r.json()
  }

  type L = { id: string; language: string; name_en: string | null; name_cited: string }
  const laws: L[] = []
  for (let off = 0; ; off += 1000) {
    const rows = await get<L[]>(`laws?select=id,language,name_en,name_cited&text=not.is.null&language=neq.en&order=id&limit=1000&offset=${off}`)
    laws.push(...rows)
    if (rows.length < 1000) break
  }
  const done = new Map<string, string>()
  for (let off = 0; ; off += 1000) { // PostgREST returns at most 1000 rows a request
    const rows = await get<{ law_id: string; article: string; source: string }[]>(`article_translations?select=law_id,article${RECHECK ? ',source' : ''}&order=law_id,article&limit=1000&offset=${off}`)
    for (const r of rows) done.set(`${r.law_id}:${r.article}`, r.source)
    if (rows.length < 1000) break
  }
  console.log(`${laws.length} non-English laws with text, ${done.size} articles already translated`)

  type Job = { law: string; lang: string; name: string; article: string; source: string }
  const jobs: Job[] = []
  let notFound = 0, rechecked = 0
  const drop: [string, string][] = []
  let i = 0
  const scan = async () => {
    while (i < laws.length) {
      const l = laws[i++]
      const law = await rpc<{ citations: { articles: string | null }[] } | null>('lib_law', { p_id: l.id }, false)
      const nums = new Set((law?.citations ?? []).flatMap(c => (c.articles ? articleNumbers(c.articles) : [])))
      if (!nums.size) continue
      const doc = await getDoc(l.id)
      if (!doc) continue
      for (const n of nums) {
        if (done.has(`${l.id}:${n}`) && !RECHECK) continue
        const re = articlePattern(n)
        if (!re) continue
        const f = find(doc, re)
        type H = (typeof f.hits)[number]
        const at = (x: H) => doc.pages[x.page][0] + x.at
        const lineStart = (x: H) => at(x) === 0 || doc.text[at(x) - 1] === '\n'
        const formOf = (x: H) => x.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\d+|[٠-٩]+/g, '(?:\\d+|[٠-٩]+)')
        // where the article is declared: a hit at the start of a line, or (in texts flattened from HTML) right after a sentence ends
        const flat = (x: H) => /(^|[.;:)\]])\s*$/.test(x.before) && !new RegExp(formOf(x), 'u').test(x.after.slice(0, 120))
        // "article 6; the second paragraph of article 11; …" in an amending decree is a list, not the article
        const listed = (x: H) => /^\s*(?:[;,]|(?:y|e|et|and|und|ve|en|och|og|és|ja|και)\s)/iu.test(x.after)
        let cands = f.hits.filter(x => lineStart(x) && !listed(x))
        if (!cands.length) cands = f.hits.filter(x => flat(x) && !listed(x))
        // a bare "29." also matches numbered paragraphs: use it only when no hit names the article ("Art.", "§", "Madde")
        if (cands.some(x => /[\p{L}§条조]/u.test(x.match))) cands = cands.filter(x => /[\p{L}§条조]/u.test(x.match))
        // the passage runs to the next heading of the same form ("Artículo 30", "§ 30", "30."); a table-of-contents entry gives
        // a short one, so the longest passage among the first candidates is the article itself
        const passage = (h: H) => {
          const a = at(h)
          const next = new RegExp(lineStart(h) ? `\\n${formOf(h)}` : `(?<=[.;:)\\]]\\s*)${formOf(h)}`, 'u')
          const rest = doc.text.slice(a + h.len, a + MAX)
          const m = rest.match(next)
          let b = a + h.len + (m?.index ?? rest.length)
          if (!m && b < doc.text.length) { const nl = doc.text.lastIndexOf('\n', b); if (nl > a + 1500) b = nl }
          let s = doc.text.slice(a, b).trim()
          // some codes title an article on the line above its number: drop the next article's title from the tail
          const last = s.lastIndexOf('\n')
          if (m && last > 0 && s.length - last < 100 && !/[.;:,)\]]\s*$/.test(s)) s = s.slice(0, last).trim()
          return s
        }
        let source = ''
        for (const h of cands.slice(0, 12)) { const s = passage(h); if (s.length > source.length) source = s }
        if (source.length < 40) { notFound++; if (RECHECK && done.has(`${l.id}:${n}`)) drop.push([l.id, n]); if (process.env.SHOW) console.log('miss', l.language, n, l.name_en); continue }
        if (RECHECK) { const had = done.get(`${l.id}:${n}`); if (had === source) continue; if (had !== undefined) rechecked++ }
        jobs.push({ law: l.id, lang: l.language, name: l.name_en || l.name_cited, article: n, source })
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, scan))
  const chars = jobs.reduce((s, j) => s + j.source.length, 0)
  if (RECHECK) console.log(`${rechecked} stored passages are cut differently now`)
  console.log(`${jobs.length} articles to translate (${(chars / 1e6).toFixed(1)}M chars), ${notFound} not located`)
  if (RECHECK) console.log(`${drop.length} stored articles are no longer located and will be removed`)
  if (!DRY) for (const [law, art] of drop) {
    const r = await fetch(`${url}/rest/v1/article_translations?law_id=eq.${law}&article=eq.${encodeURIComponent(art)}`, { method: 'DELETE', headers: H })
    if (!r.ok) console.log(`  drop ${law} ${art}: ${r.status}`)
  }
  if (DRY) { if (process.env.DUMP) (await import('fs')).writeFileSync(process.env.DUMP, JSON.stringify(jobs)); return }

  const todo = jobs.slice(0, LIMIT)
  let k = 0, ok = 0, fail = 0
  const cost = () => (usage.input / 1e6 * 1 + usage.output / 1e6 * 5).toFixed(2)
  const work = async () => {
    while (k < todo.length) {
      const j = todo[k++]
      try {
        const english = await translate(j.source, { lang: j.lang, law: j.name })
        const r = await fetch(`${url}/rest/v1/article_translations?on_conflict=law_id,article`, {
          method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ law_id: j.law, article: j.article, source: j.source, english, model: MODEL }),
        })
        if (!r.ok) throw new Error(`save ${r.status}`)
        ok++
      } catch (e) {
        fail++
        console.log(`  fail ${j.law} ${j.article}: ${e instanceof Error ? e.message.slice(0, 120) : e}`)
      }
      if ((ok + fail) % 50 === 0) console.log(`  ${ok + fail}/${todo.length}  $${cost()}`)
    }
  }
  await Promise.all(Array.from({ length: CONC }, work))
  console.log(`done: ${ok} translated, ${fail} failed, ${usage.input.toLocaleString()} in / ${usage.output.toLocaleString()} out tokens, $${cost()}`)
}
main().catch(e => { console.error(e); process.exit(1) })
