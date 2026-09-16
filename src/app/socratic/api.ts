// Thin client for /api/socratic/*.

import type { Arm, Mastery, MasteryKey, Phase, Session } from '@/lib/socratic/types'

export type PublicTurn = { id: string; idx: number; role: 'student' | 'tutor'; content: string; hidden: boolean; created_at: string }

export type SessionView = {
  session: Session
  turns: PublicTurn[]
  module: { id: string; title: string; subtitle: string; course: string; source: string; masteryCriteria: Record<MasteryKey, string> }
  arm: { name: string; blurb: string; socratic: boolean; coached: boolean }
}

export type TurnEvent =
  | { type: 'student'; turn: PublicTurn }
  | { type: 'delta'; text: string }
  | { type: 'done'; turn: PublicTurn; session: Session }
  | { type: 'error'; message: string }

async function fail(res: Response): Promise<never> {
  let message = `${res.status}`
  try {
    const j = await res.json()
    if (j?.error) message = j.error
  } catch {}
  throw new Error(message)
}

export async function createSession(participant: string, arm: Arm, moduleId: string): Promise<Session> {
  const res = await fetch('/api/socratic/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participant, arm, module: moduleId }),
  })
  if (!res.ok) await fail(res)
  return (await res.json()).session
}

export async function loadSession(id: string): Promise<SessionView> {
  const res = await fetch(`/api/socratic/sessions/${id}`, { cache: 'no-store' })
  if (!res.ok) await fail(res)
  return res.json()
}

export async function endSession(id: string): Promise<void> {
  const res = await fetch(`/api/socratic/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ended: true }),
  })
  if (!res.ok) await fail(res)
}

/** One exchange, as a stream of events. `message` undefined opens or retries. */
export async function* streamTurn(id: string, message?: string): AsyncGenerator<TurnEvent> {
  const res = await fetch(`/api/socratic/sessions/${id}/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message ? { message } : {}),
  })
  if (!res.ok || !res.body) await fail(res)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) yield JSON.parse(line.slice(6)) as TurnEvent
      }
    }
  }
}

export const PHASE_LABELS: Record<Phase, string> = {
  overview: 'Overview',
  readiness: 'Begin',
  questioning: 'Questions',
  mastery: 'Mastery',
  done: 'Done',
}

export const MASTERY_LABELS: Record<MasteryKey, string> = {
  holding: 'Holding',
  structure: 'Structure',
  both_sides: 'Both sides',
  line_drawing: 'Line-drawing',
}

export function masteryDone(m: Mastery): number {
  return (Object.keys(MASTERY_LABELS) as MasteryKey[]).filter((k) => m[k]).length
}
