#!/usr/bin/env node
// The front desk's admin CLI (no admin web page in this milestone). Runs as the account that
// owns the platform database and the workspaces, on the machine itself.
//
//   node admin.mjs add-person <handle> --name "Maria L." [--admin] [--link]   with --link, also prints
//                  the one-time setup link (as invite): they choose a password
//   node admin.mjs reset-password <handle> [--hours 24]  prints a one-time link to set a password (no
//                  outbound email yet: send it yourself). Someone with a password already is signed
//                  out everywhere, their Macs too, when they use it. Their passkeys keep working.
//   node admin.mjs require-passkey <handle> on|off      "Ask for my passkey too", for them
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
//   node admin.mjs claude-grants                       writes the gateway's grants files (Claude, hosted) from the database again
//   node admin.mjs hosted <workspace> [on|off] [--cap-usd 20]   Fallback to a hosted open model for one project
//   node admin.mjs compare candidates                  the review queue: made-up copies Ola lost (evals/candidates)
//   node admin.mjs compare show <id>                   one candidate's evidence: the copy, both results, the checks, the judge
//   node admin.mjs compare promote <id>                copies it into the eval set (evals/tasks/t-<id>), after its selftest passes
//   node admin.mjs compare status                      comparisons under way, scratch VMs, and what the last start cleaned up
//   node admin.mjs compare weekly                      the weekly number, as JSON (also $OLA_HOME/compare/weekly.json)
//   node admin.mjs app-allowance <handle> <tokens|default>   their weekly allowance on Ola from the Mac app and
//                  the command line (all their computers together); default: the gateway's own number.
//                  (allow-devices and disallow-devices are no longer needed: every active account may.)
//   node admin.mjs app-hosted <handle> [on|off] [--cap-usd 20]   whether their own Macs (the Mac app and
//                  the `ola` command, signed in) may hand a request to the hosted open model when they
//                  ask, and its monthly ceiling for them; off by default; audited
//   node admin.mjs devices [<handle>]                  signed-in devices: id, person, name, kind, dates
//   node admin.mjs revoke-device <id>                  one device signed out now
//   node admin.mjs add-device <handle> --name "Bart's MacBook Air" --kind mac|cli
//                  a device made here, for when the browser is not at hand: writes ONLY its token to
//                  stdout (one line; everything else to stderr), so it can go straight into the app's
//                  Keychain: ... add-device bart --name X --kind mac | (the app's import), never to a screen
//   node admin.mjs audit [--workspace <slug>] [--limit 50] [--json]
//   node admin.mjs list
//   node admin.mjs data [--wake] [--json]              every project's database: its tables, rows, documents
//                  and size, one place (like a dashboard's table list). Asks each running project's own
//                  computer (ola-db, read-only); a resting one is listed as resting, or woken with --wake
//                  (one at a time, stopped again after)
//
// Settings come from the same environment as the server (OLA_FD_DATA, OLA_FD_ORIGIN, OLA_HOME).
// Display names are typed here by the admin; the database takes no text from the people themselves.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { audit, openDb } from './db.mjs'
import { createWorkspace } from './projects.mjs'
import { makeInvite, makePasswordLink } from './auth.mjs'
import { config } from './server.mjs'
import { AUTO, gatewayUsage, modeFor, writeGrants } from './claude.mjs'
import { writeHostedGrants } from './hosted.mjs'
import { writeBatchGrants } from './jobs.mjs'
import { leftovers, weekly } from './compare.mjs'
import { createDevice, deviceView, KINDS, mayUseDevices, revokeDevices, syncPeopleFile, validDeviceName } from './devices.mjs'
import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs'

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
  if (['--admin', '--json', '--add-device', '--wake', '--link', '--switched', '--full'].includes(rest[i])) flags[rest[i].slice(2)] = true
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
// whether it is open, or a fallback setting: Claude's (claude.mjs writeGrants) and the hosted open
// model's (hosted.mjs writeHostedGrants), and batch jobs' (jobs.mjs writeBatchGrants: a closed project's
// job loses its grant). Returns the Claude grants.
const grants = () => (writeHostedGrants(db, cfg.hosted), writeBatchGrants(db, cfg.jobs), writeGrants(db, cfg.claude))
// Devices end with their person's sessions; the gateway's people file follows the database.
const endDevices = (p) => {
  const n = revokeDevices(db, { personId: p.id })
  if (n) admin({ action: 'device_revoked', subject: p.id })
  if (cfg.devices.key || existsSync(cfg.devices.peopleFile)) syncPeopleFile(db, cfg.devices.peopleFile)
  return n
}

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
    if (flags.link) {
      // The account and its one-time setup link at once (they choose a password).
      const { raw } = makeInvite(db, Number(r.lastInsertRowid), 72 * 3600_000, 'first')
      admin({ action: 'invited', subject: Number(r.lastInsertRowid) })
      console.log(`${cfg.origin}/#/invite/${raw}`)
      console.error(`added ${handle}; the link lets them choose a password. Single use, expires in 72 h. Send it only to ${name}.`)
    } else console.log(`added ${handle}; next: node admin.mjs invite ${handle}`)
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
    // Someone who can sign in already gets a password link, not a second first invitation.
    if (p.password_hash && !device) fail(`${p.handle} already has a password. To set a new one: reset-password ${p.handle}`)
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
    // The last passkey gone: "Ask for my passkey too" cannot be met, so it is turned off (said here).
    const left = db.prepare('SELECT count(*) AS n FROM passkeys WHERE person_id = ?').get(p.id).n
    if (!left && p.require_passkey) {
      db.prepare('UPDATE people SET require_passkey = 0 WHERE id = ?').run(p.id)
      admin({ action: 'passkey_required_off', subject: p.id })
    }
    console.log(`passkey #${k.id} of ${p.handle} removed; the sessions it opened are ended${!left && p.require_passkey ? '; it was their last, so their password alone signs them in again' : ''}`)
    break
  }
  case 'reset-password': {
    // A one-time link to set a password (no outbound email yet: send it by a channel you trust).
    // For a person with a password already, using it signs them out everywhere, their Macs too.
    const p = person(args[0])
    if (p.status === 'suspended') fail(`${p.handle} is suspended`)
    const hours = Number(flags.hours ?? 24)
    if (!(hours > 0 && hours <= 72)) fail('--hours is more than 0 and at most 72')
    const { raw, voided } = makePasswordLink(db, p.id, hours * 3600_000)
    admin({ action: 'password_reset_issued', subject: p.id })
    console.log(`${cfg.origin}/#/reset/${raw}`)
    console.error(`sets ${p.handle}'s password; single use, expires in ${hours} h. Send it only to ${p.display_name}.${p.password_hash ? ' Using it signs them out everywhere, their Macs too.' : ''}${voided ? ` ${voided} earlier unused link(s) no longer work.` : ''}`)
    break
  }
  case 'require-passkey': {
    const p = person(args[0])
    const on = args[1] === 'on' ? true : args[1] === 'off' ? false : fail('require-passkey <handle> on|off')
    if (on && !db.prepare('SELECT count(*) AS n FROM passkeys WHERE person_id = ?').get(p.id).n) fail(`${p.handle} has no passkey`)
    db.prepare('UPDATE people SET require_passkey = ? WHERE id = ?').run(on ? 1 : 0, p.id)
    admin({ action: on ? 'passkey_required_on' : 'passkey_required_off', subject: p.id })
    console.log(`${p.handle}: ${on ? 'a password is followed by their passkey' : 'their password alone signs them in'}`)
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
    // The same code as the page's "New project" (projects.mjs).
    const [slug] = args
    const name = flags.name ?? fail('--name "Workspace name"')
    const teamSlug = flags.team ?? fail('--team <team-slug> (created if new, with --team-name)')
    const owner = flags.owner ? person(flags.owner) : null
    const limits = ['memory', 'disk', 'cpus'].flatMap((k) => (flags[k] ? [`--${k}`, flags[k]] : []))
    let made
    try {
      made = await createWorkspace(db, { slug, name, team: { slug: teamSlug, name: flags['team-name'] }, ownerId: owner?.id ?? null, limits })
    } catch (e) {
      fail(e.message)
    }
    console.log(`workspace ${slug} created for team ${made.team.slug}; the gateway picks up its token from ${process.env.OLA_HOME ?? '~/.ola'}/gateway-tokens by itself.`)
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
    const d = endDevices(p)
    console.log(`${r.changes} session(s) and ${d} device(s) of ${p.handle} revoked${cmd === 'suspend' ? '; suspended' : ''}`)
    break
  }
  case 'allow-devices':
  case 'disallow-devices': {
    // 2026-11-17: everyone with an active account may sign in from the Mac app and the command line.
    console.log(`Not needed any more: anyone with an active account can sign in to Ola from the Mac app and the command line. Nothing was changed.${cmd === 'disallow-devices' ? ' To sign someone\'s computers out: node admin.mjs devices <handle>, then revoke-device <id>; or suspend <handle>.' : ''}`)
    break
  }
  case 'app-allowance': {
    // A person's own weekly allowance on Ola from the Mac app and the command line (all their
    // computers together), in tokens; "default" goes back to the gateway's GATEWAY_PEOPLE_WEEKLY_TOKENS.
    const p = person(args[0])
    const raw = args[1]
    const tokens = raw === 'default' ? null : /^\d{1,13}$/.test(raw ?? '') && Number(raw) <= 1e12 ? Number(raw) : fail('say a whole number of tokens a week (0 to 1000000000000), or default')
    db.prepare('UPDATE people SET app_weekly_tokens = ? WHERE id = ?').run(tokens, p.id)
    admin({ action: 'app_allowance_set', subject: p.id })
    syncPeopleFile(db, cfg.devices.peopleFile)
    console.log(tokens === null ? `${p.handle}: back to the default weekly allowance` : `${p.handle}: ${tokens.toLocaleString('en-US')} tokens a week on Ola, all their computers together; the gateway takes it within seconds`)
    break
  }
  case 'app-hosted': {
    // A person's own Macs and the hosted open model (hosted.mjs writeHostedGrants): off by default.
    const p = person(args[0])
    const to = args[1]
    if (to !== undefined && !['on', 'off'].includes(to)) fail('say on or off (or nothing, to see it)')
    const usd = flags['cap-usd'] === undefined ? undefined : Number(flags['cap-usd'])
    if (usd !== undefined && !(usd >= 0 && usd <= 10_000)) fail('--cap-usd is from 0 to 10000 dollars a month')
    if (to === 'on' && !(await gatewayUsage(cfg.claude))?.hosted) fail('the gateway has no hosted open model set up (HOSTED_* in its env), or could not be asked; nothing changed')
    if (to && (to === 'on') !== (p.app_hosted === 1)) {
      db.prepare('UPDATE people SET app_hosted = ? WHERE id = ?').run(to === 'on' ? 1 : 0, p.id)
      admin({ action: to === 'on' ? 'hosted_enabled' : 'hosted_disabled', subject: p.id })
    }
    if (usd !== undefined) db.prepare('UPDATE people SET app_hosted_cap_micro_usd = ? WHERE id = ?').run(Math.round(usd * 1e6), p.id)
    grants()
    const now = person(p.handle)
    const g = await gatewayUsage(cfg.claude)
    const m = g?.hostedMonth.get(`p-${p.id}`)
    const used = m ? `$${(m.cost_micro_usd / 1e6).toFixed(2)} in ${m.requests} requests this month` : 'this month unknown (no computer signed in, or the gateway was not asked)'
    console.log(`${p.handle}: the hosted open model from their own Macs ${now.app_hosted ? 'ON' : 'off'} (${g?.hosted?.provider ?? 'no provider set up'}), ceiling $${((now.app_hosted_cap_micro_usd ?? cfg.hosted.capMicroUsd) / 1e6).toFixed(2)} a month; ${used}`)
    break
  }
  case 'devices': {
    const who = args[0] ? person(args[0]) : null
    const rows = db.prepare(`SELECT d.*, p.handle FROM devices d JOIN people p ON p.id = d.person_id ${who ? 'WHERE d.person_id = ?' : ''} ORDER BY d.id`).all(...(who ? [who.id] : []))
    const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : 'never')
    if (flags.json) console.log(JSON.stringify(rows.map((r) => ({ ...deviceView(r), person: r.handle, revoked: r.revoked_at ? new Date(r.revoked_at).toISOString() : null }))))
    else if (!rows.length) console.log('no devices')
    else for (const r of rows) console.log(`#${r.id}  ${r.handle.padEnd(16)} ${r.kind.padEnd(4)} ${JSON.stringify(r.name).padEnd(30)} made ${day(r.created_at)}, last used ${day(r.last_used_at)}, ${r.revoked_at ? `revoked ${day(r.revoked_at)}` : r.expires_at <= now ? 'expired' : `ends ${day(r.expires_at).slice(0, 10)}`}`)
    break
  }
  case 'revoke-device': {
    const id = /^[1-9][0-9]{0,11}$/.test(args[0] ?? '') ? Number(args[0]) : fail('which device? (node admin.mjs devices)')
    const d = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) ?? fail(`no device #${id}`)
    if (!revokeDevices(db, { deviceId: id })) fail(`device #${id} was already signed out`)
    admin({ action: 'device_revoked', subject: d.person_id })
    syncPeopleFile(db, cfg.devices.peopleFile)
    console.log(`device #${id} signed out; its next request is refused, and an open one is cut within a second`)
    break
  }
  case 'add-device': {
    // Only the token goes to stdout, so it can be piped into the app without anyone seeing it.
    const p = person(args[0])
    if (!cfg.devices.key) fail('device sign-in is off on this machine (OLA_GATE_PASS_KEY is not set in the front desk env)')
    if (!mayUseDevices(p)) fail(`${p.handle} is ${p.status}: only an active account signs in devices`)
    const name = validDeviceName(flags.name) ?? fail('--name "the computer\'s name", 1 to 60 characters')
    if (!KINDS.includes(flags.kind)) fail('--kind mac or --kind cli')
    const d = createDevice(db, cfg.devices.key, p.id, name, flags.kind)
    admin({ action: 'device_signed_in', subject: p.id })
    syncPeopleFile(db, cfg.devices.peopleFile)
    process.stdout.write(`${d.token}\n`)
    console.error(`device #${d.id} for ${p.handle} (${flags.kind}), until ${new Date(d.expiresAt).toISOString().slice(0, 10)}. The token was written to stdout only; put it straight into the app.`)
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
  case 'hosted': {
    const w = workspace(args[0])
    const to = args[1]
    if (to !== undefined && !['on', 'off'].includes(to)) fail('say on or off (or nothing, to see it)')
    const usd = flags['cap-usd'] === undefined ? undefined : Number(flags['cap-usd'])
    if (usd !== undefined && !(usd >= 0 && usd <= 10_000)) fail('--cap-usd is from 0 to 10000 dollars a month')
    if (to === 'on' && !(await gatewayUsage(cfg.claude))?.hosted) fail('the gateway has no hosted open model set up (HOSTED_* in its env), or could not be asked; nothing changed')
    if (to && (to === 'on') !== (w.hosted_enabled === 1)) {
      db.prepare('UPDATE workspaces SET hosted_enabled = ? WHERE id = ?').run(to === 'on' ? 1 : 0, w.id)
      admin({ action: to === 'on' ? 'hosted_enabled' : 'hosted_disabled', workspace: w.id })
    }
    if (usd !== undefined) db.prepare('UPDATE workspaces SET hosted_cap_micro_usd = ? WHERE id = ?').run(Math.round(usd * 1e6), w.id)
    grants()
    const now = workspace(w.slug)
    const g = await gatewayUsage(cfg.claude)
    const m = g?.hostedMonth.get(`ws-${w.slug}`)
    const used = m ? `$${(m.cost_micro_usd / 1e6).toFixed(2)} in ${m.requests} requests this month` : 'this month unknown (the gateway was not asked)'
    console.log(`${w.slug}: Fallback to a hosted open model ${now.hosted_enabled ? 'ON' : 'off'} (${g?.hosted?.provider ?? 'no provider set up'}), ceiling $${((now.hosted_cap_micro_usd ?? cfg.hosted.capMicroUsd) / 1e6).toFixed(2)} a month; ${used}; when a request looks like a stretch: ${now.stretch} (to ${now.stretch_to})`)
    break
  }
  case 'compare': {
    // The review queue of "Compare with Claude" (compare.mjs): nothing in it reaches the eval set
    // until a person promotes it here, after reading the evidence.
    const queue = cfg.compare.candidates
    const sub = args[0]
    const list = () => (existsSync(queue) ? readdirSync(queue).filter((d) => /^t-[0-9a-f]{12}$/.test(d) && existsSync(path.join(queue, d, 'task.json'))) : [])
    if (sub === 'weekly') {
      console.log(JSON.stringify(weekly(db), null, 1))
      break
    }
    if (sub === 'status') {
      // What is under way now, and what the front desk cleaned up at its last start (compare.mjs).
      const now = leftovers(db, cfg.compare)
      console.log(`under way: ${now.stuck.length} comparisons (${now.stuck.map((r) => `${r.id} ${r.state}`).join(', ') || 'none'}); scratch VMs ${now.scratch.join(', ') || 'none'}; scratch grants ${now.grants.join(', ') || 'none'}`)
      const f = path.join(cfg.compare.dir, 'cleanup.json')
      if (!existsSync(f)) console.log('at the last start: no record (the front desk has not started with this version)')
      else {
        const c = JSON.parse(readFileSync(f, 'utf8'))
        console.log(`at the last start (${c.at}): ${c.failed.length} comparisons marked failed${c.failed.length ? ` (${c.failed.join(', ')})` : ''}; ${c.grants.length} scratch grants taken back; ${c.files} made-up files removed; scratch VMs ${c.scratch.map((v) => `${v.id} ${v.destroyed === true ? 'destroyed' : v.destroyed === false ? 'NOT destroyed: ws.mjs destroy ' + v.id + ' --confirm ' + v.id : 'being destroyed'}`).join(', ') || 'none'}`)
      }
      break
    }
    if (sub === 'candidates') {
      const ids = list()
      if (!ids.length) console.log(`no candidates in ${queue}`)
      for (const d of ids) {
        const t = JSON.parse(readFileSync(path.join(queue, d, 'task.json'), 'utf8'))
        const ev = JSON.parse(readFileSync(path.join(queue, d, 'evidence.json'), 'utf8'))
        const c = db.prepare('SELECT kind, label, created_at FROM comparisons WHERE id = ?').get(d.slice(2))
        console.log(`${d}  ${t.family.padEnd(8)} ${String(ev.outcome).padEnd(13)} ${String(c?.label ?? '-').padEnd(22)} Ola ${ev.ola.score?.passed ?? '-'}/${ev.ola.score?.total ?? '-'}, Claude ${ev.claude.score?.passed ?? '-'}/${ev.claude.score?.total ?? '-'}  ${c ? new Date(c.created_at).toISOString().slice(0, 10) : ''}${existsSync(path.join(cfg.compare.candidates, '..', 'tasks', d)) ? '  (promoted)' : ''}`)
      }
      break
    }
    const id = String(args[1] ?? '').replace(/^t-/, '')
    if (!/^[0-9a-f]{12}$/.test(id) || !list().includes(`t-${id}`)) fail('which candidate? (node admin.mjs compare candidates)')
    const dir = path.join(queue, `t-${id}`)
    if (sub === 'show') {
      const ev = JSON.parse(readFileSync(path.join(dir, 'evidence.json'), 'utf8'))
      console.log(`The made-up copy (${JSON.parse(readFileSync(path.join(dir, 'twin.json'), 'utf8')).kind}):\n  ${readFileSync(path.join(dir, 'instruction.md'), 'utf8').trim()}\n`)
      for (const arm of ['ola', 'claude']) {
        console.log(`${arm === 'ola' ? 'Ola' : 'Claude'}: ${ev[arm].score ? `${ev[arm].score.passed}/${ev[arm].score.total} checks` : 'no checks'}`)
        for (const c of ev[arm].score?.checks ?? []) console.log(`  ${c.ok ? 'pass' : 'FAIL'}  ${c.name}  (${c.label}${c.detail ? `: ${c.detail}` : ''})`)
        console.log(`  said: ${String(ev[arm].final ?? '').replace(/\s+/g, ' ').slice(0, 600)}\n`)
      }
      console.log(`The judge (${ev.judge?.verdict}): ${ev.judge?.difference ?? ''}`)
      for (const r of ev.judge?.runs ?? []) for (const p of r.points ?? []) console.log(`  ${p.criterion}: ${p.better}  A: "${p.evidence_a}"  B: "${p.evidence_b}"`)
      if (existsSync(path.join(dir, 'skill-note.md'))) console.log(`\nNote for the lead:\n${readFileSync(path.join(dir, 'skill-note.md'), 'utf8')}`)
      break
    }
    if (sub === 'promote') {
      const st = spawnSync('python3', [path.join(HERE, '../evals/lib/task.py'), 'selftest', dir, '0'], { encoding: 'utf8' })
      if (st.status !== 0) fail(`its selftest does not pass, so it was not promoted:\n${st.stdout}`)
      const to = path.join(HERE, '../evals/tasks', `t-${id}`)
      if (existsSync(to)) fail(`already in the eval set: ${to}`)
      cpSync(dir, to, { recursive: true })
      console.log(`promoted: ${to}\n${st.stdout.trim()}\nIt is in the eval set's folder now; commit it after reading it (git add ${path.relative(process.cwd(), to)}).`)
      break
    }
    fail('compare candidates | show <id> | promote <id> | weekly')
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
  case 'kept': {
    // node admin.mjs kept [handle] [--switched] [--days 7] [--full]: the turns people chose to share
    // (OLA-159), newest first. --switched: only those where another engine was tried first (OLA-157).
    const days = Number(flags.days ?? 7)
    const rows = db.prepare(
      `SELECT k.*, p.handle FROM kept_turns k JOIN people p ON p.id = k.person_id
       WHERE k.at >= ? AND (? IS NULL OR p.handle = ?) AND (? = 0 OR k.switched_from IS NOT NULL) ORDER BY k.at DESC LIMIT 500`,
    ).all(Date.now() - days * 86400_000, args[0] ?? null, args[0] ?? null, flags.switched ? 1 : 0)
    if (flags.json) { console.log(JSON.stringify(rows)); break }
    for (const r of rows) {
      const when = new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')
      console.log(`${when}  ${r.handle}  ${r.product}/${r.runtime}  ${r.engine}${r.switched_from ? ` (after ${r.switched_from})` : ''}  ${r.status}${r.seconds != null ? ` ${r.seconds}s` : ''}  ${JSON.parse(r.steps).length} steps`)
      console.log(`    asked: ${r.request.replace(/\s+/g, ' ').slice(0, flags.full ? 4000 : 160)}`)
      if (flags.full) console.log(`    answer: ${r.answer.replace(/\s+/g, ' ').slice(0, 4000)}`)
    }
    console.log(`${rows.length} kept turn(s) in the last ${days} day(s)`)
    break
  }
  case 'list': {
    for (const p of db.prepare('SELECT id, handle, display_name, status, is_admin, password_set_at, require_passkey FROM people ORDER BY handle').all()) {
      const keys = db.prepare('SELECT id, created_at, last_used_on, via FROM passkeys WHERE person_id = ? ORDER BY id').all(p.id)
      const macs = db.prepare('SELECT id, kind, label, created_at, last_used_at FROM (SELECT id, kind, name AS label, created_at, coalesce(last_used_at, created_at) AS last_used_at, revoked_at, expires_at, person_id FROM devices) WHERE person_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY id').all(p.id, now)
      const day = (ms) => new Date(ms).toISOString().slice(0, 10)
      console.log(`person ${p.handle} (${p.display_name}) ${p.status}${p.is_admin ? ' admin' : ''}, ${p.password_set_at ? `password set ${day(p.password_set_at)}` : 'no password'}${p.require_passkey ? ' (asks for the passkey too)' : ''}, ${keys.length} passkey(s)${keys.length ? ': ' + keys.map((k) => `#${k.id} added ${day(k.created_at)}${k.via === 'device' ? ' (another device)' : ''}, last used ${k.last_used_on ?? 'never'}`).join('; ') : ''}${macs.length ? `; Macs: ${macs.map((m) => `#${m.id} ${m.kind} added ${day(m.created_at)}, last used ${day(m.last_used_at)}`).join('; ')}` : ''}`)
    }
    for (const w of db.prepare('SELECT w.slug, w.name, w.status, t.slug AS team FROM workspaces w JOIN teams t ON t.id = w.team_id ORDER BY w.slug').all()) {
      const members = db.prepare('SELECT p.handle, m.role FROM memberships m JOIN people p ON p.id = m.person_id JOIN teams t ON t.id = m.team_id WHERE t.slug = ?').all(w.team)
      console.log(`workspace ${w.slug} (${w.name}) ${w.status}, team ${w.team}: ${members.map((m) => `${m.handle} ${m.role}`).join(', ') || 'no members'}`)
    }
    break
  }
  case 'data': {
    const ws = await import('../workspace/ws.mjs')
    const all = []
    const human = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`)
    for (const w of db.prepare("SELECT w.slug, w.name, w.status, t.name AS team FROM workspaces w JOIN teams t ON t.id = w.team_id ORDER BY t.name, w.name").all()) {
      const row = { slug: w.slug, name: w.name, team: w.team, state: null, tables: [], documents: null, size: null }
      const state = ws.inspect(w.slug)?.status?.state ?? ws.inspect(w.slug)?.status ?? 'no container'
      row.state = w.status === 'closed' ? 'closed' : state
      let woke = false
      if (row.state !== 'running' && flags.wake && w.status !== 'closed') {
        try {
          await ws.waitForRoom([w.slug], 1, { say: () => {} })
          await ws.start(w.slug)
          woke = true
          row.state = 'running'
        } catch (e) {
          row.state = `could not be woken (${e.message})`
        }
      }
      if (row.state === 'running') {
        try {
          const d = await ws.dbApi(w.slug, ['tables'])
          Object.assign(row, { tables: d.tables.map((t) => ({ name: t.name, rows: t.rows, source: t.source, description: t.description })), documents: d.documents, size: d.size })
        } catch (e) {
          row.state = `running; its database did not answer (${e.message})`
        }
      }
      if (woke) ws.stop(w.slug)
      all.push(row)
    }
    if (flags.json) {
      console.log(JSON.stringify(all, null, 2))
      break
    }
    for (const r of all) {
      if (r.size === null) {
        console.log(`${r.slug} (${r.name}, ${r.team}): ${r.state === 'running' ? 'running' : r.state}${r.state !== 'running' && !String(r.state).startsWith('could') ? '; run with --wake to look' : ''}`)
        continue
      }
      console.log(`${r.slug} (${r.name}, ${r.team}): ${r.tables.length} table${r.tables.length === 1 ? '' : 's'}, ${r.documents.count} documents (${r.documents.pages} pages; ${r.documents.web} from the web, ${r.documents.upload} uploaded), ${human(r.size)}`)
      for (const t of r.tables) console.log(`    ${t.name.padEnd(28)} ${String(t.rows).padStart(10)} rows   from ${t.source ?? '?'}${t.description ? `: ${t.description.slice(0, 60)}` : ''}`)
    }
    break
  }
  default:
    console.error('usage: admin.mjs add-person | invite | remove-passkey | create-workspace | add-member | remove-member | rotate | reopen | revoke-sessions | suspend | app-allowance | app-hosted | devices | revoke-device | add-device | claude | hosted | claude-grants | shown-to-cloud | audit | list | data  (see the top of this file)')
    process.exit(2)
}
db.close()
