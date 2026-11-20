// A project's links to what its people already use somewhere else (OLA-103): the Adaptation
// Almanac in Frances's project home, the MRD law library in Ian's. Set by the admin only
// (`admin.mjs link`), shown to every member on the project home and in the phone's Menu. Ola does
// not reach these addresses: the front desk only shows the link; the browser opens it.
//
// A link is a label (what it is called), an https address, and an optional note of one line (what
// it is and what it runs on, e.g. "Runs on Claude, outside Ola"). Nothing else is kept.

import { audit } from './db.mjs'

export const MAX_LINKS = 6

/** The link as it may be stored, or an Error that says what is wrong. */
export function checkLink({ label, url, note }) {
  label = String(label ?? '').trim()
  note = note === undefined || note === null ? null : String(note).trim() || null
  if (!label || label.length > 60 || /[\u0000-\u001f]/.test(label)) return new Error('--label is 1 to 60 characters on one line')
  if (note !== null && (note.length > 140 || /[\u0000-\u001f]/.test(note))) return new Error('--note is at most 140 characters on one line')
  let u
  try {
    u = new URL(String(url ?? ''))
  } catch {
    return new Error('--url is a whole address, starting with https://')
  }
  if (u.protocol !== 'https:') return new Error('--url starts with https://')
  if (u.username || u.password) return new Error('--url may not carry a name or a password')
  if (u.href.length > 300) return new Error('--url is at most 300 characters')
  return { label, url: u.href, note }
}

/** The project's links, in the order they were added. */
export const linksOf = (db, workspaceId) =>
  db.prepare('SELECT id, label, url, note FROM project_links WHERE workspace_id = ? ORDER BY position, id').all(workspaceId).map((r) => ({ id: r.id, label: r.label, url: r.url, ...(r.note ? { note: r.note } : {}) }))

/** Adds a link (the admin's), audited. Throws on a bad link or past MAX_LINKS. */
export function addLink(db, workspaceId, link, actor = {}) {
  const ok = checkLink(link)
  if (ok instanceof Error) throw ok
  const n = db.prepare('SELECT count(*) AS n, coalesce(max(position), 0) AS top FROM project_links WHERE workspace_id = ?').get(workspaceId)
  if (n.n >= MAX_LINKS) throw new Error(`a project has at most ${MAX_LINKS} links`)
  if (db.prepare('SELECT 1 FROM project_links WHERE workspace_id = ? AND url = ?').get(workspaceId, ok.url)) throw new Error('this project already links to that address')
  const id = Number(db.prepare('INSERT INTO project_links (workspace_id, label, url, note, position, added_at) VALUES (?, ?, ?, ?, ?, ?)').run(workspaceId, ok.label, ok.url, ok.note, n.top + 1, Date.now()).lastInsertRowid)
  audit(db, { actorKind: 'admin', ...actor, action: 'link_added', workspace: workspaceId })
  return id
}

/** Removes one link by its id (from `admin.mjs links`), audited. False when there is none. */
export function removeLink(db, workspaceId, id, actor = {}) {
  const r = db.prepare('DELETE FROM project_links WHERE workspace_id = ? AND id = ?').run(workspaceId, id)
  if (!r.changes) return false
  audit(db, { actorKind: 'admin', ...actor, action: 'link_removed', workspace: workspaceId })
  return true
}
