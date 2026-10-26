// The story, kept light: a few panels of Cyriel before the first room and
// the last (the first time you open them), and one after. Each panel is a
// pose and one line. The rest is in Cyriel's notes, and in the interruptions
// of lib/episodes.ts, which bring the poses travel, chase, flu and court.

export type Pose = 'hello' | 'proud' | 'travel' | 'puppy' | 'chase' | 'flu' | 'court' | 'home'

export interface Panel {
  pose: Pose
  say: string
  /** Krul is in the picture. */
  krul?: boolean
}
export interface Scene {
  /** Shown over the first panel when a chapter starts. */
  chapter?: string
  panels: Panel[]
}

/** Keyed by the room it comes before; 'ending' plays after the last room. */
export const SCENES: Record<string, Scene> = {
  espresso: {
    chapter: 'Chapter one · At home',
    panels: [
      { pose: 'hello', say: "Hello! I'm Cyriel. Carpenter. Your landlord, technically." },
      { pose: 'proud', say: "I've made a few improvements to the house. Everything still works. You just have to work it out first." },
    ],
  },
  present: {
    panels: [{ pose: 'home', say: 'Home! Fined, healed, and nobody has run off. Thank you for minding everything.', krul: true }],
  },
  ending: {
    panels: [
      { pose: 'proud', say: "That's the whole house. You've opened everything I ever built.", krul: true },
      { pose: 'hello', say: "Mind the stairs tomorrow, though. I've had an idea about the stairs.", krul: true },
    ],
  },
}
