// After Ola's own model hands over a page, Ola presses it all over (OLA-515; Bart, Nov 27: "idea 1
// (click around) we DO"). OLA-480 measured that every failed request was a dead field or button, never
// wrong math, and that the model fixes well when told exactly what is wrong. So, with no model
// involved: after every turn of Ola's own model that ended well, the front desk finds the .html file in
// the project that changed last since the turn began (by its time in the VM: the model writes pages with
// write steps and with `cat > index.html` alike, and the first live test had only the second), opens it
// in the project's headless browser, types into every field and presses every button (POST /api/poke,
// workspace/ola-poke). No page changed, or nothing dead: nothing happens. Something dead: one follow-up
// turn to Ola's model, marked as Ola's (POKE_MARK), that says exactly what, and asks it to fix that and
// hand over. Once per request: a turn Ola sent itself is never pressed again. When the pressing fails
// or times out, nothing is sent.
import { POKE_MARK } from './steps.ts'
import type { Turn } from './types.ts'

export type Dead = { what: string; name: string; say: string }
export type Poked = { page: string | null; dead: Dead[] }

export { POKE_MARK }
/** The one line the conversation shows for that turn (conversation.ts nudgeOf reads the first line). */
export const POKE_LINE = 'Ola pressed the buttons on the page, found something that does not work, and asked its model to fix it.'
const MAX_LINES = 6

/** Whether a finished turn gets its page pressed: Ola's own model's, ended well, not one Ola sent itself. */
export const pokeable = (turn: Turn) => turn.status === 'done' && !turn.nudge && turn.engine !== 'claude' && turn.engine !== 'hosted'

/** The follow-up turn for what was dead on `page`. */
export function pokePrompt(page: string, dead: Dead[]): string {
  const lines = dead.slice(0, MAX_LINES).map((d) => `- ${d.say}`)
  if (dead.length > MAX_LINES) lines.push(`- and ${dead.length - MAX_LINES} more like these.`)
  return `${POKE_MARK}${POKE_LINE}\n\nFrom Ola, not the person: Ola opened ${page} in a browser, typed into every field and pressed every button. This did not work:\n${lines.join('\n')}\n\nFix exactly that in ${page}, then hand it over. Change nothing else.`
}

/**
 * At the end of a turn: press the page it changed and, when something is dead, send one follow-up.
 * Resolves whether one was sent. `poke` gets the turn's start (ms); `stillLast` says whether the turn
 * is still the conversation's last and nothing runs (the person may have typed again meanwhile).
 */
export async function pokeAfter(turn: Turn, io: { poke: (since: number) => Promise<Poked>; send: (text: string) => unknown; stillLast: () => boolean }): Promise<boolean> {
  if (!pokeable(turn) || !(turn.at > 0)) return false
  let r: Poked
  try {
    r = await io.poke(turn.at)
  } catch {
    return false
  }
  const dead = Array.isArray(r?.dead) ? r.dead.filter((d) => d && typeof d.say === 'string' && d.say) : []
  if (typeof r?.page !== 'string' || !r.page || !dead.length || !io.stillLast()) return false
  io.send(pokePrompt(r.page, dead))
  return true
}
