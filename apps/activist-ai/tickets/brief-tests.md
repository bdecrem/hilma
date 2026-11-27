You are writing tests for bugs in Ola. A smaller model fixes each bug afterwards with only your test and your notes to go on, so your test is what "fixed" will mean. The ten bugs are at the end.

THE JOB
1. From the ticket text alone, before you open any code: one line per bug, could a small model fix it (yes or no, and why).
2. Choose TWO to write tests for. Good choices: the cause is in code a test can call directly (a function, a pattern, a message), and the two have different causes. If two tickets turn out to have the same cause, treat them as one bug and name both ids.
3. Take one bug at a time and finish it before you start the next:
   a. Find the code (grep), and every copy of the rule involved (see "Copies" below).
   b. Write the test file beside that part's other tests, in their style.
   c. Write a second file beside it, named <same name>.held.test.<ext>: the same checks on other examples. The model that fixes the bug never sees this file. It is how a real fix is told from one that only fits your examples.
   d. Run both files. Each must fail now, on an assertion about the bug (not on an import or a syntax error), and every "stays" test in them must pass now.
   e. Add the bug to TESTS.json right away (format below), before the next bug.
Do not fix the bugs and do not change any existing file. A bug that is finished and in TESTS.json counts even if the second one is not done.

WHAT A GOOD TEST HAS
- Tests whose names start "bug: " hold the ticket's own examples and at least two more of the same bug: cases the ticket plainly covers but does not spell out, in other words or with other values.
- Tests whose names start "stays: " hold at least three near-misses: inputs that look like the bug's examples but must be treated exactly as they are today. A fix that is too broad fails here.
- It calls the real code. No copy of the code's logic inside the test.
- When the rule is copied into more than one part, it checks every copy it can import.
- The held file has the same two kinds of test on different examples (three or more of each), none repeated from the first file, and none the ticket does not plainly cover.

A test here looks like this (node:test and node:assert, nothing else):
  import assert from 'node:assert/strict'
  import { test } from 'node:test'
  import { validName } from '../server/files.mjs'
  test('bug: a file name with an apostrophe or # is accepted', () => { for (const n of ["Rosa's notes.pdf", 'Scan #2.pdf']) assert.ok(validName(n), n) })
  test('stays: paths and hidden files are refused', () => { for (const n of ['../x.pdf', '.env', 'a/b.txt']) assert.ok(!validName(n), n) })

TESTS.json, a JSON array with one entry per finished bug:
[{"bug": "OLA-…", "file": "<test file, path from this folder>", "cmd": "<exact command, run from this folder>", "held": "<held file>", "heldCmd": "<exact command>", "where": "<the files where the cause lives, every copy>", "cause": "<one sentence: what in the code is wrong>"}]

OLA IN HALF A PAGE
(The longer map is apps/activist-ai/OVERVIEW.md. The root CLAUDE.md is about other projects: skip it.)

What it is. Ola is a private AI agent for activists and community groups. It works with a group's documents and data and writes the code to do it, on open models, on one computer we own. Three promises a fix must never break: a person's content is never logged and never leaves the machine without their yes; what Ola tells a person is true and in plain words; an error is said, never hidden behind a default.

How a request travels. person -> front desk (sign-in, files, publishing, the notes put in front of a request) -> the project's sealed workspace (a VM with no network; opencode, Ola's tools and plugins inside) -> model gateway (the only way out: model calls, web search, limits, notes added to a request) -> the model.

The parts, all under apps/activist-ai:
- frontdesk/  the web server. One file per subject (publishednote.mjs, chatpublish.mjs, sites.mjs, poke.mjs ...). Tests: frontdesk/test/*.test.mjs.
- gateway/    the model gateway. One file per rule (askfirst.mjs, toolargs.mjs, publishedchange.mjs ...). Tests: gateway/test.mjs, one file for all of it.
- web/        the website (Vite, Solid, TypeScript). What can be tested without a browser is in web/src/lib/*.ts and web/server/*.mjs. Tests: web/test/*.test.ts and *.test.mjs, run with plain node.
- workspace/  what runs inside each project's VM: AGENTS.md (the model's instructions), the ola-* tools, plugins/ (each plugin has its own test beside it).
- skills/, evals/, ops/  the skills the model loads; request tests; deploy and machine scripts.

Copies. The parts do not import from each other, so a rule needed in two of them is copied word for word. Example: the "asks to publish" pattern is in frontdesk/publishednote.mjs, in gateway/publishedchange.mjs and again in workspace/plugins/ola-skillcue. A bug in such a rule is in every copy; grep for a distinctive piece of it.

Stack. Plain Node, ES modules (.mjs), no build step and no dependencies outside the website. Tests are node:test with node:assert/strict.

What a test can reach here: a function, a pattern, a message, a piece of web/src/lib. What it cannot: anything that needs a browser, a running VM, a model or the network. Prefer bugs of the first kind.
