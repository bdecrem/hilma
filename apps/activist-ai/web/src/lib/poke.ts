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
/** The line of the one extra fix turn (OLA-466): after the first fix the page still threw when it opened. */
export const POKE_LINE_AGAIN = 'Ola pressed the page again after the fix: it still stops with an error when it opens, so Ola asked its model to fix that too.'
const MAX_LINES = 6
/** ola-poke's sentence for a script error as the page opened (workspace/ola-poke). */
const LOAD_ERROR = /^Script error when the page opened:/
/** Whether a script error as the page opened is among what is dead: it stops the page's script there, so nothing after it was ever tried. */
export const hasLoadError = (dead: Dead[]) => dead.some((d) => LOAD_ERROR.test(d.say))
// OLA-466, checker Nov 28 (chk466j): the first fix cleared "formula-input is null", which had hidden
// "cells.keys is not a function" behind it; the card then offered the bigger model for an error Ola's
// model had never been shown. So the fix prompt says what a load error means, and one more fix turn is
// sent when the page still throws as it opens (never more than one).
const LOAD_HINT = 'A script error when the page opens stops its script at that line, so nothing after it has run yet: read the rest of the script for mistakes of the same kind (an element the code uses that the page does not have, a method called on the wrong kind of value) and fix them too.'

// OLA-466, checker Nov 28 on cb3fb944 (chk466k): ola-poke's grid use stops at the first step that fails,
// so the first fix prompt said only "a tap opens no field"; the model fixed that, and the second pressing
// found 7 over a 5 giving 75 behind it. So a fix prompt with a grid step in it names every step Ola takes
// and the code that makes the usual failures work, and the model fixes them all in one turn.
const GRID_HINT = 'Ola uses the grid the way a person does on a phone, in Safari, and stops at the first step that fails, so make every step work, not only the one named: tap A1, type 5, Enter; tap B1, type =A1*2, Enter (B1 shows 10, not its formula); tap A1 again and type 7 (A1 shows 7, not 57 or 75; B1 shows 14). For that: a tap on a cell focuses an <input> inside that cell, its whole text is selected when it gets focus (onfocus="this.select()" and onmouseup="return false" on the input), and a redraw never sets the value of the cell that has focus.'
/** Whether a grid step (ola-poke's use of a spreadsheet) is among what is dead. */
export const hasGridStep = (dead: Dead[]) => dead.some((d) => d.what === 'grid')

/** Whether a finished turn gets its page pressed: Ola's own model's, ended well, not one Ola sent itself. */
export const pokeable = (turn: Turn) => turn.status === 'done' && !turn.nudge && turn.engine !== 'claude' && turn.engine !== 'hosted'

/** The follow-up turn for what was dead on `page`. */
export function pokePrompt(page: string, dead: Dead[], line = POKE_LINE): string {
  const lines = dead.slice(0, MAX_LINES).map((d) => `- ${d.say}`)
  if (dead.length > MAX_LINES) lines.push(`- and ${dead.length - MAX_LINES} more like these.`)
  const hint = (hasLoadError(dead) ? `\n\n${LOAD_HINT}` : '') + (hasGridStep(dead) ? `\n\n${GRID_HINT}` : '')
  return `${POKE_MARK}${line}\n\nFrom Ola, not the person: Ola opened ${page} in a browser, typed into every field and pressed every button. This did not work:\n${lines.join('\n')}${hint}\n\nFix exactly that in ${page}, then hand it over. Change nothing else.`
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

/** Ola's fix turn (its first line is POKE_LINE, or POKE_LINE_AGAIN for the one extra): the turn pressed again. */
export const isPokeFix = (turn: Turn) => !!turn.nudge && (turn.request === POKE_LINE || turn.request === POKE_LINE_AGAIN) && turn.engine !== 'claude' && turn.engine !== 'hosted'
/** At most this many sentences of what does not work, on the card. */
export const DEAD_SHOWN = 4

/**
 * At the end of the fix turn: press the page again and, when something is still dead, hand it to
 * `stillDead` (which shows the card). Except once: after the first fix, a page that still throws as it
 * opens gets one more fix turn through `send` (POKE_LINE_AGAIN) instead of the card. Resolves whether
 * either happened.
 */
export async function pokeAgain(
  turn: Turn,
  io: { poke: (since: number) => Promise<Poked>; stillDead: (page: string, dead: Dead[]) => unknown; stillLast: () => boolean; send?: (text: string) => unknown },
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
  if (turn.request === POKE_LINE && io.send && hasLoadError(dead)) {
    io.send(pokePrompt(r.page, dead, POKE_LINE_AGAIN))
    return true
  }
  io.stillDead(r.page, dead)
  return true
}

/** The card's facts: every sentence (the hand-off gets them all), and whether the bigger model is offered (never what cannot be done). */
export function deadQuestion(page: string, dead: Dead[], o: { hostedSetUp: boolean; canSend: boolean }) {
  return { page, dead: dead.map((d) => d.say), offered: o.hostedSetUp && o.canSend }
}

/** The card's list: the first DEAD_SHOWN sentences, then how many more, so a long list never looks complete when it is not (checker, Nov 27: 7 dead, 4 shown, nothing said of the other 3). */
export function deadLines(dead: string[]): string[] {
  const more = dead.length - DEAD_SHOWN
  return more > 0 ? [...dead.slice(0, DEAD_SHOWN), `And ${more} more.`] : dead
}

/** The card's words (StretchCard, reason 'dead'). */
export const DEAD_TITLE = 'Still not working after one fix:'
/** OLA-542: the card after the bigger model's own fix. */
export const DEAD_TITLE_BIGGER = 'Still not working after the bigger model’s fix:'
export const deadOffer = (provider: string | null) =>
  `Try a bigger model? It runs outside this machine${provider ? ` (${provider})` : ''}.`

/**
 * The person's answer on that card: what to log ('yes' / 'no', none when nothing was offered) and the
 * hand-off to send (only on yes, when it was offered). `prompt` builds the marked hand-off turn.
 */
export function deadAnswer(s: { canAct: boolean; request: string; page?: string; dead?: string[] }, answer: 'once' | 'always' | 'not_now', prompt: (sentence: string, request: string) => string) {
  const yes = answer !== 'not_now' && s.canAct
  return { note: s.canAct ? (yes ? ('yes' as const) : ('no' as const)) : null, handoff: yes ? prompt(DEAD_HANDOFF_LINE, deadHandoffRequest(s.request, s.page ?? 'the page', s.dead ?? [])) : null }
}

/** The one line the conversation shows for the hand-off (handoffPrompt's sentence). */
export const DEAD_HANDOFF_LINE = 'Ola gave this to a bigger model outside this machine.'
/** What the bigger model is asked: the person's request, the page and what does not work on it. */
export function deadHandoffRequest(request: string, page: string, dead: string[]): string {
  return `${request}\n\nThe page for this is ${page}. Ola's own model built it and tried once to fix it; Ola then pressed its buttons and typed in its fields, and this still does not work:\n${dead.map((d) => `- ${d}`).join('\n')}\n\nFix exactly that in ${page}, check it, and hand it over.`
}

// ------------------------------------------------------------ the bigger model's page (OLA-542)
//
// OLA-466, checker Nov 28 (chk466j on 3573d325, chk466l on cb3fb944): after Yes on the card the hosted
// model's spreadsheet had the row numbers over column A, so nothing could be typed in A, and Ola never
// pressed that page. Two of three requests now succeed only through that hand-off. So its page is pressed
// too: after the hand-off turn ends well, Ola presses the page once; something dead: one fix turn to the
// same hosted model (POKE_LINE_HOSTED), under the person's same yes. After that fix, pressed once more;
// still dead: the card says what does not work, with only "OK" (nothing bigger is left to offer). Never a
// third turn. The pressing failing or timing out: nothing sent, nothing said.

/** The line of the one fix turn Ola sends the bigger model about its own page. */
export const POKE_LINE_HOSTED = 'Ola pressed the buttons on the bigger model’s page, found something that does not work, and asked the bigger model to fix it.'
/** The bigger model's turn that took over after the card's Yes (deadAnswer's hand-off). */
export const isDeadHandoff = (turn: Turn) => turn.engine === 'hosted' && !!turn.nudge && turn.request === DEAD_HANDOFF_LINE
/** The bigger model's one fix turn about its own page. */
export const isHostedPokeFix = (turn: Turn) => turn.engine === 'hosted' && !!turn.nudge && turn.request === POKE_LINE_HOSTED

/**
 * At the end of a bigger model's turn: after the hand-off, press its page and send one fix turn through
 * `send` when something is dead; after that fix, press again and hand what is still dead to `stillDead`.
 * Resolves whether either happened.
 */
export async function pokeHosted(
  turn: Turn,
  io: { poke: (since: number) => Promise<Poked>; send: (text: string) => unknown; stillDead: (page: string, dead: Dead[]) => unknown; stillLast: () => boolean },
): Promise<boolean> {
  const first = isDeadHandoff(turn)
  if ((!first && !isHostedPokeFix(turn)) || turn.status !== 'done' || !(turn.at > 0)) return false
  let r: Poked
  try {
    r = await io.poke(turn.at)
  } catch {
    return false
  }
  const dead = Array.isArray(r?.dead) ? r.dead.filter((d) => d && typeof d.say === 'string' && d.say) : []
  if (typeof r?.page !== 'string' || !r.page || !dead.length || !io.stillLast()) return false
  if (first) io.send(pokePrompt(r.page, dead, POKE_LINE_HOSTED))
  else io.stillDead(r.page, dead)
  return true
}
