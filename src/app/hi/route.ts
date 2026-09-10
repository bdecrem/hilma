import { styles } from './_alts/styles'
import { body, bodyWithForm, formScript, objectsScript } from './home'

const TITLE = "Hi, I'm Bart in 16"
const DESCRIPTION =
  'I like making learning stick, machines jam, and old things new again. Bart Decrem, practitioner fellow at CASBS.'
const URL_BARTIN16 = 'https://bartin16.xyz/'
const IMAGE = 'https://bartin16.xyz/hi/og.png'

// bartin16.xyz. Served as a whole document, not a React page, so the design keeps its own
// stylesheet and native browser behaviour instead of inheriting the app's global resets.
// The previous homepage is kept in `_archive/`.
function page(host: string) {
  // decremental.com gets the message form instead of the phone number.
  const decremental = /(^|\.)decremental\.com$/i.test(host.split(':')[0])
  const url = decremental ? 'https://decremental.com/' : URL_BARTIN16
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${TITLE}</title>
  <meta name="description" content="${DESCRIPTION}">
  <meta name="theme-color" content="#fff6ea">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Bart in 16">
  <meta property="og:title" content="${TITLE}">
  <meta property="og:description" content="${DESCRIPTION}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${TITLE}">
  <meta name="twitter:description" content="${DESCRIPTION}">
  <meta name="twitter:image" content="${IMAGE}">
  <style>${styles}</style>
</head>
<body class="edition-three${decremental ? ' site-decremental' : ''}">
${decremental ? bodyWithForm : body}
<script>${objectsScript}</script>
${decremental ? `<script>${formScript}</script>` : ''}
</body>
</html>`
}

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return new Response(page(request.headers.get('host') ?? ''), {
    headers: { 'content-type': 'text/html; charset=utf-8', vary: 'host' },
  })
}
