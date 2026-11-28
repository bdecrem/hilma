// What the composer's button is and whether it works, derived in one place from the conversation's
// real state (OLA-311). The drawer draws this and its submit does what it says; nothing else
// decides. A flag that could stick is never an input: only the typed text, the last turn's status,
// the question Ola is waiting on, an answer on its way, and the connection.
//
// Bart, Nov 20, on his phone: Ola asked him a question (a card, the run waiting inside it), the
// composer under it said "Or write your answer here…", he wrote "Yes", and beside it was Stop, not
// send, because the run counted as working. Now any question card (one question or several, choices
// or not) turns the button into "Send your answer", active as soon as there is text, whatever else
// is going on. Words typed in the box answer the whole card: every question on it gets them
// (answerFromWords), and the card says so. The first fix left a two-question card on Stop.
import type { Connection, Question } from './types.ts'
import { answerFromWords as wordsAnswer } from '../../server/cards.mjs'

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
  /** The project cannot open yet because the machine is full (OLA-299): said instead of "lost". */
  held?: string | null
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
  placeholder: 'answer' | 'working' | 'request'
}

/** Words typed in the box as the answer to the whole card: each question gets them (a list for a pick-several one). The same rule in the apps: server/cards.mjs (OLA-325). */
export function answerFromWords(q: Pick<Question, 'fields'>, words: string): Record<string, string | string[]> {
  return wordsAnswer(q, words) ?? {}
}

/** What a request typed while the machine is full gets (OLA-299): it stays in the box. */
export const HELD = 'Ola’s computer is full just now, so this cannot go yet. Your project opens by itself when a place frees; send it then. Your words stay here.'

export function composerState(i: ComposerInput): ComposerState {
  const text = i.draft.trim()
  const command = text.startsWith('/')
  // A question Ola waits on, whatever its shape: the typed words are the answer. Never
  // blocked by the run (it waits for exactly this) or by a lost event stream (the answer is its own
  // request; if it does not get through, the page says so and the text stays).
  if (i.question && !command) {
    return { button: 'answer', enabled: !!text && !i.answering, submits: !!text && !i.answering, blocked: null, placeholder: 'answer' }
  }
  if (i.working) {
    // A command (/stop, /help) still goes with Return; other words wait for the run to end.
    const blocked = text && !command ? 'Ola is still working on your last request. Wait for it to finish, or type /stop.' : null
    return { button: 'stop', enabled: true, submits: command, blocked, placeholder: i.question ? 'answer' : 'working' }
  }
  // Nothing running: a new request (or a command). Not while the connection is lost, which the
  // banner says, and which comes back by itself (lib/ola.ts listen).
  const lost = i.connection === 'lost'
  const can = !!text && (command || !lost)
  return { button: 'send', enabled: can, submits: can, blocked: text && !can ? (i.held ? HELD : 'The connection to Ola’s computer is lost. Send this again when it is back.') : null, placeholder: 'request' }
}
