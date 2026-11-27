// What the board writes to the tracker (2026-11-18, OLA-163): a new issue, a change to a field, a
// comment, each as the signed-in board account and each recorded in the issue's Activity
// (venture_issue_activity, schema 012) as new for Kit. The routes in src/app/api/kochito/app/issues/
// check the board's session before calling anything here; nothing here checks it again.
// The rules for a status match scripts/venture/issues.mjs, so a change made on the page and one
// made from the command line leave the same row behind.
import { f2Supabase } from '@/lib/f2/supabase'
import { AREAS, DIFFICULTIES, type Area, type Issue, type Status, pacificDay } from './board'

export const STATUSES: Status[] = ['open', 'in_progress', 'waiting', 'done', 'dropped']
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message ?? ''))

export class WriteError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

type Fields = { title?: string; what?: string; status?: Status; priority?: Issue['priority']; difficulty?: Issue['difficulty']; area?: Area; who?: string; week?: number | null; proof?: string }

/** Checks and trims what the page sent; throws a WriteError the route turns into a 400. */
export function clean(input: Record<string, unknown>): Fields {
  const f: Fields = {}
  const text = (k: string, max: number) => {
    const v = input[k]
    if (v === undefined) return undefined
    if (typeof v !== 'string') throw new WriteError(`${k} must be text`)
    return v.replace(/\r\n/g, '\n').slice(0, max)
  }
  const title = text('title', 300)
  if (title !== undefined) {
    if (!title.trim()) throw new WriteError('the title cannot be empty')
    f.title = title.trim()
  }
  const what = text('what', 8000)
  if (what !== undefined) f.what = what.trim()
  const who = text('who', 60)
  if (who !== undefined) {
    if (!who.trim()) throw new WriteError('who cannot be empty')
    f.who = who.trim()
  }
  const proof = text('proof', 500)
  if (proof !== undefined) f.proof = proof.trim()
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status as Status)) throw new WriteError(`status must be one of ${STATUSES.join(', ')}`)
    f.status = input.status as Status
  }
  if (input.priority !== undefined) {
    if (!['P0', 'P1', 'P2', 'P4'].includes(input.priority as string)) throw new WriteError('priority must be P0, P1, P2 or P4')
    f.priority = input.priority as Issue['priority']
  }
  if (input.difficulty !== undefined) {
    const d = input.difficulty === null || input.difficulty === '' || input.difficulty === 'none' ? null : String(input.difficulty)
    if (d !== null && !(DIFFICULTIES as readonly string[]).includes(d)) throw new WriteError(`difficulty must be one of ${DIFFICULTIES.join(', ')}, or none`)
    f.difficulty = d as Issue['difficulty']
  }
  if (input.area !== undefined) {
    if (!(String(input.area) in AREAS)) throw new WriteError(`area must be one of ${Object.keys(AREAS).join(', ')}`)
    f.area = input.area as Area
  }
  if (input.week !== undefined) {
    const w = input.week === null || input.week === '' ? null : Number(input.week)
    if (w !== null && !(Number.isInteger(w) && w >= 1 && w <= 4)) throw new WriteError('week must be 1 to 4, or none')
    f.week = w
  }
  return f
}

async function record(rows: Record<string, unknown>[]): Promise<boolean> {
  if (!rows.length) return true
  const { error } = await f2Supabase().from('venture_issue_activity').insert(rows)
  if (error) {
    if (missing(error)) return false // schema 012 not applied: the change itself is saved, the thread is not
    throw new Error(`venture_issue_activity write failed: ${error.message}`)
  }
  return true
}

/** Saves the fields that changed and adds one Activity line for each. */
export async function updateIssue(id: string, input: Record<string, unknown>, user: string): Promise<Issue> {
  const f = clean(input)
  const db = f2Supabase()
  const { data: cur, error } = await db.from('venture_issues').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`venture_issues read failed: ${error.message}`)
  if (!cur) throw new WriteError(`no issue ${id}`, 404)
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {}
  const lines: Record<string, unknown>[] = []
  const base = { issue_id: id, at: now, who: user, via: 'board' }
  for (const k of ['title', 'what', 'priority', 'difficulty', 'area', 'who', 'week'] as const) {
    if (f[k] === undefined || f[k] === (cur[k] ?? (k === 'difficulty' ? null : cur[k]))) continue
    patch[k] = f[k]
    lines.push({ ...base, kind: 'edit', field: k, old_value: cur[k] === null ? null : String(cur[k]), new_value: f[k] === null ? null : String(f[k]) })
  }
  if (f.status && f.status !== cur.status) {
    patch.status = f.status
    if (f.status === 'in_progress') patch.started_at = cur.started_at ?? now
    if (f.status === 'done' || f.status === 'dropped') {
      patch.finished_at = now
      patch.day = pacificDay()
      patch.started_at = cur.started_at ?? now
      if (f.proof) patch.proof = f.status === 'dropped' ? `dropped: ${f.proof}` : f.proof
    }
    if (f.status === 'open' || f.status === 'waiting' || f.status === 'in_progress') {
      // reopened: it no longer counts as done on the day it was closed
      if (cur.status === 'done' || cur.status === 'dropped') (patch.finished_at = null, (patch.day = null))
    }
    lines.push({ ...base, kind: 'status', field: 'status', old_value: cur.status, new_value: f.status, body: f.proof ?? '' })
  } else if (f.proof !== undefined && f.proof !== cur.proof) {
    patch.proof = f.proof
    lines.push({ ...base, kind: 'edit', field: 'proof', old_value: cur.proof, new_value: f.proof })
  }
  if (!Object.keys(patch).length) return cur as Issue
  const { data, error: e2 } = await db.from('venture_issues').update({ ...patch, updated_at: now }).eq('id', id).select().single()
  if (e2) throw new Error(`venture_issues update failed: ${e2.message}`)
  await record(lines)
  return data as Issue
}

/** A comment by the signed-in account. False when schema 012 is not applied yet. */
export async function addComment(id: string, body: unknown, user: string): Promise<boolean> {
  if (typeof body !== 'string' || !body.trim()) throw new WriteError('the comment is empty')
  const db = f2Supabase()
  const { data: cur, error } = await db.from('venture_issues').select('id').eq('id', id).maybeSingle()
  if (error) throw new Error(`venture_issues read failed: ${error.message}`)
  if (!cur) throw new WriteError(`no issue ${id}`, 404)
  const now = new Date().toISOString()
  const ok = await record([{ issue_id: id, at: now, who: user, via: 'board', kind: 'comment', body: body.trim().slice(0, 8000) }])
  if (ok) await db.from('venture_issues').update({ updated_at: now }).eq('id', id)
  return ok
}

/** A new issue from the board: the next number, open (next up), and an "opened" line for Kit. */
export async function createIssue(input: Record<string, unknown>, user: string): Promise<Issue> {
  const f = clean(input)
  if (!f.title) throw new WriteError('a new issue needs a title')
  if (!f.area) throw new WriteError('a new issue needs an area')
  const db = f2Supabase()
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last, error } = await db.from('venture_issues').select('num').eq('project', 'ola').order('num', { ascending: false }).limit(1)
    if (error) throw new Error(`venture_issues read failed: ${error.message}`)
    const num = (last[0]?.num ?? 0) + 1
    const now = new Date().toISOString()
    const row = { id: `OLA-${num}`, num, project: 'ola', title: f.title, what: f.what ?? '', area: f.area, priority: f.priority ?? 'P1', who: f.who ?? 'lead', week: f.week ?? null, status: 'open', opened_at: now, updated_at: now, links: [] }
    const ins = await db.from('venture_issues').insert(row).select().single()
    if (ins.error?.code === '23505') continue // someone took the number at the same moment
    if (ins.error) throw new Error(`venture_issues insert failed: ${ins.error.message}`)
    await record([{ issue_id: row.id, at: now, who: user, via: 'board', kind: 'opened', body: row.title }])
    return ins.data as Issue
  }
  throw new WriteError('could not take a new number, try again', 409)
}
