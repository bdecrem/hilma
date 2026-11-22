// Who may deploy to staging (OLA-85, ops/signers.mjs): node --test ops/signers-test.mjs.
// A throwaway repository and throwaway ssh keys in a temp folder; no network, no VM, seconds.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { deployable, tagFor } from './signers.mjs'

const dir = mkdtempSync(path.join(tmpdir(), 'ola-signers-'))
test.after(() => rmSync(dir, { recursive: true, force: true }))
const repo = path.join(dir, 'repo')
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (...a) => spawnSync('/usr/bin/git', ['-C', repo, ...a], { encoding: 'utf8', env })
const ok = (r) => assert.equal(r.status, 0, r.stderr)
const key = (name) => {
  const f = path.join(dir, name)
  ok(spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', name, '-f', f], { encoding: 'utf8' }))
  return f
}
const bart = key('bart')
const bot = key('bot')
const signers = path.join(dir, 'allowed-signers')
writeFileSync(signers, `bart@ola namespaces="git" ${readFileSync(`${bart}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ')}\n`)
const as = (k) => ['-c', 'gpg.format=ssh', '-c', `user.signingkey=${k}.pub`]
const commit = (msg, ...sign) => {
  writeFileSync(path.join(repo, 'f'), msg)
  ok(git('add', 'f'))
  ok(git(...sign, 'commit', '-q', '-m', msg))
  return git('rev-parse', 'HEAD').stdout.trim()
}
spawnSync('/usr/bin/git', ['init', '-q', repo], { env })

test('an unsigned commit may not deploy; one signed by a listed key may', () => {
  const plain = commit('plain')
  assert.equal(deployable(git, plain, signers).ok, false)
  const signed = commit('signed', ...as(bart), '-c', 'commit.gpgsign=true')
  assert.deepEqual(deployable(git, signed, signers), { ok: true, how: 'signed commit' })
})

test('a commit signed by a key not on the list may not deploy', () => {
  const c = commit('by the bot', ...as(bot), '-c', 'commit.gpgsign=true')
  const r = deployable(git, c, signers)
  assert.equal(r.ok, false)
  assert.match(r.why, /neither the commit nor a tag/)
})

test("someone else's commit deploys once a listed key signs its ola-deploy tag", () => {
  const c = commit('the runner')
  ok(git(...as(bart), 'tag', '-s', tagFor(c), c, '-m', 'approved'))
  assert.deepEqual(deployable(git, c, signers), { ok: true, how: `signed tag ${tagFor(c)}` })
})

test('a tag signed by another key, an unsigned tag, or a tag on another commit does not count', () => {
  const a = commit('a')
  ok(git(...as(bot), 'tag', '-s', tagFor(a), a, '-m', 'by the bot'))
  assert.match(deployable(git, a, signers).why, /tag .* is not signed by a key/)
  const b = commit('b')
  ok(git('tag', '-a', tagFor(b), b, '-m', 'unsigned'))
  assert.equal(deployable(git, b, signers).ok, false)
  const c = commit('c')
  const d = commit('d')
  ok(git(...as(bart), 'tag', '-s', tagFor(c), d, '-m', 'name says c, points at d'))
  assert.equal(deployable(git, c, signers).ok, false)
})

test('no list, or an empty one, deploys nothing', () => {
  const c = commit('x', ...as(bart), '-c', 'commit.gpgsign=true')
  assert.equal(deployable(git, c, path.join(dir, 'nope')).ok, false)
  const empty = path.join(dir, 'empty')
  writeFileSync(empty, '# nobody yet\n')
  assert.match(deployable(git, c, empty).why, /lists no key/)
})

// OLA-279: ola.mjs deploy serves only for a named caller
import { DEPLOY_CALLERS, deployCaller } from './signers.mjs'
test('an update starts only through runner.mjs deploy or the Studio install; by hand is refused', () => {
  assert.deepEqual(DEPLOY_CALLERS, ['runner.mjs deploy', 'studio setup.sh'])
  assert.deepEqual(deployCaller({ OLA_DEPLOY_VIA: 'runner.mjs deploy' }), { ok: true, via: 'runner.mjs deploy' })
  assert.equal(deployCaller({ OLA_DEPLOY_VIA: 'studio setup.sh' }).ok, true)
  const hand = deployCaller({})
  assert.equal(hand.ok, false)
  assert.equal(hand.via, 'by hand')
  assert.match(hand.why, /runner\.mjs deploy/)
  for (const v of ['', ' ', 'runner.mjs', 'RUNNER.MJS DEPLOY', 'kit', 'by hand']) assert.equal(deployCaller({ OLA_DEPLOY_VIA: v }).ok, false, v)
  assert.equal(deployCaller({ OLA_DEPLOY_VIA: ' runner.mjs deploy ' }).ok, true, 'surrounding spaces are not a different caller')
})
test('ola.mjs deploy by hand exits 3 and touches nothing but deploy-refusals.log', () => {
  const st = mkdtempSync(path.join(tmpdir(), 'ola-gate-'))
  const env = { ...process.env, OLA_STAGING: st }
  delete env.OLA_DEPLOY_VIA
  const r = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), 'ola.mjs'), 'deploy', '--unsigned'], { encoding: 'utf8', env, timeout: 30e3 })
  assert.equal(r.status, 3, r.stderr)
  assert.match(r.stderr, /Refused: the test server is updated only with node scripts\/venture\/runner\.mjs deploy/)
  assert.deepEqual(readdirSync(st), ['deploy-refusals.log'])
  assert.match(readFileSync(path.join(st, 'deploy-refusals.log'), 'utf8'), / refused origin\/main via by hand: /)
  const r2 = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), 'ola.mjs'), 'deploy'], { encoding: 'utf8', env: { ...env, OLA_DEPLOY_VIA: 'kit' }, timeout: 30e3 })
  assert.equal(r2.status, 3)
  assert.match(readFileSync(path.join(st, 'deploy-refusals.log'), 'utf8'), /via kit: .*"kit" is not one of/)
  rmSync(st, { recursive: true, force: true })
})
