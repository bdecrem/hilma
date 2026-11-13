// ola.cx/semibart/book/<share>: one fellow's CASBS Quest book as a page of its own, for a phone:
// the cover, then the ten pages down the screen, drawings as pixel art. The unguessable id is the
// access: the game shows it to admins, and to a book's owner once the book is finished.
import { getBookByShare } from '@/lib/semibart/books'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const esc = (s: string) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
let names: Record<string, string> | null = null
function nameOf(slug: string): string {
  if (slug === 'bart') return 'Bart'
  if (!names) {
    try { const html = readFileSync(path.join(process.cwd(), 'public/semibart/index.html'), 'utf8'); const f = JSON.parse(/const FELLOWS = (\{[\s\S]*?\});\n/.exec(html)![1]); names = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, (v as { name: string }).name])) } catch { names = {} }
  }
  return names[slug] || slug
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const b = await getBookByShare(id)
  if (!b) return new Response('No such book.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  const by = nameOf(b.character), url = `https://ola.cx/semibart/book/${b.share}`
  const pages = b.pages.map((p, i) => `<section class="pg">${p.art ? `<canvas data-art="${esc(JSON.stringify(p.art))}"></canvas>` : ''}${p.text ? `<p>${esc(p.text)}</p>` : ''}<span class="n">${i + 1}</span></section>`).join('\n')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#16121c">
<title>${esc(b.title)} · by ${esc(by)}</title>
<meta name="description" content="${esc(b.form)}, by ${esc(by)}. A book from CASBS Quest.">
<meta property="og:title" content="${esc(b.title)}"><meta property="og:description" content="${esc(b.form)}, by ${esc(by)}. From CASBS Quest.">
<meta property="og:url" content="${url}"><meta property="og:image" content="https://ola.cx/semibart/og.png"><meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Jersey+15&display=swap" rel="stylesheet">
<style>
:root { --ink: #16121c; --paper: #fff7e6; --blue: #2b3fff; --hot: #ffd93b; }
* { box-sizing: border-box; }
html { background: var(--ink); }
body { margin: 0; min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 20px) max(16px, env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 28px) max(16px, env(safe-area-inset-left)); font-family: 'Jersey 15', 'Courier New', monospace; color: #2a2416; }
main { max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.cover, .pg { position: relative; padding: 24px 22px 30px; box-shadow: 6px 6px 0 #000; }
.cover { background: var(--blue); color: var(--paper); aspect-ratio: 3 / 4; display: flex; flex-direction: column; gap: 10px; }
.form { color: var(--hot); font-size: 15px; letter-spacing: .14em; text-transform: uppercase; }
h1 { margin: 0; font-weight: 400; font-size: 42px; line-height: .95; overflow-wrap: anywhere; }
.sub { font-size: 20px; line-height: 1.05; color: #d8dcff; }
.by { margin-top: auto; font-size: 20px; }
.pg { background: var(--paper); display: flex; flex-direction: column; gap: 14px; min-height: 180px; }
.pg p { margin: 0; white-space: pre-wrap; font-size: 22px; line-height: 1.12; }
canvas { image-rendering: pixelated; width: min(100%, 300px); height: auto; align-self: center; }
.n { position: absolute; right: 14px; bottom: 8px; font-size: 14px; color: #9a917e; }
footer { text-align: center; font-size: 17px; color: #8a8273; margin-top: 8px; }
footer a { color: var(--hot); text-decoration: none; }
</style></head><body><main>
<section class="cover"><div class="form">${esc(b.form)}</div><h1>${esc(b.title)}</h1>${b.subtitle ? `<div class="sub">${esc(b.subtitle)}</div>` : ''}<div class="by">by ${esc(by)}</div></section>
${pages}
<footer>A book from <a href="https://ola.cx/semibart">CASBS Quest</a></footer>
</main>
<script>document.querySelectorAll('canvas').forEach(function (c) { var a = JSON.parse(c.dataset.art), w = Math.max.apply(null, a.rows.map(function (r) { return r.length; })), h = a.rows.length; c.width = w; c.height = h; var g = c.getContext('2d'); a.rows.forEach(function (r, y) { for (var x = 0; x < r.length; x++) { var col = a.palette[r[x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } } }); });</script>
</body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' } })
}
