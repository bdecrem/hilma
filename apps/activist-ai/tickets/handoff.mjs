#!/usr/bin/env node
// The hand-off (OLA-300): Kit gives a ticket of our own tracker to Ola, and the result comes back as a
// local branch and a patch that the lead reviews. A ticket is marked for Ola by its `who`:
//   node scripts/venture/issues.mjs edit OLA-n --who ola
// or it is claimed by the builder who runs the hand-off (--claimed <who>, e.g. builder).
//
//   node apps/activist-ai/tickets/handoff.mjs list                    open tickets marked for Ola
//   node apps/activist-ai/tickets/handoff.mjs run OLA-n --test "<cmd>" [--test "<cmd>" ...] [--claimed <who>]
//        [--model <alias>] [--time 2400] [--tokens 4000000] [--max-usd 10] [--dry]
//
// run: the ticket and its whole thread (issues.mjs show) become the request. origin/main is exported
// into ~/ola-trials/handoff/OLA-n-<time>/work (its own git, no link to this checkout); Ola's opencode
// works there on the ticket model (models.json `_ticket_model`, the trial's winner), in the same
// sandbox as the trial (lib.mjs: no home folder, loopback only, its own gateway, no secret in
// reach). The run stops itself at --tokens or --max-usd, whichever comes first (lib.mjs overLimit).
// After it stops, each --test runs in the same sandbox on Ola's copy (the commands the ticket's
// folder names; a hand-off without one is refused, since the tests are what decide). Ola's change
// is then put on the LOCAL branch ola/OLA-n of this clone, from the exact main it started from, and
// written as <run>/change.patch. Nothing is pushed and main is never touched: the lead fetches the
// branch (git fetch <this machine>:<this clone> ola/OLA-n), reviews it, runs the checks and merges.
// A comment on the ticket says the branch, the files, the tests, the cost and Ola's own words.
// --dry: everything but the comment.
import { writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { hostname } from 'node:os'
import { MODELS, repo, root, sh, q, freeGb, MIN_FREE_GB, runFolders, opencodeConfig, runOpencode, runTest, gatewayToken, cost, tracker } from './lib.mjs'

const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) }
const flags = (n) => argv.flatMap((x, i) => (x === `--${n}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []))
const issues = (...args) => tracker(args) // an argument list, never a shell line (lib.mjs tracker)
const die = (m) => { console.error(m); process.exit(2) }

if (argv[0] === 'list') {
  const mine = issues('list').split('\n').filter((l) => /^OLA-\d+ +P\d +(next|doing) +\S+ +ola +/.test(l))
  console.log(mine.length ? mine.join('\n') : 'no open ticket is marked for Ola (issues.mjs edit OLA-n --who ola)')
  process.exit(0)
}
if (argv[0] !== 'run' || !/^OLA-\d+$/.test(argv[1] || '')) die('usage: handoff.mjs list | run OLA-n --test "<cmd>" [--claimed <who>] [--model <alias>] [--time s] [--tokens n] [--max-usd n] [--dry]')

const id = argv[1]
const model = flag('model', MODELS._ticket_model)
if (!model || !MODELS[model] || model.startsWith('_')) die(`no ticket model: --model <one of ${Object.keys(MODELS).filter((k) => !k.startsWith('_')).join(', ')}>, or set _ticket_model in models.json`)
const dry = flag('dry', false) === true
const tests = flags('test')
if (!tests.length) die('--test "<cmd>" is required (one per command): the ticket\'s tests decide whether Ola\'s change works')
const show = issues('show', id)
const who = (show.split('\n').find((l) => l.startsWith('area ')) || '').split(' · ').pop()?.trim()
const claimed = flag('claimed', '')
if (!dry && who !== 'ola' && !(claimed && who === claimed)) die(`${id} is held by "${who}": only a ticket marked for Ola (issues.mjs edit ${id} --who ola), or claimed by the one running this (--claimed ${who}), is handed off`)
const tokenLimit = Number(flag('tokens', 4000000))
const usdLimit = Number(flag('max-usd', 10))
if (!(usdLimit > 0)) die('--max-usd must be a positive number of dollars')
const free = freeGb()
if (free < MIN_FREE_GB + 2) die(`only ${free.toFixed(1)} GB free; a hand-off needs ${MIN_FREE_GB + 2} (nothing started)`)

sh('git fetch -q origin main', repo)
const base = sh('git rev-parse origin/main', repo).trim()
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const run = runFolders(path.join(root, 'handoff', `${id}-${stamp}`))
sh(`git -C ${q(repo)} archive ${base} | tar -x -C ${q(run.work)}`)
sh(`ln -s ${q(path.join(repo, 'node_modules'))} node_modules && ln -s ${q(path.join(repo, 'apps/activist-ai/node_modules'))} apps/activist-ai/node_modules`, run.work)
writeFileSync(path.join(run.work, 'opencode.jsonc'), JSON.stringify(opencodeConfig(model), null, 2))
sh(`printf 'node_modules\\nopencode.jsonc\\n' >> .git-info-exclude; git init -q && mv .git-info-exclude .git/info/exclude && git add -A && git commit -qm base`, run.work)

const request = `You are Ola, building a ticket of our own tracker. Kit, the lead, reviews your change, runs its checks and merges it; a checker then checks it on the live thing.

The ticket, with its whole thread (comments from Bart are instructions):

${show}

The tests that decide it (they run after you stop; make them pass, and add to them where the ticket needs a new behavior tested): ${tests.join('; ')}

How to work:
- Read the repo's CLAUDE.md first, then the CLAUDE.md and README of every folder you touch. Follow their conventions.
- Make the change the ticket asks for, and only that. Small, plain code in the style of the files around it.
- Run the tests above yourself, and add a test for the new behavior in the folder's test file. There is no network here except your model; a check that needs the network or the live server is left for Kit, and you say so.
- Never print or read a secret; there is none here to read.
- When it is done: commit with git, one commit, its message a plain sentence of what changed ending in [${id}]. Then say in at most five sentences what you changed, which tests you ran with their counts, and what is left for Kit.`
writeFileSync(path.join(run.dir, 'request.md'), request)

console.log(`${id}: Ola on ${model} (${MODELS[model].id}) in ${path.relative(root, run.dir)}, from main ${base.slice(0, 8)}; stops at ${tokenLimit.toLocaleString()} tokens or $${usdLimit}`)
const t0 = Date.now()
const s = await runOpencode(run, request, { timeLimit: Number(flag('time', 2400)), tokenLimit, usdLimit, model, token: gatewayToken() })
const minutes = +((Date.now() - t0) / 60000).toFixed(1)
const usd = cost(model, s)
sh('git add -A && (git diff --cached --quiet || git commit -qm "uncommitted at the end of the run")', run.work)
const diff = sh('git diff --binary $(git rev-list --max-parents=0 HEAD) HEAD', run.work)
const olaSubject = sh('git log --format=%s $(git rev-list --max-parents=0 HEAD)..HEAD', run.work).split('\n').find((l) => l && !l.startsWith('uncommitted')) || ''
const stat = sh('git diff --stat $(git rev-list --max-parents=0 HEAD) HEAD', run.work).trim()
writeFileSync(path.join(run.dir, 'change.diff'), diff)
// The tests decide, in the same sandbox, on Ola's copy as it was left.
const results = []
for (const [i, cmd] of tests.entries()) results.push(await runTest(run, `t${i + 1}`, cmd))
const passed = results.every((t) => t.exit === 0)
const testLine = results.map((t) => `${t.cmd}: ${t.exit === 0 ? 'pass' : `FAIL (exit ${t.exit})`}${t.total ? `, ${t.pass} of ${t.total}` : ''}`).join('; ')
const summary = { id, model, model_id: MODELS[model].id, base, end: s.end, minutes, requests: s.requests, tokens_in: s.tokens_in, tokens_out: s.tokens_out, cost_usd: usd, files: stat.split('\n').slice(-1)[0] || 'no change', passed, tests: results }
writeFileSync(path.join(run.dir, 'summary.json'), JSON.stringify({ ...summary, final: s.final }, null, 2))
console.log(`${id}: ${s.end}, ${minutes} min, ${s.requests} model calls, $${usd}; ${summary.files}`)
console.log(`${id}: tests ${passed ? 'PASS' : 'FAIL'}: ${testLine}`)
if (!diff.trim()) {
  rmSync(run.work, { recursive: true, force: true })
  if (!dry) issues('comment', id, `Ola (${MODELS[model].id}) worked ${minutes} min on it and changed nothing (${s.end}, $${usd}). Its last words: ${s.final.slice(0, 600) || '(none)'}`)
  process.exit(1)
}

// The branch: Ola's change on top of the exact main it started from, in a worktree of this clone,
// kept as a local branch and a patch. Never pushed.
const branch = `ola/${id}`
const wt = path.join(run.dir, 'branch')
mkdirSync(path.dirname(wt), { recursive: true })
sh(`git worktree add -q --detach ${q(wt)} ${base}`, repo)
let commit = ''
try {
  sh(`git apply --index --whitespace=nowarn ${q(path.join(run.dir, 'change.diff'))}`, wt)
  const msg = `${olaSubject.slice(0, 300) || `the change for ${id}`}\n\nBuilt by Ola on ${MODELS[model].id} (Together), handed off by Kit; ${s.requests} model calls, ${minutes} min, $${usd}. Tests in its sandbox: ${testLine}. Not reviewed yet: the lead reviews, runs the checks and merges. [${id}]`
  writeFileSync(path.join(run.dir, 'commit-message.txt'), msg)
  sh(`git -c user.name=Ola -c user.email=ola@ola.cx commit -q -F ${q(path.join(run.dir, 'commit-message.txt'))}`, wt)
  commit = sh('git rev-parse HEAD', wt).trim()
  sh(`git branch -f ${branch} ${commit}`, repo)
  sh(`git format-patch -1 --stdout ${commit} > ${q(path.join(run.dir, 'change.patch'))}`, repo)
} finally {
  sh(`git worktree remove --force ${q(wt)}`, repo)
  if (existsSync(run.work)) rmSync(run.work, { recursive: true, force: true }) // 630 MB; the diff, the patch, the request, the tests' output and the events stay
}
const where = `${hostname().split('.')[0]}:${repo}`
console.log(`${id}: local branch ${branch} = ${commit.slice(0, 8)} in ${where} (not pushed); patch ${path.join(run.dir, 'change.patch')}`)
if (!dry) issues('comment', id, `Ola built it on ${MODELS[model].id}: local branch ${branch} (${commit.slice(0, 8)}, from main ${base.slice(0, 8)}) in ${where}, not pushed; patch ${path.relative(root, run.dir)}/change.patch under ~/ola-trials. ${summary.files}; ${minutes} min, ${s.requests} model calls, $${usd} (${s.end}). Tests in its sandbox: ${passed ? 'PASS' : 'FAIL'}, ${testLine}. Ola's words: ${s.final.slice(0, 600)}. Next: the lead reviews the branch, runs the checks and merges.`)
process.exit(passed ? 0 : 1)
