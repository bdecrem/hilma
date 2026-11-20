// The backups' tests (OLA-86): node --test ops/backup-test.mjs (seconds, any Mac with age).
// Everything runs in a temporary home: the key, two "drives" (folders), a platform database, a
// gateway folder and made-up projects from a stand-in snapshotter. Real age, real tar; no VM.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, test } from 'node:test'

const T = mkdtempSync(path.join(tmpdir(), 'ola-backup-test-'))
const D1 = path.join(T, 'sandisk')
const D2 = path.join(T, 'home-drive')
const VOL = path.join(T, 'Volumes')
for (const d of [D1, D2, VOL]) mkdirSync(d, { recursive: true })
Object.assign(process.env, {
  OLA_HOME: path.join(T, 'ola'),
  OLA_BACKUP_WORK: path.join(T, 'work'),
  OLA_BACKUP_LOGS: path.join(T, 'logs'),
  OLA_FD_DATA: path.join(T, 'frontdesk'),
  OLA_GATEWAY_STATE: path.join(T, 'gateway'),
  OLA_BACKUP_VOLUMES: VOL,
  OLA_BACKUP_DESTS: D1,
})
const B = await import('./backup.mjs')
after(() => rmSync(T, { recursive: true, force: true }))

const SECRET_WORD = 'mangrove-ledger-7731' // appears in the made-up data; must never appear in a copy
mkdirSync(process.env.OLA_FD_DATA, { recursive: true })
{
  const db = new DatabaseSync(path.join(process.env.OLA_FD_DATA, 'platform.db'))
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE users(id INTEGER PRIMARY KEY, handle TEXT); INSERT INTO users(handle) VALUES ('${SECRET_WORD}'), ('kim'); CREATE TABLE workspaces(id TEXT); INSERT INTO workspaces VALUES ('alpha');`)
  db.close() // a WAL left behind is fine: VACUUM INTO reads through it
}
writeFileSync(path.join(process.env.OLA_FD_DATA, 'frontdesk.key'), 'k'.repeat(64))
mkdirSync(process.env.OLA_GATEWAY_STATE, { recursive: true })
writeFileSync(path.join(process.env.OLA_GATEWAY_STATE, 'usage.json'), '{"alpha":12}')

// A stand-in for ws.mjs snapshotAll: what a real snapshot leaves, per project.
const fakeSnap = (projects, { fail = [] } = {}) => async (dir) => {
  for (const id of projects) {
    const out = path.join(dir, id)
    mkdirSync(out, { recursive: true })
    writeFileSync(path.join(out, 'project.db'), `db of ${id} ${SECRET_WORD}`)
    writeFileSync(path.join(out, 'files.tar'), `files of ${id}`)
    writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ id, database: { tables: { documents: 1 } } }))
  }
  return { done: projects, failed: fail }
}
const noTurn = async () => {}
const quiet = () => {}

test('refuses with no key, and makes one without printing the secret', () => {
  assert.throws(() => B.publicKey(), /no backup key/)
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, 'backup.mjs'), 'key'], { encoding: 'utf8', env: process.env })
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stdout + r.stderr, /AGE-SECRET-KEY/)
  assert.match(r.stdout, /public half age1/)
  assert.match(readFileSync(B.P.key, 'utf8'), /AGE-SECRET-KEY-1/)
  assert.equal(B.makeKey().made, false, 'a second run keeps the key')
})

test('refuses when no backup drive is plugged in', async () => {
  await assert.rejects(B.backup({ snapshotAll: fakeSnap(['alpha']), takeTurn: noTurn, say: quiet }), /no backup drive is plugged in/)
})

test('init-drive marks a drive and erases nothing; a second name for it is refused', () => {
  writeFileSync(path.join(D1, 'their-photo.jpg'), 'x')
  assert.equal(B.initDrive(D1, 'sandisk').new, true)
  assert.ok(existsSync(path.join(D1, 'their-photo.jpg')))
  assert.throws(() => B.initDrive(D1, 'home'), /already the backup drive "sandisk"/)
  assert.deepEqual(B.listDrives().map((d) => d.name), ['sandisk'])
})

let first
test('the nightly copy: one encrypted file on the drive, no plaintext left anywhere', async () => {
  const now = new Date('2026-11-20T11:30:00Z')
  first = await B.backup({ now, snapshotAll: fakeSnap(['alpha', 'beta']), takeTurn: noTurn, say: quiet })
  assert.equal(first.archive, 'ola-2026-11-20T113000Z.tar.age')
  const dir = path.join(D1, 'ola-backups')
  const bytes = readFileSync(path.join(dir, first.archive))
  assert.match(bytes.subarray(0, 40).toString('latin1'), /^age-encryption\.org\/v1/)
  assert.ok(!bytes.includes(Buffer.from(SECRET_WORD)), 'the made-up secret is not readable in the copy')
  assert.deepEqual(readdirSync(B.P.work), [], 'the work folder is empty after the run')
  const meta = JSON.parse(readFileSync(path.join(dir, first.archive.replace('.tar.age', '.json')), 'utf8'))
  assert.equal(meta.projects, 2)
  assert.doesNotMatch(JSON.stringify(meta), /alpha|beta/, 'the sidecar names no project')
})

test('a copy reads back: decrypted, every checksum matches, the platform database opens', async () => {
  const out = path.join(T, 'restored')
  const r = await B.unpack(path.join(D1, 'ola-backups', first.archive), out)
  assert.deepEqual(r.manifest.projects, ['alpha', 'beta'])
  assert.match(readFileSync(path.join(out, 'projects/alpha/project.db'), 'utf8'), /db of alpha/)
  const db = new DatabaseSync(path.join(out, 'platform/platform.db'), { readOnly: true })
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 2)
  db.close()
  assert.ok(existsSync(path.join(out, 'platform/frontdesk/frontdesk.key')))
  assert.ok(existsSync(path.join(out, 'platform/gateway/usage.json')))
})

test('a damaged copy is refused, and so is the wrong key', async () => {
  const src = path.join(D1, 'ola-backups', first.archive)
  const bad = path.join(T, 'bad.tar.age')
  const buf = readFileSync(src)
  buf[buf.length - 20] ^= 0xff
  writeFileSync(bad, buf)
  writeFileSync(bad.replace('.tar.age', '.json'), readFileSync(src.replace('.tar.age', '.json')))
  await assert.rejects(B.unpack(bad, path.join(T, 'r-bad')), /sha256 differs/)
  rmSync(bad.replace('.tar.age', '.json'))
  await assert.rejects(B.unpack(bad, path.join(T, 'r-bad2')), /decrypting failed/)
  const other = path.join(T, 'other-key')
  spawnSync('/opt/homebrew/bin/age-keygen', ['-o', other])
  await assert.rejects(B.unpack(src, path.join(T, 'r-wrong'), { keyFile: other }), /decrypting failed/)
})

test('two drives: both take the copy; the weekly swap is due when the away drive is 9 days old', async () => {
  B.initDrive(D2, 'home')
  process.env.OLA_BACKUP_DESTS = `${D1}:${D2}`
  const r = await B.backup({ now: new Date('2026-11-21T11:30:00Z'), snapshotAll: fakeSnap(['alpha']), takeTurn: noTurn, say: quiet })
  assert.deepEqual(r.written.map((w) => w.drive), ['sandisk', 'home'])
  process.env.OLA_BACKUP_DESTS = D1 // "home" goes home
  assert.equal(B.swapState(Date.parse('2026-11-25T12:00:00Z')).note, null)
  assert.match(B.swapState(Date.parse('2026-11-30T12:00:00Z')).note, /swap the backup drives: "home" last took a copy 9 days ago/)
})

test('a project whose snapshot failed fails the run, after the others are written', async () => {
  await assert.rejects(B.backup({ now: new Date('2026-11-22T11:30:00Z'), snapshotAll: fakeSnap(['alpha'], { fail: ['beta'] }), takeTurn: noTurn, say: quiet }), /1 project\(s\) failed their snapshot: beta/)
  assert.ok(existsSync(path.join(D1, 'ola-backups', 'ola-2026-11-22T113000Z.tar.age')))
})

test('kept: every copy of 14 days, the newest of each week for 8 weeks, never the newest', () => {
  const now = Date.parse('2026-11-20T12:00:00Z')
  const archives = []
  for (let d = 0; d < 80; d++) {
    const at = now - d * 86_400_000
    archives.unshift({ name: B.archiveName(new Date(at)), at })
  }
  const pruned = new Set(B.toPrune(archives, now).map((a) => a.name))
  const kept = archives.filter((a) => !pruned.has(a.name))
  assert.ok(kept.filter((a) => now - a.at <= 14 * 86_400_000).length === 15)
  assert.ok(kept.every((a) => now - a.at <= 8 * 7 * 86_400_000), 'nothing older than 8 weeks')
  assert.ok(kept.length >= 15 + 5 && kept.length <= 15 + 7, `${kept.length} kept`)
  assert.deepEqual(B.toPrune([{ name: 'x', at: now - 400 * 86_400_000 }], now), [], 'a lone old copy stays')
})

test('the weekly restore test reads the newest and the oldest copy and restores one project', async () => {
  const loaded = []
  const r = await B.restoreTest({ now: new Date('2026-11-23T13:00:00Z'), takeTurn: noTurn, say: quiet, loadAndCompare: async (dir, id) => (loaded.push([id, existsSync(path.join(dir, 'project.db'))]), { id }) })
  assert.deepEqual(r.results.map((x) => x.kind), ['newest', 'oldest'])
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0][1], true, 'the project folder handed over holds its database')
  assert.equal(r.results[0].platform.users, 2)
  assert.deepEqual(readdirSync(B.P.work).filter((f) => f !== 'restore'), [])
  assert.ok(!existsSync(path.join(B.P.work, 'restore')), 'no plaintext left after the test')
})

test('the recovery sheet holds the key, is mode 600, and will not overwrite a file', () => {
  const f = path.join(T, 'sheet.html')
  B.recoverySheet(f)
  assert.match(readFileSync(f, 'utf8'), /AGE-SECRET-KEY-1/)
  assert.equal((spawnSync('/usr/bin/stat', ['-f', '%Lp', f], { encoding: 'utf8' }).stdout || '').trim(), '600')
  assert.throws(() => B.recoverySheet(f), /exists/)
})
