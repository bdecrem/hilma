// blankOnly(): a drill's answer is cut down to what goes in the blank.
//   npx tsx scripts/polly/blank-only-check.ts
import { blankOnly } from '../../src/lib/polly/infinity'
const cases: [string, string, string][] = [
  ['She is tired. → Lei è ___.', 'Lei è stanca.', 'stanca'],
  ['I am tired. → Sono ___.', 'Sono stanco.', 'stanco'],
  ['I went to the restaurant. → Sono andato ___ ristorante.', 'al', 'al'],
  ['Noi abbiamo ___ la pizza. (mangiare)', 'Noi abbiamo mangiato la pizza.', 'mangiato'],
  ['Noi abbiamo ___ la pizza. (mangiare)', 'mangiato', 'mangiato'],
  ['Elle ___ fatiguée.', 'Elle est fatiguée.', 'est'],
  ['___ stanchi.', 'Siamo stanchi.', 'Siamo'],
  ['No blank here', 'whatever', 'whatever'],
  ['Lei è ___.', 'Sono stanco.', 'Sono stanco.'], // doesn't fit the sentence: left alone
]
let bad = 0
for (const [p, a, want] of cases) {
  const got = blankOnly(p, a)
  console.log(`${got === want ? 'PASS' : 'FAIL'} ${JSON.stringify(p)} + ${JSON.stringify(a)} → ${JSON.stringify(got)}`)
  if (got !== want) bad++
}
process.exit(bad ? 1 : 0)
