// After Ola's own model hands over a page, Ola presses it all over (OLA-515; Bart, Nov 27: "idea 1
// (click around) we DO"). OLA-480 measured that every failed request was a dead field or button, never
// wrong math, and that the model fixes well when told exactly what is wrong. So, with no model
// involved: the turn ended well and wrote or changed an .html file, the front desk opens that page in
// the project's headless browser, types into every field and presses every button (POST /api/poke,
// workspace/ola-poke). Nothing dead: nothing happens. Something dead: one follow-up turn to Ola's model,
// marked as Ola's (POKE_MARK), that says exactly what, and asks it to fix that and hand over. Once per
// request: a turn Ola sent itself is never pressed again. When the pressing fails or times out,
// nothing is sent.
import { POKE_MARK } from './steps.ts'
import type { Turn } from './types.ts'

export type Dead = { what: string; name: string; say: string }

export { POKE_MARK }
/** The one line the conversation shows for that turn (conversation.ts nudgeOf reads the first line). */
export const POKE_LINE = 'Ola pressed the buttons on the page, found something that does not work, and asked its model to fix it.'
const WRITES = new Set(['write', 'edit', 'multiedit'])
const MAX_LINES = 6

/** The page a finished turn wrote or changed last, relative to the project folder; null when none. */
export function pokeTarget(turn: Turn, directory: string | null): string | null {
  if (turn.status !== 'done' || turn.nudge || turn.engine === 'claude' || turn.engine === 'hosted') return null
  let found: string | null = null
  for (const s of turn.steps) {
    if (!WRITES.has(s.tool) || s.status !== 'done') continue
    let p = ''
    try {
      const i = JSON.parse(s.detail.input || '{}')
      p = String(i.filePath ?? i.path ?? i.file ?? '')
    } catch {
      continue
    }
    if (!/\.html?$/i.test(p)) continue
    const dir = directory ? directory.replace(/\/$/, '') + '/' : '/work/'
    if (p.startsWith(dir)) p = p.slice(dir.length)
    else if (p.startsWith('/work/')) p = p.slice('/work/'.length)
    else if (p.startsWith('/')) continue
    found = p.replace(/^\.\//, '')
  }
  return found
}

/** The follow-up turn for what was dead on `page`. */
export function pokePrompt(page: string, dead: Dead[]): string {
  const lines = dead.slice(0, MAX_LINES).map((d) => `- ${d.say}`)
  if (dead.length > MAX_LINES) lines.push(`- and ${dead.length - MAX_LINES} more like these.`)
  return `${POKE_MARK}${POKE_LINE}\n\nFrom Ola, not the person: Ola opened ${page} in a browser, typed into every field and pressed every button. This did not work:\n${lines.join('\n')}\n\nFix exactly that in ${page}, then hand it over. Change nothing else.`
}

/**
 * At the end of a turn: press its page and, when something is dead, send one follow-up. Resolves
 * whether one was sent. `stillLast` says whether the turn is still the conversation's last and nothing
 * runs (the person may have typed again meanwhile).
 */
export async function pokeAfter(
  turn: Turn,
  directory: string | null,
  io: { poke: (path: string) => Promise<{ dead: Dead[] }>; send: (text: string) => unknown; stillLast: () => boolean },
): Promise<boolean> {
  const page = pokeTarget(turn, directory)
  if (!page) return false
  let dead: Dead[]
  try {
    const r = await io.poke(page)
    dead = Array.isArray(r?.dead) ? r.dead.filter((d) => d && typeof d.say === 'string' && d.say) : []
  } catch {
    return false
  }
  if (!dead.length || !io.stillLast()) return false
  io.send(pokePrompt(page, dead))
  return true
}
