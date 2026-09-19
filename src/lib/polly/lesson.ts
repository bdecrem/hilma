// The lesson plan of a guest lesson.
//
// A guest_lesson topic is a lesson someone else made — a slow-Italian
// podcast episode, a lesson video — that Polly hosts. It already has a
// teacher's structure: a host, key words taught up front, a story as the
// hook, a question at the end. Rather than inventing fact cards about the
// story's subject (when was Casanova born), Polly pulls that structure out
// of the transcript once, stores it on the thread (polly_threads.lesson,
// schema 004), and every practice surface reads it: cards are the host's
// words in their story sentences, chat and quizzes stay inside the plan,
// voice has the learner retell the story and answers the host's question.

import { llmComplete } from './llm'
import { activeLanguage, LANGUAGES } from './language'
import { pollySupabase } from './supabase'
import { buildFullContent, type PollyThread } from './threads'

export type LessonTerm = {
  /** The word or phrase in the target language, as the host said it. */
  term: string
  /** Its meaning in the learner's language (English). */
  meaning: string
  /** A sentence from the episode that uses it — the host's example or a
   *  line from the story. Verbatim or lightly trimmed. */
  sentence: string
}

export type LessonPlan = {
  /** The host as they introduce themselves ("Silvia"), or null. */
  host: string | null
  /** The podcast / series / channel name, or null. */
  series: string | null
  /** Target language name in English ("Italian"). */
  language: string
  /** "the lesson's key words" — what the host explicitly teaches before
   *  the story. Usually 3–6. Empty when the host teaches none. */
  key_words: LessonTerm[]
  /** A handful of further expressions from the story worth keeping —
   *  idioms, set phrases, useful verbs. 4–8. */
  phrases: LessonTerm[]
  /** The story in brief, IN THE TARGET LANGUAGE, simple register, 4–8
   *  sentences — the retelling target for voice practice. */
  story_summary: string
  /** The same summary in English, for the learner who is lost. */
  story_summary_english: string
  /** A grammar or usage point the host calls out (formal register, a
   *  tense…), one line, or null. */
  grammar_point: string | null
  /** The host's own question to the listener at the end, verbatim in the
   *  target language, or null when there is none. */
  closing_question: string | null
  extracted_at: string
  model: string
  // Polly's own lessons (kind 'lesson', written by src/lib/polly/path.ts)
  // use the same plan; there host is "Polly", the "story" is the model
  // conversation of the scene, and these are set too.
  /** The situation in one English line ("Ordering at a café"). */
  scene?: string
  /** The model conversation, line by line. */
  dialogue?: { speaker: string; line: string; english: string }[]
  /** The grammar point explained in plain English, with examples. */
  grammar_explained?: string
  /** CEFR-style level the lesson was written for ("A1"). */
  level?: string
}

export function isGuestLesson(thread: Pick<PollyThread, 'kind'>): boolean {
  return thread.kind === 'guest_lesson'
}

/// A lesson Polly wrote for the learner's path (see path.ts).
export function isPollyLesson(thread: Pick<PollyThread, 'kind'>): boolean {
  return thread.kind === 'lesson'
}

const LESSON_MODEL = process.env.POLLY_LESSON_MODEL || 'sonnet-5'

/// Pull the lesson plan out of the transcript. Pure LLM call; nothing saved.
export async function extractLesson(
  thread: PollyThread,
  languageHint: string | null,
): Promise<LessonPlan> {
  const material = buildFullContent(thread)
  if (!material.trim()) throw new Error('No material to extract a lesson from')

  const system = `You read the transcript of a language-learning lesson — a podcast episode or video made by a teacher for learners — and write down the teacher's own plan so a tutoring app can run practice on it.

The learner's own language is English.${languageHint ? ` They are studying ${languageHint}.` : ''}

Extract, faithfully and only from the transcript:
- host: the teacher's name as they give it, else null. series: the show or channel name, else null.
- language: the language being taught, in English ("Italian").
- key_words: the words or expressions the teacher EXPLICITLY teaches before or during the story ("la prima parola è…", "parole chiave"). Keep the teacher's order. For each: the term exactly as said; a short English meaning that matches how the teacher explains it (including a colloquial sense they mention); one sentence from the episode that uses it — prefer a line from the story, else the teacher's example. If the teacher teaches no words, return an empty list.
- phrases: 4–8 further expressions from the STORY worth learning at this level — idioms, set phrases, useful verbs in context, a fixed formula that recurs. Never repeat a key word. Same three fields.
- story_summary: the story retold in the target language, simple register, 4–8 short sentences, present tense where natural. This is what the learner will retell aloud.
- story_summary_english: the same in English.
- grammar_point: one usage or grammar point the teacher calls out (formal vs informal address, a tense, a construction), one line, else null.
- closing_question: the question the teacher asks the listener at the end, verbatim in the target language, else null. Not calls to subscribe or rate.

Rules: quote the transcript, don't invent; transcripts have no punctuation in places and mis-hear words — fix obvious transcription errors in a term, nothing else. Plain text in every field, no markdown.`

  const result = await llmComplete({
    model: LESSON_MODEL,
    system,
    messages: [{ role: 'user', content: `Topic title: ${thread.topic ?? '(untitled)'}\nURL: ${thread.url ?? 'none'}\n\nTranscript:\n${material.slice(0, 400_000)}` }],
    maxTokens: 6_000,
    forceTool: true,
    tools: [
      {
        name: 'record_lesson_plan',
        description: "Record the teacher's lesson plan.",
        input_schema: {
          type: 'object',
          properties: {
            host: { type: ['string', 'null'] },
            series: { type: ['string', 'null'] },
            language: { type: 'string' },
            key_words: { type: 'array', items: termSchema() },
            phrases: { type: 'array', items: termSchema() },
            story_summary: { type: 'string' },
            story_summary_english: { type: 'string' },
            grammar_point: { type: ['string', 'null'] },
            closing_question: { type: ['string', 'null'] },
          },
          required: ['language', 'key_words', 'phrases', 'story_summary', 'story_summary_english'],
        },
      },
    ],
  })
  if (result.type !== 'tool_call') throw new Error('Lesson extraction returned no plan')
  const r = result.input as Partial<LessonPlan>
  const terms = (list: unknown): LessonTerm[] =>
    (Array.isArray(list) ? list : [])
      .map((t) => ({
        term: String((t as LessonTerm).term ?? '').trim(),
        meaning: String((t as LessonTerm).meaning ?? '').trim(),
        sentence: String((t as LessonTerm).sentence ?? '').trim(),
      }))
      .filter((t) => t.term && t.meaning)
  const plan: LessonPlan = {
    host: r.host?.toString().trim() || null,
    series: r.series?.toString().trim() || null,
    language: String(r.language ?? languageHint ?? '').trim() || 'the target language',
    key_words: terms(r.key_words),
    phrases: terms(r.phrases),
    story_summary: String(r.story_summary ?? '').trim(),
    story_summary_english: String(r.story_summary_english ?? '').trim(),
    grammar_point: r.grammar_point?.toString().trim() || null,
    closing_question: r.closing_question?.toString().trim() || null,
    extracted_at: new Date().toISOString(),
    model: LESSON_MODEL,
  }
  if (plan.key_words.length + plan.phrases.length === 0 || !plan.story_summary) {
    throw new Error('Lesson extraction came back empty')
  }
  return plan
}

function termSchema() {
  return {
    type: 'object',
    properties: {
      term: { type: 'string' },
      meaning: { type: 'string' },
      sentence: { type: 'string' },
    },
    required: ['term', 'meaning', 'sentence'],
  }
}

/// The thread with its lesson plan present: extracts and saves it the first
/// time a guest lesson is used for anything. Every other kind, and a guest
/// lesson that already has its plan, comes straight back. Extraction
/// failures are logged and the thread returned as is — practice then runs
/// on the raw transcript, which is what it did before there were kinds.
export async function ensureLesson(thread: PollyThread): Promise<PollyThread> {
  if (!isGuestLesson(thread) || thread.lesson) return thread
  try {
    const hint = await activeLanguage(thread.user_id)
    const plan = await extractLesson(thread, hint ? LANGUAGES[hint].name : null)
    const { error } = await pollySupabase()
      .from('polly_threads')
      .update({ lesson: plan, updated_at: new Date().toISOString() })
      .eq('id', thread.id)
      .eq('user_id', thread.user_id)
    if (error) {
      console.error('[polly/lesson] save failed:', error)
      return thread
    }
    console.log(`[polly/lesson] extracted plan for ${thread.id}: ${plan.key_words.length} key words, ${plan.phrases.length} phrases`)
    return { ...thread, lesson: plan }
  } catch (err) {
    console.error(`[polly/lesson] extraction failed for ${thread.id}:`, err)
    return thread
  }
}

/// Drop the plan so the next use re-extracts (after the transcript changed).
export async function clearLesson(threadId: string, userId: string): Promise<void> {
  await pollySupabase()
    .from('polly_threads')
    .update({ lesson: null, updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', userId)
}

function termLines(list: LessonTerm[]): string {
  return list.map((t) => `- ${t.term} — ${t.meaning}${t.sentence ? ` — "${t.sentence}"` : ''}`).join('\n')
}

/// The plan as prompt text. Shared by cards, chat, quizzes and voice so
/// every surface sees the same lesson; each adds its own instructions.
export function lessonBlock(thread: PollyThread): string {
  const l = thread.lesson
  if (l && isPollyLesson(thread)) return pollyLessonBlock(thread, l)
  if (!isGuestLesson(thread) || !l) return ''
  const who = l.host ? `${l.host}${l.series ? ` (${l.series})` : ''}` : l.series ?? 'the host'
  return `

GUEST LESSON — this topic is a ${l.language} lesson made by ${who}, which the learner has already listened to or watched. The learner's own language is English; they are practising ${l.language}. What matters here is the LANGUAGE in the lesson, not facts about its subject: never quiz on dates, names or plot trivia for their own sake. The lesson's own plan is the authority on what to practise:

Key words the host teaches:
${termLines(l.key_words) || '(none taught explicitly)'}

Further expressions from the story:
${termLines(l.phrases) || '(none)'}

The story in brief (${l.language}):
${l.story_summary}

The story in brief (English):
${l.story_summary_english}${l.grammar_point ? `

Usage point the host makes: ${l.grammar_point}` : ''}${l.closing_question ? `

The host's closing question to the listener: "${l.closing_question}"` : ''}`
}

/// The same, for a lesson Polly wrote: a scene, its model conversation, the
/// words and the one grammar point.
function pollyLessonBlock(thread: PollyThread, l: LessonPlan): string {
  const dialogue = (l.dialogue ?? []).map((d) => `${d.speaker}: ${d.line}  (${d.english})`).join('\n')
  return `

POLLY LESSON — this topic is lesson ${thread.path_position ?? '?'} on the learner's ${l.language} path, written by Polly for their level (${l.level ?? 'beginner'}). The learner's own language is English. What matters is that they can USE this language in the scene; stay inside the lesson unless they ask for more:

The scene: ${l.scene ?? thread.topic ?? ''}

The lesson's words:
${termLines(l.key_words) || '(none)'}

Expressions from the conversation:
${termLines(l.phrases) || '(none)'}

The model conversation (${l.language}, English in parentheses):
${dialogue || l.story_summary}${l.grammar_point ? `

The grammar point: ${l.grammar_point}${l.grammar_explained ? `\n${l.grammar_explained}` : ''}` : ''}${l.closing_question ? `

A question to carry the conversation further: "${l.closing_question}"` : ''}`
}
