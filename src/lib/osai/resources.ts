// The Resources tab: the reading list behind the memo.
//
// apps/osai/content/resources.txt is a copy of docsrepo/opensourceai/page2.txt,
// the plain-text "page 2" of the one-pager, edited by hand in TextEdit. Entries
// are separated by two or more blank lines: a title line, one or more byline
// lines, the URL on its own line, then the blurb (one or more paragraphs). A
// chunk without a URL (the page heading) is ignored, so a loose edit degrades
// to a missing entry rather than a broken page.
//
// apps/osai/content/resources/*.md hold the text of each linked document (or
// an excerpt, when the document is a book-length report). Their frontmatter
// carries `url:`, which is how they are matched to entries, and `note:`,
// which says what was captured. The assistant reads all of it.

export type ResourceEntry = { title: string; byline: string; url: string; blurb: string[] }
export type ResourceDoc = { title: string; byline: string; url: string; note: string; body: string }
export type Resource = ResourceEntry & { doc: ResourceDoc | null }

export function parseResourceList(txt: string): ResourceEntry[] {
  const out: ResourceEntry[] = []
  for (const chunk of txt.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n(?:[ \t]*\n)+/)) {
    const lines = chunk.split('\n').map((l) => l.trim())
    const titleAt = lines.findIndex((l) => l)
    const urlAt = lines.findIndex((l) => /^https?:\/\/\S+$/.test(l))
    if (titleAt < 0 || urlAt <= titleAt) continue
    const byline = lines.slice(titleAt + 1, urlAt).filter(Boolean).join(' ')
    const blurb = lines
      .slice(urlAt + 1)
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    out.push({ title: lines[titleAt], byline, url: lines[urlAt], blurb })
  }
  return out
}

export function parseResourceDoc(md: string): ResourceDoc {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/)
  const meta: Record<string, string> = {}
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':')
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  }
  return {
    title: meta.title ?? '',
    byline: meta.byline ?? '',
    url: meta.url ?? '',
    note: meta.note ?? '',
    body: (m ? md.slice(m[0].length) : md).trim(),
  }
}

const urlKey = (u: string) => u.trim().replace(/^http:/i, 'https:').replace(/\/+$/, '').toLowerCase()

export function joinResources(entries: ResourceEntry[], docs: ResourceDoc[]): Resource[] {
  const byUrl = new Map(docs.map((d) => [urlKey(d.url), d]))
  return entries.map((e) => ({ ...e, doc: byUrl.get(urlKey(e.url)) ?? null }))
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The reading list for the assistant: each entry as shown on the tab, then the captured text. */
export function resourcesText(items: Resource[]): string {
  const parts = items.map((r, i) => {
    const head = [`--- Resource ${i + 1}: ${r.title} ---`, r.byline, r.url, '', ...r.blurb].filter(Boolean).join('\n')
    if (!r.doc) return `${head}\n\n[Only the entry above is available; the document itself was not captured.]`
    return `${head}\n\n[${r.doc.note || 'The text of the document.'}]\n\n${r.doc.body}`
  })
  return [
    `The reading list behind the memo: ${items.length} linked documents. For each, the entry as it appears on the Resources tab, then the text of the document where it could be captured.`,
    '',
    parts.join('\n\n'),
  ].join('\n')
}
