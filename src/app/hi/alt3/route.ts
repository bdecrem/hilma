import { html } from './html'

// Unlisted draft; the production homepage remains /hi.
export function GET() {
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
