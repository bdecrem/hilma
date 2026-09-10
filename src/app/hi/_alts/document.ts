import { styles } from './styles'
import { interactions } from './interactions'

// Full HTML keeps these unfinished studies isolated from the homepage layout
// and global Tailwind resets. This follows the existing /1ziu1wahxw pattern.
export function alternateDocument({
  title,
  description,
  bodyClass,
  body,
}: {
  title: string
  description: string
  bodyClass: string
  body: string
}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <style>${styles}</style>
</head>
<body class="${bodyClass}">
${body}
<script>${interactions}</script>
</body>
</html>`
}
