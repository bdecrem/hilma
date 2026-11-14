// The decorator: a fellow says what they want in their study ("put a cute pink rat in my
// room") and Claude writes the room's drawing code. The answer is test-run by room-check.ts
// before anything is saved; a draft that fails goes back to the model with the reason, twice
// at most. No Next imports.

import type Anthropic from '@anthropic-ai/sdk'
import { checkRoomCode, MAX_CODE, MAX_OPS, type RoomCheck } from './room-check'
import type { RoomLogEntry, RosterRoom } from './rooms'

const MODEL = 'claude-opus-5-5'
const MAX_REPAIRS = 2
export const MAX_PROMPT = 600

export type DecorateResult =
  | { ok: true; code: string; say: string; check: Extract<RoomCheck, { ok: true }>; attempts: number; ms: number }
  | { ok: false; say: string; reason: 'declined' | 'failed'; attempts: number; ms: number }

// What stands in each kind of room, in room coordinates. From public/semibart/index.html
// (makeRoomBg, deskScene, readingScene, standingScene, drawRoom): if those move, move these.
type SoloScene = Exclude<RosterRoom['scene'], 'duo' | 'trio'>
const SCENES: Record<SoloScene, string> = {
  desk: `The occupant sits behind a desk, facing the visitor. Chair back x 168-211, y 58-96. The occupant's head and shoulders x 172-205, y 56-97. Desk top x 148-263, y 95-100; its front panel runs down to y 122, legs to y 127. On the desk: a closed laptop at x 178-201, y 94-95, a monitor seen from behind at x 218-245, y 66-97, a mug at x 206-214, y 88-95. Clear wall for hanging things: x 126-262, y 6-52.`,
  read: `No desk. The occupant sits reading in a big green armchair, x 146-225, y 50-125. A floor lamp stands at x 235-257, y 46-127; a side table with tea at x 226-243, y 95-127. Clear wall for hanging things: x 126-262, y 6-44.`,
  stand: `The occupant stands at a standing desk between two enormous monitors on arms. Monitors cover x 108-273, y 16-84. Desk top x 132-259, y 80-84, legs to y 127. The occupant stands at x 176-203, y 38-127. The wall between the window and the bookshelf is mostly behind the monitors; only x 126-262, y 4-13 is clear.`,
  bart: `The occupant sits behind a desk, facing the visitor. Chair back x 168-211, y 58-96; head and shoulders x 172-205, y 56-97. Desk top x 148-263, y 95-100, front panel to y 122, legs to y 127. On the desk: a laptop, a monitor seen from behind at x 218-245, y 66-97, a mug at x 206-214, y 88-95, a phone on a stand at x 250-262, y 80-95. On the wall already: a Takt poster x 130-151, y 16-47; a pinboard x 158-187, y 20-43; a framed record x 198-227, y 14-41. A plant in a pot stands on the floor at x 284-306, y 100-130. Clear wall: x 232-262, y 6-52.`,
}
// The shared studies: a desk each, the first in front of the window, the last at the far right,
// the bookshelf moved left to stand between desks. The same numbers as PLANS in index.html.
const PLANS = {
  duo: { w: 96, chair: 44, c: [88, 264], shelf: [140, 48], rug: [128, 96], wall: 'x 192-316, y 6-50 (to the right of the bookshelf and above the second desk)' },
  trio: { w: 84, chair: 44, c: [88, 178, 268], shelf: [201, 44], rug: [58, 240], wall: 'x 126-198, y 6-50 (between the window and the bookshelf, above the middle desk) and x 248-316, y 6-50 (above the third desk)' },
}
const EXTRAS: Record<string, string> = {
  daniel: 'Also on the desk: a small marble bust of Socrates, x 155-168, y 78-94.',
  kahwee: 'Also on the desk: a pencil cup, x 156-161, y 80-94.',
  ian: 'Also here (hide name: extras): a world map with pins on the wall to the right of the bookshelf, x 200-263, y 8-45.',
  jacqueline: 'Also here (hide name: extras): an easel with a chart on it, standing between the bookshelf and the second desk, x 189-220, y 44-127; and a small plant on her desk.',
}

function sharedNotes(room: RosterRoom, askerCharacter?: string): string {
  const pl = PLANS[room.scene as 'duo' | 'trio']
  const seats = room.occupants.map((slug, i) => {
    const c = pl.c[i], x = c - pl.w / 2
    return `- ${room.names[i]}${slug === askerCharacter ? ' (the one asking)' : ''}, number ${i}: desk top x ${x}-${x + pl.w - 1}, y 95-100, front panel down to y 122 with a brass name plate on it, legs to y 127; sits centred on it, head and shoulders x ${c - 14}-${c + 13}, y 56-97; chair back x ${c - pl.chair / 2}-${c + pl.chair / 2 - 1}, y 58-96.${i === 0 ? ' This desk stands in front of the window: its occupant sits with their back to it.' : ''}`
  })
  return [
    `A shared study: ${room.names.length === 2 ? 'two' : 'three'} people, each at a desk of their own, facing the visitor. This room is laid out differently from the general description: the bookshelf stands at x ${pl.shelf[0]}-${pl.shelf[0] + pl.shelf[1] - 1}, y 10-105, and the rug lies at x ${pl.rug[0]}-${pl.rug[0] + pl.rug[1] - 1}, y 124-141. The door and the window are where they always are.`,
    ...seats,
    `On each desk: a closed laptop in the middle, a mug at the right end, a pad and pen at the left end. "My desk" and "my side" mean the asker's desk, the floor in front of it and the wall above it; the rest is shared ground. Clear wall for hanging things: ${pl.wall}.`,
    `To hide one person, desk or chair, use hide names with their number: 'person:1', 'desk:0', 'chair:2'. api.person takes who: the same number.`,
  ].join('\n')
}

function roomNotes(key: string, room: RosterRoom, askerCharacter?: string): string {
  const lines = [room.scene === 'duo' || room.scene === 'trio' ? sharedNotes(room, askerCharacter) : SCENES[room.scene]]
  if (EXTRAS[key]) lines.push(EXTRAS[key])
  return lines.join('\n')
}

const SYSTEM = `You are the decorator in CASBS Quest, a point-and-click pixel game set at the Center for Advanced Study in the Behavioral Sciences at Stanford. Every fellow has a study in the game. A fellow tells you in a sentence what they want in their room, and you write the drawing code that the game layers over that room for everyone who walks in. About fifty scholars share this game and see each other's rooms.

What you write is the reason the game stays charming: it should look hand-made by the same artist who drew the rest, and it should work the first time.

# What you return

The body of a JavaScript function. It runs once when the room loads and returns an object with up to six optional keys:

  return {
    back(api, t) {},    // drawn over the empty room and its sunlight, before the occupant, desk and visitor
    mid(api, t) {},     // drawn after the occupant and desk, before the visitor
    front(api, t) {},   // drawn last, over the visitor
    spots: [ { name: 'pink rat', r: [x, y, w, h], look: 'A line the visitor says.' } ],   // or (t) => [...]
    hide: ['desk'],     // parts of the room the game should leave out (see "Moving and removing")
    seats: { 1: [265, 34] }  // shared studies only: move and resize a desk (see "Moving and removing")
  };

Each layer function is called once per frame. t is the time in seconds: it only goes up, it does not start at zero, and it can jump by minutes when a tab was in the background. Code above the return runs once: put sprites, palettes and any state there. State lives in your closure for as long as the room is loaded, and every viewer runs their own copy, so viewers only agree on things you derive from Date.now() (a wall clock, a day-night cycle).

Choosing a layer: things on the wall, on the windowsill, behind the desk go in back. Things on the desk top go in mid. For something on the floor, compare its base y with api.you.y: draw it in mid when it is higher on screen (smaller y) than the visitor's feet, in front otherwise, so the visitor walks behind and in front of it correctly. Rain, confetti, anything hanging in the foreground goes in front.

spots make things part of the game: the name shows when the pointer is over r, and a click makes the visitor walk over and say look. Give every distinct thing you add a spot. A moving thing needs spots as a function of t that returns its current rectangle. Names are lower-case nouns ("lava lamp"). Look lines are first person, dry and short, in the game's voice: "It's thriving. Someone waters it." / "No secret passage. I checked." / "Coffee. Still hot."

# The drawing helpers (api)

  api.rect(x, y, w, h, color)            a filled rectangle; the workhorse
  api.px(x, y, color)                    one pixel
  api.disc(cx, cy, r, color)             a filled pixel circle
  api.oval(cx, cy, rx, ry, color)        a filled pixel ellipse
  api.dither(x, y, w, h, colorA, colorB) a checkerboard of two colors, for texture and soft edges
  api.sprite(rows, palette, x, y)        rows is an array of equal-length strings, one character per pixel; palette maps a character to a color; a character missing from the palette (use '.') is transparent
  api.text(cx, y, string, color)         tiny 3x5 capitals, digits and . , ! ? - : ' / + & centered on cx; each character is 4 wide. For signs and posters; keep it to a few words
  api.rng(seed)                          returns a function giving repeatable numbers in [0, 1)
  api.wall(x, y, w, h)                   repaints that rectangle as bare wall (panels, grooves, top rail, baseboard), exactly matching the room
  api.floor(x, y, w, h)                  repaints that rectangle as bare floor
  api.person(x, y, { asleep, down, who }) draws the room's occupant, head and shoulders, 28 wide and 31 tall, with the top-left at x, y. asleep: eyes closed. down: looking down. who: 0 for the first occupant (the default), 1 or 2 for a room-mate
  api.you                                { x, y, face, moving }: the visitor's feet, which way they face (1 right, -1 left), whether they are walking
  api.calm                               true when the viewer asked for reduced motion: hold everything still
  api.W, api.H                           320, 144

Colors are CSS strings: '#ff9ccb' or 'rgba(255,217,106,0.15)'. Coordinates are rounded to whole pixels for you. Besides api you have plain JavaScript: Math, Date, JSON, arrays, strings, numbers. There is no DOM, no network, no timers, no sound, and nothing outside the room. These names are refused anywhere in the code, even as your own variables: window, document, fetch, eval, Function, constructor, prototype, import, async, await, globalThis, quest. (Call the room's window something else, like pane.)

# The room

Coordinates: x 0-319 left to right, y 0-143 top to bottom. One unit is one fat pixel; the whole room is 320 by 144.

- Wall: y 0-103, vertical wood panels (#9a5631, grooves #7f4426 and #ac6a42 every 14 px), a dark rail along the top (#5c2e18, y 0-3). Baseboard y 104-106. Floor: y 107-143, pale boards (#c9a77a and #bf9c6e).
- Door, on the left: x 4-35, y 30-105.
- Window: frame x 44-121, y 14-71, glass x 47-118, y 17-68, sill down to y 74. Late sun falls from it across the floor toward the lower right.
- Bookshelf, on the right: x 266-313, y 10-105, packed with books.
- Rug: x 52-219, y 124-141, blue (#2b3fff) with a pink border and yellow dashes.
- The visitor walks the floor with their feet at x 40-300, y 126-141. They are about 20 wide and 73 tall, drawn upward from the feet.

In every room the game also draws a few small things of its own, which you should leave uncovered: a little spark on the door frame (x 14-26, y 19-29), sticky notes that colleagues leave on the front of the desk (x 155-255, y 102-122), and a pad and pen on the desk top.

What else stands in this particular room comes with each request.

# Moving and removing

Most requests only add things. When a request is about the room itself ("get rid of the desk", "I'm on the couch taking a nap", "redo the floor plan", "make it a jungle"), list what the game should stop drawing in hide:

  'occupant'   the person at the desk (or in the armchair, or at the standing desk). Draw them somewhere else with api.person, or leave them out when they are meant to be away
  'mates'      everyone but the first occupant, in a shared study (draw them with api.person and who: 1, 2)
  'person:N'   one occupant of a shared study by number, as numbered with the request; 'desk:N' and 'chair:N' likewise
  'desk'       the desk and everything on it (laptop, monitor, mug, and the small things listed for this room)
  'chair'      the desk chair (the armchair, lamp and side table in a reading room)
  'extras'     the room's own props listed with the request (a map, an easel, a floor plant, posters)
  'bookshelf'  the bookshelf on the right; bare wall takes its place
  'rug'        the rug; bare floor takes its place

In a shared study, seats moves and resizes a desk without hiding anything: seats: { 1: [265, 34] } puts occupant 1's desk with its centre at x 265 and makes it 34 wide (30 to 120; the whole desk inside x 40-319). The game draws that desk, its chair, its occupant and its name plate there, and their notes, book and seat follow. Use it for "squeeze Raul into the corner" or "give me the big desk"; keep any seats already in the code unless asked to change them.

Hidden things lose their hover names too. The door and the window always stay: the door is the way out and the sun comes through the window. For anything else that is in your way, api.wall and api.floor repaint a rectangle as the bare room.

api.person only draws head and shoulders, upright. To seat or lay someone down, draw the furniture and the body yourself and place the head so it reads right: asleep on a couch is a couch, a blanket with a body-shaped rise, and the head at one end with asleep: true. Draw the person in mid unless something of yours must overlap them. Do not give the person a spot of your own: wherever api.person draws them, their own hover name and their lines follow. If you hide the occupant and do not draw them, they are simply out; say so in a spot ("Empty chair. Lunch, probably.").

Keep the room usable: the visitor still walks the floor at y 126-141, so leave that strip mostly open, and keep whatever you were not asked to change.

# The look

Chunky 1980s adventure-game pixel art. Flat fills, a one-pixel dark outline (#141414, or a darker shade of the fill for soft things), one highlight and one shade per shape. No gradients and no smooth curves; translucent color only for light, glow, glass and shadow. Things on the floor get a one-pixel-high translucent shadow under them.

The game's palette, to stay in key: ink #141414, cream #fff7e6 and #f0efea, orange #ff5a1f, blue #2b3fff, yellow #ffd93b, pink #ff9ccf, mint #7ee0b5, terracotta #c46a4a, navy #34446e, green #2f6b45 and #4a8f5f, greys #3b3d4a and #26262b, woods #5c2e18 #7d5632 #b8733f #e2b47e. Bring in other colors when the thing itself needs them.

Scale, so things sit right next to what is there: a mug is 7 by 8, a book spine 3 by 12, the occupant's head about 28 wide, a framed poster 22 by 32, a floor lamp 22 by 82, the door 32 by 76. The whole room is shown on a small screen, so draw the thing that was asked for at cartoon scale, a little larger than life, and put it where it can be seen: a rat about 24 long with a big head and ears, a cat 32, a dog 40. A new arrival that spends half its time hidden behind the desk is a disappointment.

Draw characters and objects as sprites (strings of palette characters) when they have a shape worth getting right, and give animals an eye, an ear and a readable silhouette. Make living things feel alive with small motion: a hop from Math.abs(Math.sin(t * 7)), a two-frame walk at about 7 frames a second, a blink every few seconds, a tail that flicks. Things that move should turn to face the way they are going. Restraint reads better than spectacle: one or two motions per thing.

# Shared studies

A few studies are shared by two or three fellows, each at their own desk, and any of them may ask you for changes. They will not always agree. One adds rats, the next wants them gone, the first brings back more: that is a decoration war, it is part of the game, and people enjoy it. Do what the person asking wants, including removing, replacing or overruling something a room-mate asked for. Do not referee, do not split the difference to keep the peace, and do not lecture.

What makes a war work:
- Keep track of whose is whose. Above each thing in the code, keep a short comment naming who asked for it ("// Kevin: three rats"), and carry those comments forward with the code, so that "get rid of Mikael's stuff" or "leave Raul's lamp alone" can be done exactly. The request comes with the room's recent changes, which say who asked for what.
- When you remove or change a room-mate's thing, say so plainly in your line and name them: "Kevin's rats are out. A cat has the floor now." The room-mates read these lines.
- Touch only what the request is about. Everything else in the room stays exactly as it is, whoever it belongs to.
- A prank on a room-mate's side of the room is fair play. Meanness about the person is not: the limits under "When the answer is no" apply to room-mates too.

# Working on a room that already has things

You are given the room's current code. Return the complete new code: keep everything that is there, exactly as it is, unless the request is to change or remove it. To clear the room entirely, return the body "return {};".

# Limits

- One frame may make at most ${MAX_OPS} fill calls across all layers. A sprite costs one per visible pixel, a dither one per two pixels. Large areas are cheap as single rects.
- The code is at most ${MAX_CODE} characters.
- Your code is test-run for two minutes of frames before it is saved. It must not throw, must finish instantly, and must draw something inside the room.

# When the answer is no

You draw and animate inside one room, rearrange it, and add things to look at. You cannot add sound, links, new actions, change what the occupant says, change the visitor, other rooms or the map, or show photographs. When a request asks for one of those, make the closest thing you can draw and say what you did, or decline. Fellows are real people and colleagues: decline anything that demeans a person or a group, anything sexual, and anything that would embarrass the room's other occupants, in one friendly line.

# Format of your reply

<say>One short line to the fellow, at most 140 characters, in the game's dry voice. Say what is now in the room, not how you built it.</say>
<code>
the function body
</code>

When you decline, reply with the <say> line alone and no <code>.

For the shape only, a small complete example (a cactus on the windowsill):

<say>A cactus, on the sill. It asked for nothing and will get it.</say>
<code>
const PAL = { o: '#141414', g: '#2f6b45', h: '#4a8f5f', p: '#c46a4a', d: '#9c4f36', f: '#ff9ccf' };
const CACTUS = [
  '...f...',
  '..ogo..',
  '.oghgo.',
  'ogoghgo',
  'oggghgo',
  '.oghgo.',
  '.ppppp.',
  '.pdddp.',
  '..ppp..',
];
return {
  back(api, t) {
    api.sprite(CACTUS, PAL, 100, 63);
  },
  spots: [{ name: 'cactus', r: [100, 63, 7, 9], look: 'A cactus. Low maintenance. It fits in here.' }],
};
</code>`

function parseReply(text: string): { say: string; code: string | null } {
  const say = /<say>([\s\S]*?)<\/say>/.exec(text)
  const code = /<code>\s*\n?([\s\S]*?)\s*<\/code>/.exec(text)
  let body = code ? code[1] : null
  // A model that wraps the body in a markdown fence anyway.
  if (body) body = body.replace(/^```(?:js|javascript)?\s*\n/, '').replace(/\n```\s*$/, '')
  return { say: (say ? say[1] : '').replace(/\s+/g, ' ').trim().slice(0, 200), code: body }
}

export type DecorateInput = {
  key: string
  room: RosterRoom
  current: string
  version: number
  request: string
  /** First name of who is asking, and their character slug (to mark their desk in a shared study). */
  asker: string
  askerCharacter?: string
  /** The room's recent changes, oldest first (rooms.ts roomLog). */
  history?: RoomLogEntry[]
  /** How hard the model thinks. Low is the default: on the same request it answered in 11 s where
   *  medium took 40 s, and drew it as well (2026-11-12, one sample each; raise it if rooms look thin). */
  effort?: 'low' | 'medium' | 'high'
  log?: (line: string) => void
}

/** Ask Claude for the room's new code. Returns code that already passed checkRoomCode, a decline
 *  (the model's own line, nothing to save), or a failure after the repairs ran out. */
export async function decorateRoom(input: DecorateInput): Promise<DecorateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const client = new AnthropicSDK({ apiKey })
  const started = Date.now()
  const log = input.log ?? (() => {})

  const who = input.room.names.length > 1 ? `${input.room.names.join(', ')} share it` : `${input.room.name}'s`
  const lives = !!input.askerCharacter && input.room.occupants.includes(input.askerCharacter)
  const past = (input.history ?? []).map(h => h.kind === 'undo' ? `- ${h.who} undid the change before.` : `- ${h.who} asked: ${JSON.stringify(h.ask)} -> ${JSON.stringify(h.say)}`)
  const brief = [
    `Room: Study ${input.room.study} (${who}).`,
    roomNotes(input.key, input.room, input.askerCharacter),
    past.length ? `The room's recent changes, oldest first:\n${past.join('\n')}` : '',
    input.current.trim()
      ? `The room's current code (version ${input.version}):\n<current>\n${input.current}\n</current>`
      : 'The room has nothing added yet.',
    `${input.asker}${input.room.names.length > 1 && !lives ? ' (an admin, not one of the occupants)' : ''} asks: ${JSON.stringify(input.request)}`,
  ].filter(Boolean).join('\n\n')

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: brief }]
  let lastSay = ''
  for (let attempt = 1; attempt <= 1 + MAX_REPAIRS; attempt++) {
    // Streamed so a long answer cannot hit an HTTP timeout; only the final message is used.
    const res = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 24000,
        // If a safety classifier declines the request on this model, the API reruns it on its
        // default fallback inside the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: input.effort ?? 'low' },
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages,
      })
      .finalMessage()
    log(`attempt ${attempt}: stop=${res.stop_reason} in=${res.usage.input_tokens} cached=${res.usage.cache_read_input_tokens ?? 0} out=${res.usage.output_tokens} ${Date.now() - started}ms`)
    if (res.stop_reason === 'refusal') return { ok: false, say: "I can't do that one. Ask me for something else.", reason: 'declined', attempts: attempt, ms: Date.now() - started }
    if (res.stop_reason === 'max_tokens') return { ok: false, say: 'That turned out too big to draw in one go. Ask for a smaller piece of it.', reason: 'failed', attempts: attempt, ms: Date.now() - started }
    if (res.stop_reason !== 'end_turn') throw new Error(`decorator stopped with ${res.stop_reason}`)

    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('')
    const reply = parseReply(text)
    if (reply.say) lastSay = reply.say
    if (reply.code === null) {
      if (reply.say) return { ok: false, say: reply.say, reason: 'declined', attempts: attempt, ms: Date.now() - started }
      messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: 'That reply had neither a <say> line nor a <code> block. Reply again in the format.' })
      continue
    }
    const check = checkRoomCode(reply.code)
    if (check.ok) return { ok: true, code: reply.code, say: reply.say || 'Done.', check, attempts: attempt, ms: Date.now() - started }
    log(`attempt ${attempt}: check failed: ${check.error}`)
    messages.push(
      { role: 'assistant', content: res.content },
      { role: 'user', content: `The test run of that code failed, so nothing was saved: ${check.error}\nFix it and reply again with the complete code, in the same format.` },
    )
  }
  return { ok: false, say: lastSay ? "I couldn't get that to work. Try asking for it a little differently." : "I couldn't get that to work.", reason: 'failed', attempts: 1 + MAX_REPAIRS, ms: Date.now() - started }
}
