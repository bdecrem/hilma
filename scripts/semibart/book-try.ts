// An experiment (2026-11-13): can the ten loose leaves be a real book? One Claude call writes a
// fellow's whole book from the one line the game knows about them: in whatever form suits them
// (a play, a poem, a picture book of nothing but drawings), ten pages, drawings allowed. Prints
// it, with how long it took and what it cost in tokens, and writes it as JSON; saves nothing else.
// Usage: set -a; source ./.env.local; set +a
//        npx tsx scripts/semibart/book-try.ts <character> [low|medium|high] [out.json]
// Look at the result: node scripts/semibart/book-sheet.mjs <out.png> <book.json> [more.json ...]
import { readFileSync, writeFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'

import { BOOK_SYSTEM, FORMS, parseBook } from '../../src/lib/semibart/books'
type Page = { text: string; art: { rows: string[]; palette: Record<string, string> } | null }
type Book = { who: string; name: string; effort: string; offered: string[]; form: string; title: string; subtitle: string; pages: Page[]; seconds: number; tokensOut: number }

async function main() {
  const [slug, effort = 'medium', out] = process.argv.slice(2)
  const html = readFileSync('public/semibart/index.html', 'utf8')
  const fellows = JSON.parse(/const FELLOWS = (\{.*?\});\n/s.exec(html)![1]) as Record<string, { name: string; look: string; whisper: string }>
  const f = slug === 'bart' ? { name: 'Bart', look: 'Bart. Fellow. Builder of things. Owner of sunglasses. Teaches a seminar on how to use AI, and is building a piano course called Takt.', whisper: '' } : fellows[slug]
  if (!f) { console.error('no such fellow: ' + slug); process.exit(1) }
  const offered = [...FORMS].sort(() => Math.random() - 0.5).slice(0, 4)
  const client = new Anthropic()
  const t0 = Date.now()
  const res = await client.messages.stream({
    model: 'claude-opus-5-5',
    max_tokens: 24000,
    output_config: { effort: effort as 'low' | 'medium' | 'high' },
    system: BOOK_SYSTEM,
    messages: [{ role: 'user', content: `The author: ${f.name}.\nWhat the game says about them: ${JSON.stringify(f.look)}${f.whisper ? `\nSomething they say in the game: ${JSON.stringify(f.whisper.replace(/^Shh\.\s*/, ''))}` : ''}\n\nForms on offer this time: ${offered.join('; ')}. Or a better one of your own.\n\nWrite their book.` }],
  }).finalMessage()
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('')
  const book: Book = { who: slug, name: f.name, effort, offered, ...(parseBook(text) ?? { form: '', title: '(not a whole book)', subtitle: '', pages: [] }), seconds: +((Date.now() - t0) / 1000).toFixed(1), tokensOut: res.usage.output_tokens }
  const words = book.pages.map(p => (p.text ? p.text.split(/\s+/).length : 0))
  console.log(`${f.name} · ${effort} · ${book.seconds} s · ${res.usage.output_tokens} out · stop ${res.stop_reason} · ${book.pages.length} pages, ${book.pages.filter(p => p.art).length} drawings, up to ${Math.max(0, ...words)} words`)
  console.log(`  offered: ${offered.join(' | ')}\n  ${book.form}: ${book.title}${book.subtitle ? ' — ' + book.subtitle : ''}`)
  if (out) writeFileSync(out, JSON.stringify(book, null, 1))
  else book.pages.forEach((p, i) => console.log(`\n[${i + 1}]${p.art ? ` (drawing ${p.art.rows[0].length}x${p.art.rows.length})` : ''}\n${p.text}`))
}
main().catch(e => { console.error(e); process.exit(1) })
