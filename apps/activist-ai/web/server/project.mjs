// The project and its things, as the front desk serves them to the page (GET /api/project).
//
// Milestone 1: the things Bart built with the group and the earlier work come from a fixture
// (made-up data, the eviction-report project from the design mocks). Things Ola makes in this
// workspace are real: a .csv it wrote becomes a table, a .md a document, read from the folder.
// The real front desk replaces the fixture with the platform database; the JSON shape is the
// contract (src/lib/types.ts, `ProjectPayload`).
import { fixture } from './fixture.mjs'

function parseCsv(text, maxRows) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cells = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++
        else if (ch === '"') quoted = false
        else cur += ch
      } else if (ch === '"') quoted = true
      else if (ch === ',') cells.push(cur), (cur = '')
      else cur += ch
    }
    cells.push(cur)
    rows.push(cells.map((c) => c.trim()))
    if (rows.length > maxRows) break
  }
  return rows
}

function markdownToSections(text) {
  const lines = text.split(/\r?\n/)
  let heading = null
  const sections = []
  let cur = { heading: null, paragraphs: [] }
  let para = []
  const flush = () => {
    if (para.length) cur.paragraphs.push(para.join(' ').replace(/\*\*|__|`/g, '').trim())
    para = []
  }
  for (const raw of lines) {
    const line = raw.trim()
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      flush()
      if (h[1].length === 1 && !heading) heading = h[2]
      else {
        if (cur.heading || cur.paragraphs.length) sections.push(cur)
        cur = { heading: h[2], paragraphs: [] }
      }
    } else if (!line) flush()
    else para.push(line.replace(/^[-*]\s+/, '• '))
  }
  flush()
  if (cur.heading || cur.paragraphs.length) sections.push(cur)
  return { heading, sections: sections.slice(0, 6) }
}

/** Things made from what Ola wrote in the workspace. */
export async function derivedThings(files) {
  const list = await files.list()
  const things = []
  for (const f of list) {
    if (f.origin !== 'made' || f.path.includes('/')) continue
    if (f.path.endsWith('.csv')) {
      const text = await files.readText(f.path, 32 * 1024)
      const rows = parseCsv(text ?? '', 7)
      if (rows.length < 2) continue
      const [head, ...body] = rows
      things.push({
        kind: 'table',
        id: `file:${f.path}`,
        title: f.path,
        byline: { madeBy: 'ola', when: f.modified, from: [] },
        state: 'ready',
        file: f.path,
        columns: head.map((label) => ({ label })),
        rows: body.slice(0, 6),
        note: body.length > 6 ? 'The first six rows.' : null,
      })
    } else if (f.path.endsWith('.md')) {
      const text = await files.readText(f.path, 32 * 1024)
      const { heading, sections } = markdownToSections(text ?? '')
      things.push({
        kind: 'document',
        id: `file:${f.path}`,
        title: heading ?? f.path,
        byline: { madeBy: 'ola', when: f.modified, from: [] },
        state: 'ready',
        file: f.path,
        heading: heading ?? f.path,
        dek: null,
        sections,
      })
    }
  }
  return things
}

export async function projectPayload(files) {
  const list = await files.list()
  const uploaded = list.filter((f) => f.origin === 'uploaded')
  const made = await derivedThings(files)
  return {
    project: { ...fixture.project, filesUploaded: uploaded.length },
    machine: fixture.machine,
    things: [...fixture.things, ...made],
  }
}
