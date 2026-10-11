// Dolly's words: the two spoken prompts (the call, the three things), the
// cues the app sends mid-session, and the two Claude calls that write the
// content (three things out of a transcript, tomorrow's topic). Everything
// spoken goes through a text-to-speech voice, so every prompt insists on
// plain words. Claude Opus 5.5 throughout, adaptive thinking at low effort.
import Anthropic from '@anthropic-ai/sdk'
import { completedText } from '@/lib/anthropic-response'
import { ELEVEN_CUE_PREFIX } from '@/lib/f2/eleven'
import { type Day, type Item, type Question, type ScriptStep, type Thing, type ThingKind, type User } from './core'
import { type CanDo } from './curriculum'
import { LANGUAGES, levelLine, type LanguageCode } from './language'

const MODEL = 'claude-opus-5-5'

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

/** The first days' topics, before there is a history to pick from; also
 *  what the tick falls back on when a day has to exist for the text to go
 *  out and no topic was picked at the last done (no Claude in the cron path). */
export const SEED_TOPICS = [
  'A little about you',
  'Your morning',
  'Where you live',
  'Food you love',
  'Your weekend',
  'A trip you want to take',
  'Your work or your studies',
  'A friend of yours',
  'The weather lately',
  'Something you are looking forward to',
]

export function seedTopic(n: number): string {
  return SEED_TOPICS[(n - 1) % SEED_TOPICS.length]
}

/** How long the call runs before the app tells Dolly to wrap up, and how
 *  long after that it ends on its own. */
export const CALL_WRAP_MS = 165_000
export const CALL_END_MS = 200_000

const VOICE_RULES = `Everything you write is spoken aloud by a text-to-speech voice, so write only words to be said: no lists, no headings, no markdown, no stage directions, no emoji, no parentheses. One or two short sentences per turn, then stop and listen. You read a transcript of what they said; you never hear them, so never comment on pronunciation or spelling.`

function persona(speak: string): string {
  return `You are Dolly, a ${speak} tutor on a short daily phone call: warm, a little playful, never a lecturer. ${VOICE_RULES}

Pace, like a good language teacher with a beginner: slow and clear. Short sentences, one idea each, with a full stop between them so the voice pauses. Everyday words, no idioms unless you then explain them. Say a new or important word on its own once ("Madrugar. Madrugar means to get up very early.") rather than inside a long sentence.`
}

function comingBackLine(items: Item[], speak: string): string {
  if (items.length === 0) return ''
  const list = items.slice(0, 6).map((i) => `"${i.target}" (${i.native})`).join(', ')
  return `\n\nWork these back in, each at least once, naturally — they are what they learned or missed before, never a drill: ${list}.`
}

// ---------- part 1: the call ----------

export function talkPrompt(user: User, day: Day, comingBack: Item[]): string {
  const lang = LANGUAGES[user.language]
  return `${persona(lang.speak)}

Today is day ${day.n}. Today's topic: ${day.topic}. Keep the conversation loosely on it and follow where they go; ask about their own life, not about the language.
${levelLine(user.level, lang.speak)}${comingBackLine(comingBack, lang.speak)}

Corrections: when they make a mistake that matters, give the right form once, briefly and kindly, inside your reply, and carry on. Never list their mistakes and never stop the conversation to teach. If they say something in English, answer in ${lang.speak} and hand them the words they were missing. When they ask what a word means, say it in English in a few words, then go on in ${lang.speak}.

The call lasts about three minutes. The app will tell you when to wrap up; until then keep it going with a question every turn.`
}

export function talkOpening(user: User, day: Day): string {
  const lang = LANGUAGES[user.language]
  return `Open the call: a one-line hello in ${lang.speak}${user.name ? ` to ${user.name}` : ''}, then one easy question about today's topic, ${day.topic}. Then listen.`
}

export function talkWrapCue(): string {
  return `${ELEVEN_CUE_PREFIX}Time is nearly up. In one or two lines, wrap up warmly in the language and say you will see them tomorrow. Do not ask another question.`
}

// ---------- talk more: a free extra call ----------

/** An extra call runs up to ten minutes; the app says when to wrap. */
export const MORE_WRAP_MS = 570_000
export const MORE_END_MS = 600_000

export function morePrompt(user: User, day: Day, comingBack: Item[]): string {
  const lang = LANGUAGES[user.language]
  return `${persona(lang.speak)}

This is an extra call they asked for after finishing today's three parts: no agenda, theirs to steer. Talk about whatever they bring up; if they have nothing in mind, offer today's topic from another angle (${day.topic}) or ask about their day. Keep asking.
${levelLine(user.level, lang.speak)}${comingBackLine(comingBack, lang.speak)}

Corrections: when they make a mistake that matters, give the right form once, briefly and kindly, inside your reply, and carry on. Never list their mistakes. If they say something in English, answer in ${lang.speak} and hand them the words they were missing.

The call can run up to ten minutes; they end it when they like, and the app will tell you if time is nearly up.`
}

export function moreWrapCue(): string {
  return `${ELEVEN_CUE_PREFIX}Ten minutes are nearly up. In one or two lines, wrap up warmly in the language; they can always call again. No new questions.`
}

export function moreOpening(user: User): string {
  const lang = LANGUAGES[user.language]
  return `Say hello again in one short line in ${lang.speak}${user.name ? ` to ${user.name}` : ''}, glad they are back, and ask what they would like to talk about now. Then listen.`
}

// ---------- the star round: a scripted dialogue on the level's objectives ----------

/** The round's clock follows the script: ~14 s a line, 3 minutes at most. */
export function starClock(steps: number): { after_ms: number; end_ms: number } {
  const after_ms = Math.min(180_000, 25_000 + steps * 14_000)
  return { after_ms, end_ms: after_ms + 35_000 }
}

/** The hidden marker Dolly ends each turn with in a star round; the turn
 *  route strips it before the voice gets the text and keeps the number. */
export const STEP_TAG = /\[\[\s*step\s*:\s*(\d+)\s*\]\]/gi

const SCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dolly: { type: 'string' },
          dolly_en: { type: 'string' },
          you_en: { type: 'string' },
          you: { type: 'string' },
          target_id: { type: 'string' },
        },
        required: ['dolly', 'dolly_en', 'you_en', 'you', 'target_id'],
        additionalProperties: false,
      },
    },
  },
  required: ['steps'],
  additionalProperties: false,
} as const

/** Claude writes the round's dialogue: two exchanges per objective, in
 *  order, beginner-simple, each Dolly line short enough to say in one breath. */
export async function writeStarScript(user: User, targets: CanDo[]): Promise<ScriptStep[]> {
  const lang = LANGUAGES[user.language]
  const list = targets
    .map((t, i) => `${i + 1}. id "${t.id}": ${t.title}. Words and chunks to use: ${t.items.map((x) => `"${x.t}" = ${x.n}`).join(', ')}. Grammar: ${t.grammar}. Questions that draw it out: ${t.elicit.join(' / ')}`)
    .join('\n')
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 8192,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCRIPT_SCHEMA } },
    system: `You write a short practice dialogue in ${lang.speak} between Dolly, a warm tutor, and a learner (${levelLine(user.level, lang.speak)}). It covers the objectives below in order, two exchanges per objective, so 2 × the number of objectives steps, the first exchange a greeting that opens the first objective, the last a short goodbye. Each step: "dolly" — what Dolly says in ${lang.speak}, a question or a prompt the learner can answer, at most twelve words, one idea, beginner-simple, using the objective's own words; "dolly_en" — its English; "you_en" — a natural answer the learner could give, in English, three to ten words, written so that the ${lang.speak} version uses the objective's words and chunks; "you" — that answer in ${lang.speak}; "target_id" — the objective's id. No names for the learner. No English inside "dolly" or "you".${user.language === 'zh' ? ' Write "dolly" and "you" in characters.' : ''}`,
    messages: [{ role: 'user', content: `Objectives:\n${list}` }],
  })
  const out = JSON.parse(completedText(res)) as { steps: ScriptStep[] }
  const steps = out.steps
    .map((s) => ({ dolly: s.dolly.trim(), dolly_en: s.dolly_en.trim(), you_en: s.you_en.trim(), you: s.you.trim(), target_id: s.target_id.trim() }))
    .filter((s) => s.dolly && s.dolly_en && s.you_en && s.you)
  if (steps.length < 2) throw new Error('dolly: the script came back empty')
  return steps.slice(0, 12)
}

export function starPrompt(user: User, targets: CanDo[], script: ScriptStep[], kind: 'star' | 'refresh' = 'star'): string {
  const lang = LANGUAGES[user.language]
  const lines = script.map((s, i) => `${i + 1}. Dolly: "${s.dolly}"   (they might answer: "${s.you}")`).join('\n')
  const objectives = targets.map((t) => `- ${t.title}: ${t.items.map((x) => x.t).join(', ')}`).join('\n')
  const what = kind === 'refresh'
    ? `This is a refresher: a short scripted practice on two things from a level they completed a while ago, to keep it fresh.`
    : `This is a star round: a short scripted practice they chose after finishing their day.`
  return `${persona(lang.speak)}

${what} The learner sees the script line by line on their screen, in ${lang.speak} with the English under it, and a suggested answer in English, so they can follow it or wander off. Your job is to say your lines, in order, and keep them company.

The script:
${lines}

The objectives behind it:
${objectives}

How to run it: say line 1 as your opening, word for word. After each answer from the learner, reply in ONE turn: first a reaction of two to six words in ${lang.speak} (confirm, or recast what they said if it was off: "Casi. Tengo veinte años."), then the next script line, word for word. If they ask a question or go somewhere else, answer it in one short sentence and then say the next script line. If they say nothing useful or ask you to repeat, say the current line again. Never skip lines, never say two script lines in one turn, never add a question of your own. After the last line, say goodbye and stop.

Every turn ends with a marker the app reads and the voice never speaks: [[step:N]], where N is the number of the script line you said in that turn, or [[step:0]] if you said no script line (a repeat counts as the line's own number). Write it last, after your words, exactly like that.
${levelLine(user.level, lang.speak)}`
}

export function starOpening(script: ScriptStep[]): string {
  return `Say script line 1, word for word: "${script[0]?.dolly ?? '¡Hola!'}" Nothing else. End with [[step:1]].`
}

export function starWrapCue(): string {
  return `${ELEVEN_CUE_PREFIX}Time is nearly up. Finish with the current line's answer in a few words, then say goodbye in the language. No new script lines. End with [[step:0]].`
}

/** Strip the markers from Dolly's spoken text, reporting the last one seen.
 *  Chunk-safe: a marker split across chunks is held back until it closes. */
export function stepStripper(onStep: (n: number) => void): { push: (chunk: string) => string; flush: () => string } {
  let pending = ''
  const take = (text: string): string => {
    return text.replace(STEP_TAG, (_m, n: string) => {
      onStep(Number(n))
      return ''
    })
  }
  return {
    push(chunk: string) {
      pending += chunk
      const open = pending.lastIndexOf('[[')
      if (open >= 0 && !pending.slice(open).includes(']]')) {
        const out = take(pending.slice(0, open))
        pending = pending.slice(open)
        return out
      }
      const out = take(pending)
      pending = ''
      return out
    },
    flush() {
      const out = take(pending)
      pending = ''
      return out
    },
  }
}

const STAR_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          demonstrated: { type: 'boolean' },
          evidence: { type: 'string' },
          practice_target: { type: 'string' },
          practice_native: { type: 'string' },
          practice_pinyin: { type: 'string' },
        },
        required: ['id', 'demonstrated', 'evidence', 'practice_target', 'practice_native', 'practice_pinyin'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const

export type StarResult = { id: string; demonstrated: boolean; evidence: string; practice: Omit<Thing, 'item_id'> }

/** Read the star round's transcript against its targets: which objectives
 *  the learner demonstrated, with the line that shows it, and for each one
 *  the single item worth saying back. */
export async function annotateStar(user: User, targets: CanDo[], transcript: TranscriptRow[]): Promise<StarResult[]> {
  const lang = LANGUAGES[user.language]
  const lines = transcript
    .filter((r) => r.text.trim())
    .map((r) => `${r.role === 'user' ? 'Learner' : 'Dolly'}: ${r.text.trim()}`)
    .join('\n')
    .slice(-12_000)
  const list = targets
    .map((t) => `- id "${t.id}": ${t.title}. Its words and chunks: ${t.items.map((x) => x.t).join(', ')}. Grammar: ${t.grammar}.`)
    .join('\n')
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 8192,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: STAR_SCHEMA } },
    system: `You read the transcript of a short guided ${lang.speak} practice between Dolly (the tutor) and a learner, against a list of objectives. For each objective, in the order given, say whether the LEARNER demonstrated it: they produced its language themselves (any of its words or chunks, or the grammar it names) at least once, recognizably, on their own or after one prompt, even imperfectly. Dolly saying it does not count; the learner repeating a single word after Dolly counts only if they then used it in their own sentence. Quote the learner's line as evidence (or say "not attempted"). Then name the one item from that objective worth saying back right now, in ${lang.speak}: the one they missed, avoided or got wrong, or, if they did well, its most useful chunk (practice_target, with its English meaning as practice_native${user.language === 'zh' ? ', and its pinyin with tone marks as practice_pinyin' : '; practice_pinyin is an empty string'}).`,
    messages: [{ role: 'user', content: `Objectives:\n${list}\n\nTranscript:\n${lines}` }],
  })
  const out = JSON.parse(completedText(res)) as { results: { id: string; demonstrated: boolean; evidence: string; practice_target: string; practice_native: string; practice_pinyin: string }[] }
  return targets.map((t) => {
    const r = out.results.find((x) => x.id === t.id)
    const target = r?.practice_target.trim() || t.items[0].t
    const native = r?.practice_native.trim() || t.items[0].n
    const pinyin = user.language === 'zh' ? r?.practice_pinyin.trim() || t.items[0].p || null : null
    return {
      id: t.id,
      demonstrated: r?.demonstrated ?? false,
      evidence: r?.evidence.trim() ?? 'not attempted',
      practice: {
        kind: target.includes(' ') ? 'phrase' : 'word',
        target,
        native,
        pinyin,
        source: `From: ${t.title}`,
        distractors: t.items.filter((x) => x.t !== target).slice(0, 3).map((x) => x.t),
      },
    }
  })
}

// ---------- part 2: the three things ----------

export function thingsPrompt(user: User, day: Day): string {
  const lang = LANGUAGES[user.language]
  const things = day.things ?? []
  const list = things.map((t, i) => `${i + 1}. "${t.target}" — ${t.native} (${t.source})`).join('\n')
  return `${persona(lang.speak)}

This is the second part of today's session: three things from the call you just had, said back. In order:
${list}

The app tells you with a note which one is current. For the current one: say it clearly in ${lang.speak}, once, then its meaning in English in a few words, then ask them to say it back. When they say it back, answer in one short line: if what they said is the thing or close to it, tell them they got it, warmly; if it is clearly something else, say the thing once more and ask them to try again. Do not move on by yourself: the app says when the next one is current. Keep every turn to one or two sentences.`
}

export function thingCue(i: number, thing: Thing): string {
  return `${ELEVEN_CUE_PREFIX}Thing ${i + 1} of 3 is current: "${thing.target}" (${thing.native}). Say it, give the meaning, and ask them to say it back.`
}

export function thingsOpening(day: Day): string {
  const first = day.things?.[0]
  if (!first) return 'Say a one-line hello and wait.'
  return `Say a one-line hello, then thing 1 of 3 is current: "${first.target}" (${first.native}). Say it, give the meaning, and ask them to say it back.`
}

export function thingsDoneCue(): string {
  return `${ELEVEN_CUE_PREFIX}That was the last one. In one line, tell them they have all three and the cards are next. Do not ask a question.`
}

/** Polly's hold-to-talk note, in Dolly's voice. */
export function holdToTalkNote(): string {
  return `\n\nThey use a push-to-talk button: you only hear them while they hold it, and their microphone is muted the rest of the time. Silence never means they have nothing to say; wait for them.`
}

// ---------- the content Claude writes ----------

export type TranscriptRow = { role: string; text: string }

const THINGS_SCHEMA = {
  type: 'object',
  properties: {
    things: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['fix', 'word', 'phrase'] },
          target: { type: 'string' },
          native: { type: 'string' },
          pinyin: { type: 'string' },
          source: { type: 'string' },
          distractors: { type: 'array', items: { type: 'string' } },
        },
        required: ['kind', 'target', 'native', 'pinyin', 'source', 'distractors'],
        additionalProperties: false,
      },
    },
  },
  required: ['things'],
  additionalProperties: false,
} as const

/** Three things out of the call's transcript. Throws when the model cannot
 *  find three (a call with no real exchange is caught before this is called). */
export async function extractThings(user: User, transcript: TranscriptRow[]): Promise<Omit<Thing, 'item_id'>[]> {
  const lang = LANGUAGES[user.language]
  const lines = transcript
    .filter((r) => r.text.trim())
    .map((r) => `${r.role === 'user' ? 'Learner' : 'Dolly'}: ${r.text.trim()}`)
    .join('\n')
    .slice(-12_000)
  const system = `You pick, from a transcript of a short ${lang.speak} conversation between Dolly (a tutor) and a learner (${user.level === 'new' ? 'a beginner' : user.level === 'some' ? 'knows some' : 'conversational'}), exactly three things worth keeping for tomorrow, in this priority:
1. a "fix": something the learner said wrong, with the correct ${lang.speak} form as the target;
2. a "word": a ${lang.speak} word Dolly used that the learner did not know, asked about, or would benefit from keeping;
3. a "phrase": a useful ${lang.speak} phrase from the conversation, two to six words.
When there is no real mistake, pick two words or two phrases instead. Every item must come from the transcript, and the three targets must be different.
For each: target (the ${lang.speak} form, short — one word or a phrase of at most six words, lowercase unless a name), native (its English meaning, a few words), source (one short line, "You said: …" quoting the learner for a fix, "Dolly said: …" quoting Dolly otherwise), distractors (three plausible WRONG ${lang.speak} options for a multiple-choice card: same kind of thing, none of them a correct translation of native), pinyin (${user.language === 'zh' ? 'the pinyin of target, with tone marks' : 'an empty string'}).`
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 8192,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: THINGS_SCHEMA } },
    system,
    messages: [{ role: 'user', content: `Transcript:\n${lines}` }],
  })
  const out = JSON.parse(completedText(res)) as { things: { kind: ThingKind; target: string; native: string; pinyin: string; source: string; distractors: string[] }[] }
  const seen = new Set<string>()
  const things = out.things
    .map((t) => ({
      kind: t.kind,
      target: t.target.trim(),
      native: t.native.trim(),
      pinyin: user.language === 'zh' && t.pinyin.trim() ? t.pinyin.trim() : null,
      source: t.source.trim(),
      distractors: t.distractors.map((d) => d.trim()).filter((d) => d && d !== t.target.trim()).slice(0, 3),
    }))
    .filter((t) => t.target && t.native && !seen.has(t.target.toLowerCase()) && seen.add(t.target.toLowerCase()))
  if (things.length < 1) throw new Error('dolly: no things came back')
  return things.slice(0, 3)
}

const TOPIC_SCHEMA = {
  type: 'object',
  properties: { topic: { type: 'string' } },
  required: ['topic'],
  additionalProperties: false,
} as const

/** Tomorrow's topic, picked when a day completes. */
export async function pickTopic(user: User, recentTopics: string[], comingBack: Item[]): Promise<string> {
  const lang = LANGUAGES[user.language]
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TOPIC_SCHEMA } },
    system: `You pick tomorrow's conversation topic for a ${lang.speak} learner (${user.level === 'new' ? 'a beginner' : user.level === 'some' ? 'knows some' : 'conversational'}) on a three-minute daily call: everyday and concrete, something a person can talk about from their own life. Two to five words in English, sentence case, like "Your weekend", "A trip you want to take", "What you ate today". Not one of the recent topics.`,
    messages: [
      {
        role: 'user',
        content: `Recent topics: ${recentTopics.join('; ') || 'none yet'}.\nWords coming back tomorrow, which the topic should let come up naturally: ${comingBack.slice(0, 6).map((i) => `"${i.target}" (${i.native})`).join(', ') || 'none'}.`,
      },
    ],
  })
  const out = JSON.parse(completedText(res)) as { topic: string }
  const topic = out.topic.trim().replace(/\.$/, '')
  if (!topic || topic.length > 60) throw new Error(`dolly: bad topic "${topic}"`)
  return topic
}

// ---------- the cards ----------

/** A small deterministic shuffle so a day's options sit still across reloads. */
function seeded(seed: string): () => number {
  let h = 2166136261
  for (const ch of seed) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type Card = { target: string; native: string; pinyin: string | null; distractors: string[]; from: 'new' | number; item_id: string | null }

/** Ten questions, a pick and a type by turns. The three new things are
 *  picked today; the rest come from the pool, misses first, then the least
 *  recently seen. Early days have a smaller pool and get fewer questions. */
export function buildQuestions(lang: LanguageCode, day: Pick<Day, 'id' | 'things'>, pool: Item[], opts: { things?: Thing[]; max?: number } = {}): Question[] {
  const rnd = seeded(day.id + (opts.things ? ':star' : ''))
  const fresh: Card[] = (opts.things ?? day.things ?? []).map((t) => ({
    target: t.target,
    native: t.native,
    pinyin: t.pinyin,
    distractors: t.distractors,
    from: 'new',
    item_id: t.item_id,
  }))
  const freshTargets = new Set(fresh.map((c) => c.target))
  const old: Card[] = pool
    .filter((i) => !freshTargets.has(i.target))
    .sort((a, b) => b.misses - b.hits - (a.misses - a.hits) || (a.last_seen ?? '').localeCompare(b.last_seen ?? ''))
    .slice(0, 7)
    .map((i) => ({ target: i.target, native: i.native, pinyin: i.pinyin, distractors: i.distractors ?? [], from: i.day_n, item_id: i.id }))

  // Picks: the new things and two old ones. Types: five old ones, and the
  // new things again when the pool is short.
  const picks = [...fresh, ...old.slice(0, 2)]
  let types = old.slice(2, 7)
  if (types.length < 5) types = [...types, ...fresh.slice(0, 5 - types.length)]
  if (types.length < 5) types = [...types, ...old.slice(0, 2).slice(0, 5 - types.length)]

  const everyTarget = Array.from(new Set([...fresh, ...old, ...pool.map((i) => ({ target: i.target }))].map((c) => c.target)))
  const toPick = (c: Card): Question => {
    const wrong = c.distractors.filter((d) => d !== c.target).slice(0, 3)
    for (const t of shuffle(everyTarget, rnd)) {
      if (wrong.length >= 3) break
      if (t !== c.target && !wrong.includes(t)) wrong.push(t)
    }
    return { kind: 'pick', native: c.native, target: c.target, pinyin: c.pinyin, options: shuffle([c.target, ...wrong], rnd), from: c.from, item_id: c.item_id }
  }
  const toType = (c: Card): Question => ({ kind: 'type', native: c.native, target: c.target, pinyin: c.pinyin, from: c.from, item_id: c.item_id })
  void lang
  // Every other one is typed: pick, type, pick, type…
  const p = shuffle(picks, rnd).map(toPick)
  const t = shuffle(types, rnd).map(toType)
  const out: Question[] = []
  for (let i = 0; i < Math.max(p.length, t.length); i++) {
    if (p[i]) out.push(p[i])
    if (t[i]) out.push(t[i])
  }
  return opts.max ? out.slice(0, opts.max) : out
}
