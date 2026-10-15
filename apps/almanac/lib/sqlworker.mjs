// Runs one read-only query against gami.db in a child process, so a slow query never blocks the server and a
// runaway one can be killed (a worker thread can't be stopped while SQLite is busy).
// The app's own tables (codings, jobs, job_papers, artifacts) are attached read-only as schema "almanac".
import { DatabaseSync } from 'node:sqlite'

let db
function open(gamiDb, stateDb) {
  db = new DatabaseSync(gamiDb, { readOnly: true })
  db.exec(`ATTACH DATABASE '${stateDb.replace(/'/g, "''")}' AS almanac; PRAGMA query_only = 1;`)
}

function oneStatement(q) {
  const s = String(q).trim().replace(/;\s*$/, '')
  const bare = s.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, '')
  if (/;\s*\S/.test(bare)) throw new Error('one statement at a time')
  return s
}
function cell(v, max) {
  if (typeof v === 'bigint') return Number(v)
  if (v instanceof Uint8Array) return `<blob ${v.length} bytes>`
  if (typeof v === 'string' && max && v.length > max) return v.slice(0, max) + `…[+${v.length - max} chars]`
  return v
}
function select(query, maxRows, cellMax) {
  const stmt = db.prepare(oneStatement(query))
  const columns = stmt.columns().map(c => c.name)
  stmt.setReturnArrays(true)
  const rows = []; let more = false
  for (const r of stmt.iterate()) {
    if (rows.length >= maxRows) { more = true; break }
    rows.push(r.map(v => cell(v, cellMax)))
  }
  return { columns, rows, more }
}
function pageRange(spec, last) {
  if (!spec) return null
  const keep = new Set()
  for (const part of String(spec).split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) throw new Error(`pages: cannot read "${part}" (use e.g. "1-3,7")`)
    for (let p = +m[1]; p <= Math.min(+(m[2] || m[1]), last); p++) keep.add(p)
  }
  return keep
}

const ops = {
  sql: ({ query, maxRows = 200, cellMax = 1500 }) => select(query, maxRows, cellMax),
  rows: ({ query, maxRows = 100000 }) => select(query, maxRows, 0),

  search({ query, where = '1=1', limit = 25 }) {
    const base = `FROM papers_fts f JOIN papers p ON p.rowid = f.rowid WHERE papers_fts MATCH ?1 AND (${where})`
    const total = db.prepare(`SELECT count(*) AS n ${base}`).get(query).n
    const papers = db.prepare(`SELECT p.id, p.year, p.title, p.authors, p.status ${base} ORDER BY f.rank LIMIT ?2`).all(query, limit)
    const range = db.prepare('SELECT min(rowid) AS lo, max(rowid) AS hi FROM pages WHERE paper_id = ?')
    const hits = db.prepare(`SELECT count(*) AS n FROM pages_fts WHERE pages_fts MATCH ?1 AND rowid BETWEEN ?2 AND ?3`)
    const best = db.prepare(`SELECT page, snippet(pages_fts, 2, '[', ']', '…', 16) AS snippet FROM pages_fts
      WHERE pages_fts MATCH ?1 AND rowid BETWEEN ?2 AND ?3 ORDER BY rank LIMIT 1`)
    for (const p of papers) {
      const r = range.get(p.id)
      if (r.lo == null) { p.pages_with_hits = 0; p.page = null; p.snippet = '(no full text; matched the title or the GAMI summary)'; continue }
      p.pages_with_hits = hits.get(query, r.lo, r.hi).n
      const b = p.pages_with_hits ? best.get(query, r.lo, r.hi) : null
      p.page = b?.page ?? null
      p.snippet = b ? b.snippet.replace(/\s+/g, ' ') : '(matched the title or the GAMI summary)'
    }
    return { total, papers }
  },

  paper({ id, pages }) {
    const meta = db.prepare(`SELECT id, title, authors, year, journal, doi, status, pages, words, summary,
      geography AS region, geography_country AS country, sector, hazards, responsetype AS response_type,
      actors_institutions AS actors, implementation_stage FROM papers WHERE id = ?`).get(String(id))
    if (!meta) throw new Error(`no paper with id ${id}`)
    const all = db.prepare('SELECT page, text FROM pages WHERE paper_id = ? ORDER BY page').all(String(id))
    const keep = pageRange(pages, meta.pages || 0)
    return { meta, pages: keep ? all.filter(p => keep.has(p.page)) : all }
  },

  // the papers a coding run will read: ids + word counts
  choose({ where = '1=1', ids, needText = true, limit, sample = 'random' }) {
    const conds = [`(${where})`]
    if (needText) conds.push('p.body IS NOT NULL')
    let params = []
    if (ids?.length) { conds.push(`p.id IN (${ids.map(() => '?').join(',')})`); params = ids.map(String) }
    const order = sample === 'random' ? 'random()' : 'p.n'
    return db.prepare(`SELECT p.id, coalesce(p.words, 0) AS words, length(coalesce(p.summary, '')) AS summary_chars
      FROM papers p WHERE ${conds.join(' AND ')} ORDER BY ${order} ${limit ? `LIMIT ${Number(limit)}` : ''}`).all(...params)
  },

  stats() {
    const totals = db.prepare(`SELECT count(*) AS papers, count(body) AS full_text, sum(words) AS words,
      min(year) AS first_year, max(year) AS last_year, count(year) AS with_year FROM papers`).get()
    const tags = db.prepare(`SELECT field, value, count(DISTINCT paper_id) AS n FROM tags GROUP BY field, value ORDER BY field, n DESC`).all()
    const years = db.prepare(`SELECT year, count(*) AS n FROM papers WHERE year IS NOT NULL GROUP BY year ORDER BY year`).all()
    const cols = db.prepare(`SELECT name, type FROM pragma_table_info('papers')`).all()
    const small = {}
    for (const c of cols) {
      if (['body', 'title', 'summary', 'citation', 'citation_2', 'authors', 'doi', 'pdf'].includes(c.name)) continue
      const d = db.prepare(`SELECT count(DISTINCT "${c.name}") AS n FROM papers`).get().n
      if (d > 0 && d <= 12) small[c.name] = db.prepare(`SELECT "${c.name}" AS value, count(*) AS n FROM papers GROUP BY 1 ORDER BY n DESC`).all()
    }
    return { totals, tags, years, columns: cols.map(c => c.name), small }
  },
}

process.once('message', ({ gamiDb, stateDb, op, args }) => {
  let out
  try {
    if (!ops[op]) throw new Error(`unknown op ${op}`)
    open(gamiDb, stateDb)
    out = { result: ops[op](args || {}) }
  } catch (e) { out = { error: String(e?.message || e) } }
  process.send(out, () => process.exit(0))
})
