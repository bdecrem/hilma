// ola.cx/semibart — CASBS Quest, a point-and-click pixel game. The page is one
// self-contained static file (public/semibart/index.html); this route serves it
// at a clean URL.
export async function GET(req: Request) {
  const res = await fetch(new URL('/semibart/index.html', req.url))
  if (!res.ok) return new Response('semibart page missing', { status: 502 })
  return new Response(await res.text(), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' },
  })
}
