// Reads a sample's transcript.txt (apps/venture/private/pdf-proof/scripts/dump.py)
// into rows the sample page can draw. Two formats exist:
//   - the first one: "Document", then one element per line, two spaces of indent
//     per level, "Tag: text" or `Tag Alt="..."`;
//   - since 2026-11-14 (after an independent review said the transcript showed
//     things a screen reader does not say): a short preamble (the title announced
//     on opening, the language), "Document", "--- page N ---" marks, elements that
//     may carry `Lang=xx` or a note in square brackets (`L [list, 3 items]`), links
//     written inline as `[link: text | described as: description]`, and at the end
//     "Not read aloud (...)" with one "- item" per line.
export type Row = { kind: 'page'; n: string } | { kind: 'el'; depth: number; tag: string; text: string; lang?: string; note?: string; label?: string }
export type Transcript = { title: string; lang: string; rows: Row[]; silent: string[] }

const TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'L', 'LI', 'LBody', 'Lbl', 'Table', 'THead', 'TBody', 'TR', 'TH', 'TD', 'Figure', 'Link', 'Span', 'Document', 'Sect', 'Part', 'Art', 'Div', 'TOC', 'TOCI', 'Caption', 'Note', 'Em', 'Strong', 'BlockQuote', 'Quote', 'Form', 'Formula'])

export function parseTranscript(transcript: string): Transcript {
  const out: Transcript = { title: '', lang: '', rows: [], silent: [] }
  const lines = transcript.split('\n')
  let mode: 'pre' | 'body' | 'silent' = lines.some((l) => /^Title announced/.test(l)) ? 'pre' : 'body'
  let label: string | undefined
  for (const line of lines) {
    if (mode === 'pre') {
      const t = line.match(/^Title announced[^:]*:\s*(.*)$/)
      const g = line.match(/^Language:\s*(.*)$/)
      if (t) out.title = t[1]
      else if (g) out.lang = g[1]
      else if (line.trim() === 'Document') mode = 'body'
      continue
    }
    if (/^Not read aloud/.test(line)) { mode = 'silent'; continue }
    if (mode === 'silent') {
      const s = line.match(/^\s*-\s+(.*)$/)
      if (s) out.silent.push(s[1])
      continue
    }
    const page = line.match(/^--- page (\d+) ---\s*$/)
    if (page) { out.rows.push({ kind: 'page', n: page[1] }); continue }
    const m = line.match(/^(\s*)([A-Za-z][A-Za-z0-9]*)(.*)$/)
    if (!m || !TAGS.has(m[2])) continue
    const tag = m[2]
    let rest = m[3]
    let lang: string | undefined
    let note: string | undefined
    let text = ''
    const lm = rest.match(/^\s+Lang=([A-Za-z-]+)/)
    if (lm) { lang = lm[1]; rest = rest.slice(lm[0].length) }
    const nm = rest.match(/^\s+\[([^\]]*)\]\s*$/)
    const alt = rest.match(/^\s+Alt="(.*)"\s*$/)
    const actual = rest.match(/^\s+ActualText="(.*)":\s?(.*)$/)
    if (nm) note = nm[1].replace(/^list,\s*/, '')
    else if (alt) text = `“${alt[1]}”`
    else if (actual) { text = actual[1]; note = 'corrected reading of a scan' }
    else if (rest.startsWith(':')) text = rest.slice(1).trim()
    else if (rest.trim()) continue // not an element line
    text = text.replace(/\s*\[annot\]\s*$/, '')
    if (tag === 'Document' || tag === 'LI' || ((tag === 'TR' || tag === 'LBody' || tag === 'THead' || tag === 'TBody') && !text && !note)) continue
    // a list item's label (its number, letter or bullet) is heard with the item: it goes on the item's row
    if (tag === 'Lbl') { label = text || undefined; continue }
    out.rows.push({ kind: 'el', depth: Math.max(0, Math.floor(m[1].length / 2) - 1), tag, text, lang, note, label })
    label = undefined
  }
  return out
}

// A line's text, with its notes pulled out: plain strings, { link, described } for a link, and
// { read, why } where what is read aloud replaces what is printed (a corrected reading, or text
// that is struck through on the page and announced as such).
export type Piece = string | { link: string; described?: string } | { read: string; why?: string }
export function pieces(text: string): Piece[] {
  const out: Piece[] = []
  const re = /\[link: ([^\]|]+?)(?: \| described as: ([^\]]+))?\]|\[(?:([^\];:]+); )?read as: ([^\]]+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(m[1] !== undefined ? { link: m[1], described: m[2] } : { read: m[4], why: m[3] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
