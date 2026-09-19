// Infinity clean-up, model × effort bake-off on real transcripts.
//   set -a; . .env.local; set +a
//   npx tsx scripts/polly/cleanup-bench.ts <transcripts.json> [model:effort …]
// transcripts.json: `supabase db query --linked "select i.title, v.transcript …"` output
// ({ rows: [{ title, transcript: [{ role, text }] }] }). Prints seconds and the
// curated fixes / grammar per config, and writes the full analyses next to the input.
import { readFileSync, writeFileSync } from 'node:fs'
import { analyzeConversation, CLEANUP_TIERS } from '../../src/lib/polly/infinity'

async function main() {
  const file = process.argv[2]
  const configs = process.argv.slice(3).length ? process.argv.slice(3) : ['sonnet-5:medium', 'opus-5:high']
  const rows = JSON.parse(readFileSync(file, 'utf8')).rows as { title: string; transcript: never[] }[]
  const out: Record<string, unknown> = {}
  for (const cfg of configs) {
    const [model, effort] = cfg.split(':')
    CLEANUP_TIERS.deep = { model, effort: effort as never, maxTokens: 16_000 }
    for (const r of rows) {
      const t = Date.now()
      try {
        const a = await analyzeConversation({ language: 'it', transcript: r.transcript, fallbackTitle: r.title, quality: 'deep' })
        const secs = ((Date.now() - t) / 1000).toFixed(1)
        out[`${cfg} | ${r.title}`] = { secs, ...a }
        console.log(`\n=== ${cfg} | ${r.title} | ${secs}s | ${a.fixes.length} fixes, ${a.vocab.length} vocab, ${a.grammar.length} grammar`)
        for (const f of a.fixes) console.log(`  [${f.kind}] ${f.said}  →  ${f.fixed}\n      ${f.note}`)
        for (const g of a.grammar) console.log(`  G: ${g.point} — ${g.explain}\n      ${g.drills.map((d) => `${d.prompt} = ${d.answer}`).join(' | ')}`)
      } catch (e) { console.log(`\n=== ${cfg} | ${r.title} FAILED: ${(e as Error).message.slice(0, 200)}`) }
    }
  }
  writeFileSync(file.replace(/\.json$/, '.bench.json'), JSON.stringify(out, null, 1))
}
main()
