import { styles } from './_alts/styles'
import { body } from './home'

const TITLE = "Hi, I'm Bart in 16"
const DESCRIPTION =
  'I like making learning stick, machines sing, and old things new again. Bart Decrem, practitioner fellow at CASBS.'
const URL = 'https://bartin16.xyz/'
const IMAGE = 'https://bartin16.xyz/hi/og.png'

// bartin16.xyz. Served as a whole document, not a React page, so the design keeps its own
// stylesheet and native browser behaviour instead of inheriting the app's global resets.
// The previous homepage is kept in `_archive/`.
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${TITLE}</title>
  <meta name="description" content="${DESCRIPTION}">
  <meta name="theme-color" content="#fff6ea">
  <link rel="canonical" href="${URL}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Bart in 16">
  <meta property="og:title" content="${TITLE}">
  <meta property="og:description" content="${DESCRIPTION}">
  <meta property="og:url" content="${URL}">
  <meta property="og:image" content="${IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${TITLE}">
  <meta name="twitter:description" content="${DESCRIPTION}">
  <meta name="twitter:image" content="${IMAGE}">
  <style>${styles}</style>
</head>
<body class="edition-three">
${body}
</body>
</html>`

export function GET() {
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
