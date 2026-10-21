// The pages are self-contained static files in public/design/ddp-assets/;
// the routes serve them at clean URLs.
export async function serve(req: Request, name: string) {
  const res = await fetch(new URL(`/design/ddp-assets/${name}.html`, req.url))
  if (!res.ok) return new Response('page missing', { status: 404 })
  return new Response(await res.text(), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=300' },
  })
}
