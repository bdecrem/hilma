// A link lives inside the sentence, nowhere else (2026-10-03): a URL in the
// text is shown as its bare domain — the page renders it as a link, the tile
// and the doodle prompt see the domain. No preview cards, no fetched titles.
// (Its own module so doodle.ts can use it without importing core.ts.)

export const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi

/// "https://www.example.com/a/b?c" → "example.com"
export function linkLabel(url: string): string {
  const u = url.replace(/[.,;:!?]+$/, '') // trailing punctuation belongs to the sentence
  try {
    return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

/// The URL with trailing sentence punctuation dropped, and a scheme.
export function linkHref(url: string): string {
  const u = url.replace(/[.,;:!?]+$/, '')
  return /^https?:/i.test(u) ? u : `https://${u}`
}

/// The sentence with every URL replaced by its domain.
export function plainText(text: string): string {
  return text.replace(URL_RE, (m) => linkLabel(m) + (m.match(/[.,;:!?]+$/)?.[0] ?? ''))
}

/// The sentence cut into text and link pieces, in order.
export function splitLinks(text: string): Array<{ text: string } | { href: string; label: string; tail: string }> {
  const out: Array<{ text: string } | { href: string; label: string; tail: string }> = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at) })
    const raw = m[0]
    const tail = raw.match(/[.,;:!?]+$/)?.[0] ?? ''
    out.push({ href: linkHref(raw), label: linkLabel(raw), tail })
    last = at + raw.length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
