// A stand-in for the tracker's database, kept in one JSON file, for tests (OLA-251, Nov 20).
// VENTURE_TRACKER_FAKE=<file.json> makes issues.mjs use it instead of Supabase, so a made-up claim,
// check or pass is tried on a copy and never lands in the real tracker. The file:
//   { "venture_issues": [...], "venture_state": [...], "venture_issue_activity": [...], "venture_commits": [...] }
// `node scripts/venture/_fakedb.mjs copy <file.json> [OLA-n …]` writes such a file from the real tracker
// (read only): the open tickets (and any named), the live claims and their checks.
// Only what issues.mjs uses: select, eq, neq, like, in, is, gte, lt, order, limit, maybeSingle, single,
// insert, upsert, update, delete.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'

// each operation is atomic across processes, as on the real database: one at a time under a lock folder,
// and the file replaced by a rename, so a reader never sees half a file (checkers racing two runs on a copy
// broke the file or lost a write, Nov 20)
function locked(file, fn) {
  const lock = file + '.lock'
  const t0 = Date.now()
  for (;;) {
    try { mkdirSync(lock); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      try { if (Date.now() - statSync(lock).mtimeMs > 10e3) { rmSync(lock, { recursive: true, force: true }); continue } } catch {}
      if (Date.now() - t0 > 30e3) throw new Error(`the copy of the tracker stays locked (${lock})`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
    }
  }
  try { return fn() } finally { rmSync(lock, { recursive: true, force: true }) }
}

const KEYS = { venture_issues: 'id', venture_state: 'key', venture_commits: 'sha', venture_issue_activity: 'id' }

export function fakeClient(file) {
  const load = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {})
  const save = (d) => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(d, null, 1)); renameSync(tmp, file) }
  return {
    from(table) {
      const q = { filters: [], op: 'select', rows: null, one: null, ord: null, lim: null }
      const like = (pat) => new RegExp('^' + String(pat).split('%').map((x) => x.replace(/[.+?^${}()|[\]\\*]/g, '\\$&')).join('.*') + '$')
      const match = (r) => q.filters.every((f) => f(r))
      const run = () => locked(file, () => runOnce())
      const runOnce = () => {
        const d = load()
        const all = d[table] ?? []
        const key = KEYS[table]
        let data
        if (q.op === 'insert' || q.op === 'upsert') {
          const rows = [].concat(q.rows).map((r) => ({ ...r }))
          for (const r of rows) {
            if (key === 'id' && table === 'venture_issue_activity' && r.id === undefined) r.id = (all.reduce((m, x) => Math.max(m, x.id ?? 0), 0) || 0) + 1
            if (key === 'key' && r.at === undefined) r.at = new Date().toISOString()
            const i = all.findIndex((x) => x[key] === r[key])
            if (i >= 0 && q.op === 'insert') return { data: null, error: { message: `duplicate key ${r[key]}` } }
            if (i >= 0) all[i] = { ...all[i], ...r }
            else all.push(table === 'venture_issues' ? { opened_at: new Date().toISOString(), updated_at: new Date().toISOString(), links: [], proof: '', ...r } : r)
          }
          d[table] = all
          save(d)
          data = rows.map((r) => all.find((x) => x[key] === r[key]))
        } else if (q.op === 'update') {
          data = all.filter(match)
          for (const r of data) Object.assign(r, q.rows)
          d[table] = all
          save(d)
        } else if (q.op === 'delete') {
          data = all.filter(match)
          d[table] = all.filter((r) => !match(r))
          save(d)
        } else data = all.filter(match)
        if (q.ord) data = [...data].sort((a, b) => (String(a[q.ord.col] ?? '').localeCompare(String(b[q.ord.col] ?? ''), undefined, { numeric: true })) * (q.ord.asc ? 1 : -1))
        if (q.lim !== null) data = data.slice(0, q.lim)
        if (q.one === 'maybe') return { data: data[0] ?? null, error: null }
        if (q.one === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: `${data.length} rows` } }
        return { data, error: null }
      }
      const b = {
        select() { return b },
        eq(c, v) { q.filters.push((r) => r[c] === v); return b },
        neq(c, v) { q.filters.push((r) => r[c] !== v); return b },
        like(c, p) { const re = like(p); q.filters.push((r) => re.test(String(r[c] ?? ''))); return b },
        in(c, vs) { q.filters.push((r) => vs.includes(r[c])); return b },
        is(c, v) { q.filters.push((r) => (r[c] ?? null) === v); return b },
        gte(c, v) { q.filters.push((r) => String(r[c]) >= String(v)); return b },
        lt(c, v) { q.filters.push((r) => String(r[c]) < String(v)); return b },
        order(col, o = {}) { q.ord = { col, asc: o.ascending !== false }; return b },
        limit(n) { q.lim = n; return b },
        maybeSingle() { q.one = 'maybe'; return b },
        single() { q.one = 'single'; return b },
        insert(rows) { q.op = 'insert'; q.rows = rows; return b },
        upsert(rows) { q.op = 'upsert'; q.rows = rows; return b },
        update(fields) { q.op = 'update'; q.rows = fields; return b },
        delete() { q.op = 'delete'; return b },
        then(res, rej) { try { return Promise.resolve(run()).then(res, rej) } catch (e) { return rej(e) } },
      }
      return b
    },
  }
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === 'copy') {
  const out = process.argv[3]
  if (!out) (console.error('usage: _fakedb.mjs copy <file.json> [OLA-n …]'), process.exit(1))
  const { createClient } = await import('@supabase/supabase-js')
  const { fileURLToPath } = await import('node:url')
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const env = Object.fromEntries(readFileSync(root + '.env.local', 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  const named = process.argv.slice(4)
  const issues = (await db.from('venture_issues').select('*').eq('project', 'ola').or(`status.in.(open,in_progress,waiting)${named.length ? `,id.in.(${named.join(',')})` : ''}`)).data ?? []
  const state = (await db.from('venture_state').select('*').or('key.like.claim:*,key.like.accept:*,key.like.wait:*,key.like.owed-fix:*,key.eq.weaknesses-fp,key.eq.ola_status')).data ?? []
  writeFileSync(out, JSON.stringify({ venture_issues: issues, venture_state: state, venture_issue_activity: [], venture_commits: [] }, null, 1))
  console.log(`${out}: ${issues.length} tickets, ${state.length} state rows (a copy; nothing in the real tracker changed)`)
}
