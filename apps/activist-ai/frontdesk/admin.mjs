#!/usr/bin/env node
// The front desk's admin CLI (no admin web page in this milestone). Runs as the account that
// owns the platform database and the workspaces, on the machine itself.
//
//   node admin.mjs add-person <handle> --name "Maria L." [--admin]
//   node admin.mjs invite <handle> [--hours 72]          prints a single-use link, once
//   node admin.mjs create-workspace <slug> --name "Spring eviction report" --team <team-slug>
//                  [--team-name "North District Tenants' Union"] [--owner <handle>]
//                  [--memory 6g --disk 50g --cpus 4]    calls workspace/ws.mjs create
//   node admin.mjs add-member <team-slug> <handle> <owner|member|viewer>   (also changes a role)
//   node admin.mjs remove-member <team-slug> <handle>
//   node admin.mjs revoke-sessions <handle>             every session of that person ends now
//   node admin.mjs suspend <handle>                      no sign-in, sessions revoked
//   node admin.mjs shown-to-cloud <workspace> --by <handle>   record a cloud agent's look (with the customer's yes)
//   node admin.mjs audit [--workspace <slug>] [--limit 50] [--json]
//   node admin.mjs list
//
// Settings come from the same environment as the server (OLA_FD_DATA, OLA_FD_ORIGIN, OLA_HOME).
// Display names are typed here by the admin; the database takes no text from the people themselves.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { audit, openDb } from './db.mjs'
import { makeInvite } from './auth.mjs'
import { config } from './server.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const fail = (m) => {
  console.error(`admin: ${m}`)
  process.exit(1)
}

const argv = process.argv.slice(2)
const [cmd, ...rest] = argv
const flags = {}
const args = []
for (let i = 0; i < rest.length; i++) {
  if (['--admin', '--json'].includes(rest[i])) flags[rest[i].slice(2)] = true
  else if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[++i]
  else args.push(rest[i])
}

const cfg = config()
const db = openDb(cfg.data)
const person = (handle) => db.prepare('SELECT * FROM people WHERE handle = ?').get(handle) ?? fail(`no person ${handle}`)
const team = (slug) => db.prepare('SELECT * FROM teams WHERE slug = ?').get(slug) ?? fail(`no team ${slug}`)
const workspace = (slug) => db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug) ?? fail(`no workspace ${slug}`)
const admin = (row) => audit(db, { actorKind: 'admin', ...row })
const now = Date.now()

switch (cmd) {
  case 'add-person': {
    const [handle] = args
    if (!handle || !/^[a-z][a-z0-9-]{2,15}$/.test(handle)) fail('a handle is 3 to 16 lowercase letters, digits or dashes, starting with a letter')
    const name = flags.name ?? fail('--name "Display name" (as you, the admin, want it shown)')
    if (name.length > 60) fail('--name is at most 60 characters')
    const r = db.prepare("INSERT INTO people (handle, display_name, status, is_admin, webauthn_user_id, created_at) VALUES (?, ?, 'invited', ?, ?, ?)").run(handle, name, flags.admin ? 1 : 0, randomBytes(32), now)
    admin({ action: 'person_added', subject: Number(r.lastInsertRowid) })
    console.log(`added ${handle}; next: node admin.mjs invite ${handle}`)
    break
  }
  case 'invite': {
    const p = person(args[0])
    if (p.status === 'suspended') fail(`${p.handle} is suspended`)
    const hours = Number(flags.hours ?? 72)
    if (!(hours > 0 && hours <= 24 * 14)) fail('--hours is more than 0 and at most 336')
    const raw = makeInvite(db, p.id, hours * 3600_000)
    admin({ action: 'invited', subject: p.id })
    // The link is a secret until it is used: send it to the person by a channel you trust.
    console.log(`${cfg.origin}/#/invite/${raw}`)
    console.error(`single use, expires in ${hours} h. Send it only to ${p.display_name}.`)
    break
  }
  case 'create-workspace': {
    const [slug] = args
    if (!slug || !/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) fail('a workspace slug is 3 to 32 lowercase letters, digits or dashes')
    const name = flags.name ?? fail('--name "Workspace name"')
    const teamSlug = flags.team ?? fail('--team <team-slug> (created if new, with --team-name)')
    let t = db.prepare('SELECT * FROM teams WHERE slug = ?').get(teamSlug)
    if (!t) {
      db.prepare('INSERT INTO teams (slug, name, created_at) VALUES (?, ?, ?)').run(teamSlug, flags['team-name'] ?? fail('a new team needs --team-name'), now)
      t = team(teamSlug)
    }
    if (db.prepare('SELECT 1 FROM workspaces WHERE slug = ?').get(slug)) fail(`workspace ${slug} already exists`)
    const owner = flags.owner ? person(flags.owner) : null
    const limits = ['memory', 'disk', 'cpus'].flatMap((k) => (flags[k] ? [`--${k}`, flags[k]] : []))
    const r = spawnSync(process.execPath, [path.join(HERE, '../workspace/ws.mjs'), 'create', slug, ...limits], { stdio: 'inherit', env: process.env })
    if (r.status !== 0) fail('ws.mjs create failed; nothing was added to the database')
    const w = db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES (?, ?, ?, 'active', ?)").run(slug, name, t.id, now)
    admin({ action: 'workspace_created', workspace: Number(w.lastInsertRowid) })
    if (owner) {
      db.prepare("INSERT INTO memberships (team_id, person_id, role, added_at) VALUES (?, ?, 'owner', ?) ON CONFLICT (team_id, person_id) DO UPDATE SET role = 'owner'").run(t.id, owner.id, now)
      admin({ action: 'member_added', subject: owner.id, role: 'owner', workspace: Number(w.lastInsertRowid) })
    }
    console.log(`workspace ${slug} created for team ${t.slug}. Restart the gateway so it learns the new token (ws.mjs wrote ${process.env.OLA_HOME ?? '~/.ola'}/gateway-tokens).`)
    break
  }
  case 'add-member': {
    const [teamSlug, handle, role] = args
    if (!['owner', 'member', 'viewer'].includes(role)) fail('role is owner, member or viewer')
    const t = team(teamSlug)
    const p = person(handle)
    const had = db.prepare('SELECT role FROM memberships WHERE team_id = ? AND person_id = ?').get(t.id, p.id)
    db.prepare('INSERT INTO memberships (team_id, person_id, role, added_at) VALUES (?, ?, ?, ?) ON CONFLICT (team_id, person_id) DO UPDATE SET role = excluded.role').run(t.id, p.id, role, now)
    admin({ action: had ? 'role_changed' : 'member_added', subject: p.id, role })
    console.log(`${handle} is ${role} of ${teamSlug}`)
    break
  }
  case 'remove-member': {
    const [teamSlug, handle] = args
    const t = team(teamSlug)
    const p = person(handle)
    const r = db.prepare('DELETE FROM memberships WHERE team_id = ? AND person_id = ?').run(t.id, p.id)
    if (!r.changes) fail(`${handle} was not in ${teamSlug}`)
    admin({ action: 'member_removed', subject: p.id })
    console.log(`${handle} removed from ${teamSlug}; their next request to its workspaces is refused.`)
    console.log('Not done automatically yet: rotating the workspaces\' opencode password and gateway token (they may have seen both from inside).')
    break
  }
  case 'revoke-sessions':
  case 'suspend': {
    const p = person(args[0])
    const r = db.prepare('UPDATE sessions SET revoked_at = ? WHERE person_id = ? AND revoked_at IS NULL').run(now, p.id)
    admin({ action: 'sessions_revoked', subject: p.id })
    if (cmd === 'suspend') {
      db.prepare("UPDATE people SET status = 'suspended' WHERE id = ?").run(p.id)
      admin({ action: 'person_suspended', subject: p.id })
    }
    console.log(`${r.changes} session(s) of ${p.handle} revoked${cmd === 'suspend' ? '; suspended' : ''}`)
    break
  }
  case 'shown-to-cloud': {
    const w = workspace(args[0])
    const by = person(flags.by ?? fail('--by <handle>: the customer who said yes'))
    admin({ action: 'shown_to_cloud_agent', workspace: w.id, subject: by.id })
    console.log(`recorded: ${w.slug} shown to a cloud agent, with ${by.handle}'s yes`)
    break
  }
  case 'audit': {
    const limit = Math.min(1000, Number(flags.limit ?? 50))
    const w = flags.workspace ? workspace(flags.workspace) : null
    const rows = db
      .prepare(
        `SELECT a.id, a.at, a.actor_kind, ap.handle AS actor, a.action, w.slug AS workspace, sp.handle AS subject, hex(a.name_ref) AS name_ref, a.sha256, a.size, a.role, a.ok
         FROM audit a LEFT JOIN people ap ON ap.id = a.actor_person_id LEFT JOIN people sp ON sp.id = a.subject_person_id LEFT JOIN workspaces w ON w.id = a.workspace_id
         ${w ? 'WHERE a.workspace_id = ?' : ''} ORDER BY a.id DESC LIMIT ?`,
      )
      .all(...(w ? [w.id, limit] : [limit]))
    if (flags.json) console.log(JSON.stringify(rows))
    else
      for (const r of rows.reverse())
        console.log(`${new Date(r.at).toISOString()}  ${r.action.padEnd(20)} ${r.ok ? '' : 'FAILED '}by ${r.actor_kind === 'person' || r.actor_kind === 'run' ? (r.actor ?? '-') + (r.actor_kind === 'run' ? ' (a run)' : '') : r.actor_kind}${r.workspace ? ` in ${r.workspace}` : ''}${r.subject ? ` re ${r.subject}` : ''}${r.role ? ` as ${r.role}` : ''}${r.size != null ? ` ${r.size} B` : ''}${r.sha256 ? ` sha256 ${r.sha256.slice(0, 12)}` : ''}${r.name_ref ? ` file#${r.name_ref.slice(0, 10).toLowerCase()}` : ''}`)
    break
  }
  case 'list': {
    for (const p of db.prepare('SELECT handle, display_name, status, is_admin, (SELECT count(*) FROM passkeys k WHERE k.person_id = people.id) AS keys FROM people ORDER BY handle').all()) console.log(`person ${p.handle} (${p.display_name}) ${p.status}${p.is_admin ? ' admin' : ''}, ${p.keys} passkey(s)`)
    for (const w of db.prepare('SELECT w.slug, w.name, w.status, t.slug AS team FROM workspaces w JOIN teams t ON t.id = w.team_id ORDER BY w.slug').all()) {
      const members = db.prepare('SELECT p.handle, m.role FROM memberships m JOIN people p ON p.id = m.person_id JOIN teams t ON t.id = m.team_id WHERE t.slug = ?').all(w.team)
      console.log(`workspace ${w.slug} (${w.name}) ${w.status}, team ${w.team}: ${members.map((m) => `${m.handle} ${m.role}`).join(', ') || 'no members'}`)
    }
    break
  }
  default:
    console.error('usage: admin.mjs add-person | invite | create-workspace | add-member | remove-member | revoke-sessions | suspend | shown-to-cloud | audit | list  (see the top of this file)')
    process.exit(2)
}
db.close()
