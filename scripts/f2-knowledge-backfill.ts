// Build (or refresh) the knowledge index — a digest + embedded chunks per
// topic — that Dodo's global chat runs on (src/lib/f2/knowledge.ts).
// Idempotent: a topic whose material hash is unchanged is skipped.
//
//   npx tsx scripts/f2-knowledge-backfill.ts <userId|username>   # one user
//   npx tsx scripts/f2-knowledge-backfill.ts --all               # everyone
//   … --force                                                    # redo even when fresh
//
// Needs ANTHROPIC_API_KEY, OPENAI_API_KEY and SUPABASE_* in .env.local.
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const { f2Supabase } = await import('../src/lib/f2/supabase')
  const { listTopicsForUser } = await import('../src/lib/f2/threads')
  const { indexTopic } = await import('../src/lib/f2/knowledge')
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const target = args.find((a) => !a.startsWith('--'))

  let users: { id: string; username: string }[]
  if (args.includes('--all')) {
    const { data } = await f2Supabase().from('f2_users').select('id, username')
    users = (data ?? []) as { id: string; username: string }[]
  } else if (target) {
    const { data } = await f2Supabase()
      .from('f2_users')
      .select('id, username')
      .or(`username.eq.${target}${/^[0-9a-f-]{36}$/.test(target) ? `,id.eq.${target}` : ''}`)
    users = (data ?? []) as { id: string; username: string }[]
  } else {
    throw new Error('usage: f2-knowledge-backfill.ts <userId|username> | --all [--force]')
  }

  let indexed = 0, fresh = 0, failed = 0, chunks = 0
  for (const user of users) {
    const topics = await listTopicsForUser(user.id)
    if (topics.length === 0) continue
    console.log(`\n${user.username}: ${topics.length} topics`)
    // Four at a time: the digest call dominates and they are independent.
    const queue = [...topics]
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (queue.length > 0) {
        const t = queue.shift()!
        const started = Date.now()
        try {
          const r = await indexTopic(t, { force })
          if (r.status === 'indexed') { indexed++; chunks += r.chunks } else fresh++
          console.log(`  ${r.status.padEnd(7)} ${String(r.chunks).padStart(5)} chunks ${String(Date.now() - started).padStart(6)} ms  ${(t.topic ?? t.url ?? '').slice(0, 60)}`)
        } catch (err) {
          failed++
          console.log(`  FAILED  ${(t.topic ?? t.url ?? '').slice(0, 60)} — ${err instanceof Error ? err.message : err}`)
        }
      }
    }))
  }
  console.log(`\nindexed ${indexed} (${chunks} chunks), already fresh ${fresh}, failed ${failed}`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
