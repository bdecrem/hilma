// Who may put a commit on staging (OLA-85). The practice copy runs only what Bart's key vouched
// for: origin/main is a public repo that unattended agents push to from the mini (the Discord bot
// and the venture runner, one author name), so passing the suites is not proof anyone meant it.
//
// A commit is deployable when either
//   - the commit itself is signed by a key in ~/.ola/allowed-signers, or
//   - a signed tag  ola-deploy/<commit12>  points at it, signed by a key in that file.
// The tag is how a commit someone else made (the runner's, a builder's) is approved: Bart's Mac
// runs `approve`, which signs one small tag and pushes it; nothing in the history is rewritten.
//
// On Bart's Mac, in a clone of hilma:
//   node apps/activist-ai/ops/signers.mjs setup          make ~/.ssh/ola_signing (if missing), make
//                                                        this clone sign its commits with it, print
//                                                        the line for ~/.ola/allowed-signers
//   node apps/activist-ai/ops/signers.mjs approve [ref]  sign ola-deploy/<commit12> for ref (default
//                                                        origin/main, fetched first) and push the tag
//   node apps/activist-ai/ops/signers.mjs line           print the allowed-signers line again
// On the staging machine:
//   node ops/signers.mjs verify <ref>                    say whether ref may deploy, and why
//
// The private key never leaves the Mac it was made on; the staging machine holds only the public
// line. allowed-signers format: `bart@ola namespaces="git" ssh-ed25519 AAAA…`.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TAG_PREFIX = 'ola-deploy/'
export const tagFor = (commit) => `${TAG_PREFIX}${commit.slice(0, 12)}`

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })

// git: (...args) => spawnSync result, already bound to the repository.
// Returns { ok, how } (how: 'signed commit' | 'signed tag ola-deploy/…') or { ok: false, why }.
export function deployable(git, commit, signersFile) {
  if (!signersFile || !existsSync(signersFile)) return { ok: false, why: `${signersFile} is missing` }
  const lines = readFileSync(signersFile, 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
  if (!lines.length) return { ok: false, why: `${signersFile} lists no key` }
  const cfg = ['-c', `gpg.ssh.allowedSignersFile=${signersFile}`]
  if (git(...cfg, 'verify-commit', commit).status === 0) return { ok: true, how: 'signed commit' }
  const tag = tagFor(commit)
  const t = git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`)
  if (t.status === 0 && t.stdout.trim() === commit) {
    if (git(...cfg, 'verify-tag', tag).status === 0) return { ok: true, how: `signed tag ${tag}` }
    return { ok: false, why: `the tag ${tag} is not signed by a key in ${signersFile}` }
  }
  return { ok: false, why: `neither the commit nor a tag ${tag} is signed by a key in ${signersFile}` }
}

const KEY = process.env.OLA_SIGNING_KEY || path.join(homedir(), '.ssh', 'ola_signing')

function line() {
  if (!existsSync(`${KEY}.pub`)) throw new Error(`${KEY}.pub is missing: run setup first`)
  const [type, b64] = readFileSync(`${KEY}.pub`, 'utf8').trim().split(/\s+/)
  return `bart@ola namespaces="git" ${type} ${b64}`
}

function repoRoot() {
  const r = run('git', ['rev-parse', '--show-toplevel'])
  if (r.status !== 0) throw new Error('run this inside a clone of hilma')
  return r.stdout.trim()
}

function setup() {
  if (!existsSync(KEY)) {
    // No passphrase: the key is made for this Mac's own sessions to sign with; it never leaves it.
    const k = run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'ola deploy signing', '-f', KEY])
    if (k.status !== 0) throw new Error(`ssh-keygen: ${k.stderr.trim()}`)
    console.log(`made ${KEY}`)
  } else console.log(`${KEY} already there`)
  const root = repoRoot()
  for (const [k, v] of [['gpg.format', 'ssh'], ['user.signingkey', `${KEY}.pub`], ['commit.gpgsign', 'true'], ['tag.gpgsign', 'true']]) {
    const r = run('git', ['-C', root, 'config', '--local', k, v])
    if (r.status !== 0) throw new Error(`git config ${k}: ${r.stderr.trim()}`)
  }
  console.log(`${root} now signs its commits and tags with it`)
  console.log('the line for ~/.ola/allowed-signers on the staging machine:')
  console.log(line())
}

function approve(ref = 'origin/main') {
  const root = repoRoot()
  const g = (...a) => run('git', ['-C', root, ...a])
  if (ref.startsWith('origin/')) {
    const f = g('fetch', '--quiet', 'origin')
    if (f.status !== 0) throw new Error(`git fetch: ${f.stderr.trim()}`)
  }
  const r = g('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
  if (r.status !== 0) throw new Error(`${ref} is not a commit here`)
  const commit = r.stdout.trim()
  const tag = tagFor(commit)
  const subject = g('log', '-1', '--format=%s', commit).stdout.trim()
  const t = g('-c', 'gpg.format=ssh', '-c', `user.signingkey=${KEY}.pub`, 'tag', '-s', '-f', tag, commit, '-m', `approved for staging: ${subject.slice(0, 200)}`)
  if (t.status !== 0) throw new Error(`git tag: ${t.stderr.trim()}`)
  const p = g('push', '--quiet', '--force', 'origin', `refs/tags/${tag}`)
  if (p.status !== 0) throw new Error(`git push: ${p.stderr.trim()}`)
  console.log(`approved ${commit.slice(0, 12)} (${subject.slice(0, 80)}): tag ${tag} pushed`)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [cmd, arg] = process.argv.slice(2)
  try {
    if (cmd === 'setup') setup()
    else if (cmd === 'approve') approve(arg)
    else if (cmd === 'line') console.log(line())
    else if (cmd === 'verify') {
      const staging = process.env.OLA_STAGING || path.join(homedir(), 'ola-staging')
      const signers = path.join(process.env.OLA_HOME || path.join(homedir(), '.ola'), 'allowed-signers')
      const git = (...a) => run('/usr/bin/git', ['-C', staging, ...a])
      git('fetch', '--quiet', '--tags', 'origin')
      const c = git('rev-parse', '--verify', '--quiet', `${arg || 'origin/main'}^{commit}`)
      if (c.status !== 0) throw new Error(`${arg} is not a commit in ${staging}`)
      const v = deployable(git, c.stdout.trim(), signers)
      console.log(v.ok ? `ok: ${v.how}` : `no: ${v.why}`)
      process.exit(v.ok ? 0 : 1)
    } else {
      console.error('usage: node ops/signers.mjs setup | approve [ref] | line | verify [ref]')
      process.exit(2)
    }
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
