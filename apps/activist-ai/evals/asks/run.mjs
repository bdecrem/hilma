#!/usr/bin/env node
// The asks (OLA-231): real requests people made of Ola that it did not do, each kept as a case and
// sent again, as chat, the way a person sends it, on the live test server, in every place the case
// names that this runner can reach. Judged on the outcome (the page is live, the answer names
// Claude) and on what Ola must never say (it cannot from here; press a button yourself).
//
//   node evals/asks/run.mjs [--case id,id] [--runtime cloud,local] [--cases <file>] [--no-build] [--after-deploy]
//
// A ratchet: every case and place records whether it has EVER passed on the live server. A case that
// passed before and fails now is STOPPED WORKING, reported first; one that never passed is "not
// working yet". The model is in the loop, so a case is tried until it has the passes it needs (two;
// five for a request that failed for a person, "passes": 5, OLA-231) or fails twice; the result prints
// the count. A try that could not reach Ola (a lost connection) did not run: tried again, never counted. Since Nov 20 (OLA-251) "works" means two
// passes in a row: pass, pass is "passing"; two passes with a fail among three tries is "works
// sometimes (2 of 3)", its own status, never reported as works. Places as the tracker names them
// (scripts/venture/issues.mjs): this runner reaches cloud-web:chat (a project on app.ola.cx through
// the website's own API) and local-mac:chat (the Mac app's On this Mac, headless, the same opencode
// setup); every other place a case names is listed as "not run", never as passed.
//
// Run on the test server (the Mac mini), from a release or a checkout: it uses the live server's own
// admin tool (~/ola-staging/current) for the made-up account and the public address for the rest.
// A deploy that serves starts it by itself (ops/ola.mjs, `--after-deploy`), after it gives the
// machine's turn back; it takes a turn of its own (ops/turn.mjs), since a case runs the project's VM.
//
//   cloud-web:chat  a conversation in the made-up person's project on https://app.ola.cx, signed in
//                   with a name and password like anyone; the yes cards answered yes, Ola's
//                   questions answered the way someone who wants it done would.
//   local-mac:chat  olakit-selftest OLA_SERVE_LOCAL builds and starts opencode exactly as the Mac app
//                   does (its config, skills, web commands, ola-publish) in an empty folder, signed in
//                   to the same made-up account; talked to the way the app talks to it.
//
// Results (each case@place keeps its newest result; a run of some cases updates only those):
//   ~/ola-staging/asks-latest.json   what the dashboard and the hourly check read; the board gets its
//                                    summary in the status ops/watch.mjs pushes every 10 minutes
//   ~/ola-asks/log.jsonl             one line per run, with Ola's words
// A case is cited in a ticket check by its id and place: issues.mjs check OLA-n pass k --case <id>@<place>.
// Exit 0 only when every case that ran passed.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { AI, HERE, PLACES_REACHED, STATE, lostConnection, modelUsedUp, passesNeeded, ratchet, takeRunLock, triesDone, verdictOf, ask, checkMust, checkNever, cloudTransport, emptyProject, newSession, placesOf, prepareAccount, readCases, say, signIn, signOutAccount, startLocal, takeDownSites } from './lib.mjs'

const args = process.argv.slice(2)
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt)
const ONLY = arg('--case', null)?.split(',')
const RUNTIMES = arg('--runtime', 'local,cloud').split(',')
const STAGING = path.join(homedir(), 'ola-staging')
const LATEST = process.env.OLA_ASKS_LATEST || path.join(STAGING, 'asks-latest.json')
mkdirSync(STATE, { recursive: true })

// One run at a time: two would share the made-up account and empty each other's project (OLA-232:
// a run is long now, and a deploy starts one after every deploy).
// OLA-231 check 5: the run an update starts WAITS for a run that is going (a builder's or a checker's)
// and then runs, so every update is tested: it never steps aside. Only a newer update's run replaces a
// waiting one (it tests the newer release). While an update's run waits, a builder's run does not start
// ahead of it. A builder's run still leaves it to a run that is going, and says so.
const LOST_MAX = 3 // connection losses in a row before a case is "did not run" at a place
if (!(await takeRunLock({ after: args.includes('--after-deploy') }))) process.exit(0)
const cases = readCases(arg('--cases', undefined)).filter((c) => !ONLY || ONLY.includes(c.id))
if (!cases.length) throw new Error(`no case ${ONLY?.join(', ')} in the cases`)

// OLA-232: with a case per thing Ola can be asked, a run is long. Between cases it gives the turn
// to a deploy that is waiting, and takes it back after, so a deploy never waits for the whole run.
const TURN = await import(path.join(AI, 'ops/turn.mjs'))
let held = null
async function yieldToDeploy() {
  if (!held) return
  if (!TURN.waiting().some((t) => t.deploy)) return
  say('turn: a deploy is waiting; giving it the turn and taking it back after')
  held.release()
  held = await TURN.acquire({ label: turnLabel, on: (m) => say(`turn: ${m}`) })
  process.on('exit', held.release)
}
const t0 = Date.now()
// One turn on the machine at a time for anything that runs a project's VM, deploys first: the
// cloud cases take it (below); the local ones run no VM and go first, without it.
const turnLabel = args.includes('--after-deploy') ? 'asks after a deploy' : 'asks'
// After a deploy, the deploy kit installs and restarts the jobs once more: a minute for that first.
if (args.includes('--after-deploy')) await new Promise((r) => setTimeout(r, 60_000))
// What is live is read again for each case: a deploy can go first while the cloud cases wait for the turn.
const liveRelease = () => {
  try {
    return String(JSON.parse(readFileSync(path.join(STAGING, 'deployed.json'), 'utf8')).commit ?? 'unknown').slice(0, 12)
  } catch {
    return 'unknown'
  }
}
const release = liveRelease()
say(`asks: ${cases.length} case(s), runtimes ${RUNTIMES.join(', ')}, against the server running ${release}`)

const results = [] // one per case@place that ran, and one per place not run
let local = null
let password = null
try {
  password = await prepareAccount()
  const signedIn = await signIn(password)
  for (const runtime of RUNTIMES) {
    const place = Object.keys(PLACES_REACHED).find((p) => PLACES_REACHED[p] === runtime)
    if (!place) throw new Error(`unknown runtime ${runtime} (cloud or local)`)
    const mine = cases.filter((c) => placesOf(c).includes(place))
    if (!mine.length) continue
    let T
    try {
      if (runtime === 'cloud') {
        held = await TURN.takeTurn(turnLabel)
        T = cloudTransport(signedIn)
      }
      else {
        ensureLocalOpencode()
        local = await startLocal(password, { build: !args.includes('--no-build') })
        T = local
        say(`local runtime up; skills: ${(local.skills ?? []).join('; ').slice(0, 300)}`)
      }
    } catch (e) {
      for (const c of mine) results.push(row(c, place, { ok: false, why: `the ${runtime} runtime did not start: ${e.message}`, tries: [] }))
      say(`FAIL  ${place}: did not start: ${e.message}`)
      continue
    }
    let usedUp = null // the made-up account's model allowance ran out at this place: the rest did not run
    for (const c of mine) {
      if (usedUp) {
        results.push({ id: c.id, place, say: c.say, ok: null, didNotRun: true, release: liveRelease(), why: `did not run: ${usedUp}`, ticket: c.from?.ticket ?? null })
        continue
      }
      // Until it has the passes it needs (two, or five for a request that failed for a person) or fails twice.
      const need = passesNeeded(c)
      const tries = []
      const lost = [] // tries that could not reach Ola: did not run, tried again, never counted
      while (!triesDone(tries, need) && lost.length < LOST_MAX) {
        const s0 = Date.now()
        let r
        try {
          r = await runCase(T, c)
        } catch (e) {
          r = lostConnection(e) ? { ok: null, why: `did not run: the connection to Ola was lost (${e.message})` } : { ok: false, why: `the run broke: ${e.message}` }
        }
        r.secs = Math.round((Date.now() - s0) / 1000)
        // Refused for the account's model allowance, not by Ola: not counted, and nothing more runs here.
        if (r.ok === false && (usedUp = modelUsedUp(r))) {
          say(`  did not run  ${c.id}@${place} (${r.secs} s): ${usedUp}; the rest of ${place} is not run, not counted`)
          break
        }
        if (r.ok === null) {
          lost.push(r)
          say(`  did not run  ${c.id}@${place} (${r.secs} s): ${r.why}; trying again in 20 s, not counted`)
          await new Promise((res) => setTimeout(res, 20_000))
        } else {
          tries.push(r)
          say(`  try ${tries.length}: ${r.ok ? 'pass' : 'fail'}  ${c.id}@${place} (${r.secs} s, ${tries.filter((t) => t.ok).length} of ${need} passes needed): ${r.why}`)
        }
        // A page from this try is taken down, so the next try has to publish its own.
        try {
          takeDownSites()
        } catch (e) {
          say(`  taking the try's pages down: ${e.message}`)
        }
        // OLA-250: taking the pages down blocks for ~20 s, and the local server resets the socket
        // left open meanwhile; the next try's first call (a POST, never sent again) broke on it with
        // ECONNRESET after every pass on Nov 20. A read first (tried again on a reset) gets a fresh one.
        await T.call('GET', '/api/session').catch(() => {})
      }
      await yieldToDeploy()
      if (usedUp) {
        results.push({ id: c.id, place, say: c.say, ok: null, didNotRun: true, release: liveRelease(), why: `did not run: ${usedUp}; ${tries.length} tr${tries.length === 1 ? 'y' : 'ies'} counted before that`, ticket: c.from?.ticket ?? null })
        continue
      }
      if (!triesDone(tries, need)) {
        // The connection kept failing: the case did not run here; its earlier result stands.
        results.push({ id: c.id, place, say: c.say, ok: null, didNotRun: true, release: liveRelease(), why: `did not run: the connection to Ola was lost ${lost.length} times (${lost.at(-1)?.why ?? ''}); ${tries.length} tr${tries.length === 1 ? 'y' : 'ies'} counted before that`, ticket: c.from?.ticket ?? null })
        continue
      }
      const v = verdictOf(tries, need)
      const last = tries.findLast((t) => t.ok === v.ok) ?? tries.at(-1)
      results.push(row(c, place, { ...last, ok: v.ok, tries, verdict: v, lost: lost.length, need }))
    }
    if (runtime === 'local' && local) say(`local runtime ${await local.stop()}`), (local = null)
  }
} finally {
  if (local) await local.stop().catch(() => {})
  if (password) {
    try {
      for (const d of [...takeDownSites(), signOutAccount()]) say(`cleanup: ${d}`)
    } catch (e) {
      say(`cleanup FAILED: ${e.message}`)
    }
  }
}
// The places a case names that this runner cannot reach: listed, never passed.
for (const c of cases) for (const p of placesOf(c)) if (!PLACES_REACHED[p] || !RUNTIMES.includes(PLACES_REACHED[p])) results.push({ id: c.id, place: p, status: 'not run', ok: null, why: PLACES_REACHED[p] ? 'not in this run (--runtime)' : 'this runner cannot reach it headlessly', ticket: c.from?.ticket ?? null, say: c.say })

function row(c, place, r) {
  const tries = r.tries ?? []
  return {
    id: c.id,
    place,
    say: c.say,
    ok: !!r.ok,
    release: liveRelease(),
    tries: `${tries.filter((t) => t.ok).length} of ${tries.length} passed${r.need ? `, ${r.need} needed` : ''}${r.lost ? `, ${r.lost} did not run (connection lost)` : ''}`,
    sometimes: r.verdict?.status === 'works sometimes',
    verdict: r.verdict?.verdict ?? (r.ok ? 'works' : 'fails'),
    why: r.why,
    ticket: c.from?.ticket ?? null,
    secs: tries.reduce((s, t) => s + (t.secs ?? 0), 0),
    answer: (r.answer ?? '').slice(0, 1200),
    steps: r.steps ?? [],
    answered: r.answered ?? [],
  }
}

async function runCase(T, c) {
  if (T.runtime === 'cloud') emptyProject()
  else T.empty()
  for (const step of c.setup ?? []) {
    if (step.claudeWrote) T.claudeWrote(step.claudeWrote.path, step.claudeWrote.text)
    else if (step.wrote) T.wrote(step.wrote.path, step.wrote.from ? { base64: readFileSync(path.join(HERE, 'fixtures', path.basename(step.wrote.from))).toString('base64') } : step.wrote)
    else throw new Error(`unknown setup step ${JSON.stringify(step)}`)
  }
  const before = await T.listFiles()
  const since = Date.now() - 2000
  let sid = await newSession(T, `asks ${c.id}`)
  const sessions = [sid]
  const limit = (c.limitMin ?? 8) * 60_000
  const end = Date.now() + limit
  const steps = []
  const answered = []
  // One request, and the person's "yes" when Ola ends on a question (twice at most).
  async function converse(text) {
    let turn = await ask(T, sid, text, Math.max(end - Date.now(), 1000))
    const texts = [...turn.texts]
    steps.push(...turn.tools.map((t) => `${t.name}: ${String(t.input).slice(0, 160)}`))
    answered.push(...turn.answered)
    for (let i = 0; i < 2 && turn.status === 'done' && endsOnQuestion(turn.texts.at(-1) ?? '') && Date.now() < end; i++) {
      answered.push(`said in the conversation: ${c.yes ?? 'Yes, go ahead.'}`)
      turn = await ask(T, sid, c.yes ?? 'Yes, go ahead.', end - Date.now())
      texts.push(...turn.texts)
      steps.push(...turn.tools.map((t) => `${t.name}: ${String(t.input).slice(0, 160)}`))
      answered.push(...turn.answered)
    }
    return { turn, text: texts.join('\n\n') }
  }
  // OLA-250: what the person said first in the same conversation ("make a page and publish it",
  // then "publish it again" or "take it down"). Not judged, but it has to finish.
  const earlier = []
  // OLA-267 "separate": each sentence in a conversation of its own, the way a person comes back
  // another day to a project that published before (the fault hid in one long conversation).
  for (const [i, said] of (c.before ?? []).entries()) {
    if (c.separate && i) sessions.push((sid = await newSession(T, `asks ${c.id} ${i + 1}`)))
    const { turn, text } = await converse(said)
    earlier.push(text)
    if (turn.status !== 'done') return { answer: earlier.join('\n\n'), steps, answered, ok: false, why: `"${said}", said first, ended ${turn.status}; Ola said: ${oneLine(text)}` }
  }
  if (c.separate && c.before?.length) sessions.push((sid = await newSession(T, `asks ${c.id} last`)))
  const from = steps.length // noran: judges only the steps of the request itself, not what was said first (OLA-244)
  const { turn, text: answer } = await converse(c.say)
  const base = { answer, steps, answered }
  if (turn.status !== 'done') return { ...base, ok: false, why: `the turn ended ${turn.status}${turn.error ? ` (${turn.error})` : ''}; Ola said: ${oneLine(answer)}` }
  const fails = []
  const notes = []
  for (const m of c.must) {
    const r = await checkMust(m, T, answer, { steps, lastSteps: steps.slice(from), before, earlier: earlier.join('\n\n'), since, sessions })
    ;(r.ok ? notes : fails).push(`${m}: ${r.why}`)
  }
  const never = checkNever(c, answer, { done: !fails.length })
  if (never.length) fails.push(`Ola ${never.join(', and ')}`)
  return { ...base, ok: !fails.length, why: fails.length ? `${fails.join('; ')}. Ola said: ${oneLine(answer)}` : notes.join('; ') }
}
function endsOnQuestion(t) {
  return /\?\s*\**\s*$/.test(t.trim()) || /\b(shall i|should i|do you want me to|would you like me to|want me to|ready to publish)\b/i.test(t.slice(-300))
}
function oneLine(s) {
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length > 360 ? `${t.slice(0, 360)}…` : t || '(nothing)'
}
/** opencode 2.3.0 where the Mac app's local runtime looks for it (user-level, the pinned package). */
function ensureLocalOpencode() {
  const bin = path.join(homedir(), 'Library/Application Support/Ola/opencode/node_modules/.bin/opencode')
  if (existsSync(bin)) return
  const r = spawnSync('/bin/bash', [path.join(AI, 'apple/tools/install-local-opencode.sh')], { encoding: 'utf8', timeout: 600_000 })
  if (r.status !== 0) throw new Error(`installing opencode for the local runtime: ${(r.stderr || '').trim().slice(-200)}`)
}

// ---------------------------------------------------------------- the ratchet and the record
const now = new Date().toISOString()
const secs = Math.round((Date.now() - t0) / 1000)
let table = { cases: {} }
try {
  table = JSON.parse(readFileSync(LATEST, 'utf8'))
} catch {}
table = ratchet(table, results, { now, release, known: new Set(readCases(arg('--cases', undefined)).flatMap((c) => placesOf(c).map((p) => `${c.id}@${p}`))), lastRun: { at: now, release, secs, afterDeploy: args.includes('--after-deploy'), cases: ONLY ?? 'all', runtimes: RUNTIMES } })
mkdirSync(path.dirname(LATEST), { recursive: true })
writeFileSync(LATEST, JSON.stringify(table, null, 2) + '\n')
appendFileSync(path.join(STATE, 'log.jsonl'), JSON.stringify({ at: now, release, secs, results }) + '\n')

const order = { 'STOPPED WORKING': 0, 'not working yet': 1, 'did not run': 2, 'works sometimes': 3, passing: 4, 'not run': 5 }
const ran = results.filter((r) => r.ok !== null)
const lostOnes = results.filter((r) => r.didNotRun)
console.log('')
for (const r of [...results].sort((a, b) => order[a.status] - order[b.status])) {
  const head = r.status === 'STOPPED WORKING' ? 'STOPPED WORKING (it worked before)' : r.status === 'works sometimes' || r.status === 'passing' ? r.verdict : r.status === 'did not run' ? `did not run (${/allowance/.test(r.why) ? 'model allowance used up' : 'connection lost'})` : r.status
  console.log(`${head.padEnd(34)} case ${`${r.id}@${r.place}`.padEnd(38)} ${r.tries ? `${r.tries}, ${r.secs} s, on ${r.release}` : ''}  ${r.ticket ?? ''}`)
  console.log(`${''.padEnd(34)}   "${r.say.slice(0, 110)}"${r.ok === false || r.ok === null ? `\n${''.padEnd(34)}   ${String(r.why).slice(0, 400)}` : ''}`)
}
console.log(`\n${ran.filter((r) => r.ok && !r.sometimes).length} of ${ran.length} work (every try passed, 2 or 5 needed)${ran.some((r) => r.sometimes) ? `, ${ran.filter((r) => r.sometimes).length} work sometimes` : ''} on ${release} in ${Math.floor(secs / 60)} min ${secs % 60} s; ${lostOnes.length ? `${lostOnes.length} did not run (the connection to Ola was lost or the model allowance was used up, not counted); ` : ''}${results.length - ran.length - lostOnes.length} place(s) not run. Results: ${LATEST}`)
console.log(`Cite a case in a ticket check: issues.mjs check OLA-n pass <k> --case <id>@<place> --on ${release}`)
process.exit(ran.every((r) => r.ok) ? 0 : 1)
