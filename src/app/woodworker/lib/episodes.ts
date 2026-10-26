// Cyriel's week: four interruptions. Each one barges into a puzzle room the
// first time you play it, a few moves in, and is a short action minigame, not
// a puzzle: throw, boop, catch, steer. Then you are back in the room exactly
// where you left it. Once met, an episode can be replayed from the room list.
import type { Pose } from './story'

export type EpisodeId = 'taxi' | 'krul' | 'achoo' | 'court'

export interface EpisodeDef {
  id: EpisodeId
  /** The room it interrupts, and after how many moves there. */
  room: string
  after: number
  /** The alert that slams in. */
  stamp: string
  /** Its name on the replay chip. */
  name: string
  pose: Pose
  krul?: boolean
  say: string
  how: string
  /** Cyriel's line afterwards: the first whose share of the best score you reached. */
  outro: [number, string][]
}

export interface Result {
  score: number
  max: number
  /** How it went, in words: "5 of 6 in the taxi". */
  label: string
}

export const EPISODES: EpisodeDef[] = [
  {
    id: 'taxi',
    room: 'breakfast',
    after: 2,
    stamp: "Taxi's here!",
    name: 'Taxi',
    pose: 'travel',
    say: "I'm off to Kyoto and I've packed nothing! The taxi won't stop. Throw my things on the roof!",
    how: 'Tap to throw. It lands on the X, so throw before the taxi gets there.',
    outro: [
      [1, 'Everything! Even the chisel. Bye!'],
      [0.5, "I'll buy socks in Kyoto. Bye!"],
      [0, "I'm going to Kyoto with a toothbrush and hope. Bye!"],
    ],
  },
  {
    id: 'krul',
    room: 'biscuits',
    after: 4,
    stamp: 'Puppy emergency',
    name: 'Krul',
    pose: 'chase',
    krul: true,
    say: "I'm back! I brought a puppy! He's called Krul and he's already escaped! Boop him till he's tired. Not the ducks!",
    how: 'Tap Krul when he pops up. Leave the ducks alone.',
    outro: [
      [1, "He's asleep in my arms. You're a natural."],
      [0.5, "He's nearly tired. I'll do the last lap."],
      [0, "He's still out there. He's fine. He has a duck."],
    ],
  },
  {
    id: 'achoo',
    room: 'treats',
    after: 3,
    stamp: 'Ah… ah…',
    name: 'Achoo',
    pose: 'flu',
    say: "I caught a cold chasing Krul. I'm going to sneeze. A lot. Tissues!",
    how: 'Slide the tissue box under every sneeze: drag, or use the arrow keys.',
    outro: [
      [1, 'Not one drop. You would make a wonderful nurse.'],
      [0.6, 'Mostly the tissues. Sorry about the curtains.'],
      [0, 'I have sneezed on everything. Back to bed.'],
    ],
  },
  {
    id: 'court',
    room: 'licence',
    after: 3,
    stamp: 'Traffic court',
    name: 'Court',
    pose: 'court',
    say: "I'm due in traffic court in twenty minutes. You drive. I have had a bad week with vans.",
    how: 'Tap left or right (or use the arrow keys) to change lanes. Mind the cones.',
    outro: [
      [1, 'Not a scratch! The judge was so surprised she halved the fine.'],
      [0.75, "Only a few cones. I'll say they were like that already."],
      [0, 'We arrived. That is what matters. Mostly.'],
    ],
  },
]

export const episodeIn = (room: string) => EPISODES.find((e) => e.room === room)
export const outroFor = (e: EpisodeDef, r: Result) => e.outro.find(([f]) => r.score >= f * r.max)?.[1] ?? e.outro[e.outro.length - 1][1]
