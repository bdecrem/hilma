// dodo.foo/anime — the Peck map redrawn as a summer anime. The page is one
// self-contained static file (public/dodo/anime.html); this route serves it
// at a clean URL. Rebuild shots/OG with scripts/dodo-anime/.
export async function GET(req: Request) {
  const res = await fetch(new URL('/dodo/anime.html', req.url))
  if (!res.ok) return new Response('anime page missing', { status: 502 })
  return new Response(await res.text(), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' },
  })
}
