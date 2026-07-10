// Seed the prebaked Omniglot course: levels 1-3 x 3 chapters, per language.
// Idempotent — skips (language, level, sort_order) slots that already exist.
//
// Usage: pnpm tsx scripts/omni-seed.ts [lang ...]   (default: all 12)

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Load .env.local before the libs read process.env (dynamic imports below
// keep the lib modules from being hoisted above this).
for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

// The shared course skeleton — same themes for every language, so the
// catalog feels like one designed course rather than a grab bag.
const CURRICULUM: Record<number, string[]> = {
  1: [
    'Meeting someone new — greetings, names, where you are from',
    'Ordering a coffee and a pastry at a cafe',
    'Numbers, prices, and buying something small at a shop',
  ],
  2: [
    'Shopping at the market — asking for produce, quantities, haggling politely',
    'Asking for directions and getting around town',
    'Talking about your family and who you live with',
  ],
  3: [
    'Making weekend plans with a friend',
    'Talking about your job and what you actually do all day',
    'Telling the story of a trip that did not go as planned',
  ],
}

const CONCURRENCY = 6

async function main() {
  const { LANGUAGES } = await import('../src/lib/omni/languages')
  const { generateChapter } = await import('../src/lib/omni/generate')
  const { insertChapterPackage } = await import('../src/lib/omni/topics')
  const { omniSupabase } = await import('../src/lib/omni/supabase')

  const requested = process.argv.slice(2)
  const langs = requested.length
    ? LANGUAGES.filter((l) => requested.includes(l.code))
    : LANGUAGES
  if (requested.length && langs.length !== requested.length) {
    const known = new Set(langs.map((l) => l.code))
    throw new Error(`Unknown language(s): ${requested.filter((c) => !known.has(c)).join(', ')}`)
  }

  const { data: existing, error } = await omniSupabase()
    .from('omni_topics')
    .select('language, level, sort_order')
    .is('user_id', null)
  if (error) throw new Error(`Could not list existing chapters: ${error.message}`)
  const have = new Set(
    (existing ?? []).map((t) => `${t.language}:${t.level}:${t.sort_order}`),
  )

  type Job = { lang: string; level: number; idx: number; theme: string }
  const jobs: Job[] = []
  for (const lang of langs) {
    for (const [levelStr, themes] of Object.entries(CURRICULUM)) {
      const level = Number(levelStr)
      themes.forEach((theme, idx) => {
        if (!have.has(`${lang.code}:${level}:${idx}`)) {
          jobs.push({ lang: lang.code, level, idx, theme })
        }
      })
    }
  }
  console.log(`[seed] ${jobs.length} chapters to generate (${have.size} already exist)`)

  let done = 0
  let failed = 0
  const queue = [...jobs]
  async function worker(id: number) {
    for (;;) {
      const job = queue.shift()
      if (!job) return
      const tag = `${job.lang} L${job.level} #${job.idx}`
      try {
        const pkg = await generateChapter({
          language: job.lang,
          level: job.level,
          theme: job.theme,
        })
        await insertChapterPackage({
          pkg,
          language: job.lang,
          level: job.level,
          kind: 'prebaked',
          sortOrder: job.idx,
        })
        done += 1
        console.log(`[seed] ok ${tag} — "${pkg.title}" (${done + failed}/${jobs.length})`)
      } catch (err) {
        failed += 1
        console.error(`[seed] FAIL ${tag}:`, err instanceof Error ? err.message : err)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)))
  console.log(`[seed] finished: ${done} ok, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[seed] fatal:', err)
  process.exit(1)
})
