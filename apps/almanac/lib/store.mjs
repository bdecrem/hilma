// The app's own state (chats, their events, artifacts, coding runs) in ~/almanac/almanac.db.
// The corpus itself is gami.db, which this process only ever reads (see db.mjs).
import { DatabaseSync } from 'node:sqlite'
import crypto from 'node:crypto'
import { STATE_DB } from './config.mjs'

const db = new DatabaseSync(STATE_DB)
db.exec(`
PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, title TEXT, author TEXT, created TEXT, updated TEXT,
  session_id TEXT, last_seq INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS events (chat_id TEXT, seq INTEGER, t TEXT, type TEXT, data TEXT, PRIMARY KEY (chat_id, seq));
CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, chat_id TEXT, kind TEXT, title TEXT, description TEXT,
  files TEXT, meta TEXT, author TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, chat_id TEXT, name TEXT, spec TEXT, status TEXT, total INTEGER,
  done INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, est_tokens INTEGER, created TEXT, finished TEXT, artifact_id TEXT,
  author TEXT, error TEXT);
CREATE TABLE IF NOT EXISTS job_papers (job_id TEXT, paper_id TEXT, status TEXT, error TEXT, note TEXT, items INTEGER,
  PRIMARY KEY (job_id, paper_id));
CREATE TABLE IF NOT EXISTS codings (job_id TEXT, paper_id TEXT, item INTEGER, field TEXT, value TEXT, quote TEXT,
  page INTEGER, quote_found INTEGER, PRIMARY KEY (job_id, paper_id, item, field));
`)

export const now = () => new Date().toISOString()
export const newId = () => crypto.randomBytes(5).toString('hex')
const parse = (row, ...keys) => { if (row) for (const k of keys) row[k] = row[k] ? JSON.parse(row[k]) : null; return row }

export const chats = {
  list: () => db.prepare('SELECT id, title, author, created, updated FROM chats ORDER BY updated DESC').all(),
  get: id => db.prepare('SELECT * FROM chats WHERE id = ?').get(id),
  create({ title, author }) {
    const id = newId(), t = now()
    db.prepare('INSERT INTO chats (id, title, author, created, updated) VALUES (?,?,?,?,?)').run(id, title, author, t, t)
    return id
  },
  setSession: (id, sid) => db.prepare('UPDATE chats SET session_id = ? WHERE id = ?').run(sid, id),
  touch: id => db.prepare('UPDATE chats SET updated = ? WHERE id = ?').run(now(), id),
  nextSeq: id => db.prepare('UPDATE chats SET last_seq = last_seq + 1 WHERE id = ? RETURNING last_seq').get(id).last_seq,
  remove(id) {
    db.prepare('DELETE FROM events WHERE chat_id = ?').run(id)
    db.prepare('DELETE FROM chats WHERE id = ?').run(id)
  },
}

export const events = {
  add(chatId, ev) {
    const { seq, t, type, ...data } = ev
    db.prepare('INSERT INTO events (chat_id, seq, t, type, data) VALUES (?,?,?,?,?)').run(chatId, seq, t, type, JSON.stringify(data))
  },
  list(chatId, after = 0) {
    return db.prepare('SELECT seq, t, type, data FROM events WHERE chat_id = ? AND seq > ? ORDER BY seq').all(chatId, after)
      .map(r => ({ seq: r.seq, t: r.t, type: r.type, ...JSON.parse(r.data) }))
  },
}

export const artifacts = {
  create({ id = newId(), chatId, kind, title, description, files, meta, author }) {
    db.prepare('INSERT INTO artifacts (id, chat_id, kind, title, description, files, meta, author, created) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, chatId ?? null, kind, title, description ?? '', JSON.stringify(files), JSON.stringify(meta ?? {}), author ?? null, now())
    return id
  },
  list: () => db.prepare(`SELECT a.*, c.title AS chat_title FROM artifacts a LEFT JOIN chats c ON c.id = a.chat_id
    ORDER BY a.created DESC`).all().map(r => parse(r, 'files', 'meta')),
  get: id => parse(db.prepare(`SELECT a.*, c.title AS chat_title FROM artifacts a LEFT JOIN chats c ON c.id = a.chat_id
    WHERE a.id = ?`).get(id), 'files', 'meta'),
  remove: id => db.prepare('DELETE FROM artifacts WHERE id = ?').run(id),
}

export const jobs = {
  create({ chatId, name, spec, total, estTokens, author, paperIds }) {
    const id = newId()
    db.exec('BEGIN')
    try {
      db.prepare(`INSERT INTO jobs (id, chat_id, name, spec, status, total, est_tokens, created, author)
        VALUES (?,?,?,?,'running',?,?,?,?)`).run(id, chatId ?? null, name, JSON.stringify(spec), total, estTokens, now(), author ?? null)
      const ins = db.prepare(`INSERT INTO job_papers (job_id, paper_id, status) VALUES (?, ?, 'todo')`)
      for (const p of paperIds) ins.run(id, p)
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
    return id
  },
  get: id => parse(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id), 'spec'),
  list: () => db.prepare('SELECT * FROM jobs ORDER BY created DESC').all().map(r => parse(r, 'spec')),
  running: () => db.prepare(`SELECT id FROM jobs WHERE status = 'running'`).all().map(r => r.id),
  todo: id => db.prepare(`SELECT paper_id FROM job_papers WHERE job_id = ? AND status != 'done' ORDER BY rowid`).all(id).map(r => r.paper_id),
  status: (id, status, extra = {}) => db.prepare('UPDATE jobs SET status = ?, finished = ?, error = ?, artifact_id = COALESCE(?, artifact_id) WHERE id = ?')
    .run(status, ['done', 'failed', 'cancelled'].includes(status) ? now() : null, extra.error ?? null, extra.artifactId ?? null, id),
  count: id => db.prepare(`UPDATE jobs SET done = (SELECT count(*) FROM job_papers WHERE job_id = ?1 AND status = 'done'),
    errors = (SELECT count(*) FROM job_papers WHERE job_id = ?1 AND status = 'error') WHERE id = ?1`).run(id),
  saveCoding(jobId, paperId, rows, note) {
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM codings WHERE job_id = ? AND paper_id = ?').run(jobId, paperId)
      const ins = db.prepare('INSERT INTO codings (job_id, paper_id, item, field, value, quote, page, quote_found) VALUES (?,?,?,?,?,?,?,?)')
      for (const r of rows) ins.run(jobId, paperId, r.item, r.field, r.value, r.quote, r.page, r.quote_found)
      const items = new Set(rows.map(r => r.item)).size
      db.prepare(`UPDATE job_papers SET status = 'done', error = NULL, note = ?, items = ? WHERE job_id = ? AND paper_id = ?`).run(note ?? null, items, jobId, paperId)
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
  },
  paperError: (jobId, paperId, error) => db.prepare(`UPDATE job_papers SET status = 'error', error = ? WHERE job_id = ? AND paper_id = ?`).run(error, jobId, paperId),
  codings: id => db.prepare('SELECT * FROM codings WHERE job_id = ? ORDER BY paper_id, item, field').all(id),
  papers: id => db.prepare('SELECT * FROM job_papers WHERE job_id = ? ORDER BY rowid').all(id),
}
