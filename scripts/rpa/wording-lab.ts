// Rock Paper Anything — which question wording separates real counters from
// unrelated ones? Every authored answer is judged against its own enemy (should
// be high) and against an unrelated enemy (should be low), once per wording,
// all in one call per phrase.
//   set -a; . .env.local; set +a; npx tsx scripts/rpa/wording-lab.ts
import { ENEMIES } from '../../src/lib/rpa/enemies'

const WORDINGS: Record<string, (name: string) => string> = {
  A_current: (n) => `In a playful rock-paper-scissors sense, \`attack\` would defeat, stop, or neutralize ${n}.`,
  B_answer: (n) => `\`attack\` is a good answer to the question "what beats ${n}?"`,
  C_solve: (n) => `\`attack\` would solve, cure, undo, get rid of, or win against ${n}.`,
  D_helped: (n) => `Someone struggling with ${n} would be glad to have \`attack\`, because it works against ${n}.`,
  E_game: (n) => `In a word game where one thing beats another whenever there is a sensible reason, \`attack\` beats ${n}.`,
  F_remedy: (n) => `\`attack\` is a known remedy, counter, natural enemy, or fix for ${n}.`,
}

const COMBOS: Record<string, string[]> = { 'max(A,D)': ['A_current', 'D_helped'], 'max(A,B,D)': ['A_current', 'B_answer', 'D_helped'] }

async function ask(phrase: string, own: string, other: string) {
  const questions: Record<string, unknown> = {}
  for (const [k, w] of Object.entries(WORDINGS)) {
    questions[`${k}|pos`] = { type: 'noul', instructions: w(own) }
    questions[`${k}|neg`] = { type: 'noul', instructions: w(other) }
  }
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-1.13.0', state: { attack: phrase }, questions }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return ((await res.json()) as { answers: Record<string, { noul: number }> }).answers
}

async function main() {
  const jobs = ENEMIES.flatMap((en, i) => en.answers.map((a) => ({ a, own: en, other: ENEMIES[(i + 37) % ENEMIES.length] })))
  const stats: Record<string, { pos: number[]; neg: number[] }> = Object.fromEntries(Object.keys(WORDINGS).map((k) => [k, { pos: [], neg: [] }]))
  const rows: string[] = []
  const queue = [...jobs]
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      const ans = await ask(j.a, j.own.name, j.other.name)
      for (const [name, ks] of Object.entries(COMBOS)) { (stats[name] ??= { pos: [], neg: [] }); stats[name].pos.push(Math.max(...ks.map((k) => ans[`${k}|pos`].noul))); stats[name].neg.push(Math.max(...ks.map((k) => ans[`${k}|neg`].noul))) }
      for (const k of Object.keys(WORDINGS)) { stats[k].pos.push(ans[`${k}|pos`].noul); stats[k].neg.push(ans[`${k}|neg`].noul) }
      rows.push(`${j.a} → ${j.own.name}: ` + Object.keys(WORDINGS).map((k) => `${k[0]}=${ans[`${k}|pos`].noul.toFixed(2)}`).join(' ') + `   | vs ${j.other.name}: ` + Object.keys(WORDINGS).map((k) => `${k[0]}=${ans[`${k}|neg`].noul.toFixed(2)}`).join(' '))
    }
  }))
  if (process.argv.includes('--rows')) console.log(rows.join('\n'))
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length
  const frac = (x: number[], f: (v: number) => boolean) => x.filter(f).length / x.length
  console.log('\nwording      mean+  mean-  +>=.60  +<.35  ->=.50')
  for (const [k, s] of Object.entries(stats)) console.log(`${k.padEnd(12)} ${mean(s.pos).toFixed(2)}   ${mean(s.neg).toFixed(2)}   ${frac(s.pos, (v) => v >= 0.6).toFixed(2)}    ${frac(s.pos, (v) => v < 0.35).toFixed(2)}   ${frac(s.neg, (v) => v >= 0.5).toFixed(2)}`)
}
main()
