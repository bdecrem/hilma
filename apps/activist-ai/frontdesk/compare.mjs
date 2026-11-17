// "Compare with Claude": scoring Ola's real work against Claude, so Ola keeps getting better.
//
// Two ways, both owner-only:
//
//   a made-up copy (mode "twin", the default; nothing of the person's leaves this machine)
//     1. In the project's sealed VM, `ola-twin make` asks Ola's own model for a copy of a finished
//        request: the request in general terms, a generator that writes stand-in files of the same
//        shape, and checks a program runs. The leak check compares it with the project's own text
//        and numbers. "leak": it stays there. "unsure": it is held until the owner reads it and
//        says yes. "clean": it may leave the VM; the front desk keeps it under $OLA_HOME/compare.
//     2. Ola does the copy in a scratch sealed VM; Claude does it in another (Claude Code through
//        the gateway, with a grant for that scratch VM only, never in the project); the hosted open
//        model too, where it is set up and on for the project. Each scratch VM holds only the copy.
//     3. Scoring, in order of trust: the copy's own checks (run by `ola-twin score` in each scratch
//        VM after its run), the eval families' checks for its kind, then a judged comparison:
//        unlabeled results in random order, a rubric per kind, evidence quoted for every point (a
//        quote not found in that result drops the point), run twice with the order swapped;
//        disagreements are "unsure", never averaged.
//
//   the real task (mode "real"; only with the owner's yes: the project's switch, or "Just this once")
//     Claude redoes the finished request in a scratch VM holding copies of exactly the files Ola
//     read (the person's files are never changed), and the results are judged the same way. The
//     record of it stays in the project's VM (`ola-twin keep`); the platform database keeps numbers.
//
// Credentials and money follow Fallback to Claude exactly (claude.mjs): the subscription only when
// every owner of the project is an admin, an API key otherwise, and with no credential for that
// mode the feature says so and offers nothing that sends. A comparison's outside cost (Claude's run
// and the judge's calls) counts against the project's own monthly comparison budget; the scratch
// VM's gateway grant carries what is left of it as its ceiling.
//
// What comes of it: every copy Ola lost (or that was unsure) becomes a candidate eval task in the
// eval set's format (evals/candidates/<id>/, never added to the repo by itself), with a note in
// the skills' "how to improve a skill from a failed run" form; and a weekly number (weekly.json).
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { audit } from './db.mjs'
import { modeFor } from './claude.mjs'
import { permissionsFor } from '../web/server/proxy.mjs'
import { webRules } from '../web/server/webask.mjs'
import * as ws from '../workspace/ws.mjs'
import { TWIN_UID } from '../workspace/ws.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const AUTO = ['ask', 'daily']
export const KINDS = ['clean', 'sql', 'coding', 'legal', 'site', 'honesty', 'pdf', 'writing', 'chart', 'other']
export const OUTCOMES = ['both_right', 'claude_better', 'ola_better', 'both_wrong', 'unsure']
export const LABELS = JSON.parse(readFileSync(path.join(HERE, '../evals/lib/labels.json'), 'utf8')).failure_labels
const ID = /^[0-9a-f]{12}$/
const SID = /^[A-Za-z0-9_-]{1,80}$/
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const CONSENT_REAL = 'Let Claude redo finished work in this project so we can compare. Your request and the files Ola read for it go to Anthropic. So do Ola’s answer and the files it wrote. Off unless you turn it on. Every time is shown here.'

export function compareConfig(env = process.env) {
  const home = env.OLA_HOME || path.join(homedir(), '.ola')
  const num = (name, dflt, min, max) => {
    const v = env[name] === undefined ? dflt : Number(env[name])
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}`)
    return v
  }
  const prefix = env.OLA_FD_COMPARE_PREFIX || 'cmp'
  if (!/^[a-z][a-z0-9]{1,8}$/.test(prefix)) throw new Error('OLA_FD_COMPARE_PREFIX is 2 to 9 lowercase letters or digits')
  return {
    dir: env.OLA_FD_COMPARE_DIR || path.join(home, 'compare'),
    // The review queue: on this machine, beside the eval set, never added to the repo by itself (evals/.gitignore).
    candidates: env.OLA_FD_CANDIDATES_DIR || path.join(HERE, '../evals/candidates'),
    capMicroUsd: Math.round(num('OLA_FD_COMPARE_CAP_USD', 3, 0, 1000) * 1e6),
    tickMs: num('OLA_FD_COMPARE_TICK_MS', 300_000, 1000, 86_400_000),
    engineMs: num('OLA_FD_COMPARE_ENGINE_MIN', 15, 0.2, 120) * 60_000,
    judgeModel: env.OLA_FD_COMPARE_JUDGE_MODEL || 'claude-opus-5-5',
    claudeModel: env.OLA_FD_COMPARE_CLAUDE_MODEL || null,
    olaModelName: env.OLA_FD_MODEL_LABEL || 'general',
    prefix,
    // For a live proof on someone's personal allowance: the most Claude requests one comparison may
    // make (Claude Code's and the judge's together, by the gateway's count). Unset: no limit.
    claudeRequestLimit: env.OLA_FD_COMPARE_CLAUDE_REQUESTS ? num('OLA_FD_COMPARE_CLAUDE_REQUESTS', 4, 1, 100) : null,
    // List prices in dollars per million tokens, for the budget in subscription mode too (an equivalent).
    priceIn: num('OLA_FD_COMPARE_PRICE_IN', 5, 0, 1000),
    priceOut: num('OLA_FD_COMPARE_PRICE_OUT', 25, 0, 1000),
  }
}

/** The month's comparisons cost of a project, in millionths of a dollar. */
export function spentThisMonth(db, wsId, now = Date.now()) {
  const d = new Date(now)
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  return db.prepare('SELECT coalesce(sum(cost_micro_usd), 0) AS c FROM comparisons WHERE workspace_id = ? AND created_at >= ?').get(wsId, start).c
}

/**
 * The sampler's choice ("A few each day, on their own"): projects with it on that have a sample left
 * today and budget left this month. Pure but for the database, so the budget stop is tested alone.
 */
export function samplerChoice(db, xc, now = Date.now()) {
  const d = new Date(now)
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const out = []
  for (const w of db.prepare("SELECT id, slug, compare_per_day AS perDay, compare_cap_micro_usd AS cap FROM workspaces WHERE status = 'active' AND compare_auto = 'daily' ORDER BY slug").all()) {
    const today = db.prepare("SELECT count(*) AS n FROM comparisons WHERE workspace_id = ? AND trigger = 'sampled' AND created_at >= ?").get(w.id, day).n
    if (today >= w.perDay) continue
    if (spentThisMonth(db, w.id, now) >= (w.cap ?? xc.capMicroUsd)) continue
    out.push({ id: w.id, slug: w.slug })
  }
  return out
}

// ------------------------------------------------------------------ judging

const RUBRIC = {
  clean: 'the cleaned data is right (rows kept and dropped, totals), the problems in the data are found and said',
  sql: 'the numbers answer the question asked, the query reads the right rows once',
  coding: 'every coded value is right and its quote is word for word from the source',
  legal: 'the provisions found are the right ones, cited by article, quoted in the original',
  site: 'the page shows the right numbers, works at phone width, loads nothing from outside',
  honesty: 'what cannot be answered from the data is said plainly, nothing is invented',
  pdf: 'figures are read from the right page and table, with page references',
  writing: 'the text says what was asked, every figure and quote has its source',
  chart: 'the chart draws the right numbers, says its source and what was left out',
  other: 'the result does what was asked',
}
export const JUDGE_SYSTEM = `OLA-COMPARE-JUDGE. You compare two results of the same task, Result A and Result B, made by two assistants you do not know. Judge only what is in them.
Criteria: correct; complete; honest about gaps; caveats said first; usable as delivered.
For each criterion say which is better (A, B or same) and quote the evidence from each result, word for word (a short quote; empty if there is none).
Answer with one JSON object and nothing else:
{"points": [{"criterion", "better": "A"|"B"|"same", "evidence_a", "evidence_b"}], "overall": "A"|"B"|"same", "difference": "one or two plain sentences on what differs, naming them Result A and Result B", "label_for_worse": one failure label from this list or "unknown": LABELS}`

/** The material the judge reads: the task, then both results, unlabeled. */
export function judgeMaterial({ kind, request, first, second }) {
  const show = (r) => [`Final message:\n${r.final || '(none)'}`, ...(r.outputs ?? []).filter((o) => o.text != null).slice(0, 8).map((o) => `File ${o.name}:\n${o.text}`), ...(r.outputs ?? []).filter((o) => o.text == null).slice(0, 20).map((o) => `File ${o.name} (${o.size} bytes, not text)`)].join('\n\n').slice(0, 60_000)
  return `The task (${kind}): ${request}\nWhat matters most for this kind of work: ${RUBRIC[kind] ?? RUBRIC.other}.\n\n<result A>${show(first)}</result>\n\n<result B>${show(second)}</result>`
}

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const textOfResult = (r) => squash([r.final, ...(r.outputs ?? []).map((o) => o.text ?? '')].join(' '))

/**
 * One judge reply, read: points whose quoted evidence is not in its result are dropped; an overall
 * call no kept point supports becomes "same". Returns { overall: 'A'|'B'|'same', difference, label, points }.
 */
export function readJudgement(text, first, second) {
  let j
  try {
    const a = text.indexOf('{')
    j = JSON.parse(text.slice(a, text.lastIndexOf('}') + 1))
  } catch {
    return null
  }
  const ta = textOfResult(first)
  const tb = textOfResult(second)
  const found = (q, t) => !squash(q) || t.includes(squash(q))
  const points = (Array.isArray(j.points) ? j.points : []).slice(0, 10).filter((p) => ['A', 'B', 'same'].includes(p?.better) && found(p.evidence_a, ta) && found(p.evidence_b, tb) && (p.better === 'same' || squash(p.better === 'A' ? p.evidence_a : p.evidence_b)))
  let overall = ['A', 'B', 'same'].includes(j.overall) ? j.overall : 'same'
  if (overall !== 'same' && !points.some((p) => p.better === overall)) overall = 'same'
  const label = LABELS.includes(j.label_for_worse) && j.label_for_worse !== 'success' ? j.label_for_worse : 'unknown'
  return { overall, difference: String(j.difference ?? '').slice(0, 400), label, points: points.map((p) => ({ criterion: String(p.criterion ?? '').slice(0, 40), better: p.better, evidence_a: String(p.evidence_a ?? '').slice(0, 300), evidence_b: String(p.evidence_b ?? '').slice(0, 300) })) }
}

/**
 * The judge, twice, with the order swapped. ask(material) -> reply text. Engines `x` and `y` are
 * shown in a random order first, then swapped. Agreement names the winner ('x', 'y' or 'same');
 * disagreement is 'unsure'. The difference is written with the engines' names.
 */
export async function judgeTwice({ kind, request, x, y, names, ask, coin = Math.random() < 0.5 }) {
  const orders = coin ? [[x, y], [y, x]] : [[y, x], [x, y]]
  const runs = []
  for (const [first, second] of orders) {
    const text = await ask(judgeMaterial({ kind, request, first, second }))
    const j = readJudgement(text ?? '', first, second)
    const who = (v) => (v === 'same' ? 'same' : (v === 'A' ? first : second) === x ? 'x' : 'y')
    runs.push(j ? { ...j, winner: who(j.overall), a: first === x ? 'x' : 'y' } : { winner: 'unread', difference: '', label: 'unknown', points: [], a: first === x ? 'x' : 'y' })
  }
  const verdict = runs[0].winner === runs[1].winner && runs[0].winner !== 'unread' ? runs[0].winner : 'unsure'
  const r0 = runs[0]
  const nameOf = (side) => names[side]
  const difference = (r0.difference || '').replace(/\bResult A\b/g, nameOf(r0.a)).replace(/\bResult B\b/g, nameOf(r0.a === 'x' ? 'y' : 'x'))
  return { verdict, runs, difference, label: runs[0].label === runs[1].label ? runs[0].label : runs.find((r) => r.label !== 'unknown')?.label ?? 'unknown' }
}

/** Checks first, then the judge (README, "Compare with Claude"). */
export function outcomeOf({ ola, claude, judged }) {
  const hasChecks = ola?.total > 0 && claude?.total > 0
  if (hasChecks && ola.all !== claude.all) return claude.all ? 'claude_better' : 'ola_better'
  const bothPassed = hasChecks && ola.all && claude.all
  if (judged === 'same') return hasChecks && !bothPassed ? 'both_wrong' : 'both_right'
  if (judged === 'x') return 'ola_better'
  if (judged === 'y') return 'claude_better'
  return bothPassed ? 'both_right' : 'unsure'
}

// ------------------------------------------------------------------ what comes of a lost copy

const SKILL_FOR = { chart: 'chart', writing: 'report', site: 'design-pass', clean: 'workbook', coding: 'batch-quotes', pdf: 'report' }
const FIX_FOR = {
  numbers_wrong: 'recompute every total with a short program from the cleaned file, and reconcile rows in, rows dropped and rows out before answering',
  missed_planted_problem: 'look for repeated rows, blanks, mixed formats and spelling variants before cleaning, and say what was found',
  stopped_early: 'write every file the request asks for before the final answer, and name each one',
  claimed_done_not_done: 'write every file the request asks for before the final answer, and name each one',
  quote_not_verbatim: 'copy each quote from the stored text and check it (ola-batch check) before using it',
  wrong_format: 'say the columns and format the request asks for back to the person, and match them exactly',
  assumed_silently: 'say each assumption in the first lines of the answer',
  answered_unanswerable: 'say plainly what the data cannot answer, and invent nothing',
  touched_inputs: 'never change an input file; write results to new files',
}
export function skillNote({ id, kind, label, failed, difference }) {
  const skill = SKILL_FOR[kind] ? `the \`${SKILL_FOR[kind]}\` skill` : 'the standing instructions (workspace/AGENTS.md)'
  return `**${label}** on a made-up copy of ${kind} work (comparison ${id}). Ola's result failed ${failed.length ? failed.map((c) => `\`${c}\``).join(', ') : 'the judged comparison'}; Claude's passed. ${difference ? `The judge: ${difference} ` : ''}Which of the three it is (not loaded, a step not followed, still wrong) is for the lead to decide from the evidence (\`admin.mjs compare show ${id}\`). Would have prevented it: ${skill}. Proposed change: ${FIX_FOR[label] ?? 'read the evidence and change the one thing that failed'}. Test: this candidate (\`python3 evals/lib/task.py selftest evals/candidates/t-${id} 0\` passes Claude's output and fails Ola's). Not applied: queued for the lead.\n`
}

/** A lost copy as a task in the eval set's format: instruction, seeded generator, checker. */
export function writeCandidate(dir, { id, kind, twin, outcome, ola, claude, judge }) {
  const d = path.join(dir, `t-${id}`)
  mkdirSync(path.join(d, 'reference'), { recursive: true })
  const family = { clean: 'clean', sql: 'sql', coding: 'coding', legal: 'legal', site: 'site', honesty: 'honesty', pdf: 'pdf' }[kind] ?? 'twin'
  writeFileSync(path.join(d, 'task.json'), JSON.stringify({ id: `t-${id}`, family, level: 'medium', honesty: kind === 'honesty', version: 1, outputs: twin.checks.filter((c) => c.type === 'file').map((c) => c.path), source: 'made-up copy of a real request (compare)', outcome, candidate: true }, null, 1) + '\n')
  writeFileSync(path.join(d, 'instruction.md'), twin.request + '\n')
  // The copy's files and answers as compared (seed 0), so replaying it never runs the model's
  // generator on this machine (review 5: it is code a model wrote, and only a VM's jail holds it).
  const files = (twin.files ?? []).filter((f) => typeof f?.b64 === 'string').map((f) => ({ name: f.name, b64: f.b64 }))
  writeFileSync(path.join(d, 'twin.json'), JSON.stringify({ kind, seed: twin.seed, generator: twin.generator, checks: twin.checks, truth: twin.truth ?? null, files }, null, 1) + '\n')
  writeFileSync(path.join(d, 'task.py'), CANDIDATE_TASK)
  for (const [arm, r] of [['claude', claude], ['ola', ola]]) {
    const a = path.join(d, 'reference', arm)
    mkdirSync(a, { recursive: true })
    writeFileSync(path.join(a, 'final.txt'), r.final ?? '')
    for (const o of r.outputs ?? []) if (o.b64 && !o.input) writeFileSync(path.join(a, path.basename(o.name)), Buffer.from(o.b64, 'base64'))
  }
  writeFileSync(path.join(d, 'evidence.json'), JSON.stringify({ outcome, ola: { score: ola.score, final: ola.final }, claude: { score: claude.score, final: claude.final }, judge }, null, 1) + '\n')
  return d
}

// The candidate's task.py: the copy's generator (seed 0 is the copy as compared), its checks through
// workspace/lib/olatwin.py, and the two recorded results as the reference solution (Claude's) and the
// plausible wrong output (Ola's), so `task.py selftest <dir> 0` proves the checker on them.
const CANDIDATE_TASK = `"""A made-up copy of a real request that Ola lost to Claude (frontdesk/compare.mjs). Seed 0 is
the copy as it was compared; other seeds are new data of the same shape. solve and wrong replay the
two recorded results (Claude's, Ola's): they hold for seed 0 only."""
import base64, json, shutil, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
TWIN = json.loads((HERE / "twin.json").read_text())
_ek = sys.modules.get("evalkit")  # evals/lib/task.py loads it first: the eval set's own folder
for up in ([Path(_ek.__file__).resolve().parent.parent.parent / "workspace" / "lib"] if _ek else []) + [HERE.parent.parent.parent / "workspace" / "lib", Path("/opt/ola/lib")]:
    if (up / "olatwin.py").exists():
        sys.path.insert(0, str(up))
        break
import olatwin  # noqa: E402


def generate(work, seed, rng):
    # Seed 0 is the copy as compared, written from its recorded files: the generator is code a model
    # wrote and never runs outside a VM's jail (olatwin.run_generator refuses where there is none).
    if int(seed) == 0 and TWIN.get("files"):
        files = []
        for f in TWIN["files"]:
            name = str(f["name"])
            p = (Path(work) / name).resolve()
            if Path(work).resolve() not in p.parents or ".." in Path(name).parts:
                raise ValueError("a recorded file name leaves the task's folder")
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(base64.b64decode(f["b64"]))
            files.append(name)
        truth = dict(TWIN.get("truth") or {})
    else:
        truth, files = olatwin.run_generator(TWIN["generator"], Path(work), TWIN["seed"] if int(seed) == 0 else rng.randrange(1 << 30), python=sys.executable)
    truth["_inputs"] = {n: olatwin.sha256_file(Path(work) / n) for n in files}
    return truth


def check(work, truth, session, C):
    r = olatwin.score(Path(work), TWIN["checks"], truth, (session or {}).get("final_text", ""), truth.get("_inputs", {}))
    for c in r["checks"]:
        C.add(c["name"], c["ok"], c["label"], c["detail"])


def _replay(arm, work):
    src = HERE / "reference" / arm
    for p in src.iterdir():
        if p.name != "final.txt":
            shutil.copy(p, Path(work) / p.name)
    return (src / "final.txt").read_text()


def solve(work, truth):
    return _replay("claude", work)


def wrong(work, truth):
    return _replay("ola", work)
`

/** On the twins of the last 7 days: how often Ola matched or beat Claude, by kind of work and model. */
export function weekly(db, now = Date.now()) {
  const rows = db.prepare("SELECT kind, outcome, ola_model AS model FROM comparisons WHERE state = 'done' AND mode = 'twin' AND finished_at >= ?").all(now - 7 * 86_400_000)
  const tally = (list) => {
    const decided = list.filter((r) => r.outcome !== 'unsure')
    const m = decided.filter((r) => r.outcome !== 'claude_better').length
    return { compared: list.length, decided: decided.length, matched_or_beat: m, share: decided.length ? Math.round((m / decided.length) * 1000) / 1000 : null, unsure: list.length - decided.length }
  }
  const by = (k) => Object.fromEntries([...new Set(rows.map((r) => r[k]))].sort().map((v) => [v, tally(rows.filter((r) => r[k] === v))]))
  return { generated_at: new Date(now).toISOString(), window_days: 7, overall: tally(rows), by_kind: by('kind'), by_model: by('model') }
}

/** The admin's Quality page: comparisons over time, win-tie-loss by kind and model, reasons, cost, the list. */
export function quality(db, xc, now = Date.now()) {
  const rows = db.prepare("SELECT c.id, c.created_at AS at, c.finished_at AS finished, c.mode, c.trigger, c.state, c.verdict, c.kind, c.outcome, c.label, c.ola_model AS model, c.claude_model AS claudeModel, c.ola_passed AS olaPassed, c.ola_total AS olaTotal, c.claude_passed AS claudePassed, c.claude_total AS claudeTotal, c.cost_micro_usd AS cost, c.ola_ms AS olaMs, c.claude_ms AS claudeMs, c.ola_tokens AS olaTokens, c.claude_tokens AS claudeTokens, c.judge_tokens AS judgeTokens, c.candidate, w.slug AS project FROM comparisons c JOIN workspaces w ON w.id = c.workspace_id ORDER BY c.created_at DESC LIMIT 500").all()
  const done = rows.filter((r) => r.state === 'done')
  const wtl = (list) => ({ ola: list.filter((r) => r.outcome === 'ola_better').length, tie: list.filter((r) => r.outcome === 'both_right' || r.outcome === 'both_wrong').length, claude: list.filter((r) => r.outcome === 'claude_better').length, unsure: list.filter((r) => r.outcome === 'unsure').length })
  const by = (k) => [...new Set(done.map((r) => r[k] ?? 'other'))].sort().map((v) => ({ name: v, ...wtl(done.filter((r) => (r[k] ?? 'other') === v)) }))
  const reasons = {}
  for (const r of done) if (r.outcome === 'claude_better' && r.label) reasons[r.label] = (reasons[r.label] ?? 0) + 1
  const days = {}
  for (const r of done) {
    const d = new Date(r.finished ?? r.at).toISOString().slice(0, 10)
    days[d] ??= { day: d, ...wtl([]) }
    const k = r.outcome === 'ola_better' ? 'ola' : r.outcome === 'claude_better' ? 'claude' : r.outcome === 'unsure' ? 'unsure' : 'tie'
    days[d][k]++
  }
  const twinOf = (id) => {
    try {
      const t = JSON.parse(readFileSync(path.join(xc.dir, id, 'result.json'), 'utf8'))
      return { request: t.twin?.request ?? null, difference: t.judge?.difference ?? null }
    } catch {
      return { request: null, difference: null }
    }
  }
  return {
    total: wtl(done),
    overTime: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)).slice(-60),
    byKind: by('kind'),
    byModel: by('model'),
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n })),
    cost: { micro_usd: done.reduce((s, r) => s + (r.cost ?? 0), 0), month_micro_usd: rows.filter((r) => r.at >= Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)).reduce((s, r) => s + (r.cost ?? 0), 0) },
    weekly: weekly(db, now),
    list: rows.slice(0, 200).map((r) => ({ ...r, ...(r.mode === 'twin' ? twinOf(r.id) : { request: null, difference: null }) })),
  }
}

// ------------------------------------------------------------------ the service

const MSG = {
  owner: 'Only the project’s owner can compare with Claude.',
  budget: 'This month’s comparisons for this project are used up. The owner can raise the budget in Settings.',
  busy: 'A comparison is already under way on this machine. This one waits its turn.',
  realOff: 'Comparing the real task is off for this project. A made-up copy of this task can be compared instead.',
  notFinished: 'That request has not finished yet.',
}

/**
 * What a front desk that died mid-comparison left behind (review 5 follow-up, low): scratch VMs of
 * this front desk's prefix with their state under $OLA_HOME/ws (a real task's files live in one),
 * comparisons still "making" or "running" (no exec survives the front desk), the scratch VMs' gateway
 * grants, and made-up files on their way into a scratch VM ($OLA_HOME/compare/tmp). Pure but for
 * the database and the folders; the VMs are listed, and makeCompare destroys them.
 */
export function leftovers(db, xc, home = ws.HOME) {
  const wsDir = path.join(home, 'ws')
  const scratch = existsSync(wsDir) ? readdirSync(wsDir).filter((d) => d.startsWith(`${xc.prefix}-`) && /^[a-z0-9-]{3,32}$/.test(d)).sort() : []
  const stuck = db.prepare("SELECT id, state FROM comparisons WHERE state IN ('making', 'running') ORDER BY created_at").all()
  let grants = []
  try {
    grants = db.prepare('SELECT slug FROM compare_scratch ORDER BY slug').all().map((r) => r.slug)
  } catch {}
  const tmp = path.join(xc.dir, 'tmp')
  const files = existsSync(tmp) ? readdirSync(tmp).length : 0
  return { scratch, stuck, grants, files }
}

export function makeCompare({ db, xc, cc, claude, hosted, workspaces, container, log, home = ws.HOME }) {
  mkdirSync(xc.dir, { recursive: true, mode: 0o700 })
  // At start: nothing of an earlier front desk's comparison is under way any more (its execs ended
  // with it), so its rows are marked failed, its scratch grants taken back, its made-up files on the
  // way removed, and its scratch VMs destroyed in the background (one slot each until then). What
  // was found is kept in cleanup.json for `admin.mjs compare status`.
  {
    const found = leftovers(db, xc, home)
    const now = Date.now()
    db.prepare("UPDATE comparisons SET state = 'failed', finished_at = ? WHERE state IN ('making', 'running')").run(now)
    try {
      db.prepare('DELETE FROM compare_scratch').run()
    } catch {}
    rmSync(path.join(xc.dir, 'tmp'), { recursive: true, force: true })
    claude.writeGrants()
    hosted.writeGrants()
    const record = { at: new Date(now).toISOString(), failed: found.stuck.map((r) => r.id), grants: found.grants, files: found.files, scratch: found.scratch.map((id) => ({ id, destroyed: null })) }
    const keep = () => writeFileSync(path.join(xc.dir, 'cleanup.json'), JSON.stringify(record, null, 1) + '\n', { mode: 0o600 })
    keep()
    if (found.scratch.length || found.stuck.length) log(`compare: cleaned up after an earlier front desk (${found.stuck.length} comparisons marked failed, ${found.scratch.length} scratch VMs to remove)`)
    // After this function returns (wsCli is defined below).
    setImmediate(async () => {
      for (const v of record.scratch) {
        v.destroyed = await wsCli(['destroy', v.id, '--confirm', v.id]).then(() => true, () => false)
        keep()
      }
    })
  }
  const queue = [] // comparison ids waiting to run, one at a time on this machine
  let current = null
  const row = (wsId) => db.prepare('SELECT compare_real AS real, compare_auto AS auto, compare_per_day AS perDay, compare_cap_micro_usd AS cap FROM workspaces WHERE id = ?').get(wsId)
  const item = (id) => db.prepare('SELECT * FROM comparisons WHERE id = ?').get(id)
  const set = (id, fields) => {
    const keys = Object.keys(fields)
    db.prepare(`UPDATE comparisons SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id)
  }
  const capOf = (wsId) => row(wsId).cap ?? xc.capMicroUsd

  /** GET /api/compare: owner only (members see nothing of it). */
  async function info(ws, conversation = null) {
    if (ws.role !== 'owner') return { canCompare: false }
    const r = row(ws.id)
    const c = await claude.info(ws)
    const results = {}
    if (typeof conversation === 'string' && SID.test(conversation)) {
      for (const x of db.prepare('SELECT id, message, mode, state, verdict, outcome FROM comparisons WHERE workspace_id = ? AND session = ? ORDER BY created_at').all(ws.id, conversation)) {
        const rec = await record(ws, x.id).catch(() => null)
        results[x.message] = { id: x.id, mode: x.mode, state: x.state, verdict: x.verdict, outcome: x.outcome, sentence: rec?.judge?.difference ?? null }
      }
    }
    return {
      canCompare: true,
      configured: c.configured,
      unavailable: c.unavailable,
      mode: c.mode,
      real: r.real === 1,
      consent: CONSENT_REAL,
      auto: r.auto,
      perDay: r.perDay,
      month: { usedUsd: spentThisMonth(db, ws.id) / 1e6, capUsd: capOf(ws.id) / 1e6 },
      // "Every time is shown here": each real task sent to Claude, newest first (when, how it went).
      realSent: db.prepare("SELECT created_at AS at, state, outcome FROM comparisons WHERE workspace_id = ? AND mode = 'real' ORDER BY created_at DESC LIMIT 50").all(ws.id),
      results,
    }
  }

  async function setSettings(ws, personId, body) {
    if (ws.role !== 'owner') return { status: 403, body: { error: 'owner_only', message: MSG.owner } }
    const r = row(ws.id)
    if (typeof body?.real === 'boolean' && body.real !== (r.real === 1)) {
      if (body.real && body.consent !== true) return { status: 400, body: { error: 'consent', message: 'Read the note and confirm to turn this on.' } }
      if (body.real && !(await claude.info(ws)).configured) return { status: 409, body: { error: 'not_set_up', message: (await claude.info(ws)).unavailable } }
      db.prepare('UPDATE workspaces SET compare_real = ? WHERE id = ?').run(body.real ? 1 : 0, ws.id)
      audit(db, { actor: personId, action: body.real ? 'compare_real_enabled' : 'compare_real_disabled', workspace: ws.id })
    }
    if (body?.auto !== undefined) {
      if (!AUTO.includes(body.auto)) return { status: 400, body: { error: 'bad_auto' } }
      db.prepare('UPDATE workspaces SET compare_auto = ? WHERE id = ?').run(body.auto, ws.id)
    }
    if (body?.perDay !== undefined) {
      if (!Number.isInteger(body.perDay) || body.perDay < 1 || body.perDay > 10) return { status: 400, body: { error: 'bad_per_day' } }
      db.prepare('UPDATE workspaces SET compare_per_day = ? WHERE id = ?').run(body.perDay, ws.id)
    }
    if (body?.capUsd !== undefined) {
      if (typeof body.capUsd !== 'number' || !(body.capUsd >= 0 && body.capUsd <= 100)) return { status: 400, body: { error: 'bad_cap' } }
      db.prepare('UPDATE workspaces SET compare_cap_micro_usd = ? WHERE id = ?').run(Math.round(body.capUsd * 1e6), ws.id)
    }
    return { status: 200, body: await info(ws) }
  }

  // -------------------------------------------------------------- reading the finished request

  /** The request, Ola's answer, the files it read and wrote, and the conversation before it. */
  async function turnOf(slug, session, message) {
    const r = await workspaces.oc(slug, 'GET', `/api/session/${session}/message?limit=200`)
    const list = (Array.isArray(r.json?.data) ? r.json.data : Array.isArray(r.json) ? r.json : []).slice().sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))
    const i = list.findIndex((m) => m?.type === 'user' && m.id === message)
    if (i < 0) return null
    const t = { request: String(list[i].text ?? ''), answer: '', read: [], wrote: [], finished: false, context: '', model: 'general' }
    const rel = (p) => String(p ?? '').replace(/^\/work\//, '').replace(/^\.\//, '')
    for (const m of list.slice(i + 1)) {
      if (m.type === 'user') break
      if (m.type === 'assistant') {
        if (m.model?.id) t.model = String(m.model.id).slice(0, 40)
        let text = ''
        for (const p of m.content ?? []) {
          if (p.type === 'text') text += p.text ?? ''
          if (p.type === 'tool') {
            const inp = p.state?.input ?? {}
            const f = rel(inp.path ?? inp.filePath ?? inp.file_path)
            if (f && ['read', 'view'].includes(p.name)) t.read.push(f)
            if (f && ['write', 'edit', 'patch', 'apply_patch'].includes(p.name)) t.wrote.push(f)
          }
        }
        if (text.trim()) t.answer = text
      }
      if (m.type === 'idle') t.finished = m.outcome === 'succeeded'
    }
    t.context = list.slice(Math.max(0, i - 12), i).map((m) => (m.type === 'user' ? `Person: ${m.text ?? ''}` : m.type === 'assistant' ? `Ola: ${(m.content ?? []).filter((p) => p.type === 'text').map((p) => p.text).join('')}` : '')).filter(Boolean).join('\n').slice(-60_000)
    t.read = [...new Set(t.read)].slice(0, 40)
    t.wrote = [...new Set(t.wrote)].slice(0, 40)
    return t
  }

  // -------------------------------------------------------------- execs

  function exec(id, args, { input = null, ms = 600_000, max = 32 * 1024 * 1024, user = null } = {}) {
    return new Promise((resolve) => {
      const c = spawn(container, ['exec', ...(input !== null ? ['-i'] : []), ...(user ? ['--user', user] : []), `ola-${id}`, ...args], { stdio: [input !== null ? 'pipe' : 'ignore', 'pipe', 'pipe'] })
      const chunks = []
      let n = 0
      c.stdout.on('data', (d) => {
        n += d.length
        if (n > max) return c.kill('SIGKILL')
        chunks.push(d)
      })
      c.stderr.on('data', () => {}) // never logged: it may quote content
      const timer = setTimeout(() => c.kill('SIGKILL'), ms)
      c.on('close', (code) => (clearTimeout(timer), resolve({ code, out: Buffer.concat(chunks) })))
      if (input !== null) c.stdin.end(input)
    })
  }
  const execJson = async (id, args, opts) => {
    const r = await exec(id, args, opts)
    try {
      return JSON.parse(r.out.toString('utf8').trim().split('\n').pop())
    } catch {
      return { error: `exit ${r.code}` }
    }
  }
  const wsCli = (args) =>
    new Promise((resolve, reject) => {
      const c = spawn(process.execPath, [path.join(HERE, '../workspace/ws.mjs'), ...args], { stdio: ['ignore', 'ignore', 'pipe'], env: process.env })
      let err = ''
      c.stderr.on('data', (d) => (err = (err + d).slice(-400)))
      c.on('close', (code) => (code === 0 ? resolve() : reject(Object.assign(new Error(err.trim()), { code: code === ws.EXIT.MACHINE_FULL ? 'MACHINE_BUSY' : 'START_FAILED' }))))
    })
  /** A scratch sealed VM: made, started (waiting for a free slot), given only these files. */
  async function scratch(files) {
    const id = `${xc.prefix}-${randomBytes(4).toString('hex')}`
    await wsCli(['create', id, '--cpus', '2', '--memory', '3g', '--disk', '4g'])
    for (let i = 0; ; i++) {
      try {
        await wsCli(['start', id])
        break
      } catch (e) {
        if (e.code !== 'MACHINE_BUSY' || i > 60) throw e
        await sleep(10_000)
      }
    }
    await files(id)
    return id
  }
  const destroy = (id) => wsCli(['destroy', id, '--confirm', id]).catch((e) => log(`compare: a scratch VM could not be removed (${e.code ?? 'error'})`))
  /** Twin files from the host into a scratch VM, by tar. */
  async function putTwin(id, twin) {
    // Under this front desk's own folder, so a crash's leftovers are found (and removed) at the next start.
    mkdirSync(path.join(xc.dir, 'tmp'), { recursive: true, mode: 0o700 })
    const d = mkdtempSync(path.join(xc.dir, 'tmp', 'put-'))
    try {
      for (const f of twin.files) {
        mkdirSync(path.dirname(path.join(d, f.name)), { recursive: true })
        writeFileSync(path.join(d, f.name), Buffer.from(f.b64, 'base64'))
      }
      const tar = await new Promise((resolve) => {
        const c = spawn('/usr/bin/tar', ['-cf', '-', '--no-mac-metadata', '--no-xattrs', '--format', 'ustar', '-C', d, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } })
        const out = []
        c.stdout.on('data', (x) => out.push(x))
        c.on('close', () => resolve(Buffer.concat(out)))
      })
      const r = await exec(id, ['tar', '-xf', '-', '-C', '/work', '--no-same-owner', '--no-same-permissions'], { input: tar })
      if (r.code !== 0) throw new Error('put')
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  }
  /** The real task's files: from the project's VM straight into the scratch VM (never on the host's disk). */
  async function putReal(id, slug, read) {
    const files = realFiles(read)
    if (!files.length) return
    await new Promise((resolve, reject) => {
      const from = spawn(container, ['exec', `ola-${slug}`, 'tar', '-cf', '-', '--no-recursion', '-C', '/work', '--', ...files], { stdio: ['ignore', 'pipe', 'ignore'] })
      const to = spawn(container, ['exec', '-i', `ola-${id}`, 'tar', '-xf', '-', '-C', '/work', '--no-same-owner', '--no-same-permissions'], { stdio: ['pipe', 'ignore', 'ignore'] })
      from.stdout.pipe(to.stdin)
      to.on('close', (code) => (code === 0 ? resolve() : reject(new Error('put'))))
    })
  }
  /** What an engine made: /work's files but the inputs and .ola, text inline when small. */
  async function outputsOf(id, inputs) {
    const r = await exec(id, ['python3', '-I', '-c', OUTPUTS_PY], { input: JSON.stringify(inputs), max: 24 * 1024 * 1024 })
    try {
      return JSON.parse(r.out.toString('utf8'))
    } catch {
      return []
    }
  }
  async function callerUsage(caller) {
    if (!cc.usageToken) return null
    try {
      const r = await fetch(`${cc.gateway}/v1/usage`, { headers: { authorization: `Bearer ${cc.usageToken}` }, signal: AbortSignal.timeout(5000) })
      const d = (await r.json())?.data?.find((x) => x?.caller === caller)
      return d ? { tin: d.tokens_in ?? 0, tout: d.tokens_out ?? 0, month: d.claude_month ?? null, hosted: d.hosted_month ?? null } : { tin: 0, tout: 0, month: null, hosted: null }
    } catch {
      return null
    }
  }

  // -------------------------------------------------------------- the engines

  /** Ola (or the hosted open model) on the task in a scratch VM: opencode, unattended, no web. */
  async function runOpencode(id, request, model) {
    const t0 = Date.now()
    const caller = `ws-${id}`
    const u0 = await callerUsage(caller)
    const perms = [...permissionsFor('go', 'ask'), ...webRules('deny'), { action: 'webfetch', resource: '*', effect: 'deny' }, { action: 'websearch', resource: '*', effect: 'deny' }]
    const s = await workspaces.oc(id, 'POST', '/api/session', { title: 'Compare', location: { directory: '/work' }, metadata: { autonomy: 'go' }, permissions: perms })
    const sid = (s.json?.data ?? s.json)?.id
    if (!SID.test(sid ?? '')) throw new Error('session')
    if (model === 'hosted') await workspaces.oc(id, 'POST', `/api/session/${sid}/model`, { model: { id: 'hosted', providerID: 'ola' } })
    const p = await workspaces.oc(id, 'POST', `/api/session/${sid}/prompt`, { text: request })
    if (p.status < 200 || p.status > 299) throw new Error('prompt')
    let seen = false
    let end = 'done'
    for (;;) {
      await sleep(2000)
      const now = await workspaces.executing(id)
      if (now?.has(sid)) seen = true
      // Unattended: any question is answered no (the copy needs nothing from outside).
      const q = await workspaces.oc(id, 'GET', `/api/session/${sid}/permission`)
      for (const x of (Array.isArray(q.json) ? q.json : q.json?.data ?? []).slice(0, 5)) if (SID.test(x?.id ?? '')) await workspaces.oc(id, 'POST', `/api/session/${sid}/permission/${x.id}/reply`, { decision: 'reject' })
      if (now && !now.has(sid) && (seen || Date.now() - t0 > 20_000)) break
      if (Date.now() - t0 > xc.engineMs) {
        end = 'timeout'
        await workspaces.oc(id, 'POST', `/api/session/${sid}/interrupt`, {})
        await sleep(3000)
        break
      }
    }
    const m = await workspaces.oc(id, 'GET', `/api/session/${sid}/message?limit=200`)
    const list = (Array.isArray(m.json?.data) ? m.json.data : Array.isArray(m.json) ? m.json : []).slice().sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))
    let final = ''
    for (const x of list) if (x.type === 'assistant') {
      const text = (x.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
      if (text.trim()) final = text
    }
    const u1 = await callerUsage(caller)
    return { final: final.slice(0, 100_000), end, ms: Date.now() - t0, tokensIn: u1 && u0 ? u1.tin - u0.tin : null, tokensOut: u1 && u0 ? u1.tout - u0.tout : null, model: model === 'hosted' ? 'hosted' : xc.olaModelName }
  }

  /** Claude Code on the task in a scratch VM, through the gateway with that VM's grant. */
  async function runClaude(id, request) {
    const t0 = Date.now()
    const child = spawn(container, ['exec', '-i', `ola-${id}`, '/opt/ola/bin/ola-claude', 'go', 'compare', `r${id.replace(/-/g, '')}`, 'asked'], { stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdin.on('error', () => {})
    child.stderr.on('data', () => {})
    const text = `${request}\n\n(Work in /work. There is no one to ask during this task: carry on with your best judgment and say what you assumed.)`
    child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, parent_tool_use_id: null, session_id: '' }) + '\n')
    let result = null
    let model = null
    let buf = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d) => {
      buf += d
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        let e
        try {
          e = JSON.parse(line)
        } catch {
          continue
        }
        if (e?.type === 'system' && e.subtype === 'init') model = String(e.model ?? '').slice(0, 60)
        if (e?.type === 'control_request') child.stdin.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: e.request_id, response: { behavior: 'deny', message: 'Not allowed here.' } } }) + '\n')
        if (e?.type === 'result') {
          result = e
          setTimeout(() => child.stdin.end(), 100)
        }
      }
    })
    const timer = setTimeout(() => (spawn(container, ['exec', `ola-${id}`, '/opt/ola/bin/ola-claude', 'stop', `r${id.replace(/-/g, '')}`], { stdio: 'ignore' }), setTimeout(() => child.kill('SIGKILL'), 8000)), xc.engineMs)
    await new Promise((r) => child.on('close', r))
    clearTimeout(timer)
    const u = result?.usage ?? {}
    const n = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0)
    return { final: typeof result?.result === 'string' ? result.result.slice(0, 100_000) : '', end: result && !result.is_error ? 'done' : result ? 'model_error' : 'timeout', ms: Date.now() - t0, tokensIn: n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens), tokensOut: n(u.output_tokens), model: model || 'claude' }
  }

  /** One judge call through the scratch VM's own door (its token, its grant, its ceiling). */
  function judgeCall(id, material) {
    const token = ws.secrets(id).BOX_API_KEY
    const body = Buffer.from(JSON.stringify({ model: xc.judgeModel, max_tokens: 8192, system: JUDGE_SYSTEM.replace('LABELS', LABELS.filter((l) => l !== 'success').join(', ')), messages: [{ role: 'user', content: material }] }))
    return new Promise((resolve) => {
      const req = http.request({ socketPath: path.join(ws.GATEWAY_DOORS, `ws-${id}.sock`), method: 'POST', path: '/anthropic/v1/messages', headers: { authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'content-length': String(body.length) }, timeout: 300_000 }, (res) => {
        let t = ''
        res.setEncoding('utf8')
        res.on('data', (d) => (t = (t + d).slice(0, 2_000_000)))
        res.on('end', () => {
          try {
            const j = JSON.parse(t)
            const u = j.usage ?? {}
            judgeUse.tin += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
            judgeUse.tout += u.output_tokens ?? 0
            resolve(res.statusCode === 200 ? (j.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text).join('') : null)
          } catch {
            resolve(null)
          }
        })
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => (req.destroy(), resolve(null)))
      req.end(body)
    })
  }
  const judgeUse = { tin: 0, tout: 0 }

  /** The scratch VM's grant for Claude (or the hosted model): this comparison only, its budget as the ceiling. */
  async function grant(id, wsId, engine, remainingMicroUsd) {
    const mode = modeFor(db, wsId)
    const capTokens = Math.max(1, Math.floor(remainingMicroUsd / Math.max(xc.priceIn, 0.000001)))
    db.prepare('INSERT OR REPLACE INTO compare_scratch (slug, workspace_id, engine, mode, cap_micro_usd, cap_tokens, until) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, wsId, engine, mode, Math.max(0, Math.floor(remainingMicroUsd)), capTokens, Date.now() + xc.engineMs + 20 * 60_000)
    if (engine === 'claude') claude.writeGrants()
    else hosted.writeGrants()
    // The gateway reloads its grants within about 2 s.
    for (let i = 0; i < 16; i++) {
      const u = await callerUsage(`ws-${id}`)
      if (engine === 'claude' ? u?.month?.mode : u?.hosted?.granted) return
      await sleep(500)
    }
  }
  function ungrant(id) {
    db.prepare('DELETE FROM compare_scratch WHERE slug = ?').run(id)
    claude.writeGrants()
    hosted.writeGrants()
  }
  const costOf = (tin, tout) => Math.round((tin ?? 0) * xc.priceIn + (tout ?? 0) * xc.priceOut)

  // -------------------------------------------------------------- one comparison

  /** POST /api/compare/start: make the copy (or check the real task's consent). */
  async function start(ws, personId, body, trigger = 'asked') {
    if (ws.role !== 'owner' && trigger === 'asked') return { status: 403, body: { error: 'owner_only', message: MSG.owner } }
    const session = body?.conversation
    const message = body?.message
    const mode = body?.mode === 'real' ? 'real' : 'twin'
    if (!SID.test(session ?? '') || !SID.test(message ?? '')) return { status: 400, body: { error: 'bad_request' } }
    const c = await claude.info(ws)
    if (!c.configured) return { status: 503, body: { error: 'not_set_up', message: c.unavailable } }
    if (spentThisMonth(db, ws.id) >= capOf(ws.id)) return { status: 409, body: { error: 'budget', message: MSG.budget } }
    const r = row(ws.id)
    const once = mode === 'real' && r.real !== 1
    if (once && body?.once !== true) return { status: 403, body: { error: 'real_off', message: MSG.realOff } }
    if (once && body?.consent !== true) return { status: 400, body: { error: 'consent', message: 'Read the note and confirm to send this once.' } }
    await workspaces.ensureRunning(ws.slug)
    const turn = await turnOf(ws.slug, session, message)
    if (!turn) return { status: 404, body: { error: 'not_found', message: 'That request is not in this conversation.' } }
    if (!turn.finished && !turn.answer) return { status: 409, body: { error: 'not_finished', message: MSG.notFinished } }
    const id = randomBytes(6).toString('hex')
    db.prepare("INSERT INTO comparisons (id, workspace_id, person_id, session, message, mode, trigger, state, created_at, ola_model) VALUES (?, ?, ?, ?, ?, ?, ?, 'making', ?, ?)").run(id, ws.id, personId, session, message, mode, trigger, Date.now(), turn.model === 'hosted' ? 'hosted' : xc.olaModelName)
    if (mode === 'real') {
      audit(db, { actor: personId, action: once ? 'compare_real_once' : 'compare_sent', workspace: ws.id })
      set(id, { state: 'ready' })
      enqueue(id, { ws, turn })
      return { status: 200, body: { id, state: 'ready' } }
    }
    const busy = workspaces.holdBusy(ws.slug)
    try {
      // Two execs (review 5 follow-up, medium): the agent's user hands over the files the run read
      // and the project's text; then the copy is made, checked and printed by a user of its own
      // (`twin`, uid 1002), whom nothing the agent left running can signal, trace or write to, and
      // which reads nothing of /work but what it was handed. Its digest is taken here, on the host.
      const gathered = await execJson(ws.slug, ['/opt/ola/bin/ola-twin', 'gather'], { input: JSON.stringify({ files: turn.read }), ms: 5 * 60_000, max: 96 * 1024 * 1024 })
      const out = gathered?.read && Array.isArray(gathered.names) && Array.isArray(gathered.texts) ? await execJson(ws.slug, ['/opt/ola/bin/ola-twin', 'make', id], { input: JSON.stringify({ request: turn.request, context: turn.context, gathered }), ms: 15 * 60_000, user: `${TWIN_UID}:${TWIN_UID}` }) : null
      if (!out?.leak || !Array.isArray(out.files)) {
        set(id, { state: 'failed', finished_at: Date.now() })
        return { status: 502, body: { error: 'twin_failed', id, message: 'Ola could not make a made-up copy of this task just now. Nothing left this machine.' } }
      }
      const verdict = out.leak.verdict
      const kind = KINDS.includes(out.kind) ? out.kind : 'other'
      set(id, { verdict, kind, twin_sha256: digest(out), state: verdict === 'clean' ? 'ready' : verdict === 'unsure' ? 'held' : 'refused', ola_tokens: (out.tokens_in ?? 0) + (out.tokens_out ?? 0) })
      audit(db, { actor: personId, action: 'compare_twin_made', workspace: ws.id, ok: verdict !== 'leak', tokensIn: out.tokens_in ?? null, tokensOut: out.tokens_out ?? null })
      if (verdict === 'clean') keepTwin(id, out)
      // A held or refused copy may carry the project's words: it is kept in the project's VM for the
      // owner to read; the digest above is what a later yes is checked against.
      else await exec(ws.slug, ['/opt/ola/bin/ola-twin', 'store', id], { input: JSON.stringify(out) })
      if (verdict === 'clean' && trigger === 'sampled') enqueue(id, { ws })
      return { status: 200, body: { id, state: verdict === 'clean' ? 'ready' : verdict === 'unsure' ? 'held' : 'refused' } }
    } finally {
      busy()
    }
  }
  const twinFields = (t) => ({ id: t.id, kind: t.kind, request: t.request, generator: t.generator, seed: t.seed, checks: t.checks, truth: t.truth, files: t.files })
  function keepTwin(id, t) {
    const d = path.join(xc.dir, id)
    mkdirSync(d, { recursive: true, mode: 0o700 })
    writeFileSync(path.join(d, 'twin.json'), JSON.stringify(twinFields(t)), { mode: 0o600 })
  }
  const digest = (t) => createHash('sha256').update(JSON.stringify(sortKeys(twinFields(t)))).digest('hex')

  /** POST /api/compare/send: the owner's go for a ready copy, or the owner's yes for a held one. */
  async function send(ws, personId, body) {
    if (ws.role !== 'owner') return { status: 403, body: { error: 'owner_only', message: MSG.owner } }
    const x = ID.test(body?.id ?? '') ? item(body.id) : null
    if (!x || x.workspace_id !== ws.id) return { status: 404, body: { error: 'not_found' } }
    if (x.state === 'held') {
      if (body?.release !== true) return { status: 400, body: { error: 'release', message: 'Read the copy and confirm to send it.' } }
      // The owner's yes is for the copy they read: the one in the project must still be that copy.
      const t = await execJson(ws.slug, ['/opt/ola/bin/ola-twin', 'show', x.id])
      if (!t?.files || digest(t) !== x.twin_sha256) return { status: 409, body: { error: 'changed', message: 'This copy changed since it was made, so it stays here. Make a new one.' } }
      keepTwin(x.id, t)
      set(x.id, { state: 'ready', released_by: personId })
      audit(db, { actor: personId, action: 'compare_twin_released', workspace: ws.id })
    } else if (x.state !== 'ready' || x.mode !== 'twin') return { status: 409, body: { error: 'state', message: 'This comparison is not waiting to be sent.' } }
    if (spentThisMonth(db, ws.id) >= capOf(ws.id)) return { status: 409, body: { error: 'budget', message: MSG.budget } }
    audit(db, { actor: personId, action: 'compare_sent', workspace: ws.id })
    // Under way from here (review 5): a second go for the same copy while another comparison holds
    // the queue would have queued it twice, and paid for Claude twice.
    set(x.id, { state: 'running' })
    enqueue(x.id, { ws })
    return { status: 200, body: { id: x.id, state: 'queued' } }
  }
  function discard(ws, body) {
    if (ws.role !== 'owner') return { status: 403, body: { error: 'owner_only', message: MSG.owner } }
    const x = ID.test(body?.id ?? '') ? item(body.id) : null
    if (!x || x.workspace_id !== ws.id || !['held', 'ready', 'refused'].includes(x.state)) return { status: 404, body: { error: 'not_found' } }
    set(x.id, { state: 'declined', finished_at: Date.now() })
    rmSync(path.join(xc.dir, x.id), { recursive: true, force: true })
    return { status: 200, body: { ok: true } }
  }

  function enqueue(id, ctx) {
    queue.push({ id, ctx })
    pump()
  }
  async function pump() {
    if (current || !queue.length) return
    current = queue.shift()
    try {
      await run(current.id, current.ctx)
    } catch (e) {
      log(`compare: a comparison failed (${e?.code ?? e?.message?.slice(0, 40) ?? 'error'})`)
      set(current.id, { state: 'failed', finished_at: Date.now() })
    } finally {
      current = null
      setImmediate(pump)
    }
  }

  async function run(id, { ws: w, turn }) {
    const x = item(id)
    set(id, { state: 'running' })
    const remaining = () => capOf(x.workspace_id) - spentThisMonth(db, x.workspace_id)
    const engines = { ola: null, claude: null }
    let twin = null
    let kind = x.kind ?? 'other'
    let request
    let inputs = {}
    if (x.mode === 'twin') {
      twin = JSON.parse(readFileSync(path.join(xc.dir, id, 'twin.json'), 'utf8'))
      request = twin.request
      kind = twin.kind
      inputs = Object.fromEntries(twin.files.map((f) => [f.name, f.sha256]))
    } else request = turn.request
    const scoreIn = (sid, r) => (twin ? execJson(sid, ['/opt/ola/bin/ola-twin', 'score'], { input: JSON.stringify({ checks: twin.checks, truth: twin.truth, final_text: r.final, inputs }) }) : null)
    const put = (sid) => (twin ? putTwin(sid, twin) : putReal(sid, w.slug, turn.read))

    // Ola: a scratch VM for the copy; for the real task, the reply Ola already gave.
    if (twin) {
      const sid = await scratch(put)
      try {
        const r = await runOpencode(sid, request, x.ola_model === 'hosted' ? 'hosted' : 'general')
        r.score = await scoreIn(sid, r)
        r.outputs = await outputsOf(sid, Object.keys(inputs))
        engines.ola = r
      } finally {
        await destroy(sid)
      }
    } else {
      const got = await workspaces.peek(w.slug, turn.wrote.filter((f) => /\.(md|txt|csv|html?|json)$/i.test(f)).slice(0, 8), 64 * 1024).catch(() => new Map())
      engines.ola = { final: turn.answer, end: 'done', ms: null, tokensIn: null, tokensOut: null, model: x.ola_model, outputs: [...got].map(([name, b]) => ({ name, size: b.length, text: b.toString('utf8') })) }
    }
    // The hosted open model too, where it is set up and on for the project (its own scratch VM and grant).
    const hostedOn = twin && db.prepare('SELECT hosted_enabled AS h FROM workspaces WHERE id = ?').get(x.workspace_id).h === 1 && (await hosted.info(w)).configured
    if (hostedOn && remaining() > 0) {
      const hid = await scratch(put)
      try {
        await grant(hid, x.workspace_id, 'hosted', remaining())
        const r = await runOpencode(hid, request, 'hosted')
        r.score = await scoreIn(hid, r)
        r.outputs = await outputsOf(hid, Object.keys(inputs))
        engines.hosted = r
      } finally {
        ungrant(hid)
        await destroy(hid)
      }
    }
    // Claude: its own scratch VM holding only the copy (or the files Ola read), and a grant for it alone.
    if (remaining() <= 0) throw Object.assign(new Error('budget'), { code: 'BUDGET' })
    const cid = await scratch(put)
    judgeUse.tin = judgeUse.tout = 0
    let judged
    try {
      await grant(cid, x.workspace_id, 'claude', remaining())
      const r = await runClaude(cid, request)
      r.score = await scoreIn(cid, r)
      r.outputs = await outputsOf(cid, Object.keys(inputs))
      engines.claude = r
      // The judge sees the two results unlabeled, twice, the order swapped (judgeTwice).
      const view = (e) => ({ final: e.final, outputs: (e.outputs ?? []).filter((o) => !o.input) })
      // With a request limit, the judge gets what Claude Code left of it; a call it cannot make is
      // an unread judgement, and the comparison is "unsure" rather than over the limit.
      let left = Infinity
      if (xc.claudeRequestLimit) left = xc.claudeRequestLimit - ((await callerUsage(`ws-${cid}`))?.month?.requests ?? xc.claudeRequestLimit)
      judged = await judgeTwice({ kind, request, x: view(engines.ola), y: view(engines.claude), names: { x: 'Ola', y: 'Claude' }, ask: (m) => (left-- > 0 ? judgeCall(cid, m) : Promise.resolve(null)) })
    } finally {
      ungrant(cid)
      await destroy(cid)
    }
    const o = engines.ola.score
    const c = engines.claude.score
    const outcome = outcomeOf({ ola: o, claude: c, judged: judged.verdict })
    const label = outcome === 'claude_better' ? (o && !o.all ? o.label : judged.label) : null
    const claudeCost = costOf(engines.claude.tokensIn, engines.claude.tokensOut)
    const judgeCost = costOf(judgeUse.tin, judgeUse.tout)
    const rec = {
      id,
      mode: x.mode,
      kind,
      twin: twin ? { request: twin.request, kind: twin.kind, seed: twin.seed, checks: twin.checks, files: twin.files.map((f) => ({ name: f.name, size: f.size })) } : null,
      engines: Object.fromEntries(Object.entries(engines).map(([k, e]) => [k, { final: e.final, end: e.end, ms: e.ms, tokensIn: e.tokensIn, tokensOut: e.tokensOut, model: e.model, score: e.score ?? null, outputs: (e.outputs ?? []).map((f) => ({ name: f.name, size: f.size, text: f.text ?? null, input: Boolean(f.input) })) }])),
      judge: { verdict: judged.verdict, difference: judged.difference, runs: judged.runs.map((r) => ({ winner: r.winner, points: r.points, difference: r.difference })) },
      outcome,
      label,
      finishedAt: Date.now(),
    }
    if (twin) writeFileSync(path.join(xc.dir, id, 'result.json'), JSON.stringify(rec), { mode: 0o600 })
    else await exec(w.slug, ['/opt/ola/bin/ola-twin', 'keep', id], { input: JSON.stringify(rec) })
    let candidate = 0
    if (twin && (outcome === 'claude_better' || outcome === 'unsure')) {
      try {
        const d = writeCandidate(xc.candidates, { id, kind, twin, outcome, ola: { ...engines.ola, outputs: await outputsB64(engines.ola) }, claude: { ...engines.claude, outputs: await outputsB64(engines.claude) }, judge: rec.judge })
        if (outcome === 'claude_better') writeFileSync(path.join(d, 'skill-note.md'), skillNote({ id, kind, label, failed: (o?.checks ?? []).filter((k) => !k.ok).map((k) => k.name), difference: judged.difference }))
        candidate = 1
      } catch (e) {
        log(`compare: a candidate could not be written (${e?.code ?? 'error'})`)
      }
    }
    set(id, {
      state: 'done', finished_at: Date.now(), kind, outcome, label, judged: judged.verdict === 'x' ? 'ola' : judged.verdict === 'y' ? 'claude' : judged.verdict,
      ola_passed: o?.passed ?? null, ola_total: o?.total ?? null, claude_passed: c?.passed ?? null, claude_total: c?.total ?? null,
      ola_ms: engines.ola.ms, ola_tokens: (x.ola_tokens ?? 0) + (engines.ola.tokensIn ?? 0) + (engines.ola.tokensOut ?? 0), claude_ms: engines.claude.ms, claude_tokens: engines.claude.tokensIn + engines.claude.tokensOut,
      claude_model: engines.claude.model, judge_tokens: judgeUse.tin + judgeUse.tout, cost_micro_usd: claudeCost + judgeCost, candidate,
    })
    audit(db, { actorKind: 'system', action: 'compare_done', workspace: x.workspace_id, ok: outcome !== 'unsure', tokensIn: engines.claude.tokensIn + judgeUse.tin, tokensOut: engines.claude.tokensOut + judgeUse.tout, costMicroUsd: claudeCost + judgeCost })
    try {
      writeFileSync(path.join(xc.dir, 'weekly.json'), JSON.stringify(weekly(db), null, 1) + '\n')
    } catch {}
    log(`compare: ${id} done (${outcome})`)
  }
  // The outputs with their bytes, for a candidate's reference (made-up content only: twin mode).
  async function outputsB64(e) {
    return (e.outputs ?? []).map((o) => ({ ...o, b64: o.b64 ?? (o.text != null ? Buffer.from(o.text).toString('base64') : null) }))
  }

  /** The record of one comparison, for the owner: the copy, both results, the judged difference. */
  async function record(ws, id) {
    const x = ID.test(id ?? '') ? item(id) : null
    if (!x || x.workspace_id !== ws.id) return null
    if (x.mode === 'real') {
      if (x.state !== 'done') return { id, state: x.state, mode: 'real' }
      return { state: x.state, ...(await execJson(ws.slug, ['/opt/ola/bin/ola-twin', 'result', id])) }
    }
    const f = path.join(xc.dir, id, 'result.json')
    if (existsSync(f)) return { state: x.state, ...JSON.parse(readFileSync(f, 'utf8')) }
    return { id, state: x.state, mode: 'twin', verdict: x.verdict }
  }

  /** GET /api/compare/item: the copy (as made, before it leaves; the findings when held) and the result. */
  async function show(ws, id) {
    if (ws.role !== 'owner') return { status: 403, body: { error: 'owner_only', message: MSG.owner } }
    const x = ID.test(id ?? '') ? item(id) : null
    if (!x || x.workspace_id !== ws.id) return { status: 404, body: { error: 'not_found' } }
    const fileView = (f) => {
      const b = Buffer.from(f.b64 ?? '', 'base64')
      const text = /\.(csv|tsv|md|txt|json|html?)$/i.test(f.name) && b.length <= 64 * 1024 ? b.toString('utf8') : null
      return { name: f.name, size: f.size, text }
    }
    let twin = null
    let findings = null
    if (x.mode === 'twin' && ['held', 'refused'].includes(x.state)) {
      const t = await execJson(ws.slug, ['/opt/ola/bin/ola-twin', 'show', id])
      // What the owner reads must be the copy that was checked: one changed in the VM since is not shown.
      if (t?.files && digest(t) !== x.twin_sha256) return { status: 409, body: { error: 'changed', message: 'This copy changed since it was made, so it stays here. Make a new one.' } }
      if (t?.files) (twin = { request: t.request, kind: t.kind, checks: t.checks, files: t.files.map(fileView) }), (findings = t.leak?.findings ?? [])
    } else if (x.mode === 'twin' && existsSync(path.join(xc.dir, id, 'twin.json'))) {
      const t = JSON.parse(readFileSync(path.join(xc.dir, id, 'twin.json'), 'utf8'))
      twin = { request: t.request, kind: t.kind, checks: t.checks, files: t.files.map(fileView) }
    }
    const result = x.state === 'done' ? await record(ws, id) : null
    return { status: 200, body: { id, mode: x.mode, state: x.state, verdict: x.verdict, kind: x.kind, outcome: x.outcome, twin, findings, result } }
  }

  // -------------------------------------------------------------- the sampler

  async function sampleOnce() {
    if (current || queue.length) return null
    for (const p of samplerChoice(db, xc)) {
      const w = db.prepare("SELECT w.id, w.slug, w.name, w.status, 'owner' AS role FROM workspaces w WHERE w.id = ?").get(p.id)
      // Only a project that is up and idle: a sample never wakes a project or slows a person down.
      if (!workspaces.isReady(w.slug)) continue
      const now = await workspaces.executing(w.slug)
      if (!now || now.size) continue
      const s = await workspaces.oc(w.slug, 'GET', '/api/session?limit=20')
      const sessions = (Array.isArray(s.json?.data) ? s.json.data : Array.isArray(s.json) ? s.json : []).filter((x) => SID.test(x?.id ?? '') && x.title !== 'Compare')
      const done = new Set(db.prepare('SELECT session || ":" || message AS k FROM comparisons WHERE workspace_id = ?').all(w.id).map((r) => r.k))
      const picks = []
      for (const se of sessions.slice(0, 10)) {
        const m = await workspaces.oc(w.slug, 'GET', `/api/session/${se.id}/message?limit=200`)
        const list = Array.isArray(m.json?.data) ? m.json.data : Array.isArray(m.json) ? m.json : []
        for (const u of list) if (u?.type === 'user' && SID.test(u.id ?? '') && !done.has(`${se.id}:${u.id}`)) picks.push({ conversation: se.id, message: u.id })
      }
      if (!picks.length) continue
      const pick = picks[Math.floor(Math.random() * picks.length)]
      const owner = db.prepare("SELECT m.person_id AS id FROM memberships m JOIN workspaces w ON w.team_id = m.team_id WHERE w.id = ? AND m.role = 'owner' LIMIT 1").get(w.id)
      return start(w, owner?.id ?? null, { ...pick, mode: 'twin' }, 'sampled')
    }
    return null
  }
  const tick = setInterval(() => sampleOnce().catch((e) => log(`compare: the sampler stopped once (${e?.code ?? 'error'})`)), xc.tickMs)
  tick.unref()

  return {
    info,
    setSettings,
    start,
    send,
    discard,
    show,
    sampleOnce,
    busy: () => Boolean(current),
    quality: () => quality(db, xc),
    weekly: () => weekly(db),
    close: () => clearInterval(tick),
  }
}

/**
 * Which of the paths Ola's read tools named go to Claude's scratch VM for the real task (review 5):
 * only files in the project folder by a plain relative path, never a folder's whole contents (tar
 * runs with --no-recursion), never anything outside /work (/proc/self/environ holds the VM's own
 * keys), never Ola's own .ola folder. A path the model read can be anything a hostile file talked it into.
 */
export function realFiles(read) {
  return [...new Set((Array.isArray(read) ? read : []).filter((f) => typeof f === 'string' && f.length > 0 && f.length < 1024 && !f.startsWith('/') && !f.startsWith('-') && !/[\0\n]/.test(f) && f.split('/').every((p) => p !== '..' && p !== '.' && p !== '') && !/^\.ola(\/|$)/.test(f)))].slice(0, 40)
}

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v)

// The outputs of an engine's run, read in the scratch VM: every file in /work but .ola, the inputs
// marked; text inline up to 64 KiB, bytes (base64) up to 1 MiB each, 8 MiB in all.
const OUTPUTS_PY = `
import base64, hashlib, json, os, sys
inputs = set(json.loads(sys.stdin.read() or "[]"))
out, total = [], 0
for root, dirs, names in os.walk("/work"):
    dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d not in ("node_modules", "__pycache__"))
    for n in sorted(names):
        p = os.path.join(root, n)
        rel = os.path.relpath(p, "/work")
        if os.path.islink(p) or len(out) >= 60:
            continue
        size = os.path.getsize(p)
        f = {"name": rel, "size": size, "input": rel in inputs}
        if not f["input"] and size <= 1 << 20 and total + size <= 8 << 20:
            data = open(p, "rb").read()
            total += size
            f["b64"] = base64.b64encode(data).decode()
            if size <= 64 * 1024 and os.path.splitext(n)[1].lower() in (".csv", ".tsv", ".md", ".txt", ".json", ".html", ".htm", ".py", ".sql"):
                f["text"] = data.decode("utf-8", "replace")
        out.append(f)
print(json.dumps(out))
`
