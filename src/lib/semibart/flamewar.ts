// The flame war at the seminar (2026-11-13). The visitor walks up to the question mic in the
// Margaret Levi Meeting Room and either types a comment (it is never a question) or asks to have
// some stuff stirred up for them. One Claude call writes the whole scene: the room's six people
// tear into it in character, the heat rises, and the presenter (or, when the visitor is the
// presenter, someone at the table) storms out. The game plays it line by line (flamewar.js).
// Nothing is stored but a line on the wire. No Next imports.

import type Anthropic from '@anthropic-ai/sdk'
import type { SemibartUser } from './auth'
import rosterFile from './roster.json'
import { allPersonas, announce, countTurn } from './social'

const MODEL = 'claude-opus-5-5'
export const MAX_COMMENT = 280
const LINE_MAX = 120

const FELLOWS = (rosterFile as unknown as { fellows: Record<string, { name: string; look: string }> }).fellows

export type FlameItem = { who: string; text: string } | { exit: string }
export type FlameResult =
  | { ok: true; comment: string; script: FlameItem[]; leaver: string; headline: string }
  | { ok: false; status: number; say: string }

const SYSTEM = `You write one scene of CASBS Quest, a point-and-click pixel game set at the Center for Advanced Study in the Behavioral Sciences at Stanford. About fifty real scholars, the year's fellows, play it and appear in it as themselves.

The scene: a seminar in the Margaret Levi Meeting Room. One fellow presents, standing at the front; five sit at the long table. The player has just walked up to the audience microphone and said "It's more of a comment than a question." Then they said their comment. Your job is the flame war that follows.

# What happens

1. The player's comment, spoken by the player (who: you), in their words if they gave them. If they did not, invent the comment: one provocation this particular room cannot leave alone, built from what these people work on. Pick a fight about academic life or the ideas in their fields, the kind of thing that really does start fights at seminars: methods, framing, who said it first, what counts as evidence, whether the book is dead, whether anyone reads past the abstract.
2. The room tears into it. Each person argues from their own field and their own one line, in character, and they turn on each other as much as on the comment. It escalates in steps: polite disagreement, then citing their own work, then "with respect", then talking over each other, then nobody listening at all. Everyone at the table speaks at least once; the player may throw in one or two more lines of fuel.
3. The presenter keeps trying to get back to the talk (slide two, questions at the end, their forty minutes), and is ignored harder each time.
4. Near the end, the one who leaves (named with the request) storms out with a parting line. Mark the moment with an exit tag right after their last line.
5. One or two lines after the door, from whoever is left. Short. The room carries on as if nothing happened, or someone asks if this was a question.

Twelve to eighteen lines in all, plus the exit.

# The voice

Deadpan and dry. Short declarative sentences, and the joke is in the second sentence, which is shorter than the first. Every line at most ${LINE_MAX} characters, most of them far shorter: they float over the speaker's head in a pixel font, one at a time. No exclamation marks except for real alarm, no emoji, no stage directions, no asterisks, no names at the start of lines.

Never use he, him, his, she, her or hers for anyone, the player included, in the lines or the headline: use their first name, or they and their. A wrong guess misgenders a real colleague in front of everyone.

# The people are real

These are real colleagues who will watch themselves argue. They can be stubborn, pedantic, self-citing, and wrong in their own direction; they are never cruel, never humiliated, never made to look stupid, and nobody attacks a person rather than an idea. Keep it something every one of them would laugh at and show a friend.

Never put a real person on a side of a real-world political, religious or identity fight, or have them say anything about a real public figure. When the comment is about one of those, the room fights about the academic proxy instead: the framing, the sample, the method, the word choice, who gets to cite whom. The comment line itself may be reworded to that proxy. When the comment is cruel about a person or a group, or sexual, the room ignores it and fights about something else that is nearby and harmless, and the player's line is reworded to match.

# Format

<comment>the player's comment as spoken, one line</comment>
<line who="slug">what they say</line>
...
<exit who="slug"/>
<line who="slug">...</line>
<headline>One line for the campus wire, at most 90 characters, third person, the player's first name, past tense, what happened: "Kevin grabbed the mic at the seminar. Garance left."</headline>

Use only the slugs given with the request, and "you" for the player.`

const tag = (s: string) => s.replace(/\s+/g, ' ').trim()

function parse(text: string, cast: Set<string>): { comment: string; script: FlameItem[]; headline: string } {
  const comment = tag(/<comment>([\s\S]*?)<\/comment>/.exec(text)?.[1] ?? '')
  const headline = tag(/<headline>([\s\S]*?)<\/headline>/.exec(text)?.[1] ?? '')
  const script: FlameItem[] = []
  const re = /<line\s+who="([a-z]+)"\s*>([\s\S]*?)<\/line>|<exit\s+who="([a-z]+)"\s*\/?>/g
  for (let m; (m = re.exec(text));) {
    if (m[3]) { if (cast.has(m[3])) script.push({ exit: m[3] }); continue }
    const who = m[1], raw = tag(m[2]), line = /^["“][^"“”]*["”]$/.test(raw) ? raw.slice(1, -1) : raw
    if ((who === 'you' || cast.has(who)) && line) script.push({ who, text: line.slice(0, LINE_MAX + 20) })
  }
  return { comment, script, headline }
}

/** Check a parsed scene against the rules the game relies on; null when it is fit to play. */
function problem(s: ReturnType<typeof parse>, leaver: string, table: string[]): string | null {
  const lines = s.script.filter((i): i is { who: string; text: string } => 'who' in i)
  if (!s.comment) return 'the <comment> is missing'
  if (lines.length < 8) return `only ${lines.length} lines; write twelve to eighteen`
  const exits = s.script.filter(i => 'exit' in i)
  if (exits.length !== 1 || (exits[0] as { exit: string }).exit !== leaver) return `there must be exactly one <exit who="${leaver}"/>`
  const at = s.script.findIndex(i => 'exit' in i)
  if (s.script.slice(at + 1).some(i => 'who' in i && i.who === leaver)) return `${leaver} speaks after leaving`
  const quiet = table.filter(k => !lines.some(l => l.who === k))
  if (quiet.length) return `these people never speak: ${quiet.join(', ')}`
  return null
}

export type FlameRequest = { comment: string; cast: string[]; topic: string }

/** The scene for one grab of the mic. `cast` is the room as the game shows it: the presenter
 *  first, then the five at the table. The player, if they are in it, is not drawn and speaks as "you". */
export async function runFlamewar(user: SemibartUser, req: FlameRequest, opts: { quiet?: boolean } = {}): Promise<FlameResult> {
  const cast = [...new Set(req.cast.map(c => String(c).toLowerCase()))]
  if (cast.length !== 6 || cast.some(c => !FELLOWS[c])) return { ok: false, status: 400, say: 'That is not the room I know.' }
  const comment = req.comment.trim().slice(0, MAX_COMMENT)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  if (!(await countTurn(user.character, 'seminar'))) return { ok: false, status: 429, say: 'Enough flame wars for one day. The room needs to cool down.' }

  const here = cast.filter(c => c !== user.character)
  const presenter = cast[0] !== user.character ? cast[0] : null
  const table = cast.slice(1).filter(c => c !== user.character)
  const leaver = presenter ?? table[0]
  const personas = await allPersonas()
  const who = (c: string) => {
    const p = personas[c] as { look?: string; doing?: string } | undefined
    const extra = [p?.look ? `Lately described as: ${p.look}` : '', p?.doing ? `Up to: ${p.doing}` : ''].filter(Boolean).join(' ')
    return `- ${c}: ${FELLOWS[c].look}${extra ? ' ' + extra : ''}`
  }
  const first = user.name.split(' ')[0]
  const brief = [
    presenter
      ? `Presenting, standing at the front: ${presenter}. The talk is about: ${JSON.stringify(req.topic.slice(0, 160))}. They are still on slide two.`
      : `The player is the presenter (${JSON.stringify(req.topic.slice(0, 160))}) and has walked off their own talk to the audience mic. There is no one at the front.`,
    `At the table: ${table.join(', ')}.`,
    `Who they are:\n${here.map(who).join('\n')}`,
    `The player: ${first}${FELLOWS[user.character] ? ` (${FELLOWS[user.character].look})` : ''}. They speak as "you".`,
    `The one who storms out: ${leaver}.`,
    comment ? `The player's comment: ${JSON.stringify(comment)}` : 'The player gave no comment and asked you to stir up some stuff for them. Invent it.',
  ].join('\n\n')

  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const client = new AnthropicSDK({ apiKey })
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: brief }]
  const castSet = new Set(here)
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now()
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // If a safety classifier declines the request on this model, the API reruns it on its
      // default fallback inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages,
    })
    console.log(`[semibart/flamewar] attempt ${attempt}: stop=${res.stop_reason} out=${res.usage.output_tokens} ${Date.now() - started}ms`)
    if (res.stop_reason === 'refusal') return { ok: false, status: 200, say: 'The room declines to take the bait.' }
    if (res.stop_reason !== 'end_turn') throw new Error(`flame war stopped with ${res.stop_reason}`)
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('')
    const scene = parse(text, castSet)
    const gendered = [scene.headline, ...scene.script.map(i => 'text' in i ? i.text : '')].find(t => /\b(he|him|his|she|her|hers|himself|herself)\b/i.test(t))
    const why = problem(scene, leaver, table) || (gendered ? `this line uses he/she pronouns: ${JSON.stringify(gendered)}; use names or they` : null)
    if (!why) {
      const headline = scene.headline.slice(0, 110) || `${first} grabbed the mic at the seminar. ${FELLOWS[leaver].name} left.`
      // The wire is everyone's: tests (the check account, flamewar-try) stay off it.
      if (!opts.quiet && user.character !== 'check') await announce({ kind: 'system', actor: user.character, room: 'seminar', text: headline }).catch(e => console.error('[semibart/flamewar] announce', e))
      return { ok: true, comment: scene.comment, script: scene.script, leaver, headline }
    }
    console.log(`[semibart/flamewar] attempt ${attempt}: ${why}`)
    messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: `That cannot be played: ${why}. Write the whole scene again, in the same format.` })
  }
  return { ok: false, status: 200, say: 'Everyone started talking at once. Try the mic again.' }
}
