// ola.cx/semibart/demo.html — CASBS Quest with the trailer's opening in front of it: the same game page
// (public/semibart/index.html), plus three.js (an import map, pinned) and public/semibart/intro.js, which
// plays THIS. / CHANGES. / EVERYTHING. in 3D, crumbles it into the game's pixels and starts the game.
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.170.0'
const IMPORTS = `<script type="importmap">${JSON.stringify({ imports: { three: `${THREE}/build/three.module.js`, 'three/addons/': `${THREE}/examples/jsm/` } })}</script>`

export async function GET(req: Request) {
  const res = await fetch(new URL('/semibart/index.html', req.url))
  if (!res.ok) return new Response('semibart page missing', { status: 502 })
  const html = (await res.text())
    .replace('</head>', `${IMPORTS}\n</head>`)
    .replace('</body>', '<script type="module" src="/semibart/intro.js"></script>\n</body>')
  if (!html.includes('/semibart/intro.js') || !html.includes('importmap')) return new Response('semibart demo: could not add the intro', { status: 500 })
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' },
  })
}
