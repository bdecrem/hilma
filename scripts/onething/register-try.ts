// Draws a few sentences across the three registers and prints what came back.
// Real calls, about five seconds each: npx tsx scripts/onething/register-try.ts
import { drawDoodle } from '../../src/lib/onething/doodle'

const SENTENCES = [
  'Dad crisis, or mini crisis. Hilde crying. Puts everything in perspective.',
  'Got the call from the hospital about Mom. Waiting to hear more.',
  'Tired. Not much happened, just a long grey day.',
  'Made pancakes shaped like dinosaurs and the kids lost their minds.',
  'Spent the afternoon on expense reports and the quarterly forms.',
]

async function main() {
  for (const s of SENTENCES) {
    const d = await drawDoodle(s, { wordAllowed: false, whimsyAllowed: true })
    console.log(`\n${s}\n  → ${d.alt} | whimsy ${d.whimsy}\n  ${d.svg}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
