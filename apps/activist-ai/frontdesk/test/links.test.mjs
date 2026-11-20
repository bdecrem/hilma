// A project's links to what its people use elsewhere (links.mjs, OLA-103), without a VM: a fresh
// database, the admin's add and remove, what is refused, and the audit rows.
// Run: node --test test/links.test.mjs (also part of frontdesk/check.mjs's unit run).
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDb } from '../db.mjs'
import { addLink, checkLink, linksOf, MAX_LINKS, removeLink } from '../links.mjs'

const fresh = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ola-links-'))
  const db = openDb(dir)
  const team = Number(db.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('fm-team', 'Made-up team', ?)").run(Date.now()).lastInsertRowid)
  const ws = Number(db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES ('notes-1', 'Notes', ?, 'active', ?)").run(team, Date.now()).lastInsertRowid)
  return { db, ws, dir }
}

test('links are kept in order, shown without their ids changing, and audited as the admin', () => {
  const { db, ws } = fresh()
  addLink(db, ws, { label: 'Adaptation Almanac', url: 'https://almanac.tunn3l.sh/almanac/', note: 'Runs on Claude, outside Ola' })
  addLink(db, ws, { label: '  MRD law library ', url: 'https://ola.cx/mrd' })
  const list = linksOf(db, ws)
  assert.deepEqual(
    list.map(({ id, ...l }) => l),
    [
      { label: 'Adaptation Almanac', url: 'https://almanac.tunn3l.sh/almanac/', note: 'Runs on Claude, outside Ola' },
      { label: 'MRD law library', url: 'https://ola.cx/mrd' },
    ],
  )
  assert.equal(removeLink(db, ws, list[0].id), true)
  assert.equal(removeLink(db, ws, list[0].id), false)
  assert.deepEqual(linksOf(db, ws).map((l) => l.label), ['MRD law library'])
  const rows = db.prepare('SELECT actor_kind, action FROM audit WHERE workspace_id = ? ORDER BY id').all(ws).map((r) => `${r.actor_kind} ${r.action}`)
  assert.deepEqual(rows, ['admin link_added', 'admin link_added', 'admin link_removed'])
})

test('only a whole https address without a password, a one-line label and note, and no repeats', () => {
  const { db, ws } = fresh()
  for (const url of ['http://ola.cx/mrd', 'javascript:alert(1)', 'ola.cx/mrd', 'https://bart:pw@ola.cx/', `https://ola.cx/${'a'.repeat(300)}`]) assert.ok(checkLink({ label: 'X', url }) instanceof Error, url)
  assert.ok(checkLink({ label: '', url: 'https://ola.cx/' }) instanceof Error)
  assert.ok(checkLink({ label: 'two\nlines', url: 'https://ola.cx/' }) instanceof Error)
  assert.ok(checkLink({ label: 'X', url: 'https://ola.cx/', note: 'n'.repeat(141) }) instanceof Error)
  addLink(db, ws, { label: 'MRD', url: 'https://ola.cx/mrd' })
  assert.throws(() => addLink(db, ws, { label: 'MRD again', url: 'https://ola.cx/mrd' }), /already links/)
  for (let i = 1; i < MAX_LINKS; i++) addLink(db, ws, { label: `L${i}`, url: `https://example.org/${i}` })
  assert.throws(() => addLink(db, ws, { label: 'one too many', url: 'https://example.org/x' }), /at most/)
  // The table refuses what the code would, too.
  assert.throws(() => db.prepare("INSERT INTO project_links (workspace_id, label, url, position, added_at) VALUES (?, 'X', 'http://ola.cx/', 9, 0)").run(ws))
})

test('the migration keeps the audit log and its older words', () => {
  const { dir, ws } = fresh()
  const again = openDb(dir) // opening twice runs no migration twice
  again.prepare("INSERT INTO audit (at, actor_kind, action, workspace_id) VALUES (?, 'admin', 'site_refused', ?)").run(Date.now(), ws)
  assert.equal(again.prepare("SELECT count(*) AS n FROM audit WHERE action = 'site_refused'").get().n, 1)
  assert.throws(() => again.prepare("INSERT INTO audit (at, actor_kind, action) VALUES (?, 'admin', 'not_a_word')").run(Date.now()))
})
