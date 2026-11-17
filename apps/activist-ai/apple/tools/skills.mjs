// Ola's skills in the Mac app: the release rule, in code (README, "Every release").
//
//   node tools/skills.mjs stage [dest]     copy apps/activist-ai/skills fresh into dest (default
//                                          build/OlaSkills, what project.yml bundles) with VERSION.json
//   node tools/skills.mjs verify <folder>  the skills in <folder> (a built app's Resources/OlaSkills,
//                                          or a staged copy) are exactly apps/activist-ai/skills at
//                                          HEAD; exit 1, and say why, if not
//
// The hash is skills/version.mjs's, the one the workspace image is labeled with and the deploy
// records, so the Mac app and the Ola machine can be compared. A build refuses when the skills
// folder has changes that are not committed: the version names a commit, and must be that commit.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SKILLS_DIR, skillFolders, skillsHash } from '../../skills/version.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const apple = path.join(here, '..')
const git = (...a) => spawnSync('git', ['-C', SKILLS_DIR, ...a], { encoding: 'utf8' })
const die = (m) => {
  console.error(`skills: ${m}`)
  process.exit(1)
}

/** The skills folder as committed at HEAD: its hash and the commit. */
function atHead() {
  const commit = git('rev-parse', 'HEAD').stdout.trim()
  if (!commit) die('not in a git checkout, so the skills cannot be tied to a commit')
  const top = git('rev-parse', '--show-toplevel').stdout.trim()
  const rel = path.relative(top, SKILLS_DIR)
  const t = mkdtempSync(path.join(tmpdir(), 'ola-skills-head-'))
  try {
    const r = spawnSync('/bin/sh', ['-c', 'git -C "$1" archive "$2" "$3" | tar -x -C "$4"', 'sh', top, commit, rel, t])
    if (r.status !== 0) die(`could not read ${rel} at ${commit.slice(0, 12)}`)
    return { commit, hash: skillsHash(path.join(t, rel)) }
  } finally {
    rmSync(t, { recursive: true, force: true })
  }
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'stage') {
  const dest = path.resolve(arg ?? path.join(apple, 'build/OlaSkills'))
  const head = atHead()
  const now = skillsHash()
  if (now !== head.hash) die(`apps/activist-ai/skills has changes that are not committed (${now} here, ${head.hash} at ${head.commit.slice(0, 12)}). Commit them first: a release carries committed skills only.`)
  rmSync(dest, { recursive: true, force: true })
  for (const s of skillFolders()) cpSync(path.join(SKILLS_DIR, s), path.join(dest, s), { recursive: true, filter: (src) => !/[\\/](__pycache__|\.DS_Store)([\\/]|$)/.test(src) })
  const staged = skillsHash(dest)
  if (staged !== head.hash) die(`the staged copy hashes to ${staged}, the commit's skills to ${head.hash}`)
  writeFileSync(path.join(dest, 'VERSION.json'), JSON.stringify({ hash: staged, commit: head.commit, skills: skillFolders(dest), staged: new Date().toISOString() }, null, 2) + '\n')
  console.log(`skills: staged ${skillFolders(dest).length} skills, ${staged} (commit ${head.commit.slice(0, 12)}) in ${path.relative(process.cwd(), dest) || dest}`)
} else if (cmd === 'verify') {
  if (!arg || !existsSync(arg)) die(`no bundled skills at ${arg ?? '(no folder given)'}: the build did not carry them`)
  const head = atHead()
  const got = skillsHash(arg)
  let v = {}
  try {
    v = JSON.parse(readFileSync(path.join(arg, 'VERSION.json'), 'utf8'))
  } catch {
    die(`${arg} has no VERSION.json`)
  }
  if (got !== head.hash) die(`the bundled skills (${got}) differ from apps/activist-ai/skills at ${head.commit.slice(0, 12)} (${head.hash}). Not shipping that build.`)
  if (v.hash !== got || v.commit !== head.commit) die(`the bundle's VERSION.json says ${v.hash} at ${String(v.commit).slice(0, 12)}; it holds ${got} and HEAD is ${head.commit.slice(0, 12)}`)
  console.log(`skills: the build carries ${v.skills.length} skills, ${got}, the same as apps/activist-ai/skills at ${head.commit.slice(0, 12)}`)
} else {
  console.error('usage: node tools/skills.mjs stage [dest] | verify <folder>')
  process.exit(2)
}
