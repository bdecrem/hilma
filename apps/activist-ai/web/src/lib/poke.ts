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

// ------------------------------------------------------------ after the one fix (OLA-522)
//
// Bart, Nov 27: "when customer request comes back, we click around and see if it's valid. if invalid
// ... i propose that we ask the customer if we can escalate to inkling 2 small". So when Ola's one fix
// turn ends, Ola presses the page once more. Everything works: nothing more is said. Still dead: the
// person reads what does not work, in the same sentences, and one question: give it to the bigger model,
// which runs outside this machine, yes or no (the stretch card, reason 'dead'). Offered only when the
// hosted model is set up and this person can send it (the owner, or the project's switch is on); else the
// card says what does not work and has only "OK". Yes: one hand-off turn to the hosted model with the page
// and the list; after it Ola does not press again and does not ask again. No: nothing more. The second
// pressing failing or timing out: nothing said, nothing offered.

/** Ola's one fix turn (its first line is POKE_LINE): the turn pressed a second time. */
export const isPokeFix = (turn: Turn) => !!turn.nudge && turn.request === POKE_LINE && turn.engine !== 'claude' && turn.engine !== 'hosted'
/** At most this many sentences of what does not work, on the card. */
export const DEAD_SHOWN = 4

/**
 * At the end of the fix turn: press the page again and, when something is still dead, hand it to
 * `stillDead` (which shows the card). Resolves whether it did.
 */
export async function pokeAgain(
  turn: Turn,
  io: { poke: (since: number) => Promise<Poked>; stillDead: (page: string, dead: Dead[]) => unknown; stillLast: () => boolean },
): Promise<boolean> {
  if (!isPokeFix(turn) || turn.status !== 'done' || !(turn.at > 0)) return false
  let r: Poked
  try {
    r = await io.poke(turn.at)
  } catch {
    return false
  }
  const dead = Array.isArray(r?.dead) ? r.dead.filter((d) => d && typeof d.say === 'string' && d.say) : []
  if (typeof r?.page !== 'string' || !r.page || !dead.length || !io.stillLast()) return false
  io.stillDead(r.page, dead)
  return true
}

/** The card's facts: the sentences shown, and whether the bigger model is offered (never what cannot be done). */
export function deadQuestion(page: string, dead: Dead[], o: { hostedSetUp: boolean; canSend: boolean }) {
  return { page, dead: dead.slice(0, DEAD_SHOWN).map((d) => d.say), offered: o.hostedSetUp && o.canSend }
}

/** The card's words (StretchCard, reason 'dead'). */
export const DEAD_TITLE = 'Ola pressed the buttons again after the fix, and this still does not work:'
export const deadOffer = (provider: string | null) =>
  `Give this to a bigger model? It runs outside this machine${provider ? `, at ${provider}` : ''}: if you say yes, your request, this conversation and the page go there.`

/**
 * The person's answer on that card: what to log ('yes' / 'no', none when nothing was offered) and the
 * hand-off to send (only on yes, when it was offered). `prompt` builds the marked hand-off turn.
 */
export function deadAnswer(s: { canAct: boolean; request: string; page?: string; dead?: string[] }, answer: 'once' | 'always' | 'not_now', prompt: (sentence: string, request: string) => string) {
  const yes = answer !== 'not_now' && s.canAct
  return { note: s.canAct ? (yes ? ('yes' as const) : ('no' as const)) : null, handoff: yes ? prompt(DEAD_HANDOFF_LINE, deadHandoffRequest(s.request, s.page ?? 'the page', s.dead ?? [])) : null }
}

/** The one line the conversation shows for the hand-off (handoffPrompt's sentence). */
export const DEAD_HANDOFF_LINE = 'Ola gave this to a bigger model, which runs outside this machine, with the page and what does not work on it.'
/** What the bigger model is asked: the person's request, the page and what does not work on it. */
export function deadHandoffRequest(request: string, page: string, dead: string[]): string {
  return `${request}\n\nThe page for this is ${page}. Ola's own model built it and tried once to fix it; Ola then pressed its buttons and typed in its fields, and this still does not work:\n${dead.map((d) => `- ${d}`).join('\n')}\n\nFix exactly that in ${page}, check it, and hand it over.`
}
