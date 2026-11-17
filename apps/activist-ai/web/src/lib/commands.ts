// Slash commands and reactions: the rules are in apps/activist-ai/README.md, "Slash commands and
// reactions (all surfaces)". The Mac and iPhone apps follow the same text
// (apple/OlaKit/Sources/OlaKit/Commands.swift); keep the two in step. Pure functions, so the
// tests (test/commands.test.ts) run them as they are.
import type { Turn } from './types.ts'

export type CommandName = 'claude' | 'ola' | 'hosted' | 'new' | 'stop' | 'files' | 'help'

/** The commands, in the menu's order, each with its one line. */
export const COMMANDS: { name: CommandName; summary: string }[] = [
  { name: 'claude', summary: 'Hand this request to Claude Code' },
  { name: 'ola', summary: 'Use Ola’s own model for this request' },
  { name: 'hosted', summary: 'Hand this request to the hosted open model' },
  { name: 'new', summary: 'Start a new conversation' },
  { name: 'stop', summary: 'Stop the run' },
  { name: 'files', summary: 'Show the project’s files' },
  { name: 'help', summary: 'List the commands' },
]

/** What was typed: no command, a command and the request after it, or an unknown command. */
export type Parsed = { kind: 'none' } | { kind: 'command'; name: CommandName; rest: string } | { kind: 'unknown'; word: string }

/** A command only at the very start: "/" and a word, then a space, a line break or the end. */
export function parseCommand(text: string): Parsed {
  if (!text.startsWith('/')) return { kind: 'none' }
  const word = /^\/(\S*)/.exec(text)![1]
  if (!word) return { kind: 'unknown', word: '' }
  const rest = text.slice(1 + word.length).trim()
  const c = COMMANDS.find((x) => x.name === word.toLowerCase())
  return c ? { kind: 'command', name: c.name, rest } : { kind: 'unknown', word }
}

/** The commands the menu shows for what is typed so far ("/" alone shows them all). */
export function commandMatches(text: string): CommandName[] {
  if (!text.startsWith('/') || /\s/.test(text)) return []
  const typed = text.slice(1).toLowerCase()
  return COMMANDS.filter((c) => c.name.startsWith(typed)).map((c) => c.name)
}

// ---------------------------------------------------------------- reactions

export type ReactionName = 'eyes' | 'thanks' | 'ok' | 'done' | 'party' | 'think' | 'oops'

export const REACTIONS: Record<ReactionName, { emoji: string; meaning: string }> = {
  eyes: { emoji: '\u{1F440}', meaning: 'on it' },
  thanks: { emoji: '\u{1F64F}', meaning: 'thanks' },
  ok: { emoji: '\u{1F44D}', meaning: 'noted' },
  done: { emoji: '\u{2705}', meaning: 'done' },
  party: { emoji: '\u{1F389}', meaning: 'a win' },
  think: { emoji: '\u{1F914}', meaning: 'a question first' },
  oops: { emoji: '\u{1F605}', meaning: 'my mistake' },
}

/** The standing instruction, word for word (README; workspace/AGENTS.md; frontdesk/claude.mjs). */
export const REACTION_INSTRUCTION = `Reactions. You may react to the person's message with one emoji, like a reaction in a chat app.
To react, make the very first line of your reply exactly [[ola:react NAME]], with NAME one of:
eyes (you are on it), thanks (they thanked or complimented you), ok (noted: an instruction or
preference that needs no work), done (you finished what they asked), party (they share a win),
think (you need something from them first), oops (they caught your mistake).
Use at most one reaction, only on that first line, and never explain it or mention it.
If the message is only thanks or a compliment, reply with the marker line alone and nothing else.

Drawings. When asked for a drawing, diagram or illustration, draw it in code as an SVG file (clean shapes, a viewBox, no outside fonts or images) and save it in the project; say its file name. Use a chart library only for charts of data.`

const MARKER = /\[\[ola:react\s+([A-Za-z]+)\s*\]\]/g
const WHOLE = /^\[\[ola:react\s+([A-Za-z]+)\s*\]\]$/
const isName = (s: string): s is ReactionName => Object.prototype.hasOwnProperty.call(REACTIONS, s)

/**
 * A reply's reaction and the text to show. The marker counts only as the whole first line (blank
 * lines before it do not count); every marker anywhere is removed from what is shown. While the
 * reply is still streaming (`streaming`), a first line that may yet become a marker ("[[ola:re")
 * is held back, so the raw marker never shows, not even for a moment.
 */
export function splitReaction(reply: string, streaming = false): { reaction: ReactionName | null; text: string } {
  const lines = reply.split('\n')
  while (lines.length > 1 && !lines[0].trim()) lines.shift()
  let reaction: ReactionName | null = null
  const first = lines[0].trim()
  const m = WHOLE.exec(first)
  if (m) {
    const name = m[1].toLowerCase()
    if (isName(name)) reaction = name
    lines.shift()
  } else if (streaming && lines.length === 1 && first && ('[[ola:react '.startsWith(first) || /^\[\[ola:react\s+[A-Za-z]*\s*\]?$/.test(first))) {
    return { reaction: null, text: '' }
  }
  let text = lines.join('\n').replace(MARKER, '')
  // A marker still arriving at the very end of a streaming reply ("… [[ola:rea") is held back too.
  if (streaming) text = text.replace(/\[(\[(o(l(a(:(r(e(a(c(t[^\]]*\]?)?)?)?)?)?)?)?)?)?)?$/, '')
  return { reaction, text: text.trim() }
}

/** The texts of a turn in order (its notes, then the answer). */
const textsOf = (t: Turn) => [...t.notes, t.answer].filter((s) => s.trim())
const running = (t: Turn) => t.status === 'working' || t.status === 'sending'

/** The reply's own reaction: on the first line of the turn's first text. */
export function ownReaction(t: Turn): ReactionName | null {
  const first = textsOf(t)[0]
  return first ? splitReaction(first, running(t)).reaction : null
}

/** A text of the turn as shown (no marker). */
export const shown = (text: string, streaming = false) => splitReaction(text, streaming).text

/**
 * The reaction on the person's message: the reply's own; else 👀 while the run works, ✅ when it
 * ended well, none while it is only being sent or when it failed or was stopped.
 */
export function turnReaction(t: Turn): ReactionName | null {
  const own = ownReaction(t)
  if (own) return own
  if (t.status === 'working') return 'eyes'
  if (t.status === 'done') return 'done'
  return null
}

/** Only a reaction, nothing to show under it (a thank-you): no reply, no run line. */
export function reactionOnly(t: Turn): boolean {
  return t.status === 'done' && !t.error && !t.steps.length && !!ownReaction(t) && textsOf(t).every((s) => !shown(s))
}
