// The project and its things, as the front desk serves them to the page (GET /api/project).
//
// Things are made from what is really in the workspace: a page (.html) Ola wrote becomes a page
// with Open, a .csv a table, a .md a document, read from the folder. The rest of the files are
// listed as they are. The dev server (../dev.mjs) adds the fixture's made-up things for the page's
// own checks; the front desk never does. The JSON shape is the contract (src/lib/types.ts,
// `ProjectPayload`).
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

/** The page's own title, from its <title>, as plain text (the workspace's word: shown as text only). */
export function pageTitle(html) {
  const m = /<title[^>]*>([^<]{1,400})<\/title>/i.exec(html ?? '')
  if (!m) return null
  const t = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, 80) : null
}
export const isPageFile = (rel) => /\.html?$/i.test(rel)
/** What Ola downloaded from the web (ola-fetch saves it under sources/): a source, never "made". */
export const isSourceFile = (f) => /^sources\/[^/]+$/.test(f.path)
const isImage = (rel) => /\.(png|jpe?g|gif|webp|svg)$/i.test(rel)
const isFileDoc = (rel) => /\.(pdf|docx)$/i.test(rel)
/** A file the home shows as a thing: any page, or a .csv/.md, a picture, a PDF or a Word file Ola
 * wrote at the top of the folder (pictures inside a page's folder belong to the page). */
export const isThingFile = (f) => !f.siteCopy && (isSourceFile(f) || isPageFile(f.path) || (f.origin === 'made' && !f.path.includes('/') && (/\.(csv|md|xlsx)$/.test(f.path) || isImage(f.path) || isFileDoc(f.path))))

/**
 * A publish copy (OLA-244). The publish skill's `prepare` copies a page into a folder (site/) to
 * publish it, and leaves <folder>/.ola-source.json naming the page it came from. The home showed
 * both, index.html and site/index.html, so one page looked like two and Publish offered a choice
 * between them. `records` are [{ folder, page }] read from those records. A folder whose page is
 * still in the project (outside it) is marked: its files are not things and not "other files" on
 * the home (Files still lists them), and the page gets `copies` (the folders), so a publish of the
 * copy shows as the page's. A record whose page is gone leaves the copy shown, as the only page.
 */
export function markSiteCopies(entries, records) {
  const byPath = new Map(entries.map((f) => [f.path, f]))
  for (const { folder, page } of records ?? []) {
    if (typeof folder !== 'string' || !folder || typeof page !== 'string') continue
    const src = byPath.get(page.replace(/^\.\//, ''))
    if (!src || src.path.startsWith(`${folder}/`) || !isPageFile(src.path)) continue
    for (const f of entries) if (f.path.startsWith(`${folder}/`)) f.siteCopy = folder
    src.copies = [...new Set([...(src.copies ?? []), folder])]
  }
  return entries
}

/** Things made from what is in the workspace. */
export async function derivedThings(files) {
  const list = await files.list()
  const things = []
  for (const f of list) {
    if (!isThingFile(f)) continue
    if (isSourceFile(f)) {
      // Its address and date come from the project database (the page asks /api/data/docs).
      const title = isPageFile(f.path) ? pageTitle(await files.readText(f.path, 32 * 1024)) : null
      const format = isPageFile(f.path) ? 'page' : /\.pdf$/i.test(f.path) ? 'PDF' : 'file'
      things.push({ kind: 'source', id: `file:${f.path}`, title: title ?? f.path.slice('sources/'.length), byline: { madeBy: 'ola', when: f.modified, from: [] }, state: 'ready', file: f.path, openable: true, format })
      continue
    }
    if (f.path.endsWith('.xlsx')) {
      // An Excel file Ola made: a table on the home, its rows and sheets behind Open (not read here).
      things.push({ kind: 'table', id: `file:${f.path}`, title: f.path, byline: { madeBy: 'ola', when: f.modified, from: [] }, state: 'ready', file: f.path, openable: true, columns: [], rows: [], note: 'An Excel file Ola made. Open shows its rows, sheet by sheet; Download has the file.' })
      continue
    }
    if (isImage(f.path) || isFileDoc(f.path)) {
      const image = isImage(f.path)
      things.push({
        kind: image ? 'image' : 'filedoc',
        id: `file:${f.path}`,
        title: f.path,
        byline: { madeBy: 'ola', when: f.modified, from: [] },
        state: 'ready',
        file: f.path,
        openable: true,
        ...(image ? { alt: `${f.path}, a picture Ola made` } : { format: /\.pdf$/i.test(f.path) ? 'PDF' : 'Word' }),
      })
      continue
    }
    if (isPageFile(f.path)) {
      const name = f.path.split('/').pop()
      const where = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : null
      const title = pageTitle(await files.readText(f.path, 32 * 1024))
      things.push({
        kind: 'site',
        id: `file:${f.path}`,
        title: title ?? name,
        byline: { madeBy: f.origin === 'made' ? 'ola' : 'you', when: f.modified, from: [] },
        state: 'ready',
        file: f.path,
        openable: true,
        visibility: 'private',
        pages: 1,
        ...(f.copies?.length ? { copies: f.copies } : {}),
        summary: `${title ? `${f.path}, a` : 'A'} web page ${f.origin === 'made' ? 'Ola made' : 'you uploaded'}${where && !title ? ` in ${where}` : ''}. Open shows it in a new tab.`,
      })
    } else if (f.path.endsWith('.csv')) {
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
        openable: true,
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
        openable: true,
        heading: heading ?? f.path,
        dek: null,
        sections,
      })
    }
  }
  return things
}

/**
 * Ola's own check screenshots (`ola-page --out shots/…`, as AGENTS.md asks) are how it looks at a
 * page, not something it made for the person: the home leaves them out (first-user pass, B9).
 * Files still lists them, and a design pass shows its before and after under its reply.
 */
export const isCheckShot = (f) => f.origin === 'made' && /^shots\/[^/]+\.png$/i.test(f.path)

/** The files the home lists under its things: everything not already shown as a thing. */
export const otherFiles = (list, things, max = 50) => {
  const shown = new Set(things.map((t) => t.file).filter(Boolean))
  return list.filter((f) => !shown.has(f.path) && !isCheckShot(f) && !f.siteCopy).slice(0, max)
}

export const otherCount = (list, things) => {
  const shown = new Set(things.map((t) => t.file).filter(Boolean))
  return list.filter((f) => !shown.has(f.path) && !isCheckShot(f) && !f.siteCopy).length
}

/** The dev server's payload: the fixture's made-up things, then the real ones. */
export async function projectPayload(files) {
  const list = await files.list()
  const uploaded = list.filter((f) => f.origin === 'uploaded')
  const made = await derivedThings(files)
  return {
    project: { ...fixture.project, filesUploaded: uploaded.length },
    machine: fixture.machine,
    things: [...fixture.things, ...made],
    files: otherFiles(list, made),
    otherTotal: otherCount(list, made),
    // OLA_DEV_LINKS=1: the project's links to what its people use elsewhere (OLA-103), made up.
    ...(process.env.OLA_DEV_LINKS === '1' ? { links: fixture.links } : {}),
  }
}
