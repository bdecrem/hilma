#!/usr/bin/env node
// The hand-off (OLA-300): Kit gives a ticket of our own tracker to Ola, and the result comes back as a
// branch that someone else checks. A ticket is marked for Ola by its `who`:
//   node scripts/venture/issues.mjs edit OLA-n --who ola
//
//   node apps/activist-ai/tickets/handoff.mjs list                    open tickets marked for Ola
//   node apps/activist-ai/tickets/handoff.mjs run OLA-n [--model <alias>] [--time 2400] [--tokens 4000000] [--max-usd 12] [--dry]
//
// run: the ticket and its whole thread (issues.mjs show) become the request. origin/main is exported
// into ~/ola-trials/handoff/OLA-n-<time>/work (its own git, no link to this checkout); Ola's opencode
// works there on the ticket model (models.json `_ticket_model`, the trial's winner), in the same
// sandbox as the trial (lib.mjs: no home folder, loopback only, its own gateway, no secret in
// reach). After it stops, its change is put on branch ola/OLA-n from the exact main it started from,
// committed "[OLA-n] built by Ola (<model>)" and pushed (never to main), and a comment on the ticket
// says the branch, the files, the cost and Ola's own words. Kit then reviews the branch, runs the
// checks the folder's docs name, merges it, and a checker checks the ticket as every ticket.
// --dry: everything but the push and the comment.
import { writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { MODELS, repo, root, sh, q, freeGb, MIN_FREE_GB, runFolders, opencodeConfig, runOpencode, gatewayToken, cost } from './lib.mjs'

const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) }
const issues = (args) => sh(`node ${q(path.join(repo, 'scripts/venture/issues.mjs'))} ${args}`, repo)
const die = (m) => { console.error(m); process.exit(2) }

if (argv[0] === 'list') {
  const mine = issues('list').split('\n').filter((l) => /^OLA-\d+ +P\d +(next|doing) +\S+ +ola +/.test(l))
  console.log(mine.length ? mine.join('\n') : 'no open ticket is marked for Ola (issues.mjs edit OLA-n --who ola)')
  process.exit(0)
}
if (argv[0] !== 'run' || !/^OLA-\d+$/.test(argv[1] || '')) die('usage: handoff.mjs list | run OLA-n [--model <alias>] [--time s] [--tokens n] [--dry]')

const id = argv[1]
const model = flag('model', MODELS._ticket_model)
if (!model || !MODELS[model] || model.startsWith('_')) die(`no ticket model: --model <one of ${Object.keys(MODELS).filter((k) => !k.startsWith('_')).join(', ')}>, or set _ticket_model in models.json`)
const dry = flag('dry', false) === true
const show = issues(`show ${id}`)
if (!dry && !/· (ola)\b/.test(show.split('\n').find((l) => l.startsWith('area ')) || '')) die(`${id} is not marked for Ola (issues.mjs edit ${id} --who ola); only a ticket Kit marked is handed off`)
const tokenLimit = Number(flag('tokens', 4000000))
const worst = tokenLimit * MODELS[model].in / 1e6
const cap = Number(flag('max-usd', 12))
if (worst > cap) die(`a run of up to ${tokenLimit.toLocaleString()} tokens on ${model} can cost $${worst.toFixed(2)}, over --max-usd ${cap} (default 12)`)
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

How to work:
- Read the repo's CLAUDE.md first, then the CLAUDE.md and README of every folder you touch. Follow their conventions.
- Make the change the ticket asks for, and only that. Small, plain code in the style of the files around it.
- Run the tests and checks the folder's docs name for what you changed, and add a test for the new behaviour where the folder has tests. There is no network here except your model; a check that needs the network or the live server is left for Kit, and you say so.
- Never print or read a secret; there is none here to read.
- When it is done: commit with git, one commit, its message a plain sentence of what changed ending in [${id}]. Then say in at most five sentences what you changed, which tests you ran with their counts, and what is left for Kit.`
writeFileSync(path.join(run.dir, 'request.md'), request)

console.log(`${id}: Ola on ${model} (${MODELS[model].id}) in ${path.relative(root, run.dir)}, from main ${base.slice(0, 8)}`)
const t0 = Date.now()
const s = await runOpencode(run, request, { timeLimit: Number(flag('time', 2400)), tokenLimit, token: gatewayToken() })
const minutes = +((Date.now() - t0) / 60000).toFixed(1)
const usd = cost(model, s)
sh('git add -A && (git diff --cached --quiet || git commit -qm "uncommitted at the end of the run")', run.work)
const diff = sh('git diff --binary $(git rev-list --max-parents=0 HEAD) HEAD', run.work)
const olaSubject = sh('git log --format=%s $(git rev-list --max-parents=0 HEAD)..HEAD', run.work).split('\n').find((l) => l && !l.startsWith('uncommitted')) || ''
const stat = sh('git diff --stat $(git rev-list --max-parents=0 HEAD) HEAD', run.work).trim()
writeFileSync(path.join(run.dir, 'change.diff'), diff)
const summary = { id, model, model_id: MODELS[model].id, base, end: s.end, minutes, requests: s.requests, tokens_in: s.tokens_in, tokens_out: s.tokens_out, cost_usd: usd, files: stat.split('\n').slice(-1)[0] || 'no change' }
writeFileSync(path.join(run.dir, 'summary.json'), JSON.stringify({ ...summary, final: s.final }, null, 2))
console.log(`${id}: ${s.end}, ${minutes} min, ${s.requests} model calls, $${usd}; ${summary.files}`)
if (!diff.trim()) {
  rmSync(run.work, { recursive: true, force: true })
  if (!dry) issues(`comment ${id} ${q(`Ola (${MODELS[model].id}) worked ${minutes} min on it and changed nothing (${s.end}, $${usd}). Its last words: ${s.final.slice(0, 600) || '(none)'}`)}`)
  process.exit(1)
}

// The branch: Ola's change on top of the exact main it started from, in a worktree of this clone.
const branch = `ola/${id}`
const wt = path.join(root, 'handoff', `${id}-${stamp}`, 'branch')
mkdirSync(path.dirname(wt), { recursive: true })
sh(`git worktree add -q --detach ${q(wt)} ${base}`, repo)
try {
  sh(`git apply --index --whitespace=nowarn ${q(path.join(run.dir, 'change.diff'))}`, wt)
  const msg = `${olaSubject.slice(0, 300) || `the change for ${id}`}\n\nBuilt by Ola on ${MODELS[model].id} (Together), handed off by Kit; ${s.requests} model calls, ${minutes} min, $${usd}. Not reviewed yet: Kit reviews, runs the checks and merges. [${id}]`
  writeFileSync(path.join(run.dir, 'commit-message.txt'), msg)
  sh(`git -c user.name=Ola -c user.email=ola@ola.cx commit -q -F ${q(path.join(run.dir, 'commit-message.txt'))}`, wt)
  const commit = sh('git rev-parse HEAD', wt).trim()
  if (dry) console.log(`dry: branch ${branch} would be ${commit.slice(0, 8)} (not pushed, no comment)`)
  else {
    sh(`git push -q --force-with-lease origin HEAD:refs/heads/${branch}`, wt)
    issues(`comment ${id} ${q(`Ola built it on ${MODELS[model].id}: branch ${branch} (${commit.slice(0, 8)}, from main ${base.slice(0, 8)}), ${summary.files}; ${minutes} min, ${s.requests} model calls, $${usd} (${s.end}). Ola's words: ${s.final.slice(0, 700)}. Next: Kit reviews the branch, runs the checks and merges.`)}`)
    console.log(`pushed ${branch} ${commit.slice(0, 8)} and commented on ${id}`)
  }
} finally {
  sh(`git worktree remove --force ${q(wt)}`, repo)
  if (existsSync(run.work)) rmSync(run.work, { recursive: true, force: true }) // 630 MB; the diff, the request and the events stay
}
