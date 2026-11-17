#!/usr/bin/env node
// The front desk's admin CLI (no admin web page in this milestone). Runs as the account that
// owns the platform database and the workspaces, on the machine itself.
//
//   node admin.mjs add-person <handle> --name "Maria L." [--admin]
//   node admin.mjs invite <handle> [--hours 72]          prints a single-use link, once; voids
//                  the person's earlier unused invitations. Refused for a person who already has
//                  a passkey, unless:
//   node admin.mjs invite <handle> --add-device [--hours 24]   one more passkey (another device);
//                  logged, and the person is told on their next sign-in from another device
//   node admin.mjs remove-passkey <handle> <passkey id>  (ids in `list`); ends its sessions
//   node admin.mjs rotate <workspace>                    new opencode password and gateway token
//   node admin.mjs reopen <workspace>                    a workspace a rotation closed: rotated again, opened
//   node admin.mjs create-workspace <slug> --name "Spring eviction report" --team <team-slug>
//                  [--team-name "North District Tenants' Union"] [--owner <handle>]
//                  [--memory 6g --disk 50g --cpus 4]    calls workspace/ws.mjs create
//   node admin.mjs add-member <team-slug> <handle> <owner|member|viewer>   (also changes a role)
//   node admin.mjs remove-member <team-slug> <handle>   then rotates every workspace of the team: all
//                  revoked first, then each restored; exits 1 only if one needs a person (its line says what to run)
//   node admin.mjs revoke-sessions <handle>             every session of that person ends now
//   node admin.mjs suspend <handle>                      no sign-in, sessions revoked
//   node admin.mjs shown-to-cloud <workspace> --by <handle>   record a cloud agent's look (with the customer's yes)
//   node admin.mjs claude <workspace> [on|off] [--auto ask|stuck|always] [--cap-usd 25] [--cap-tokens 20000000]
//                  Fallback to Claude for one project: with no change, prints its state (on or off,
//                  the mode its owners give it, the ceiling, the month so far); changes are audited.
//   node admin.mjs claude-grants                       writes the gateway's grants file from the database again
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
import { AUTO, gatewayUsage, modeFor, writeGrants } from './claude.mjs'

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
  if (['--admin', '--json', '--add-device'].includes(rest[i])) flags[rest[i].slice(2)] = true
  else if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[++i]
  else args.push(rest[i])
}

const cfg = config()
const db = openDb(cfg.data)
const person = (handle) => db.prepare('SELECT * FROM people WHERE handle = ?').get(handle) ?? fail(`no person ${handle}`)
const team = (slug) => db.prepare('SELECT * FROM teams WHERE slug = ?').get(slug) ?? fail(`no team ${slug}`)
const workspace = (slug) => db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug) ?? fail(`no workspace ${slug}`)
const admin = (row) => audit(db, { actorKind: 'admin', ...row })
// The gateway's grants file follows the database: after anything that changes who owns a project,
// whether it is open, or its Claude setting (claude.mjs writeGrants).
const grants = () => writeGrants(db, cfg.claude)

// ---------------------------------------------------------------- rotation
//
// New secrets for workspaces (ws.mjs revoke, then ws.mjs restore; see "rotation" in ws.mjs). Every
// workspace is revoked first, before any is made again or started, so a full machine or one stuck
// container never leaves another workspace on its old secrets; a failure is recorded and the next
// workspace is done all the same. Prints one line per workspace: its state, and what to run if it
// needs a person. Returns true if any does.
const wsCli = (cmd, slug) => {
  const r = spawnSync(process.execPath, [path.join(HERE, '../workspace/ws.mjs'), cmd, slug, '--json'], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env, encoding: 'utf8' })
  try {
    return JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {
    return { state: 'failed', why: (r.stderr || `ws.mjs ${cmd} exited ${r.status}`).trim().split('\n').pop().replace(/^ws: /, '') }
  }
}
function closeWorkspace(w, why) {
  db.prepare("UPDATE workspaces SET status = 'closed' WHERE id = ?").run(w.id)
  admin({ action: 'workspace_closed', workspace: w.id })
  // Also on the machine, so ws.mjs itself refuses to start it (best effort: the database already says closed).
  spawnSync(process.execPath, [path.join(HERE, '../workspace/ws.mjs'), 'close', w.slug], { stdio: 'ignore', env: process.env })
  grants()
  return `${w.slug}: CLOSED (${why}); the front desk refuses it and nothing starts it. Fix the container runtime, then: node admin.mjs reopen ${w.slug}`
}
async function rotateAll(list) {
  const lines = new Map()
  let human = false
  const revoked = []
  for (const w of list) {
    const r = wsCli('revoke', w.slug)
    if (r.state === 'revoked') {
      admin({ action: 'secrets_rotated', workspace: w.id }) // the new secrets are in force, the old container gone
      revoked.push(w)
      if (r.gateway === 'unconfirmed') {
        human = true
        lines.set(w.slug, `${w.slug}: new secrets written, but THE GATEWAY DID NOT CONFIRM it refuses the old token. Check it (node ops/ola.mjs status), then run again: node admin.mjs rotate ${w.slug}`)
      }
    } else {
      human = true
      lines.set(w.slug, closeWorkspace(w, r.why ?? (r.state === 'closed' ? 'the old container could not be removed' : 'its revocation did not finish')))
    }
  }
  for (const w of revoked) {
    const r = wsCli('restore', w.slug)
    const closedBefore = w.status === 'closed' ? ' It was closed before and stays closed: node admin.mjs reopen ' + w.slug : ''
    if (r.state === 'deferred') admin({ action: 'restart_deferred', workspace: w.id })
    if (lines.has(w.slug)) continue
    if (r.state === 'running') lines.set(w.slug, `${w.slug}: new secrets in force, old ones refused; running again.${closedBefore}`)
    else if (r.state === 'stopped') lines.set(w.slug, `${w.slug}: new secrets in force, old ones refused; stopped, it starts on its next request.${closedBefore}`)
    else if (r.state === 'deferred') lines.set(w.slug, `${w.slug}: new secrets in force, old ones refused; left stopped (${r.busy ? 'the machine is running as many workspaces as it may' : r.why}). It starts on its next request; nothing to do.${closedBefore}`)
    else if (r.state === 'closed') lines.set(w.slug, `${w.slug}: new secrets in force, old ones refused; it was closed before and stays closed: node admin.mjs reopen ${w.slug}`)
    else {
      // Revoked (the old secrets are refused) but not made again: ws.mjs start makes it on the next request.
      lines.set(w.slug, `${w.slug}: new secrets in force, old ones refused; not restored (${r.why ?? r.state}). It is made again on its next request, or now: node admin.mjs rotate ${w.slug}`)
    }
  }
  for (const w of list) console.log(lines.get(w.slug))
  grants()
  return human
}
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
    const keys = db.prepare('SELECT count(*) AS n FROM passkeys WHERE person_id = ?').get(p.id).n
    const device = !!flags['add-device']
    // An invitation for someone who already has a passkey would add a second one without them
    // seeing anything (review of 2026-11-16, M6): that is a separate, explicit act.
    if (keys && !device) fail(`${p.handle} already has ${keys} passkey(s). To let them add another device: invite ${p.handle} --add-device`)
    if (!keys && device) fail(`${p.handle} has no passkey yet; send a first invitation (without --add-device)`)
    const hours = Number(flags.hours ?? (device ? 24 : 72))
    const max = device ? 72 : 24 * 14
    if (!(hours > 0 && hours <= max)) fail(`--hours is more than 0 and at most ${max}`)
    const { raw, voided } = makeInvite(db, p.id, hours * 3600_000, device ? 'device' : 'first')
    if (voided) admin({ action: 'invitations_voided', subject: p.id })
    admin({ action: device ? 'device_invited' : 'invited', subject: p.id })
    // The link is a secret until it is used: send it to the person by a channel you trust.
    console.log(`${cfg.origin}/#/invite/${raw}`)
    console.error(`${device ? 'adds a passkey for another device; ' : ''}single use, expires in ${hours} h. Send it only to ${p.display_name}.${voided ? ` ${voided} earlier unused invitation(s) no longer work.` : ''}`)
    break
  }
  case 'remove-passkey': {
    const p = person(args[0])
    const id = Number(args[1])
    const k = db.prepare('SELECT id FROM passkeys WHERE id = ? AND person_id = ?').get(id, p.id) ?? fail(`${p.handle} has no passkey #${args[1]} (see: list)`)
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE passkey_id = ? AND revoked_at IS NULL').run(now, k.id)
    db.prepare('DELETE FROM passkeys WHERE id = ?').run(k.id)
    admin({ action: 'passkey_removed', subject: p.id })
    console.log(`passkey #${k.id} of ${p.handle} removed; the sessions it opened are ended`)
    break
  }
  case 'rotate': {
    if (await rotateAll([workspace(args[0])])) process.exitCode = 1
    break
  }
  case 'reopen': {
    // A closed workspace made safe again: a fresh rotation, its container made, left stopped; then open.
    const w = workspace(args[0])
    const r = wsCli('reopen', w.slug)
    if (r.state !== 'stopped') fail(`${w.slug} stays closed: ${r.why ?? r.state}`)
    db.prepare("UPDATE workspaces SET status = 'active' WHERE id = ?").run(w.id)
    admin({ action: 'secrets_rotated', workspace: w.id })
    admin({ action: 'workspace_reopened', workspace: w.id })
    grants()
    console.log(`${w.slug}: reopened with new secrets; stopped, it starts on its next request${r.gateway === 'unconfirmed' ? ' (the gateway did not confirm it refuses the old token: node ops/ola.mjs status)' : ''}`)
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
    console.log(`workspace ${slug} created for team ${t.slug}; the gateway picks up its token from ${process.env.OLA_HOME ?? '~/.ola'}/gateway-tokens by itself.`)
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
    grants()
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
    grants()
    console.log(`${handle} removed from ${teamSlug}; their next request to its workspaces is refused.`)
    // They may have seen the workspaces' opencode password and gateway token from inside (the
    // agent can read both). Give the front desk two of its one-second rechecks to cut their open
    // streams on membership alone, then make new secrets; each workspace restarts if it ran.
    // Closed workspaces too: they may still hold the secrets the person saw.
    const list = db.prepare('SELECT * FROM workspaces WHERE team_id = ? ORDER BY slug').all(t.id)
    if (list.length) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000)
    if (await rotateAll(list)) process.exitCode = 1
    break
  }
  case 'revoke-sessions':
  case 'suspend': {
    const p = person(args[0])
    const r = db.prepare('UPDATE sessions SET revoked_at = ? WHERE person_id = ? AND revoked_at IS NULL').run(now, p.id)
    admin({ action: 'sessions_revoked', subject: p.id })
    if (cmd === 'suspend') {
      db.prepare("UPDATE people SET status = 'suspended' WHERE id = ?").run(p.id)
      grants()
      admin({ action: 'person_suspended', subject: p.id })
    }
    console.log(`${r.changes} session(s) of ${p.handle} revoked${cmd === 'suspend' ? '; suspended' : ''}`)
    break
  }
  case 'claude': {
    const w = workspace(args[0])
    const to = args[1]
    if (to !== undefined && !['on', 'off'].includes(to)) fail('say on or off (or nothing, to see it)')
    if (flags.auto !== undefined && !AUTO.includes(flags.auto)) fail(`--auto is ${AUTO.join(', ')}`)
    const usd = flags['cap-usd'] === undefined ? undefined : Number(flags['cap-usd'])
    const tokens = flags['cap-tokens'] === undefined ? undefined : Number(flags['cap-tokens'])
    if (usd !== undefined && !(usd >= 0 && usd <= 10_000)) fail('--cap-usd is from 0 to 10000 dollars a month')
    if (tokens !== undefined && !(Number.isSafeInteger(tokens) && tokens >= 0)) fail('--cap-tokens is a whole number of tokens a month')
    const mode = modeFor(db, w.id)
    if (to === 'on') {
      const g = await gatewayUsage(cfg.claude)
      if (!g) fail('the gateway could not be asked whether Claude is set up (OLA_FD_GATEWAY_USAGE_TOKEN in the front desk env, the gateway running); nothing changed')
      if (!g.modes[mode]) fail(`this project needs ${mode === 'oauth' ? 'the subscription token (CLAUDE_OAUTH_TOKEN_FILE)' : 'an API key (CLAUDE_API_KEY)'} in the gateway's env, and it has none; nothing changed`)
    }
    if (to && (to === 'on') !== (w.claude_enabled === 1)) {
      db.prepare('UPDATE workspaces SET claude_enabled = ? WHERE id = ?').run(to === 'on' ? 1 : 0, w.id)
      admin({ action: to === 'on' ? 'claude_enabled' : 'claude_disabled', workspace: w.id })
    }
    if (flags.auto) db.prepare('UPDATE workspaces SET claude_auto = ? WHERE id = ?').run(flags.auto, w.id)
    if (usd !== undefined) db.prepare('UPDATE workspaces SET claude_cap_micro_usd = ? WHERE id = ?').run(Math.round(usd * 1e6), w.id)
    if (tokens !== undefined) db.prepare('UPDATE workspaces SET claude_cap_tokens = ? WHERE id = ?').run(tokens, w.id)
    const g = grants()
    const now = workspace(w.slug)
    const m = (await gatewayUsage(cfg.claude))?.month.get(`ws-${w.slug}`)
    const cap = mode === 'api_key' ? `$${((now.claude_cap_micro_usd ?? cfg.claude.capMicroUsd) / 1e6).toFixed(2)} a month` : `${(now.claude_cap_tokens ?? cfg.claude.capTokens).toLocaleString('en-US')} tokens a month`
    const used = m ? (mode === 'api_key' ? `$${(m.cost_micro_usd / 1e6).toFixed(2)}` : `${m.tokens.toLocaleString('en-US')} tokens`) + ` in ${m.requests} requests this month` : 'this month unknown (the gateway was not asked)'
    console.log(`${w.slug}: Fallback to Claude ${now.claude_enabled ? 'ON' : 'off'}, ${mode === 'oauth' ? 'subscription (every owner is an admin)' : 'API key'}, automatic: ${now.claude_auto}, ceiling ${cap}; ${used}; in the grants file: ${g[`ws-${w.slug}`] ? 'yes' : 'no'}`)
    break
  }
  case 'claude-grants': {
    console.log(`grants file written: ${Object.keys(grants()).length} project(s) with Claude on`)
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
    for (const p of db.prepare('SELECT id, handle, display_name, status, is_admin FROM people ORDER BY handle').all()) {
      const keys = db.prepare('SELECT id, created_at, last_used_on, via FROM passkeys WHERE person_id = ? ORDER BY id').all(p.id)
      const day = (ms) => new Date(ms).toISOString().slice(0, 10)
      console.log(`person ${p.handle} (${p.display_name}) ${p.status}${p.is_admin ? ' admin' : ''}, ${keys.length} passkey(s)${keys.length ? ': ' + keys.map((k) => `#${k.id} added ${day(k.created_at)}${k.via === 'device' ? ' (another device)' : ''}, last used ${k.last_used_on ?? 'never'}`).join('; ') : ''}`)
    }
    for (const w of db.prepare('SELECT w.slug, w.name, w.status, t.slug AS team FROM workspaces w JOIN teams t ON t.id = w.team_id ORDER BY w.slug').all()) {
      const members = db.prepare('SELECT p.handle, m.role FROM memberships m JOIN people p ON p.id = m.person_id JOIN teams t ON t.id = m.team_id WHERE t.slug = ?').all(w.team)
      console.log(`workspace ${w.slug} (${w.name}) ${w.status}, team ${w.team}: ${members.map((m) => `${m.handle} ${m.role}`).join(', ') || 'no members'}`)
    }
    break
  }
  default:
    console.error('usage: admin.mjs add-person | invite | remove-passkey | create-workspace | add-member | remove-member | rotate | reopen | revoke-sessions | suspend | claude | claude-grants | shown-to-cloud | audit | list  (see the top of this file)')
    process.exit(2)
}
db.close()
