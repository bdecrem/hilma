// Parse an uploaded book list (.csv or .md) into {title, author, type}.
// Lenient by design — people export from all sorts of places.

export type ParsedBook = { title: string; author: string; type: string }

// Minimal RFC-4180-ish CSV row splitter (handles quoted fields + commas).
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function colIndex(header: string[], names: string[]): number {
  return header.findIndex((h) => names.some((n) => h.toLowerCase().includes(n)))
}

function fromCsv(text: string): ParsedBook[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const ti = colIndex(header, ['title']), ai = colIndex(header, ['author']), tyi = colIndex(header, ['type'])
  if (ti === -1) return [] // no recognizable title column
  return lines.slice(1).map((l) => {
    const f = splitCsvLine(l)
    return { title: (f[ti] || '').trim(), author: (ai >= 0 ? f[ai] || '' : '').trim(), type: (tyi >= 0 ? f[tyi] || '' : '').trim() }
  }).filter((b) => b.title)
}

function fromMarkdownTable(text: string): ParsedBook[] {
  const rows = text.split(/\r?\n/).filter((l) => l.trim().startsWith('|'))
  if (rows.length < 2) return []
  const cells = (l: string) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  const header = cells(rows[0]).map((h) => h.toLowerCase())
  const ti = colIndex(header, ['title']), ai = colIndex(header, ['author']), tyi = colIndex(header, ['type'])
  if (ti === -1) return []
  return rows.slice(1)
    .filter((l) => !/^\|[\s:|-]+\|?$/.test(l)) // skip the |---|---| separator
    .map((l) => {
      const c = cells(l)
      return { title: (c[ti] || '').trim(), author: (ai >= 0 ? c[ai] || '' : '').trim(), type: (tyi >= 0 ? c[tyi] || '' : '').trim() }
    })
    .filter((b) => b.title && b.title !== '#')
}

// Plain lines: "Title — Author", "Title by Author", "- Title (Author)", or just "Title".
function fromLines(text: string): ParsedBook[] {
  return text.split(/\r?\n/).map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('|'))
    .map((l) => {
      let m = l.match(/^(.*?)\s+[—–-]\s+(.+)$/) || l.match(/^(.*?)\s+by\s+(.+)$/i)
      if (m) return { title: m[1].trim(), author: m[2].trim(), type: '' }
      m = l.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
      if (m) return { title: m[1].trim(), author: m[2].trim(), type: '' }
      return { title: l, author: '', type: '' }
    })
    .filter((b) => b.title)
}

export function parseLibrary(text: string, filename = ''): ParsedBook[] {
  const isCsv = filename.toLowerCase().endsWith('.csv') || /(^|\n)[^\n]*,[^\n]*,/.test(text.slice(0, 400))
  let books: ParsedBook[] = []
  if (isCsv) books = fromCsv(text)
  if (books.length === 0) books = fromMarkdownTable(text)
  if (books.length === 0) books = fromLines(text)
  // de-dupe identical title+author
  const seen = new Set<string>()
  return books.filter((b) => {
    const k = `${b.title.toLowerCase()}|${b.author.toLowerCase()}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
