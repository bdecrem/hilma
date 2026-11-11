// Takt's music library as the agents read it (2026-11-07): the two lesson bands and every Stage
// song, from library.json (written from the app's content by scripts/takt/library.ts; chat-check
// fails when it is stale). The chat teacher, the improv teacher and Agent mode get it in their
// system prompts, so a question like "what can I play the A minor scale over?" or "make it feel
// like Pearl Street" is answered from the real catalog.

import data from './library.json'

export type LibrarySong = (typeof data.songs)[number]
export type LibraryBand = (typeof data.bands)[number]

export const LIBRARY = data

/** The Stage set list by file name ("song-blue-lantern-white" → "Blue Lantern II"). */
export const SONG_TITLES: Record<string, string> = Object.fromEntries(data.songs.map((s) => [s.name, s.title]))

/** The modules by their content code (Lesson.code). */
export const MODULE_TITLES: Record<string, string> = data.modules

const length = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function keyName(k: string): string {
  const m = /^([A-G][♯♭#b]?)(m)?$/.exec(k.trim())
  if (!m) return k
  return `${m[1].replace('b', '♭').replace('#', '♯')} ${m[2] ? 'minor' : 'major'}`
}

/** The library in plain lines, for a system prompt. */
export function libraryText(): string {
  const bands = data.bands.map(
    (b) => `- ${b.name} (${b.key}): ${b.chorus}, looped; ${b.channels.join(', ')}. Plays under ${b.uses.join('; ')}.`,
  )
  const songs = data.songs.map((s) => {
    const parts = s.parts.melody ? `chords "${s.parts.chords}", melody "${s.parts.melody}"` : `chords "${s.parts.chords}" only`
    return `- ${s.title}: ${s.style.toLowerCase()} in ${keyName(s.key)}, ${s.tempo} bpm, ${length(s.seconds)}, ${s.choruses} ${s.choruses === 1 ? 'chorus' : 'choruses'} of ${s.chorus}. Sections: ${s.sections}. Parts: ${parts}. "${s.line}"${s.shelf === 'all tracks' ? ' (under All tracks unless the player pinned it)' : ''}${s.uses.length ? ` Used as: ${s.uses.join('; ')}.` : ''}`
  })
  return `The two lesson bands (backing loops, not Stage songs: they play under the lesson steps and jams of their modules, and on the menus as "the band"; a player can't pick one on its own, they get it by opening a step of that module; a step may move the band to another key):
${bands.join('\n')}

The Stage songs (the set list, in order; by default the first six, all blues, and eight electronic ones (Halbschatten, Gezeiten, Gegenlicht, Restlicht, Streulicht, Hypnotist II, Warm Nine, Abyss) are pinned to the Stage and the rest sit under All tracks, and a player can pin or unpin any of them; the Stage shows the pinned tracks of the vibe that is on, Blues or Electronic, and tucks the other vibe's pinned tracks under a header that opens on a tap; each has a chords part and most a melody part, at Beginner, Easy, Easy+, Medium, Hard or Adaptive; a player may also have their own versions from Agent mode, and a Solo level the improv teacher wrote from their take):
${songs.join('\n')}`
}
