#!/usr/bin/env node
// One plain opencode run that reads a list of bugs and writes failing tests for two of them (OLA-520,
// Bart Nov 27: "give it ten bugs and tell it to write appropriate tests for two of them"). The repo at
// <ref> (default origin/main) is copied into ~/ola-trials/write-tests/<stamp>/work, the run is in the
// ticket lane's sandbox through the model's gateway (gateway.sh <model> first), and the run's changes are
// kept in <dir>/change.diff. Then each test TESTS.md names can be checked on the untouched code (three.mjs
// takes the chosen one as a case).
//   node apps/activist-ai/tickets/write-tests.mjs --model studio-qwen3.8-flash-next --bugs apps/activist-ai/tickets/ten-bugs.txt [--ask <instruction file>] [--time 1800]
import { writeFileSync, readFileSync, symlinkSync, existsSync } from 'node:fs'
import path from 'node:path'
import { repo, root, nmRoot, nmOla, MODELS, sh, q, runFolders, opencodeConfig, runOpencode, gatewayToken, LEAN } from './lib.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
  if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return a
}, []))
const model = args.model, ref = args.ref || 'origin/main', timeLimit = Number(args.time || 1800)
if (!MODELS[model] || !args.bugs) { console.error('--model <models.json name> --bugs <file>'); process.exit(2) }
const bugs = readFileSync(path.resolve(args.bugs), 'utf8')
const paths = ['CLAUDE.md', 'package.json', 'apps/activist-ai', ':!apps/activist-ai/apple', ':!apps/activist-ai/opencode-fork', ':!apps/activist-ai/site', ':!apps/activist-ai/brand']

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const run = runFolders(path.join(root, 'write-tests', stamp)), { work } = run
sh(`git -C ${q(repo)} archive ${ref} -- ${paths.map((x) => `'${x}'`).join(' ')} | tar -x -C ${q(work)}`)
symlinkSync(nmRoot, path.join(work, 'node_modules'))
if (existsSync(path.join(work, 'apps/activist-ai'))) symlinkSync(nmOla, path.join(work, 'apps/activist-ai/node_modules'))
writeFileSync(path.join(work, '.gitignore'), 'node_modules\n', { flag: 'a' })
writeFileSync(path.join(work, 'opencode.jsonc'), JSON.stringify(opencodeConfig(model, { lean: true }), null, 2))
sh('git init -q && git add -A && git commit -qm base && git tag config', work)

// --ask <file>: the instruction itself (run two of OLA-520); the bugs follow it.
const text = args.ask ? `${readFileSync(path.resolve(args.ask), 'utf8').trim()}\n\n${LEAN.reading} Work only in this folder.\n\n${bugs}` : `Here are ten bugs. For each, say in one line whether a small model could fix it. Then choose the TWO for which you can write a good test, ` +
  `and for each write one test file that fails on this code because of the bug and would pass once the bug is fixed. Put each test next to the tests ` +
  `of that part of the code, in the style of the tests already there, runnable with one node command. Do not fix the bugs. End with a file TESTS.md ` +
  `naming for each of the two: the bug id, the test file, the exact command to run it, and what it checks.\n\n${LEAN.reading} Work only in this folder.\n\n${bugs}`
const t0 = Date.now()
console.log(`write-tests: ${model} in ${run.dir}`)
const s = await runOpencode(run, text, { timeLimit, tokenLimit: Infinity, model, token: gatewayToken(), lean: true })
const diff = sh('git add -A >/dev/null 2>&1; git diff --cached config', work)
writeFileSync(path.join(run.dir, 'change.diff'), diff)
writeFileSync(path.join(run.dir, 'final.txt'), s.final || '')
console.log(`write-tests: ${s.end}, ${s.requests} calls, ${((Date.now() - t0) / 60000).toFixed(1)} min; changed: ${sh('git diff --cached --name-status config', work).trim().replace(/\n/g, ', ') || 'nothing'}`)
console.log(`dir ${run.dir}`)
