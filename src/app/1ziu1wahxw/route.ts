import { html } from './html'

// Unlisted static page (CASBS class of 2026) served straight from a route
// handler: a rewrite into a public/ .html file 404s on Vercel even though it
// works under `next dev`. Left dynamic on purpose — with force-static Vercel
// only served the prerendered output for GET and answered HEAD with a 404.

export function GET() {
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
