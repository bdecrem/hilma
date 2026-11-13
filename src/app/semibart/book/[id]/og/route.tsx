// The share card for a book's own page (ola.cx/semibart/book/<id>): its cover beside one of its
// drawings, 1200 x 630, in the game's font. Rendered on request; the font is bundled.
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getBookByShare } from '@/lib/semibart/books'

export const runtime = 'nodejs'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const b = await getBookByShare(id)
  if (!b) return new Response('No such book.', { status: 404 })
  const buf = await readFile(path.join(process.cwd(), 'src/fonts/jersey-15/Jersey15-400.ttf'))
  const font = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const art = b.pages.find(p => p.art)?.art || null
  // the drawing as one block per run of same-coloured pixels on a row, scaled to fit 440 x 440
  const w = art ? Math.max(...art.rows.map(r => r.length)) : 1, h = art ? art.rows.length : 1, s = Math.floor(Math.min(440 / w, 440 / h))
  const runs: { x: number; y: number; n: number; c: string }[] = []
  art?.rows.forEach((r, y) => { let x = 0; while (x < r.length) { const c = art.palette[r[x]]; let n = 1; while (x + n < r.length && r[x + n] === r[x]) n++; if (c) runs.push({ x, y, n, c }); x += n } })
  return new ImageResponse(
    <div style={{ width: 1200, height: 630, display: 'flex', background: '#16121c', fontFamily: 'Jersey', padding: 50, gap: 50 }}>
      <div style={{ width: 600, height: 530, display: 'flex', flexDirection: 'column', background: '#2b3fff', color: '#fff7e6', padding: 44, boxShadow: '12px 12px 0 #000' }}>
        <div style={{ color: '#ffd93b', fontSize: 26, letterSpacing: 4, textTransform: 'uppercase' }}>{b.form}</div>
        <div style={{ fontSize: b.title.length > 28 ? 64 : 80, lineHeight: 0.95, marginTop: 18 }}>{b.title}</div>
        {b.subtitle ? <div style={{ fontSize: 30, color: '#d8dcff', marginTop: 16, lineHeight: 1.05 }}>{b.subtitle.slice(0, 90)}</div> : null}
        <div style={{ marginTop: 'auto', fontSize: 30 }}>A book from CASBS Quest</div>
      </div>
      <div style={{ width: 450, height: 530, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff7e6', boxShadow: '12px 12px 0 #000' }}>
        {art ? <div style={{ position: 'relative', width: w * s, height: h * s, display: 'flex' }}>{runs.map((r, i) => <div key={i} style={{ position: 'absolute', left: r.x * s, top: r.y * s, width: r.n * s, height: s, background: r.c }} />)}</div>
          : <div style={{ fontSize: 34, color: '#2a2416', padding: 40 }}>{b.pages[0].text.slice(0, 160)}</div>}
      </div>
    </div>,
    { width: 1200, height: 630, fonts: [{ name: 'Jersey', data: font, weight: 400, style: 'normal' }], headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400' } },
  )
}
