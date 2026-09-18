// Agentic Learning Mode: the level check, the path, Polly's own lessons.
//
// 1. A short voice conversation (voice mode 'placement', prompt in live.ts):
//    Polly says "Ciao!", waits, nudges in English if nothing comes back,
//    then chats, making each question a little harder until the learner
//    stumbles.
// 2. `placeLearner` reads that transcript once: level, what they can do,
//    what is shaky, what they like talking about — and plans a path of
//    PATH_LENGTH lessons. Only lesson 1 is written in full.
// 3. A lesson is a topic of kind 'lesson' whose plan is a LessonPlan (the
//    shape guest lessons use), so cards, chat and voice work on it as is:
//    a scene with a model conversation, about eight words, one grammar
//    point. It has three steps — Talk (a voice session on it), Words and
//    Grammar (a card set each, cards tagged by lesson_step).
// 4. When all three are done the lesson is finished and the NEXT one is
//    written, from the path's outline and from how this one went (card
//    results, the voice transcript). Lessons after that stay titles.
//
// Storage: schema 005 (polly_courses.level/placement/path, the lesson
// columns on polly_threads, polly_flash_cards.lesson_step).
import { llmComplete } from './llm'
import { LANGUAGES, type LanguageCode } from './language'
import { pollySupabase } from './supabase'
import { createThread, getThreadById, type PollyThread } from './threads'
import { ensureLessonDeck } from './flash'
import type { LessonPlan, LessonTerm } from './lesson'

export const PATH_LENGTH = 5
export type LessonStep = 'talk' | 'words' | 'grammar'
export const LESSON_STEPS: LessonStep[] = ['talk', 'words', 'grammar']
/// A Talk step counts once the learner actually said something, this often.
const TALK_MIN_USER_TURNS = 3

const PATH_MODEL = process.env.POLLY_PATH_MODEL || 'opus-5'
const WRITING_CLAIM_MS = 4 * 60 * 1000

export type PathEntry = {
  position: number
  title: string
  /** The situation, one English line. */
  scene: string
  /** The grammar point, a few words. */
  grammar: string
  /** Null until the lesson is written. */
  thread_id: string | null
  /** Set while the lesson is being written, so two triggers (the finished
   *  lesson, an opened path) don't both pay for it. Stale after a few
   *  minutes: a failed write is retried. */
  writing_since?: string | null
}

export type Placement = {
  /** CEFR-style: A0 (nothing yet), A1, A2, B1, B2, C1. */
  level: string
  /** One plain sentence each, in English, addressed to the learner. */
  can_do: string
  shaky: string
  interests: string[]
  voice_session_id: string | null
  placed_at: string
  model: string
}

export type CourseRow = {
  id: string
  user_id: string
  language: LanguageCode
  level: string | null
  placement: Placement | null
  path: PathEntry[]
  path_card_dismissed_at: string | null
}

type TranscriptRow = { role: string; text: string }

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

export async function activeCourse(userId: string): Promise<CourseRow | null> {
  const sb = pollySupabase()
  const { data: user } = await sb
    .from('polly_users')
    .select('active_course_id')
    .eq('id', userId)
    .maybeSingle()
  if (!user?.active_course_id) return null
  const { data, error } = await sb
    .from('polly_courses')
    .select('id, user_id, language, level, placement, path, path_card_dismissed_at')
    .eq('id', user.active_course_id)
    .maybeSingle()
  if (error) console.error('[polly/path] activeCourse failed:', error)
  if (!data) return null
  return { ...(data as CourseRow), path: Array.isArray(data.path) ? (data.path as PathEntry[]) : [] }
}

export async function setPathCardDismissed(userId: string, dismissed: boolean): Promise<boolean> {
  const course = await activeCourse(userId)
  if (!course) return false
  const { error } = await pollySupabase()
    .from('polly_courses')
    .update({ path_card_dismissed_at: dismissed ? new Date().toISOString() : null })
    .eq('id', course.id)
  if (error) console.error('[polly/path] dismiss failed:', error)
  return !error
}

/// What the app draws: the level check's verdict and the lessons in order,
/// each with its state. `locked` lessons have no topic yet.
export type PathView = {
  language: LanguageCode
  language_name: string
  level: string | null
  placement: Pick<Placement, 'level' | 'can_do' | 'shaky' | 'interests'> | null
  card_dismissed: boolean
  lessons: {
    position: number
    title: string
    scene: string
    grammar: string
    thread_id: string | null
    state: 'done' | 'current' | 'writing' | 'locked'
    steps: Record<LessonStep, boolean>
  }[]
}

export async function pathView(userId: string): Promise<PathView | null> {
  const course = await activeCourse(userId)
  if (!course) return null
  const ids = course.path.map((e) => e.thread_id).filter((id): id is string => !!id)
  const threads = new Map<string, Pick<PollyThread, 'id' | 'lesson_steps' | 'lesson_done_at'>>()
  if (ids.length > 0) {
    const { data } = await pollySupabase()
      .from('polly_threads')
      .select('id, lesson_steps, lesson_done_at')
      .eq('user_id', userId)
      .in('id', ids)
    for (const t of data ?? []) threads.set(t.id as string, t as PollyThread)
  }
  let previousDone = true
  const lessons = course.path.map((e) => {
    const t = e.thread_id ? threads.get(e.thread_id) : undefined
    const steps = {
      talk: !!t?.lesson_steps?.talk,
      words: !!t?.lesson_steps?.words,
      grammar: !!t?.lesson_steps?.grammar,
    }
    const done = !!t?.lesson_done_at
    // A lesson whose predecessor is done but which has no topic yet is
    // being written right now (or its writing failed; opening the path
    // retries it — see ensureCurrentLesson).
    const state = done ? 'done' : t ? 'current' : previousDone ? 'writing' : 'locked'
    previousDone = done
    return { position: e.position, title: e.title, scene: e.scene, grammar: e.grammar,
             thread_id: t ? e.thread_id : null, state: state as PathView['lessons'][number]['state'], steps }
  })
  return {
    language: course.language,
    language_name: LANGUAGES[course.language].name,
    level: course.level,
    placement: course.placement
      ? { level: course.placement.level, can_do: course.placement.can_do,
          shaky: course.placement.shaky, interests: course.placement.interests }
      : null,
    card_dismissed: !!course.path_card_dismissed_at,
    lessons,
  }
}

// ---------------------------------------------------------------------------
// The level check → placement + path + lesson 1
// ---------------------------------------------------------------------------

function transcriptText(rows: TranscriptRow[]): string {
  return rows.map((r) => `${r.role === 'assistant' ? 'Polly' : 'Learner'}: ${r.text}`).join('\n')
}

function termSchema() {
  return {
    type: 'object',
    properties: {
      term: { type: 'string' },
      meaning: { type: 'string' },
      sentence: { type: 'string', description: 'A line from the conversation that uses it, else a short example.' },
    },
    required: ['term', 'meaning', 'sentence'],
  }
}

function lessonSchema() {
  return {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Short, in English, names the scene: "Ordering at a café".' },
      scene: { type: 'string', description: 'The situation in one English sentence, addressed to the learner.' },
      dialogue: {
        type: 'array',
        description: 'The model conversation, 8–12 short lines, two speakers, one of them the learner\'s role ("You").',
        items: {
          type: 'object',
          properties: {
            speaker: { type: 'string' },
            line: { type: 'string' },
            english: { type: 'string' },
          },
          required: ['speaker', 'line', 'english'],
        },
      },
      key_words: { type: 'array', description: 'About 8 words the scene needs.', items: termSchema() },
      phrases: { type: 'array', description: '4–6 whole expressions from the conversation worth keeping.', items: termSchema() },
      grammar_point: { type: 'string', description: 'The one grammar point, one line.' },
      grammar_explained: { type: 'string', description: '3–5 plain English sentences with two or three examples from the conversation. No tables, no jargon beyond the name of the thing.' },
      closing_question: { type: 'string', description: 'One question in the target language that carries the scene into the learner\'s own life.' },
    },
    required: ['title', 'scene', 'dialogue', 'key_words', 'phrases', 'grammar_point', 'grammar_explained', 'closing_question'],
  }
}

const LESSON_RULES = (lang: string) => `How to write a lesson:
- One scene the learner could really be in, picked for what they like talking about. A model conversation of 8–12 short lines between "You" and one other person, at the learner's level: a beginner gets three-to-six-word lines in the present tense.
- About 8 key words the scene needs, each with a short English meaning and the line from the conversation that contains it — the spoken words only, never the speaker's name, and never a line the word is not in (a word that only names a speaker gets a short example sentence instead). 4–6 whole expressions from the conversation (greetings, set formulas, a useful question).
- ONE grammar point, the one the conversation leans on most and the learner is ready for. Explain it like a friend would: what it does, how it is built, two or three examples from the conversation. No tables.
- Every ${lang} word in the lesson must appear in the conversation, the word list or the expressions — never assume vocabulary the learner wasn't given.
- Natural, current ${lang}, as spoken. Plain text, no markdown.`

type RawLesson = {
  title?: string
  scene?: string
  dialogue?: { speaker?: string; line?: string; english?: string }[]
  key_words?: Partial<LessonTerm>[]
  phrases?: Partial<LessonTerm>[]
  grammar_point?: string
  grammar_explained?: string
  closing_question?: string
}

function planFromRaw(raw: RawLesson, languageName: string, level: string): { title: string; plan: LessonPlan } {
  const terms = (list: unknown): LessonTerm[] =>
    (Array.isArray(list) ? list : [])
      .map((t) => ({
        term: String((t as LessonTerm).term ?? '').trim(),
        meaning: String((t as LessonTerm).meaning ?? '').trim(),
        sentence: String((t as LessonTerm).sentence ?? '').trim(),
      }))
      .filter((t) => t.term && t.meaning)
  const dialogue = (raw.dialogue ?? [])
    .map((d) => ({
      speaker: String(d.speaker ?? '').trim() || 'You',
      line: String(d.line ?? '').trim(),
      english: String(d.english ?? '').trim(),
    }))
    .filter((d) => d.line)
  const plan: LessonPlan = {
    host: 'Polly',
    series: null,
    language: languageName,
    key_words: terms(raw.key_words),
    phrases: terms(raw.phrases),
    story_summary: dialogue.map((d) => `${d.speaker}: ${d.line}`).join('\n'),
    story_summary_english: dialogue.map((d) => `${d.speaker}: ${d.english}`).join('\n'),
    grammar_point: raw.grammar_point?.trim() || null,
    closing_question: raw.closing_question?.trim() || null,
    extracted_at: new Date().toISOString(),
    model: PATH_MODEL,
    scene: raw.scene?.trim() || '',
    dialogue,
    grammar_explained: raw.grammar_explained?.trim() || '',
    level,
  }
  if (plan.key_words.length < 3 || dialogue.length < 4) throw new Error('The lesson came back too thin')
  return { title: (raw.title ?? '').trim() || plan.scene || 'Lesson', plan }
}

/// Read the level-check transcript: verdict, path outline, lesson 1 in full.
/// One call so the three agree with each other. Pure; nothing saved.
export async function planFromPlacement(input: {
  languageName: string
  learnerName: string
  transcript: TranscriptRow[]
}): Promise<{ placement: Omit<Placement, 'voice_session_id' | 'placed_at' | 'model'>; outline: Omit<PathEntry, 'thread_id'>[]; lesson: { title: string; plan: LessonPlan } }> {
  const lang = input.languageName
  const system = `You are Polly, a ${lang} tutor. You just had a short spoken conversation with a new learner, ${input.learnerName}, whose own language is English. It opened with a greeting in ${lang}; if they did not answer, they were nudged in English. The conversation got a little harder each turn until they stumbled. The transcript is speech-to-text: expect mis-heard words and missing punctuation, and judge what they evidently meant and could do.

From the transcript, decide three things.

1. Their level, CEFR-style: A0 (answered only in English, or said they know nothing), A1, A2, B1, B2, C1. Be conservative — a memorised greeting is not A1 on its own. Then, addressed to them ("You can…"), one plain English sentence on what they can do in ${lang} and one on what is shaky. If they said nothing at all in ${lang}, say so kindly. Also list what they like or mentioned about themselves (work, city, hobbies, why they are learning) as short phrases; empty if nothing came up.

2. A path of exactly ${PATH_LENGTH} lessons that starts where they are and builds: each lesson is one real-life scene plus one grammar point, in an order that makes sense (the grammar builds; each scene reuses what came before). Pick scenes from their interests where you can. For each: a short English title, the scene in one English sentence, the grammar point in a few words.

3. Lesson 1, written in full.

${LESSON_RULES(lang)}`

  const result = await llmComplete({
    model: PATH_MODEL,
    system,
    messages: [{ role: 'user', content: `The level-check conversation:\n\n${transcriptText(input.transcript) || '(the learner said nothing)'}` }],
    maxTokens: 8_000,
    forceTool: true,
    tools: [{
      name: 'record_placement',
      description: 'Record the level, the path and lesson 1.',
      input_schema: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'] },
          can_do: { type: 'string' },
          shaky: { type: 'string' },
          interests: { type: 'array', items: { type: 'string' } },
          path: {
            type: 'array',
            items: {
              type: 'object',
              properties: { title: { type: 'string' }, scene: { type: 'string' }, grammar: { type: 'string' } },
              required: ['title', 'scene', 'grammar'],
            },
          },
          lesson_1: lessonSchema(),
        },
        required: ['level', 'can_do', 'shaky', 'interests', 'path', 'lesson_1'],
      },
    }],
  })
  if (result.type !== 'tool_call') throw new Error('The level check returned no plan')
  const r = result.input as {
    level?: string; can_do?: string; shaky?: string; interests?: string[]
    path?: { title?: string; scene?: string; grammar?: string }[]; lesson_1?: RawLesson
  }
  const level = String(r.level ?? 'A1')
  const lesson = planFromRaw(r.lesson_1 ?? {}, lang, level)
  const outline = (r.path ?? [])
    .map((e, i) => ({
      position: i + 1,
      title: String(e.title ?? '').trim(),
      scene: String(e.scene ?? '').trim(),
      grammar: String(e.grammar ?? '').trim(),
    }))
    .filter((e) => e.title)
    .slice(0, PATH_LENGTH)
  if (outline.length === 0) throw new Error('The level check returned no path')
  // Lesson 1 is the lesson that was written, whatever the outline called it.
  outline[0] = { ...outline[0], title: lesson.title, scene: lesson.plan.scene || outline[0].scene,
                 grammar: lesson.plan.grammar_point || outline[0].grammar }
  return {
    placement: {
      level,
      can_do: String(r.can_do ?? '').trim(),
      shaky: String(r.shaky ?? '').trim(),
      interests: (r.interests ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 8),
    },
    outline,
    lesson,
  }
}

async function createLessonThread(input: {
  userId: string
  userName: string
  position: number
  title: string
  plan: LessonPlan
}): Promise<PollyThread | null> {
  const thread = await createThread({
    userId: input.userId,
    client: 'web',
    handle: input.userName,
    topic: input.title,
    // The lesson as readable text is the topic's material: chat, the voice
    // backend and card generation all read thread content.
    content: lessonAsText(input.title, input.plan),
    kind: 'lesson',
  })
  if (!thread) return null
  const { data, error } = await pollySupabase()
    .from('polly_threads')
    .update({ lesson: input.plan, path_position: input.position })
    .eq('id', thread.id)
    .select('*')
    .single()
  if (error || !data) {
    console.error('[polly/path] lesson save failed:', error)
    return null
  }
  return data as PollyThread
}

function lessonAsText(title: string, l: LessonPlan): string {
  const words = l.key_words.map((t) => `- ${t.term} — ${t.meaning}`).join('\n')
  const phrases = l.phrases.map((t) => `- ${t.term} — ${t.meaning}`).join('\n')
  const dialogue = (l.dialogue ?? []).map((d) => `${d.speaker}: ${d.line}\n    (${d.english})`).join('\n')
  return `${title} — a ${l.language} lesson by Polly (${l.level ?? 'beginner'})

The scene: ${l.scene ?? ''}

The conversation:
${dialogue}

Words:
${words}

Expressions:
${phrases}

Grammar: ${l.grammar_point ?? ''}
${l.grammar_explained ?? ''}

To take it further: ${l.closing_question ?? ''}`
}

export type PlacementResult =
  | { ok: true; view: PathView; lesson_thread_id: string }
  | { ok: false; status: number; error: string }

/// The level check is over: read it, save the verdict and the path, write
/// lesson 1 as a topic. A retake replaces the path: lessons already started
/// stay as ordinary topics (off the path), untouched ones are removed.
export async function placeLearner(input: {
  userId: string
  userName: string
  voiceSessionId: string
}): Promise<PlacementResult> {
  const sb = pollySupabase()
  const course = await activeCourse(input.userId)
  if (!course) return { ok: false, status: 409, error: 'Pick a language first.' }
  const { data: vs } = await sb
    .from('polly_voice_sessions')
    .select('id, mode, transcript')
    .eq('id', input.voiceSessionId)
    .eq('user_id', input.userId)
    .maybeSingle()
  if (!vs || vs.mode !== 'placement') return { ok: false, status: 404, error: 'Level check not found.' }
  const transcript = (Array.isArray(vs.transcript) ? vs.transcript : []) as TranscriptRow[]

  let planned: Awaited<ReturnType<typeof planFromPlacement>>
  try {
    planned = await planFromPlacement({
      languageName: LANGUAGES[course.language].name,
      learnerName: input.userName,
      transcript,
    })
  } catch (err) {
    console.error('[polly/path] planning failed:', err)
    return { ok: false, status: 502, error: 'Polly could not build your plan. Try again.' }
  }

  await retireOldPath(input.userId, course)
  const thread = await createLessonThread({
    userId: input.userId, userName: input.userName, position: 1, title: planned.lesson.title, plan: planned.lesson.plan,
  })
  if (!thread) return { ok: false, status: 500, error: 'Could not save the lesson.' }

  const path: PathEntry[] = planned.outline.map((e) => ({ ...e, thread_id: e.position === 1 ? thread.id : null }))
  const placement: Placement = {
    ...planned.placement,
    voice_session_id: input.voiceSessionId,
    placed_at: new Date().toISOString(),
    model: PATH_MODEL,
  }
  const { error } = await sb
    .from('polly_courses')
    .update({ level: placement.level, placement, path, path_card_dismissed_at: null })
    .eq('id', course.id)
  if (error) {
    console.error('[polly/path] course save failed:', error)
    return { ok: false, status: 500, error: 'Could not save your plan.' }
  }
  const view = await pathView(input.userId)
  return { ok: true, view: view!, lesson_thread_id: thread.id }
}

async function retireOldPath(userId: string, course: CourseRow): Promise<void> {
  const ids = course.path.map((e) => e.thread_id).filter((id): id is string => !!id)
  if (ids.length === 0) return
  const sb = pollySupabase()
  const { data } = await sb
    .from('polly_threads')
    .select('id, lesson_steps, lesson_done_at, messages')
    .eq('user_id', userId)
    .in('id', ids)
  for (const t of data ?? []) {
    const started = !!t.lesson_done_at || Object.keys(t.lesson_steps ?? {}).length > 0 ||
      (Array.isArray(t.messages) && t.messages.length > 0)
    if (started) await sb.from('polly_threads').update({ path_position: null }).eq('id', t.id)
    else await sb.from('polly_threads').delete().eq('id', t.id).eq('user_id', userId)
  }
}

// ---------------------------------------------------------------------------
// Steps, finishing a lesson, writing the next one
// ---------------------------------------------------------------------------

/// Mark one step of a lesson done. Returns whether this finished the lesson
/// (the caller then writes the next one, after the response).
export async function markLessonStep(
  thread: Pick<PollyThread, 'id' | 'user_id' | 'kind' | 'lesson_steps' | 'lesson_done_at'>,
  step: LessonStep,
): Promise<{ finished: boolean }> {
  if (thread.kind !== 'lesson') return { finished: false }
  const steps = { ...(thread.lesson_steps ?? {}) }
  if (!steps[step]) steps[step] = new Date().toISOString()
  const all = LESSON_STEPS.every((s) => !!steps[s])
  const finishing = all && !thread.lesson_done_at
  const { error } = await pollySupabase()
    .from('polly_threads')
    .update({
      lesson_steps: steps,
      ...(finishing ? { lesson_done_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', thread.id)
    .eq('user_id', thread.user_id)
  if (error) {
    console.error('[polly/path] markLessonStep failed:', error)
    return { finished: false }
  }
  return { finished: finishing }
}

/// A voice session on a lesson ended: it is the Talk step if the learner
/// really spoke.
export async function talkStepFromSession(input: {
  userId: string
  voiceSessionId: string
}): Promise<{ finished: boolean; threadId: string | null }> {
  const { data: vs } = await pollySupabase()
    .from('polly_voice_sessions')
    .select('thread_id, mode, transcript')
    .eq('id', input.voiceSessionId)
    .eq('user_id', input.userId)
    .maybeSingle()
  if (!vs?.thread_id || vs.mode !== 'topic') return { finished: false, threadId: null }
  const thread = await getThreadById(input.userId, vs.thread_id as string)
  if (!thread || thread.kind !== 'lesson') return { finished: false, threadId: null }
  const spoken = ((vs.transcript ?? []) as TranscriptRow[]).filter((r) => r.role === 'user').length
  if (spoken < TALK_MIN_USER_TURNS) return { finished: false, threadId: thread.id }
  const { finished } = await markLessonStep(thread, 'talk')
  return { finished, threadId: thread.id }
}

/// How the lesson just finished went, for the writer of the next one.
async function howItWent(thread: PollyThread): Promise<string> {
  const sb = pollySupabase()
  const { data: cards } = await sb
    .from('polly_flash_cards')
    .select('question, answer, lapses, reps, lesson_step')
    .eq('thread_id', thread.id)
    .eq('user_id', thread.user_id)
  const missed = (cards ?? []).filter((c) => (c.lapses ?? 0) > 0)
  const { data: talk } = await sb
    .from('polly_voice_sessions')
    .select('transcript')
    .eq('thread_id', thread.id)
    .eq('user_id', thread.user_id)
    .eq('mode', 'topic')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const spoken = transcriptText(((talk?.transcript ?? []) as TranscriptRow[]))
  return `Cards they missed at least once (${missed.length} of ${(cards ?? []).length}):
${missed.map((c) => `- [${c.lesson_step ?? 'words'}] ${c.question} → ${c.answer}`).join('\n') || '(none)'}

Their spoken practice of the scene (speech-to-text):
${spoken || '(no transcript)'}`
}

/// Write the lesson at `position` from the path's outline and from how the
/// one before went. Idempotent: a lesson that already has its topic is left.
export async function writeLesson(userId: string, userName: string, position: number): Promise<PollyThread | null> {
  const course = await activeCourse(userId)
  const entry = course?.path.find((e) => e.position === position)
  if (!course || !entry) return null
  if (entry.thread_id) {
    const existing = await getThreadById(userId, entry.thread_id)
    if (existing) return existing
  }
  if (entry.writing_since && Date.now() - new Date(entry.writing_since).getTime() < WRITING_CLAIM_MS) return null
  await pollySupabase()
    .from('polly_courses')
    .update({ path: course.path.map((e) => (e.position === position ? { ...e, writing_since: new Date().toISOString() } : e)) })
    .eq('id', course.id)
  const lang = LANGUAGES[course.language].name
  const level = course.level ?? 'A1'
  const before = course.path.filter((e) => e.position < position)
  const previous: PollyThread[] = []
  for (const e of before) {
    if (!e.thread_id) continue
    const t = await getThreadById(userId, e.thread_id)
    if (t) previous.push(t)
  }
  const last = previous[previous.length - 1]
  const taught = previous
    .map((t) => `Lesson ${t.path_position}: ${t.topic} — grammar: ${t.lesson?.grammar_point ?? '?'}; words: ${(t.lesson?.key_words ?? []).map((w) => w.term).join(', ')}`)
    .join('\n')

  const system = `You are Polly, a ${lang} tutor, writing the next lesson on a learner's path. Their own language is English; their level is ${level}.${course.placement ? ` From the level check: ${course.placement.can_do} ${course.placement.shaky}${course.placement.interests.length ? ` They like: ${course.placement.interests.join(', ')}.` : ''}` : ''}

The path (${course.path.length} lessons):
${course.path.map((e) => `${e.position}. ${e.title} — ${e.scene} — grammar: ${e.grammar}`).join('\n')}

Already taught:
${taught || '(nothing yet)'}

Write lesson ${position}: "${entry.title}" — ${entry.scene} — grammar: ${entry.grammar}. Keep to that outline unless how the last lesson went says they are not ready (then make this lesson consolidate: same grammar as the last one, a new scene) — say so by the title and grammar_point you return. Reuse words from earlier lessons freely; the 8 key words are NEW ones. Work one or two of the things they missed back into the conversation.

${LESSON_RULES(lang)}`

  const result = await llmComplete({
    model: PATH_MODEL,
    system,
    messages: [{ role: 'user', content: last ? `How lesson ${last.path_position} ("${last.topic}") went:\n\n${await howItWent(last)}` : 'This is their first lesson.' }],
    maxTokens: 6_000,
    forceTool: true,
    tools: [{ name: 'record_lesson', description: 'Record the lesson.', input_schema: lessonSchema() }],
  })
  if (result.type !== 'tool_call') throw new Error('The lesson writer returned nothing')
  const { title, plan } = planFromRaw(result.input as RawLesson, lang, level)
  const thread = await createLessonThread({ userId, userName, position, title, plan })
  if (!thread) return null

  // Re-read the path before saving: the card may have been dismissed, or a
  // retake may have replaced it, while the lesson was being written.
  const fresh = await activeCourse(userId)
  if (!fresh || fresh.id !== course.id || !fresh.path.some((e) => e.position === position && !e.thread_id)) {
    await pollySupabase().from('polly_threads').delete().eq('id', thread.id).eq('user_id', userId)
    return null
  }
  const path = fresh.path.map((e) =>
    e.position === position
      ? { ...e, title, scene: plan.scene || e.scene, grammar: plan.grammar_point || e.grammar, thread_id: thread.id, writing_since: null }
      : e,
  )
  await pollySupabase().from('polly_courses').update({ path }).eq('id', course.id)
  console.log(`[polly/path] wrote lesson ${position} for ${userId}: ${title}`)
  return thread
}

/// The lesson the learner should be on exists: if the one before it is done
/// and it has no topic yet, write it. Called when a lesson finishes and when
/// the path is opened (which is also the retry after a failed write).
export async function ensureCurrentLesson(userId: string, userName: string): Promise<PollyThread | null> {
  const view = await pathView(userId)
  const next = view?.lessons.find((l) => l.state === 'writing')
  if (!next) return null
  try {
    const thread = await writeLesson(userId, userName, next.position)
    if (thread) await ensureLessonDeck(thread)
    return thread
  } catch (err) {
    console.error(`[polly/path] writing lesson ${next.position} failed:`, err)
    return null
  }
}
