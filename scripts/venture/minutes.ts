// Minutes by hand (src/lib/venture/minutes.ts). The server writes them by itself after every call
// and note; this is for a backfill or a rewrite. One Claude call each; no ElevenLabs.
//   ( set -a; . ./.env.local; set +a; npx tsx scripts/venture/minutes.ts --session <id> [--force] )
//   ... --note <venture_messages id> [--force]
//   ... --sweep          what the five-minute cron does
import { minutesAfter, minutesDeps, sweepMinutes, tableReady } from '../../src/lib/venture/minutes-store'
import { minutesText } from '../../src/lib/venture/minutes'

async function main() {
  const [flag, ref, force] = process.argv.slice(2)
  if (!(await tableReady())) {
    console.error('venture_minutes is missing: apply apps/venture/schema/010_minutes.sql first')
    process.exit(1)
  }
  if (flag === '--sweep') {
    console.log(await sweepMinutes())
  } else if ((flag === '--session' || flag === '--note') && ref) {
    const source = flag === '--session' ? 'meeting' : 'note'
    await minutesAfter(source, ref, force === '--force')
    const m = await minutesDeps.get(source, ref)
    console.log(m ? minutesText(m) : '(nothing to write: no words from Bart)')
  } else {
    console.error('usage: minutes.ts --session <id> | --note <id> [--force] | --sweep')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
