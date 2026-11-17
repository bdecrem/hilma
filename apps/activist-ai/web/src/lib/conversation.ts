// opencode's event stream, folded into what the drawer shows: turns, steps in plain words, the
// answer, an approval waiting for the person. Pure functions over a plain object, so the same
// code runs in the page (inside a Solid store's `produce`) and in the tests against recorded
// events (test/fixtures/*.jsonl). The event shapes are opencode 2.3.0's V2 events.
import type { Approval, Problem, Step, Turn } from './types.ts'
import { claudeTool, describeApproval, describeClaudeApproval, describeClaudeTool, describeResult, describeTool, runProblem, shellFailed, stepProblem, STUCK_WORDS } from './steps.ts'

export interface ConversationState {
  sessionID: string | null
  /** The workspace folder, from session.created: used to shorten paths. */
  directory: string | null
  turns: Turn[]
  approval: Approval | null
  /** The assistant message whose text is the current answer. */
  answerMessage: string | null
}

export function emptyConversation(): ConversationState {
  return { sessionID: null, directory: null, turns: [], approval: null, answerMessage: null }
}

/** A loose event: what the stream yields, typed only as far as we read it. */
export interface LooseEvent {
  type: string
  created?: number
  data?: Record<string, any>
}

const DONE: Turn['status'][] = ['done', 'failed', 'stopped']

export function startTurn(state: ConversationState, request: string, at = Date.now()): Turn {
  const turn: Turn = { id: `local-${at}`, request, at, status: 'sending', steps: [], answer: '', notes: [], error: null, notice: null, ended: null }
  state.turns.push(turn)
  state.answerMessage = null
  return turn
}

function current(state: ConversationState): Turn | null {
  const t = state.turns[state.turns.length - 1]
  return t ?? null
}

function stepFor(turn: Turn, id: string): Step | undefined {
  return turn.steps.find((s) => s.id === id)
}

function outputText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.map((c: any) => (c?.type === 'text' ? String(c.text ?? '') : c?.type === 'file' ? `[file ${c.name ?? c.uri ?? ''}]` : '')).join('\n')
}

function finishStep(step: Step, ok: boolean, at: number, output: string, metadata: Record<string, unknown> | undefined, problem: Problem | null) {
  step.detail.output = output
  step.ended = at
  const exit = ok ? shellFailed(metadata) : null
  if (ok && exit === null) {
    step.status = 'done'
    step.result = describeResult(step.tool, safeParse(step.detail.input), output, metadata)
  } else {
    step.status = 'failed'
    step.error = exit !== null ? `The program stopped with an error (exit code ${exit}).` : (problem?.text ?? 'This step did not work.')
  }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function pretty(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

/** Folds one event into the state. Events for other sessions are ignored. Returns true if it changed anything. */
export function applyEvent(state: ConversationState, ev: LooseEvent): boolean {
  const d = ev.data ?? {}
  const at = ev.created ?? Date.now()
  if (d.sessionID && state.sessionID && d.sessionID !== state.sessionID) return false
  if (ev.type === 'session.created') {
    if (d.sessionID !== state.sessionID) return false
    state.directory = d.location?.directory ?? state.directory
    return true
  }
  const turn = current(state)
  // A Claude turn is fed by its own run (applyClaudeEvent), never by opencode's stream.
  if (!turn || !d.sessionID || turn.engine === 'claude') return false
  switch (ev.type) {
    case 'session.inbox.delivered':
    case 'session.execution.started':
      if (turn.status === 'sending') turn.status = 'working'
      if (ev.type === 'session.inbox.delivered' && turn.id.startsWith('local-') && d.inboxID) turn.id = d.inboxID
      return true
    case 'session.tool.input.started': {
      if (stepFor(turn, d.id)) return false
      const words = describeTool(d.name, {}, state.directory)
      turn.steps.push({ id: d.id, tool: d.name, ...words, result: null, status: 'preparing', error: null, detail: { input: '', output: '' }, started: at, ended: null })
      if (turn.status === 'sending') turn.status = 'working'
      return true
    }
    case 'session.tool.called': {
      const step = stepFor(turn, d.id)
      if (!step) return false
      Object.assign(step, describeTool(step.tool, d.input ?? {}, state.directory))
      step.detail.input = step.tool === 'shell' || step.tool === 'bash' ? String(d.input?.command ?? pretty(d.input)) : pretty(d.input)
      if (step.status === 'preparing') step.status = 'running'
      return true
    }
    case 'session.tool.success': {
      const step = stepFor(turn, d.id)
      if (!step) return false
      finishStep(step, true, at, outputText(d.content), d.metadata, null)
      return true
    }
    case 'session.tool.failed': {
      const step = stepFor(turn, d.id)
      if (!step) return false
      const problem = stepProblem(d.error)
      finishStep(step, false, at, [outputText(d.content), d.error?.message ?? ''].filter(Boolean).join('\n'), d.metadata, problem)
      return true
    }
    case 'permission.asked': {
      const words = describeApproval(d.action, d.resources ?? [], d.metadata, state.directory)
      state.approval = { id: d.id, sessionID: d.sessionID, action: d.action, ...words, stepID: d.source?.id ?? null }
      const step = d.source?.id ? stepFor(turn, d.source.id) : undefined
      if (step) step.status = 'waiting'
      return true
    }
    case 'permission.replied': {
      if (state.approval?.id === d.requestID) state.approval = null
      const step = turn.steps.find((s) => s.status === 'waiting')
      if (step) {
        if (d.reply === 'reject') {
          step.status = 'failed'
          step.error = 'You said no, so Ola did not do this.'
          step.ended = at
        } else step.status = 'running'
      }
      return true
    }
    case 'session.text.delta': {
      if (state.answerMessage !== d.assistantMessageID) {
        if (turn.answer.trim()) turn.notes.push(turn.answer.trim())
        turn.answer = ''
        state.answerMessage = d.assistantMessageID
      }
      turn.answer += d.delta ?? ''
      return true
    }
    case 'session.text.ended': {
      if (state.answerMessage !== d.assistantMessageID) {
        if (turn.answer.trim()) turn.notes.push(turn.answer.trim())
        state.answerMessage = d.assistantMessageID
      }
      turn.answer = d.text ?? turn.answer
      return true
    }
    case 'session.retry.scheduled': {
      const secs = Math.max(0, Math.round(((d.at ?? at) - at) / 1000))
      turn.notice = `The model did not answer. Trying again${secs ? ` in ${secs} s` : ''} (attempt ${d.attempt ?? 2}).`
      return true
    }
    case 'session.step.started':
      if (turn.notice) turn.notice = null
      // Each step names its model: a step by the hosted open model marks the reply as outside this machine.
      if (d.model?.id === 'hosted') turn.engine = 'hosted'
      return true
    case 'session.step.failed':
      turn.error = runProblem(d.error)
      return true
    case 'session.execution.succeeded':
      if (DONE.includes(turn.status)) return false
      turn.status = 'done'
      turn.ended = at
      turn.notice = null
      settleSteps(turn, at)
      return true
    case 'session.execution.failed':
      turn.status = 'failed'
      turn.error = runProblem(d.error)
      turn.ended = at
      turn.notice = null
      state.approval = null
      settleSteps(turn, at)
      return true
    case 'session.execution.interrupted':
      turn.status = 'stopped'
      turn.ended = at
      turn.notice = null
      state.approval = null
      if (d.reason && d.reason !== 'user') turn.error = { text: d.reason === 'shutdown' ? 'Ola’s computer restarted the workspace, so this stopped.' : 'This stopped before it finished.', detail: `interrupted: ${d.reason}` }
      settleSteps(turn, at)
      return true
    default:
      return false
  }
}

/** Steps still open when a run ends did not finish. */
function settleSteps(turn: Turn, at: number) {
  for (const s of turn.steps) {
    if (s.status === 'done' || s.status === 'failed') continue
    s.status = 'failed'
    s.error = s.error ?? 'This step did not finish.'
    s.ended = at
  }
}

// ---------------------------------------------------------------- from the stored history

/**
 * Rebuilds the turns from opencode's message list (GET /api/session/:id/message, newest first).
 * Used when the drawer opens an earlier conversation and after a lost connection comes back,
 * so what the person sees is what opencode has, not what the page happened to hear.
 */
export function turnsFromMessages(messages: any[], directory: string | null): Turn[] {
  const ordered = [...messages].sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))
  const turns: Turn[] = []
  let turn: Turn | null = null
  for (const m of ordered) {
    if (m.type === 'user') {
      turn = { id: m.id, request: m.text ?? '', at: m.time?.created ?? 0, status: 'working', steps: [], answer: '', notes: [], error: null, notice: null, ended: null }
      turns.push(turn)
      continue
    }
    if (!turn) continue
    if (m.type === 'assistant') {
      if (m.model?.id === 'hosted') turn.engine = 'hosted'
      let text = ''
      for (const part of m.content ?? []) {
        if (part.type === 'text') text += part.text ?? ''
        if (part.type === 'tool') {
          const input = part.state?.input ?? {}
          const step: Step = {
            id: part.id,
            tool: part.name,
            ...describeTool(part.name, input, directory),
            result: null,
            status: 'running',
            error: null,
            detail: { input: part.name === 'shell' ? String(input.command ?? '') : pretty(input), output: '' },
            started: part.time?.created ?? m.time?.created ?? 0,
            ended: part.time?.completed ?? null,
          }
          const st = part.state?.status
          if (st === 'completed') finishStep(step, true, step.ended ?? 0, outputText(part.state?.content), part.state?.metadata, null)
          else if (st === 'error') finishStep(step, false, step.ended ?? 0, part.state?.error?.message ?? '', part.state?.metadata, stepProblem(part.state?.error))
          turn.steps.push(step)
        }
      }
      if (text.trim()) {
        if (turn.answer.trim()) turn.notes.push(turn.answer.trim())
        turn.answer = text
      }
      if (m.error) turn.error = runProblem(m.error)
    }
    if (m.type === 'idle') {
      turn.status = m.outcome === 'succeeded' ? 'done' : m.outcome === 'interrupted' ? 'stopped' : 'failed'
      turn.ended = m.time?.created ?? null
      if (turn.status === 'failed' && !turn.error) turn.error = { text: 'It stopped before it finished.', detail: `outcome: ${m.outcome}` }
      settleSteps(turn, turn.ended ?? 0)
    }
  }
  return turns
}

// ---------------------------------------------------------------- Claude Code (Fallback to Claude)
//
// A Claude turn is fed by the front desk's NDJSON (frontdesk/claude.mjs): its own lines
// ({ola: 'started' | 'approval' | 'answered' | 'ended'}) and Claude Code's stream-json events,
// typed and capped there (system/init, system/api_retry, assistant, user, result). The same Turn
// and Step shapes as Ola's, so the drawer draws both alike; the turn is marked engine 'claude'.

export interface ClaudeEvent {
  ola?: string
  type?: string
  [k: string]: any
}

export function startClaudeTurn(state: ConversationState, request: string, at = Date.now(), handoff: string | null = null): Turn {
  const turn = startTurn(state, request, at)
  turn.id = `claude-${at}`
  turn.engine = 'claude'
  turn.run = null
  turn.handoff = handoff
  return turn
}

/** Folds one line of a Claude run into its turn (and the conversation's approval). */
export function applyClaudeEvent(state: ConversationState, turn: Turn, ev: ClaudeEvent, at = Date.now()): boolean {
  if (ev.ola === 'started') {
    turn.run = typeof ev.run === 'string' ? ev.run : turn.run
    if (turn.status === 'sending') turn.status = 'working'
    return true
  }
  if (ev.ola === 'approval') {
    const words = describeClaudeApproval(String(ev.tool_name ?? ''), ev.input ?? {}, '/work')
    state.approval = { id: String(ev.request_id), sessionID: turn.run ?? '', engine: 'claude', run: turn.run ?? undefined, action: words.action, title: words.title, items: words.items, stepID: ev.tool_use_id ?? null }
    const step = ev.tool_use_id ? stepFor(turn, ev.tool_use_id) : undefined
    if (step) step.status = 'waiting'
    return true
  }
  if (ev.ola === 'answered') {
    if (state.approval?.id === ev.request_id) state.approval = null
    const step = turn.steps.find((s) => s.status === 'waiting')
    if (step) {
      if (ev.decision === 'reject') {
        step.status = 'failed'
        step.error = 'You said no, so Claude did not do this.'
        step.ended = at
      } else step.status = 'running'
    }
    return true
  }
  if (ev.ola === 'ended') {
    if (state.approval?.engine === 'claude') state.approval = null
    turn.ended = at
    turn.notice = null
    if (ev.reason === 'done') turn.status = 'done'
    else if (ev.reason === 'stopped') turn.status = 'stopped'
    else if (ev.reason === 'ceiling') {
      turn.status = 'stopped'
      turn.error = { text: String(ev.message ?? 'Claude was stopped at the longest one request may run.'), detail: 'stopped at the run limit' }
    } else {
      turn.status = 'failed'
      if (!turn.error) turn.error = { text: String(ev.message ?? 'Claude stopped before it finished.'), detail: `ended: ${ev.reason}` }
    }
    settleSteps(turn, at)
    return true
  }
  if (turn.status === 'sending') turn.status = 'working'
  if (ev.type === 'system' && ev.subtype === 'api_retry') {
    const secs = Math.round((Number(ev.retry_delay_ms) || 0) / 1000)
    turn.notice = `Claude did not answer. Trying again${secs ? ` in ${secs} s` : ''} (attempt ${(Number(ev.attempt) || 1) + 1}).`
    return true
  }
  if (ev.type === 'assistant') {
    turn.notice = null
    for (const c of ev.message?.content ?? []) {
      if (c.type === 'text' && String(c.text ?? '').trim()) {
        if (turn.answer.trim()) turn.notes.push(turn.answer.trim())
        turn.answer = String(c.text)
      } else if (c.type === 'tool_use' && !stepFor(turn, c.id)) {
        const input = c.input ?? {}
        const tool = claudeTool(String(c.name ?? ''))
        turn.steps.push({ id: String(c.id), tool, ...describeClaudeTool(String(c.name ?? ''), input, '/work'), result: null, status: 'running', error: null, detail: { input: tool === 'shell' ? String(input.command ?? '') : pretty(input), output: '' }, started: at, ended: null })
      }
    }
    return true
  }
  if (ev.type === 'user') {
    for (const c of ev.message?.content ?? []) {
      if (c.type !== 'tool_result') continue
      const step = stepFor(turn, c.tool_use_id)
      if (!step || step.status === 'done' || (step.status === 'failed' && step.ended)) continue
      const output = String(c.content ?? '')
      finishStep(step, !c.is_error, at, output, undefined, c.is_error ? stepProblem({ message: output }) : null)
    }
    return true
  }
  if (ev.type === 'result') {
    if (ev.is_error && !turn.error) turn.error = { text: firstSentence(String(ev.result ?? '')) || 'Claude stopped before it finished.', detail: `result: ${ev.subtype ?? ''}` }
    else if (!turn.answer.trim() && ev.result) turn.answer = String(ev.result)
    return true
  }
  return false
}
const firstSentence = (s: string) => (s.split('\n').find((l) => l.trim()) ?? '').slice(0, 200)

/** A Claude run from its record in the project (GET /api/claude/turns), as a turn. */
export function turnFromClaudeRun(r: { run: string; at: number; request: string; why: string; events: ClaudeEvent[]; active: boolean }): Turn {
  const s = emptyConversation()
  const turn = startClaudeTurn(s, r.request, r.at, r.why === 'stuck' ? 'Ola got stuck, so Claude tried the same request.' : r.why === 'always' ? STUCK_WORDS.always : null)
  turn.id = `claude-${r.run}`
  turn.run = r.run
  turn.status = 'working'
  for (const e of r.events) applyClaudeEvent(s, turn, e, r.at)
  if (!r.active) {
    const result = [...r.events].reverse().find((e) => e.type === 'result')
    applyClaudeEvent(s, turn, { ola: 'ended', reason: result ? (result.is_error ? 'failed' : 'done') : 'stopped' }, r.at)
  }
  return turn
}

/** The conversation so far, as plain text for Claude (newest kept when it is long). */
export function contextOf(turns: Turn[], max = 24_000): string {
  const parts = turns
    .filter((t) => t.status !== 'sending' && t.status !== 'working')
    .map((t) => `The person asked: ${t.request}\n${t.engine === 'claude' ? 'Claude' : t.engine === 'hosted' ? 'The hosted open model' : 'Ola'} answered: ${t.answer.trim() || (t.error ? `(it stopped: ${t.error.text})` : '(no answer)')}`)
  let out = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    if (out.length + parts[i].length + 2 > max) break
    out = `${parts[i]}\n\n${out}`
  }
  return out.trim()
}

/** "Worked for 1 min 48 s · 6 steps · changed 3 files" */
export function runSummary(turn: Turn, now = Date.now()): string {
  const secs = Math.max(0, Math.round(((turn.ended ?? now) - turn.at) / 1000))
  const time = secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)} min ${secs % 60} s`
  const changed = new Set(turn.steps.filter((s) => (s.icon === 'write' || s.icon === 'change') && s.status === 'done').map((s) => s.object)).size
  const parts = [`${turn.status === 'working' || turn.status === 'sending' ? 'Working' : 'Worked'} for ${time}`, `${turn.steps.length} ${turn.steps.length === 1 ? 'step' : 'steps'}`]
  if (changed) parts.push(`changed ${changed} ${changed === 1 ? 'file' : 'files'}`)
  const failed = turn.steps.filter((s) => s.status === 'failed').length
  if (failed) parts.push(`${failed} did not work`)
  return parts.join(' · ')
}
