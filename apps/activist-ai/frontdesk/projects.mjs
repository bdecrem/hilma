// Making a project (a workspace): one place for the admin CLI (`admin.mjs create-workspace`) and
// the page's "New project" (POST /api/projects, admins only). The VM is made first, by
// ../workspace/ws.mjs create; only then is the project written to the database, so a failed VM
// leaves nothing behind.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { audit } from './db.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const SLUG = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/
/** A project's name as typed on the page: one line, 1 to 80 characters, no control characters. */
export const validProjectName = (s) => typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 80 && !/[\u0000-\u001f\u007f]/.test(s)

/** `ws.mjs create <slug> [limits]`, without blocking the server. Resolves to its exit status. */
export function makeVm(slug, limits = [], { stdio = 'inherit' } = {}) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [path.join(HERE, '../workspace/ws.mjs'), 'create', slug, ...limits], { stdio, env: process.env })
    child.on('error', () => ok(1))
    child.on('exit', (code) => ok(code ?? 1))
  })
}

/**
 * Makes the project. `team` is { slug, name? } (a new team needs a name); `ownerId` becomes its
 * owner; `actor` is the audit row's actor ({ actorKind: 'admin' } from the CLI, the person from the
 * page). Throws an Error with a plain message; returns the new workspace's id.
 */
export async function createWorkspace(db, { slug, name, team, ownerId = null, limits = [], actor = { actorKind: 'admin' }, vm = makeVm }) {
  if (!slug || !SLUG.test(slug)) throw new Error('a workspace slug is 3 to 32 lowercase letters, digits or dashes')
  if (!validProjectName(name)) throw new Error('a project name is one line of 1 to 80 characters')
  if (db.prepare('SELECT 1 FROM workspaces WHERE slug = ?').get(slug)) throw new Error(`workspace ${slug} already exists`)
  const now = Date.now()
  let t = db.prepare('SELECT * FROM teams WHERE slug = ?').get(team.slug)
  if (!t && !team.name) throw new Error('a new team needs --team-name')
  if ((await vm(slug, limits)) !== 0) throw new Error('ws.mjs create failed; nothing was added to the database')
  if (!t) {
    db.prepare('INSERT INTO teams (slug, name, created_at) VALUES (?, ?, ?)').run(team.slug, team.name, now)
    t = db.prepare('SELECT * FROM teams WHERE slug = ?').get(team.slug)
  }
  const w = db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES (?, ?, ?, 'active', ?)").run(slug, name.trim(), t.id, now)
  const id = Number(w.lastInsertRowid)
  audit(db, { ...actor, action: 'workspace_created', workspace: id })
  if (ownerId) {
    db.prepare("INSERT INTO memberships (team_id, person_id, role, added_at) VALUES (?, ?, 'owner', ?) ON CONFLICT (team_id, person_id) DO UPDATE SET role = 'owner'").run(t.id, ownerId, now)
    audit(db, { ...actor, action: 'member_added', subject: ownerId, role: 'owner', workspace: id })
  }
  return { id, slug, team: t }
}

/** A slug for a name typed on the page: its words, then a short random tail, so two "Notes" differ. */
export function slugFor(name, tail) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 22).replace(/-+$/, '')
  return `${base || 'project'}-${tail}`
}
