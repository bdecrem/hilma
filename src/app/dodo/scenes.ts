// The showcase manifest, typed for the site. scripts/dodo-scenes/scenes.json
// is the one list behind the hero, the tour, the App Store shots and the
// video; `pnpm dodo:capture` exports its assets into public/dodo/scenes.
import manifest from '../../../scripts/dodo-scenes/scenes.json'
import type { Beat } from './DodoMascot'

export type Focus = { x: number; y: number; w: number; h: number }
export type Scene = {
  id: string
  /** Hero / App Store caption; `**word**` marks the one marigold word. */
  line: string
  /** The longer caption under the tour phone. */
  tour: string
  sets: string[]
  bird: Beat
  focus?: Focus
  capture?: 'still' | 'mockup' | 'clip' | 'record'
  mockup?: string
  clip?: string
  seconds?: number
  trim?: [number, number]
  legacy?: string
  launch?: string[]
}

export const SCREEN = manifest.screen as [number, number]
export const scenes = manifest.scenes as unknown as Scene[]
export const heroScenes: Scene[] = manifest.hero.map((id) => {
  const s = scenes.find((x) => x.id === id)
  if (!s) throw new Error(`hero scene ${id} is not in the manifest`)
  return s
})
export const sceneById = (id: string) => scenes.find((s) => s.id === id)

/** Still image for a scene (clips export a poster under the same name). */
export const stillFor = (s: Scene) => `/dodo/scenes/${s.id}.webp`
export const isClip = (s: Scene) => Boolean(s.clip) || s.capture === 'record'
export const clipFor = (s: Scene) => (isClip(s) ? `/dodo/scenes/${s.id}.mp4` : null)
/** Seconds a clip runs on screen (trimmed length, or the clip's own). */
export const clipSeconds = (s: Scene) => (s.trim ? s.trim[1] : s.seconds ?? 7)

/** Split "It writes your **flash cards.**" into plain / marigold runs. */
export function lineRuns(line: string): { text: string; em: boolean }[] {
  return line
    .split('**')
    .map((text, i) => ({ text, em: i % 2 === 1 }))
    .filter((r) => r.text.length > 0)
}
