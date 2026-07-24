/**
 * f2-origin-long.ts — generate a genuinely long (45–55 min) audio summary for
 * the Origin Story topic by writing the book in N parts (each ~1,900 words of
 * spoken prose over its own span of the raw text) and stitching them, then TTS.
 * Runs offline so it can't hit the serverless time limit. One-off.
 *
 * Usage: npx tsx scripts/f2-origin-long.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

for (const line of readFileSync(resolve('.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

import { getThreadById, buildFullContent } from '../src/lib/f2/threads'
import { llmComplete } from '../src/lib/f2/llm'
import { f2Supabase } from '../src/lib/f2/supabase'
import { setAudioSummary, chunkScript, ttsVoice, type AudioSummary, type AudioSummaryVersion } from '../src/lib/f2/audio-summary'

const THREAD_ID = '49fb94b4-2228-4cb4-97d6-1b7947f61667'
const USER_ID = 'b28cffc3-2e04-46e2-bbdf-8034492d522c'
const PARTS = 4
const WRITE_MODEL = 'opus-4-8'
const NOTES_MODEL = 'sonnet-4-6'
const WPM = 160
const TTS_MODEL = 'gpt-4o-mini-tts'
const TTS_INSTRUCTIONS =
  'Warm, unhurried narrator — like a good audiobook or a smart friend recapping something they love. Natural pacing, no radio-announcer energy.'

const VOICE_RULES = `The voice is the whole point:
- Sound like a person, not an AI, not a TED talk, not a corporate blog. Say things straight. Trust the listener.
- Never use these words: delve, tapestry, pivotal, seamless, leverage, harness, unlock, unleash, realm, journey, landscape (figurative), testament, dive/deep dive, crucial, vital, foster, underscore, illuminate, resonate, weave, intricate, nuanced, robust, transformative, groundbreaking, ultimately, moreover, furthermore, notably, essentially, indeed, "it's worth noting", "at its core", "when it comes to", "in today's world".
- No "not just X, but Y" and no "it isn't X, it's Y". No rhetorical questions to open. No one-word sentences for drama. No rule-of-three lists where two would do.
- Vary the rhythm — mix short blunt sentences with longer ones. Contractions throughout. Don't editorialize about how important the subject is; show it with specifics.
- Spoken words only: no markdown, no headings, no bullets, no stage directions.`

function splitEqualSpans(text: string, n: number): string[] {
  const paras = text.split(/\n\n+/)
  const target = Math.ceil(text.length / n)
  const spans: string[] = []
  let cur = ''
  for (const p of paras) {
    cur = cur ? `${cur}\n\n${p}` : p
    if (cur.length >= target && spans.length < n - 1) { spans.push(cur); cur = '' }
  }
  if (cur) spans.push(cur)
  return spans
}

async function inBatches<T, R>(items: T[], size: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    const batch = await Promise.all(items.slice(i, i + size).map((it, j) => fn(it, i + j)))
    out.push(...batch)
  }
  return out
}

async function ttsChunkFetch(text: string, voice: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TTS_MODEL, voice, input: text, instructions: TTS_INSTRUCTIONS, response_format: 'mp3' }),
  })
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  const thread = await getThreadById(USER_ID, THREAD_ID)
  if (!thread) throw new Error('thread not found')
  const subject = thread.topic ?? 'this book'
  const corpus = buildFullContent(thread)
  const spans = splitEqualSpans(corpus, PARTS)
  console.log(`corpus ${corpus.length} chars → ${spans.length} parts`)

  // Notes checklist (the user's own reading notes).
  const notesText = readFileSync(resolve('misc/OriginStory.txt'), 'utf8')
  const notesRes = await llmComplete({
    model: NOTES_MODEL,
    system: `The user jotted these raw reading notes about ${subject}. Break them into a clean numbered list of every distinct point, claim, or question worth covering, rewritten just enough to be intelligible. Skip only genuinely unintelligible or off-topic fragments (e.g. a note about their own listening progress). Output ONLY the numbered list.`,
    messages: [{ role: 'user', content: notesText }],
    maxTokens: 3000,
  })
  const notesList = notesRes.type === 'text' ? notesRes.text.trim() : ''
  console.log('notes points extracted')

  // Write each part from its raw span, in parallel.
  const parts = await inBatches(spans, PARTS, async (span, i) => {
    const first = i === 0
    const last = i === spans.length - 1
    const posRule = first
      ? 'This is the very start of the whole summary. Open in the middle of a real, specific idea — do NOT announce the book, no "let\'s talk about", no back-cover framing. Just start with an actual fact.'
      : `Parts 1–${i} already covered the earlier stretch of the book. Continue straight on. Do NOT reintroduce the book, do NOT recap earlier parts, do NOT say "in this part" or "picking up where we left off". Just keep going from here.`
    const endRule = last
      ? 'This is the final part. End on one real closing thought about the whole book.'
      : 'Do not conclude or wrap up — more parts follow after this one.'
    const r = await llmComplete({
      model: WRITE_MODEL,
      system: `You're writing part ${i + 1} of ${spans.length} of one long, in-depth spoken summary of ${subject} — a smart friend walking you through the whole book. A text-to-speech voice reads it aloud.

${posRule}
Cover the stretch of the book in the source below, in real depth and in order — the ideas, how they develop, and the concrete dates, names, and mechanisms. Aim for about 1,900–2,100 words for this part. ${endRule}

${VOICE_RULES}

The user took these reading notes on the book. Wherever a note belongs to THIS stretch of the book, make sure you cover it (answer their questions; if a note gets a fact wrong, give the correct version plainly). Notes for other stretches are handled by the other parts.
Notes:
${notesList}

Output ONLY the spoken words for this part.

Source (this part's stretch of the book, in order):
${span}`,
      messages: [{ role: 'user', content: `Write part ${i + 1} now.` }],
      maxTokens: 8000,
    })
    const text = r.type === 'text' ? r.text.trim() : ''
    console.log(`  part ${i + 1}: ${text.split(/\s+/).length} words`)
    return text
  })

  const script = parts.filter(Boolean).join('\n\n')
  const words = script.split(/\s+/).length
  const durationSecs = Math.round((words / WPM) * 60)
  console.log(`\nfull script: ${words} words ~${Math.round(durationSecs / 60)} min`)
  // Persist the script so an upload failure never forces regenerating it.
  writeFileSync('/tmp/origin-long-script.txt', script)

  // TTS (batched) + concat.
  const voice = ttsVoice()
  const chunks = chunkScript(script)
  console.log(`tts: ${chunks.length} chunks`)
  const buffers = await inBatches(chunks, 6, (c) => ttsChunkFetch(c, voice))
  const mp3 = Buffer.concat(buffers)
  writeFileSync('/tmp/origin-long.mp3', mp3)
  console.log(`mp3: ${(mp3.length / 1048576).toFixed(1)} MB`)

  // Upload, drop stale mp3s.
  const sb = f2Supabase()
  const path = `${USER_ID}/${THREAD_ID}-${Date.now()}.mp3`
  const up = await sb.storage.from('f2-audio').upload(path, mp3, { contentType: 'audio/mpeg', upsert: true })
  if (up.error) throw up.error
  const { data: existing } = await sb.storage.from('f2-audio').list(USER_ID)
  const stale = (existing ?? []).map((o) => `${USER_ID}/${o.name}`).filter((p) => p.includes(`/${THREAD_ID}-`) && p !== path)
  if (stale.length) await sb.storage.from('f2-audio').remove(stale)
  const { data: pub } = sb.storage.from('f2-audio').getPublicUrl(path)

  // Version merge: keep the base (18-min) version, replace any prior augmented
  // ones with this long version, make it current.
  const now = new Date().toISOString()
  const prior = thread.audio_summary
  const base = prior?.versions?.find((v) => v.id === 'base')
    ?? (prior?.script ? { id: 'base', script: prior.script, scale: 'book' as const, duration_secs: prior.duration_secs ?? 0, instructions: null, created_at: prior.updated_at ?? now } : null)
  const longVersion: AudioSummaryVersion = {
    id: `v${Date.now()}`,
    script,
    scale: 'book',
    duration_secs: durationSecs,
    instructions: '45–55 min in-depth summary — the full book, part by part, plus your notes',
    created_at: now,
  }
  const summary: AudioSummary = {
    status: 'ready',
    url: pub.publicUrl,
    script,
    scale: 'book',
    duration_secs: durationSecs,
    voice,
    instructions: longVersion.instructions,
    updated_at: now,
    versions: base ? [base, longVersion] : [longVersion],
    current_id: longVersion.id,
  }
  await setAudioSummary(THREAD_ID, USER_ID, summary)

  console.log('\n--- opening ---\n' + script.slice(0, 350) + '\n---------------')
  console.log('audio:', pub.publicUrl)
  console.log('DONE')
}

main().catch((e) => { console.error(e); process.exit(1) })
