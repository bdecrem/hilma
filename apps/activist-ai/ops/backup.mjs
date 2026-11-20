#!/usr/bin/env node
// Encrypted backups (OLA-86): a copy of everything a person put into Ola, every night, encrypted
// before it leaves this machine's disk, onto the backup drive that is plugged in; and once a week a
// real restore of it, checked.
//
// The decided shape (Bart, 2026-11-16): the 1 TB SanDisk is plugged in and takes the nightly copy;
// a second drive lives at Bart's home, and once a week he swaps the two, so one copy is always out
// of the building. Both hold only ciphertext. The key is on this machine (~/.ola/backup/key) and
// on paper with Bart (the recovery sheet); without one of the two, no copy can be read.
//
//   node ops/backup.mjs key                      make the key if there is none (the secret is never
//                                                printed; its public half is ~/.ola/backup/key.pub)
//   node ops/backup.mjs recovery-sheet <file>    a page to print and keep at home: the key, and how
//                                                to restore on a new Mac (written mode 600)
//   node ops/backup.mjs init-drive <folder> <name>
//                                                make a mounted drive (or a folder) an Ola backup
//                                                drive: writes <folder>/ola-backups/drive.json,
//                                                erases nothing. Names: "sandisk", "home", …
//   node ops/backup.mjs run                      the nightly copy (cx.ola.backup): every project
//                                                (ws.mjs snapshot --all), the platform database and
//                                                the gateway's records, as one tar encrypted with
//                                                age, onto every backup drive attached; old copies
//                                                pruned; status in ~/Library/Logs/ola/backup.json
//   node ops/backup.mjs restore-test             the weekly restore (cx.ola.restoretest): on every
//                                                drive attached, the newest copy and the oldest one
//                                                are decrypted and every checksum compared; one
//                                                project of the newest (a different one each week)
//                                                is loaded into a new workspace and its files,
//                                                tables and rows compared with the copy; the
//                                                platform database is opened and checked; status
//                                                in ~/Library/Logs/ola/restore.json
//   node ops/backup.mjs restore <archive> <folder>
//                                                a real restore's first step: decrypt and unpack
//                                                one copy into an empty folder, checksums checked
//                                                (then ws.mjs load-snapshot per project; README,
//                                                "Backups")
//   node ops/backup.mjs status [--json]          the key, the drives, each one's newest copy, and
//                                                whether the weekly swap is due
//
// What is copied: each project's database and files (the snapshot, made and checked inside its VM),
// the platform database (people, projects, sessions, audit) by VACUUM INTO, the rest of the front
// desk's folder (its key, the sites), and the gateway's usage records. Not copied: model weights
// (downloaded again), the env files with the service keys (they are in the ops vault), releases.
//
// Kept on each drive: every copy of the last 14 days, and the newest copy of each week for 8 weeks.
//
// Files: ~/.ola/backup/{key,key.pub,drives.json}; ~/.ola/backup.env (optional: OLA_BACKUP_DESTS, a
// colon-separated list of folders that are backup drives too, each one initialized like a drive;
// the staging mini uses one on its own disk because no drive is plugged into it); plaintext exists
// only in ~/ola-backup-work while one copy is made, and is removed before the copy is written out.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, statfsSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const H = homedir()
const OLA = process.env.OLA_HOME || path.join(H, '.ola')
export const P = {
  keyDir: path.join(OLA, 'backup'),
  key: path.join(OLA, 'backup', 'key'),
  pub: path.join(OLA, 'backup', 'key.pub'),
  drives: path.join(OLA, 'backup', 'drives.json'),
  env: path.join(OLA, 'backup.env'),
  work: process.env.OLA_BACKUP_WORK || path.join(H, 'ola-backup-work'),
  logs: process.env.OLA_BACKUP_LOGS || path.join(H, 'Library/Logs/ola'),
  frontdesk: process.env.OLA_FD_DATA || path.join(H, '.ola-frontdesk'),
  gateway: process.env.OLA_GATEWAY_STATE || path.join(H, '.local/state/ola-gateway'),
  volumes: process.env.OLA_BACKUP_VOLUMES || '/Volumes',
}
const BIN = process.env.OLA_AGE_BIN_DIR || '/opt/homebrew/bin'
const AGE = path.join(BIN, 'age')
const KEYGEN = path.join(BIN, 'age-keygen')
const TAR = '/usr/bin/tar'
export const KEEP_DAYS = 14
export const KEEP_WEEKS = 8
export const SWAP_DAYS = 8 // a drive not written for longer than this: the weekly swap is due
const DIR = 'ola-backups'
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,30}$/
const ARCHIVE_RE = /^ola-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z\.tar\.age$/

class Refusal extends Error {}
const refuse = (m) => {
  throw new Refusal(m)
}

// ---------------------------------------------------------------- small helpers
function readEnvFile(f) {
  const out = {}
  if (!existsSync(f)) return out
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const at = line.indexOf('=')
    if (at > 0 && !line.trim().startsWith('#')) out[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return out
}
export function sha256File(f) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(f).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')))
  })
}
function writeJson(f, v) {
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(`${f}.part`, JSON.stringify(v, null, 2) + '\n', { mode: 0o600 })
  renameSync(`${f}.part`, f)
}
const readJson = (f, d = null) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'))
  } catch {
    return d
  }
}
/** Runs a child to the end; rejects with the last line of its stderr. */
function runChild(cmd, args, { stdin, stdout, env } = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: [stdin ? 'pipe' : 'ignore', stdout ? 'pipe' : 'ignore', 'pipe'], env: env ?? process.env })
    let err = ''
    c.stderr.on('data', (d) => (err = (err + d).slice(-800)))
    c.on('error', reject)
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Refusal(`${path.basename(cmd)} failed: ${err.trim().split('\n').pop() ?? `exit ${code}`}`.slice(0, 240)))))
    if (stdin) stdin(c.stdin)
    if (stdout) stdout(c.stdout)
  })
}
/** Every file under dir (relative paths), for the manifest. */
function walk(dir, base = dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(f, base))
    else if (e.isFile()) out.push(path.relative(base, f))
  }
  return out.sort()
}
export function archiveName(d) {
  const iso = d.toISOString() // 2026-11-20T03:30:00.000Z
  return `ola-${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z.tar.age`
}
export function archiveTime(name) {
  const m = ARCHIVE_RE.exec(name)
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : null
}

// ---------------------------------------------------------------- the key
export function publicKey() {
  existsSync(P.pub) || refuse(`no backup key: node ops/backup.mjs key (makes ${P.key})`)
  const k = readFileSync(P.pub, 'utf8').trim()
  ;/^age1[0-9a-z]{58}$/.test(k) || refuse(`${P.pub} does not hold an age public key`)
  return k
}
export function makeKey() {
  if (existsSync(P.key)) return { made: false, pub: publicKey() }
  existsSync(KEYGEN) || refuse(`age is not installed (${KEYGEN}): brew install age`)
  mkdirSync(P.keyDir, { recursive: true, mode: 0o700 })
  // age-keygen writes the secret to the file (mode 600) and only the public half to stderr.
  const r = spawnSync(KEYGEN, ['-o', P.key], { encoding: 'utf8' })
  if (r.status !== 0) refuse(`age-keygen failed: ${(r.stderr || '').trim().split('\n').pop()}`)
  const m = /age1[0-9a-z]{58}/.exec(r.stderr || '')
  m || refuse('age-keygen gave no public key')
  writeFileSync(P.pub, m[0] + '\n', { mode: 0o644 })
  return { made: true, pub: m[0] }
}
function secretKey() {
  existsSync(P.key) || refuse(`no backup key on this machine (${P.key}); a restore elsewhere uses the recovery sheet`)
  const k = readFileSync(P.key, 'utf8').split('\n').find((l) => l.startsWith('AGE-SECRET-KEY-'))
  k || refuse(`${P.key} holds no age secret key`)
  return k
}
export function recoverySheet(file) {
  file || refuse('usage: recovery-sheet <file.html>')
  existsSync(file) && refuse(`${file} exists; pick a new name`)
  const k = secretKey()
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
  const html = `<!doctype html><meta charset="utf-8"><title>Ola backup recovery sheet</title>
<style>body{font:15px/1.5 -apple-system,Helvetica,sans-serif;max-width:40em;margin:3em auto;color:#111}code,pre{font:14px/1.4 Menlo,monospace}pre{border:2px solid #111;padding:1em;white-space:pre-wrap;word-break:break-all}h1{font-size:22px}</style>
<h1>Ola backups: the recovery key</h1>
<p>Machine <b>${esc(hostname())}</b>, made ${esc(new Date().toISOString().slice(0, 10))}. Public half: <code>${esc(publicKey())}</code></p>
<p>Every Ola backup on the SanDisk and on the drive at home is encrypted to this key. If the Ola machine is lost, this sheet is the only way to read them. Keep it at home, not in the office.</p>
<pre>${esc(k)}</pre>
<h2>Restoring on a new Mac</h2>
<ol><li>Install age: <code>brew install age</code>.</li>
<li>Type the key above into a file named <code>key</code>, then <code>chmod 600 key</code>.</li>
<li>Plug in a backup drive. The copies are in <code>ola-backups/</code>, one file a night, named by date and time (UTC).</li>
<li><code>age -d -i key ola-backups/&lt;newest&gt;.tar.age | tar -xf - -C &lt;empty folder&gt;</code></li>
<li>The folder holds <code>manifest.json</code> (every file's sha256), <code>platform/</code> (the people and projects) and <code>projects/&lt;id&gt;/</code> (each project's database and files). Put each project back with <code>node workspace/ws.mjs load-snapshot &lt;id&gt; &lt;folder&gt;/projects/&lt;id&gt;</code>. The Ola README, "Backups", has the rest.</li></ol>`
  writeFileSync(file, html, { mode: 0o600, flag: 'wx' })
  return { file }
}

// ---------------------------------------------------------------- drives
export function initDrive(folder, name) {
  if (!folder || !name) refuse('usage: init-drive <folder> <name>')
  NAME_RE.test(name) || refuse('a drive name is lowercase letters, digits and dashes ("sandisk", "home")')
  existsSync(folder) && statSync(folder).isDirectory() || refuse(`${folder} is not a mounted folder`)
  const d = path.join(folder, DIR)
  const marker = path.join(d, 'drive.json')
  const had = readJson(marker)
  if (had && had.name !== name) refuse(`${folder} is already the backup drive "${had.name}"`)
  for (const other of listDrives()) if (other.name === name && path.resolve(other.folder) !== path.resolve(folder)) refuse(`another attached drive is already called "${name}" (${other.folder})`)
  mkdirSync(d, { recursive: true, mode: 0o700 })
  if (!had) writeJson(marker, { name, made: new Date().toISOString(), by: 'ops/backup.mjs init-drive' })
  return { folder, name, new: !had }
}
/** The backup drives attached now: mounted volumes with ola-backups/drive.json, and OLA_BACKUP_DESTS. */
export function listDrives() {
  const cands = []
  if (existsSync(P.volumes)) for (const v of readdirSync(P.volumes)) cands.push(path.join(P.volumes, v))
  const extra = process.env.OLA_BACKUP_DESTS ?? readEnvFile(P.env).OLA_BACKUP_DESTS ?? ''
  for (const f of extra.split(':').map((s) => s.trim()).filter(Boolean)) cands.push(f)
  const seen = new Set()
  const out = []
  for (const folder of cands) {
    const m = readJson(path.join(folder, DIR, 'drive.json'))
    if (!m || !NAME_RE.test(m.name ?? '') || seen.has(m.name)) continue
    seen.add(m.name)
    out.push({ name: m.name, folder, dir: path.join(folder, DIR) })
  }
  return out
}
export function archivesOn(drive) {
  if (!existsSync(drive.dir)) return []
  return readdirSync(drive.dir)
    .filter((f) => ARCHIVE_RE.test(f))
    .map((f) => ({ name: f, file: path.join(drive.dir, f), at: archiveTime(f), meta: readJson(path.join(drive.dir, f.replace(/\.tar\.age$/, '.json'))) }))
    .sort((a, b) => a.at - b.at)
}
/** Which copies to keep: everything from the last KEEP_DAYS days, and the newest of each ISO week for KEEP_WEEKS weeks. */
export function toPrune(archives, now = Date.now()) {
  const keep = new Set()
  const byWeek = new Map()
  for (const a of archives) {
    const age = (now - a.at) / 86_400_000
    if (age <= KEEP_DAYS) keep.add(a.name)
    if (age <= KEEP_WEEKS * 7) {
      const wk = Math.floor((a.at / 86_400_000 + 3) / 7) // weeks since a Monday, UTC
      const cur = byWeek.get(wk)
      if (!cur || a.at > cur.at) byWeek.set(wk, a)
    }
  }
  for (const a of byWeek.values()) keep.add(a.name)
  if (archives.length) keep.add(archives.at(-1).name) // never prune the newest
  return archives.filter((a) => !keep.has(a.name))
}

// ---------------------------------------------------------------- making one copy
async function defaultSnapshotAll(dir, say) {
  const ws = await import(pathToFileURL(path.join(HERE, '../workspace/ws.mjs')).href)
  return ws.snapshotAll(dir, { say })
}
async function defaultTakeTurn(label) {
  const { takeTurn } = await import(pathToFileURL(path.join(HERE, 'turn.mjs')).href)
  return takeTurn(label)
}

/** The platform's own data: platform.db by VACUUM INTO (consistent while the front desk writes), and the rest of its folder. */
function copyPlatform(out) {
  mkdirSync(out, { recursive: true, mode: 0o700 })
  const db = path.join(P.frontdesk, 'platform.db')
  existsSync(db) || refuse(`no platform database at ${db}`)
  const src = new DatabaseSync(db, { readOnly: true })
  try {
    src.exec(`VACUUM INTO '${path.join(out, 'platform.db').replace(/'/g, "''")}'`)
  } finally {
    src.close()
  }
  const check = new DatabaseSync(path.join(out, 'platform.db'), { readOnly: true })
  try {
    const r = check.prepare('PRAGMA integrity_check').get()
    if (Object.values(r)[0] !== 'ok') refuse('the platform database copy did not check out')
  } finally {
    check.close()
  }
  const rest = path.join(out, 'frontdesk')
  for (const f of walk(P.frontdesk)) {
    if (/^platform\.db(-wal|-shm)?$/.test(f) || /\.before-/.test(f)) continue
    mkdirSync(path.dirname(path.join(rest, f)), { recursive: true, mode: 0o700 })
    copyFileSync(path.join(P.frontdesk, f), path.join(rest, f))
  }
  if (existsSync(P.gateway)) {
    const g = path.join(out, 'gateway')
    for (const f of walk(P.gateway)) {
      mkdirSync(path.dirname(path.join(g, f)), { recursive: true, mode: 0o700 })
      copyFileSync(path.join(P.gateway, f), path.join(g, f))
    }
  }
}

/**
 * The nightly copy. Throws (a Refusal) when nothing could be written; a project that failed its
 * snapshot fails the run too (its error named), after the others are written.
 */
export async function backup({ now = new Date(), say = console.log, snapshotAll = defaultSnapshotAll, takeTurn = defaultTakeTurn } = {}) {
  const pub = publicKey()
  existsSync(AGE) || refuse(`age is not installed (${AGE}): brew install age`)
  const drives = listDrives()
  drives.length || refuse('no backup drive is plugged in (the SanDisk, or the drive from home)')
  const name = archiveName(now)
  mkdirSync(P.work, { recursive: true, mode: 0o700 })
  const plain = path.join(P.work, 'plain')
  const cipher = path.join(P.work, name)
  rmSync(plain, { recursive: true, force: true })
  rmSync(cipher, { force: true })
  let snap
  let manifest
  try {
    mkdirSync(path.join(plain, 'projects'), { recursive: true, mode: 0o700 })
    await takeTurn('backup')
    snap = await snapshotAll(path.join(plain, 'projects'), say)
    copyPlatform(path.join(plain, 'platform'))
    const files = {}
    for (const f of walk(plain)) files[f] = { sha256: await sha256File(path.join(plain, f)), size: statSync(path.join(plain, f)).size }
    manifest = { at: now.toISOString(), host: hostname(), projects: snap.done, failed: snap.failed, files }
    writeJson(path.join(plain, 'manifest.json'), manifest)
    // tar of the folder, straight into age: the ciphertext is the only thing written out.
    await new Promise((resolve, reject) => {
      const tar = spawn(TAR, ['-cf', '-', '-C', plain, '.'], { stdio: ['ignore', 'pipe', 'pipe'] })
      const age = spawn(AGE, ['-r', pub, '-o', `${cipher}.part`], { stdio: ['pipe', 'ignore', 'pipe'] })
      let err = ''
      tar.stderr.on('data', (d) => (err += d))
      age.stderr.on('data', (d) => (err += d))
      tar.stdout.pipe(age.stdin)
      let codes = 0
      const done = () => (++codes === 2 ? (tar.exitCode === 0 && age.exitCode === 0 ? resolve() : reject(new Refusal(`encrypting failed: ${err.trim().split('\n').pop()}`))) : null)
      tar.on('close', done)
      age.on('close', done)
    })
    renameSync(`${cipher}.part`, cipher)
  } finally {
    rmSync(plain, { recursive: true, force: true }) // plaintext never outlives the run
  }
  const sha = await sha256File(cipher)
  const bytes = statSync(cipher).size
  const meta = { at: now.toISOString(), sha256: sha, bytes, key: pub, projects: manifest.projects.length, failed: manifest.failed.length, files: Object.keys(manifest.files).length }
  const written = []
  const errors = []
  const book = readJson(P.drives, {})
  for (const d of drives) {
    try {
      const free = statfsSync(d.folder)
      if (free.bavail * free.bsize < bytes * 1.1 + 64 * 1024 ** 2) refuse(`not enough room on "${d.name}"`)
      const dest = path.join(d.dir, name)
      copyFileSync(cipher, `${dest}.part`)
      if ((await sha256File(`${dest}.part`)) !== sha) refuse(`the copy on "${d.name}" does not read back the same`)
      renameSync(`${dest}.part`, dest)
      writeJson(dest.replace(/\.tar\.age$/, '.json'), meta)
      const pruned = toPrune(archivesOn(d), now.getTime())
      for (const a of pruned) {
        rmSync(a.file, { force: true })
        rmSync(a.file.replace(/\.tar\.age$/, '.json'), { force: true })
      }
      book[d.name] = { ...(book[d.name] ?? {}), lastWritten: now.toISOString(), lastArchive: name, folder: d.folder }
      written.push({ drive: d.name, pruned: pruned.length, kept: archivesOn(d).length })
      say(`${d.name}: wrote ${name} (${bytes} bytes), ${pruned.length} old copies removed, ${archivesOn(d).length} kept`)
    } catch (e) {
      errors.push(`${d.name}: ${e.message}`)
      say(`${d.name}: FAILED (${e.message})`)
    }
  }
  rmSync(cipher, { force: true })
  writeJson(P.drives, book)
  if (!written.length) refuse(`no drive took the copy (${errors.join('; ')})`)
  if (manifest.failed.length) refuse(`copied, but ${manifest.failed.length} project(s) failed their snapshot: ${manifest.failed.join(', ')}`)
  if (errors.length) refuse(`copied to ${written.map((w) => w.drive).join(', ')}, but ${errors.join('; ')}`)
  return { archive: name, bytes, projects: manifest.projects, written, swap: swapState(now.getTime()) }
}

/** Whether the weekly swap is due: a known drive not written for more than SWAP_DAYS days. */
export function swapState(now = Date.now()) {
  const book = readJson(P.drives, {})
  const attached = new Set(listDrives().map((d) => d.name))
  const drives = Object.entries(book).map(([name, b]) => ({ name, attached: attached.has(name), lastWritten: b.lastWritten, days: b.lastWritten ? Math.floor((now - Date.parse(b.lastWritten)) / 86_400_000) : null }))
  const away = drives.filter((d) => !d.attached)
  const due = away.filter((d) => d.days !== null && d.days > SWAP_DAYS)
  const note = drives.length < 2 ? 'only one backup drive has been used so far; the second one (from home) has not been plugged in yet' : due.length ? `swap the backup drives: "${due.map((d) => d.name).join('", "')}" last took a copy ${due[0].days} days ago` : null
  return { drives, note }
}

// ---------------------------------------------------------------- reading a copy back
/** Decrypts one copy into an empty folder and checks every checksum in its manifest. */
export async function unpack(archive, folder, { keyFile = P.key } = {}) {
  existsSync(archive) || refuse(`no copy at ${archive}`)
  if (existsSync(folder) && readdirSync(folder).length) refuse(`${folder} is not empty`)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const metaFile = archive.replace(/\.tar\.age$/, '.json')
  const meta = readJson(metaFile)
  if (meta?.sha256 && (await sha256File(archive)) !== meta.sha256) refuse(`${path.basename(archive)} is not the file that was written (its sha256 differs)`)
  await new Promise((resolve, reject) => {
    const age = spawn(AGE, ['-d', '-i', keyFile, archive], { stdio: ['ignore', 'pipe', 'pipe'] })
    const tar = spawn(TAR, ['-xf', '-', '-C', folder], { stdio: ['pipe', 'ignore', 'pipe'] })
    let err = ''
    age.stderr.on('data', (d) => (err += d))
    tar.stderr.on('data', (d) => (err += d))
    age.stdout.pipe(tar.stdin)
    let n = 0
    const done = () => (++n === 2 ? (age.exitCode === 0 && tar.exitCode === 0 ? resolve() : reject(new Refusal(`decrypting failed: ${err.trim().split('\n').pop()}`))) : null)
    age.on('close', done)
    tar.on('close', done)
  })
  const m = readJson(path.join(folder, 'manifest.json'))
  m?.files || refuse('the copy has no manifest')
  const bad = []
  for (const [f, v] of Object.entries(m.files)) {
    const full = path.join(folder, f)
    if (!existsSync(full) || (await sha256File(full)) !== v.sha256) bad.push(f)
  }
  if (bad.length) refuse(`${bad.length} file(s) in the copy do not match their checksum: ${bad.slice(0, 5).join(', ')}`)
  return { manifest: m, files: Object.keys(m.files).length }
}

async function defaultLoadAndCompare(snapDir, id, say) {
  const ws = await import(pathToFileURL(path.join(HERE, '../workspace/ws.mjs')).href)
  const T = 'restoretest'
  const destroy = () => ws.destroy(T, { confirm: T }).catch(() => {})
  if (existsSync(ws.paths(T).dir)) await destroy() // a crashed earlier test's leftover, ours
  try {
    await ws.waitForRoom([T], 1, { say })
    await ws.create(T)
    await ws.loadSnapshot(T, snapDir)
    const m = readJson(path.join(snapDir, 'manifest.json'))
    // Files: every file in the copy's files.tar (except the agent's .ola history, which a restore
    // into a running workspace leaves out) is in the new project with the same bytes.
    // (Names only, -t: the archive is listed on this machine, never unpacked here.)
    const list = spawnSync(TAR, ['-tf', path.join(snapDir, 'files.tar')], { encoding: 'utf8', maxBuffer: 256 * 1024 ** 2 })
    if (list.status !== 0) refuse(`the files of project ${id} in the copy could not be listed`)
    const want = list.stdout.split('\n').map((l) => l.replace(/^\.\//, '')).filter((f) => f && !f.endsWith('/') && !f.startsWith('.ola/'))
    const have = new Set(ws.files(T).filter((f) => !f.ola).map((f) => f.path))
    const missing = want.filter((f) => !have.has(f))
    // Tables and rows: the copy's counts (taken inside the original's VM) against the new project's.
    const tables = (await ws.dbApi(T, ['tables'])).tables ?? []
    const rows = Object.fromEntries(tables.map((t) => [t.name, t.rows]))
    const wrong = Object.entries(m.database.tables ?? {}).filter(([t, n]) => t !== 'documents' && rows[t] !== undefined && rows[t] !== n)
    const docsWant = m.database.tables?.documents
    const docsHave = (await ws.dbApi(T, ['tables'])).documents?.count
    if (missing.length || wrong.length || (docsWant !== undefined && docsHave !== docsWant))
      refuse(`project ${id} restored differently: ${missing.length} file(s) missing, ${wrong.length} table(s) with other row counts, documents ${docsHave} of ${docsWant}`)
    return { id, files: want.length, tables: Object.keys(m.database.tables ?? {}).length, documents: docsHave }
  } finally {
    ws.stop?.(T)
    await destroy()
  }
}

function checkPlatform(folder) {
  const f = path.join(folder, 'platform', 'platform.db')
  existsSync(f) || refuse('the copy has no platform database')
  const db = new DatabaseSync(f, { readOnly: true })
  try {
    if (Object.values(db.prepare('PRAGMA integrity_check').get())[0] !== 'ok') refuse('the platform database in the copy is damaged')
    const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
    const counts = {}
    for (const name of ['users', 'workspaces', 'memberships']) if (t.includes(name)) counts[name] = db.prepare(`SELECT count(*) AS n FROM "${name}"`).get().n
    return { tables: t.length, ...counts }
  } finally {
    db.close()
  }
}

/** The weekly restore test. */
export async function restoreTest({ now = new Date(), say = console.log, loadAndCompare = defaultLoadAndCompare, takeTurn = defaultTakeTurn } = {}) {
  const drives = listDrives()
  drives.length || refuse('no backup drive is plugged in')
  const results = []
  const root = path.join(P.work, 'restore')
  rmSync(root, { recursive: true, force: true })
  try {
    for (const d of drives) {
      const all = archivesOn(d)
      if (!all.length) refuse(`"${d.name}" holds no copy yet`)
      const picks = all.length > 1 ? [all.at(-1), all[0]] : [all.at(-1)]
      for (const [i, a] of picks.entries()) {
        const folder = path.join(root, `${d.name}-${i}`)
        const u = await unpack(a.file, folder)
        const platform = checkPlatform(folder)
        const r = { drive: d.name, archive: a.name, kind: i === 0 ? 'newest' : 'oldest', files: u.files, projects: u.manifest.projects.length, platform }
        if (i === 0 && u.manifest.projects.length) {
          // A different project each week, so over a few weeks every one is restored for real.
          const week = Math.floor(now.getTime() / (7 * 86_400_000))
          const id = [...u.manifest.projects].sort()[week % u.manifest.projects.length]
          await takeTurn('restore test')
          r.loaded = await loadAndCompare(path.join(folder, 'projects', id), id, say)
        }
        say(`${d.name}: ${a.name} (${r.kind}) decrypted, ${u.files} files match their checksums, platform database ok${r.loaded ? `, project ${r.loaded.id} restored into a new workspace and compared` : ''}`)
        rmSync(folder, { recursive: true, force: true })
        results.push(r)
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  return { results }
}

// ---------------------------------------------------------------- status
export function status(now = Date.now()) {
  const drives = listDrives().map((d) => {
    const a = archivesOn(d)
    return { name: d.name, folder: d.folder, copies: a.length, newest: a.at(-1)?.name ?? null, oldest: a[0]?.name ?? null }
  })
  return { key: existsSync(P.key) ? { pub: existsSync(P.pub) ? readFileSync(P.pub, 'utf8').trim() : null } : null, drives, swap: swapState(now), last: readJson(path.join(P.logs, 'backup.json')), restore: readJson(path.join(P.logs, 'restore.json')) }
}

// ---------------------------------------------------------------- the command
async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  const record = (name, fn) => async () => {
    const at = new Date().toISOString()
    try {
      const r = await fn()
      writeJson(path.join(P.logs, `${name}.json`), { at, ok: true, ...r, note: r.swap?.note ?? undefined })
      return r
    } catch (e) {
      writeJson(path.join(P.logs, `${name}.json`), { at, ok: false, error: e.message })
      throw e
    }
  }
  switch (cmd) {
    case 'key': {
      const r = makeKey()
      console.log(r.made ? `made the backup key; public half ${r.pub}. Next: node ops/backup.mjs recovery-sheet <file.html>, print it, keep it at home, delete the file.` : `the backup key exists; public half ${r.pub}`)
      break
    }
    case 'recovery-sheet':
      console.log(`wrote ${recoverySheet(args[0]).file} (mode 600). Print it, then delete the file.`)
      break
    case 'init-drive': {
      const r = initDrive(args[0], args[1])
      console.log(r.new ? `"${r.name}" is now an Ola backup drive (${r.folder}/${DIR})` : `"${r.name}" was already an Ola backup drive`)
      break
    }
    case 'run': {
      const r = await record('backup', () => backup())()
      console.log(`backup ${r.archive}: ${r.projects.length} projects, ${r.bytes} bytes, on ${r.written.map((w) => w.drive).join(', ')}${r.swap.note ? `. ${r.swap.note}` : ''}`)
      break
    }
    case 'restore-test': {
      const r = await record('restore', () => restoreTest())()
      console.log(`restore test passed: ${r.results.length} copies read back`)
      break
    }
    case 'restore': {
      if (!args[0] || !args[1]) refuse('usage: restore <archive.tar.age> <empty folder>')
      const r = await unpack(args[0], args[1])
      console.log(`unpacked into ${args[1]}: ${r.files} files, every checksum matches; projects: ${r.manifest.projects.join(', ') || 'none'}`)
      break
    }
    case 'status': {
      const s = status()
      if (args.includes('--json')) console.log(JSON.stringify(s, null, 2))
      else {
        console.log(`key        ${s.key ? `present (${s.key.pub})` : 'MISSING: node ops/backup.mjs key'}`)
        for (const d of s.drives) console.log(`drive      ${d.name} at ${d.folder}: ${d.copies} copies, newest ${d.newest ?? 'none'}`)
        if (!s.drives.length) console.log('drive      none plugged in')
        console.log(`last copy  ${s.last ? `${s.last.at} ${s.last.ok ? 'ok' : `FAILED: ${s.last.error}`}` : 'never'}`)
        console.log(`restore    ${s.restore ? `${s.restore.at} ${s.restore.ok ? 'ok' : `FAILED: ${s.restore.error}`}` : 'never tested'}`)
        if (s.swap.note) console.log(`swap       ${s.swap.note}`)
      }
      break
    }
    default:
      console.error('usage: node ops/backup.mjs key | recovery-sheet <file> | init-drive <folder> <name> | run | restore-test | restore <archive> <folder> | status [--json]')
      process.exit(2)
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e instanceof Refusal ? `refused: ${e.message}` : e.stack || e.message)
      process.exit(1)
    },
  )
}
