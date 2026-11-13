// The chat with a room's Claude: the small spark on the door frame of every study. A fellow
// talks to it in their own room and it changes things: what is in the room (handed to the
// decorator, room-change.ts), and how the fellow comes across (their lines, social.ts). Every
// change goes on the ticker. Two levels: a fellow in their own room, about themselves; an admin
// in any room, about anyone in it, plus announcements of their own. No Next imports.

import type Anthropic from '@anthropic-ai/sdk'
import type { SemibartUser } from './auth'
import { changeRoom, undoChange } from './room-change'
import { mayDecorate, rosterRoom } from './rooms'
import { announce, countTurn, getPersona, setPersona, type Persona } from './social'

const MODEL = 'claude-opus-5-5'
const MAX_STEPS = 5

export type ChatTurn = { role: 'user' | 'claude'; text: string }
export type ChatResult = {
  status: number
  body: {
    reply: string
    /** Set when the room's drawing changed: the game shows it at once. */
    room?: { room: string; version: number; code: string }
    /** Characters whose lines changed, with what is stored now. */
    personas?: Record<string, Persona>
    error?: string
  }
}

const SYSTEM = `You are Claude, as a character in CASBS Quest: a point-and-click pixel game set at the Center for Advanced Study in the Behavioral Sciences at Stanford, where every fellow has a study. In the game you are a small clay-colored spark who sits on the door frame of each study. The fellow whose study it is clicks you and types; you make it so. You are their room's genie, and a dry, warm, brief one.

# What you can change

You act only through tools, and you never claim a change that a tool did not confirm.

1. What is in the room and how it looks: change_room. Anything a visitor would see goes here: things on the walls, desk and floor, animals, colors, light, weather outside the window, where the fellow is and what they are doing ("I'm on the couch taking a nap"), different furniture, even a different layout of the room. Another model, the decorator, draws it. It sees only the sentence you pass and the room as it stands, so write that sentence complete and concrete: keep the fellow's own words and specifics (how many, what color, where), and add what the conversation already settled. Do not shrink a big request and do not decide for the decorator what is possible; it answers with a line saying what it did or why it could not, and you relay that honestly. One change_room call per message from the fellow, carrying everything visual they asked for. It takes up to a minute or two.

2. How the fellow comes across: set_lines. Their character's lines in the game: what a visitor says when they look at them (look), what they call through the door at a knock (come), what they say when someone first walks in (hello), what they say when talked to, one per click (lines, up to six), and a few words on what they are up to (doing). Use this for personality, attitude, mood, background, a new bio, a running joke, "make me grumpy", "I only speak in questions today". You write the lines: short, in the voice asked for, something a colleague would smile at, each at most 140 characters. Change only the fields the request touches; pass reset true to go back to the lines the game shipped with.

A request about what the fellow is doing usually needs both: draw it (change_room) and say it (set_lines, with look, lines and doing to match). Call both in the same turn.

3. undo_room steps the room's drawing back one change.

# The ticker

Every change is announced to the whole campus on a line that scrolls along the bottom of everyone's screen. You write that line as the headline argument: one sentence, at most 90 characters, third person, first name, what just happened, with a little wit and no spoilers of private things. Say "their", never "his" or "her". For example: "Bart just added ten cute rats to their study." or "Mary is napping on the couch. Knock softly."

# Who may ask for what

Each request tells you who is asking and their level.
- A fellow, in their own study: the room, and their own lines. In a shared study each person changes only their own lines; the room is everyone's.
- An admin: any study they are standing in, and the lines of anyone who lives in it (set_lines takes who). An admin also has announce, to put a line of their own on the ticker.
A fellow's lines are theirs to make as silly or as self-deprecating as they like. Do not write lines that mock or misrepresent a colleague, and keep everything fit for a workplace where senior scholars will read it; say so plainly and offer the nearest thing you can do.

# How you talk

Your replies appear in a small pixel-font chat panel. One or two short sentences, at most 200 characters, plain text, no lists, no markdown, no emoji. Say what is now true ("Ten rats. One is already in your bookshelf."), not how you did it. If a request is unclear enough that you would be guessing at what to draw, ask one short question instead of calling a tool. If the fellow is just chatting, chat back in a line and mention one thing you could do for the room. When a tool reports that nothing changed, say that and why.`

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'change_room',
    description: 'Change what is in the study and how it looks, by handing one complete sentence to the decorator. Returns the decorator\'s own line about what it did, or why nothing changed.',
    input_schema: {
      type: 'object', additionalProperties: false, required: ['request', 'headline'],
      properties: {
        request: { type: 'string', description: 'The whole visual request in one or two concrete sentences, at most 600 characters, in the fellow\'s words where they gave them.' },
        headline: { type: 'string', description: 'The ticker line if this works: one sentence, at most 90 characters.' },
      },
    },
    strict: true,
  },
  {
    name: 'set_lines',
    description: 'Change a character\'s lines in the game. Only the fields you pass change. Returns the lines as they now stand.',
    input_schema: {
      type: 'object', additionalProperties: false, required: ['headline'],
      properties: {
        who: { type: 'string', description: 'The lowercase character slug to change. Leave out for the person asking; an admin passes one of the study\'s occupants.' },
        look: { type: 'string', description: 'What a visitor says when they look at this person. Third person.' },
        come: { type: 'string', description: 'What this person calls through the door when someone knocks.' },
        hello: { type: 'string', description: 'What this person says the first time a visitor walks in.' },
        lines: { type: 'array', items: { type: 'string' }, description: 'What this person says when talked to, one per click, up to six.' },
        doing: { type: 'string', description: 'A few words on what this person is up to: "napping on the couch".' },
        reset: { type: 'boolean', description: 'True to drop every earlier change first, back to the lines the game shipped with.' },
        headline: { type: 'string', description: 'The ticker line: one sentence, at most 90 characters.' },
      },
    },
  },
  {
    name: 'undo_room',
    description: 'Step the study\'s drawing back one change.',
    input_schema: { type: 'object', additionalProperties: false, required: [], properties: {} },
    strict: true,
  },
]
const ANNOUNCE: Anthropic.Beta.BetaTool = {
  name: 'announce',
  description: 'Admins only: put a line on the campus ticker that scrolls along the bottom of everyone\'s screen.',
  input_schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string', description: 'The line, at most 140 characters.' } } },
  strict: true,
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** One message from a fellow to their room's Claude, with the conversation so far. */
export async function runRoomChat(user: SemibartUser, room: string, turns: ChatTurn[]): Promise<ChatResult> {
  const info = rosterRoom(room)
  if (!info) return { status: 404, body: { reply: 'There is no such room.', error: 'No such room.' } }
  if (!mayDecorate(user, room)) return { status: 403, body: { reply: 'I only take requests from whoever lives here.', error: 'Not your room.' } }
  if (!turns.length || turns[turns.length - 1].role !== 'user') return { status: 400, body: { reply: 'Say what you would like.', error: 'Nothing asked.' } }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  if (!(await countTurn(user.character, room))) return { status: 429, body: { reply: 'We have talked enough for one day. I will be here tomorrow, same door frame.', error: 'Daily limit.' } }
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const client = new AnthropicSDK({ apiKey })

  const admin = user.role === 'admin'
  const lives = info.occupants.includes(user.character)
  const first = user.name.split(' ')[0]
  /** Whose lines set_lines changes when it names nobody. */
  const self = lives ? user.character : info.occupants[0]
  const personasNow = await Promise.all(info.occupants.map(async c => [c, await getPersona(c)] as const))
  const context = [
    `Study ${info.study}. It belongs to: ${info.occupants.map((c, i) => `${info.names[i]} (${c})`).join(', ')}.`,
    `Asking: ${first} (${user.character}), ${admin ? 'an admin' : 'a fellow'}${lives ? ', who lives here' : ', who does not live here'}.`,
    `Lines changed so far (anything missing is as the game shipped it): ${JSON.stringify(Object.fromEntries(personasNow))}`,
  ].join('\n')

  // The conversation: alternating turns, with this request's facts in front of the last message.
  const messages: Anthropic.Beta.BetaMessageParam[] = []
  turns.forEach((t, i) => {
    const text = i === turns.length - 1 ? `<context>\n${context}\n</context>\n\n${t.text}` : t.text
    const role = t.role === 'user' ? 'user' as const : 'assistant' as const
    if (!messages.length && role === 'assistant') return
    messages.push({ role, content: text })
  })

  const out: ChatResult['body'] = { reply: '' }
  // A change that was saved stays saved: a ticker line that fails to write is logged, not thrown.
  const tell = (e: Parameters<typeof announce>[0]) => announce(e).catch(err => console.error('[semibart/agent] announce', err))
  let roomCalls = 0
  const runTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
    if (name === 'change_room') {
      if (roomCalls++ > 0) return 'Not run: one change_room per message. Tell the fellow what was done and ask them to send the rest.'
      const r = await changeRoom(user, room, str(input.request).slice(0, 600))
      if (!r.ok) return `Nothing changed. The decorator says: ${r.say}`
      out.room = { room: r.room, version: r.version, code: r.code }
      await tell({ kind: 'room', actor: user.character, room, text: str(input.headline).slice(0, 110) || `${first} changed Study ${info.study}.` })
      return `The room changed (version ${r.version}). The decorator says: ${r.say}`
    }
    if (name === 'undo_room') {
      const r = await undoChange(user, room)
      if (!r.ok) return `Nothing changed: ${r.say}`
      out.room = { room: r.room, version: r.version, code: r.code }
      return 'The room is back to how it was one change ago.'
    }
    if (name === 'set_lines') {
      const who = str(input.who).toLowerCase() || self
      if (!info.occupants.includes(who)) return `Not done: ${who} does not live in this study.`
      if (!admin && who !== user.character) return 'Not done: a fellow changes only their own lines.'
      const next = await setPersona(who, input, user.character, input.reset === true)
      out.personas = { ...(out.personas || {}), [who]: next }
      await tell({ kind: 'persona', actor: user.character, room, text: str(input.headline).slice(0, 110) || `${info.names[info.occupants.indexOf(who)]} has new things to say.` })
      return `Saved. ${who}'s lines now: ${JSON.stringify(next)}`
    }
    if (name === 'announce') {
      if (!admin) return 'Not done: only an admin announces.'
      const text = str(input.text).slice(0, 140)
      if (!text) return 'Not done: the line was empty.'
      await announce({ kind: 'system', actor: user.character, room: '', text })
      return 'It is on the ticker.'
    }
    return `No such tool: ${name}`
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // If a safety classifier declines the request on this model, the API reruns it on its
      // default fallback inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: admin ? [...TOOLS, ANNOUNCE] : TOOLS,
      messages,
    })
    console.log(`[semibart/agent] ${room} step ${step}: stop=${res.stop_reason} in=${res.usage.input_tokens} cached=${res.usage.cache_read_input_tokens ?? 0} out=${res.usage.output_tokens}`)
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join(' ').replace(/\s+/g, ' ').trim()
    if (res.stop_reason === 'refusal') { out.reply = "I can't do that one. Ask me for something else."; break }
    if (res.stop_reason !== 'tool_use') {
      if (res.stop_reason !== 'end_turn') throw new Error(`room chat stopped with ${res.stop_reason}`)
      out.reply = text
      break
    }
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    // In order, not at once: a room change and new lines announce in the order they were asked.
    for (const c of calls) {
      let content: string, isError = false
      try { content = await runTool(c.name, (c.input && typeof c.input === 'object' ? c.input : {}) as Record<string, unknown>) }
      catch (e) { console.error('[semibart/agent] tool', c.name, e); content = 'That failed on our side; nothing was changed by this call.'; isError = true }
      results.push({ type: 'tool_result', tool_use_id: c.id, content, is_error: isError })
    }
    messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: results })
  }
  if (!out.reply) out.reply = out.room || out.personas ? 'Done.' : 'I lost my thread there. Say it again?'
  return { status: 200, body: out }
}
