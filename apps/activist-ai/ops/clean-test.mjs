// The disk clean's tests (OLA-135): node --test ops/clean-test.mjs (a few seconds, any Mac).
// Each runs the real `node ops/ola.mjs clean [--dry]` as a child process against a temporary home
// (HOME, TMPDIR, OLA_HOME, OLA_STAGING, the turn's files) and a fake `container` CLI that keeps
// its images, containers and builder in a JSON file and logs every call. Nothing on this machine
// is read or deleted but the fakes.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const T = mkdtempSync(path.join(tmpdir(), 'ola-clean-test-'))
const H = path.join(T, 'home')
const TMP = path.join(T, 'tmp')
const BIN = path.join(T, 'bin')
const STATE = path.join(T, 'ctr.json')
const CALLS = path.join(T, 'ctr.log')
const STAGING = path.join(H, 'ola-staging')
const STORE = path.join(H, 'Library/Application Support/com.apple.container')
const OLD = Date.now() / 1000 - 3 * 86400

// The container CLI: `ls -a`, `image ls [-v]`, `image delete`, `builder status|stop|delete`.
const FAKE = `#!/usr/bin/env node
const fs = require('fs')
const s = JSON.parse(fs.readFileSync(${JSON.stringify(STATE)}, 'utf8'))
const a = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(CALLS)}, a.join(' ') + '\\n')
const save = () => fs.writeFileSync(${JSON.stringify(STATE)}, JSON.stringify(s))
const k = a.join(' ')
if (k === 'ls -a') {
  console.log('ID  IMAGE  OS  ARCH  STATE')
  for (const c of s.containers) console.log(c.id + '  docker.io/library/' + c.image + '  linux  arm64  ' + c.state)
} else if (k === 'image ls' || k === 'image ls -v') {
  console.log('NAME  TAG  DIGEST')
  for (const i of s.images) { const [n, t] = i.split(':'); console.log(k.endsWith('-v') ? n + '  ' + t + '  abc  linux  arm64  v8  2.5 GB  2026-11-01' : n + '  ' + t + '  abc') }
} else if (a[0] === 'image' && a[1] === 'delete') {
  if (s.containers.some((c) => c.image === a[2])) { console.error('image in use'); process.exit(1) }
  s.images = s.images.filter((i) => i !== a[2]); save()
} else if (k === 'builder stop') { s.builderState = 'stopped'; save() }
else if (k === 'builder delete') { s.builder = false; fs.rmSync(${JSON.stringify(path.join(STORE, 'containers/buildkit'))}, { recursive: true, force: true }); save() }
else if (k === 'builder status') { if (s.builder) console.log('ID IMAGE STATE\\nbuildkit builder ' + s.builderState) }
else { console.error('fake container: ' + k); process.exit(2) }
`

const env = (extra = {}) => ({
  PATH: process.env.PATH,
  HOME: H,
  TMPDIR: TMP,
  OLA_HOME: path.join(H, '.ola'),
  OLA_STAGING: STAGING,
  OLA_CONTAINER_BIN: path.join(BIN, 'container'),
  OLA_CONTAINER_STORE: STORE,
  OLA_CLEAN_BUILDER_GB: String(64 / 1024 / 1024), // 64 KB stands for 15 GB
  ...extra,
})
function run(args = [], extra = {}) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'ola.mjs'), 'clean', ...args], { env: env(extra), encoding: 'utf8', cwd: T })
  return { code: r.status, out: r.stdout + r.stderr, calls: existsSync(CALLS) ? readFileSync(CALLS, 'utf8') : '', ctr: JSON.parse(readFileSync(STATE, 'utf8')) }
}
/** Ages a tree: every file and folder in it last changed 3 days ago. */
function age(p, t = OLD) {
  if (statSync(p).isDirectory()) for (const n of readdirSync(p)) age(path.join(p, n), t)
  utimesSync(p, t, t)
}
const put = (p, text = 'x') => (mkdirSync(path.dirname(p), { recursive: true }), writeFileSync(p, text))
const release = (c, image) => put(path.join(STAGING, 'releases', c, 'apps/activist-ai/workspace/ws.mjs'), `export const IMAGE = '${image}'\n`)
const C = { cur: 'aaaaaaaaaaaa', prev: 'bbbbbbbbbbbb', old1: 'cccccccccccc', old2: 'dddddddddddd', door: 'eeeeeeeeeeee' }

beforeEach(() => {
  rmSync(H, { recursive: true, force: true })
  rmSync(TMP, { recursive: true, force: true })
  rmSync(CALLS, { force: true })
  mkdirSync(BIN, { recursive: true })
  writeFileSync(path.join(BIN, 'container'), FAKE)
  chmodSync(path.join(BIN, 'container'), 0o755)
  mkdirSync(TMP, { recursive: true })
  mkdirSync(path.join(STAGING, '.git'), { recursive: true })
  release(C.cur, 'ola-workspace:2.3.0-36')
  release(C.prev, 'ola-workspace:2.3.0-35')
  release(C.old1, 'ola-workspace:2.3.0-34')
  release(C.old2, 'ola-workspace:2.3.0-33')
  release(C.door, 'ola-workspace:2.3.0-32')
  symlinkSync(`releases/${C.cur}`, path.join(STAGING, 'current'))
  writeFileSync(path.join(STAGING, 'deployed.json'), JSON.stringify({ commit: C.cur + '0000', previous: C.prev + '1111' }))
  // A workspace's door still runs from an older release.
  put(path.join(H, '.ola/launchd/cx.ola.door.w1.plist'), `<string>${STAGING}/releases/${C.door}/apps/activist-ai/workspace/door.mjs</string>`)
  writeFileSync(STATE, JSON.stringify({
    images: ['alpine:3.20', 'debian:bookworm-slim', 'ola-workspace:2.3.0-30', 'ola-workspace:2.3.0-31', 'ola-workspace:2.3.0-33', 'ola-workspace:2.3.0-35', 'ola-workspace:2.3.0-36', 'ola-workspace:2.3.0-37', 'ola-workspace:2.3.0-29-building'],
    containers: [{ id: 'ola-stage-a', image: 'ola-workspace:2.3.0-30', state: 'stopped' }, { id: 'ola-hello', image: 'ola-workspace:2.3.0-35', state: 'running' }, { id: 'ola-zz-a', image: 'ola-workspace:2.3.0-36', state: 'stopped' }],
    builder: true,
    builderState: 'running',
  }))
  put(path.join(STORE, 'containers/buildkit/rootfs.ext4'), 'b'.repeat(200 * 1024))

  // The home folder: what must go, what must stay.
  put(path.join(H, 'ola-old/apps/activist-ai/ops/ola.mjs')) // a builder's rsync copy: goes
  put(path.join(H, 'ola-fx/activist-ai/ops/ola.mjs')) // an older-style copy: goes
  put(path.join(H, 'ola-ws/apps/activist-ai/workspace/ws.mjs')) // a copy from before ops/ existed: goes
  put(path.join(H, 'ola-rot-scratch/repro.sh')) // goes
  put(path.join(H, '.ola-check-cq/gateway-tokens')) // goes
  put(path.join(H, '.ola-fdcheck-o139/ws/.keep')) // goes (its ws/ names no container)
  put(path.join(H, '.ola-fdcheck-zz/ws/zz-a/meta.json')) // stays: container ola-zz-a exists
  put(path.join(H, '.ola-cq-live/x')) // goes
  put(path.join(H, '.ola-rev4/x')) // goes
  put(path.join(H, 'ola-deploy-kit3.out')) // goes
  put(path.join(H, 'ola-new/apps/activist-ai/ops/ola.mjs')) // stays: changed today
  put(path.join(H, 'ola-notola/readme.txt')) // stays: not a copy of Ola
  put(path.join(H, 'ola-busy/apps/activist-ai/ops/ola.mjs')) // stays: a process works in it
  put(path.join(H, 'ola-bart/project.db')) // never
  put(path.join(H, 'ola-evals/hilma/apps/activist-ai/ops/ola.mjs')) // never
  put(path.join(H, '.ola/gateway.env'), 'K=v') // never
  put(path.join(H, '.ola-bart/x')) // never
  put(path.join(H, '.ola-frontdesk/platform.db')) // never
  put(path.join(H, 'GAMI/gami.db')) // never
  put(path.join(H, 'almanac/server.mjs')) // never
  put(path.join(H, 'hilma-deploy/apps/almanac/x')) // never
  put(path.join(H, 'hilma-venture/apps/activist-ai/ops/ola.mjs')) // never
  put(path.join(H, 'Documents/code/hilma/x')) // never
  put(path.join(H, 'container-installer.pkg')) // not on the allowlist
  put(path.join(H, 'fdcheck.log')) // not on the allowlist
  put(path.join(H, 'notes.md')) // not on the allowlist
  put(path.join(H, 'ola-ship/ola-mac.xcarchive.tgz')) // goes
  put(path.join(H, 'ola-ship/ola-ios.xcarchive/Info.plist')) // goes
  put(path.join(H, 'ola-ship/dd-ola-mac/x')) // stays: the build cache
  put(path.join(TMP, 'ola-check-08iDIM/x')) // goes
  put(path.join(TMP, 'ola-image-Ab12Cd/Dockerfile')) // goes
  put(path.join(TMP, 'someone-else-Ab12Cd/x')) // not on the allowlist
  for (const n of readdirSync(H)) if (n !== 'ola-new' && n !== 'ola-staging' && n !== 'Library') age(path.join(H, n))
  for (const n of readdirSync(TMP)) age(path.join(TMP, n))
})
after(() => rmSync(T, { recursive: true, force: true }))

const GONE = ['ola-old', 'ola-fx', 'ola-ws', 'ola-rot-scratch', '.ola-check-cq', '.ola-fdcheck-o139', '.ola-cq-live', '.ola-rev4', 'ola-deploy-kit3.out', 'ola-ship/ola-mac.xcarchive.tgz', 'ola-ship/ola-ios.xcarchive']
const STAY = ['ola-new', 'ola-notola', 'ola-busy', '.ola-fdcheck-zz', 'ola-bart', 'ola-evals', '.ola', '.ola-bart', '.ola-frontdesk', 'GAMI', 'almanac', 'hilma-deploy', 'hilma-venture', 'Documents', 'container-installer.pkg', 'fdcheck.log', 'notes.md', 'ola-ship/dd-ola-mac', 'ola-staging/current', 'ola-staging/.git']

test('clean: the keep rules for images, releases, the builder and the leftovers', async () => {
  const busy = spawn('/bin/sleep', ['30'], { cwd: path.join(H, 'ola-busy'), stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 300))
  const r = run()
  busy.kill()
  assert.equal(r.code, 0, r.out)
  // Images: the current (36) and previous (35) releases', the containers' (30, 35, 36), newer
  // than current (37), and never the base images; 31, 33 and a dead -building tag go.
  assert.deepEqual(r.ctr.images.sort(), ['alpine:3.20', 'debian:bookworm-slim', 'ola-workspace:2.3.0-30', 'ola-workspace:2.3.0-35', 'ola-workspace:2.3.0-36', 'ola-workspace:2.3.0-37'])
  assert.match(r.calls, /image delete ola-workspace:2\.3\.0-31\n/)
  assert.doesNotMatch(r.calls, /image delete (alpine|debian)/)
  // Releases: current, previous and the one a door runs from.
  assert.deepEqual(readdirSync(path.join(STAGING, 'releases')).sort(), [C.cur, C.prev, C.door].sort())
  // The builder held more than the limit and nothing was building.
  assert.equal(r.ctr.builder, false)
  assert.match(r.calls, /builder stop\nbuilder delete\n/)
  for (const p of GONE) assert.ok(!existsSync(path.join(H, p)), `${p} should be gone\n${r.out}`)
  for (const p of STAY) assert.ok(existsSync(path.join(H, p)), `${p} should stay\n${r.out}`)
  assert.ok(!existsSync(path.join(TMP, 'ola-check-08iDIM')) && !existsSync(path.join(TMP, 'ola-image-Ab12Cd')))
  assert.ok(existsSync(path.join(TMP, 'someone-else-Ab12Cd')))
  assert.match(r.out, /keep ~\/ola-busy: a running process/)
  assert.match(r.out, /keep ~\/\.ola-fdcheck-zz: container ola-zz-a exists/)
  assert.match(r.out, /^freed /m)
  // No container JSON (it carries each project's passwords) was ever asked for.
  assert.doesNotMatch(r.calls, /--format|inspect/)
})

test('clean --dry: says the same, changes nothing', () => {
  const before = readFileSync(STATE, 'utf8')
  const r = run(['--dry'])
  assert.equal(r.code, 0, r.out)
  assert.equal(readFileSync(STATE, 'utf8'), before)
  assert.doesNotMatch(r.calls, /delete|stop/)
  assert.equal(readdirSync(path.join(STAGING, 'releases')).length, 5)
  for (const p of [...GONE, ...STAY]) assert.ok(existsSync(path.join(H, p)), `${p} was touched by --dry`)
  assert.match(r.out, /would delete image ola-workspace:2\.3\.0-31/)
  assert.match(r.out, new RegExp(`would delete release ${C.old1}`))
  assert.match(r.out, /would delete ~\/ola-old /)
  assert.match(r.out, /builder: .*would delete it/)
  assert.match(r.out, /^would free about /m)
})

test('the allowlist: only its patterns, never the never-list, never a git clone with work in it', () => {
  // A clone with an uncommitted file stays; a clean one goes.
  for (const [n, dirty] of [['ola-gitdirty', true], ['ola-gitclean', false]]) {
    const d = path.join(H, n)
    mkdirSync(d)
    const g = (...a) => spawnSync('/usr/bin/git', ['-C', d, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
    g('init', '-q')
    put(path.join(d, 'apps/activist-ai/ops/ola.mjs'))
    g('add', '.')
    g('commit', '-qm', 'x')
    // A remote branch at the same commit, so nothing is unpushed.
    g('update-ref', 'refs/remotes/origin/main', 'HEAD')
    if (dirty) put(path.join(d, 'apps/activist-ai/new-work.mjs'))
    age(d)
  }
  const r = run()
  assert.equal(r.code, 0, r.out)
  assert.ok(existsSync(path.join(H, 'ola-gitdirty')), r.out)
  assert.match(r.out, /keep ~\/ola-gitdirty: uncommitted or untracked files/)
  assert.ok(!existsSync(path.join(H, 'ola-gitclean')), r.out)
  // Every entry left in the home folder is one no rule names, or one the never-list protects.
  for (const p of STAY.filter((p) => p !== 'ola-busy')) assert.ok(existsSync(path.join(H, p)), `${p} should stay`)
})

test('the allowlist as written: its patterns match the builders\' names and nothing protected', async () => {
  const { ALLOW, NEVER } = await import('./clean.mjs')
  const home = (n) => ALLOW.some((a) => a.where === 'home' && a.re.test(n))
  for (const n of ['ola-rot', 'ola-w', 'ola-150', 'ola-bold', 'ola-rot-scratch', '.ola-check', '.ola-check-rot', '.ola-fdcheck-o139', '.ola-cq-live', '.ola-wcc', '.ola-cloudcheck', 'ola-deploy-kit.out']) assert.ok(home(n), n)
  for (const n of ['.ola', '.ola-bart', '.ola-frontdesk', '.ola-turns', 'GAMI', 'almanac', 'hilma-deploy', 'hilma-venture', 'Documents', 'Library', 'Desktop', '.ssh', 'takt-ship', 'ts-ship', 'container-installer.pkg', 'ola-deploy-kit.sh']) assert.ok(!home(n) || NEVER.has(n), n)
  for (const n of ['ola-staging', 'ola-bart', 'ola-evals', 'ola-ship']) assert.ok(NEVER.has(n), n)
})

test('images and the builder wait while someone else holds the test turn; releases while a deploy runs', async () => {
  const holderProc = spawn('/bin/sleep', ['30'], { stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 200))
  mkdirSync(path.join(H, 'ola-suite.lock'))
  writeFileSync(path.join(H, 'ola-suite.lock/owner'), `pid ${holderProc.pid} OLA-1 suites`)
  writeFileSync(path.join(STAGING, 'deploy.lock'), String(holderProc.pid))
  const r = run()
  holderProc.kill()
  assert.equal(r.code, 0, r.out)
  assert.doesNotMatch(r.calls, /image delete|builder/)
  assert.equal(readdirSync(path.join(STAGING, 'releases')).length, 5)
  assert.match(r.out, /images and builder: left alone, a deploy is running/)
  assert.match(r.out, /releases: left alone, a deploy is running/)
  // With only the turn held (no deploy): images and builder still wait, releases go.
  rmSync(path.join(STAGING, 'deploy.lock'))
  const h2 = spawn('/bin/sleep', ['30'], { stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 200))
  writeFileSync(path.join(H, 'ola-suite.lock/owner'), `pid ${h2.pid} OLA-1 suites`)
  const r2 = run()
  h2.kill()
  assert.match(r2.out, /left alone, the test turn is held by OLA-1 suites/)
  assert.doesNotMatch(r2.calls, /image delete|builder/)
  assert.equal(readdirSync(path.join(STAGING, 'releases')).length, 3)
})

test('the builder is kept while a build runs, and under the limit', async () => {
  // A build in progress: a process whose command is `container build ...`.
  const fake = path.join(T, 'container')
  writeFileSync(fake, '#!/bin/sh\nsleep 30\n')
  chmodSync(fake, 0o755)
  const b = spawn(fake, ['build', '-t', 'ola-workspace:2.3.0-38-building', '.'], { stdio: 'ignore', detached: true })
  await new Promise((r) => setTimeout(r, 300))
  const r = run()
  process.kill(-b.pid) // the script and its sleep
  assert.match(r.out, /builder: .*a build is running/)
  assert.doesNotMatch(r.calls, /builder (stop|delete)/)
  assert.match(r.out, /ola-workspace:2\.3\.0-29-building \(being built\)/)
  assert.ok(r.ctr.images.includes('ola-workspace:2.3.0-29-building'))
  const r2 = run([], { OLA_CLEAN_BUILDER_GB: '15' })
  assert.match(r2.out, /builder: 200 KB, under 15 GB, kept/)
  assert.equal(r2.ctr.builder, true)
})

test('the alarm still never texts about the disk by default (DISK_TEXTS false)', async () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import { settings } from ${JSON.stringify(path.join(HERE, 'watch.mjs'))}; console.log(settings().DISK_TEXTS)`], { env: env(), encoding: 'utf8' })
  assert.equal(r.stdout.trim(), 'false', r.stderr)
})
