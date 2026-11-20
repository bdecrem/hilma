#!/usr/bin/env node
// The made-up person tools/drive.sh signs in as (OLA-237), on the live test server, from the live
// release's own admin tool (~/ola-staging/current), the way evals/asks does for its own person.
// A person of its own (not `askcases`): an asks run gives askcases a new password and signs it out
// everywhere when it ends, which would cut a drive in the middle.
//
//   node tools/drive-account.mjs prepare <password-file>   the person and its project exist, the project's
//                                                          folder is empty, a fresh password (nobody sees it)
//                                                          is written to the file with mode 600
//   node tools/drive-account.mjs cleanup                   its pages taken down, signed out everywhere, its
//                                                          project's computer stopped
//
// Run on the test server (the Mac mini). Prints no secret.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const ORIGIN = process.env.OLA_DRIVE_ORIGIN || 'https://app.ola.cx'
const LIVE = path.join(homedir(), 'ola-staging/current/apps/activist-ai')
export const WHO = 'appdriver'
const WHO_NAME = 'Ada Driver (made up)'
export const PROJECT = 'appdriver'
const TEAM = 'appdriver-team'

function liveEnv() {
  const env = { ...process.env, OLA_HOME: path.join(homedir(), '.ola') }
  for (const l of readFileSync(path.join(homedir(), '.ola/frontdesk.env'), 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
  return env
}
function live(tool, args, { ok = false } = {}) {
  if (!existsSync(LIVE)) throw new Error(`the live server's release is not on this machine (${LIVE}): run this on the test server`)
  const r = spawnSync(process.execPath, [path.join(LIVE, tool), ...args], { cwd: LIVE, env: liveEnv(), encoding: 'utf8', timeout: 600_000 })
  if (r.status !== 0 && !ok) throw new Error(`${tool} ${args[0]}: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`)
  return (r.stdout || '').trim()
}
const admin = (...a) => live('frontdesk/admin.mjs', a)

async function prepare(file, { local = false } = {}) {
  const listed = admin('list')
  if (!new RegExp(`^person ${WHO} `, 'm').test(listed)) admin('add-person', WHO, '--name', WHO_NAME)
  if (new RegExp(`^person ${WHO} .*\\bsuspended`, 'm').test(listed)) throw new Error(`${WHO} is suspended on the live server`)
  if (new RegExp(`^person ${WHO} .*\\badmin`, 'm').test(listed)) throw new Error(`${WHO} is an admin; the drive runs as an ordinary person`)
  if (!new RegExp(`^workspace ${PROJECT} `, 'm').test(listed)) {
    admin('create-workspace', PROJECT, '--name', 'Made-up app drive', '--team', TEAM, '--team-name', 'Made-up App Drive', '--owner', WHO, '--memory', '2g', '--disk', '2g', '--cpus', '2')
  }
  // The project's folder emptied, so each run starts from nothing (its database and Ola's own record
  // stay). Not for a run on the Mac (--local): that one never starts the project's computer.
  if (!local) emptyProject()
  writePassword(file, await resetPassword())
  console.log(`account ${WHO} ready${local ? '' : `, project ${PROJECT} emptied`}, password in ${file} (mode 600)`)
}

function emptyProject() {
  live('workspace/ws.mjs', ['start', PROJECT], { ok: true })
  const e = spawnSync('/usr/local/bin/container', ['exec', `ola-${PROJECT}`, 'sh', '-c', 'find /work -mindepth 1 -maxdepth 1 ! -name project.db ! -name project.db-wal ! -name project.db-shm ! -name .ola -exec rm -rf {} +'], { encoding: 'utf8' })
  if (e.status !== 0) throw new Error(`emptying the project: ${(e.stderr || '').trim().slice(0, 200)}`)
}

async function resetPassword() {
  const link = admin('reset-password', WHO, '--hours', '1').split(/\s+/).find((w) => w.includes('/#/reset/'))
  if (!link) throw new Error('no password link from the admin command')
  const password = `made up ${randomBytes(12).toString('base64url')} drive`
  const r = await fetch(ORIGIN + '/api/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ token: link.split('/#/reset/')[1], password }) })
  if (r.status !== 200) throw new Error(`setting the password: ${r.status} ${(await r.text()).slice(0, 160)}`)
  return password
}

function writePassword(file, password) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, password + '\n', { mode: 0o600 })
  chmodSync(file, 0o600)
}

function cleanup() {
  const done = []
  for (const line of admin('sites').split('\n').map((l) => l.trim())) {
    const name = line.split(/\s+/)[0]
    if (name === PROJECT && /^\S+\s+project\s/.test(line)) admin('unpublish', PROJECT), done.push(`${name} taken down`)
    else if (line.includes(` mac site of ${WHO} `)) admin('unpublish', name), admin('site-release', name, '--free'), done.push(`${name} taken down, the name given up`)
    else if (line.includes(` held by ${WHO} `) && line.includes('nothing up')) admin('site-release', name, '--free'), done.push(`${name} given up`)
  }
  done.push(admin('revoke-sessions', WHO))
  live('workspace/ws.mjs', ['stop', PROJECT], { ok: true })
  done.push(`project ${PROJECT}'s computer stopped`)
  console.log(`cleanup: ${done.join('; ')}`)
}

const [cmd, file] = process.argv.slice(2)
try {
  if (cmd === 'prepare' && file) await prepare(file, { local: process.argv.includes('--local') })
  else if (cmd === 'cleanup') cleanup()
  else {
    console.error('usage: drive-account.mjs prepare <password-file> | cleanup')
    process.exit(2)
  }
} catch (e) {
  console.error(`drive-account ${cmd}: ${e.message}`)
  process.exit(1)
}
