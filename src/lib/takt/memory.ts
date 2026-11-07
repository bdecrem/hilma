// The teacher's memory (Takt, 2026-11-06). Bart: "the agent should have some concept of
// memory, but it can be fairly simple, such as 'everything from the 2 most recent sessions, for
// that user'… if I do a jam and I get feedback, it should know what that was and be able to
// talk about that." Built from what the account already keeps: Stage runs (the scores in
// takt_progress's snapshot), improv takes and the reviews the teacher gave them (takt_improv),
// Agent mode's asks and replies (the threads in takt_mods), earlier questions in this chat
// (takt_chat), and the day's lessons finished and goals done (takt_progress). Every dated
// thing is an event; events closer than `SESSION_GAP_MS` belong to one session; the last two
// sessions, the one under way included, are what the teacher is told, in words.

import { f2Supabase } from '@/lib/f2/supabase'
import { noteName } from './improv-agent'
import { SONG_TITLES, MODULE_TITLES } from './library'

export type MemoryEvent = { at: number; text: string }
export type Session = { from: number; to: number; events: MemoryEvent[] }

/** A pause this long between two things ends a session. */
export const SESSION_GAP_MS = 2 * 60 * 60 * 1000
export const SESSIONS_KEPT = 2
/** Events a session is told at most (the latest), and the whole memory's length. */
const EVENTS_PER_SESSION = 40
const MAX_CHARS = 9000

/** The set list and the modules by name, from the library (library.json). */
export { SONG_TITLES, MODULE_TITLES }

const cut = (s: unknown, max: number) => {
  const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
const pct = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? `${Math.round(x * 100)}%` : '')
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// MARK: Sessions

/** Events sorted by time, cut where two are further apart than `gap`; the last `keep`. */
export function sessionsOf(events: MemoryEvent[], gap = SESSION_GAP_MS, keep = SESSIONS_KEPT): Session[] {
  const sorted = [...events].filter((e) => Number.isFinite(e.at)).sort((a, b) => a.at - b.at)
  const out: Session[] = []
  for (const e of sorted) {
    const last = out[out.length - 1]
    if (last && e.at - last.to <= gap) {
      last.events.push(e)
      last.to = e.at
    } else {
      out.push({ from: e.at, to: e.at, events: [e] })
    }
  }
  return out.slice(-keep)
}

function zone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

export function dayOf(at: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
}

const whenFmt = (tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: zone(tz), weekday: 'short', month: 'short', day: 'numeric' })
const timeFmt = (tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: zone(tz), hour: 'numeric', minute: '2-digit' })

/** The sessions in words, oldest first, each with its day's facts (lessons finished, goals
 *  done, by local day) under it. `now` says which session is under way. */
export function renderMemory(sessions: Session[], dayFacts: Record<string, string[]>, tz: string, now: number, gap = SESSION_GAP_MS): string {
  if (!sessions.length) return ''
  const blocks: string[] = []
  const today = dayOf(now, tz)
  sessions.forEach((s, i) => {
    const day = dayOf(s.from, tz)
    const live = now - s.to <= gap
    const when = `${day === today ? 'today, ' : day === dayOf(now - 86_400_000, tz) ? 'yesterday, ' : ''}${whenFmt(tz).format(new Date(s.from))}, ${timeFmt(tz).format(new Date(s.from))}${live ? ' until now' : `–${timeFmt(tz).format(new Date(s.to))}`}`
    const label = i === sessions.length - 1 ? (live ? 'This session' : 'Their last session') : 'The session before'
    const lines = [`${label} (${when}):`]
    const shown = s.events.slice(-EVENTS_PER_SESSION)
    if (shown.length < s.events.length) lines.push(`- (${s.events.length - shown.length} earlier things left out)`)
    for (const e of shown) lines.push(`- ${timeFmt(tz).format(new Date(e.at))} · ${e.text}`)
    const facts = new Set<string>()
    for (const d of new Set(s.events.map((e) => dayOf(e.at, tz)))) for (const f of dayFacts[d] ?? []) facts.add(f)
    if (facts.size) lines.push(`That day: ${[...facts].join('; ')}.`)
    blocks.push(lines.join('\n'))
  })
  let out = blocks.join('\n\n')
  if (out.length > MAX_CHARS) out = `…\n${out.slice(out.length - MAX_CHARS)}`
  return out
}

// MARK: What the account keeps

type ImprovRow = { created_at: string; take: { bars?: number; notes?: { t: number; n: number; v: number; len: number }[] } | null; backing: Record<string, unknown> | null; context: Record<string, unknown> | null; review: Record<string, unknown> | null }
type ModRow = { kind?: string | null; title: string; base_title: string; version: number; messages: { role: string; text: string; at: string }[] | null }
type ChatRow = { where_line: string | null; question: string; answer: string; created_at: string }
type Snapshot = {
  scores?: { song: string; part: string; difficulty: string; score: number; accuracy: number; maxCombo: number; grade: string; level: number; date: string }[]
  practice?: { day: string; kind: string; id: string }[]
  goals?: Record<string, { done?: string | null; best?: number }>
}

const ms = (iso: unknown) => (typeof iso === 'string' ? Date.parse(iso) : NaN)

export function improvEvent(row: ImprovRow): MemoryEvent | null {
  const at = ms(row.created_at)
  if (!Number.isFinite(at)) return null
  const take = row.take ?? {}
  const notes = take.notes ?? []
  const backing = row.backing ?? {}
  const ctx = row.context ?? {}
  const scale = Array.isArray(backing.scale) ? (backing.scale as number[]) : null
  const inScale = scale && notes.length ? notes.filter((n) => scale.includes(((n.n % 12) + 12) % 12)).length / notes.length : null
  const low = notes.length ? Math.min(...notes.map((n) => n.n)) : null
  const high = notes.length ? Math.max(...notes.map((n) => n.n)) : null
  const form = Array.isArray(backing.form) ? (backing.form as string[]).length : 12
  const bars = typeof take.bars === 'number' ? take.bars : 0
  let text = `Improv "${cut(ctx.title, 60) || 'a jam'}" over ${cut(backing.title, 60) || 'the band'}${backing.key ? ` in ${cut(backing.key, 20)}` : ''}: ${bars} bars (${Math.round((bars / form) * 10) / 10} choruses), ${notes.length} notes${inScale != null ? `, ${pct(inScale)} on the notes allowed` : ''}${low != null && high != null ? `, from ${noteName(low)} to ${noteName(high)}` : ''}, sent to the teacher.`
  const review = row.review
  if (review) {
    const idea = (review.idea ?? {}) as Record<string, unknown>
    const ideaNotes = Array.isArray(idea.notes) ? (idea.notes as { t: number; n: number; len: number; f: number }[]) : []
    const beats = ideaNotes.slice(0, 16).map((n) => `${noteName(n.n)} on ${Math.round((n.t / 12 + 1) * 100) / 100}${n.f ? ` (finger ${n.f})` : ''}`).join(', ')
    text += ` The teacher's review: "${cut(review.headline, 80)}"${Array.isArray(review.notes) ? ` — ${(review.notes as unknown[]).map((n) => cut(n, 240)).join(' ')}` : ''}${idea.title ? ` The idea the teacher gave them, "${cut(idea.title, 50)}" (${idea.bars ?? '?'} bars): ${cut(idea.why, 300)}${beats ? ` Its notes: ${beats}.` : ''}` : ''}`
  } else {
    text += ' (No review came back.)'
  }
  return { at, text }
}

export function modEvents(row: ModRow): MemoryEvent[] {
  const out: MemoryEvent[] = []
  for (const m of row.messages ?? []) {
    const at = ms(m.at)
    if (!Number.isFinite(at)) continue
    if (row.kind === 'solo') {
      // The teacher's whole track (solo-agent.ts): the take it came from, then the line.
      out.push({
        at,
        text: m.role === 'user'
          ? `You wrote them the whole track of ${cut(row.base_title, 60)} (the Solo level on the Stage) ${cut(m.text, 200)}`
          : `The Solo on ${cut(row.base_title, 60)}, as you described it: "${cut(m.text, 240)}"`,
      })
      continue
    }
    out.push({
      at,
      text: m.role === 'user'
        ? `Agent mode on "${cut(row.title, 60)}" (their own version of ${cut(row.base_title, 60)}): they asked "${cut(m.text, 240)}"`
        : `The agent answered on "${cut(row.title, 60)}": "${cut(m.text, 360)}"`,
    })
  }
  return out
}

export function chatEvent(row: ChatRow): MemoryEvent | null {
  const at = ms(row.created_at)
  if (!Number.isFinite(at)) return null
  return { at, text: `They asked you${row.where_line ? ` (on ${cut(row.where_line, 100)})` : ''}: "${cut(row.question, 300)}" You answered: "${cut(row.answer, 400)}"` }
}

export function scoreEvents(s: Snapshot): MemoryEvent[] {
  return (s.scores ?? []).flatMap((r) => {
    const at = ms(r.date)
    if (!Number.isFinite(at)) return []
    const level = r.difficulty === 'adaptive' ? `Adaptive, reaching level ${r.level}` : r.difficulty === 'easy+' ? 'Easy+' : title(r.difficulty)
    return [{ at, text: `Stage run: ${SONG_TITLES[r.song] ?? r.song}, the ${r.part} on ${level}: grade ${r.grade}, ${pct(r.accuracy)} accuracy, ${r.score} points, best combo ${r.maxCombo}.` }]
  })
}

/** Lessons finished and goals done, by local day ("2026-11-06"), from the snapshot. */
export function dayFactsOf(s: Snapshot): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const add = (day: string, fact: string) => (out[day] ??= []).push(fact)
  for (const p of s.practice ?? []) {
    if (p.kind !== 'lesson') continue
    const [code, n] = p.id.split('·')
    const mod = MODULE_TITLES[code] ?? code
    add(p.day, n === 'finish' ? `finished the ${mod} module's payoff` : `finished lesson ${n} of ${mod}`)
  }
  for (const [key, g] of Object.entries(s.goals ?? {})) {
    if (!g?.done) continue
    const [, level, id] = key.split('·')
    add(g.done, `cleared Level ${level}'s goal "${id}"`)
  }
  return out
}

/** Everything the account keeps from the user's last two sessions, in words; "" for a new
 *  account. Never throws: a table that fails to read is left out and logged. */
export async function recentMemory(userId: string, tz: string, now = Date.now()): Promise<string> {
  const db = f2Supabase()
  const events: MemoryEvent[] = []
  let facts: Record<string, string[]> = {}
  const since = new Date(now - 60 * 86_400_000).toISOString()
  try {
    const [chat, improv, mods, progress] = await Promise.all([
      db.from('takt_chat').select('where_line, question, answer, created_at').eq('user_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(60),
      db.from('takt_improv').select('created_at, take, backing, context, review').eq('user_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(30),
      db.from('takt_mods').select('kind, title, base_title, version, messages').eq('user_id', userId).order('updated_at', { ascending: false }).limit(10),
      db.from('takt_progress').select('snapshot').eq('user_id', userId).maybeSingle(),
    ])
    for (const [name, r] of [['takt_chat', chat], ['takt_improv', improv], ['takt_mods', mods], ['takt_progress', progress]] as const) {
      if (r.error) console.error(`[takt/chat] memory: ${name}: ${r.error.message}`)
    }
    for (const row of (chat.data ?? []) as ChatRow[]) {
      const e = chatEvent(row)
      if (e) events.push(e)
    }
    for (const row of (improv.data ?? []) as ImprovRow[]) {
      const e = improvEvent(row)
      if (e) events.push(e)
    }
    for (const row of (mods.data ?? []) as ModRow[]) events.push(...modEvents(row))
    const snapshot = (progress.data as { snapshot?: Snapshot } | null)?.snapshot
    if (snapshot) {
      events.push(...scoreEvents(snapshot))
      facts = dayFactsOf(snapshot)
    }
  } catch (e) {
    console.error('[takt/chat] memory failed:', e)
    return ''
  }
  return renderMemory(sessionsOf(events), facts, tz, now)
}
