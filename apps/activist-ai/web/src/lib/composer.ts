// What the composer's button is and whether it works, derived in one place from the conversation's
// real state (OLA-311). The drawer draws this and its submit does what it says; nothing else
// decides. A flag that could stick is never an input: only the typed text, the last turn's status,
// the question Ola is waiting on, an answer on its way, and the connection.
//
// Bart, Nov 20, on his phone: Ola asked him a question (a card, the run waiting inside it), the
// composer under it said "Or write your answer here…", he wrote "Yes", and beside it was Stop, not
// send, because the run counted as working. Now a question that takes words turns the button into
// "Send your answer", active as soon as there is text, whatever else is going on.
import type { Connection, Question } from './types.ts'

export interface ComposerInput {
  /** What is in the composer. */
  draft: string
  /** The last turn is sending or working. */
  working: boolean
  /** The question Ola is waiting on, if any. */
  question: Question | null
  /** An answer to that question is on its way (between the tap and opencode's reply). */
  answering: boolean
  connection: Connection
}

export type ComposerButton = 'answer' | 'send' | 'stop'

export interface ComposerState {
  /** answer: sends the text as the answer to Ola's question; send: a new request (or a command); stop: stops the run. */
  button: ComposerButton
  /** The button can be pressed. Stop always can. */
  enabled: boolean
  /** Return in the composer sends (the same as pressing an enabled answer or send button). */
  submits: boolean
  /** When text is there but cannot go now: one plain sentence to say instead of doing nothing. */
  blocked: string | null
  placeholder: 'answer' | 'card' | 'working' | 'request'
}

/** The question can be answered with the words typed in the composer: one field that takes the person's own words. */
export const answersInWords = (q: Question | null): boolean => !!q && q.fields.length === 1 && q.fields[0].custom

export function composerState(i: ComposerInput): ComposerState {
  const text = i.draft.trim()
  const command = text.startsWith('/')
  // A question Ola waits on, that the typed words can answer: the button sends the answer. Never
  // blocked by the run (it waits for exactly this) or by a lost event stream (the answer is its own
  // request; if it does not get through, the page says so and the text stays).
  if (answersInWords(i.question) && !command) {
    return { button: 'answer', enabled: !!text && !i.answering, submits: !!text && !i.answering, blocked: null, placeholder: 'answer' }
  }
  if (i.working) {
    // A command (/stop, /help) still goes with Return; other words wait for the run to end.
    const blocked = text && !command ? (i.question ? 'Ola is waiting for your answer on the card above.' : 'Ola is still working on your last request. Wait for it to finish, or type /stop.') : null
    return { button: 'stop', enabled: true, submits: command, blocked, placeholder: i.question ? 'card' : 'working' }
  }
  // Nothing running: a new request (or a command). Not while the connection is lost, which the
  // banner says, and which comes back by itself (lib/ola.ts listen).
  const lost = i.connection === 'lost'
  const can = !!text && (command || !lost)
  return { button: 'send', enabled: can, submits: can, blocked: text && !can ? 'The connection to Ola’s computer is lost. Send this again when it is back.' : null, placeholder: 'request' }
}
