// Writes every fellow's book ahead of time (src/lib/semibart/books.ts) and stores it in
// semibart_books. Skips anyone who already has one unless --force. Four at a time; each takes
// about a minute at medium effort and some 6,000 output tokens.
// Usage: set -a; source ./.env.local; set +a
//        npx tsx scripts/semibart/books-generate.ts [--force] [--only kevin,inbal] [--effort low|medium|high]
import { readFileSync } from 'node:fs'
import { getBook, saveBook, writeBook, type Author } from '../../src/lib/semibart/books'
import roster from '../../src/lib/semibart/roster.json'

const argv = process.argv.slice(2)
const flag = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const force = argv.includes('--force'), only = flag('--only')?.split(','), effort = (flag('--effort') || 'medium') as 'low' | 'medium' | 'high'

export function authors(): Record<string, Author> {
  const html = readFileSync('public/semibart/index.html', 'utf8')
  const fellows = JSON.parse(/const FELLOWS = (\{.*?\});\n/s.exec(html)![1]) as Record<string, { name: string; look: string; whisper: string }>
  const out: Record<string, Author> = { bart: { name: 'Bart', look: 'Bart. Fellow. Builder of things. Owner of sunglasses. Teaches a seminar on how to use AI, and is building a piano course called Takt.' } }
  for (const [k, f] of Object.entries(fellows)) out[k] = { name: f.name, look: f.look, say: f.whisper ? f.whisper.replace(/^Shh\.\s*/, '') : undefined }
  return out
}

async function main() {
  const who = [...new Set(Object.values((roster as { rooms: Record<string, { occupants: string[] }> }).rooms).flatMap(r => r.occupants))].filter(k => !only || only.includes(k)).sort()
  const A = authors()
  const todo: string[] = []
  for (const k of who) { if (!A[k]) { console.log(`skip ${k}: nothing known about them`); continue } if (!force && await getBook(k)) continue; todo.push(k) }
  console.log(`${todo.length} to write (${who.length - todo.length} already done), effort ${effort}`)
  let next = 0, ok = 0, failed: string[] = []
  const t0 = Date.now()
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < todo.length) {
      const k = todo[next++], t = Date.now()
      try {
        const book = await writeBook(A[k], effort)
        if (!book) { failed.push(k); console.log(`FAIL ${k}: no whole book after two tries`); continue }
        const v = await saveBook(k, book, '', 'generator', A[k].look)
        ok++; console.log(`ok   ${k} v${v} ${((Date.now() - t) / 1000).toFixed(0)}s  ${book.form}: ${book.title}  (${book.pages.filter(p => p.art).length} drawings)`)
      } catch (e) { failed.push(k); console.log(`FAIL ${k}: ${(e as Error).message}`) }
    }
  }))
  console.log(`\n${ok} written, ${failed.length} failed${failed.length ? ': ' + failed.join(',') : ''}, ${((Date.now() - t0) / 60000).toFixed(1)} min`)
  process.exit(failed.length ? 1 : 0)
}
main()
