// The replay test's cases (OLA-175). One case per correction from Bart: the situation Kit was in
// just before the mistake and a rubric (must / must_not), filed under the correction's weakness.
// The cases are private (his words and the situations never go in git): one JSON file each in
// apps/venture/private/data/replay-cases/, backed up by sync.mjs like the rest of private/.
//   { id: "c83-no-simulator-on-his-imac", source: "Correction 83", day, title, weakness,
//     situation, must: [..], must_not: [..] }
// From correction 22 on, every correction gets a case the day it is written (the daily sweep
// writes it, SWEEP.md), or a line in replay-untestable.json saying why it cannot be one (a
// structural fault with no moment of choice, or covered by another case): `sweep.mjs post`
// refuses an entry while a correction has neither.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

export const CASE_DIR = 'apps/venture/private/data/replay-cases/'
export const UNTESTABLE = 'apps/venture/private/data/replay-untestable.json'
export const FIRST_COVERED = 22

export function loadCases(root) {
  const dir = new URL(CASE_DIR, root)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')))
}

/** The correction numbers a case comes from ("Correction 83", "Corrections 5, 9 / Rule 1"). */
export const caseCorrections = (c) => {
  const m = /Corrections? ([\d, and]+)/.exec(c.source ?? '')
  return m ? m[1].split(/[^\d]+/).filter(Boolean).map(Number) : []
}

/** Corrections (numbered in CORRECTIONS.md, from FIRST_COVERED on) with no case and no reason. */
export function uncoveredCorrections(root, correctionsText) {
  const nums = correctionsText.split(/^## (?=\d+\. )/m).slice(1).map((p) => Number(/^\d+/.exec(p)[0]))
  const have = new Set(loadCases(root).flatMap(caseCorrections))
  const f = new URL(UNTESTABLE, root)
  const why = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}
  return nums.filter((n) => n >= FIRST_COVERED && !have.has(n) && !why[String(n)])
}
