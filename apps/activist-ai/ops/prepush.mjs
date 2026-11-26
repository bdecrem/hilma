#!/usr/bin/env node
// The quick gates of an update, run before a push (OLA-449).
//
// Why: on Nov 25 an update of the Studio's Ola was refused four times for things a few seconds on the
// builder's own machine would have shown (the abilities list out of step with the instructions, a skill
// description the skills check rejects, a skills change with the old image tag, a lockfile this Mac's
// npm wrote and the Studio's npm would not install). Each refusal cost a push, a wait and another push,
// while Bart waited for a page. The update's long suites stay on the machine; these do not need it.
//
//   node ops/prepush.mjs            what differs from origin/main (the working tree counts, so it can
//                                   run before the commit); runs only the gates that change touches
//   node ops/prepush.mjs --all      every gate
//
// One line per gate; exits 1 when one fails. .claude/hooks/push-guard.py runs it before `git push`.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALL = process.argv.includes('--all')
// The npm that installs a release on the Studio (Nov 25). A newer npm reads a lockfile more strictly
// than an older one writes it, so the check uses the newest we run anywhere.
const NPM = 'npm@11.20.0'
const git = (...a) => spawnSync('git', a, { cwd: AI, encoding: 'utf8' })
const changed = ALL
  ? null
  : git('diff', '--name-only', 'origin/main', '--', '.').stdout.split('\n').filter(Boolean).map((f) => f.replace(/^apps\/activist-ai\//, ''))
    .concat(git('ls-files', '--others', '--exclude-standard', '--', 'skills', 'workspace', 'evals/asks').stdout.split('\n').filter(Boolean).map((f) => f.replace(/^apps\/activist-ai\//, '')))
const touched = (re) => ALL || changed.some((f) => re.test(f))

const TOLD = /^(workspace\/AGENTS\.md|evals\/asks\/|apple\/OlaKit\/Sources\/OlaKit\/Abilities\.swift)/
// What goes into the project image: a change here needs a new image tag.
const IN_IMAGE = /^(skills\/|workspace\/(AGENTS\.md|opencode-system\.jsonc|ola-[a-z-]+$|plugins\/|door|desk|ola-init))/
const gates = [
  { name: 'the abilities list and the instructions agree', when: TOLD, cmd: ['node', 'evals/asks/abilities.mjs', 'check'], fix: 'node evals/asks/abilities.mjs write' },
  { name: "the request tests' own tests", when: TOLD, cmd: ['node', '--test', 'evals/asks/test.mjs'] },
  { name: 'the skills check', when: /^skills\//, cmd: ['python3', 'skills/check.py'] },
  { name: "the suite selection's tests", when: /^ops\/select/, cmd: ['node', '--test', 'ops/select-test.mjs'] },
  { name: `the lockfile installs with ${NPM}`, when: /^package(-lock)?\.json$/, cmd: ['npx', '--yes', NPM, 'ci', '--dry-run', '--ignore-scripts'], fix: `npx --yes ${NPM} install --package-lock-only --ignore-scripts` },
  { name: `web's lockfile installs with ${NPM}`, when: /^web\/package(-lock)?\.json$/, cmd: ['npx', '--yes', NPM, 'ci', '--dry-run', '--ignore-scripts'], cwd: 'web', fix: `(in web) npx --yes ${NPM} install --package-lock-only --ignore-scripts` },
]

let failed = 0
const line = (ok, name, more = '') => console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${more ? `  (${more})` : ''}`)
for (const g of gates) {
  if (!touched(g.when)) continue
  const r = spawnSync(g.cmd[0], g.cmd.slice(1), { cwd: path.join(AI, g.cwd ?? '.'), encoding: 'utf8', timeout: 180000 })
  const ok = r.status === 0
  if (!ok) failed++
  const last = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split('\n').filter((l) => /error|fail|missing|not ok|differ|✖/i.test(l)).slice(0, 4).join(' / ').slice(0, 400)
  line(ok, g.name, ok ? '' : `${last || `exit ${r.status}`}${g.fix ? `; fix: ${g.fix}` : ''}`)
}
// A change to what the image holds with the tag it had: the update refuses it after building.
if (touched(IN_IMAGE)) {
  const tag = (t) => /ola-workspace:[0-9.]+-\d+/.exec(t ?? '')?.[0] ?? null
  const now = tag(spawnSync('cat', ['workspace/ws.mjs'], { cwd: AI, encoding: 'utf8' }).stdout)
  const was = tag(git('show', 'origin/main:apps/activist-ai/workspace/ws.mjs').stdout)
  const files = ALL ? [] : changed.filter((f) => IN_IMAGE.test(f))
  const ok = ALL || (now && now !== was)
  if (!ok) failed++
  line(ok, 'a change to what the project image holds has a new image tag', ok ? '' : `${files.slice(0, 3).join(', ')} changed and the tag is still ${was}: raise IMAGE in workspace/ws.mjs and add its line at the top of workspace/Containerfile`)
}
if (failed) console.log(`${failed} gate(s) failed: an update would refuse this.`)
process.exit(failed ? 1 : 0)
