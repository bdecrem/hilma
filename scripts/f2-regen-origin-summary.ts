/**
 * f2-regen-origin-summary.ts — one-off: attach Bart's reading notes to the
 * "Origin Story by David Christian" topic and regenerate its audio summary
 * through the real pipeline (so it uses the updated, anti-slop buildScriptSystem
 * prompt). Replaces the existing base summary.
 *
 * Usage: npx tsx scripts/f2-regen-origin-summary.ts
 * Env: reads .env.local from the repo root.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env.local before touching any lib code (lib uses lazy getters, but be safe).
for (const line of readFileSync(resolve('.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

import { getThreadById } from '../src/lib/f2/threads'
import { generateAudioSummary } from '../src/lib/f2/audio-summary'
import { f2Supabase } from '../src/lib/f2/supabase'

const THREAD_ID = '49fb94b4-2228-4cb4-97d6-1b7947f61667'
const USER_ID = 'b28cffc3-2e04-46e2-bbdf-8034492d522c'
const NOTES_TITLE = "Bart's reading notes (raw scribbles)"

async function main() {
  // 1. Attach Bart's notes as an additional source so the summary reflects them.
  let thread = await getThreadById(USER_ID, THREAD_ID)
  if (!thread) throw new Error('thread not found')

  const hasNotes = (thread.additional_sources ?? []).some((s) => s.title === NOTES_TITLE)
  if (!hasNotes) {
    const notes = readFileSync(resolve('misc/OriginStory.txt'), 'utf8')
    const next = [
      ...(thread.additional_sources ?? []),
      { url: null, title: NOTES_TITLE, content: notes, added_at: new Date().toISOString() },
    ]
    const { error } = await f2Supabase()
      .from('f2_threads')
      .update({ additional_sources: next })
      .eq('id', THREAD_ID)
      .eq('user_id', USER_ID)
    if (error) throw error
    console.log(`attached notes (${notes.length} chars)`)
    thread = await getThreadById(USER_ID, THREAD_ID)
    if (!thread) throw new Error('thread vanished after update')
  } else {
    console.log('notes already attached')
  }

  // 2. Regenerate through the pipeline (opus for quality) at a long, in-depth
  //    target. Runs offline so it can't hit the serverless time limit.
  const instructions =
    'Make this a long, in-depth summary meant to run 45–55 minutes when read aloud — ' +
    'roughly 8,000 to 9,500 words. Walk through the ENTIRE book in real depth: all four ' +
    'parts and every one of the eight thresholds, in order, start to finish, with the ' +
    'dates, names, and mechanisms. This is not a highlight reel — give each part real room. ' +
    'Cover every one of my notes. Do not stop early or wrap up before the whole book is covered.'
  console.log('generating 45–55 min in-depth summary (opus, map-reduce)…')
  const summary = await generateAudioSummary(thread, 'opus-4-8', instructions)

  const opener = (summary.script ?? '').slice(0, 400)
  console.log('\n--- opening ---\n' + opener + '\n---------------')
  console.log('words:', (summary.script ?? '').split(/\s+/).length, '| duration ~', Math.round((summary.duration_secs ?? 0) / 60), 'min')
  console.log('audio:', summary.url)
  console.log('DONE')
}

main().catch((e) => { console.error(e); process.exit(1) })
