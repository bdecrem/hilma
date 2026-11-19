// Who writes the minutes of a voice call or a voice note (src/lib/venture/minutes.ts): this
// script, on the Mac mini, once a minute (launchd sh.venture.minutes, apps/venture/runner/). The
// Claude call goes through the machine's Claude login, the Max plan (scripts/venture/_claude.mjs),
// never the API key: Bart, Nov 18, 2026, "all the agent work should be oauth using our max plan"
// (OLA-186). The Vercel server no longer writes minutes; it reads them and stores his corrections.
//   npx tsx scripts/venture/minutes.ts --sweep                     what the job runs: every call that
//                                                                  is over and every note, without minutes
//   npx tsx scripts/venture/minutes.ts --session <id> [--force]    one call, by hand (a rewrite)
//   npx tsx scripts/venture/minutes.ts --note <venture_messages id> [--force]
// Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from .env.local by itself (names only, no other key).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { minutesAfter, minutesDeps, sweepMinutes, tableReady } from '../../src/lib/venture/minutes-store'
import { minutesText, SCHEMA, type MinutesDeps } from '../../src/lib/venture/minutes'
// @ts-expect-error a plain .mjs helper, shared with the steer count and the replay test
import { askClaude } from './_claude.mjs'

for (const l of readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^(SUPABASE_URL|SUPABASE_SERVICE_KEY)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const deps: MinutesDeps = {
  ...minutesDeps,
  ask: async (system, user) => JSON.stringify((await askClaude({ system, user, schema: SCHEMA, effort: 'medium', timeoutMs: 5 * 60e3 })).json),
}

async function main() {
  const [flag, ref, force] = process.argv.slice(2)
  if (!(await tableReady())) {
    console.error('venture_minutes is missing: apply apps/venture/schema/010_minutes.sql first')
    process.exit(1)
  }
  if (flag === '--sweep') {
    const { written } = await sweepMinutes(deps)
    // silent when there was nothing to write, so the job's log stays short
    if (written.length) console.log(`${new Date().toISOString().slice(0, 19)}Z minutes written on the Claude login: ${written.join(', ')}`)
  } else if ((flag === '--session' || flag === '--note') && ref) {
    const source = flag === '--session' ? 'meeting' : 'note'
    await minutesAfter(source, ref, deps, force === '--force')
    const m = await minutesDeps.get(source, ref)
    console.log(m ? minutesText(m) : '(nothing to write: no words from Bart)')
  } else {
    console.error('usage: minutes.ts --sweep | --session <id> [--force] | --note <id> [--force]')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
