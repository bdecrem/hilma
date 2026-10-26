// The five rooms. Layouts and starts come from scripts/woodworker/gen.ts
// (the sliding room is the original espresso cupboard); every par is the
// solver's true minimum, proven by scripts/woodworker/check.ts.
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
]
