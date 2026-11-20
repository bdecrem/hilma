#!/usr/bin/env node
// Automatic checks on every change to main (OLA-84). launchd cx.ola.ci runs `node ops/ola.mjs ci`
// every 10 minutes on the staging machine; one run:
//
//   1. git fetch in ~/ola-staging, and look at the newest commit on origin/main (the tip).
//   2. If a check already has a result for the tip, that is its result; so is a deploy's, unless the
//      tip changed the Mac and iPhone apps' code (apple/), whose swift test only a check runs.
//   3. If the tip changed nothing under apps/activist-ai since the newest commit that has a result,
//      the tip carries that result ("same": the suites would run the same code).
//   4. If the tip is younger than SETTLE_MIN (20) minutes, wait: whoever pushed it usually deploys
//      it within minutes, and a deploy runs the same suites. No suite runs twice for one commit.
//   5. Otherwise check it: `ola.mjs check` (the deploy's suites plus OlaKit's swift test, nothing
//      served; it gives the machine's turn to any deploy that arrives and is tried again next run).
//
// Each result for the tip is posted once to GitHub as a commit status (context "ola/checks", by
// the gh login on this machine; a status is a mark on our own repo, it notifies no one), and kept in
// ~/ola-staging/checks.json, which the alarm (ops/watch.mjs) puts on the board. When the tip fails
// after a commit that passed, a tracker issue is opened (scripts/venture/issues.mjs in the runner's
// checkout, ~/hilma-venture), so the runner on this machine fixes it before anything new: one issue
// per failure, not one per run. Nothing here texts anyone (rule 40: the runner owns the fix).
//
//   node ops/ola.mjs ci          one run
//   node ops/ola.mjs ci --dry    what it would do, nothing run, posted or written
//
// OLA_CI_SETTLE_MIN, OLA_CI_ISSUES (the issues.mjs to use; "none" for no issue), OLA_CI_GH ("none"
// for no GitHub status), OLA_CI_REPO (default bdecrem/hilma) override the defaults.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const SETTLE_MIN = Number(process.env.OLA_CI_SETTLE_MIN ?? 20)
const REPO = process.env.OLA_CI_REPO || 'bdecrem/hilma'
const GH = process.env.OLA_CI_GH || (existsSync('/opt/homebrew/bin/gh') ? '/opt/homebrew/bin/gh' : 'gh')
const ISSUES = process.env.OLA_CI_ISSUES || path.join(homedir(), 'hilma-venture/scripts/venture/issues.mjs')
const NODE = existsSync('/opt/homebrew/bin/node') ? '/opt/homebrew/bin/node' : process.execPath

/** deploys.log lines → { commit12: { ok, why, at } }, the newest line for a commit winning. */
export function parseDeploys(text) {
  const out = {}
  for (const line of String(text).split('\n')) {
    const m = /^(\S+) (deployed|refused) ([0-9a-f]{12}) \([^)]*\)(?:;|:)? ?(.*)$/.exec(line)
    if (m) out[m[3]] = { ok: m[2] === 'deployed', why: m[2] === 'refused' ? m[4] : null, at: m[1], suitesText: m[2] === 'deployed' ? m[4] : '' }
  }
  return out
}
/** "gateway 47 of 47, web 158 of 158 UNSIGNED…" → { gateway: '47 of 47', … } */
export function parseSuites(text) {
  const out = {}
  for (const m of String(text).matchAll(/(\w+) (\d+ of \d+)/g)) out[m[1]] = m[2]
  return out
}

/**
 * A check that waited for the turn behind a deploy of its own commit takes that deploy's result
 * instead of running the same suites again (about 20 minutes): its own suites so far (the apps'
 * swift test, which a deploy does not run) plus the deploy's. Only a passed deploy counts; a
 * refused one is run again, since a refusal can be the machine (a restart that did not answer).
 * Returns the merged suites, or null.
 */
export function coveredByDeploy(deploysText, commit12, ownSuites = {}) {
  const d = parseDeploys(deploysText)[commit12]
  if (!d?.ok) return null
  const suites = parseSuites(d.suitesText)
  if (!Object.keys(suites).length) return null
  return { ...ownSuites, ...suites, at: d.at }
}

/**
 * What to do about the tip. Pure: every fact is passed in.
 *   runs      checks.json's runs (newest first)
 *   deploys   parseDeploys(deploys.log)
 *   base      the newest commit with a result that is an ancestor of the tip, or null
 *   baseSame  the tip changes nothing under apps/activist-ai since base
 *   appsSame  the tip changes nothing under apps/activist-ai/apple since base (a deploy does not
 *             run the apps' swift test, so a passed deploy settles the tip only when this holds)
 * → { do: 'known' | 'same' | 'wait' | 'check', result? }
 */
export function decide({ tip, tipAt, now, runs, deploys, base = null, baseSame = false, appsSame = false, settleMin = SETTLE_MIN }) {
  const known = runs.find((r) => r.commit === tip && (r.ok === true || r.ok === false))
  if (known) return { do: 'known', result: known }
  const d = deploys[tip.slice(0, 12)]
  if (d && (!d.ok || appsSame)) return { do: 'known', result: { commit: tip, ok: d.ok, suites: parseSuites(d.suitesText), why: d.why, by: 'deploy', at: d.at }, record: true }
  if (base && baseSame) {
    const b = runs.find((r) => r.commit === base) ?? (deploys[base.slice(0, 12)] && { ok: deploys[base.slice(0, 12)].ok, suites: parseSuites(deploys[base.slice(0, 12)].suitesText), why: deploys[base.slice(0, 12)].why })
    if (b && b.ok !== null && b.ok !== undefined) return { do: 'same', result: { commit: tip, ok: b.ok, suites: b.suites ?? {}, why: b.why ?? null, by: 'same', same: base, at: new Date(now).toISOString() }, record: true }
  }
  if (now - tipAt < settleMin * 60e3) return { do: 'wait', minutes: Math.ceil((settleMin * 60e3 - (now - tipAt)) / 60e3) }
  return { do: 'check' }
}

/** The GitHub commit status for a result. */
export function ghStatus(r) {
  const n = Object.values(r.suites ?? {}).reduce((a, v) => {
    const m = /^(\d+) of (\d+)$/.exec(v)
    return m ? [a[0] + Number(m[1]), a[1] + Number(m[2])] : a
  }, [0, 0])
  const how = r.by === 'same' ? ` (no Ola change since ${r.same.slice(0, 8)})` : r.by === 'deploy' ? ' (at its deploy)' : r.by === 'check+deploy' ? ' (apps here, the rest at its deploy)' : ''
  if (r.ok) return { state: 'success', description: `${n[1] ? `${n[0]} of ${n[1]} checks passed` : 'passed'}${how}`.slice(0, 140) }
  return { state: 'failure', description: `${r.why || 'failed'}${how}`.slice(0, 140) }
}

/** Whether this failure opens an issue: the tip failed and the result before it (another commit) passed. */
export function opensIssue(result, runs) {
  if (result.ok !== false) return false
  const prev = runs.find((r) => r.commit !== result.commit && r.ok !== null && r.ok !== undefined)
  return !prev || prev.ok === true
}

export async function ciOnce({ STAGING, check, dry = false }) {
  const git = (...a) => spawnSync('/usr/bin/git', ['-C', STAGING, ...a], { encoding: 'utf8' })
  const say = (m) => console.log(`${new Date().toISOString()} ${m}`)
  const f = git('fetch', '--quiet', 'origin')
  if (f.status !== 0) return say(`git fetch failed: ${f.stderr.trim()}`), 1
  const tip = git('rev-parse', 'origin/main').stdout.trim()
  const tipAt = Number(git('log', '-1', '--format=%ct', tip).stdout.trim()) * 1000
  const file = path.join(STAGING, 'checks.json')
  const read = () => {
    try {
      return JSON.parse(readFileSync(file, 'utf8')).runs ?? []
    } catch {
      return []
    }
  }
  const runs = read()
  const deploys = parseDeploys(existsSync(path.join(STAGING, 'deploys.log')) ? readFileSync(path.join(STAGING, 'deploys.log'), 'utf8') : '')
  // The base: the newest commit with a result that the tip descends from.
  const candidates = [...runs.filter((r) => r.ok === true || r.ok === false).map((r) => r.commit)]
  for (const short of Object.keys(deploys)) {
    const full = git('rev-parse', '--verify', '--quiet', `${short}^{commit}`).stdout.trim()
    if (full) candidates.push(full)
  }
  let base = null
  let baseAt = 0
  for (const c of new Set(candidates)) {
    if (c === tip || git('merge-base', '--is-ancestor', c, tip).status !== 0) continue
    const at = Number(git('log', '-1', '--format=%ct', c).stdout.trim())
    if (at > baseAt) (base = c), (baseAt = at)
  }
  const baseSame = !!base && git('diff', '--quiet', base, tip, '--', 'apps/activist-ai').status === 0
  const appsSame = !!base && git('diff', '--quiet', base, tip, '--', 'apps/activist-ai/apple').status === 0
  const d = decide({ tip, tipAt, now: Date.now(), runs, deploys, base, baseSame, appsSame })
  const short = tip.slice(0, 12)
  if (d.do === 'wait') return say(`${short}: ${d.minutes} min until it is checked (a deploy usually covers it first)`), 0
  if (dry) return say(`${short}: would ${d.do}${d.result ? ` (${d.result.ok ? 'passed' : 'failed'} by ${d.result.by})` : ''}${base ? `; base ${base.slice(0, 12)}${baseSame ? ', no Ola change since' : ''}` : ''}`), 0

  let result = d.result
  if (d.record) result = save(file, read(), result)
  if (d.do === 'check') {
    // A check started by hand (or a run still going) holds check.lock: this run leaves it alone.
    const lock = path.join(STAGING, 'check.lock')
    const holder = existsSync(lock) ? Number(readFileSync(lock, 'utf8')) || 0 : 0
    let busy = false
    try {
      busy = holder > 0 && process.kill(holder, 0)
    } catch {}
    if (busy) return say(`${short}: another check is running (pid ${holder}); tried again next run`), 0
    // No 'pending' is posted first: a check that gives its turn to a deploy, or a tip that main
    // moves past, would leave the commit pending on GitHub for good (d1917909, cfea28b8, 56f05fc7).
    say(`${short}: checking`)
    result = await check(tip)
    if (!result || result.yielded) return say(`${short}: gave the turn to a deploy; tried again next run`), 0
  }
  say(`${short}: ${result.ok ? 'passed' : `FAILED (${result.why})`} by ${result.by}`)
  if (!result.posted) {
    if (post(tip, ghStatus(result))) result = save(file, read(), { ...result, posted: true })
  }
  if (opensIssue(result, read()) && !result.issue) {
    const id = openIssue(tip, result)
    if (id) save(file, read(), { ...result, issue: id })
  }
  return result.ok ? 0 : 1

  function post(sha, st) {
    if (GH === 'none') return false
    const r = spawnSync(GH, ['api', '-X', 'POST', `repos/${REPO}/statuses/${sha}`, '-f', `state=${st.state}`, '-f', 'context=ola/checks', '-f', `description=${st.description}`], { encoding: 'utf8' })
    if (r.status !== 0) say(`GitHub status not posted: ${(r.stderr || '').trim().split('\n').pop()}`)
    return r.status === 0
  }
  function openIssue(sha, r) {
    if (ISSUES === 'none' || !existsSync(ISSUES)) return say('no tracker here: no issue opened'), null
    const what = `The automatic checks on the staging machine (ops/ci.mjs) fail on ${sha.slice(0, 12)}, after the commit before it passed: ${r.why}. The full output: ${r.log || 'the check log in ~/Library/Logs/ola'}. Fix main before new work (rule 36).`
    const a = spawnSync(NODE, [ISSUES, 'add', `Ola's automatic checks fail on main (${sha.slice(0, 8)})`, '--area', 'ops', '--pri', 'P1', '--what', what, '--who', 'runner'], { encoding: 'utf8', cwd: path.dirname(ISSUES) })
    const id = /OLA-\d+/.exec(a.stdout || '')?.[0] ?? null
    say(id ? `opened ${id}` : `issue not opened: ${(a.stderr || a.stdout || '').trim().split('\n').pop()}`)
    return id
  }
}

function save(file, runs, run) {
  const all = [run, ...runs.filter((x) => x.commit !== run.commit)].slice(0, 50)
  writeFileSync(file, JSON.stringify({ runs: all }, null, 2) + '\n')
  return run
}
