import { f2Supabase } from '@/lib/f2/supabase'
import { MEMO_MARK } from './memo'
import { writeMinutes, type Line, type Minutes, type MinutesDeps } from './minutes'

// The real database behind minutes.ts. The table may not exist yet (schema 010 is applied by
// hand): then reads find nothing and writes are skipped with a log line.
//
// Who writes minutes (2026-11-19, OLA-186): not this server. The Claude call runs on the Mac mini
// on the Claude login (the Max plan), from scripts/venture/minutes.ts, every minute (launchd
// sh.venture.minutes). Bart, Nov 18: "all the agent work should be oauth using our max plan".
// The server reads minutes and stores his corrections; `ask` here refuses, so nothing on Vercel
// can spend the API key on minutes again.

const TABLE = 'venture_minutes'
const missing = (e: { code?: string; message?: string }) => e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message ?? '')

export const minutesDeps: MinutesDeps = {
  async get(source, ref) {
    const { data, error } = await f2Supabase().from(TABLE).select('*').eq('source', source).eq('ref', ref).maybeSingle()
    if (error) {
      if (missing(error)) return null
      throw new Error(`venture minutes read failed: ${error.message}`)
    }
    return (data as Minutes | null) ?? null
  },
  async put(m) {
    const row = { source: m.source, ref: m.ref, at: new Date().toISOString(), summary: m.summary, decided: m.decided, to_decide: m.to_decide, kit_will_do: m.kit_will_do, facts: m.facts, removed: m.removed ?? [], edited_at: m.edited_at ?? null, seen_at: null }
    const { error } = await f2Supabase().from(TABLE).upsert(row, { onConflict: 'source,ref' })
    if (error) {
      if (missing(error)) return console.warn('[venture/minutes] table venture_minutes is missing (apply schema 010); minutes not stored')
      throw new Error(`venture minutes write failed: ${error.message}`)
    }
  },
  async ask() {
    throw new Error('minutes are written on the Mac mini, on the Claude login (scripts/venture/minutes.ts), not by this server')
  },
}

/// Every stored minutes for these refs, by ref.
export async function minutesFor(source: Minutes['source'], refs: string[]): Promise<Map<string, Minutes>> {
  const out = new Map<string, Minutes>()
  if (!refs.length) return out
  const { data, error } = await f2Supabase().from(TABLE).select('*').eq('source', source).in('ref', refs)
  if (error) {
    if (missing(error)) return out
    throw new Error(`venture minutes read failed: ${error.message}`)
  }
  for (const m of (data ?? []) as Minutes[]) out.set(m.ref, m)
  return out
}

export async function meetingLines(session: string): Promise<Line[]> {
  const { data, error } = await f2Supabase().from('venture_interview_turns').select('role, text').eq('session', session).order('id')
  if (error) throw new Error(`venture turns read failed: ${error.message}`)
  return ((data ?? []) as { role: string; text: string }[]).filter((t) => t.role !== 'event').map((t) => ({ who: t.role === 'bart' ? 'bart' : 'kit', text: t.text }))
}

export async function noteLines(id: string): Promise<Line[]> {
  const { data, error } = await f2Supabase().from('venture_messages').select('text').eq('id', Number(id)).maybeSingle()
  if (error) throw new Error(`venture note read failed: ${error.message}`)
  const text = (data as { text: string } | null)?.text ?? ''
  return text ? [{ who: 'bart', text: text.startsWith(MEMO_MARK) ? text.slice(MEMO_MARK.length) : text }] : []
}

/// Is schema 010 applied? Without the table, nothing calls Claude for minutes it cannot keep.
export async function tableReady(): Promise<boolean> {
  const { error } = await f2Supabase().from(TABLE).select('id', { head: true, count: 'exact' }).limit(1)
  if (!error) return true
  if (missing(error)) {
    console.warn('[venture/minutes] table venture_minutes is missing (apply schema 010)')
    return false
  }
  throw new Error(`venture minutes check failed: ${error.message}`)
}

/// Write the minutes of one meeting or note with the given Claude call; never throws.
export async function minutesAfter(source: Minutes['source'], ref: string, deps: MinutesDeps, force = false): Promise<void> {
  try {
    if (!(await tableReady())) return
    const lines = source === 'meeting' ? await meetingLines(ref) : await noteLines(ref)
    await writeMinutes(source, ref, lines, deps, force)
  } catch (e) {
    console.error('[venture/minutes] failed:', source, ref, e)
  }
}

/// Every minute, on the mini: calls of the last day that are over (an end marker, or quiet for
/// five minutes) and voice notes of the last day, without minutes yet. Covers a phone that never
/// said the meeting ended and the talk page, which has no end route.
export async function sweepMinutes(deps: MinutesDeps, now = Date.now()): Promise<{ written: string[] }> {
  const since = new Date(now - 24 * 3600e3).toISOString()
  const written: string[] = []
  if (!(await tableReady())) return { written }
  const { data: turns, error } = await f2Supabase().from('venture_interview_turns').select('session, role, text, at').gte('at', since).order('id')
  if (error) throw new Error(`venture turns read failed: ${error.message}`)
  const sessions = new Map<string, { role: string; text: string; at: string }[]>()
  for (const t of turns ?? []) sessions.set(t.session, [...(sessions.get(t.session) ?? []), t])
  const over = [...sessions].filter(([, rows]) => {
    if (rows.some((r) => r.role === 'event' && r.text === 'test')) return false
    if (!rows.some((r) => r.role === 'bart')) return false
    const ended = rows.some((r) => r.role === 'event' && r.text.startsWith('ended'))
    return ended || now - new Date(rows[rows.length - 1].at).getTime() > 5 * 60e3
  })
  const hadMeetings = await minutesFor('meeting', over.map(([s]) => s))
  for (const [session, rows] of over) {
    const had = hadMeetings.get(session)
    // A talk that went on after its minutes were written gets them again, unless Bart corrected them.
    const grew = had && !had.edited_at && had.at && new Date(rows[rows.length - 1].at) > new Date(had.at)
    if (had && !grew) continue
    await minutesAfter('meeting', session, deps, !!grew)
    written.push(`meeting ${session}`)
  }
  // A note younger than 20 seconds waits for the next pass: a check's note (memo-check.mjs) is deleted
  // within seconds, and minutes of it would send the runner after a made-up request.
  const { data: notes, error: e2 } = await f2Supabase().from('venture_messages').select('id').eq('direction', 'in').like('text', `${MEMO_MARK}%`).gte('at', since).lte('at', new Date(now - 20e3).toISOString())
  if (e2) throw new Error(`venture notes read failed: ${e2.message}`)
  const ids = (notes ?? []).map((n) => String(n.id))
  const hadNotes = await minutesFor('note', ids)
  for (const id of ids) {
    if (hadNotes.has(id)) continue
    await minutesAfter('note', id, deps)
    written.push(`note ${id}`)
  }
  return { written }
}
