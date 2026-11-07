// The teacher's chat (Takt, 2026-11-06). Bart: "at all times in the app, give me a small UI
// widget to pull up the agent and chat with them, including when i'm doing a task from the
// map… is this song in A minor? why was the melody i played mostly a D (the 4) and the F (a
// 6)? should i lean on those for my improv, and when we get to the IV chord, and the V, what's
// typically advised". The app sends every question with where the player is (`context`: the
// screen, the song or the lesson step with its key, form, chords and notes, what they have
// played so far, the level they are on) and the thread so far; Opus 5.5 answers as the
// teacher, streamed a few words at a time, with a memory of the player's last two sessions
// (memory.ts: their runs, the jams they sent and the reviews they got, Agent mode, earlier
// questions). Nothing here changes a chart (that is Agent mode, mod-agent.ts). Every exchange
// is kept in takt_chat (schema 006).

import type Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from '@/lib/f2/supabase'
import { libraryText } from './library'
import { recentMemory } from './memory'

export const CHAT_MODEL = 'claude-opus-5-5'

export type ChatTurn = { role: 'user' | 'teacher'; text: string }
/** Where the player is, as the app builds it (`AppModel.chatContext()`); `describe` reads the
 *  keys it knows and shows the rest as JSON, so a new field reaches the teacher before this
 *  file learns it. */
export type ChatContext = Record<string, unknown>
export type ChatRequest = { message: string; thread: ChatTurn[]; context: ChatContext }
export type ChatEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'reply'; text: string; id: string | null }

const MAX_MESSAGE = 2000
const MAX_THREAD = 24
const MAX_TURN = 6000
const MAX_CONTEXT = 80_000

const str = (x: unknown, max = 400) => (typeof x === 'string' ? x.slice(0, max) : '')
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)

// MARK: The request

/** The app's body, checked; a string is the error to send back. */
export function parseChatRequest(body: unknown): ChatRequest | string {
  if (!body || typeof body !== 'object') return 'JSON body required.'
  const b = body as Record<string, unknown>
  const message = typeof b.message === 'string' ? b.message.trim() : ''
  if (!message) return 'message required.'
  if (message.length > MAX_MESSAGE) return 'That message is too long.'
  const thread: ChatTurn[] = []
  if (b.thread != null) {
    if (!Array.isArray(b.thread)) return 'thread must be a list of { role, text }.'
    for (const t of b.thread as Record<string, unknown>[]) {
      if (!t || (t.role !== 'user' && t.role !== 'teacher') || typeof t.text !== 'string') return 'thread must be a list of { role, text }.'
      thread.push({ role: t.role, text: t.text.slice(0, MAX_TURN) })
    }
  }
  const context = b.context != null && typeof b.context === 'object' && !Array.isArray(b.context) ? (b.context as ChatContext) : {}
  if (JSON.stringify(context).length > MAX_CONTEXT) return 'context is too large.'
  return { message, thread: thread.slice(-MAX_THREAD), context }
}

// MARK: Where the player is, in words

const SCREENS: Record<string, string> = {
  learn: 'the Learn tab (the list of modules)',
  stage: 'the Stage (the set list of songs)',
  map: 'the Map (the levels of their plan)',
  settings: 'Settings',
  module: "a module's list of lessons",
  ear: 'the Ear Training module',
  quiz: "today's quiz",
  eargame: 'an ear game (chords or intervals)',
  calibrate: 'the timing calibration',
  lesson: 'a lesson step',
  result: "a lesson's result screen",
  game: 'a run on the Stage',
}

/** "1–4 Dm7 · 5–6 Gm7 · 7–8 Dm7": the chord of every bar, runs of the same chord joined. */
export function chordRuns(form: unknown): string {
  if (!Array.isArray(form) || !form.length) return ''
  const out: string[] = []
  let start = 0
  for (let i = 1; i <= form.length; i++) {
    if (i === form.length || form[i] !== form[start]) {
      out.push(`${start + 1}${i - 1 > start ? `–${i}` : ''} ${String(form[start])}`)
      start = i
    }
  }
  return out.join(' · ')
}

const pct = (x: unknown) => (num(x) == null ? '' : `${Math.round((num(x) as number) * 100)}%`)

function levelLines(l: Record<string, unknown>): string[] {
  const lines = [`The level on the map: Level ${num(l.n) ?? '?'}, "${str(l.title, 80)}"${l.opened ? ' (what they are doing now was opened from this level\'s goals)' : ''}. ${str(l.text, 600)}`]
  if (Array.isArray(l.goals)) {
    lines.push('Its goals:')
    for (const g of l.goals as Record<string, unknown>[]) {
      lines.push(`- ${str(g.title, 80)}: ${str(g.detail, 300)} [${g.done ? 'done' : str(g.status, 120) || 'not yet'}]`)
    }
  }
  return lines
}

function songLines(s: Record<string, unknown>): string[] {
  const lines: string[] = []
  lines.push(`The song: ${str(s.title, 80)} (${[str(s.style, 60), s.keyName ? `in ${str(s.keyName, 40)}` : s.key ? `key ${str(s.key, 20)}` : '', num(s.tempo) != null ? `${s.tempo} bpm` : '', num(s.bars) != null ? `${s.bars} bars` : '', str(s.length, 10)].filter(Boolean).join(', ')}).`)
  if (Array.isArray(s.sections) && s.sections.length) {
    lines.push(`Sections: ${(s.sections as Record<string, unknown>[]).map((x) => `${str(x.name, 40)} (bar ${num(x.bar) ?? '?'})`).join(', ')}.`)
  }
  const runs = chordRuns(s.form)
  if (runs) lines.push(`The chords, bar by bar: ${runs}.`)
  const part = str(s.partTitle, 40) || str(s.part, 20)
  const level = s.difficulty ? `${str(s.difficulty, 20)}${num(s.level) != null && num(s.tiers) != null ? ` (level ${s.level} of ${s.tiers} on the ladder)` : ''}` : ''
  lines.push(`They are playing the ${part} part${s.part === 'melody' ? ' (the melody)' : s.part === 'chords' ? ' (the chords)' : ''}${level ? ` on ${level}` : ''}${s.opened ? ", opened from the Map's level goals" : ''}.`)
  const where = [num(s.bar) != null ? `at bar ${s.bar}${s.section ? ` (${str(s.section, 40)})` : ''}` : '', s.chord ? `chord ${str(s.chord, 20)}` : '', s.practice ? `in practice mode (the scrubber, nothing scored)${num(s.speedPercent) != null && (s.speedPercent as number) < 100 ? ` at ${s.speedPercent}% speed` : ''}` : s.playing ? 'the band playing' : 'the band paused']
    .filter(Boolean)
    .join(', ')
  if (where) lines.push(`Now: ${where}.`)
  const r = s.run as Record<string, unknown> | undefined
  if (r && num(r.score) != null) {
    const counts = [['perfect', r.perfect], ['good', r.good], ['early', r.early], ['late', r.late], ['missed', r.missed], ['wrong keys', r.wrong]]
      .filter(([, v]) => num(v) != null && (v as number) > 0)
      .map(([k, v]) => `${v} ${k}`)
    lines.push(`The run so far: ${r.score} points, combo ${num(r.combo) ?? 0} (best ${num(r.maxCombo) ?? 0}), accuracy ${pct(r.accuracy)}${counts.length ? `: ${counts.join(', ')}` : ''}.`)
  }
  const res = s.result as Record<string, unknown> | undefined
  if (res && res.grade) {
    lines.push(`The run ended: grade ${str(res.grade, 2)} at ${pct(res.accuracy)} accuracy${num(res.timing) != null ? `, ${pct(res.timing)} in time` : ''}${num(res.leanMs) != null ? `, notes leaning ${Math.round(res.leanMs as number)} ms (negative = early)` : ''}${res.verdict ? `; the app said "${str(res.verdict, 200)}"` : ''}${res.recorded === false ? ' (practice, not on the board)' : ''}.`)
  }
  if (s.keys) lines.push(`The keys the line uses, by how often they come: ${str(s.keys, 300)}${s.range ? ` (range ${str(s.range, 20)})` : ''}.`)
  if (s.chart) lines.push(`The line at this level, bar by bar (beats 1 to 4.92, lengths in beats):\n${str(s.chart, 12_000)}`)
  if (Array.isArray(s.board) && s.board.length) {
    lines.push(`Their best runs on this song: ${(s.board as Record<string, unknown>[]).map((b) => `${str(b.grade, 2)} ${pct(b.accuracy)} on ${str(b.part, 20)} ${str(b.difficulty, 20)}${b.when ? ` (${str(b.when, 20)})` : ''}`).join('; ')}.`)
  }
  return lines
}

function lessonLines(l: Record<string, unknown>): string[] {
  const lines: string[] = []
  const step = (l.step ?? {}) as Record<string, unknown>
  const kinds: Record<string, string> = { free: 'an improv: play anything over the band, the take goes to the teacher', jam: 'a jam: a pattern over the band, no gate', play: 'a play step with a gate', ramp: 'a ramp: the tempo climbs', payoff: 'the payoff chorus', card: 'a card of theory' }
  lines.push(`The lesson: the ${str(l.module, 40)} module${num(l.lesson) != null ? `, lesson ${l.lesson}${num(l.lessonCount) != null ? ` of ${l.lessonCount}` : ''}` : ''}${l.lessonTitle ? ` "${str(l.lessonTitle, 80)}"` : ''}; the step "${str(step.title, 80)}"${step.kind ? ` (${kinds[str(step.kind, 10)] ?? str(step.kind, 10)})` : ''}${l.opened ? ", opened from the Map's level goals" : ''}.`)
  if (step.about) lines.push(`What the step says: ${str(step.about, 1200)}`)
  const key = [step.keyName ? `Key: ${str(step.keyName, 40)}` : step.key ? `Key: ${str(step.key, 40)}` : '', step.backing ? `the backing: ${str(step.backing, 120)}` : '', step.hand ? `hand: ${str(step.hand, 10)}` : '', num(step.tempo) != null ? `the step's tempo ${step.tempo}` : '', step.feel ? str(step.feel, 20) === 'straight' ? 'straight eighths' : 'a shuffle (swung eighths)' : '']
    .filter(Boolean)
    .join('; ')
  if (key) lines.push(`${key}.`)
  if (Array.isArray(step.form) && step.form.length) {
    // The numeral the first time each chord comes: "Dm7 (i) | Dm7 | … | Gm7 (iv)".
    const chords = (step.chords ?? {}) as Record<string, Record<string, unknown>>
    const named = new Set<string>()
    lines.push(`The form, one chorus: ${(step.form as unknown[]).map((c) => {
      const name = String(c)
      const numeral = chords[name]?.numeral
      if (!numeral || named.has(name)) return name
      named.add(name)
      return `${name} (${numeral})`
    }).join(' | ')}.`)
  }
  if (step.scale) lines.push(`Notes allowed on this step: ${str(step.scale, 200)}.`)
  if (step.notes) lines.push(`The run's notes with their fingers: ${str(step.notes, 1500)}.`)
  const phases: Record<string, string> = { intro: "on the step's intro, not started yet", playing: 'playing the step', card: 'reading the card', complete: 'the lesson is complete' }
  const where = [phases[str(l.phase, 20)] ?? '', num(l.tempoNow) != null ? `the knob at ${l.tempoNow}${num(l.countsAt) != null ? ` (counts at ${l.countsAt})` : ''}` : '', l.playing === false ? 'the band paused' : '', num(l.bar) != null && l.phase === 'playing' ? `bar ${l.bar}${num(l.chorus) != null ? `, chorus ${l.chorus}` : ''}` : '']
    .filter(Boolean)
    .join(', ')
  if (where) lines.push(`Now: ${where}.`)
  if (l.coach) lines.push(`The coach's line on screen: "${str(l.coach, 200)}".`)
  if (l.lastChorus) lines.push(`The last chorus: ${str(l.lastChorus, 200)}${l.lastChorusDetail ? ` (${str(l.lastChorusDetail, 120)})` : ''}${num(l.cleanChoruses) != null && num(l.gate) != null && (l.gate as number) > 0 ? `; clean choruses ${l.cleanChoruses} of ${l.gate}` : ''}.`)
  if (l.theme) lines.push(`The session's theme card: ${str(l.theme, 300)}`)
  const imp = l.improv as Record<string, unknown> | undefined
  if (imp) {
    if (num(imp.notes) != null && (imp.notes as number) > 0) {
      lines.push(`Their improv so far: ${imp.notes} notes${num(imp.choruses) != null ? `, ${imp.choruses} whole chorus${imp.choruses === 1 ? '' : 'es'}` : ''}${imp.take ? `, bar by bar (beats 1 to 4.92, lengths in beats):\n${str(imp.take, 12_000)}` : '.'}`)
    } else {
      lines.push("They haven't played a note of the improv yet.")
    }
  }
  return lines
}

/** The context as the teacher reads it. */
export function describe(c: ChatContext): string {
  const lines: string[] = []
  const screen = str(c.screen, 20)
  lines.push(`Screen: ${SCREENS[screen] ?? (screen || 'unknown')}${c.device ? `, on ${c.device === 'mac' ? 'the Mac' : 'the iPhone'}` : ''}.`)
  if (c.where) lines.push(`In one line: ${str(c.where, 160)}.`)
  if (c.level && typeof c.level === 'object') lines.push(...levelLines(c.level as Record<string, unknown>))
  if (c.song && typeof c.song === 'object') lines.push(...songLines(c.song as Record<string, unknown>))
  if (c.lesson && typeof c.lesson === 'object') lines.push(...lessonLines(c.lesson as Record<string, unknown>))
  const p = c.progress as Record<string, unknown> | undefined
  if (p) {
    lines.push(`Their progress: ${[num(p.streak) != null ? `a streak of ${p.streak} day${p.streak === 1 ? '' : 's'}` : '', num(p.xp) != null ? `${p.xp} XP` : '', num(p.levelsCleared) != null ? `${p.levelsCleared} level${p.levelsCleared === 1 ? '' : 's'} cleared on the map` : '', p.practicedToday ? 'practiced today' : 'not yet practiced today'].filter(Boolean).join(', ')}.`)
  }
  const known = new Set(['screen', 'device', 'where', 'level', 'song', 'lesson', 'progress', 'timeZone'])
  const rest = Object.fromEntries(Object.entries(c).filter(([k]) => !known.has(k)))
  if (Object.keys(rest).length) lines.push(`More: ${JSON.stringify(rest).slice(0, 4000)}`)
  return lines.join('\n')
}

// MARK: The teacher

function system(): string {
  return `You are the teacher inside Takt, a piano course for grown-ups ("the conservatory and the club"). A player can open this chat from anywhere in the app, usually in the middle of a task, to ask about what they are playing. Every message carries where they are: the screen, the song or the lesson step with its key, its form, its chords and the notes allowed, what they have played so far, and the level they are on. Answer from that.

Who you are: the teacher everybody wishes they'd had. Warm, direct, specific, a little delighted. Plain words, short sentences, "you". Name notes (D, F, B♭) and name degrees relative to the key they are actually in (in D minor, D is the 1, F the ♭3, A the 5; over the iv chord Gm7 the notes are G B♭ D F). When a question rests on a wrong idea (the key, a chord, a degree), say the right thing kindly in one sentence, then answer what they meant. No jargon you don't unpack in a few words. No emoji. No markdown: no headings, no bold, no tables; a short list only when it really is a list, at most four items, each on its own line starting with "- ". Keep it to what fits a small panel: 60 to 160 words, more only when they ask for more. Use the numbers and names in the context (the bar, the chord, the notes they played) rather than talking in general. End with one concrete thing to try when it fits. Never say "the context" or "the data I was given"; you simply know where they are.

What you know about Takt (answer questions about the app from this; don't invent features):
- Three tabs: Learn (the modules: Blues Progressions A1, the 12-bar blues in C with the left hand; Scales, right and left hand, A minor and C major, pentatonics, modes; Minor Chords, the minor blues in every key; Chord Shapes, sevenths, inversions, voicings; Ear Training: chords, intervals, a daily quiz), Stage (the set list: every song playable at once, take the chords or the melody at a level: Beginner, Easy, Easy+, Medium, Hard, or Adaptive, which climbs as you play clean; the band plays whatever your level leaves out), and Map (the year plan as levels; each level has goals: a scale run clean at a tempo, a song on the Stage at a level for a grade, an improv the teacher reviews; a level clears when every goal is done; Level 1 is the white keys: C major and A minor over two octaves at 72, Blue Lantern II's melody on Medium for an A, an improv on the white keys over Blue Lantern II's band).
- On the Stage the notes fall down a highway onto the keys; a finger number sits on each note; the hand in the corner shows the fingers. Pause (the pause button, or Space on the Mac) shows a card: Keep going, Practice this part, Ask the teacher, Agent mode. Practice: the rail becomes a scrubber (drag to any bar), four bars back, play from here (four clicks, then the band), Call (every note called out, finger then key, until you play it), nothing scored. The tempo knob slows the band (half speed to full); under full speed a run is practice and goes on no board. Grades follow accuracy: a note played inside half a beat counts (Perfect inside 45 ms, Good inside 150 ms, else Early or Late); A is 90%, B 80%, C 65%, S is 97% with the timing clean too. Notes leaning early or late all run is latency: Settings → Input → Timing recalibrates.
- A song's card has Play, Board, Practice (held at bar 1), Call, and Agent. Agent mode is where a player asks for their own version of a track (fewer notes on Medium, a solo chorus); it changes charts. This chat never changes charts: if they ask for that, send them to Agent (the Agent button on the song's card, or Agent mode on the pause card).
- Lessons: a step has an intro with Start, Show me plays it for you with the hand, the coach line says what to do, a clean chorus is every expected note in time with nothing extra; the knob sets the tempo and the step counts at its own; the gate is so many clean choruses. An improv step (a free step): play anything over the band, the footer counts your notes, Send it to the teacher gets a review (a headline, notes, one idea made from your take) and Try my version plays the idea on the highway. XP comes from lessons, songs, reviewed takes, your version, and level goals.

The music in Takt (the real catalog; recommend from it by name, and say where to find it):
${libraryText()}
When they ask what to play something over (a scale, a riff, the minor pentatonic), what fits a key, what is slow enough, or what to try next, pick from these: a Stage song by its title (the Stage tab, its card; All tracks for the ones under it), or a lesson band by naming the module whose steps play over it. Say why it fits (its key, its chords, its tempo). Don't invent songs or bands that aren't listed.

Music you teach from: the 12-bar blues (I IV V; in the minor blues i iv V, often with a VI before the V), chord tones and where to land on beat 1, the minor pentatonic and the blues scale, the natural minor and the major scale, what to play over the iv (its own chord tones; the ♭3 of the key is the ♭7 of the iv), over the V (the leading tone, the 3rd of V, which pulls home; a dominant seventh's ♭7), space and repetition in a solo, call and answer in two-bar phrases, fingering (the thumb goes under going up, a finger crosses over coming down, stay in one hand position when you can, move the whole hand on a rest or a long note), the shuffle versus straight eighths, and how to practise (slow it down with the knob, loop four bars in practice, play it with Call, land on beat 1 first and fill in later).

Your memory: with every question you also get what they did in their last two sessions (the one under way included): their Stage runs with the grades, every improv take they sent with the review they got back (the headline, the notes, the idea), what they asked for in Agent mode, and what they asked you before. When they ask about a jam they sent, the feedback they got, or how a run went, answer from that by name and number ("the take you sent at 2:30, 46 notes over Blue Lantern II: I said …"). Further back than two sessions you don't remember, and you say so plainly if asked.

Rules: Don't claim to hear anything the transcript doesn't show. If there is no song or lesson in the context (a menu), answer generally and say where in the app to go. If a question is about something else entirely, answer briefly and come back to the piano.`
}

function finalUser(r: ChatRequest, memory: string): string {
  const lately = memory ? `What they did lately (their last two sessions, times in their own zone):\n${memory}\n\n` : 'What they did lately: nothing on this account yet.\n\n'
  return `${lately}Where the player is right now:\n${describe(r.context)}\n\nThe player asks:\n${r.message}`
}

function messagesFor(r: ChatRequest, memory: string): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = []
  // The thread so far as plain turns; the context rides with the question being asked, since
  // the player has moved on since the earlier ones.
  for (const t of r.thread) {
    const role = t.role === 'user' ? 'user' : 'assistant'
    const text = t.text.trim()
    if (!text) continue
    if (out.length && out[out.length - 1].role === role) {
      const last = out[out.length - 1]
      last.content = `${typeof last.content === 'string' ? last.content : ''}\n\n${text}`
    } else {
      out.push({ role, content: text })
    }
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: '(the thread starts here)' })
  if (out[out.length - 1].role === 'user') out.push({ role: 'assistant', content: '(no answer was kept)' })
  out.push({ role: 'user', content: [{ type: 'text', text: finalUser(r, memory) }] })
  return out
}

/** Answers one question: streams a status while the teacher thinks and the words as they come,
 *  then the whole reply (saved, with its row id). The memory is read for the account unless
 *  one is given (the checks). Throws on a failure the caller reports. */
export async function runChat(r: ChatRequest, userId: string | null, emit: (e: ChatEvent) => void, memory?: string): Promise<string> {
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const anthropic = new AnthropicSDK({ apiKey })
  const tz = typeof r.context.timeZone === 'string' ? r.context.timeZone : 'UTC'
  const lately = memory ?? (userId ? await recentMemory(userId, tz) : '')
  const stream = anthropic.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 12000,
    system: [{ type: 'text', text: system(), cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'medium' },
    messages: messagesFor(r, lately),
  })
  let saidThinking = false
  let streamed = ''
  for await (const ev of stream) {
    if (ev.type === 'content_block_start' && ev.content_block.type === 'thinking' && !saidThinking) {
      saidThinking = true
      emit({ type: 'status', text: 'Thinking it over' })
    } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
      streamed += ev.delta.text
      emit({ type: 'delta', text: ev.delta.text })
    }
  }
  const res = await stream.finalMessage()
  if (res.stop_reason === 'refusal') throw new Error("the teacher can't take that one")
  if (res.stop_reason === 'max_tokens') throw new Error('the teacher ran out of room mid-answer; ask it again, shorter')
  const reply = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim() || streamed.trim()
  if (!reply) throw new Error('the teacher had nothing to say')
  let id: string | null = null
  if (userId) {
    const { data, error } = await f2Supabase()
      .from('takt_chat')
      .insert({ user_id: userId, where_line: str(r.context.where, 200), context: r.context, question: r.message, answer: reply, model: CHAT_MODEL })
      .select('id')
      .single()
    if (error) console.error(`[takt/chat] save failed: ${error.message}`)
    id = (data as { id: string } | null)?.id ?? null
  }
  emit({ type: 'reply', text: reply, id })
  return reply
}
