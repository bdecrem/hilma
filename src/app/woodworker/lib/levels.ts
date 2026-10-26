// The ten rooms, in two chapters: five at home with Cyriel, then the week they
// keep not being there. Layouts and starts come from scripts/woodworker/gen.ts
// (the espresso cupboard is the original); every par is the solver's true
// minimum, proven by scripts/woodworker/check.ts.
import type { SlideLevel, SlideState } from './slide'
import type { SwingLevel, SwingState } from './swing'
import type { TiltLevel, TiltState } from './tilt'
import type { LinkedLevel, LinkedState } from './linked'
import type { BoxLevel, BoxState } from './box'

interface Room {
  id: string
  name: string
  /** What you are after. */
  item: string
  par: number
  note: string
  how: string
  win: string
  /** [at or under par, over par]. */
  quips: [string, string]
  /** The art for the item and where it goes, when it isn't the first chapter's. */
  skin?: 'can' | 'treats' | 'mug' | 'licence' | 'present'
  /** Cyriel isn't home: how their note reached you, and how often they pick up. */
  away?: Away
}
export interface Away {
  /** What the note is written on. */
  kind: 'postcard' | 'texts' | 'tissue' | 'voicemail'
  sig: string
  /** What they say each time you call them for a hint; there are this many calls. */
  calls: string[]
  /** The Hint button, while they're away. */
  out: string
}
export type Level =
  | (Room & { mech: 'slide'; data: SlideLevel; start: SlideState })
  | (Room & { mech: 'swing'; data: SwingLevel; start: SwingState })
  | (Room & { mech: 'tilt'; data: TiltLevel; start: TiltState })
  | (Room & { mech: 'linked'; data: LinkedLevel; start: LinkedState })
  | (Room & { mech: 'box'; data: BoxLevel; start: BoxState })

// The original cupboard, as [x, y, length, horizontal, label].
const espresso: [number, number, number, boolean, string][] = [
  [0, 2, 2, true, 'Ristretto'],
  [1, 0, 2, false, 'Mugs'],
  [4, 3, 2, true, 'Spices'],
  [2, 1, 2, true, 'More spices'],
  [5, 0, 3, false, 'Broom'],
  [4, 5, 2, true, 'Lids'],
  [2, 5, 2, true, 'Other lids'],
]

// The hall cupboard, the same way round as the espresso one.
const hall: [number, number, number, boolean, string][] = [
  [0, 2, 2, true, 'Watering can'],
  [5, 4, 2, false, 'Wellies'],
  [4, 1, 2, true, 'Paint'],
  [4, 2, 3, false, 'Ironing board'],
  [3, 0, 3, false, 'Hoover'],
  [2, 3, 2, true, 'Toolbox'],
  [2, 4, 2, true, 'Picnic'],
  [5, 2, 2, false, 'Brolly'],
  [2, 5, 2, true, 'Sledge'],
]

export const CHAPTERS = [
  { title: 'At home', from: 0 },
  { title: "Cyriel's week", from: 5 },
]

export const LEVELS: Level[] = [
  {
    id: 'espresso',
    mech: 'slide',
    name: 'Espresso',
    item: 'Ristretto',
    par: 5,
    note: "Built you a capsule cupboard. It's behind the spice drawer, which is behind the other spice drawer. Very secure.",
    how: 'Slide drawers along their length until the capsule gets out through the gap on the right. Drag, or use the arrow keys.',
    win: 'Espresso, served',
    quips: ['Told you it was secure.', 'Took you less time than it took me to build.'],
    data: {
      exitRow: 2,
      pieces: espresso.map(([x, y, len, h, label]) => ({ label, h, len, line: h ? y : x })),
    },
    start: espresso.map(([x, y, , h]) => (h ? x : y)),
  },
  {
    id: 'fridge',
    mech: 'swing',
    name: 'Fridge',
    item: 'Milk',
    par: 9,
    note: 'Gave the fridge proper cabinet doors. Seven of them, all on good brass hinges. They do bump into each other a bit.',
    how: 'Tap a door to swing it; its arc has to be clear. Drag the milk in straight lines to the gap on the right.',
    win: 'Milk, poured',
    quips: ['Seven doors. Zero drafts.', 'I may have hung the butter door upside down.'],
    data: {
      exit: [5, 2],
      walls: [],
      doors: [
        { label: 'Butter', hinge: [4, 1], len: 2, dirs: [1, 0] },
        { label: 'Freezer', hinge: [5, 3], len: 2, dirs: [1, 2] },
        { label: 'Eggs', hinge: [0, 2], len: 2, dirs: [1, 0] },
        { label: 'Cheese', hinge: [3, 4], len: 2, dirs: [0, 1] },
        { label: 'Door rack', hinge: [2, 2], len: 3, dirs: [3, 2] },
        { label: 'Crisper', hinge: [2, 4], len: 2, dirs: [2, 1] },
        { label: 'Pickles', hinge: [3, 2], len: 2, dirs: [2, 1] },
      ],
    },
    start: { doors: [0, 1, 0, 1, 0, 1, 1], milk: 30 },
  },
  {
    id: 'breakfast',
    mech: 'tilt',
    name: 'Breakfast',
    item: 'Egg',
    par: 7,
    note: "The counter wasn't level, so now it tips. On purpose. The egg goes in the pan. Mind the knot hole, and mind the egg.",
    how: "Tilt the counter with the arrows, a swipe, or the arrow keys. Everything rolls until it hits something. Get the egg into the pan.",
    win: 'Egg, fried',
    quips: ['Sunny side up. Like the counter.', 'We are now out of eggs.'],
    data: {
      nails: [[3, 3], [2, 0], [0, 0], [0, 1], [4, 4], [1, 4]],
      holes: [[3, 0]],
      pan: [3, 4],
      rollers: [
        { kind: 'egg', label: 'Egg' },
        { kind: 'onion', label: 'Onion' },
        { kind: 'jar', label: 'Jam' },
      ],
    },
    start: [9, 18, 35],
  },
  {
    id: 'cutlery',
    mech: 'linked',
    name: 'Cutlery',
    item: 'Spoon',
    par: 10,
    note: 'Ran short of runners, so the cutlery trays are tied together. Pull one and its friends come along. Over a pulley they go the other way.',
    how: 'Drag a tray a notch left or right. Its strings drag the tray they point to: a white string the same way, a dashed one over a pulley the opposite way. Line every hole up under the spoon.',
    win: 'Porridge, spooned',
    quips: ['Sixteen metres of string. Well spent.', 'The forks and the knives are not speaking.'],
    data: {
      cols: 6,
      shaft: 3,
      trays: [
        { label: 'Forks', lo: 1, hi: 5 },
        { label: 'Knives', lo: 2, hi: 5 },
        { label: 'Teaspoons', lo: 1, hi: 4 },
        { label: 'Chopsticks', lo: 0, hi: 3 },
        { label: 'Corkscrews', lo: 1, hi: 3 },
      ],
      links: [
        { a: 3, b: 0, k: 1 },
        { a: 1, b: 4, k: 1 },
        { a: 1, b: 0, k: -1 },
        { a: 0, b: 2, k: -1 },
      ],
    },
    start: [5, 3, 4, 1, 2],
  },
  {
    id: 'biscuits',
    mech: 'box',
    name: 'Biscuits',
    item: 'Biscuits',
    par: 12,
    note: 'Took up Japanese puzzle boxes. The biscuits are perfectly safe now. From everyone, possibly forever.',
    how: 'Each panel slides a notch at a time, but hidden pins catch it unless another panel is in the right place. Feel your way in. The lid comes off at its last notch.',
    win: 'Biscuits, at last',
    quips: ['Took me a week to close it.', 'I have forgotten how it opens, so well done.'],
    data: {
      labels: ['Lid', 'Back', 'Right side', 'Front', 'Left side'],
      gates: [
        [{ by: 1, at: [2] }, { by: 2, at: [0] }],
        [{ by: 3, at: [2] }, { by: 3, at: [0, 1] }],
        [{ by: 1, at: [0, 1] }, { by: 4, at: [0, 1] }],
        [{ by: 2, at: [2] }, { by: 4, at: [1] }],
        [{ by: 1, at: [0, 1, 2] }, { by: 3, at: [0, 1, 2] }],
      ],
    },
    start: [0, 0, 0, 0, 0],
  },
  {
    id: 'ferns',
    mech: 'slide',
    name: 'Ferns',
    item: 'Watering can',
    par: 8,
    note: 'Greetings from the woodworking fair in Kyoto! Could you water my ferns? The can is in the hall cupboard. I tidied the hall cupboard before I left. Sorry.',
    how: 'Same as the capsules: slide things along their length until the watering can gets out through the gap on the right.',
    win: 'Ferns, watered',
    quips: ['The ferns send their regards.', "They're ferns. They'll forgive you."],
    skin: 'can',
    away: {
      kind: 'postcard',
      sig: '— C., seven hours ahead',
      calls: ["*yawns* It's four in the morning here. Try this one.", 'Mm. That one. Goodnight.'],
      out: 'Asleep in Kyoto',
    },
    data: {
      exitRow: 2,
      pieces: hall.map(([x, y, len, h, label]) => ({ label, h, len, line: h ? y : x })),
    },
    start: hall.map(([x, y, , h]) => (h ? x : y)),
  },
  {
    id: 'treats',
    mech: 'swing',
    name: 'Treats',
    item: 'Treats',
    par: 9,
    note: 'PUPPY EMERGENCY\nbrought a puppy back from Kyoto. long story. his name is Krul\nKrul is out. chasing him round the park\nrattle his treats at the back door?? they are in the boot cupboard. I fixed the boot cupboard',
    how: 'Swing the cupboard doors (each arc has to be clear), then drag the treats in straight lines to the gap on the right.',
    win: 'Krul, home',
    quips: ['Good boy. You, I mean. Krul too.', 'He ate a glove on the way in, but he is home.'],
    skin: 'treats',
    away: {
      kind: 'texts',
      sig: 'Cyriel · now',
      calls: ['*panting* KRUL. No, not you. Do this one.', "He's found a duck. Quick, that door.", '*running* That one! Bye!'],
      out: 'Chasing a puppy',
    },
    data: {
      exit: [5, 2],
      walls: [],
      doors: [
        { label: 'Wellies', hinge: [2, 5], len: 2, dirs: [0, 3] },
        { label: 'Slippers', hinge: [5, 3], len: 2, dirs: [1, 2] },
        { label: 'Brushes', hinge: [1, 2], len: 2, dirs: [1, 2] },
        { label: 'Polish', hinge: [4, 2], len: 2, dirs: [0, 3] },
        { label: 'Laces', hinge: [4, 4], len: 2, dirs: [2, 1] },
        { label: 'Scarves', hinge: [4, 3], len: 2, dirs: [2, 3] },
        { label: 'Gloves', hinge: [1, 1], len: 2, dirs: [3, 2] },
      ],
    },
    start: { doors: [1, 0, 1, 0, 0, 0, 0], milk: 6 },
  },
  {
    id: 'tea',
    mech: 'tilt',
    name: 'Lemon tea',
    item: 'Lemon',
    par: 7,
    note: 'Caught a cold chasing Krul in the rain. In bed. Could you make me a lemon tea? The lemon is on my bed tray. I built the bed tray with a fever. It tips.',
    how: 'Tilt the tray with the arrows, a swipe, or the arrow keys. Everything rolls until it hits something. Roll the lemon into the mug, and keep it out of the knot hole.',
    win: 'Tea, made',
    quips: ['Ahh. Lemon. I can taste things again.', 'Lukewarm. Perfect. Thank you.'],
    skin: 'mug',
    away: {
      kind: 'tissue',
      sig: '— Cyriel (in bed)',
      calls: ["*sniff* ...that way. *snores*"],
      out: 'Fast asleep',
    },
    data: {
      nails: [[3, 0], [1, 4], [4, 3], [2, 3], [5, 2], [3, 1], [5, 1], [4, 5]],
      holes: [[3, 5]],
      pan: [1, 2],
      rollers: [
        { kind: 'lemon', label: 'Lemon' },
        { kind: 'honey', label: 'Honey' },
        { kind: 'drops', label: 'Cough drops' },
      ],
    },
    start: [35, 23, 16],
  },
  {
    id: 'licence',
    mech: 'linked',
    name: 'Licence',
    item: 'Driving licence',
    par: 10,
    note: "Hi, it's me. I'm at traffic court. I parked the van on the pavement to deliver a wardrobe, and then the wardrobe... anyway. They want my driving licence. It's in the desk drawers. The drawers are tied together. Drop it in the envelope, the courier comes at noon.",
    how: 'Drag a drawer a notch left or right; its strings drag the drawers they point to, the same way or, over a pulley, the opposite way. Line every hole up under the licence.',
    win: 'Licence, posted',
    quips: ['The judge liked my handwriting. Still a fine.', 'The courier says a drawer bit him. Fair.'],
    skin: 'licence',
    away: {
      kind: 'voicemail',
      sig: 'Voicemail from Cyriel · 0:41',
      calls: ['*whispering* We are in recess. Quickly: this one.'],
      out: 'Phone off in court',
    },
    data: {
      cols: 6,
      shaft: 2,
      trays: [
        { label: 'Pens', lo: 0, hi: 4 },
        { label: 'Receipts', lo: 0, hi: 4 },
        { label: 'Stamps', lo: 0, hi: 2 },
        { label: 'Batteries', lo: 0, hi: 3 },
        { label: 'Paperclips', lo: 1, hi: 3 },
      ],
      links: [
        { a: 1, b: 0, k: -1 },
        { a: 4, b: 0, k: -1 },
        { a: 3, b: 1, k: -1 },
        { a: 3, b: 2, k: -1 },
      ],
    },
    start: [0, 1, 1, 1, 1],
  },
  {
    id: 'present',
    mech: 'box',
    name: 'Present',
    item: 'Present',
    par: 12,
    note: "Home! Krul too. I made you something for minding the house all week. It's in a box. The box opens. I'm fairly sure the box opens.",
    how: 'Each side slides a notch at a time, but hidden pins catch it unless another side is in the right place. The lid comes off at its last notch.',
    win: 'Present, opened',
    quips: ["It's Krul, in walnut. Sitting still, for once.", 'Took you longer than the fair. Worth it.'],
    skin: 'present',
    data: {
      labels: ['Lid', 'Back', 'Right side', 'Front', 'Left side'],
      gates: [
        [{ by: 1, at: [0] }, { by: 4, at: [2] }],
        [{ by: 3, at: [1, 2] }, { by: 2, at: [1] }],
        [{ by: 0, at: [1] }, { by: 3, at: [0, 2] }],
        [{ by: 0, at: [0] }, { by: 2, at: [1] }],
        [{ by: 1, at: [2] }, { by: 0, at: [0, 2] }],
      ],
    },
    start: [0, 0, 0, 0, 0],
  },
]
