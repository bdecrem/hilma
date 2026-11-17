// "Compare with Claude", scripted, so the checks can make a made-up copy, run both engines on it and
// judge them without a real model call. Three parts:
//
//   twinAnswer(body)     the fake of Ola's own model making the copy (workspace/ola-twin make): a
//                        roster of 30 invented people with 4 repeated rows, a request to remove the
//                        repeats into clean.csv and say how many, and checks for it. A task whose
//                        text has "PLANT-LEAK:<word>" or "PLANT-UNSURE:<word>" gets a copy whose
//                        request carries <word> (the leak check must then refuse it or hold it).
//   claudeTwinStep(...)  the fake of Claude doing that copy: one Bash call that removes the repeats
//                        and prints the counts, then a one-line answer with them.
//   judgeAnswer(body)    the fake judge (frontdesk/compare.mjs): the result that made clean.csv and
//                        says how many repeats is better, with a quote from each. "JUDGE-BIAS" in
//                        the material makes it always prefer the first result shown (so the order
//                        swap must end in "unsure").
export const isTwinRequest = (body) => (body?.messages ?? []).some((m) => m.role === 'system' && String(m.content ?? '').startsWith('OLA-TWIN-MAKER'))

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => p.text ?? '').join(' ') : '')

export const GENERATOR = `
import csv
FIRST = ["Avel", "Brin", "Cosa", "Dree", "Elko", "Fenn", "Gali", "Hesk", "Ivo", "Jory"]
LAST = ["Pell", "Quor", "Rask", "Sumo", "Tavi", "Ulme"]
def make(out, rng):
    names = []
    while len(names) < 26:
        n = rng.choice(FIRST) + " " + rng.choice(LAST)
        if n not in names:
            names.append(n)
    rows = [[i + 1, n, rng.choice(["North", "South", "East"]), rng.randint(1, 20)] for i, n in enumerate(names)]
    dups = rng.sample(rows, 4)
    allrows = rows + [[r[0], r[1].lower() + " ", r[2], r[3]] for r in dups]
    rng.shuffle(allrows)
    with open(out / "data.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "region", "hours"])
        w.writerows(allrows)
    return {"rows": len(allrows), "unique": 26, "duplicates": 4}
`

export function twinAnswer(body) {
  const user = textOf((body.messages ?? []).filter((m) => m.role === 'user').at(-1)?.content)
  const plant = /PLANT-(LEAK|UNSURE):([A-Za-z0-9]+)/.exec(user)
  const request = `Remove the repeated rows from data.csv into clean.csv and tell me how many repeats you removed.${plant ? ` Note: ${plant[2]}.` : ''}`
  const checks = [
    { name: 'has_clean', type: 'file', path: 'clean.csv', label: 'stopped_early' },
    { name: 'clean_rows', type: 'csv_rows', path: 'clean.csv', truth: 'unique', label: 'numbers_wrong' },
    { name: 'no_repeats', type: 'csv_unique', path: 'clean.csv', column: 'name', label: 'missed_planted_problem' },
    { name: 'says_repeats', type: 'says_number', truth: 'duplicates', label: 'numbers_wrong' },
  ]
  return { content: JSON.stringify({ kind: 'clean', request, generator: GENERATOR, checks }), prompt: 900, completion: 400 }
}

export const CLAUDE_TWIN_COMMAND = `python3 -c "
import csv
rows = list(csv.reader(open('data.csv')))
seen, keep = set(), [rows[0]]
for r in rows[1:]:
    k = r[1].strip().lower()
    if k in seen: continue
    seen.add(k); keep.append(r)
csv.writer(open('clean.csv', 'w', newline='')).writerows(keep)
print(len(rows) - len(keep), len(keep) - 1)
"`

/** Claude's step on the copy: null when the request is not the copy's. */
export function claudeTwinStep(ask, done) {
  if (!/repeated rows from data\.csv into clean\.csv/.test(ask)) return null
  if (!done.length) return { tool: 'Bash', input: { command: CLAUDE_TWIN_COMMAND, description: 'Remove the repeated rows' } }
  const out = textOf(done.at(-1).content).trim().split(/\s+/)
  return { text: `I removed ${out[0]} repeated rows. clean.csv has ${out[1]} people.` }
}

export const isJudgeRequest = (body) => String(typeof body?.system === 'string' ? body.system : textOf(body?.system)).startsWith('OLA-COMPARE-JUDGE')

export function judgeAnswer(body) {
  const user = textOf((body.messages ?? []).find((m) => m.role === 'user')?.content)
  const part = (label) => {
    const m = new RegExp(`<result ${label}>([\\s\\S]*?)</result>`).exec(user)
    return m ? m[1] : ''
  }
  const a = part('A')
  const b = part('B')
  const good = (t) => /removed \d+ repeated rows/i.test(t) && /clean\.csv/.test(t)
  // A quote from the result's own final message (the material labels it "Final message:").
  const quote = (t) => (/I removed \d+ repeated rows/.exec(t)?.[0] ?? (/Final message:\n([^\n]*)/.exec(t)?.[1] ?? '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ')).slice(0, 120)
  let better = good(a) && !good(b) ? 'A' : good(b) && !good(a) ? 'B' : 'same'
  if (/JUDGE-BIAS/.test(user)) better = 'A'
  return JSON.stringify({
    points: [
      { criterion: 'correct', better, evidence_a: quote(a), evidence_b: quote(b) },
      { criterion: 'complete', better, evidence_a: quote(a), evidence_b: quote(b) },
    ],
    overall: better,
    difference: better === 'same' ? 'Both did the same.' : `Result ${better} removed the repeated rows into clean.csv and said how many; the other did not.`,
  })
}
