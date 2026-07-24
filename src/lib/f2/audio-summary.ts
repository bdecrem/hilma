import { f2Supabase } from './supabase'
import { buildFullContent, type F2Thread } from './threads'
import { llmComplete } from './llm'

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
// A 'generating' summary older than this has almost certainly hard-timed-out
// (serverless functions are killed without running their catch). Past it, the
// client is shown the preserved previous recording instead of a vanished Play
// button. Longer than any legitimate generation.
const STALE_GENERATING_MS = 8 * 60 * 1000

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
  const out = {
    ...rest,
    versions: versions?.map(({ script: _s, ...meta }) => meta),
  }
  // Self-heal a hard-timed-out regeneration: if it's been "generating" past the
  // stale window but a previous recording URL is preserved, present it as ready
  // so the Play button reappears (playing the last good audio) instead of
  // vanishing forever. A genuinely in-flight generation (recent) is left alone.
  if (out.status === 'generating' && out.url) {
    const age = Date.now() - Date.parse(out.updated_at ?? '')
    if (!(age >= 0) || age > STALE_GENERATING_MS) out.status = 'ready'
  }
  return out
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
//
// Small sources (articles, videos, short pastes) generate in one pass. Book-
// length sources are read in full via map-reduce: each ~35K-char section is
// digested by a fast model — so every word gets read and no single call has to
// attend to hundreds of thousands of tokens at once — then the user's model
// writes the script from the ordered digests. The user's own notes are pulled
// into a checklist the script must account for, and a coverage pass patches in
// anything missed.

const MAP_REDUCE_CHAR_THRESHOLD = 150_000
const SECTION_CHARS = 35_000
const MAP_CONCURRENCY = 6
// `summary 40 minutes` and up runs the part-wise long-form path: a single
// generation can't produce 6,000+ words (models compress long targets), so the
// script is written in parallel parts of ~PART_TARGET_WORDS each, one per
// equal stretch of the raw source. Below this threshold the normal single-pass
// or map-reduce path handles the request.
const LONG_FORM_MIN_MINUTES = 20
const PART_TARGET_WORDS = 2000
const MAX_PARTS = 8
// All parts run in one parallel round so the whole write fits well inside the
// route's maxDuration.
const PART_CONCURRENCY = MAX_PARTS
// An additional source this small counts as the user's own notes/annotations
// (guaranteed point-by-point coverage) rather than bulk source material.
const NOTES_SOURCE_MAX_CHARS = 30_000
const BOOK_WORD_THRESHOLD = 15_000
// Fast, cheap, 3M-context model for the map digests + coverage checks. The
// final writing (the reduce) stays on the user's chosen model.
const MAP_MODEL = 'sonnet-4-6'

/// The anti-slop spoken voice, shared by the single-pass and map-reduce paths
/// so every summary sounds the same (see feedback: no AI-slop / TED-talk voice).
const VOICE_RULES = `The voice is the whole point. Read this twice:
- Start in the middle of a real idea — say something specific and true about the subject right away. NEVER open by announcing it. Banned first moves: "Let's talk about…", "Today we're looking at…", "Welcome to…", "In this summary…", "Imagine…", "Picture this…", "[Subject] is a book/story/idea that…", and any "genuinely fascinating / a fascinating look at / one of the most important" framing. If your first sentence could be the back cover of a book, delete it and start with an actual fact.
- Sound like a person, not an AI, not a TED talk, not a corporate blog. Say things straight. Trust the listener.
- Never use these words: delve, tapestry, pivotal, seamless, leverage, harness, unlock, unleash, realm, journey, landscape (figurative), testament, dive/deep dive, crucial, vital, foster, underscore, illuminate, resonate, weave, intricate, nuanced, robust, transformative, groundbreaking, ultimately, moreover, furthermore, notably, essentially, indeed, "it's worth noting", "at its core", "when it comes to", "in today's world".
- No "not just X, but Y" and no "it isn't X, it's Y". No rhetorical questions to open a section. No one-word sentences for drama. No rule-of-three lists where two would do.
- Vary the rhythm. Mix short blunt sentences with longer ones. Contractions throughout. Don't editorialize about how important or amazing the subject is — show it by the specifics you pick.
- End on a real thought that lands. Don't recap what you just said and don't say "thanks for listening."
- Spoken words only: no markdown, no headings, no bullets, no stage directions, no "[pause]".`

function lengthTarget(isBook: boolean): string {
  return isBook
    ? 'Aim for 2,400–2,900 words (about 15–18 minutes spoken) — enough to walk through the whole thing properly, not a teaser.'
    : 'Aim for 450–650 words (about 3–4 minutes spoken).'
}

function instructionsBlock(instructions?: string | null): string {
  if (!instructions?.trim()) return ''
  return `
The user asked you to adjust THIS version specifically: "${instructions.trim()}"
Do what they asked. If it conflicts with the length target above (e.g. "make it longer", "go deeper on X", "more dates"), their instruction wins.
`
}

/// The user's own notes/emphasis, which the script must cover point by point.
function notesCoverageBlock(notesChecklist: string[]): string {
  if (notesChecklist.length === 0) return ''
  const list = notesChecklist.map((n, i) => `${i + 1}. ${n}`).join('\n')
  return `
The user took these notes while reading — their own emphasis, questions, and reactions. Your script MUST account for every one: work each into the narration where it naturally fits. Answer their questions. If a note gets a fact wrong, give the correct version plainly (don't repeat the mistake). Skip a note ONLY if it is genuinely unintelligible or clearly off-topic — cover all the rest.
The user's notes:
${list}
`
}

function contentGuidance(whole: boolean): string {
  return `What to cover:
- ${whole ? 'The whole arc, beginning to end, using every section digest below in order — weight it naturally, don\'t front-load and rush the ending.' : 'The big ideas and how they connect — enough that the listener actually understands the subject, not just its vibe.'}
- Anchor with real dates, names, and terms, at the level of "the Odyssey is set around 1200 BC but was written down centuries later." Rough eras and round numbers are right. Don't pile up statistics or trivia — nobody's cramming for a quiz.`
}

function buildSinglePassSystem(
  subject: string,
  source: string,
  history: string,
  isBook: boolean,
  instructions: string | null | undefined,
  notesChecklist: string[],
): string {
  return `You're writing a script about ${subject} for someone to listen to. Picture a smart friend who actually knows this material telling you about it on a walk — not a lecture, not a podcast intro, not a book report. Someone talking. A text-to-speech voice reads it aloud.

${lengthTarget(isBook)}

${VOICE_RULES}

${contentGuidance(false)}
- The user's own chat on this topic is below. Let it steer what you dwell on — the questions they asked, the parts they cared about.
${notesCoverageBlock(notesChecklist)}${instructionsBlock(instructions)}
Output ONLY the spoken words — nothing else.

${source ? `Source material:\n${source}\n\n` : ''}${history ? `Chat history on this topic:\n${history}` : '(No chat history yet.)'}`
}

function buildReduceSystem(
  subject: string,
  digests: string[],
  isBook: boolean,
  instructions: string | null | undefined,
  notesChecklist: string[],
): string {
  const digestBlock = digests
    .map((d, i) => `--- Section ${i + 1} of ${digests.length} ---\n${d}`)
    .join('\n\n')
  return `You're writing a script about ${subject} for someone to listen to — a smart friend who knows this material telling you about it on a walk. A text-to-speech voice reads it aloud.

Below are section-by-section digests of the ENTIRE source, read start to finish and given to you in order. Write one flowing script that covers its whole arc from these digests. Don't skip or skim the later sections.

${lengthTarget(isBook)}

${VOICE_RULES}

${contentGuidance(true)}
${notesCoverageBlock(notesChecklist)}${instructionsBlock(instructions)}
Output ONLY the spoken words — nothing else.

Section digests (the full source, in order):
${digestBlock}`
}

// ---------------------------------------------------------------------------
// Long-form (part-wise) helpers

/// Requested spoken duration in minutes, parsed from the user's `summary <…>`
/// instructions ("40 minutes", "a 45-min version", "an hour", "1.5 hours").
/// Returns null when no duration is asked for.
export function parseRequestedMinutes(instructions: string | null | undefined): number | null {
  const s = instructions?.toLowerCase()
  if (!s) return null
  const hours = s.match(/(\d+(?:\.\d+)?)\s*-?\s*h(?:ou)?rs?\b/)
  if (hours) return Math.round(parseFloat(hours[1]) * 60)
  if (/\b(?:an?|one)\s+hour\b/.test(s)) return 60
  if (/\bhalf\s+(?:an\s+)?hour\b/.test(s)) return 30
  const mins = s.match(/(\d+)\s*-?\s*min(?:ute)?s?\b/)
  if (mins) return parseInt(mins[1], 10)
  return null
}

/// Split text into `n` roughly equal spans on paragraph boundaries.
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

/// Write one long script as parallel parts, each covering its own stretch of
/// the raw source in order. Ported from scripts/f2-origin-long.ts — that
/// offline generator is the proven shape for 40–60 min summaries.
async function generateLongScript(
  subject: string,
  corpus: string,
  model: string | null | undefined,
  minutes: number,
  instructions: string | null | undefined,
  notesChecklist: string[],
): Promise<string> {
  const targetWords = minutes * WORDS_PER_MINUTE
  const partCount = Math.min(MAX_PARTS, Math.max(2, Math.ceil(targetWords / PART_TARGET_WORDS)))
  const partWords = Math.round(targetWords / partCount)
  const spans = splitEqualSpans(corpus, partCount)

  const notesBlock = notesChecklist.length
    ? `
The user took these notes while reading — their own emphasis, questions, and reactions. Wherever a note belongs to THIS stretch of the source, cover it: answer their questions; if a note gets a fact wrong, give the correct version plainly. Notes for other stretches are handled by the other parts.
The user's notes:
${notesChecklist.map((n, i) => `${i + 1}. ${n}`).join('\n')}
`
    : ''
  const extraBlock = instructions?.trim()
    ? `
The user also asked: "${instructions.trim()}". Apply it to how you write this part — but the overall length is already handled by the part structure, so keep this part's word target.
`
    : ''

  const parts = await mapWithConcurrency(spans, PART_CONCURRENCY, async (span, i) => {
    const posRule = i === 0
      ? 'This is the very start of the whole summary. Open in the middle of a real, specific idea — do NOT announce the subject, no "let\'s talk about", no back-cover framing. Just start with an actual fact.'
      : `Parts 1–${i} already covered the earlier stretch. Continue straight on. Do NOT reintroduce the subject, do NOT recap earlier parts, do NOT say "in this part" or "picking up where we left off". Just keep going from here.`
    const endRule = i === spans.length - 1
      ? 'This is the final part. End on one real closing thought about the whole thing.'
      : 'Do not conclude or wrap up — more parts follow after this one.'
    const r = await llmComplete({
      model,
      system: `You're writing part ${i + 1} of ${spans.length} of one long, in-depth spoken summary of ${subject} — a smart friend walking you through the whole thing. A text-to-speech voice reads it aloud.

${posRule}
Cover the stretch of the source below, in real depth and in order — the ideas, how they develop, and the concrete dates, names, and mechanisms. Aim for about ${partWords - 100}–${partWords + 100} words for this part. ${endRule}

${VOICE_RULES}
${notesBlock}${extraBlock}
Output ONLY the spoken words for this part.

Source (this part's stretch, in order):
${span}`,
      messages: [{ role: 'user', content: `Write part ${i + 1} now.` }],
      maxTokens: 8000,
    })
    return r.type === 'text' ? r.text.trim() : ''
  })

  const script = parts.filter(Boolean).join('\n\n')
  if (!script) throw new Error('long-form generation produced no parts')
  return script
}

// ---------------------------------------------------------------------------
// Map-reduce helpers

/// Split source text into sections of at most `maxChars`, on paragraph
/// boundaries; a single oversized paragraph is hard-split.
function splitIntoSections(text: string, maxChars = SECTION_CHARS): string[] {
  const sections: string[] = []
  let cur = ''
  for (const para of text.split(/\n\n+/)) {
    if (para.length > maxChars) {
      if (cur) { sections.push(cur); cur = '' }
      for (let i = 0; i < para.length; i += maxChars) sections.push(para.slice(i, i + maxChars))
      continue
    }
    if (cur && cur.length + para.length + 2 > maxChars) { sections.push(cur); cur = para }
    else cur = cur ? `${cur}\n\n${para}` : para
  }
  if (cur) sections.push(cur)
  return sections
}

/// Run `fn` over `items` with bounded concurrency, preserving order.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/// Extract a dense, faithful digest of one section (fast model).
async function mapDigest(section: string, subject: string, i: number, total: number): Promise<string> {
  const r = await llmComplete({
    model: MAP_MODEL,
    system: `You are digesting one section of a longer work about ${subject}, for a writer who will later narrate a spoken summary of the whole thing. This is section ${i + 1} of ${total}. Capture, in order, every important point in THIS section: the ideas and how they develop, and the concrete facts that matter (dates, names, places, terms, key numbers). Be compact but complete — don't invent anything, don't skip anything important. No preamble, no "this section covers". Just the substance, about 400–600 words.`,
    messages: [{ role: 'user', content: section }],
    maxTokens: 2000,
  })
  return r.type === 'text' ? r.text : ''
}

/// Turn the user's raw notes into a clean numbered list of distinct points.
async function extractNotesChecklist(notesText: string, subject: string): Promise<string[]> {
  if (!notesText.trim()) return []
  const r = await llmComplete({
    model: MAP_MODEL,
    system: `The user jotted these raw reading notes about ${subject} — scribbles, shorthand, typos, half-thoughts. Break them into a clean numbered list of every DISTINCT point, claim, question, or thing they cared about. One point per line, rewritten just enough to be intelligible while keeping their meaning and emphasis. Include everything you can make sense of. Drop ONLY fragments that are genuinely unintelligible or clearly unrelated to ${subject}. Output ONLY the numbered list, nothing else.`,
    messages: [{ role: 'user', content: notesText }],
    maxTokens: 3000,
  })
  if (r.type !== 'text') return []
  return r.text
    .split('\n')
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
}

/// Which checklist points (by index) the script fails to reflect.
async function verifyMissingNotes(script: string, notesChecklist: string[]): Promise<number[]> {
  if (notesChecklist.length === 0) return []
  const list = notesChecklist.map((n, i) => `${i + 1}. ${n}`).join('\n')
  const r = await llmComplete({
    model: MAP_MODEL,
    system: `Below is a spoken-summary script, then a numbered list of points the user wanted covered. A point counts as covered if its substance appears in the script, even in different words. Return ONLY the numbers of the points NOT meaningfully covered, comma-separated. If every point is covered, return exactly "NONE".`,
    messages: [{ role: 'user', content: `SCRIPT:\n${script}\n\nPOINTS:\n${list}` }],
    maxTokens: 500,
  })
  if (r.type !== 'text' || /^\s*none/i.test(r.text)) return []
  return [...r.text.matchAll(/\d+/g)]
    .map((m) => parseInt(m[0], 10) - 1)
    .filter((i) => i >= 0 && i < notesChecklist.length)
}

/// The user's own annotations — quotes plus short additional sources — which
/// get guaranteed point-by-point coverage. Bulk material (long transcripts) is
/// read via the map-reduce corpus instead, not here.
function gatherNotesText(thread: F2Thread): string {
  const parts: string[] = []
  for (const q of thread.quotes ?? []) {
    if (q.text?.trim()) parts.push(q.author ? `"${q.text}" — ${q.author}` : `"${q.text}"`)
  }
  for (const s of thread.additional_sources ?? []) {
    if (s.content && s.content.trim() && s.content.length <= NOTES_SOURCE_MAX_CHARS) {
      parts.push(s.title ? `${s.title}:\n${s.content}` : s.content)
    }
  }
  return parts.join('\n\n')
}

/// Produce the spoken script: single pass for small sources, map-reduce for
/// book-length ones, then a coverage pass that patches in any missed notes.
async function generateScript(
  thread: F2Thread,
  model: string | null | undefined,
  instructions: string | null | undefined,
): Promise<string> {
  const subject = thread.topic ?? thread.url ?? '(untitled topic)'
  const corpus = buildFullContent(thread)
  const isBook = corpus.split(/\s+/).length > BOOK_WORD_THRESHOLD
  const history = thread.messages.map((m) => `${m.role}: ${m.text}`).join('\n').slice(-MAX_HISTORY_CHARS)

  const notesChecklist = await extractNotesChecklist(gatherNotesText(thread), subject)

  // A requested duration of LONG_FORM_MIN_MINUTES+ takes the part-wise path —
  // no single generation reliably produces that many words. Notes coverage is
  // built into each part, so the trailing coverage pass is skipped (a one-call
  // revision of a 6,000-word script would compress it right back down).
  const requestedMinutes = parseRequestedMinutes(instructions)
  if (requestedMinutes !== null && requestedMinutes >= LONG_FORM_MIN_MINUTES) {
    return generateLongScript(subject, corpus, model, requestedMinutes, instructions, notesChecklist)
  }

  let script: string
  if (corpus.length <= MAP_REDUCE_CHAR_THRESHOLD) {
    const r = await llmComplete({
      model,
      system: buildSinglePassSystem(subject, corpus, history, isBook, instructions, notesChecklist),
      messages: [{ role: 'user', content: 'Write the audio summary script now.' }],
      maxTokens: 16000,
    })
    script = r.type === 'text' ? r.text.trim() : ''
  } else {
    const sections = splitIntoSections(corpus)
    const digests = (await mapWithConcurrency(sections, MAP_CONCURRENCY, (s, i) =>
      mapDigest(s, subject, i, sections.length),
    )).filter(Boolean)
    if (digests.length === 0) throw new Error('map phase produced no digests')
    const r = await llmComplete({
      model,
      system: buildReduceSystem(subject, digests, isBook, instructions, notesChecklist),
      messages: [{ role: 'user', content: 'Write the audio summary script now, covering the whole work start to finish.' }],
      maxTokens: 16000,
    })
    script = r.type === 'text' ? r.text.trim() : ''
  }

  if (!script) throw new Error('script generation returned no text')

  // Coverage pass — patch in any notes the script missed (one attempt).
  if (notesChecklist.length > 0) {
    const missing = await verifyMissingNotes(script, notesChecklist)
    if (missing.length > 0) {
      const missingList = missing.map((i, n) => `${n + 1}. ${notesChecklist[i]}`).join('\n')
      const r = await llmComplete({
        model,
        system: `Revise this spoken-summary script so it also covers the points below, which it currently misses. Weave them in naturally where they belong — don't tack them onto the end, don't announce them, keep the exact same voice and the same rules (no "let's talk about", no jargon, plain spoken prose, no markdown). Keep everything that's already there. Output ONLY the full revised script.

Points to add:
${missingList}`,
        messages: [{ role: 'user', content: script }],
        maxTokens: 16000,
      })
      if (r.type === 'text' && r.text.trim()) script = r.text.trim()
    }
  }

  return script
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
  // 1. Script from the user's active model. Small sources generate in one pass;
  //    book-length sources are read in full via map-reduce. `instructions`
  //    (from the `summary <…>` command) steer this version's length/emphasis.
  const script = await generateScript(thread, model, instructions)
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
