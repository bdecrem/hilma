// Agent mode's loop: one turn of the conversation on a mod. Opus runs with the song tools
// (mod-tools.ts) until it answers in plain text; every tool call is streamed to the app as a
// working step, the draft is saved when a tool changed it, and the reply carries the figures.
// Patterned on the dodo agent (src/lib/f2/agent.ts, handleDodoCommand), narrower in scope:
// the melody and chords charts of one song.

import type Anthropic from '@anthropic-ai/sdk'
import { type Charting, type SongOverride, looksLikeCharting, figures, tiersOf } from './charting'
import { type Draft, TOOLS, describeCall, readSong, runTool } from './mod-tools'
import { type ModRow, type ModVersion, getVersion, listVersions, recordVersion, saveMod } from './mods'
import { type PartKey, partKeys } from './songfile'

export type AgentEvent =
  | { type: 'status'; text: string }
  | { type: 'reply'; text: string }
  | { type: 'error'; text: string }

/** What the app sends with every message: its charting.json (the ladders the song is cut by),
 *  its own measurement of the mod's ladder (a cross-check on the port), and where the player
 *  is when Agent mode opens from a run. */
export type TurnContext = {
  charting: Charting
  figures?: Partial<Record<PartKey, number[]>>
  position?: { part?: string; difficulty?: string; level?: number; bar?: number; section?: string }
  device?: string
}

export function parseContext(x: unknown): TurnContext | string {
  if (!x || typeof x !== 'object') return 'context required: { charting, figures?, position? }'
  const c = x as Record<string, unknown>
  if (!looksLikeCharting(c.charting)) return 'context.charting must be the app’s charting.json'
  const out: TurnContext = { charting: c.charting }
  if (c.figures && typeof c.figures === 'object') out.figures = c.figures as TurnContext['figures']
  if (c.position && typeof c.position === 'object') out.position = c.position as TurnContext['position']
  if (typeof c.device === 'string') out.device = c.device
  return out
}

const MAX_TURNS = 24
/** The most bars one write_notes call should hold: a whole part in one call can overrun a response. */
export const WRITE_BARS = 8

function system(mod: ModRow): string {
  return `You are the Stage agent in Takt, a piano course and rhythm game for grown-ups ("the conservatory and the club"). On the Stage a song's notes fall down a highway onto the keys and the player plays the chords or the melody of a track with the band at one of five levels: Beginner, Easy, Medium, Hard, or Adaptive, which climbs the ladder as they play clean. Agent mode is where the player asks for their own version of a track: you are working on "${mod.title}", their own copy of "${mod.base_title}". The original is untouched; this one is theirs, and whatever you change is what they will play.

THE FORMAT. Time is in ticks: 12 a beat, 48 a bar; bars are 1-based in the tools. A part (chords or melody) is the WHOLE part as the record plays it, every note with a weight: lv 1 = the hits the part stands on (one anchor a bar on a melody, the downbeat on a comping part), lv 2 = what makes it groove (the 3, the answers, the backbeat chords), lv 3 = pushes, pickups, ornaments, fills, runs. Chord notes carry a role (root, third, fifth, seventh, sixth, ninth). Notes may carry a finger (1 thumb … 5). The band's own channel for a part (keys for the chords, horns for the melody) mirrors the part: write_notes keeps it in step, so the record plays what you wrote when the player takes the other part.

HOW LEVELS ARE MADE. The app cuts every level from the whole part by a ladder of tiers (charting.json, sent to you as JSON). Each tier says how many chord notes to keep, the heaviest weight it plays (hits), the least seconds between two onsets (gap), the longest silence before it borrows a lighter hit (space), and the phrase (bars) in which every key the line plays must appear. Every tier is the one below plus more. Beginner/Easy/Medium/Hard each name a tier; a song may name its own per difficulty (set_levels), and Adaptive walks the tiers one at a time. The record fills whatever a level leaves out, so a thin level still sounds like the song.

THE RULES OF A GOOD CHART (what the makers learned, keep to them):
1. Difficulty is onsets a second, and "half as hard" means half that figure. Read the level's figure (read_song / measure), find the rung nearest the target, and say which rung that is and what it plays.
2. Easy ≈ the weight-1 notes alone: on a melody about one anchor a bar plus the few keys they miss; on a comping part two hits a bar.
3. A ladder needs a rung near every target. If no tier lands near what was asked (within about 20%), don't fake it with a knob: change the part's weights so the rung exists (set_weights: push groove hits to 3 to thin the middle; pull fills to 2 to fatten Hard), or rewrite the passage with fewer or more notes (write_notes). Then measure, and name the nearest rungs on both sides when the ask can't be met exactly.
4. No rung more than twice the one below (Adaptive walks them; a doubling is a wall). Check the ladder after a change.
5. A level is still the line: every key of a phrase at every level, never one key with a rhythm; no stub shorter than a beat on Beginner.
6. The speed never changes a level's difficulty: a level is easier because it asks for fewer notes, never because the band slows down. Change the tempo only when asked for a different speed.
7. Write the weights for the ladder, then measure: one anchor a bar at weight 1 for a melody; downbeats 1, groove 2, pushes 3 for a comping part. Read the figures before you answer.

WRITING MUSIC. When asked for new material (a solo, a fill, a harder line, a funkier comp): read the chord of every bar (read_song) and the existing line (read_notes) so the new passage speaks the song's language; stay in the key over the changes (blues: the blues scale and the chord tones, the b3 and b7 and the 6th; a shuffle feels in long-short eighths: 8 + 4 ticks); keep a melody within about two octaves and near the part's range; give it anchors (lv 1, one a bar, on strong beats, long enough to hold) so Beginner and Easy still have a line, groove notes lv 2, and make the hard stuff lv 3 (eighth-note runs, triplet pickups, grace notes 4 ticks before the beat). Fingers on a melody are the app's to set (it fingers each level's line by hand position); on a chords part give each note of a voicing its finger, the pinky low. A "super hard" solo can be dense (eighths and faster) but stays playable: no interval jumps a hand can't make at tempo, nothing under 4 ticks. To thicken hits you already have (two-note chords on Easy, a fifth over the roots, octave doubling), use add_interval: one call for the whole song, filtered by weight (max_lv) and size (max_notes), instead of rewriting the notes. Write a passage in write_notes calls of at most 8 bars each (a range at a time, never note by note; a whole part in one call overruns your response). To add a solo chorus: add_bars (copy the last chorus so the band keeps playing), write_notes over the copy, set_sections to name it. On the chords part every note needs a role, and a chord hit is the notes at one bar:tick.

HOW TO WORK. The song as it stands (and every ladder figure) is in the message; call read_notes before rewriting a passage. Do the thing — don't ask permission for what was plainly asked; ask only when the request forks in a way only the player can decide, and then ask briefly (their next message continues the thread). After any change, write the card's line (set_title with line: one sentence saying what this version is). End with a short plain-text report, no markdown and no headings: what changed and the figures before → after for the levels that matter (e.g. "Medium on the melody: 1.09 → 0.55 a second, level 3 of 7: the tune's main notes"), what to listen for, and anything that still needs them. Keep it to a few sentences; it is read in a small panel on a phone. If the message is just a question, answer it from the figures without changing anything.`
}

function firstUser(mod: ModRow, draft: Draft, ctx: TurnContext, message: string, history: string, versions: ModVersion[]): string {
  const pos = ctx.position
  const where = pos
    ? `Where the player is: ${[pos.part, pos.difficulty, pos.level != null ? `level ${pos.level}` : null, pos.bar != null ? `bar ${pos.bar}` : null, pos.section].filter(Boolean).join(' · ')} (they opened Agent mode from the pause menu there).`
    : 'Opened from the set list.'
  const past = versions.map((v) => `v${v.version}${v.version === mod.version ? ' (now)' : ''}: ${v.ask}${v.line ? ` — ${v.line}` : ''}`).join('\n')
  return `charting.json (the ladders every song is cut by):
${JSON.stringify(ctx.charting)}

The song as it stands (v${mod.version}):
${readSong(draft, ctx.charting)}

Versions so far (roll_back takes one of these):
${past || '(none yet)'}

${where}
${history ? `\nEarlier in this thread:\n${history}\n` : ''}
The player's message:
${message}`
}

/** One turn: runs the agent, streams steps, saves the mod. Returns the reply. Throws on a
 *  failure the caller should report. */
export async function runModTurn(mod: ModRow, message: string, ctx: TurnContext, emit: (e: AgentEvent) => void): Promise<string> {
  const draft: Draft = { song: JSON.parse(JSON.stringify(mod.song)), override: mod.charting ? JSON.parse(JSON.stringify(mod.charting)) : null, title: mod.title, mutated: false }
  crossCheck(mod, draft, ctx)

  const history = mod.messages
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'Player' : 'Agent'}: ${m.text}`)
    .join('\n')
    .slice(0, 20_000)

  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const anthropic = new AnthropicSDK({ apiKey })
  const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })) as Anthropic.Tool[]
  let versions = await listVersions(mod.id)
  if (!versions.length) {
    // A mod from before the history (schema 004): its current state is the first entry.
    await recordVersion(mod, mod.version === 0 ? `The original: ${mod.base_title}` : 'As it was before the history')
    versions = await listVersions(mod.id)
  }
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: [{ type: 'text', text: firstUser(mod, draft, ctx, message, history, versions), cache_control: { type: 'ephemeral' } }] },
  ]
  const steps: string[] = []
  let reply = ''
  let cutOffs = 0
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await anthropic.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 20000,
      system: [{ type: 'text', text: system(mod), cache_control: { type: 'ephemeral' } }],
      tools,
      messages,
    })
    if (res.stop_reason === 'max_tokens' && cutOffs < 2) {
      // Cut off mid-answer (usually one write_notes holding a whole part): drop the partial
      // response and ask for the same change in smaller pieces.
      cutOffs++
      console.warn(`[takt/mod-agent] response hit max_tokens (turn ${turn}, cut-off ${cutOffs})`)
      messages.push({ role: 'assistant', content: [{ type: 'text', text: '(my last response was cut off at the length limit)' }] })
      messages.push({ role: 'user', content: [{ type: 'text', text: `Your last response was cut off at the length limit and discarded; none of it was applied. Make the change in smaller steps: at most ${WRITE_BARS} bars per write_notes call, one call per response, and keep your thinking short.` }] })
      continue
    }
    messages.push({ role: 'assistant', content: res.content })
    if (res.stop_reason === 'pause_turn') continue
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || toolUses.length === 0) {
      if (res.stop_reason === 'refusal') throw new Error('the agent declined that request')
      if (res.stop_reason === 'max_tokens') throw new Error('the agent ran out of room mid-answer — ask for a smaller change')
      let lastNonText = -1
      res.content.forEach((b, i) => {
        if (b.type !== 'text') lastNonText = i
      })
      reply = res.content
        .slice(lastNonText + 1)
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim()
      break
    }
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const input = (tu.input ?? {}) as Record<string, unknown>
      const step = describeCall(draft, tu.name, input)
      steps.push(step)
      emit({ type: 'status', text: step })
      const out = tu.name === 'roll_back' ? await rollBackDraft(mod, draft, ctx, input) : runTool(draft, ctx.charting, tu.name, input)
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out })
    }
    messages.push({ role: 'user', content: results })
  }
  if (!reply) reply = 'The agent ran out of turns mid-task — tell it to carry on.'

  const now = new Date().toISOString()
  if (draft.mutated) {
    mod.song = draft.song
    mod.charting = draft.override
    mod.title = draft.title
    mod.song.song.title = draft.title
    mod.version += 1
  }
  mod.messages = [...mod.messages, { role: 'user', text: message, at: now }, { role: 'agent', text: reply, at: now, steps }]
  await saveMod(mod, draft.mutated ? message : undefined)
  emit({ type: 'reply', text: reply })
  return reply
}

/** The roll_back tool: an earlier version's content into the draft (saved as the next
 *  version with the turn, like any other change). */
async function rollBackDraft(mod: ModRow, draft: Draft, ctx: TurnContext, input: Record<string, unknown>): Promise<string> {
  const version = input.version
  if (typeof version !== 'number' || !Number.isInteger(version)) return 'Error: version must be a whole number'
  const v = await getVersion(mod.id, version)
  if (!v) return `Error: there is no v${version}`
  draft.song = JSON.parse(JSON.stringify(v.song))
  draft.override = v.charting ? JSON.parse(JSON.stringify(v.charting)) : null
  draft.title = v.title
  draft.mutated = true
  return `The draft is v${version} again (it will be saved as v${mod.version + 1}).\n${readSong(draft, ctx.charting)}`
}

/** The app measured the ladder with its own charter; the port must agree. A mismatch is logged
 *  (never shown): it would mean charting.ts drifted from Charting.swift. */
function crossCheck(mod: ModRow, draft: Draft, ctx: TurnContext) {
  if (!ctx.figures) return
  for (const k of partKeys(draft.song)) {
    const theirs = ctx.figures[k]
    if (!theirs) continue
    const ours = figures(ctx.charting, draft.override as SongOverride | null, draft.song, k).map((f) => f.perSecond)
    const tiers = tiersOf(ctx.charting, draft.override as SongOverride | null, k).length
    if (theirs.length !== ours.length || theirs.length !== tiers || theirs.some((v, i) => Math.abs(v - ours[i]) > 0.006)) {
      console.warn(`[takt/mods] charting port disagrees with the app on ${mod.name} ${k}: app ${theirs.map((v) => v.toFixed(2)).join(' ')} · server ${ours.map((v) => v.toFixed(2)).join(' ')}`)
    }
  }
}
