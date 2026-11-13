// ola.cx/semibart/classic — the first CASBS Quest map (one screen, fourteen studies), kept when the
// whole-campus map became the main page at /semibart on 2026-11-12. Static file: public/semibart/classic.html
export async function GET(req: Request) {
  const res = await fetch(new URL('/semibart/classic.html', req.url))
  if (!res.ok) return new Response('semibart classic page missing', { status: 502 })
  return new Response(await res.text(), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' },
  })
}
