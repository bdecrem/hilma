/**
 * One-time-ish: pull the existing course video transcripts into
 * feynd_sources so they join the source pool for /api/feynd/ask. Idempotent
 * (upserts on topic_id+url). Safe to re-run whenever transcripts change.
 *
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/feynd/import_course_videos.ts
 */

import { createClient } from '@supabase/supabase-js'

import course from '../../src/data/feynd/frontier-ai-2026.json'

type Video = {
  id: string
  title: string
  author: string
  host: string
  publishedOn: string
  url: string
  youtubeId: string
  concepts: string[]
  transcript: { status: string; text: string }
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set')
    process.exit(1)
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // The course belongs to ai-learning (same mapping as topics.ts).
  const topicId = 'ai-learning'
  const videos = (course as { videos: Video[] }).videos

  let ok = 0
  for (const v of videos) {
    if (!v.transcript?.text || v.transcript.text.length < 500) {
      console.log(`  skip ${v.id} (no transcript)`)
      continue
    }
    const row = {
      topic_id: topicId,
      kind: 'video',
      url: v.url,
      title: v.title,
      author: v.author,
      publisher: v.host,
      published_on: v.publishedOn,
      source_text: v.transcript.text,
      tags: v.concepts ?? [],
      token_estimate: Math.ceil(v.transcript.text.length / 4),
    }
    const { error } = await sb
      .from('feynd_sources')
      .upsert(row, { onConflict: 'topic_id,url' })
    if (error) {
      console.error(`  ✗ ${v.id}: ${error.message}`)
      continue
    }
    console.log(`  ✓ ${v.id} — ${v.title.slice(0, 60)} (${row.token_estimate} toks)`)
    ok++
  }
  console.log(`\ndone — ${ok}/${videos.length} videos imported into ${topicId}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
