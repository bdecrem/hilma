// The chaos at the seminar (2026-11-13, physical comedy since 2026-11-14). The visitor walks up to
// the question mic in the Margaret Levi Meeting Room and either types a comment (it is never a
// question) or asks to have some stuff stirred up for them. All hell breaks loose, and it is
// slapstick, not debate: a two-word reply, one more line, and then someone throws their papers in
// the air and storms out, or spills the coffee, or climbs on the table, the music starts and the
// whole room dances. One Claude call writes the scene as a short script of lines and moves from a
// fixed vocabulary (MOVES); the game plays each move with its own animation (flamewar.js). Each grab
// of the mic is handed one of SHAPES at random so no two seminars go the same way; the model may
// bend it. Level 9 since the evening of 2026-11-14 (Bart: "it's at level 3, I want level 9"): two
// lines at most before the first move, a real wreck (a smashed window, the trash can kicked across
// the room, the screen torn down, the light hanging by a wire, the door slammed so hard the clock
// falls), nobody sits back down, and the mess stays in the room for everyone (seminar.ts) until the
// next visitor picks up the broom. No Next imports.

import type Anthropic from '@anthropic-ai/sdk'
import type { SemibartUser } from './auth'
import rosterFile from './roster.json'
import { allPersonas, announce, countTurn } from './social'
import { saveWreck } from './seminar'

const MODEL = 'claude-opus-5-5'
export const MAX_COMMENT = 280
const LINE_MAX = 70
const MAX_LINES = 5
const LEAD_MAX = 2   // lines after the comment before the first move

const FELLOWS = (rosterFile as unknown as { fellows: Record<string, { name: string; look: string }> }).fellows

/** The moves the game can animate. `who` = one person in the room; room moves take no one. */
export const MOVES = {
  rise: 'who stands bolt upright out of their chair',
  slam: 'who slams a fist on the table; the room shakes, papers jump',
  throw: 'who throws their whole stack of papers into the air; it rains paper',
  spill: 'who knocks over their coffee; it floods along the table and drips on the floor, the neighbors leap up',
  jump: 'who climbs up and stands on the table',
  storm: 'who storms out through the door (gone for the rest of the scene); style="slam" slams it so hard the clock falls off the wall, style="open" leaves it swinging open',
  faint: 'who slides slowly under the table and stays there (they can still talk from down there)',
  clap: 'who starts a slow clap that the whole room picks up, faster and faster',
  spin: 'who spins round and round in their chair',
  music: 'music starts out of nowhere; style is disco, tango or polka',
  dance: 'everyone still in the room dances (only after music)',
  conga: 'everyone still in the room forms a conga line and dances out the door (only after music; ends the scene, the player is left alone)',
  alarm: 'the fire alarm goes off, red light, sprinklers rain on everyone, papers held over heads',
  lights: 'the lights go out; crashes in the dark; when they come back, the ceiling light hangs by one wire, flickering, who is standing on the table and paper is everywhere',
  freeze: 'dead silence; nobody moves; a cricket chirps',
  turkey: 'the wild turkey from outside walks in through the door (after this it may speak as who="turkey", only gobbles)',
  smash: 'who hurls their coffee mug through the window; the glass explodes, wind blows in, papers swirl',
  kick: 'who kicks the trash can clean across the room; it bounces off the wall, garbage everywhere',
  screen: 'who yanks the projector screen; it crashes down and hangs by one corner, slide two upside down',
} as const
type Move = keyof typeof MOVES
const PERSON_MOVES = new Set<Move>(['rise', 'slam', 'throw', 'spill', 'jump', 'storm', 'faint', 'clap', 'spin', 'lights', 'smash', 'kick', 'screen'])
/** The moves that leave a mess behind: the room stays like that for the next visitor. */
const WRECK_MOVES = new Set<Move>(['throw', 'spill', 'smash', 'kick', 'screen', 'lights', 'alarm', 'storm'])
const MIN_MOVES = 4, MIN_WRECK = 2
const STYLES = ['disco', 'tango', 'polka']
const DOOR = ['slam', 'open']

/** Ways a scene can go. One is handed to the model at random each time. */
const SHAPES = [
  'Paper storm: a two-word reply from the presenter, then someone throws their papers into the air, slams the table and storms out, slamming the door so hard the clock falls; the presenter yanks the screen down.',
  'Coffee: someone slams the table, the coffee spills, the neighbors leap up, someone kicks the trash can across the room, and someone faints under the table.',
  'The window: one word; someone hurls their mug through the window; the wind blows in; someone throws their papers into it; the turkey walks in through the door.',
  'Table dance: someone climbs on the table, music starts mid-sentence, everyone dances, someone kicks the trash can, the screen comes down, and they conga out the door.',
  'Fire drill: someone slams the table so hard the fire alarm goes off, the sprinklers rain on everyone, the presenter yanks the screen down and storms out, leaving the door open.',
  'Blackout: someone says one word, the lights go out, crashes in the dark; when they come back the light hangs by a wire, that person is on the table, someone else has fainted, and someone storms out.',
  'Walkout: one by one, people storm out, each with two words at most, slamming the door; one throws their papers on the way; the last one kicks the trash can and leaves the door open.',
  'The turkey: dead silence, a cricket; the turkey walks in; someone smashes the window to let it out; it does not go; a polka, and everyone congas out the door with the turkey.',
  'Escalation: someone slams the table, someone else spills coffee, a third throws papers, a fourth smashes the window, the presenter yanks the screen down and storms out.',
  'Slow clap: one person rises and starts a slow clap, the room joins, music, someone jumps on the table, someone kicks the trash can, and everyone congas out the door.',
  'Tango: two people rise and face each other, a tango starts, everyone dances, someone spins, the screen comes down on the presenter, who faints under the table.',
]

export type FlameItem = { who: string; text: string } | { act: Move; who?: string; style?: string }
export type FlameResult =
  | { ok: true; comment: string; script: FlameItem[]; headline: string; shape: string }
  | { ok: false; status: number; say: string }

const SYSTEM = `You write one scene of CASBS Quest, a point-and-click pixel game set at the Center for Advanced Study in the Behavioral Sciences at Stanford. About fifty real scholars, the year's fellows, play it and appear in it as themselves.

The scene: a seminar in the Margaret Levi Meeting Room. One fellow presents, standing at the front; five sit at the long table. The player has just walked up to the audience microphone and said "It's more of a comment than a question." Then they said their comment. All hell breaks loose.

# It is physical comedy

Not a debate. Almost nobody argues. The words are few and short, and the comedy is in what bodies and objects do: papers in the air, coffee everywhere, a mug through the window, the trash can across the room, the screen torn down, someone on the table, music out of nowhere, a whole faculty dancing, a door slammed so hard the clock falls. Think silent film, Mr. Bean, a sitcom cold open, turned all the way up. The timing is the joke: a two-word reply, then the chaos, fast, one thing setting off the next.

Two lines at most between the comment and the first move: it goes off almost at once. At least ${MIN_MOVES} moves, and at least ${MIN_WRECK} that leave a mess (${[...WRECK_MOVES].join(', ')}). The room stays wrecked after the scene, for whoever walks in next, and nobody sits back down: everyone ends where the chaos left them.

You are given a shape for this scene. Follow it, or bend it if the room and the comment suggest something funnier, but keep it this short, this physical and this big.

# The moves

The game can animate exactly these, nothing else:

${Object.entries(MOVES).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Write a move as <do act="name" who="slug"/> (who is required for: ${[...PERSON_MOVES].join(', ')}), <do act="storm" who="slug" style="slam|open"/>, <do act="music" style="disco|tango|polka"/>, or <do act="dance"/> and the other room moves without who.

# The words

- At most ${MAX_LINES - 1} lines after the comment, usually two or three, and at most ${LEAD_MAX} before the first move. The moves carry the scene. Many are one or two words ("Bold.", "Excuse me?", "Slide two.", "Respectfully, no."). None over ${LINE_MAX} characters.
- The comment: the player's words if they gave them. If not, invent one provocation this particular room cannot leave alone, about academic life or their fields: methods, framing, who said it first, whether anyone reads past the abstract.
- Each person who speaks speaks from their own work and their one line, in character, deadpan. The presenter keeps trying to get back to slide two.
- Dry. Short declarative sentences. No exclamation marks except for real alarm, no emoji, no stage directions in lines, no asterisks, no names at the start of lines.
- Never use he, him, his, she, her or hers for anyone, the player included, in the lines or the headline: use first names, or they and their. A wrong guess misgenders a real colleague in front of everyone.

# The people are real

Real colleagues will watch themselves do this. They can be ridiculous, pompous, flustered, theatrical; they are never cruel, never humiliated, never hurt, and nobody attacks a person rather than an idea. Something every one of them would laugh at and show a friend.

Never put a real person on a side of a real-world political, religious or identity fight, or have them say anything about a real public figure. When the comment is about one of those, the room reacts to the academic proxy instead (the framing, the sample, the method), and the comment line may be reworded to that proxy. When the comment is cruel about a person or a group, or sexual, the room ignores it, and the player's line is reworded to something nearby and harmless.

# Format

<comment>the player's comment as spoken, one line (they have already said "It's more of a comment than a question"; do not repeat it)</comment>
then lines and moves in the order they happen:
<line who="slug">what they say</line>
<do act="throw" who="slug"/>
...
<headline>One line for the campus wire, at most 90 characters, third person, the player's first name, past tense, what happened: "Kevin grabbed the mic at the seminar. Then the coffee went."</headline>

Use only the slugs given with the request, "you" for the player, and "turkey" after the turkey has come in. The player only speaks; they never do a move.`

const tag = (s: string) => s.replace(/\s+/g, ' ').trim()
const attr = (s: string, k: string) => new RegExp(`\\b${k}="([^"]*)"`).exec(s)?.[1]

function parse(text: string, cast: Set<string>): { comment: string; script: FlameItem[]; headline: string; junk: string[] } {
  const comment = tag(/<comment>([\s\S]*?)<\/comment>/.exec(text)?.[1] ?? '').replace(/^it'?s more of a comment than a question[.,:]?\s*/i, '')
  const headline = tag(/<headline>([\s\S]*?)<\/headline>/.exec(text)?.[1] ?? '')
  const script: FlameItem[] = [], junk: string[] = []
  const re = /<line\s+who="([a-z]+)"\s*>([\s\S]*?)<\/line>|<do\b([^>]*?)\/?>/g
  for (let m; (m = re.exec(text));) {
    if (m[3] !== undefined) {
      const act = attr(m[3], 'act') as Move | undefined, who = attr(m[3], 'who'), style = attr(m[3], 'style')
      if (!act || !(act in MOVES)) { junk.push(`unknown move ${JSON.stringify(act)}`); continue }
      if (PERSON_MOVES.has(act) && (!who || !cast.has(who))) { junk.push(`${act} needs who= one of the people in the room`); continue }
      if (act === 'music' && (!style || !STYLES.includes(style))) { junk.push('music needs style="disco", "tango" or "polka"'); continue }
      if (act === 'storm') { script.push({ act, who, style: style && DOOR.includes(style) ? style : 'slam' }); continue }
      script.push(PERSON_MOVES.has(act) ? { act, who } : act === 'music' ? { act, style } : { act })
      continue
    }
    const who = m[1], raw = tag(m[2]), line = /^["“][^"“”]*["”]$/.test(raw) ? raw.slice(1, -1) : raw
    if ((who === 'you' || who === 'turkey' || cast.has(who)) && line) script.push({ who, text: line.slice(0, LINE_MAX + 20) })
    else junk.push(`a line from ${who}, who is not in the room`)
  }
  return { comment, script, headline, junk }
}

/** Check a parsed scene against what the game can play; null when it is fit to play. */
function problem(s: ReturnType<typeof parse>): string | null {
  if (s.junk.length) return s.junk.join('; ')
  if (!s.comment) return 'the <comment> is missing'
  const lines = s.script.filter((i): i is { who: string; text: string } => 'text' in i)
  const moves = s.script.filter((i): i is Extract<FlameItem, { act: Move }> => 'act' in i)
  if (lines.length > MAX_LINES - 1) return `${lines.length} lines; at most ${MAX_LINES - 1}, most of them a word or two`
  if (moves.length < MIN_MOVES) return `only ${moves.length} moves; this is physical comedy turned all the way up, at least ${MIN_MOVES}`
  const wrecks = moves.filter(m => WRECK_MOVES.has(m.act)).length
  if (wrecks < MIN_WRECK) return `only ${wrecks} moves leave a mess; at least ${MIN_WRECK} of ${[...WRECK_MOVES].join(', ')}`
  const lead = s.script.findIndex(i => 'act' in i)
  if (lead > LEAD_MAX) return `${lead} lines before the first move; at most ${LEAD_MAX}, the chaos starts almost at once`
  const long = lines.find(l => l.text.length > LINE_MAX)
  if (long) return `this line is over ${LINE_MAX} characters: ${JSON.stringify(long.text)}`
  const gone = new Set<string>()
  let music = false, turkey = false, conga = false
  for (const i of s.script) {
    const who = 'text' in i ? i.who : i.who
    if (who && gone.has(who)) return `${who} acts or speaks after leaving the room`
    if (conga && who && who !== 'you' && who !== 'turkey') return `${who} acts or speaks after the conga left`
    if ('text' in i) { if (i.who === 'turkey' && !turkey) return 'the turkey speaks before it has come in'; continue }
    if (i.act === 'storm') gone.add(i.who!)
    if (i.act === 'music') music = true
    if (i.act === 'turkey') turkey = true
    if ((i.act === 'dance' || i.act === 'conga') && !music) return `${i.act} comes before any music`
    if (i.act === 'conga') conga = true
  }
  return null
}

export type FlameRequest = { comment: string; cast: string[]; topic: string }

/** The scene for one grab of the mic. `cast` is the room as the game shows it: the presenter
 *  first, then the five at the table. The player, if they are in it, is not drawn and speaks as "you". */
export async function runFlamewar(user: SemibartUser, req: FlameRequest, opts: { quiet?: boolean; shape?: number } = {}): Promise<FlameResult> {
  const cast = [...new Set(req.cast.map(c => String(c).toLowerCase()))]
  if (cast.length !== 6 || cast.some(c => !FELLOWS[c])) return { ok: false, status: 400, say: 'That is not the room I know.' }
  const comment = req.comment.trim().slice(0, MAX_COMMENT)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  if (!(await countTurn(user.character, 'seminar'))) return { ok: false, status: 429, say: 'Enough chaos for one day. The room needs to cool down.' }

  const here = cast.filter(c => c !== user.character)
  const presenter = cast[0] !== user.character ? cast[0] : null
  const table = cast.slice(1).filter(c => c !== user.character)
  const shape = SHAPES[opts.shape ?? Math.floor(Math.random() * SHAPES.length)] ?? SHAPES[0]
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
    `The shape of this scene: ${shape}`,
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
    const why = problem(scene) || (gendered ? `this line uses he/she pronouns: ${JSON.stringify(gendered)}; use names or they` : null)
    if (!why) {
      const headline = scene.headline.slice(0, 110) || `${first} grabbed the mic at the seminar. It did not go well.`
      // The wire is everyone's: tests (the check account, flamewar-try) stay off it. The mess is
      // kept for the next visitor; the check account keeps its own, flamewar-try none.
      if (!opts.quiet && user.character !== 'check') await announce({ kind: 'system', actor: user.character, room: 'seminar', text: headline }).catch(e => console.error('[semibart/flamewar] announce', e))
      if (!opts.quiet) await saveWreck(user.character, { by: user.character, name: first, at: new Date().toISOString(), headline, moves: scene.script.filter((i): i is Extract<FlameItem, { act: Move }> => 'act' in i) })
        .catch(e => console.error('[semibart/flamewar] wreck', e))
      return { ok: true, comment: scene.comment, script: scene.script, headline, shape: shape.split(':')[0] }
    }
    console.log(`[semibart/flamewar] attempt ${attempt}: ${why}`)
    messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: `That cannot be played: ${why}. Write the whole scene again, in the same format.` })
  }
  return { ok: false, status: 200, say: 'Everyone started talking at once. Try the mic again.' }
}
