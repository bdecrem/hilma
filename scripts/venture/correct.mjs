#!/usr/bin/env node
// Record a correction, and refuse a fix that is no stronger than the one that already failed (2026-11-20).
//
// Bart, Nov 20: "THERE IS ZERO LEARNING AFTER ONE WEEK." The record agreed with him: 104 corrections
// in 8 days; every fix that was only written down came back (the 12 text-only fixes were followed by
// 5 to 13 repeats each); the same lesson ("use it the way he will") was written as a rule four times.
// A repeat was answered with another fix of the same kind. This tool is the only way a correction is
// recorded, and it makes that impossible: when a weakness comes back, its next fix must be of a
// stronger kind than every fix before it.
//
// The five kinds of fix, weakest first:
//   1  written down         a rule or a note the agent has to remember
//   2  shown at the moment  a hook or a template puts it in front of the agent when it applies
//   3  refused by code      a guard, a gate or a failing test stops the wrong action
//   4  checked by another   something that did not do the work checks it (a checker, an automatic run on the live thing)
//   5  taken away           the step is no longer the agent's to get wrong (automation does it, or the process changed)
//
//   node scripts/venture/correct.mjs add --title "short name of what went wrong" --words "<his words>" \
//        --did "<what the agent had done>" --cause "<the real cause>" --weakness <id> \
//        --fix "<what changed>" --level 3 --where "<file, command or ticket that carries the fix>" \
//        [--why-last "<why the last fix did not hold>"]   required when the weakness had a fix before
//        [--escape]        he met something broken or untrue after being told it was done or working
//        [--cannot "<why no stronger fix exists>"]        records the weakness as open, on the Learning page
//        [--when "9:28 am"] [--side ola] [--new "Name of a new weakness|what it is"]
//   node scripts/venture/correct.mjs list      every weakness: times seen, came back, strongest fix
//   node scripts/venture/correct.mjs escapes   per day: how often he met something broken after "it works"
// Writes apps/venture/private/CORRECTIONS.md (a numbered entry) and data/weaknesses.json together.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const COR = root + 'apps/venture/private/CORRECTIONS.md'
const WEAK = root + 'apps/venture/private/data/weaknesses.json'
const argv = process.argv.slice(2)
const cmd = argv[0]
const opt = {}
for (let i = 1; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[++i]
const str = (k) => (typeof opt[k] === 'string' && opt[k].trim() ? opt[k].trim() : null)
const die = (m) => (console.error(m), process.exit(1))
const KINDS = { 1: 'written down', 2: 'shown at the moment', 3: 'refused by code', 4: 'checked by another', 5: 'taken away' }
export const levelOf = (g) => g.level ?? (g.enforced ? 3 : 1)
const pacific = (o) => new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', ...o })
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

/** What the next fix of a weakness must be: { prev, cameBack, need }. */
export function required(w) {
  const guards = w.guards ?? []
  const prev = guards.length ? Math.max(...guards.map(levelOf)) : 0
  const first = guards.map((g) => g.day).sort()[0]
  const cameBack = first ? w.seen.filter((s) => s.day > first).length + 1 : 0 // + this one
  let need = prev + 1
  if (cameBack >= 3) need = Math.max(need, 3) // three repeats: remembering has been tried enough
  if (prev >= 4) need = 4 // already checked by another: the hole in that check is what gets fixed
  return { prev, cameBack, need: Math.min(need, 5) }
}

const weak = () => JSON.parse(readFileSync(WEAK, 'utf8'))

if (cmd === 'add') {
  const [title, words, did, cause, fix] = ['title', 'words', 'did', 'cause', 'fix'].map(str)
  if (!title || !words || !did || !cause) die('add needs --title, --words (his words), --did (what the agent had done) and --cause (the real cause)')
  const list = weak()
  let w = list.find((x) => x.id === str('weakness'))
  if (str('new')) {
    const [name, what] = str('new').split('|')
    if (!str('weakness') || !name || !what) die('--new "Name|what it is" needs --weakness <new-id> too')
    if (w) die(`weakness ${w.id} exists already`)
    w = { id: str('weakness'), side: str('side') ?? 'kit', name: name.trim(), what: what.trim(), seen: [], guards: [], now: '' }
    list.push(w)
  }
  if (!w) die(`--weakness must be one of:\n${list.map((x) => `  ${x.id.padEnd(18)} ${x.side}  ${x.name}`).join('\n')}\n(or a new one: --weakness new-id --new "Name|what it is")`)
  const { prev, cameBack, need } = required(w)
  const repeat = w.seen.length > 0
  const cannot = str('cannot')
  const level = Number(opt.level)
  if (!cannot) {
    if (!fix || !(level >= 1 && level <= 5)) die(`add needs --fix "<what changed>" and --level 1..5:\n${Object.entries(KINDS).map(([n, k]) => `  ${n}  ${k}`).join('\n')}`)
    if (prev && !str('why-last')) die(`"${w.name}" had a fix before (strongest so far: ${prev}, ${KINDS[prev]}) and it came back.\nSay why that fix did not hold: --why-last "…". The new fix has to answer that, not repeat it.`)
    if (level < need) die(
      `Refused: "${w.name}" has now come back ${cameBack} time(s) after a fix, and its strongest fix so far is ${prev} (${KINDS[prev] ?? 'none'}).\n` +
      `The next fix must be at least ${need} (${KINDS[need]}); you gave ${level} (${KINDS[level]}).\n` +
      `Another rule of the same kind is what failed. Build the stronger fix first, then record it with --where.\n` +
      `If no stronger fix exists, say so: --cannot "<why>". The weakness then shows as open on the Learning page.`)
    if (level >= 3) {
      const where = str('where')
      if (!where) die(`a fix of kind ${level} (${KINDS[level]}) names what carries it: --where "<file, command or ticket>"`)
      const path = where.split(/[\s:]/)[0]
      if (/[/.]/.test(path) && !/^OLA-\d+$/.test(path) && !existsSync(root + path) && !existsSync(path)) die(`--where: ${path} does not exist. The fix is recorded after it is built, not before.`)
    }
  }
  const text = readFileSync(COR, 'utf8')
  const n = Math.max(0, ...[...text.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]))) + 1
  const date = pacific({ month: 'long', day: 'numeric', year: 'numeric' })
  const time = str('when') ?? pacific({ hour: 'numeric', minute: '2-digit' }).toLowerCase()
  const entry = [
    `## ${n}. ${date}, ${time}: ${title}${repeat ? ` (REPEAT: "${w.name}", seen ${w.seen.length} time(s) before)` : ''}`,
    '',
    `His words: ${/^["“]/.test(words) ? words : `"${words}"`}`,
    `What happened: ${did}`,
    `Cause: ${cause}`,
    `Weakness: ${w.id}${opt.escape ? ' (ESCAPE: he met it after being told it was done or working)' : ''}`,
    ...(str('why-last') ? [`Why the last fix did not hold: ${str('why-last')}`] : []),
    cannot ? `No stronger fix found: ${cannot}` : `Fix (kind ${level}, ${KINDS[level]}${str('where') ? `; ${str('where')}` : ''}): ${fix}`,
    '',
  ].join('\n')
  writeFileSync(COR, text.replace(/\n*$/, '\n\n') + entry)
  w.seen.push({ day: today(), ref: `correction ${n}`, ...(opt.escape ? { escape: true } : {}) })
  if (cannot) w.stuck = { day: today(), why: cannot, at_level: prev }
  else {
    w.guards.push({ day: today(), what: fix, enforced: level >= 3, level, ...(str('where') ? { where: str('where') } : {}) })
    delete w.stuck
  }
  writeFileSync(WEAK, JSON.stringify(list, null, 2) + '\n')
  console.log(`correction ${n} recorded under "${w.name}" (${w.side}); seen ${w.seen.length} time(s)${cannot ? '; NO stronger fix: shown as open' : `; fix kind ${level} (${KINDS[level]})`}`)
  console.log('next: node scripts/venture/sync.mjs push')
} else if (cmd === 'list') {
  for (const w of weak().sort((a, b) => b.seen.length - a.seen.length)) {
    const { prev, cameBack } = required(w)
    console.log(`${w.id.padEnd(18)} ${w.side.padEnd(4)} seen ${String(w.seen.length).padStart(2)}  came back ${String(Math.max(0, cameBack - 1)).padStart(2)}  strongest fix ${prev} ${(KINDS[prev] ?? 'none').padEnd(20)}${w.stuck ? ' STUCK: ' + w.stuck.why.slice(0, 60) : ''}  ${w.name}`)
  }
} else if (cmd === 'escapes') {
  const by = {}
  for (const w of weak()) for (const s of w.seen) if (s.escape || w.escape) by[s.day] = (by[s.day] ?? 0) + 1
  for (const d of Object.keys(by).sort()) console.log(`${d}  ${by[d]}`)
  console.log(`total ${Object.values(by).reduce((a, b) => a + b, 0)}: times Bart met something broken or untrue after being told it was done or working`)
} else if (import.meta.url === `file://${process.argv[1]}`) {
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 28).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(cmd ? 1 : 0)
}
