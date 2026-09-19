// Bake-offs behind src/lib/polly/quality.ts — run a feature at several
// model:effort settings on real material, print seconds and the output.
//   set -a; . .env.local; set +a
//   npx tsx scripts/polly/quality-bench.ts cleanup <transcripts.json> [model:effort …]
//   npx tsx scripts/polly/quality-bench.ts plan    <thread.json>      [model:effort …]
//   npx tsx scripts/polly/quality-bench.ts cards   <thread.json>      [model:effort …]
//   npx tsx scripts/polly/quality-bench.ts grammar <thread.json>      [model:effort …]
//   npx tsx scripts/polly/quality-bench.ts judge   [modelid:effort …]   (built-in Italian answer set)
// transcripts.json / thread.json are `supabase db query --linked "select …"` output ({ rows: [...] }).
// Nothing is written to the database.
import { readFileSync } from 'node:fs'
import { analyzeConversation } from '../../src/lib/polly/infinity'
import { extractLesson } from '../../src/lib/polly/lesson'
import { draftLessonCards, draftGrammarCards, judgeTextAnswers, type FlashCard } from '../../src/lib/polly/flash'
import { TIERS, type Tier } from '../../src/lib/polly/quality'
import type { PollyThread } from '../../src/lib/polly/threads'

const tierOf = (cfg: string): Tier => { const [model, effort] = cfg.split(':'); return { model, effort: effort as Tier['effort'] } }
const rowsOf = (file: string) => JSON.parse(readFileSync(file, 'utf8')).rows as Record<string, unknown>[]
const secs = (t: number) => ((Date.now() - t) / 1000).toFixed(1)

// [question, canonical answer, the learner's answer, should it pass?]
const JUDGE_SET: [string, string, string, boolean][] = [
  ['In Italian: I am tired (a man speaking)', 'Sono stanco', 'sono stancato', false],
  ['In Italian: I was at the restaurant', 'Sono stato al ristorante', 'sono stato in ristorante', false],
  ['In Italian: we ate', 'Abbiamo mangiato', 'abbiamo mangiata', false],
  ['In Italian: we went to the sea', 'Siamo andati al mare', 'siamo andato al mare', false],
  ['In Italian: it is already evening', 'È già sera', 'già è sera', false],
  ['How do you ask "how are you?" formally in Italian?', 'Come sta?', 'Come stai?', false],
  ['She is tired. → Lei è ___.', 'stanca', 'stanco', false],
  ['In Italian: something', 'qualcosa', 'algo', false],
  ['In Italian: to go grocery shopping', 'fare la spesa', 'fare le compere del supermercato', false],
  ['«un amante»?', 'a lover (often a secret one)', 'a good friend', false],
  ['In Italian: why / because', 'perché', 'perche', true],
  ['In Italian: again / one more time', "un'altra volta", 'un altra volta', true],
  ['In Italian: my name is Luca', 'Mi chiamo Luca', 'Io mi chiamo Luca.', true],
  ['In Italian: the evening', 'la serata', 'la sera', true],
  ['In Italian: goodbye (formal)', 'Arrivederci', 'arrivederci!', true],
  ['In Italian: we ate sushi', 'Abbiamo mangiato il sushi', 'abbiamo mangiato sushi', true],
  ['What does “avere un debole per” mean?', 'to have a soft spot for', 'to have a weakness for someone', true],
  ['What does “la giornata” mean?', 'the (whole) day', 'day', true],
  ['What does “fare un giro” mean?', 'to go for a walk / stroll / drive', 'take a stroll', true],
  ['In Italian: I went for a stroll', 'Sono andato a fare un giro', 'ho fatto un giro', true],
]

async function main() {
  const [what, ...rest] = process.argv.slice(2)
  if (what === 'judge') {
    const configs = rest.length ? rest : ['claude-haiku-4-5']
    const cards = JUDGE_SET.map(([question, answer], i) => ({ id: String(i), user_id: 'bench', question, answer, open_question: null, grading_note: null }) as unknown as FlashCard)
    const given = JUDGE_SET.map((x) => x[2])
    for (const rubric of [null, 'Italian'] as const) {
      for (const cfg of configs) {
        const t = Date.now()
        const got = await judgeTextAnswers(cards, given, tierOf(cfg), rubric)
        const wrong = JUDGE_SET.map((x, i) => (got[i] === x[3] ? null : `${x[2]} (for ${x[1]}) judged ${got[i] ? 'RIGHT' : 'WRONG'}`)).filter(Boolean)
        console.log(`\n=== judge | rubric=${rubric ?? 'idea (Dodo)'} | ${cfg} | ${secs(t)}s | ${JUDGE_SET.length - wrong.length}/${JUDGE_SET.length}`)
        for (const w of wrong) console.log('   ✗', w)
      }
    }
    return
  }
  const file = rest[0]
  const configs = rest.slice(1).length ? rest.slice(1) : ['sonnet-5:medium', 'opus-5:high']
  for (const cfg of configs) {
    const tier = tierOf(cfg)
    for (const row of rowsOf(file)) {
      const t = Date.now()
      try {
        if (what === 'cleanup') {
          TIERS.cleanup.deep = tier
          const a = await analyzeConversation({ language: 'it', transcript: row.transcript as never[], fallbackTitle: row.title as string, quality: 'deep' })
          console.log(`\n=== cleanup | ${cfg} | ${row.title} | ${secs(t)}s | ${a.fixes.length} fixes, ${a.vocab.length} vocab, ${a.grammar.length} grammar`)
          for (const f of a.fixes) console.log(`  [${f.kind}] ${f.said}  →  ${f.fixed}\n      ${f.note}`)
          for (const g of a.grammar) console.log(`  G: ${g.point} — ${g.explain}\n      ${g.drills.map((d) => `${d.prompt} = ${d.answer}`).join(' | ')}`)
        } else if (what === 'plan') {
          const p = await extractLesson({ ...row, lesson: null } as unknown as PollyThread, 'Italian', tier)
          console.log(`\n=== plan | ${cfg} | ${secs(t)}s | ${p.key_words.length} key words, ${p.phrases.length} phrases`)
          for (const k of [...p.key_words, ...p.phrases]) console.log(`  ${k.term} — ${k.meaning}\n      “${k.sentence}”`)
          console.log(`  grammar: ${p.grammar_point}\n  question: ${p.closing_question}\n  story: ${p.story_summary}`)
        } else {
          const thread = row as unknown as PollyThread
          const cards = what === 'grammar' ? await draftGrammarCards(thread, 10, tier) : await draftLessonCards(thread, 12, tier)
          console.log(`\n=== ${what} | ${cfg} | ${secs(t)}s | ${cards.length} cards`)
          for (const c of cards) console.log(`  ${c.question}  =  ${c.answer}   [${(c.distractors ?? []).join(' | ')}]`)
        }
      } catch (e) { console.log(`\n=== ${what} | ${cfg} FAILED: ${(e as Error).message.slice(0, 200)}`) }
    }
  }
}
main()
