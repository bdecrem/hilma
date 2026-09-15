// Onething copy: every random line the app can send must be recognised as our
// own when it echoes back through the webhook (otherwise the morning question
// is saved as the person's thought), and no plausible human sentence may be.
//   npx tsx scripts/onething/copy-check.ts
import copy from '../../src/lib/onething/copy.json'
import { confirmText, looksLikeOurs, promptText, reminderText, SITE_URL } from '../../src/lib/onething/core'

let failures = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failures++
}

// Every line, as sent (with the URL) and as Messages sometimes echoes it (trimmed, no URL).
for (const [kind, lines] of Object.entries({ morning: copy.morning, reminder: copy.reminder, kept: copy.kept, retired: copy.retired })) {
  let ok = true
  for (const line of lines) {
    const sent = `${line.replace('{n}', '17')}\n${SITE_URL}`
    if (!looksLikeOurs(sent) || !looksLikeOurs(sent.replace(`\n${SITE_URL}`, ''))) {
      ok = false
      console.log(`  not recognised: ${line}`)
    }
  }
  check(ok, `${kind}: all ${lines.length} lines recognised as ours, with and without the URL`)
}

// The builders only ever produce lines from the file.
let built = true
for (let i = 0; i < 200; i++) {
  const r = { streak: 3, edited: false } as Parameters<typeof confirmText>[0]
  for (const t of [promptText(), reminderText(3), confirmText(r)]) {
    if (!looksLikeOurs(t)) { built = false; console.log(`  builder produced unrecognised text: ${t}`) }
    if (!t.endsWith(`\n${SITE_URL}`)) { built = false; console.log(`  missing URL line: ${t}`) }
    if (t.includes('{n}')) { built = false; console.log(`  unreplaced {n}: ${t}`) }
  }
}
check(built, '200 random builds: recognised, URL line present, {n} replaced')

// Human sentences that must NOT be swallowed as echoes.
const human = [
  'Kept my head down and finished the deck.',
  'Morning run, then nothing much.',
  'Day 3 of the cold. Still here.',
  'Got it done. The garden, finally.',
  'Still time to fix the bike, I think.',
  'Saved a bird from the cat.',
  'nothing much',
]
const swallowed = human.filter((t) => looksLikeOurs(t))
check(swallowed.length === 0, `human sentences pass through${swallowed.length ? ` — swallowed: ${swallowed.join(' | ')}` : ''}`)

// The old fixed wordings still count as ours (their echoes keep arriving).
check(looksLikeOurs('Onething: what is one thing that happened in the last 24 hours? One sentence. Just reply here.'), 'pre-2026-09-13 morning wording still recognised')
check(looksLikeOurs('Got it. Day 4 🔥 · +12 points (40 total) · Sprout.'), 'pre-2026-09-13 confirm wording still recognised')

console.log(failures ? `${failures} failure(s)` : 'all passed')
process.exit(failures ? 1 : 0)
