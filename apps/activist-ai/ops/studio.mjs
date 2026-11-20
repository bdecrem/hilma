#!/usr/bin/env node
// The Studio's install list, as a check (OLA-100). Run it as the account that runs Ola, on the
// machine that will hold real data, before the first person's files reach it:
//
//   node ops/studio.mjs check [--json]     one line per item: ok or no, and what to do when no
//
// Exit 0 only when every item is ok. It reads, never changes anything, needs no sudo, and prints
// no secret: from an env file it reads only which settings are named, never their values.
// The steps that make each item true are in the README, "The Studio's install list".
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return { code: r.status, out: r.stdout || '' }
}

/** Labels another account's jobs may never have here: Apple's own, and Ola's. */
export const OURS = /^(cx\.ola\.|com\.apple\.|application\.com\.apple\.)/

/** `ps -o etime` ([[dd-]hh:]mm:ss) in seconds. */
export function etimeSeconds(s) {
  const m = /^\s*(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)\s*$/.exec(String(s))
  if (!m) return null
  return ((+(m[1] || 0) * 24 + +(m[2] || 0)) * 60 + +m[3]) * 60 + +m[4]
}

/** The names (only) of the settings in an env file. */
export function settingNames(text) {
  const out = new Set()
  for (const line of String(text).split('\n')) {
    const t = line.trim()
    const at = t.indexOf('=')
    if (t && !t.startsWith('#') && at > 0) out.add(t.slice(0, at))
  }
  return out
}

/**
 * The checks. Everything outside comes through `io`, so the test can stand up any machine.
 * Returns [{ id, ok, what, fix? }].
 */
export function check(io = {}) {
  const sh = io.sh || run
  const home = io.home || homedir()
  const user = io.user || userInfo().username
  const uid = io.uid ?? process.getuid()
  const now = io.now || Date.now()
  const ola = path.join(home, '.ola')
  const mode = (f) => {
    try {
      return statSync(f).mode & 0o777
    } catch {
      return null
    }
  }
  const rows = []
  const add = (id, ok, what, fix) => rows.push(ok ? { id, ok, what } : { id, ok, what, fix })

  // 1. Disk encryption. FileVault encrypts the whole disk, so a destroyed project's blocks and every
  // copy the machine keeps are unreadable without the password (workspace review M5).
  const fv = sh('/usr/bin/fdesetup', ['status']).out
  add('disk-encryption', /FileVault is On\./.test(fv), /FileVault is On\./.test(fv) ? 'FileVault is on' : `FileVault: ${fv.trim() || 'no answer from fdesetup'}`, 'Turn FileVault on (System Settings > Privacy & Security > FileVault), recovery key written on paper, not kept in iCloud')

  // 2. A separate account. The account that runs Ola is not an administrator, so a bug in the
  // front desk cannot become root (front desk review L4).
  const groups = sh('/usr/bin/id', ['-Gn', user]).out.trim().split(/\s+/)
  const isAdmin = groups.includes('admin')
  add('own-account', !isAdmin && groups.length > 0 && groups[0] !== '', isAdmin ? `${user} is an administrator` : `${user} is a standard account`, `Run Ola under its own standard account (README, "The Studio's install list", step 2), not under ${user}`)

  // 3. Nothing else runs in that account: no other agent or service shares its files and keys.
  const labels = sh('/bin/launchctl', ['list']).out.split('\n').slice(1).map((l) => l.split('\t')[2]).filter(Boolean)
  const others = [...new Set(labels.filter((l) => !OURS.test(l)).map((l) => l.replace(/(\.\d+)+$/, '')))].sort()
  add('alone', others.length === 0, others.length ? `${others.length} other jobs run in this account: ${others.slice(0, 6).join(', ')}${others.length > 6 ? ', …' : ''}` : 'only Ola and Apple run in this account', 'Move every job that is not cx.ola.* to another account')

  // 4. The account's files are its own: the home folder and ~/.ola open to no one else.
  const hm = mode(home)
  const om = mode(ola)
  const closed = hm !== null && (hm & 0o077) === 0 && om !== null && (om & 0o077) === 0
  add('private-home', closed, `home ${hm === null ? 'missing' : hm.toString(8)}, ~/.ola ${om === null ? 'missing' : om.toString(8)}`, 'chmod 700 the home folder and ~/.ola')

  // 5. Cancelling a project's key takes effect without a restart: the gateway reads its callers from
  // the tokens file again on every change, and each project's key works only through its own door.
  // Proven live when the running gateway has reloaded its callers since it last started.
  const envFile = path.join(ola, 'gateway.env')
  const names = existsSync(envFile) ? settingNames(readFileSync(envFile, 'utf8')) : new Set()
  const tokensFile = path.join(ola, 'gateway-tokens')
  const configured = names.has('GATEWAY_TOKENS_FILE') && names.has('GATEWAY_DOOR_DIR') && mode(tokensFile) === 0o600
  let seen = null
  if (configured) {
    const pid = /pid = (\d+)/.exec(sh('/bin/launchctl', ['print', `gui/${uid}/cx.ola.gateway`]).out)?.[1]
    const up = pid ? etimeSeconds(sh('/bin/ps', ['-o', 'etime=', '-p', pid]).out) : null
    const log = io.gatewayLog || path.join(home, 'Library/Logs/ola/gateway.log')
    let last = null
    if (up !== null && existsSync(log)) {
      for (const line of readFileSync(log, 'utf8').split('\n')) {
        if (!line.includes('"event":"tokens"')) continue
        try {
          const j = JSON.parse(line)
          if (j.ok && j.why === 'file') last = j
        } catch {}
      }
    }
    if (last && Date.parse(last.t) > now - up * 1000) seen = last.t
  }
  add(
    'key-cancel',
    configured && !!seen,
    !configured ? 'the gateway does not read its callers from ~/.ola/gateway-tokens with a door per project' : seen ? `a key change reached the running gateway without a restart (last at ${seen})` : 'set up, but the running gateway has not reloaded a key since it started',
    !configured ? 'Set GATEWAY_TOKENS_FILE and GATEWAY_DOOR_DIR in ~/.ola/gateway.env (README, "Start at boot"), tokens file mode 600' : 'Create a throwaway project and destroy it (ws.mjs create / destroy), then run this again',
  )

  // 6. Backups: the key exists and the nightly job is loaded.
  const key = existsSync(path.join(ola, 'backup', 'key'))
  const job = sh('/bin/launchctl', ['print', `gui/${uid}/cx.ola.backup`]).code === 0
  add('backups', key && job, key ? (job ? 'backup key present, nightly job loaded' : 'backup key present, nightly job not loaded') : 'no backup key', 'node ops/backup.mjs key, print the recovery sheet, init-drive, then node ops/ola.mjs install (README, "Encrypted backups")')

  // 7. Deploys only from signed commits: the list of allowed signers exists.
  const signers = existsSync(path.join(ola, 'allowed-signers'))
  add('signed-deploys', signers, signers ? '~/.ola/allowed-signers present' : 'no ~/.ola/allowed-signers: every deploy needs --unsigned', "Put Bart's signing key (made on his own device) in ~/.ola/allowed-signers (README, \"Deploying staging\")")

  return rows
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd] = process.argv.slice(2)
  if (cmd !== 'check') {
    console.error('usage: node ops/studio.mjs check [--json]')
    process.exit(2)
  }
  const rows = check()
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2))
  else {
    for (const r of rows) console.log(`${r.ok ? 'ok' : 'no'}  ${r.id.padEnd(16)} ${r.what}${r.ok ? '' : `\n    do: ${r.fix}`}`)
    const bad = rows.filter((r) => !r.ok).length
    console.log(bad ? `\n${bad} of ${rows.length} not done: this machine is not ready for real data` : `\nall ${rows.length} done: ready for real data`)
  }
  process.exit(rows.every((r) => r.ok) ? 0 : 1)
}
