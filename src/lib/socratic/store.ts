// Persistence for sessions and turns (soc_sessions / soc_turns).

import { socDb } from './db'
import type { Arm, Mastery, Phase, Session, Turn } from './types'
import { EMPTY_MASTERY, MASTERY_KEYS } from './types'

export const UUID_RE = /^[0-9a-f-]{36}$/i

function normalizeSession(row: Record<string, unknown>): Session {
  const m = (row.mastery ?? {}) as Partial<Mastery>
  return {
    ...(row as unknown as Session),
    mastery: { ...EMPTY_MASTERY, ...m },
  }
}

export async function createSession(input: { participant: string; arm: Arm; module: string }): Promise<Session> {
  const { data, error } = await socDb().from('soc_sessions').insert(input).select('*').single()
  if (error) throw new Error(`createSession: ${error.message}`)
  return normalizeSession(data)
}

export async function getSession(id: string): Promise<Session | null> {
  const { data, error } = await socDb().from('soc_sessions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getSession: ${error.message}`)
  return data ? normalizeSession(data) : null
}

export async function updateSession(id: string, patch: Partial<Pick<Session, 'phase' | 'mastery' | 'turns' | 'tutor_model' | 'ended_at'>>): Promise<void> {
  const { error } = await socDb()
    .from('soc_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`updateSession: ${error.message}`)
}

export async function listTurns(sessionId: string): Promise<Turn[]> {
  const { data, error } = await socDb().from('soc_turns').select('*').eq('session_id', sessionId).order('idx', { ascending: true })
  if (error) throw new Error(`listTurns: ${error.message}`)
  return (data ?? []) as Turn[]
}

export async function insertTurn(t: Omit<Turn, 'id' | 'created_at'>): Promise<Turn> {
  const { data, error } = await socDb().from('soc_turns').insert(t).select('*').single()
  if (error) throw new Error(`insertTurn: ${error.message}`)
  return data as Turn
}

/** Mastery flags only ever turn on. */
export function mergeMastery(prev: Mastery, next: Mastery): Mastery {
  const out = { ...prev }
  for (const k of MASTERY_KEYS) if (next[k]) out[k] = true
  return out
}

export function masteryCount(m: Mastery): number {
  return MASTERY_KEYS.filter((k) => m[k]).length
}

export type SessionRow = Session & { student_turns: number }

/** Researcher view: recent sessions with a count of real student messages. */
export async function listSessions(limit = 200): Promise<SessionRow[]> {
  const db = socDb()
  const { data, error } = await db.from('soc_sessions').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(`listSessions: ${error.message}`)
  const sessions = (data ?? []).map(normalizeSession)
  if (sessions.length === 0) return []
  const { data: turns, error: e2 } = await db
    .from('soc_turns')
    .select('session_id')
    .eq('role', 'student')
    .eq('hidden', false)
    .in('session_id', sessions.map((s) => s.id))
  if (e2) throw new Error(`listSessions turns: ${e2.message}`)
  const counts = new Map<string, number>()
  for (const t of turns ?? []) counts.set(t.session_id, (counts.get(t.session_id) ?? 0) + 1)
  return sessions.map((s) => ({ ...s, student_turns: counts.get(s.id) ?? 0 }))
}

/** What the student's browser gets to see of a turn: no verdicts, no coach notes. */
export type PublicTurn = Pick<Turn, 'id' | 'idx' | 'role' | 'content' | 'hidden' | 'created_at'>

export function publicTurn(t: Turn): PublicTurn {
  return { id: t.id, idx: t.idx, role: t.role, content: t.content, hidden: t.hidden, created_at: t.created_at }
}

export function isPhase(x: unknown): x is Phase {
  return x === 'overview' || x === 'readiness' || x === 'questioning' || x === 'mastery' || x === 'done'
}
