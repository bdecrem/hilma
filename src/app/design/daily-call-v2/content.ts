// Daily call v2: the high-fidelity pass. Three parts a day (talk, three
// things, cards), a map with a streak, no setup screens. All copy here.

export type ScreenId = 'map' | 'talk' | 'things' | 'cards' | 'done'
export type MapState = 'morning' | 'after-talk' | 'after-things' | 'paused' | 'done'

export const ORDER: ScreenId[] = ['map', 'talk', 'things', 'cards', 'done']
export const WORKING_NAME = 'Polly'
export const DAY = 12
export const STREAK = 12
export const DAILY_TIME = '8:00 AM'

export const TOPIC = 'Your weekend'
export const TOMORROW = 'A trip you want to take'

/* ---------- part 1: the call ---------- */
export type Turn = { who: 'tutor' | 'you'; text: string; fix?: string; ms: number }
export const CONNECT_MS = 1200
export const WRAP_MS = 1600
export const SCRIPT: Turn[] = [
  { who: 'tutor', text: '¡Hola! ¿Qué tal tu fin de semana?', ms: 2200 },
  { who: 'you', text: 'Fue bueno. Fui a la playa con mi hermana.', ms: 2400 },
  { who: 'tutor', text: '¡Qué bien! ¿Hacía buen tiempo?', ms: 2000 },
  { who: 'you', text: 'Sí, mucho sol. Pero era mucho gente.', fix: 'había mucha gente', ms: 2400 },
  { who: 'tutor', text: 'Había mucha gente, claro, un domingo de sol. ¿Y comieron algo rico?', ms: 3000 },
  { who: 'you', text: 'Sí, comimos paella en un restaurante pequeño.', ms: 2600 },
  { who: 'tutor', text: '¿Madrugaron para ir, o fueron tarde?', ms: 2200 },
  { who: 'you', text: '¿Madrugar?', ms: 1400 },
  { who: 'tutor', text: 'Levantarse muy temprano. ¿Madrugaron?', ms: 2200 },
  { who: 'you', text: 'No, no madrugamos. Fuimos a las once.', ms: 2400 },
  { who: 'tutor', text: 'Perfecto. Ahora, tres cosas de hoy. ¿Listo?', ms: 2600 },
]
export const CALL_TOTAL_MS = CONNECT_MS + SCRIPT.reduce((s, t) => s + t.ms, 0) + WRAP_MS
export const CALL_STILL_MS = CONNECT_MS + SCRIPT.slice(0, 5).reduce((s, t) => s + t.ms, 0) - 600

/* ---------- part 2: three things ---------- */
export type Thing = { kind: 'fix' | 'word' | 'phrase'; es: string; en: string; from: string }
export const THINGS: Thing[] = [
  { kind: 'fix', es: 'había mucha gente', en: 'there were a lot of people', from: 'You said: era mucho gente' },
  { kind: 'word', es: 'madrugar', en: 'to get up very early', from: 'Polly asked: ¿Madrugaron para ir?' },
  { kind: 'phrase', es: 'algo rico', en: 'something tasty', from: 'Polly asked: ¿Y comieron algo rico?' },
]
export const KIND_LABEL: Record<Thing['kind'], string> = { fix: 'Fix', word: 'New word', phrase: 'Phrase' }

/* ---------- part 3: the cards ---------- */
// Ten questions, no voice: five pick-the-answer, then five type-it. Fixed
// order so the game has a shape (easy first). A miss does not return; it
// shows the right answer and is weighted into tomorrow's call.
export type Question =
  | { kind: 'pick'; en: string; es: string; options: string[]; from: 'new' | number }
  | { kind: 'type'; en: string; es: string; from: 'new' | number }
export const QUESTIONS: Question[] = [
  { kind: 'pick', en: 'to get up very early', es: 'madrugar', options: ['madrugar', 'desayunar', 'acostarse', 'levantarse'], from: 'new' },
  { kind: 'pick', en: 'traffic jam', es: 'el atasco', options: ['el barrio', 'el atasco', 'la sart\u00e9n', 'el tren'], from: 10 },
  { kind: 'pick', en: 'there were a lot of people', es: 'hab\u00eda mucha gente', options: ['era mucha gente', 'estaba mucha gente', 'hab\u00eda mucha gente', 'hay mucho gente'], from: 'new' },
  { kind: 'pick', en: 'frying pan', es: 'la sart\u00e9n', options: ['la olla', 'la sart\u00e9n', 'el horno', 'el plato'], from: 11 },
  { kind: 'pick', en: 'something tasty', es: 'algo rico', options: ['algo raro', 'algo caro', 'algo nuevo', 'algo rico'], from: 'new' },
  { kind: 'type', en: 'I go by train', es: 'voy en tren', from: 10 },
  { kind: 'type', en: 'to have breakfast', es: 'desayunar', from: 8 },
  { kind: 'type', en: 'neighborhood', es: 'el barrio', from: 7 },
  { kind: 'type', en: 'close, nearby', es: 'cercano', from: 6 },
  { kind: 'type', en: 'I like to cook', es: 'me gusta cocinar', from: 11 },
]
export const COMING_BACK = ['madrugar', 'hab\u00eda mucha gente', 'algo rico', 'cercano']

/* ---------- the map ---------- */
// Days shown on the map, bottom to top. 14 is a weekly bonus node.
export const MAP_DAYS = [8, 9, 10, 11, 12, 13, 14, 15]
export const BONUS_EVERY = 7

/* ---------- notes ---------- */
export type ScreenNote = { id: ScreenId; name: string; purpose: string; notes: string[] }
export const SCREENS: ScreenNote[] = [
  {
    id: 'map',
    name: 'Map',
    purpose: 'The place you come back to. Today’s three steps on top, the trail of days underneath.',
    notes: [
      'The streak is the one number up top, with the flame. It counts days where all three steps were done.',
      'Today’s card lists the three parts in order and has one button: whichever part is next. Done parts get a check.',
      'The trail is a winding path of day nodes: done days filled in vermillion, today pulsing in sunflower, future days dashed. Every seventh day is a bonus node with a star.',
      'Five states, driven by the day: morning, after the talk, after the three things, cards paused, done. Leaving a part mid-way lands here with the place kept.',
    ],
  },
  {
    id: 'talk',
    name: 'Part 1 · Talk',
    purpose: 'Three minutes of conversation. Full-bleed ultramarine: this is the voice mode and it should feel like a different room.',
    notes: [
      'The parrot is the whole top half. Beak flaps while Polly talks; head tilts and the lime bars move while she listens.',
      'Last three turns as bubbles. Polly’s are paper, yours are glass. A fix shows once under your turn as a sunflower chip.',
      'Nothing to tap but End. The call ends itself and hands straight into the three things.',
      'Prototype plays itself at about nine times speed.',
    ],
  },
  {
    id: 'things',
    name: 'Part 2 · Three things',
    purpose: 'What today taught, one card at a time: Polly says it, you say it back, she says you got it.',
    notes: [
      'Three cards, three kinds, three colors on the tag: Fix (vermillion), New word (ultramarine), Phrase (sunflower).',
      'The Spanish is set big in the italic serif. That face is reserved for the language, nowhere else in the app.',
      'Each card runs listen → your turn → got it. The mic button is the only control; it is disabled while Polly speaks and becomes a lime check when you got it.',
      'Where it came from is on the card ("You said: era mucho gente"), so the thing is tied to a moment, not a list.',
      'A \u00d7 at the top left leaves to the map. Three things is short, so leaving restarts it next time.',
    ],
  },
  {
    id: 'cards',
    name: 'Part 3 \u00b7 Cards',
    purpose: 'The daily game, no voice: ten questions, five you pick and five you type. Leave any time; the map keeps your place.',
    notes: [
      'Two halves with a label on the card: Pick it (four Spanish options, tap one) for questions one to five, then Type it (a field, Check or Enter) for six to ten. Easy first, then harder.',
      'Ten segments across the top fill lime or vermillion. The counter is a running score, not points.',
      'Right: the option or the band turns lime with "Nice". Wrong: vermillion, and the right answer is shown next to it. Nothing comes back today; a miss is weighted into tomorrow\u2019s call.',
      'Typing is forgiving: case, accents and a leading el/la are ignored. Skip reveals the answer and counts as a miss.',
      'The \u00d7 at the top left leaves the game with progress kept. The map then reads "4 of 10, paused" and its button says Resume. There is no tunnel.',
      'Today\u2019s three things are in the ten, tagged New today; the rest are tagged by the day they were learned.',
    ],
  },
  {
    id: 'done',
    name: 'Day complete',
    purpose: 'The payoff: the streak ticks, the sun comes out, and you see what Polly will bring back tomorrow.',
    notes: [
      'One big sunflower disc behind a happy parrot. The number is the streak, not points.',
      'Three totals for the three parts: the talk\u2019s length, three things, the card score out of ten.',
      '"Coming back tomorrow" lists today’s new things and anything you missed. These are weighted into tomorrow’s conversation, which is what makes the loop a loop.',
      'One button, back to the map, where today’s node is now filled.',
    ],
  },
]

export const LOOP: { id: ScreenId; state?: MapState; label: string }[] = [
  { id: 'map', state: 'morning', label: 'Map, morning' },
  { id: 'talk', label: 'Talk' },
  { id: 'things', label: 'Three things' },
  { id: 'cards', label: 'Cards' },
  { id: 'done', label: 'Day complete' },
  { id: 'map', state: 'done', label: 'Map, done' },
]

export const PALETTE = [
  { name: 'Paper', value: '#FFF4E3', role: 'Screen background. Warm, not white.' },
  { name: 'Ink', value: '#16121C', role: 'Text, the trail, outlines.' },
  { name: 'Vermillion', value: '#FF4B1F', role: 'The action color: buttons, done days, the parrot. Also the Fix tag and a miss.' },
  { name: 'Ultramarine', value: '#3D3BFF', role: 'Voice. The whole call screen, the crest, the New word tag.' },
  { name: 'Sunflower', value: '#FFC31F', role: 'Reward. Streak, today’s node, the beak, the Phrase tag, "got it".' },
  { name: 'Lime', value: '#B6F23A', role: 'Right answers and the listening bars.' },
  { name: 'Card', value: '#FFFDF8', role: 'Cards on paper.' },
  { name: 'Line', value: '#E8DECB', role: 'Hairlines and pending segments.' },
]

export const TYPE = [
  { name: 'Bricolage Grotesque', role: 'Display: titles, the day number, the streak. Heavy, a little condensed, friendly without being round.', sample: 'Day 12 complete' },
  { name: 'Instrument Serif italic', role: 'The language. Every Spanish phrase on a card is set in this and nothing else is.', sample: 'había mucha gente', italic: true },
  { name: 'Instrument Sans', role: 'Everything else: body, labels, buttons.', sample: 'Say it in Spanish' },
]

export const MOTION = [
  'The parrot is always slightly alive: a slow breath at rest, a blink every few seconds.',
  'Talking: beak flaps and the body bobs. Listening: head tilts toward you, the lime bars move. Happy: a hop.',
  'Cards slide left when answered; the next one rises from underneath. A picked option snaps to lime or vermillion; a "got it" bursts a few sunflower dots.',
  'On the map, today’s node pulses until the day is done, then fills with a short pop and the path to the next node draws itself.',
  'Sound: a soft two-note chime for "got it", a warmer three-note one for day complete. Nothing on a miss.',
]

export const CHANGES = [
  'Three parts instead of one: the call, the three things, the cards. The day is complete only when all three are.',
  'The summary receipt became an activity: Polly says each thing, you say it back.',
  'The card round is a ten-question game with no voice: pick five, type five, leave any time.',
  'A map with a streak replaced the quiet Today screen as the home.',
  'Onboarding, the text message, Level, Notebook and Settings are out of scope for this pass.',
]
