import { f2Supabase } from './supabase'
import { buildFullContent, type F2Thread } from './threads'
import { llmComplete, contextCharBudget } from './llm'

// Audio Summary — a one-shot narrated recap of a topic, stored as MP3 in the
// public f2-audio bucket and tracked in the f2_threads.audio_summary jsonb
// column. The script comes from the user's active chat model; the voice from
// OpenAI TTS. Non-interactive by design: it's a recording, not a session.

export type AudioSummaryScale = 'book' | 'short'

/// One generated transcript. The base version has instructions=null; each
/// `summary <instructions>` command appends an augmented version. Only the
/// latest version has playable audio (its MP3 is the thread's current one);
/// older versions keep their transcript only. Shown in Topic Context.
export type AudioSummaryVersion = {
  id: string
  script: string
  scale: AudioSummaryScale
  duration_secs: number
  /** User's redo instructions for this version; null for the base version. */
  instructions: string | null
  created_at: string
}

/// Same as AudioSummaryVersion but with the heavy `script` dropped — what the
/// topics-list payload carries so it stays small.
export type AudioSummaryVersionMeta = Omit<AudioSummaryVersion, 'script'>

export type AudioSummary = {
  status: 'generating' | 'ready' | 'error'
  url?: string
  script?: string
  scale?: AudioSummaryScale
  duration_secs?: number
  voice?: string
  /** Redo instructions behind the current transcript; null for base. */
  instructions?: string | null
  error?: string
  updated_at: string
  /** Every transcript generated for this topic: the base (id 'base') plus each
   *  augmented version. Mirrored top-level fields describe the current one. */
  versions?: AudioSummaryVersion[]
  /** Which version the top-level fields + the current MP3 correspond to. Only
   *  this version has playable audio. */
  current_id?: string
}

const TTS_MODEL = 'gpt-4o-mini-tts'
// Warm-narrator default; override with OPENAI_TTS_VOICE.
const DEFAULT_TTS_VOICE = 'sage'
const TTS_INSTRUCTIONS =
  'Warm, unhurried narrator — like a good audiobook or a smart friend ' +
  'recapping something they love. Natural pacing, no radio-announcer energy.'
// gpt-4o-mini-tts caps input around 2000 tokens; stay well under it per chunk.
const TTS_CHUNK_CHARS = 3000
// Spoken-word rate used to estimate duration from the script.
const WORDS_PER_MINUTE = 160
// How much recent chat history informs the script's emphasis.
const MAX_HISTORY_CHARS = 12000

export function ttsVoice(): string {
  return process.env.OPENAI_TTS_VOICE || DEFAULT_TTS_VOICE
}

export async function setAudioSummary(
  threadId: string,
  userId: string,
  value: AudioSummary | null,
): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ audio_summary: value })
    .eq('id', threadId)
    .eq('user_id', userId)
  if (error) console.error('[f2] setAudioSummary failed:', error)
}

/// Everything the client needs to render list rows / the Play chip — every
/// transcript body (top-level + per-version) is stripped so list payloads stay
/// small. Full transcripts come from GET /api/f2/topics/[id]/summaries.
export function audioSummaryForClient(
  a: AudioSummary | null | undefined,
): (Omit<AudioSummary, 'script' | 'versions'> & { versions?: AudioSummaryVersionMeta[] }) | null {
  if (!a) return null
  const { script: _script, versions, ...rest } = a
  return {
    ...rest,
    versions: versions?.map(({ script: _s, ...meta }) => meta),
  }
}

/// The list of full transcripts for a topic, base first. Handles legacy
/// summaries that predate versioning by synthesizing a single base entry from
/// the top-level fields.
export function audioSummaryVersions(a: AudioSummary | null | undefined): AudioSummaryVersion[] {
  if (!a) return []
  if (a.versions && a.versions.length > 0) return a.versions
  // Legacy summary with no version array yet — synthesize a base entry from
  // the top-level transcript so it still shows in Topic Context.
  if (a.script) {
    return [{
      id: 'base',
      script: a.script,
      scale: a.scale ?? inferScale(a.script),
      duration_secs: a.duration_secs ?? estimateDurationSecs(a.script),
      instructions: a.instructions ?? null,
      created_at: a.updated_at,
    }]
  }
  return []
}

// ---------------------------------------------------------------------------
// Script generation

function buildScriptSystem(
  thread: F2Thread,
  model: string | null | undefined,
  instructions?: string | null,
): string {
  const subject = thread.topic ?? thread.url ?? '(untitled topic)'

  const fullContent = buildFullContent(thread)
  // Reserve room for history + instructions inside the model's context budget.
  const sourceBudget = Math.max(10000, contextCharBudget(model) - MAX_HISTORY_CHARS - 8000)
  const source = fullContent.length > sourceBudget
    ? fullContent.slice(0, sourceBudget) + '\n\n[source truncated]'
    : fullContent
  const sourceWords = Math.round(fullContent.split(/\s+/).length / 1000)

  const history = thread.messages
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
    .slice(-MAX_HISTORY_CHARS)

  return `You are F2 — a learning companion. Write the script for a spoken audio summary of the user's topic: ${subject}. The script will be read aloud by a text-to-speech voice and listened to like a short podcast — a recording, not a conversation.

First, silently pick the scale:
- BOOK scale — the source material is a book or book-length work: 2,300–2,800 words (about 15–18 minutes spoken).
- SHORT scale — anything else (articles, videos, chat-only topics): 450–650 words (about 3–4 minutes spoken).
(The source material below is roughly ${sourceWords} thousand words.)

How to write it:
- This is a smart summary for building broad liberal-arts knowledge: the big ideas, the narrative arc, why it matters, how it connects to the wider world.
- Include SOME anchoring dates, names, and key terms — the level of "the Odyssey is set around 1200 BC but was only written down centuries later." Rough eras and round numbers are exactly right.
- Do NOT pile up statistics, precise figures, or trivia. The listener is not training for a quiz show.
- The user's chat on this topic is included below — let it shape emphasis: return to the questions they asked and the themes they cared about.
- Spoken prose only: no markdown, no headings, no bullet points, no stage directions. Short paragraphs, natural transitions, contractions welcome.
- Open by naming the topic in a natural sentence (no "welcome to"). End with one closing thought — no "thanks for listening."
${instructions?.trim() ? `
The user has asked you to adjust THIS version of the summary as follows:
"${instructions.trim()}"
Follow these instructions. Where they conflict with the default length or scale guidance above (e.g. "make it longer", "go deeper on X", "more dates"), the user's instructions win — override the word-count band as needed.
` : ''}
Output ONLY the script text.

${source ? `Source material:\n${source}\n\n` : ''}${history ? `Chat history on this topic:\n${history}` : '(No chat history yet.)'}`
}

function inferScale(script: string): AudioSummaryScale {
  return script.split(/\s+/).length > 1200 ? 'book' : 'short'
}

function estimateDurationSecs(script: string): number {
  return Math.round((script.split(/\s+/).length / WORDS_PER_MINUTE) * 60)
}

// ---------------------------------------------------------------------------
// TTS

/// Split at paragraph (then sentence) boundaries into chunks the TTS model
/// accepts, so no request ever cuts a sentence in half.
export function chunkScript(script: string, maxChars = TTS_CHUNK_CHARS): string[] {
  const units: string[] = []
  for (const para of script.split(/\n\n+/)) {
    const p = para.trim()
    if (!p) continue
    if (p.length <= maxChars) {
      units.push(p)
    } else {
      const sentences = p.match(/[^.!?]+[.!?]+["')\]]?\s*|[^.!?]+$/g) ?? [p]
      units.push(...sentences.map((s) => s.trim()).filter(Boolean))
    }
  }
  const chunks: string[] = []
  let current = ''
  for (const unit of units) {
    if (current && current.length + unit.length + 2 > maxChars) {
      chunks.push(current)
      current = unit
    } else {
      current = current ? `${current}\n\n${unit}` : unit
    }
  }
  if (current) chunks.push(current)
  return chunks
}

async function ttsChunk(text: string, voice: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice,
      input: text,
      instructions: TTS_INSTRUCTIONS,
      response_format: 'mp3',
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenAI TTS ${res.status}: ${detail.slice(0, 300)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

// ---------------------------------------------------------------------------
// The full pipeline. Caller is responsible for having set status=generating
// first (the route does it before returning 202) and for catching errors.

export async function generateAudioSummary(
  thread: F2Thread,
  model: string | null | undefined,
  instructions?: string | null,
): Promise<AudioSummary> {
  // 1. Script from the user's active chat model. `instructions` (from the
  //    `summary <…>` chat command) steer this version's length/emphasis.
  const result = await llmComplete({
    model,
    system: buildScriptSystem(thread, model, instructions),
    messages: [{ role: 'user', content: 'Write the audio summary script now.' }],
    maxTokens: 16000,
  })
  if (result.type !== 'text' || !result.text.trim()) {
    throw new Error('script generation returned no text')
  }
  const script = result.text.trim()
  const scale = inferScale(script)
  const durationSecs = estimateDurationSecs(script)

  // 2. TTS, chunked at sentence boundaries; MP3 frames concatenate cleanly.
  const voice = ttsVoice()
  const buffers = await Promise.all(chunkScript(script).map((c) => ttsChunk(c, voice)))
  const mp3 = Buffer.concat(buffers)

  // 3. Upload with a cache-busting name (public bucket + CDN), then drop any
  //    prior recordings for this thread so the bucket doesn't grow.
  const sb = f2Supabase()
  const path = `${thread.user_id}/${thread.id}-${Date.now()}.mp3`
  const { error: upErr } = await sb.storage
    .from('f2-audio')
    .upload(path, mp3, { contentType: 'audio/mpeg', upsert: true })
  if (upErr) throw new Error(`audio upload failed: ${upErr.message}`)

  const { data: existing } = await sb.storage.from('f2-audio').list(thread.user_id)
  const stale = (existing ?? [])
    .map((o) => `${thread.user_id}/${o.name}`)
    .filter((p) => p.includes(`/${thread.id}-`) && p !== path)
  if (stale.length > 0) await sb.storage.from('f2-audio').remove(stale)

  const { data: pub } = sb.storage.from('f2-audio').getPublicUrl(path)

  const now = new Date().toISOString()

  // Seed the existing version history. If a legacy (pre-versioning) summary is
  // present — even one already flipped to `generating` by the summary command —
  // recover its transcript as the base so it's never lost.
  const prior = thread.audio_summary
  let versions: AudioSummaryVersion[] = prior?.versions?.length
    ? [...prior.versions]
    : (prior?.script
        ? [{
            id: 'base',
            script: prior.script,
            scale: prior.scale ?? inferScale(prior.script),
            duration_secs: prior.duration_secs ?? estimateDurationSecs(prior.script),
            instructions: prior.instructions ?? null,
            created_at: prior.updated_at,
          }]
        : [])

  const trimmed = instructions?.trim() || null
  const isBase = trimmed === null
  const version: AudioSummaryVersion = {
    id: isBase ? 'base' : `v${Date.now()}`,
    script,
    scale,
    duration_secs: durationSecs,
    instructions: trimmed,
    created_at: now,
  }

  // A base regeneration (menu "Regenerate", or `summary` with no text) replaces
  // the base entry in place; an augmented `summary <…>` appends a new version.
  if (isBase) {
    const idx = versions.findIndex((v) => v.id === 'base')
    versions = idx >= 0
      ? versions.map((v, i) => (i === idx ? version : v))
      : [version, ...versions]
  } else {
    versions = [...versions, version]
  }

  const summary: AudioSummary = {
    status: 'ready',
    url: pub.publicUrl,
    script,
    scale,
    duration_secs: durationSecs,
    voice,
    instructions: trimmed,
    updated_at: now,
    versions,
    current_id: version.id,
  }
  await setAudioSummary(thread.id, thread.user_id, summary)
  return summary
}
