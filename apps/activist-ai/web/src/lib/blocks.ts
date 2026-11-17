// Ola's reply as blocks: a small Markdown subset (paragraphs, lists, headings, tables), as data.
// Answer.tsx builds elements from it, so model text never becomes HTML.
export type Block = { kind: 'p' | 'h'; text: string } | { kind: 'ul' | 'ol'; items: string[] } | { kind: 'table'; head: string[]; rows: string[][] }

/** One Markdown table row, `| a | b |`, as its cells. */
const cells = (line: string): string[] => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
const isRule = (line: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line)

export function blocks(text: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') })
    para = []
  }
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // A table: a row of cells, then a rule (|---|---|), then rows. Models write these often; before,
    // they were shown as a paragraph of pipes (first-user pass).
    if (line.startsWith('|') && i + 1 < lines.length && isRule(lines[i + 1].trim())) {
      flush()
      const head = cells(line)
      const rows: string[][] = []
      for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(cells(lines[i].trim()))
      i--
      out.push({ kind: 'table', head, rows })
      continue
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (!line) flush()
    else if (heading) {
      flush()
      out.push({ kind: 'h', text: heading[1] })
    } else if (bullet || numbered) {
      flush()
      const kind = bullet ? 'ul' : 'ol'
      const last = out[out.length - 1]
      const item = (bullet ?? numbered)![1]
      if (last && last.kind === kind) last.items.push(item)
      else out.push({ kind, items: [item] })
    } else para.push(line)
  }
  flush()
  return out
}

