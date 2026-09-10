import { styles } from '../_alts/styles'
import { cardBody } from '../home'

// Unlisted. Renders the landing's sentence as a 1600x900 poster; screenshot it to make
// the share image (scripts/hi/make-card.mjs writes it to the Desktop).
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1600, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Bart in 16 — share card</title>
  <style>${styles}</style>
</head>
<body class="edition-three edition-card">
${cardBody}
</body>
</html>`

export function GET() {
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
  })
}
