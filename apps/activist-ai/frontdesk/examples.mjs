// Bart's own kept requests as worked examples (OLA-181).
//
// The ola-examples plugin in every workspace shows the model the closest worked example when a request
// asks for an app, page or game. Its committed library holds only test requests. This adds the second
// source the ticket names: requests of ONE person (OLA_EXAMPLES_FROM, default "bart"), taken from the
// turns he chose to keep (kept_turns, OLA-159), written to a file outside the repo:
//
//   <ws HOME>/examples/kept.json   (ws.mjs mounts <ws HOME>/examples read-only at /ola/examples in every
//                                   VM, and the plugin reads it through OLA_EXAMPLES_EXTRA)
//
// A kept turn becomes an example only when it ended well, as far as the record can tell:
//   - its person is the examples person (nobody else's words are ever written here);
//   - status done, engine ola or hosted or claude, and no later turn in the same session switched to
//     another engine (a switch means the result was not good enough, OLA-157);
//   - the request asks to make something (the plugin's own MAKES test);
//   - something was written (a write or an edit that finished) and the page was tried afterwards (a
//     finished step after the last write that ran ola-page, look.py or "Checked the work").
// Steps hold the app's plain words only (never file contents or command output, devices.mjs), so the
// example's "built" and "tried" lines are those words. The file is rewritten after every kept turn of
// that person and after he deletes his kept turns (then it is emptied): it never holds a turn the
// database no longer has.

import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MAKES } from '../workspace/plugins/ola-examples/index.js'

export const FILE_IN_VM = '/ola/examples/kept.json'
const TRY = /\b(?:ola-page|look\.py)\b|checked the work/i
const MAX_ANSWER = 800

const uniq = (xs) => [...new Set(xs)]

/** One kept turn (a row with `steps` as JSON text) as an example, or null when it does not qualify. */
export function exampleOf(row, { switchedLater = false } = {}) {
  if (row.status !== 'done' || switchedLater) return null
  const request = String(row.request ?? '').trim()
  if (!request || request.length > 2000 || !MAKES.test(request)) return null
  let steps
  try { steps = JSON.parse(row.steps) } catch { return null }
  if (!Array.isArray(steps)) return null
  const ok = steps.filter((s) => s && s.status !== 'failed' && s.status !== 'error' && typeof s.words === 'string' && s.words.trim())
  const lastWrite = ok.reduce((at, s, i) => ((s.tool === 'write' || s.tool === 'edit') ? i : at), -1)
  if (lastWrite < 0) return null
  const tried = uniq(ok.slice(lastWrite + 1).filter((s) => TRY.test(s.words)).map((s) => s.words.trim()))
  if (!tried.length) return null
  const built = uniq(ok.slice(0, lastWrite + 1).filter((s) => s.tool === 'write' || s.tool === 'edit').map((s) => s.words.trim())).slice(0, 12)
  const answer = String(row.answer ?? '').replace(/\s+/g, ' ').trim()
  return {
    id: `kept-${row.id}`,
    source: 'kept',
    request,
    built,
    tried: tried.slice(0, 12),
    answer: answer.length > MAX_ANSWER ? answer.slice(0, MAX_ANSWER - 1) + '…' : answer,
  }
}

/** The examples from `handle`'s kept turns, oldest first. */
export function examplesFrom(db, handle) {
  const rows = db.prepare(
    `SELECT k.id, k.session, k.at, k.status, k.request, k.answer, k.steps, k.switched_from
     FROM kept_turns k JOIN people p ON p.id = k.person_id WHERE p.handle = ? ORDER BY k.at`,
  ).all(handle)
  return rows.map((r) => exampleOf(r, { switchedLater: rows.some((o) => o.session === r.session && o.at > r.at && o.switched_from) })).filter(Boolean)
}

/** Writes the file (atomically) and returns how many examples it holds. Folder 0755 and file 0644, set
 * explicitly (the front desk runs with umask 077): the VM's user reads it through the read-only mount. */
export function writeExamples(db, file, handle) {
  const examples = examplesFrom(db, handle)
  mkdirSync(path.dirname(file), { recursive: true })
  chmodSync(path.dirname(file), 0o755)
  const tmp = `${file}.${process.pid}.tmp`
  const body = { about: `Worked examples from ${handle}'s kept requests (OLA-181), written by frontdesk/examples.mjs. Rewritten after each kept turn and emptied when the turns are deleted.`, examples }
  writeFileSync(tmp, JSON.stringify(body, null, 1) + '\n')
  chmodSync(tmp, 0o644)
  renameSync(tmp, file)
  return examples.length
}
