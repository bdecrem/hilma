// Minutes of every voice conversation and voice note (2026-11-17). Bart, after a call in which an
// idea he was exploring ("Make it a choice.") was answered "Got it" and recorded as decided: "when
// we have voice mode I need those conversations to go into your memory and decisions to be acted
// on, always." One Claude call over the words writes what was decided (only what he confirmed, with
// his words quoted), what is still to decide, what Kit will do, and facts; they are stored in
// venture_minutes (schema 010) for the runner, the working session and the phone. He can correct
// them from the phone. This file is the logic; minutes-store.ts holds the real database and Claude.
// The prompt is generic: what a call says lives only in the database.

export type MinutesItem = { id: string; text: string; quote?: string; by?: 'bart' }
export type Minutes = {
  source: 'meeting' | 'note'
  ref: string
  at?: string
  summary: string
  decided: MinutesItem[]
  to_decide: MinutesItem[]
  kit_will_do: MinutesItem[]
  facts: MinutesItem[]
  removed?: MinutesItem[]
  edited_at?: string | null
}
export type Line = { who: 'bart' | 'kit'; text: string }
export type Section = 'decided' | 'to_decide' | 'kit_will_do' | 'facts'

export type MinutesDeps = {
  /// The stored minutes, or null (none yet, or the table is not there).
  get(source: Minutes['source'], ref: string): Promise<Minutes | null>
  put(m: Minutes): Promise<void>
  /// One Claude call; the reply is JSON matching SCHEMA.
  ask(system: string, user: string): Promise<string>
}

export const SYSTEM = `You write the minutes of one voice conversation between Bart and Kit (an AI agent that runs a project with him), or of one voice note Bart left for Kit. Kit's working sessions act on these minutes, so the line between thinking out loud and deciding matters more than anything else.

- decided: only what Bart confirmed in words in this transcript: "yes, do it", "decided", "go ahead", "let's do that", or a yes to Kit asking whether it is decided. An idea, an option, an imperative said while thinking out loud ("make it a choice"), or Kit saying "got it" does not make a decision. For each, put his confirming words in quote, copied exactly from his lines.
- to_decide: ideas he explored, options and open questions, in his terms, including anything that sounded like a decision but was not confirmed.
- kit_will_do: things he asked Kit to do outright ("send me", "look into", "draft", "find out"). Not things Kit offered unless he said yes to them. In a voice note, a plain request to Kit counts.
- facts: preferences and facts about him, people or the project worth remembering later.
- summary: two short plain lines.

Each line short and plain, in his words where you can. No line in two lists. Empty lists are fine. Never add anything the transcript does not say.`

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'decided', 'to_decide', 'kit_will_do', 'facts'],
  properties: {
    summary: { type: 'string' },
    decided: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'quote'], properties: { text: { type: 'string' }, quote: { type: 'string' } } } },
    to_decide: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } } },
    kit_will_do: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } } },
    facts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } } },
  },
} as const

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
const clean = (s: unknown, max = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export function transcriptText(lines: Line[], source: Minutes['source']): string {
  const head = source === 'note' ? 'A voice note Bart left for Kit:' : 'The conversation:'
  return `${head}\n\n${lines.map((l) => `${l.who === 'bart' ? 'BART' : 'KIT'}: ${l.text}`).join('\n')}`
}

/// Claude's minutes, checked: a decision whose quote is not in his own words is only an idea.
export function readDraft(raw: string, lines: Line[]): Omit<Minutes, 'source' | 'ref'> {
  const j = JSON.parse(raw) as Record<string, unknown>
  const list = (k: string) => (Array.isArray(j[k]) ? (j[k] as Record<string, unknown>[]) : [])
  const his = norm(lines.filter((l) => l.who === 'bart').map((l) => l.text).join(' '))
  const decided: MinutesItem[] = []
  const toDecide: MinutesItem[] = list('to_decide').map((x) => ({ id: '', text: clean(x.text) }))
  for (const x of list('decided')) {
    const quote = clean(x.quote)
    if (quote && norm(quote).length > 0 && his.includes(norm(quote))) decided.push({ id: '', text: clean(x.text), quote })
    else toDecide.push({ id: '', text: clean(x.text) })
  }
  const ids = (prefix: string, xs: MinutesItem[]) => xs.filter((x) => x.text).map((x, i) => ({ ...x, id: `${prefix}${i + 1}` }))
  return {
    summary: clean(j.summary, 400),
    decided: ids('d', decided),
    to_decide: ids('t', toDecide),
    kit_will_do: ids('k', list('kit_will_do').map((x) => ({ id: '', text: clean(x.text) }))),
    facts: ids('f', list('facts').map((x) => ({ id: '', text: clean(x.text) }))),
  }
}

/// Write the minutes of one call or note once (again only with `force`). Nothing to write when he
/// said nothing.
export async function writeMinutes(source: Minutes['source'], ref: string, lines: Line[], d: MinutesDeps, force = false): Promise<Minutes | null> {
  const spoken = lines.filter((l) => l.text.trim())
  if (!spoken.some((l) => l.who === 'bart')) return null
  if (!force) {
    const had = await d.get(source, ref)
    if (had) return had
  }
  const raw = await d.ask(SYSTEM, transcriptText(spoken, source))
  const m: Minutes = { source, ref, ...readDraft(raw, spoken), removed: [], edited_at: null }
  await d.put(m)
  return m
}

/// Bart's correction from the phone: a line moved between decided and to decide, or removed.
export type Correction = { id: string; to: 'decided' | 'to_decide' | 'delete' }

export function corrected(m: Minutes, c: Correction): Minutes | null {
  const sections: Section[] = ['decided', 'to_decide', 'kit_will_do', 'facts']
  const from = sections.find((s) => m[s].some((x) => x.id === c.id))
  if (!from) return null
  const item = m[from].find((x) => x.id === c.id)!
  const out: Minutes = { ...m, [from]: m[from].filter((x) => x.id !== c.id), edited_at: new Date().toISOString() }
  if (c.to === 'delete') {
    out.removed = [...(m.removed ?? []), { ...item, by: 'bart' }]
  } else {
    if (from === c.to) return m
    if (from !== 'decided' && from !== 'to_decide') return null
    // A line he moves is his: a decision he confirms here quotes the correction itself.
    const moved: MinutesItem = c.to === 'decided' ? { id: item.id, text: item.text, quote: 'confirmed on the phone', by: 'bart' } : { id: item.id, text: item.text, by: 'bart' }
    out[c.to] = [...m[c.to], moved]
  }
  return out
}

export async function correctMinutes(source: Minutes['source'], ref: string, c: Correction, d: MinutesDeps): Promise<Minutes | null> {
  const m = await d.get(source, ref)
  if (!m) return null
  const next = corrected(m, c)
  if (!next) return null
  await d.put(next)
  return next
}

/// The minutes as text, for a prompt or a terminal.
export function minutesText(m: Minutes): string {
  const part = (title: string, xs: MinutesItem[], quote = false) =>
    xs.length ? `${title}:\n${xs.map((x) => `- ${x.text}${quote && x.quote ? ` ("${x.quote}")` : ''}${x.by === 'bart' ? ' [set by Bart]' : ''}`).join('\n')}\n` : ''
  return [m.summary, part('Decided', m.decided, true), part('To be decided', m.to_decide), part('Kit will do', m.kit_will_do), part('Facts', m.facts)].filter(Boolean).join('\n')
}
