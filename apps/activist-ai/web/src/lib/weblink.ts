// A link to the web in Ola's words: [title](https://…) or a bare https:// address. After a web
// search Ola gives its sources this way, and on a phone they must be tappable (OLA-246, seen checking
// OLA-232: raw markdown and bare text, none tappable, long ones widening the drawer). Only http and
// https become links, opened in a new tab without a referrer; the site's name is shown beside a
// titled link so the reader sees where it goes before tapping. Everything else stays text.

/** [title](https://…), without capture groups, for splitting a line. */
export const WEB_MD_SPLIT = /\[[^\]\n]{1,200}\]\(https?:\/\/[^\s)]{1,2000}\)/
/** A bare address; it never ends in the punctuation of the sentence around it. */
export const WEB_BARE_SPLIT = /https?:\/\/[^\s<>"'`()[\]]{0,2000}[^\s<>"'`()[\].,;:!?]/

export type WebLink = { label: string; href: string; host: string; titled: boolean }

function parse(address: string): { href: string; host: string } | null {
  let u: URL
  try {
    u = new URL(address)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password || !u.hostname) return null
  return { href: u.href, host: u.hostname.replace(/^www\./, '') }
}

export function webLink(part: string): WebLink | null {
  const md = /^\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)$/.exec(part)
  if (md) {
    const p = parse(md[2])
    return p ? { label: md[1], ...p, titled: true } : null
  }
  if (new RegExp(`^${WEB_BARE_SPLIT.source}$`).test(part)) {
    const p = parse(part)
    return p ? { label: part, ...p, titled: false } : null
  }
  return null
}
