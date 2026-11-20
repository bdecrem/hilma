#!/usr/bin/env node
// Which standing rules can leave the always-loaded list because code already does what they say
// (OLA-251, Nov 20). Bart approved: "a rule leaves the always-loaded list only when code already
// enforces it, and the shorter list is first run against the replay cases beside the full one; no
// target number". The outside research of that morning: agents follow fewer instructions as the list
// grows, and a line that keeps being ignored belongs in a program. This tool proposes; it changes
// nothing that sessions load. The lead decides after reading the note.
//
//   node scripts/venture/rules-trim.mjs propose   the proposal and both digests, in apps/venture/private/data/rules-trim/
//   node scripts/venture/rules-trim.mjs replay    the replay cases once with each digest (steer-replay.mjs --dry
//                                                 --with-only --tries 1, Opus, the machine's Claude login): run it
//                                                 on the Mac mini, not on Bart's iMac
//   node scripts/venture/rules-trim.mjs note      apps/venture/private/RULES-TRIM-2026-11-20.md from the two
//
// How a rule is judged enforced. RULES.md gives the rules (number, lead sentence, text); the hooks in
// .claude/hooks and whether .claude/settings.json runs them; the guards in data/weaknesses.json (kind 3
// or stronger, with where they live). A rule leaves only when an entry below names the file that does
// it, that file exists, a hook is registered, the file still contains the line that refuses or
// automates it, and the WHOLE rule is covered. A rule that code covers only in part stays, and the
// note says which part. Everything is checked again at each run, so an entry whose code was removed
// stops proposing its rule.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadWeaknesses, privPath } from './_weak.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const OUT = privPath(root, 'data/rules-trim/')
const NOTE = privPath(root, 'RULES-TRIM-2026-11-20.md')
const cmd = process.argv[2]
const die = (m) => (console.error(m), process.exit(1))
const read = (f) => readFileSync(root + f, 'utf8')

// The claims, one per rule, each checked against the code at every run. `full`: the code does the
// whole rule; otherwise `left` says what of the rule is still the agent's to remember.
const CLAIMS = [
  { rule: 7, file: 'scripts/venture/mail.mjs', proof: /NOT SENT: .*approved-recipients\.txt/, weakness: 'your-call', full: true,
    how: 'mail.mjs refuses to send to an address that has not written to us, has not signed up and is not in approved-recipients.txt, which only Bart approves.' },
  { rule: 32, file: '.claude/hooks/issue-guard.py', hook: true, proof: /must name its tracker issue/, full: true,
    how: 'The PreToolUse hook refuses a git commit that touches Ola without an issue id (OLA-n) in the command.' },
  { rule: 45, file: 'scripts/venture/chat-export.py', hook: true, proof: /terminal-chat/, weakness: 'unread-channel', full: true,
    how: 'The Stop and UserPromptSubmit hook copies the terminal conversation to venture_docs "terminal-chat" after every turn, which the voice and texting Kit load.' },
  { rule: 54, file: 'scripts/venture/issues.mjs', proof: /cannot be closed yet/, weakness: 'not-your-path', full: true,
    how: '`issues.mjs done` refuses until every check has passed, each passed by someone who did not build it, with a file that shows it; for the product every place (cloud and local; web, Mac, phone; chat and screen) is covered by a check or skipped with a reason.' },
  { rule: 36, file: 'scripts/venture/issues.mjs', proof: /async function laneGate/, full: false,
    how: '`issues.mjs start` refuses a second builder on Ola\'s server code (OLA-251).', left: '"broken before new" (nothing new while something he reported broken is open) is not code.' },
  { rule: 27, file: '.claude/hooks/secret-guard.py', hook: true, proof: /secret/i, weakness: 'secrets', full: false,
    how: 'The PreToolUse hook refuses Bash commands that would print a secret.', left: 'Reading a secret with other tools, and never asking Bart to rotate a key, are not code.' },
  { rule: 46, file: '.claude/hooks/sim-guard.py', hook: true, proof: /simulator/i, weakness: 'your-things', full: false,
    how: 'Simulator runs are refused on his iMac and the Ola installer refuses to replace Ola while it is open.', left: 'Any other app of his can still be quit.' },
  { rule: 50, file: 'scripts/venture/sweep.mjs', proof: /corrections not filed under a weakness/, weakness: 'no-learning', full: false,
    how: '`correct.mjs` is the one way a correction is recorded, and `sweep.mjs post` refuses a day with an unfiled correction or fewer written than the grader counted.', left: 'Writing it down the same turn is still the agent\'s.' },
  { rule: 26, file: '.claude/hooks/reply-check.py', hook: true, proof: /sentences/, full: false,
    how: 'reply-check.py would send a long terminal reply back once; texts are checked by imsg.mjs.', left: 'The terminal hook is not registered (turned off on Nov 19, "it made every answer arrive twice"), so terminal replies are not checked.' },
  { rule: 39, file: '.claude/hooks/bart-done.py', hook: true, proof: /Tracker rule/, full: false,
    how: 'The prompt hook puts the rule and the waiting issues in front of every message (shown at the moment, not refused).', left: 'Closing the issue is still the agent\'s.' },
]

function rules() {
  const s = readFileSync(privPath(root, 'RULES.md'), 'utf8')
  const body = s.slice(s.indexOf('## The rules'))
  const out = []
  const re = /^(\d+)\. (.+)$/gm
  let m
  const starts = []
  while ((m = re.exec(body))) starts.push({ n: Number(m[1]), at: m.index, line: m[2] })
  starts.forEach((x, i) => {
    const text = body.slice(x.at, starts[i + 1]?.at ?? body.length)
    const lead = /\*\*(.+?)\*\*/.exec(x.line)?.[1]?.trim() ?? x.line.slice(0, 120)
    out.push({ n: x.n, lead, text })
  })
  return out
}

function registered() {
  const files = ['.claude/settings.json', '.claude/settings.local.json'].filter((f) => existsSync(root + f))
  return files.map(read).join('\n')
}

function digestText() {
  const r = spawnSync('python3', [root + '.claude/hooks/venture-rules.py', '--text'], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } })
  if (r.status !== 0) die(`venture-rules.py --text failed: ${r.stderr}`)
  return r.stdout
}

function propose() {
  const all = rules()
  const settings = registered()
  const weak = loadWeaknesses(root)
  const hooks = readdirSync(root + '.claude/hooks').filter((f) => !/-test\./.test(f))
  const result = CLAIMS.map((c) => {
    const r = all.find((x) => x.n === c.rule)
    const problems = []
    if (!r) problems.push(`rule ${c.rule} is not in RULES.md`)
    if (!existsSync(root + c.file)) problems.push(`${c.file} does not exist`)
    else if (!c.proof.test(read(c.file))) problems.push(`${c.file} no longer contains what refuses it (${c.proof})`)
    const name = c.file.split('/').pop()
    if (c.hook && !settings.includes(name)) problems.push(`${name} is not registered in .claude/settings.json, so it does not run`)
    const guards = (weak.find((w) => w.id === c.weakness)?.guards ?? []).filter((g) => (g.level ?? (g.enforced ? 3 : 1)) >= 3).map((g) => g.what.slice(0, 160))
    return { rule: c.rule, lead: r?.lead ?? '', file: c.file, how: c.how, full: c.full, left: c.left ?? null, guards, problems, leaves: c.full && !problems.length }
  })
  // The rules no entry speaks for: those hooks and guards that name a rule number are listed as leads.
  const leads = []
  for (const h of hooks) for (const m of read('.claude/hooks/' + h).matchAll(/\brules? (\d+)\b/gi)) if (!CLAIMS.some((c) => c.rule === Number(m[1]))) leads.push(`${h} mentions rule ${m[1]}`)
  const full = digestText()
  const leaving = new Set(result.filter((x) => x.leaves).map((x) => x.rule))
  const lines = full.split('\n')
  const kept = lines.filter((l) => !(/^(\d+)\. /.test(l) && leaving.has(Number(/^(\d+)/.exec(l)[1]))))
  const n = kept.filter((l) => /^\d+\. /.test(l)).length
  const short = kept.join('\n').replace(/^Standing rules from Bart's corrections: \d+ rules/, `Standing rules from Bart's corrections: ${n} rules`) +
    `\n\nRules enforced by code and no longer listed here (each refused or done by the file named): ${result.filter((x) => x.leaves).map((x) => `${x.rule} (${x.file})`).join(', ')}.\n`
  mkdirSync(OUT, { recursive: true })
  writeFileSync(OUT + 'digest-full.txt', full)
  writeFileSync(OUT + 'digest-short.txt', short)
  writeFileSync(OUT + 'proposal.json', JSON.stringify({ at: new Date().toISOString(), rules: all.length, leaving: [...leaving], claims: result, leads: [...new Set(leads)], chars: { full: full.length, short: short.length } }, null, 2) + '\n')
  for (const x of result) console.log(`${x.leaves ? 'LEAVES' : 'stays '} rule ${String(x.rule).padStart(2)}  ${x.file}${x.problems.length ? `  (${x.problems.join('; ')})` : x.full ? '' : `  (in part: ${x.left})`}`)
  console.log(`${leaving.size} of ${all.length} rules would leave; digest ${full.length} -> ${short.length} characters. Files in ${OUT}`)
}

function replay() {
  if (!existsSync(OUT + 'proposal.json')) die('run `rules-trim.mjs propose` first')
  for (const which of ['full', 'short']) {
    const out = OUT + `replay-${which}.json`
    console.log(`replay with the ${which} digest -> ${out}`)
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY // the machine's Claude login (the Max plan), never a key
    const r = spawnSync('node', [root + 'scripts/venture/steer-replay.mjs', '--dry', '--with-only', '--tries', '1', '--rules-text', OUT + `digest-${which}.txt`, '--json', out], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64e6, timeout: 150 * 60e3 })
    writeFileSync(OUT + `replay-${which}.log`, r.stdout ?? '')
    console.log((r.stdout ?? '').split('\n').filter((l) => /^(with the rules|rules too weak|\d+ calls)/.test(l)).join('\n'))
    if (!existsSync(out)) die(`the ${which} run wrote no result (exit ${r.status})`)
  }
}

function note() {
  const p = JSON.parse(readFileSync(OUT + 'proposal.json', 'utf8'))
  const res = Object.fromEntries(['full', 'short'].map((w) => [w, existsSync(OUT + `replay-${w}.json`) ? JSON.parse(readFileSync(OUT + `replay-${w}.json`, 'utf8')) : null]))
  const score = (r) => (r ? `${r.prevented} of ${r.graded} past mistakes prevented (${r.with_rules.passed} of ${r.with_rules.tries} tries), ${r.tokens.calls} calls, about $${r.equiv_dollars} on a key, $0 on the Max plan` : 'not run')
  const byCase = (r) => new Map((r?.results ?? []).map((x) => [x.id, x.prevented]))
  const f = byCase(res.full)
  const s = byCase(res.short)
  const lost = [...f].filter(([id, v]) => v === true && s.get(id) === false).map(([id]) => id)
  const gained = [...f].filter(([id, v]) => v === false && s.get(id) === true).map(([id]) => id)
  const worse = res.full && res.short ? res.short.prevented < res.full.prevented : null
  const leaving = p.claims.filter((c) => c.leaves)
  const staying = p.claims.filter((c) => !c.leaves)
  const text = `# Rules that code already enforces: a shorter always-loaded list, tested first

Written ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })} by \`node scripts/venture/rules-trim.mjs\` (OLA-251). Nothing that sessions load has changed. The lead decides after reading this; the shorter list is used only if it did no worse.

Bart approved on Nov 20: "a rule leaves the always-loaded list only when code already enforces it, and the shorter list is first run against the replay cases beside the full one; no target number."

## What would leave the list (${leaving.length} of ${p.rules} rules)

The always-loaded list is the digest every session gets at its start (one line per rule, \`.claude/hooks/venture-rules.py\`). A rule that leaves it stays in RULES.md with its full text; only its line in the digest goes, and the digest names it as enforced by code.

${leaving.map((c) => `- **Rule ${c.rule}: ${c.lead}** Enforced by \`${c.file}\`. ${c.how}${c.guards.length ? ` The weakness ledger records the same guard: "${c.guards[0].replace(/\.$/, "")}".` : ''}`).join('\n')}

## Enforced in part, so they stay

${staying.map((c) => `- **Rule ${c.rule}: ${c.lead}** \`${c.file}\`: ${c.how}${c.problems.length ? ` Not counted: ${c.problems.join('; ')}.` : ''}${c.left ? ` What is not code: ${c.left}` : ''}`).join('\n')}

## The two runs

Each run sent every replay case (a past mistake, as the situation just before it) once to a fresh Claude Opus 5.5 with the digest as its standing rules, and graded the answer against the case's rubric (\`steer-replay.mjs --dry --with-only --tries 1\`, on the Max login). One try per case, so a single unlucky answer can move a case either way.

- Full digest (${p.chars.full} characters): ${score(res.full)}.
- Shorter digest (${p.chars.short} characters): ${score(res.short)}.
- Cases prevented with the full digest and not with the shorter: ${lost.join(', ') || 'none'}.
- Cases prevented with the shorter digest and not with the full: ${gained.join(', ') || 'none'}.

${worse === null ? 'The runs are not complete, so there is no verdict.' : worse ? '**The shorter digest did worse.** By the rule Bart approved, it is not used.' : '**The shorter digest did no worse.** It may be used; the change is to make venture-rules.py print the shorter digest.'}

## How this was decided

A rule leaves only when an entry in \`scripts/venture/rules-trim.mjs\` names the file that refuses or does what the rule says, the file exists, a hook among them is registered in \`.claude/settings.json\`, the file still contains the line that refuses it, and the whole rule is covered. Every run checks that again.${p.leads.length ? ` Hooks that mention a rule no entry covers: ${p.leads.join('; ')}.` : ''}
`
  writeFileSync(NOTE, text)
  console.log(`wrote ${NOTE}`)
}

if (cmd === 'propose') propose()
else if (cmd === 'replay') replay()
else if (cmd === 'note') note()
else {
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(cmd ? 1 : 0)
}
