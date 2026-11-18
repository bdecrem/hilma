// "New project" (projects.mjs), without a VM: the shared code behind `admin.mjs create-workspace`
// and POST /api/projects. A stand-in for ws.mjs says yes or no; the database is a fresh one.
// Run: node --test test/projects.test.mjs (also part of frontdesk/check.mjs).
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDb } from '../db.mjs'
import { createWorkspace, slugFor, validProjectName } from '../projects.mjs'

const fresh = () => {
  const db = openDb(mkdtempSync(path.join(os.tmpdir(), 'ola-projects-')))
  const id = Number(db.prepare("INSERT INTO people (handle, display_name, status, is_admin, webauthn_user_id, created_at) VALUES ('olga', 'Olga O.', 'active', 1, ?, ?)").run(Buffer.alloc(32), Date.now()).lastInsertRowid)
  return { db, id }
}

test('a new project is made in the team, with its maker as owner, and audited', async () => {
  const { db, id } = fresh()
  const made = []
  const r = await createWorkspace(db, { slug: 'notes-ab12cd', name: '  Made-up notes ', team: { slug: 'olga-team', name: 'Olga O.' }, ownerId: id, actor: { actor: id }, vm: async (slug) => (made.push(slug), 0) })
  assert.deepEqual(made, ['notes-ab12cd'])
  const w = db.prepare('SELECT w.name, w.status, t.slug AS team FROM workspaces w JOIN teams t ON t.id = w.team_id WHERE w.slug = ?').get('notes-ab12cd')
  assert.deepEqual({ ...w }, { name: 'Made-up notes', status: 'active', team: 'olga-team' })
  assert.equal(db.prepare('SELECT role FROM memberships WHERE person_id = ?').get(id).role, 'owner')
  assert.deepEqual(db.prepare('SELECT action FROM audit WHERE workspace_id = ? ORDER BY id').all(r.id).map((x) => x.action), ['workspace_created', 'member_added'])
})

test('a failed VM leaves nothing behind; a taken slug, a bad slug and a bad name are refused before any VM', async () => {
  const { db, id } = fresh()
  let calls = 0
  const vm = async () => (calls++, 1)
  await assert.rejects(createWorkspace(db, { slug: 'notes-ab12cd', name: 'Notes', team: { slug: 'olga-team', name: 'Olga O.' }, ownerId: id, vm }), /ws\.mjs create failed/)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workspaces').get().n, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teams').get().n, 0)
  calls = 0
  await assert.rejects(createWorkspace(db, { slug: 'X', name: 'Notes', team: { slug: 'team-t' }, vm }), /slug/)
  await assert.rejects(createWorkspace(db, { slug: 'notes-1', name: 'line\nbreak', team: { slug: 'team-t', name: 'T' }, vm }), /name/)
  await assert.rejects(createWorkspace(db, { slug: 'notes-1', name: 'Notes', team: { slug: 'nobody-yet' }, vm }), /team-name/)
  await createWorkspace(db, { slug: 'notes-1', name: 'Notes', team: { slug: 'team-t', name: 'T' }, vm: async () => 0 })
  await assert.rejects(createWorkspace(db, { slug: 'notes-1', name: 'Notes', team: { slug: 'team-t' }, vm }), /already exists/)
  assert.equal(calls, 0, 'a VM was asked for a refused project')
})

test('slugs from names, and what a name may be', () => {
  assert.equal(slugFor('Hello world!', 'ab12cd'), 'hello-world-ab12cd')
  assert.equal(slugFor('日本', 'ab12cd'), 'project-ab12cd')
  assert.match(slugFor('A very long project name that goes on and on', 'ab12cd'), /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/)
  assert.ok(validProjectName('Spring report') && !validProjectName('') && !validProjectName('   ') && !validProjectName('x'.repeat(81)))
})
