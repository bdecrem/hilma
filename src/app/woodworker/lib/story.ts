// The story, kept light: a few panels of Cyriel before some rooms (the first
// time you open them), and one after the last. Each panel is a pose of the
// character and one line. The rooms carry the rest: their notes, and in the
// second chapter, where they are instead of home.

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
  ferns: {
    chapter: "Chapter two · Cyriel's week",
    panels: [
      { pose: 'travel', say: "I'm off to the woodworking fair in Kyoto! Five days of puzzle boxes." },
      { pose: 'travel', say: "You'll be fine. I've left notes. Call me if you're stuck, but mind the time difference." },
    ],
  },
  treats: {
    panels: [
      { pose: 'puppy', say: "I'm back! And I brought someone. This is Krul. It means wood shaving.", krul: true },
      { pose: 'chase', say: 'Krul? KRUL! Come back! That is a duck!', krul: true },
    ],
  },
  tea: {
    panels: [{ pose: 'flu', say: 'I caught Krul. Then I caught a cold. I am going to bed for a hundred years.' }],
  },
  licence: {
    panels: [
      { pose: 'court', say: "It's only a parking ticket. I'll be back by lunch." },
      { pose: 'court', say: '...They would like to see my driving licence.' },
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
