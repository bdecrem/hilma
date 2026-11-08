// The improv teacher (Takt, 2026-11-04). The app records a take over a backing track (a Stage
// song's band, or the drums alone) and sends it here; Opus 5.5 listens to it as a written
// transcript, bar by bar against the chords, and answers with a `review`: a headline, two or
// three warm and specific notes, and one idea — a short phrase made from what the player did,
// a little better — that the app turns into a step they can play over the same backing.
// Everything the app plays is validated here first (the grid, the range, the notes allowed),
// so an idea that would read wrong in the app is sent back to the model with the reasons.
// See apps/takt/IMPROV.md.

import type Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from '@/lib/f2/supabase'
import { libraryText } from './library'
import { handFigures, handLine } from './fingering'
import { handBudget } from './leveling'

export const IMPROV_MODEL = 'claude-opus-5-5'

export type TakeNote = { t: number; n: number; v: number; len: number }
/** Ticks from the downbeat the take starts on (bar 1, beat 1 of its first chorus). */
export type Take = { tempo: number; ticksPerBeat: number; beatsPerBar: number; bars: number; notes: TakeNote[] }
export type Backing = {
  title: string
  style: string
  key: string
  feel: 'straight' | 'shuffle'
  /** The chord of every bar of one chorus; the take repeats it. */
  form: string[]
  /** Pitch classes the level or jam asks for (0 = C); null: any note. */
  scale: number[] | null
  scaleName: string
}
/** `level`: the map level the improv is a goal of (LEVELING.md: the hand budget of the idea and
 *  the whole track), 1 for a jam under a lesson or an older app. */
export type ImprovContext = { where: 'level' | 'jam'; title: string; about: string; hand: 'right' | 'left'; device: string; level: number }
export type IdeaNote = { t: number; n: number; len: number; f: number }
export type Idea = { title: string; why: string; bars: number; notes: IdeaNote[] }
export type Review = { headline: string; notes: string[]; idea: Idea }
export type ImprovRequest = { take: Take; backing: Backing; context: ImprovContext }
export type ImprovEvent = { type: 'status'; text: string } | { type: 'review'; review: Review; id: string | null }

export const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
export const noteName = (n: number) => `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`

// MARK: The request

const num = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '')

/** The app's body, checked; a string is the error to send back. */
export function parseRequest(body: unknown): ImprovRequest | string {
  if (!body || typeof body !== 'object') return 'JSON body required.'
  const b = body as Record<string, unknown>
  const t = b.take as Record<string, unknown> | undefined
  const k = b.backing as Record<string, unknown> | undefined
  const c = (b.context ?? {}) as Record<string, unknown>
  if (!t || !k) return 'take and backing required.'
  if (!num(t.tempo, 30, 240) || t.ticksPerBeat !== 12 || t.beatsPerBar !== 4 || !num(t.bars, 1, 400)) return 'take: tempo, 12 ticks a beat, 4 beats a bar, bars.'
  if (!Array.isArray(t.notes) || t.notes.length > 4000) return 'take: notes (at most 4000).'
  const notes: TakeNote[] = []
  for (const n of t.notes as Record<string, unknown>[]) {
    if (!n || !num(n.t, 0, (t.bars as number) * 48 + 48) || !num(n.n, 0, 127) || !num(n.len, 0, 100000)) return 'take: a note is not { t, n, v, len }.'
    notes.push({ t: Math.round(n.t as number), n: Math.round(n.n as number), v: num(n.v, 0, 1) ? (n.v as number) : 0.7, len: Math.max(1, Math.round(n.len as number)) })
  }
  notes.sort((a, b) => a.t - b.t || a.n - b.n)
  if (!Array.isArray(k.form) || !k.form.length || k.form.length > 64 || !k.form.every((x) => typeof x === 'string')) return 'backing: form (the chord of every bar).'
  let scale: number[] | null = null
  if (k.scale != null) {
    if (!Array.isArray(k.scale) || !k.scale.length || !k.scale.every((x) => Number.isInteger(x) && x >= 0 && x < 12)) return 'backing: scale (pitch classes 0–11) or null.'
    scale = [...new Set(k.scale as number[])].sort((a, b) => a - b)
  }
  return {
    take: { tempo: t.tempo as number, ticksPerBeat: 12, beatsPerBar: 4, bars: Math.round(t.bars as number), notes },
    backing: {
      title: str(k.title, 80) || 'the backing track',
      style: str(k.style, 80),
      key: str(k.key, 40),
      feel: k.feel === 'straight' ? 'straight' : 'shuffle',
      form: (k.form as string[]).map((x) => x.slice(0, 12)),
      scale,
      scaleName: str(k.scaleName, 80),
    },
    context: {
      where: c.where === 'level' ? 'level' : 'jam',
      title: str(c.title, 120),
      about: str(c.about, 1200),
      hand: c.hand === 'left' ? 'left' : 'right',
      device: str(c.device, 20),
      level: num(c.level, 1, 60) ? Math.round(c.level as number) : 1,
    },
  }
}

// MARK: Reading the take

export type TakeStats = { notes: number; bars: number; choruses: number; inScale: number; low: number | null; high: number | null; busiestBar: number | null }

export function stats(r: ImprovRequest): TakeStats {
  const { take, backing } = r
  const inScale = backing.scale ? take.notes.filter((n) => backing.scale!.includes(((n.n % 12) + 12) % 12)).length : take.notes.length
  const perBar = new Map<number, number>()
  for (const n of take.notes) perBar.set(Math.floor(n.t / 48), (perBar.get(Math.floor(n.t / 48)) ?? 0) + 1)
  const busiest = [...perBar.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    notes: take.notes.length,
    bars: take.bars,
    choruses: take.bars / backing.form.length,
    inScale: take.notes.length ? inScale / take.notes.length : 1,
    low: take.notes.length ? Math.min(...take.notes.map((n) => n.n)) : null,
    high: take.notes.length ? Math.max(...take.notes.map((n) => n.n)) : null,
    busiestBar: busiest ? busiest[0] + 1 : null,
  }
}

const beatLabel = (tickInBar: number) => {
  const b = tickInBar / 12 + 1
  return Number.isInteger(b) ? `${b}` : b.toFixed(2).replace(/0$/, '')
}
const beatsLabel = (ticks: number) => {
  const b = ticks / 12
  return Number.isInteger(b) ? `${b}` : b.toFixed(2).replace(/0$/, '')
}

/** The take as the model reads it: one line a bar, its chord, every note with its beat (1 to
 *  4.92), its length in beats and how hard it was played. */
export function transcript(r: ImprovRequest): string {
  const { take, backing } = r
  const lines: string[] = []
  for (let bar = 0; bar < take.bars; bar++) {
    const chord = backing.form[bar % backing.form.length]
    const inBar = take.notes.filter((n) => Math.floor(n.t / 48) === bar)
    const head = `Bar ${bar + 1}${bar % backing.form.length === 0 ? ` (chorus ${bar / backing.form.length + 1})` : ''}, ${chord}:`
    if (!inBar.length) {
      lines.push(`${head} rest`)
      continue
    }
    const out = inBar.map((n) => `${noteName(n.n)} on ${beatLabel(n.t % 48)} for ${beatsLabel(n.len)}${n.v >= 0.8 ? ' (loud)' : n.v <= 0.35 ? ' (soft)' : ''}`)
    lines.push(`${head} ${out.join(', ')}`)
  }
  return lines.join('\n')
}

// MARK: The idea

/** The model's idea in beats, checked and turned into ticks; a list of problems otherwise. */
export function checkIdea(raw: unknown, r: ImprovRequest): { idea: Idea } | { problems: string[] } {
  const problems: string[] = []
  const x = (raw ?? {}) as Record<string, unknown>
  const bars = x.bars
  const formBars = r.backing.form.length
  if (!(bars === 1 || bars === 2 || bars === 4) || formBars % bars !== 0) problems.push(`bars must be 1, 2 or 4 and divide the ${formBars}-bar form`)
  const title = str(x.title, 60).trim()
  const why = str(x.why, 400).trim()
  if (!title) problems.push('the idea needs a title')
  if (!why) problems.push('the idea needs a why')
  const list = Array.isArray(x.notes) ? (x.notes as Record<string, unknown>[]) : []
  if (list.length < 3 || list.length > 16) problems.push(`3 to 16 notes (got ${list.length})`)
  const s = stats(r)
  const low = Math.max(36, (s.low ?? 55) - 7)
  const high = Math.min(96, (s.high ?? 79) + 7)
  const span = (typeof bars === 'number' ? bars : 2) * 48
  const notes: IdeaNote[] = []
  for (const [i, n] of list.entries()) {
    const at = `note ${i + 1}`
    if (!n || typeof n !== 'object') {
      problems.push(`${at} is not an object`)
      continue
    }
    const beat = n.beat, note = n.note, beats = n.beats, finger = n.finger
    if (typeof beat !== 'number' || typeof note !== 'number' || typeof beats !== 'number') {
      problems.push(`${at} needs beat, note and beats as numbers`)
      continue
    }
    const t = Math.round(beat * 12)
    if (Math.abs(beat * 12 - t) > 0.05) problems.push(`${at}: beat ${beat} is off the grid (eighths, triplets or sixteenths)`)
    if (t < 0 || t >= span) problems.push(`${at}: beat ${beat} is outside the idea's ${span / 48} bar(s)`)
    const len = Math.max(1, Math.round(beats * 12))
    if (t + len > span) problems.push(`${at}: it rings past the end of the idea (beat ${beat} for ${beats})`)
    if (!Number.isInteger(note) || note < low || note > high) problems.push(`${at}: ${note} is out of reach; keep it between ${noteName(low)} (${low}) and ${noteName(high)} (${high}), near where they played`)
    if (r.backing.scale && !r.backing.scale.includes(((note % 12) + 12) % 12)) problems.push(`${at}: ${noteName(note)} is not one of ${r.backing.scaleName || 'the notes allowed'}`)
    const f = typeof finger === 'number' && Number.isInteger(finger) && finger >= 1 && finger <= 5 ? finger : 0
    if (!f) problems.push(`${at}: finger must be 1 to 5`)
    notes.push({ t, n: note, len, f })
  }
  notes.sort((a, b) => a.t - b.t || a.n - b.n)
  for (let i = 1; i < notes.length; i++) if (notes[i].t === notes[i - 1].t && notes[i].n === notes[i - 1].n) problems.push(`two ${noteName(notes[i].n)}s on the same beat`)
  const byTick = new Map<number, number>()
  for (const n of notes) byTick.set(n.t, (byTick.get(n.t) ?? 0) + 1)
  if ([...byTick.values()].some((c) => c > 2)) problems.push('at most two notes at once: it is a line, not chords')
  if (problems.length) return { problems }
  // One hand position (LEVELING.md §3): fingered as the app will finger it, the idea never
  // moves the hand and spans a seventh at most; the fingers the app shows are the planner's.
  const line = notes.filter((n, i) => i === 0 || n.t !== notes[i - 1].t)
  const hand = handFigures(line, r.context.hand === 'right', 12)
  if (hand.moves.length || hand.span > IDEA_SPAN) {
    const low = Math.min(...notes.map((n) => n.n)), high = Math.max(...notes.map((n) => n.n))
    problems.push(`the idea must sit in one hand position (five fingers over five or six scale keys, no thumb-under, nothing wider than a seventh): this one is ${noteName(low)} to ${noteName(high)}, ${handLine(hand)}. Keep it where their hand already sits`)
    return { problems }
  }
  const byIndex = new Map(line.map((n, i) => [n, hand.fingers[i]]))
  for (const n of notes) n.f = byIndex.get(n) ?? n.f
  return { idea: { title, why, bars: bars as number, notes } }
}

/** The widest an idea may be and still sit in one hand position: a minor seventh (the thumb on
 *  F, the pinky stretched to D). */
export const IDEA_SPAN = 10

// MARK: The teacher

function system(): string {
  return `You are the improv teacher inside Takt, a piano course for grown-ups. A student just improvised over a backing track and you are hearing it as a transcript: every bar, its chord, every note they played with its beat, its length and its loudness.

Who you are: the teacher everybody wishes they'd had. Warm, generous, specific, a little delighted. You listen for what is good and you name it exactly ("the way you sat on the D at the top of bar 5 and let it ring", "you answered your own phrase in bar 7"). You never say "wrong", "mistake", "but", "however" or "unfortunately"; growth is always "next, try…". You talk to them as "you", short sentences, plain words, no jargon you don't explain in three words. No emoji.

What you send back, through the review tool (always call it, once; it is the only thing the app shows):
- headline: one line, at most 60 characters, the thing you loved most.
- notes: two or three sentences, each its own item, each pointing at a bar and a note. The first two celebrate something specific they did. The last may be one gentle "next, try…" that the idea then shows.
- idea: ONE phrase for them to play next. It is THEIR idea, a little better: take their best moment (a motif, a rhythm, a pair of notes they liked, how they landed somewhere) and keep its notes and its shape, then improve one or two things a good musician would: land on a chord tone on beat 1, repeat it and vary the end, leave space so it breathes, put the rhythm on the beat they almost hit, step instead of leap. Say in "why" which bar of theirs it comes from and what you changed.

The idea's rules (the app checks them and sends it back if one is broken):
- bars: 1, 2 or 4. The app loops it over the whole form, every chord, so it must sound good over every chord in it (in a blues, a phrase on the minor pentatonic or the blues scale does). A 2-bar idea with the second bar mostly rest (a call that leaves room) is often the best.
- 3 to 16 notes. beat is counted in beats from the start of the idea, starting at 0 (0 = bar 1 beat 1, 4 = bar 2 beat 1), on the grid: whole beats, halves (0.5), triplets (0.333, 0.667) or sixteenths (0.25). beats is the length in beats. Nothing rings past the end of the idea.
- note is a MIDI number (60 = middle C). Stay near where they played. If the transcript lists notes allowed, use only those.
- ONE HAND POSITION. The idea sits where their hand already sits: five fingers over five or six neighbouring keys of the scale, nothing wider than a seventh, no thumb-under, no jump (the app fingers it by hand position and sends it back if the hand would have to move). A beginner's whole difficulty is knowing where their hand is; an idea that moves it is not an idea they can play tonight.
- finger 1 to 5 for every note, for the hand given (right: 1 = thumb, 5 = pinky, low notes on the thumb side), as the hand lies in that position (the app re-fingers it the same way).
- It should be playable by this student today: about as fast as their own playing, not faster. Simpler beats busier.
- title: at most 40 characters, names it ("Your bar 5 lick, landing on D").

The music in Takt, for when a note points them somewhere next (another backing this idea would also sit on, by its name and where it is: a Stage song, or the module whose band it is; only ones listed here):
${libraryText()}`
}

function userMessage(r: ImprovRequest): string {
  const s = stats(r)
  const allowed = r.backing.scale
    ? `Notes allowed: ${r.backing.scaleName ? `${r.backing.scaleName}, ` : ''}${r.backing.scale.map((p) => NAMES[p]).join(' ')} (any octave).`
    : 'Notes allowed: any (this is a free jam; the backing\'s key is the guide).'
  const b = handBudget(r.context.level)
  return `Where: ${r.context.where === 'level' ? `a Level ${r.context.level} goal on the map` : 'a jam under a lesson'}: "${r.context.title}".${r.context.about ? `\nWhat they were working on: ${r.context.about}` : ''}
The student is on Level ${b.level}: an idea for them sits in one hand position (see the rules).
Backing: ${r.backing.title}${r.backing.style ? `, ${r.backing.style}` : ''}${r.backing.key ? ` in ${r.backing.key}` : ''}, ${r.take.tempo} bpm, ${r.backing.feel === 'straight' ? 'straight eighths' : 'a shuffle (swung eighths)'}.
The form, one chorus: ${r.backing.form.join(' | ')}.
${allowed}
Hand: ${r.context.hand}.
The take: ${s.bars} bars (${Number.isInteger(s.choruses) ? s.choruses : s.choruses.toFixed(1)} choruses), ${s.notes} notes, from ${s.low != null ? noteName(s.low) : '-'} to ${s.high != null ? noteName(s.high) : '-'}${r.backing.scale ? `, ${Math.round(s.inScale * 100)}% of them on the notes allowed` : ''}.

${transcript(r)}`
}

const REVIEW_TOOL = {
  name: 'review',
  description: 'Send the student your review of the take: the headline, two or three notes, and one idea for them to play next.',
  input_schema: {
    type: 'object' as const,
    properties: {
      headline: { type: 'string', description: 'At most 60 characters: the thing you loved most.' },
      notes: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3, description: 'Two or three sentences, each pointing at a bar and a note.' },
      idea: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'At most 40 characters.' },
          why: { type: 'string', description: 'One or two sentences: which bar of theirs it comes from and what you changed.' },
          bars: { type: 'integer', enum: [1, 2, 4] },
          notes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                beat: { type: 'number', description: 'Beats from the start of the idea, from 0.' },
                note: { type: 'integer', description: 'MIDI note, 60 = middle C.' },
                beats: { type: 'number', description: 'Length in beats.' },
                finger: { type: 'integer', minimum: 1, maximum: 5 },
              },
              required: ['beat', 'note', 'beats', 'finger'],
            },
          },
        },
        required: ['title', 'why', 'bars', 'notes'],
      },
    },
    required: ['headline', 'notes', 'idea'],
  },
}

/** Reviews a take: streams status lines, then the review (saved, with its row id). Throws on a
 *  failure the caller reports. */
export async function runImprovReview(r: ImprovRequest, userId: string | null, emit: (e: ImprovEvent) => void): Promise<Review> {
  const s = stats(r)
  emit({ type: 'status', text: `Listening to your take: ${s.bars} bars, ${s.notes} notes` })
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const anthropic = new AnthropicSDK({ apiKey })
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: [{ type: 'text', text: userMessage(r) }] }]
  let review: Review | null = null
  for (let attempt = 0; attempt < 3 && !review; attempt++) {
    const stream = anthropic.messages.stream({
      model: IMPROV_MODEL,
      max_tokens: 16000,
      system: system(),
      tools: [REVIEW_TOOL] as Anthropic.Tool[],
      messages,
    })
    let saidThinking = false, saidWriting = false
    for await (const ev of stream) {
      if (ev.type !== 'content_block_start') continue
      if (ev.content_block.type === 'thinking' && !saidThinking && attempt === 0) {
        saidThinking = true
        emit({ type: 'status', text: 'Finding your best moment' })
      } else if (ev.content_block.type === 'tool_use' && !saidWriting) {
        saidWriting = true
        emit({ type: 'status', text: attempt === 0 ? 'Writing your notes and an idea' : 'Fixing the idea' })
      }
    }
    const res = await stream.finalMessage()
    messages.push({ role: 'assistant', content: res.content })
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'review')
    if (!call) {
      if (res.stop_reason === 'max_tokens') throw new Error('the teacher ran out of room mid-answer')
      messages.push({ role: 'user', content: [{ type: 'text', text: 'Send it with the review tool, please: it is the only thing the student sees.' }] })
      continue
    }
    const input = call.input as Record<string, unknown>
    const headline = str(input.headline, 80).trim()
    const notes = Array.isArray(input.notes) ? (input.notes as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 3).map((x) => x.trim()) : []
    const checked = checkIdea(input.idea, r)
    const problems = 'problems' in checked ? [...checked.problems] : []
    if (!headline) problems.unshift('the headline is empty')
    if (notes.length < 2) problems.unshift('two or three notes, please')
    if (!problems.length && 'idea' in checked) {
      review = { headline, notes, idea: checked.idea }
      break
    }
    console.warn(`[takt/improv] review sent back (attempt ${attempt + 1}): ${problems.join('; ')}`)
    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `The app can't play that yet: ${problems.join('; ')}. Fix those and call review again with the whole review.` }],
    })
  }
  if (!review) throw new Error('the teacher could not write an idea the app can play')
  let id: string | null = null
  if (userId) {
    const { data, error } = await f2Supabase()
      .from('takt_improv')
      .insert({ user_id: userId, take: r.take, backing: r.backing, context: r.context, review, model: IMPROV_MODEL })
      .select('id')
      .single()
    if (error) console.error(`[takt/improv] save failed: ${error.message}`)
    id = (data as { id: string } | null)?.id ?? null
  }
  emit({ type: 'review', review, id })
  return review
}
