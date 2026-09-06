// Render a saved digest JSON to a static HTML page using the same template the
// email uses (src/lib/book-scout/email.ts). No secrets needed.
//
//   node --experimental-strip-types scripts/book-scout/render-digest.mjs \
//     scripts/book-scout/digests/2026-09-thrillers.json public/book-scout/2026-09-thrillers.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildDigestHtml } from '../../src/lib/book-scout/email.ts'

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error('usage: render-digest.mjs <digest.json> <out.html>')
  process.exit(1)
}

const digest = JSON.parse(readFileSync(resolve(inPath), 'utf8'))
const sourceNames = [...new Set(digest.books.flatMap((b) => b.sources.map((s) => s.name.split(' (')[0])))]
const html = buildDigestHtml(digest.books, digest.month_label, digest.genre, sourceNames, digest.claude_picks ?? [])

mkdirSync(dirname(resolve(outPath)), { recursive: true })
writeFileSync(resolve(outPath), html)
console.log(`wrote ${outPath}: ${digest.books.length} books`)
