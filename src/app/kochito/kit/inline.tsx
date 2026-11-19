// **bold**, [text](url) and, when `issue` is given, ticket numbers (OLA-157) as links to the ticket.
// Bart, Nov 19, 2026: "just make those ticket numbers clickable".
export function inline(text: string, issue?: (id: string) => string) {
  const out: React.ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\b(OLA-\d+)\b/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[4] && !issue) continue
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      m[1] ? <strong key={m.index}>{inline(m[1], issue)}</strong> : m[4] ? <a key={m.index} href={issue!(m[4])}>{m[4]}</a> : <a key={m.index} href={m[3]}>{m[2]}</a>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/// The first thing to open for a line: its first link, else its first ticket.
export function firstLink(text: string, issue: (id: string) => string): { href: string; label: string } | null {
  const link = text.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/)
  const id = text.match(/\b(OLA-\d+)\b/)
  if (link && (!id || link.index! < id.index!)) return { href: link[2], label: 'Read it' }
  if (id) return { href: issue(id[1]), label: id[1] }
  return link ? { href: link[2], label: 'Read it' } : null
}
