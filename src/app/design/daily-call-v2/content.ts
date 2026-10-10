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
export const COMING_BACK = ['madrugar', 'hab\u00eda mucha gente', 'algo rico', 'voy en tren']

// The prototype plays a shortened day so a click-through takes about a
// minute: one of the three things, then one pick and one type question of
// the ten. Counters and segments keep the real shape and visibly skip ahead.
export const WALK = { things: [0], questions: [0, 5] }

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
    purpose: 'Home. Today’s three steps on top, the trail of days below.',
    notes: [
      'One button: whichever part is next. The streak is the only number.',
      'Done days vermillion, today pulsing sunflower, every seventh a star.',
      'Five states: morning, after the talk, after the things, paused, done.',
    ],
  },
  {
    id: 'talk',
    name: 'Part 1 · Talk',
    purpose: 'Three minutes of conversation, full-bleed ultramarine: a different room.',
    notes: [
      'The parrot fills the top half: beak flaps to talk, head tilts to listen.',
      'Last three turns as bubbles. A fix shows once as a sunflower chip.',
      'Nothing to tap but End. It hands straight into the three things.',
    ],
  },
  {
    id: 'things',
    name: 'Part 2 · Three things',
    purpose: 'Polly says it, you say it back, she says you got it.',
    notes: [
      'Three tags, three colors: Fix, New word, Phrase.',
      'The Spanish is the italic serif, and nothing else is.',
      'The mic is the only control; it turns into a lime check.',
    ],
  },
  {
    id: 'cards',
    name: 'Part 3 \u00b7 Cards',
    purpose: 'Ten questions, no voice: pick five, type five. Leave any time.',
    notes: [
      'Ten segments fill lime or vermillion. A miss shows the answer.',
      'Typing ignores case, accents and a leading el/la.',
      '\u00d7 keeps your place; the map says Resume.',
    ],
  },
  {
    id: 'done',
    name: 'Day complete',
    purpose: 'The streak ticks, and you see what comes back tomorrow.',
    notes: [
      'A big sunflower disc behind a happy parrot.',
      'Misses and new things feed tomorrow’s call. That closes the loop.',
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
  { name: 'Paper', value: '#FFF4E3', role: 'Background' },
  { name: 'Ink', value: '#16121C', role: 'Text, trail' },
  { name: 'Vermillion', value: '#FF4B1F', role: 'Action, miss' },
  { name: 'Ultramarine', value: '#3D3BFF', role: 'Voice' },
  { name: 'Sunflower', value: '#FFC31F', role: 'Reward' },
  { name: 'Lime', value: '#B6F23A', role: 'Right' },
  { name: 'Card', value: '#FFFDF8', role: 'Cards' },
  { name: 'Line', value: '#E8DECB', role: 'Hairlines' },
]

export const TYPE = [
  { name: 'Bricolage Grotesque', role: 'Display', sample: 'Day 12 complete' },
  { name: 'Instrument Serif italic', role: 'The language, only', sample: 'había mucha gente', italic: true },
  { name: 'Instrument Sans', role: 'Everything else', sample: 'Say it in Spanish' },
]



/* ---------- the three looks (2026-10-09) ---------- */
export type Look = { slug: 'arcade' | 'candy' | 'sticker'; name: string; blurb: string }
export const LOOKS: Look[] = [
  {
    slug: 'arcade',
    name: 'Arcade',
    blurb: 'Neon on deep space, a pixel parrot.',
  },
  {
    slug: 'candy',
    name: 'Candy',
    blurb: 'Pastel sky, jelly buttons, a gummy parrot.',
  },
  {
    slug: 'sticker',
    name: 'Sticker',
    blurb: 'Zine white, fat outlines, die-cut stickers.',
  },
]
