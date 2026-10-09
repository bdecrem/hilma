// Design artifact: the daily-call language app (working name Polly).
// Everything a screen shows or a note says lives here, so the copy can be
// reviewed in one place and the components stay dumb.

export type ScreenId =
  | 'ob-welcome'
  | 'ob-language'
  | 'ob-level'
  | 'ob-time'
  | 'message'
  | 'today'
  | 'call'
  | 'summary'
  | 'level'
  | 'notebook'
  | 'settings'

export type TodayState = 'before' | 'after' | 'missed'

export const ORDER: ScreenId[] = [
  'ob-welcome',
  'ob-language',
  'ob-level',
  'ob-time',
  'message',
  'today',
  'call',
  'summary',
  'level',
  'notebook',
  'settings',
]

export const WORKING_NAME = 'Polly'
export const DAILY_TIME = '8:00 AM'
export const DAY = 12

export type ScreenNote = {
  id: ScreenId
  name: string
  purpose: string
  notes: string[]
  open?: string[]
}

export const SCREENS: ScreenNote[] = [
  {
    id: 'ob-welcome',
    name: 'Welcome',
    purpose: 'Say the whole product in one breath, then one button.',
    notes: [
      'One headline, two lines of body, one primary button. No carousel, no feature tour.',
      'The empty area above the headline is reserved for the brand: an illustration or the mascot.',
      '"Sign in" is a text link for returning users. The app has no other entry point.',
    ],
  },
  {
    id: 'ob-language',
    name: 'Language',
    purpose: 'The one real choice the user makes.',
    notes: [
      'A radio list, one column, most common languages first. One language per account in v1.',
      'No flags. They stand for countries, not languages, and they age badly.',
    ],
    open: ['Launch set. Spanish only would shorten voice QA by a lot.'],
  },
  {
    id: 'ob-level',
    name: 'Starting point',
    purpose: 'A rough level without a test.',
    notes: [
      'Three self-report cards in plain words, not CEFR codes. The first call does the real placement; the Level screen shows the result.',
      'Nobody fails onboarding. There is no wrong answer on this screen.',
    ],
  },
  {
    id: 'ob-time',
    name: 'Time and number',
    purpose: 'The commitment: when, and where the text goes.',
    notes: [
      'Preset times as chips plus "other". The time is the only daily touchpoint, so every summary repeats it.',
      'One line under the number states the whole notification policy: one text a day, nothing else.',
      'The button starts the first call right away. Day one ends with a call, not with an empty home screen.',
    ],
  },
  {
    id: 'message',
    name: 'The daily text',
    purpose: 'The front door. Most days start here, not on the home screen.',
    notes: [
      'Plain text, no emoji, under 100 characters: the topic, the length, one link. The link opens Today with the call ready.',
      'The previous day’s recap sits above it, so the thread reads as a log.',
      'Sent at the user’s hour in their time zone. One message a day; no evening reminder in v1.',
    ],
    open: ['SMS or iMessage. The prototype shows a generic thread.'],
  },
  {
    id: 'today',
    name: 'Today',
    purpose: 'One card, one button. Everything else is a quiet row.',
    notes: [
      'Three states: before the call, after the call, a missed day. Only the card changes.',
      'The streak is a day count in the corner, never a flame. On a missed day it resets and the best is shown beside it; the level never drops.',
      'Level and Notebook are rows under the card, not tabs. There is no tab bar because the app has one action.',
      'After the call the card closes the day and names tomorrow’s time and topic. There is no second call.',
    ],
  },
  {
    id: 'call',
    name: 'The call',
    purpose: 'Three minutes of conversation. The interface gets out of the way.',
    notes: [
      'Hands-free. The tutor speaks first. A pulsing disk shows who is talking; the disk is the mascot’s slot.',
      'The transcript shows the last few turns only. It is for glancing, not reading.',
      'A fix is spoken as a recast inside the tutor’s next line and shown once under the user’s turn as a quiet label. Never a modal, never red.',
      'The new word arrives inside a question, so the user has to use it before the call ends.',
      'The timer counts down and the tutor wraps up on her own. End is a ghost button; most calls end themselves.',
      'Prototype note: the call plays itself at about nine times speed.',
    ],
  },
  {
    id: 'summary',
    name: 'After the call',
    purpose: 'The lesson and the test, shown as a receipt.',
    notes: [
      'Always four cards in a fixed order: one fix, one new word, what came back, the level. Fits one screen on a 6.1-inch phone.',
      'The fix shows wrong and right plus one sentence of why. The word shows the sentence it was heard in.',
      'The level bar moves a visible amount every day and the caption estimates the next level in weeks.',
      'Ends with tomorrow’s time and topic and a single Done. No share button in v1.',
    ],
  },
  {
    id: 'level',
    name: 'Level',
    purpose: 'The one number, explained.',
    notes: [
      'The CEFR ladder with plain-English names. The current rung is highlighted, past rungs are checked, the rest are future.',
      '"What moved" is three plain sentences from the last month of calls, not a chart.',
      'Three totals at the bottom. No leaderboard, no friends.',
    ],
  },
  {
    id: 'notebook',
    name: 'Notebook',
    purpose: 'Everything the calls taught, as a list. Nothing to do here.',
    notes: [
      'One row per day: date, topic, the fix, the word. Newest first.',
      'Deliberately not a flashcard deck. Recycling happens inside the calls; this is for looking something up.',
    ],
    open: ['Search once the list is long. Tapping a row to replay that moment of the call.'],
  },
  {
    id: 'settings',
    name: 'Settings',
    purpose: 'Few settings. The time is the important one.',
    notes: [
      'Call time is first. Length is fixed at three minutes and shown, not editable.',
      'Topics are preferences, not a curriculum. The tutor picks each day’s topic.',
      '"Pause for a week" instead of a mute. Pausing stops the texts and keeps the streak.',
    ],
  },
]

export type FlowStep = { id: ScreenId; state?: TodayState; label?: string }
export type Flow = { name: string; blurb: string; steps: FlowStep[] }

export const FLOWS: Flow[] = [
  {
    name: 'First day',
    blurb: 'Four screens, then straight into a call. Onboarding ends in the product, not on an empty home.',
    steps: [
      { id: 'ob-welcome' },
      { id: 'ob-language' },
      { id: 'ob-level' },
      { id: 'ob-time' },
      { id: 'call', label: 'First call' },
      { id: 'summary' },
      { id: 'today', state: 'after', label: 'Today, done' },
    ],
  },
  {
    name: 'Every day',
    blurb: 'A text at your hour, one tap, three minutes, one screen of what happened.',
    steps: [
      { id: 'message' },
      { id: 'today', state: 'before' },
      { id: 'call' },
      { id: 'summary' },
      { id: 'today', state: 'after', label: 'Today, done' },
    ],
  },
  {
    name: 'From Today',
    blurb: 'The two quiet rows and the gear. Each is one level deep and goes back to Today.',
    steps: [{ id: 'today', state: 'before' }, { id: 'level' }, { id: 'notebook' }, { id: 'settings' }],
  },
]

export const PRINCIPLES: { title: string; body: string }[] = [
  { title: 'One thing a day', body: 'The app has one action: start the call. Everything else is a row or a receipt.' },
  { title: 'The text is the front door', body: 'A message at your hour, not a badge. Most days begin in Messages, not on the home screen.' },
  { title: 'No lesson, no test', body: 'The fix, the recycled words and the new word live inside the conversation and are shown once, afterward.' },
  { title: 'Progress is one number', body: 'The level moves from the calls. Streaks reset; the level never drops.' },
  { title: 'Quiet after', body: 'The summary fits one screen and ends with tomorrow’s time. Then the app is done with you.' },
]

// The scripted call. `ms` is the prototype duration of the turn (about 9x real time).
export type Turn = { who: 'tutor' | 'you'; text: string; fix?: string; ms: number }

export const CONNECT_MS = 1400
export const WRAP_MS = 1800
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
  { who: 'tutor', text: 'Perfecto. Mañana hablamos de un viaje que quieres hacer. ¡Hasta mañana!', ms: 3000 },
]
export const CALL_TOTAL_MS = CONNECT_MS + SCRIPT.reduce((s, t) => s + t.ms, 0) + WRAP_MS
// A mid-call moment for static thumbnails: just after the recast.
export const CALL_STILL_MS = CONNECT_MS + SCRIPT.slice(0, 5).reduce((s, t) => s + t.ms, 0) - 600

export const TODAY = {
  topic: 'Your weekend',
  tomorrow: 'A trip you want to take',
  fix: { wrong: 'era mucho gente', right: 'había mucha gente', why: '“There was” is había, and gente is feminine, so mucha.' },
  word: { word: 'madrugar', meaning: 'to get up very early', heard: '¿Madrugaron para ir?' },
  recycled: ['la playa', 'el fin de semana', 'comimos'],
  level: { code: 'A2', name: 'Elementary', pct: 62, delta: 2, next: 'B1', eta: 'about five weeks at this pace' },
}

export const LADDER = [
  { code: 'A1', name: 'Beginner' },
  { code: 'A2', name: 'Elementary' },
  { code: 'B1', name: 'Intermediate' },
  { code: 'B2', name: 'Upper intermediate' },
  { code: 'C1', name: 'Advanced' },
  { code: 'C2', name: 'Mastery' },
]

export const MOVED = [
  'Past-tense slips: nine in your first week, two this week.',
  'Your answers got longer: about six words, now about eleven.',
  'You stopped translating "there is" from English.',
]

export const TOTALS = [
  { n: '12', label: 'calls' },
  { n: '36', label: 'minutes' },
  { n: '58', label: 'words' },
]

export const NOTEBOOK = [
  { date: 'Thu Oct 9', topic: 'Your weekend', fix: 'había mucha gente', wrong: 'era mucho gente', word: 'madrugar', meaning: 'to get up very early' },
  { date: 'Wed Oct 8', topic: 'Food you cook', fix: 'me gusta cocinar', wrong: 'me gusto cocinar', word: 'la sartén', meaning: 'frying pan' },
  { date: 'Tue Oct 7', topic: 'Your commute', fix: 'voy en tren', wrong: 'voy por tren', word: 'el atasco', meaning: 'traffic jam' },
  { date: 'Mon Oct 6', topic: 'A friend', fix: 'es alta', wrong: 'está alta', word: 'cercano', meaning: 'close, nearby' },
  { date: 'Sun Oct 5', topic: 'Your morning', fix: 'a las siete', wrong: 'a siete', word: 'desayunar', meaning: 'to have breakfast' },
  { date: 'Sat Oct 4', topic: 'Where you live', fix: 'vivo en el centro', wrong: 'vivo al centro', word: 'el barrio', meaning: 'neighborhood' },
]

export const LANGUAGES = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese']
export const STARTS = [
  { title: 'Starting from zero', body: 'A few words, maybe none.' },
  { title: 'I can get by', body: 'Ordering, directions, simple small talk.' },
  { title: 'I can hold a conversation', body: 'Slowly, with mistakes, but it works.' },
]
export const TIMES = ['7:00', '8:00', '12:30', '18:00', '21:00']

export type Token = { name: string; value: string; role: string }
export const COLOR_TOKENS: Token[] = [
  { name: '--dc-accent', value: '#1f1f1f', role: 'Primary buttons, links, the active rung. Placeholder: the brand owns this.' },
  { name: '--dc-ink', value: '#141414', role: 'Text.' },
  { name: '--dc-ink-2', value: '#5c5c5c', role: 'Secondary text.' },
  { name: '--dc-ink-3', value: '#9a9a9a', role: 'Captions, hints, future rungs.' },
  { name: '--dc-line', value: '#e4e4e1', role: 'Hairlines, card borders, progress tracks.' },
  { name: '--dc-app-bg', value: '#f7f7f5', role: 'Screen background inside the app.' },
  { name: '--dc-card', value: '#ffffff', role: 'Cards and the tutor’s bubbles.' },
  { name: '--dc-fill', value: '#ebebe8', role: 'Your bubbles, chips at rest, the disk.' },
]

export const TYPE_SCALE = [
  { name: 'Display', spec: '28 / 34, semibold', use: 'Screen titles, the level code' },
  { name: 'Title', spec: '20 / 26, semibold', use: 'Card titles, the topic' },
  { name: 'Body', spec: '16 / 24, regular', use: 'Everything readable' },
  { name: 'Secondary', spec: '14 / 20, regular', use: 'Rows’ values, the fix label' },
  { name: 'Caption', spec: '12 / 16, medium, +4% tracking, caps', use: 'Card eyebrows' },
]

export const ACCENTS = [
  { name: 'Ink (default)', value: '#1f1f1f' },
  { name: 'Blue', value: '#2f54eb' },
  { name: 'Green', value: '#1d7a4d' },
  { name: 'Coral', value: '#d9533b' },
  { name: 'Plum', value: '#6b3fa0' },
]

export const HANDOFF = {
  brand: [
    'The name. Polly is a working name and appears in copy as a plain word, easy to replace.',
    'The accent and any secondary palette. Every tinted element inks from one token.',
    'The type family. Inter is the neutral stand-in; the scale and weights are set.',
    'The illustration on Welcome and the disk on the call screen. Both are the mascot’s slots.',
    'The app icon, and the sound for the text and for the start of the call.',
  ],
  fixed: [
    'Eleven screens, three flows, one primary button per screen.',
    'The copy’s tone: plain, short, second person, no exclamation marks outside the tutor’s Spanish.',
    'The text message: no emoji, under 100 characters, one link.',
    'The summary’s four cards and their order.',
  ],
}
