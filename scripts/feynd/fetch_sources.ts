/**
 * Ingest URLs into feynd_sources.
 *
 * Usage (one URL at a time with full metadata):
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/feynd/fetch_sources.ts \
 *     --topic ai-learning \
 *     --kind blog \
 *     --url https://example.com/pretraining-deep-dive \
 *     --title "Pretraining, deep dive" \
 *     --author "Jane Researcher" \
 *     --publisher "Lab blog" \
 *     --published 2025-11-03 \
 *     --tags "pretraining,scaling_laws"
 *
 * Or batch from a JSON file (array of objects with the same keys minus --):
 *   npx tsx scripts/feynd/fetch_sources.ts --topic ai-learning --batch sources.json
 *
 * Fetching uses r.jina.ai as a readability proxy — it returns clean
 * markdown for any URL without needing a scraping stack.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

type SourceInput = {
  url: string
  kind: string
  title: string
  author?: string
  publisher?: string
  published?: string        // YYYY-MM-DD
  tags?: string[] | string  // 'tag1,tag2' or ['tag1','tag2']
}

type Flags = {
  topic?: string
  kind?: string
  url?: string
  title?: string
  author?: string
  publisher?: string
  published?: string
  tags?: string
  batch?: string
}

function parseFlags(argv: string[]): Flags {
  const out: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2) as keyof Flags
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    out[key] = val
  }
  return out
}

async function fetchCleanText(url: string): Promise<string> {
  // r.jina.ai accepts http(s) URLs and returns markdown.
  const target = `https://r.jina.ai/${url}`
  const res = await fetch(target, {
    headers: {
      'User-Agent': 'FeyndIngest/1.0 (+https://hilma-nine.vercel.app)',
      'X-Return-Format': 'markdown',
    },
  })
  if (!res.ok) {
    throw new Error(`r.jina.ai ${res.status} for ${url}`)
  }
  const text = await res.text()
  if (text.length < 400) {
    throw new Error(`suspiciously short content (${text.length} chars) for ${url}`)
  }
  return text
}

function estimateTokens(text: string): number {
  // Rough: 1 token ≈ 4 chars of English.
  return Math.ceil(text.length / 4)
}

async function ingestOne(
  sb: ReturnType<typeof createClient>,
  topicId: string,
  input: SourceInput
): Promise<{ id: string; title: string; chars: number }> {
  const tags: string[] = Array.isArray(input.tags)
    ? input.tags
    : input.tags
    ? input.tags.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  console.log(`  fetching: ${input.url}`)
  const text = await fetchCleanText(input.url)
  console.log(`    got ${text.length} chars, ~${estimateTokens(text)} tokens`)

  const row = {
    topic_id: topicId,
    kind: input.kind,
    url: input.url,
    title: input.title,
    author: input.author ?? null,
    publisher: input.publisher ?? null,
    published_on: input.published ?? null,
    source_text: text,
    tags,
    token_estimate: estimateTokens(text),
  }

  const { data, error } = await sb
    .from('feynd_sources')
    .upsert(row, { onConflict: 'topic_id,url' })
    .select('id,title')
    .single()
  if (error) throw new Error(`upsert failed: ${error.message}`)
  return { id: (data as { id: string; title: string }).id, title: (data as { id: string; title: string }).title, chars: text.length }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  const topicId = flags.topic
  if (!topicId) {
    console.error('--topic is required')
    process.exit(1)
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set')
    process.exit(1)
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const items: SourceInput[] = []
  if (flags.batch) {
    const raw = JSON.parse(readFileSync(flags.batch, 'utf8'))
    if (!Array.isArray(raw)) throw new Error('batch file must be a JSON array')
    for (const item of raw) items.push(item)
  } else {
    if (!flags.url || !flags.title || !flags.kind) {
      console.error('Single-URL mode needs --url, --title, --kind')
      process.exit(1)
    }
    items.push({
      url: flags.url,
      kind: flags.kind,
      title: flags.title,
      author: flags.author,
      publisher: flags.publisher,
      published: flags.published,
      tags: flags.tags,
    })
  }

  console.log(`ingesting ${items.length} source(s) into topic "${topicId}"\n`)
  let ok = 0
  for (const item of items) {
    try {
      const r = await ingestOne(sb, topicId, item)
      console.log(`  ✓ ${r.title} (${r.chars} chars, id ${r.id.slice(0, 8)})`)
      ok++
    } catch (e) {
      console.error(`  ✗ ${item.title}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`\ndone — ${ok}/${items.length} ingested`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
