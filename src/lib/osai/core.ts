// Parser for the small markdown dialect scripts/osai/slurp.mjs writes:
//   # Title · one lede paragraph · ## Section · paragraphs · - bullets ·
//   **Label:** note · **Pros** / **Cons** followed by a list.
// Anything else renders as a paragraph, so a new shape in the Pages
// document degrades to readable text instead of breaking the page.

export type Inline = { kind: 'text' | 'em' | 'strong'; text: string }

export type Block =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'note'; label: string; text: string }
  | { type: 'proscons'; pros: string[]; cons: string[] }

export type Section = { heading: string; blocks: Block[] }
export type CoreDoc = { title: string; lede: string | null; sections: Section[] }

export function parseCore(md: string): CoreDoc {
  const lines = md
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))

  const doc: CoreDoc = { title: '', lede: null, sections: [] }
  let section: Section | null = null
  let pending: { which: 'pros' | 'cons' } | null = null
  let i = 0

  const push = (b: Block) => {
    if (!section) {
      // Text before the first section heading: the lede.
      if (b.type === 'p' && doc.lede == null) doc.lede = b.text
      else {
        section = { heading: '', blocks: [] }
        doc.sections.push(section)
        section.blocks.push(b)
      }
      return
    }
    section.blocks.push(b)
  }

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('# ')) {
      doc.title = line.slice(2).trim()
      i++
      continue
    }
    if (line.startsWith('## ')) {
      section = { heading: line.slice(3).trim(), blocks: [] }
      doc.sections.push(section)
      pending = null
      i++
      continue
    }
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2).trim())
        i++
      }
      if (pending && section) {
        const last = section.blocks[section.blocks.length - 1]
        if (last && last.type === 'proscons') {
          last[pending.which] = items
        } else {
          const b: Block = { type: 'proscons', pros: [], cons: [] }
          b[pending.which] = items
          section.blocks.push(b)
        }
        pending = null
      } else {
        push({ type: 'list', items })
      }
      continue
    }
    const pc = line.match(/^\*\*(Pros|Cons)\*\*$/i)
    if (pc) {
      pending = { which: pc[1].toLowerCase() as 'pros' | 'cons' }
      i++
      continue
    }
    const note = line.match(/^\*\*([^*]+?:)\*\*\s*(.*)$/)
    if (note) {
      push({ type: 'note', label: note[1].trim(), text: note[2].trim() })
      i++
      continue
    }
    push({ type: 'p', text: line.trim() })
    i++
  }
  return doc
}

/** `*em*` and `**strong**` runs, nothing more. */
export function inlines(text: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) })
    if (m[1] !== undefined) out.push({ kind: 'strong', text: m[1] })
    else out.push({ kind: 'em', text: m[2] })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}
