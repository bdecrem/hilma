// The tracker knows its caller only by the hook's token (OLA-251, ninth pass). This replays, on a copy of the
// tracker, the ways around the checkers found in passes five to nine: a call typed past the hook (no token)
// right after the holder ran commands whose text holds a whole claim (an `|| … --wait` fallback, an echoed
// hint, a `node --check` of issues.mjs, a commit naming issues.mjs), and a forged token. Each must leave the
// holder's claim as it was and keep a second builder out of the server lane.
//   node scripts/venture/caller-test.mjs        (reads the real tracker once to make the copy; writes nothing there)
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenHash } from './_who.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'caller-test-'))
const db = join(dir, 'tracker.json')
const callers = join(dir, 'callers.jsonl')
execFileSync('node', [join(here, '_fakedb.mjs'), 'copy', db, 'OLA-240', 'OLA-267'], { stdio: 'pipe' })
// no live claims in the copy: the test sets its own
const d = JSON.parse(readFileSync(db, 'utf8'))
d.venture_state = (d.venture_state ?? []).filter((r) => !/^claim/.test(r.key))
writeFileSync(db, JSON.stringify(d))

const now = () => Date.now() / 1000
const rows = []
// each row as the hook writes it; cmds[tok] is the command it was given, which the tracker finds in its own shell
const cmds = {}
const record = (agent, tok, cmd) => { cmds[tok] = cmd; rows.push(JSON.stringify({ at: now(), session: 'lead-session', agent, agent_type: 'general-purpose', tok: tokenHash(tok), cmd })); writeFileSync(callers, rows.join('\n') + '\n') }
// run(tok, …): a command whose hook prefix carries tok (shell = that command); run(tok, …) with { shellTok } set:
// the env carries tok but the shell's own prefix is shellTok's (a token taken from elsewhere)
let shellOverride = null
const run = (tok, ...args) => {
  const env = { ...process.env, VENTURE_TRACKER_FAKE: db, VENTURE_CALLERS_FILE: callers }
  delete env.VENTURE_CALLER
  delete env.VENTURE_TEST_SHELL
  if (tok) env.VENTURE_CALLER = tok
  const st = shellOverride ?? tok
  env.VENTURE_TEST_SHELL = st ? `export VENTURE_CALLER=${st}; ${cmds[st] ?? ''}` : 'node scripts/venture/iss*s.mjs ' + args.join(' ')
  const r = spawnSync('node', [join(here, 'issues.mjs'), ...args], { env, encoding: 'utf8' })
  return { code: r.status, out: (r.stdout + r.stderr).trim() }
}
const claims = () => run(null, 'claims').out
let fails = 0
const expect = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     ${detail}`}`); if (!ok) fails++ }
const holdsB = () => /OLA-240[^\n]*\bbuilder\b/.test(claims()) && !/OLA-240[^\n]*\b(lead|hold|checker)\b/.test(claims())

// B, an agent with its own token, claims OLA-240 as a builder; its command holds text that looks like more runs
const tb = 'b'.repeat(32)
record('bbbbbbbb', tb, `node scripts/venture/issues.mjs claim OLA-240 --who builder || node scripts/venture/issues.mjs claim OLA-240 --who builder --wait && echo "renew: node scripts/venture/issues.mjs claim OLA-240" && node --check scripts/venture/issues.mjs`)
let r = run(tb, 'claim', 'OLA-240', '--who', 'builder')
expect('B claims OLA-240 as a builder', r.code === 0 && /server lane/.test(r.out), r.out)
record('bbbbbbbb', tb + 'c', `git add scripts/venture/issues.mjs && git commit -m "issues.mjs claim OLA-240 [OLA-240]"`)

// A types the tool past the hook: no token at all
r = run(null, 'claim', 'OLA-240')
expect('A with no token cannot take over B\'s claim', r.code !== 0 && holdsB(), `${r.out}\n${claims()}`)
r = run(null, 'release', 'OLA-240')
expect('A with no token cannot release B\'s claim without --why', r.code !== 0 && holdsB(), r.out)
// A with its own token: another caller
const ta = 'a'.repeat(32)
record('aaaaaaaa', ta, 'node scripts/venture/iss*s.mjs claim OLA-240')
r = run(ta, 'claim', 'OLA-240')
expect('A with its own token is another caller', r.code !== 0 && holdsB(), r.out)
r = run(ta, 'claim', 'OLA-240', '--who', 'builder')
expect('A under B\'s name is still another caller', r.code !== 0 && holdsB(), r.out)
// A with a forged token (not in the record): unknown
r = run('f'.repeat(32), 'claim', 'OLA-240', '--who', 'builder', '--role', 'checker')
expect('a forged token is unknown and changes nothing', r.code !== 0 && holdsB(), r.out)
// the tenth checker: B's token read from B's transcript, used in A's own command (A's hook prefix comes first)
const overrides = () => run(null, 'overrides').out
const before = (overrides().match(/not this command's own/g) ?? []).length
shellOverride = ta
r = run(tb, 'release', 'OLA-240')
shellOverride = null
expect('B\'s token used in A\'s command is refused', r.code !== 0 && holdsB(), r.out)
expect('  and leaves a line in the overrides', (overrides().match(/not this command's own/g) ?? []).length > before, overrides())
// the hook run by hand to mint a token for B: a record row exists, but no command was started with it
const tm = 'd'.repeat(32)
record('bbbbbbbb', tm, 'node scripts/venture/issues.mjs release OLA-240')
shellOverride = ta
r = run(tm, 'release', 'OLA-240')
shellOverride = null
expect('a token minted by running the hook by hand is refused', r.code !== 0 && holdsB(), r.out)
// a token in a process no Claude Code command started (detached, launchd): no shell at all
shellOverride = ''
r = run(tb, 'release', 'OLA-240')
shellOverride = null
expect('a token outside any Claude Code command is refused', r.code !== 0 && holdsB(), r.out)
// a second builder is kept out of the server lane
const tc = 'c'.repeat(32)
record('cccccccc', tc, 'node scripts/venture/issues.mjs claim OLA-267 --who builder2')
r = run(tc, 'claim', 'OLA-267', '--who', 'builder2')
expect('a second builder is refused in the server lane', r.code !== 0 && !/OLA-267[^\n]*builder2/.test(claims()), r.out)
// B itself renews, and releases its own claim
r = run(tb, 'claim', 'OLA-240', '--who', 'builder')
expect('B renews its own claim', r.code === 0 && holdsB(), r.out)
r = run(tb, 'release', 'OLA-240')
expect('B releases its own claim', r.code === 0 && !/OLA-240/.test(claims()), r.out)
r = run(tc, 'claim', 'OLA-267', '--who', 'builder2')
expect('then the second builder starts', r.code === 0 && /OLA-267[^\n]*builder2/.test(claims()), r.out)

console.log(fails ? `${fails} failed (copy in ${dir})` : 'all passed')
process.exit(fails ? 1 : 0)
