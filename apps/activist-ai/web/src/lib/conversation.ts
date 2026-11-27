// opencode's event stream, folded into what the drawer shows: turns, steps in plain words, the
// answer, an approval waiting for the person. Pure functions over a plain object, so the same
// code runs in the page (inside a Solid store's `produce`) and in the tests against recorded
// events (test/fixtures/*.jsonl). The event shapes are opencode 2.3.0's V2 events.
import type { Approval, Problem, Question, Step, Turn } from './types.ts'
import { shown } from './commands.ts'
import { questionCard } from '../../server/cards.mjs'
import { claudeTool, describeApproval, describeClaudeApproval, describeClaudeTool, describeResult, describeTool, nudgeOf, runProblem, shellFailed, stepProblem, STUCK_WORDS } from './steps.ts'

export interface ConversationState {
  sessionID: string | null
  /** The workspace folder, from session.created: used to shorten paths. */
  directory: string | null
  turns: Turn[]
  approval: Approval | null
  /** A question Ola asked and waits on (a form from opencode's `question` tool). */
  question: Question | null
  /** The assistant message whose text is the current answer. */
  answerMessage: string | null
}

export function emptyConversation(): ConversationState {
  return { sessionID: null, directory: null, turns: [], approval: null, question: null, answerMessage: null }
}

/** A loose event: what the stream yields, typed only as far as we read it. */
export interface LooseEvent {
  type: string
  created?: number
  data?: Record<string, any>
}

const DONE: Turn['status'][] = ['done', 'failed', 'stopped']

/** A card's yes when its request has already ended (OLA-250): the card goes, with this sentence.
 *  The same words as the apps (OlaKit OlaStore.noLongerNeededText). */
export const NO_LONGER_NEEDED = 'That question was no longer needed: Ola had already gone on without it.'

/**
 * The person's request without the note the front desk puts in front of an open model's prompt
 * (frontdesk/madeby.mjs, OLA-224: `<ola-engines>…</ola-engines>`, what other engines did in the
 * conversation). The note is for the model; the person sees what they typed.
 */
export function stripEngines(text: string): string {
  if (!text.startsWith('<ola-engines>')) return text
  const end = text.indexOf('</ola-engines>')
  return end < 0 ? text : text.slice(end + '</ola-engines>'.length).replace(/^\s+/, '')
}

const ENGINE_WORDS = { claude: 'Claude', hosted: 'The hosted model' } as const
/**
 * A step's verb with the engine that took it, for a step that wrote or changed a file in a turn
 * another engine ran: "Claude wrote", "The hosted model changed". Ola's own steps keep their verb.
 */
export function stepVerb(step: Pick<Step, 'icon' | 'verb'>, engine?: Turn['engine']): string {
  if ((step.icon !== 'write' && step.icon !== 'change') || (engine !== 'claude' && engine !== 'hosted')) return step.verb
  return `${ENGINE_WORDS[engine]} ${step.verb.charAt(0).toLowerCase()}${step.verb.slice(1)}`
}

export function startTurn(state: ConversationState, request: string, at = Date.now()): Turn {
  const n = nudgeOf(request)
  const turn: Turn = { id: `local-${at}`, request: n.request, at, status: 'sending', steps: [], answer: '', notes: [], error: null, notice: null, ended: null, ...(n.nudge ? { nudge: true } : {}) }
  state.turns.push(turn)
  state.answerMessage = null
  return turn
}

export const LOST_IN_RESTART = 'Ola’s computer restarted your project as this was starting, so it did not run. Send it again.'

/**
 * After a reconnect, the turns Ola's computer has (`fromServer`) replace the page's, except a
 * request this page sent that the computer does not have (a project restarted as it was sent, for
 * example after a member was removed): it stays on the page, said plainly, instead of vanishing
 * (first-user pass, B12). A turn the server has is matched by its request and time.
 */
export function mergeResync(local: Turn[], fromServer: Turn[], now = Date.now()): Turn[] {
  const known = (t: Turn) => fromServer.some((s) => s.request.trim() === t.request.trim() && Math.abs(s.at - t.at) < 5 * 60_000)
  const lastServer = fromServer.length ? fromServer[fromServer.length - 1].at : 0
  const lost = local.filter((t) => t.engine !== 'claude' && t.engine !== 'hosted' && t.request.trim() && t.at >= lastServer && !known(t))
  // A request sent a moment ago may not have reached the computer yet: kept as it is, not failed.
  const young = (t: Turn) => t.status === 'sending' && now - t.at < 15_000
  return [
    ...fromServer,
    ...lost.map((t) => (young(t) ? t : { ...t, status: 'failed' as const, ended: t.ended ?? now, error: t.error ?? { text: LOST_IN_RESTART, detail: 'not in the conversation after a reconnect' } })),
  ]
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
    step.error = exit !== null ? 'The program stopped with an error. What it printed is under Show details.' : (problem?.text ?? 'This step did not work.')
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
  // A form (a question to the person) carries its session inside it.
  const sid: string | undefined = d.sessionID ?? d.form?.sessionID
  if (sid && state.sessionID && sid !== state.sessionID) return false
  if (ev.type === 'session.created') {
    if (d.sessionID !== state.sessionID) return false
    state.directory = d.location?.directory ?? state.directory
    return true
  }
  const turn = current(state)
  // A Claude turn is fed by its own run (applyClaudeEvent), never by opencode's stream.
  if (!turn || !sid || turn.engine === 'claude') return false
  switch (ev.type) {
    case 'session.inbox.delivered':
    case 'session.execution.started':
      if (turn.status === 'sending') turn.status = 'working'
      if (ev.type === 'session.inbox.delivered' && turn.id.startsWith('local-') && d.inboxID) {
        turn.id = d.inboxID
        // The request's time on Ola's computer (the stored user message has the same one), not the
        // page's clock, so "Worked for" reads the same here as in a tab that loads it later (OLA-87).
        if (ev.created) turn.at = ev.created
      }
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
      // Its step ran, so its question was answered (OLA-250): no card for it is left behind.
      if (state.approval?.stepID === step.id) state.approval = null
      return true
    }
    case 'session.tool.failed': {
      const step = stepFor(turn, d.id)
      if (!step) return false
      const problem = stepProblem(d.error)
      finishStep(step, false, at, [outputText(d.content), d.error?.message ?? ''].filter(Boolean).join('\n'), d.metadata, problem)
      if (state.approval?.stepID === step.id) state.approval = null
      return true
    }
    case 'permission.asked': {
      // OLA-250, Nov 22: a question for a step that has already ended is over: never a card, never
      // a finished step put back to waiting (the Mac showed "Run publish.py" that way, for good).
      const step = d.source?.id ? stepFor(turn, d.source.id) : undefined
      if (step && (step.status === 'done' || step.status === 'failed')) return false
      const words = describeApproval(d.action, d.resources ?? [], d.metadata, state.directory)
      state.approval = { id: d.id, sessionID: d.sessionID, action: d.action, ...words, stepID: d.source?.id ?? null }
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
    case 'form.created': {
      const q = questionOf(d.form)
      if (!q) return false
      state.question = q
      const step = q.stepID ? stepFor(turn, q.stepID) : undefined
      if (step) step.status = 'waiting'
      return true
    }
    case 'form.replied':
    case 'form.cancelled': {
      const q = state.question
      if (!q || q.id !== d.id) return false
      const stepID = q.stepID
      state.question = null
      const step = stepID ? stepFor(turn, stepID) : turn.steps.find((s) => s.status === 'waiting')
      if (step && step.status === 'waiting') step.status = 'running'
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
    case 'session.step.ended':
      // OLA-479: a reply the model's length limit cut off, counted by Ola (not the model).
      if (d.finish !== 'length') return false
      turn.cutOff = (turn.cutOff ?? 0) + 1
      return true
    case 'session.execution.succeeded':
      // The run ended: whatever it asked is no longer waiting (OLA-250). A Claude run's card is its own.
    {
      const cleared = (!!state.approval && state.approval.engine !== 'claude') || !!state.question
      if (state.approval && state.approval.engine !== 'claude') state.approval = null
      state.question = null
      if (DONE.includes(turn.status)) return cleared
    }
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
      state.question = null
      settleSteps(turn, at)
      return true
    case 'session.execution.interrupted':
      turn.status = 'stopped'
      turn.ended = at
      turn.notice = null
      state.approval = null
      state.question = null
      if (d.reason && d.reason !== 'user') turn.error = { text: d.reason === 'shutdown' ? 'Ola’s computer restarted your project, so this stopped. Ask again to carry on.' : 'This stopped before it finished.', detail: `interrupted: ${d.reason}` }
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
      const n = nudgeOf(stripEngines(m.text ?? ''))
      turn = { id: m.id, request: n.request, at: m.time?.created ?? 0, status: 'working', steps: [], answer: '', notes: [], error: null, notice: null, ended: null, ...(n.nudge ? { nudge: true } : {}) }
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
      // OLA-479: a reply the model's length limit cut off, counted by Ola.
      if (m.finish === 'length') turn.cutOff = (turn.cutOff ?? 0) + 1
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

/**
 * A switch (OLA-157, frontdesk/switches.mjs): a request handed to a fallback right after a cheaper
 * engine had the conversation's last turn (the ladder: Ola's own model, the hosted open model,
 * Claude), the same rule as the Mac and iPhone apps' kept turns. Call it before the new turn is
 * added. `fromMessage` is that turn's opencode message id, when the page has it (a made-up copy can
 * be made of it where the owner allows). The front desk records labels and counts only.
 */
export function switchOf(turns: Turn[], to: 'hosted' | 'claude'): { switchedFrom: 'ola' | 'hosted'; fromMessage?: string } | null {
  const RANK = { ola: 0, hosted: 1, claude: 2 } as const
  const last = turns[turns.length - 1]
  if (!last) return null
  const from = last.engine ?? 'ola'
  if (from === 'claude' || RANK[to] <= RANK[from]) return null
  const id = /^[A-Za-z0-9_-]{1,80}$/.test(last.id) && !/^(local|claude)-/.test(last.id) ? last.id : undefined
  return { switchedFrom: from, ...(id ? { fromMessage: id } : {}) }
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
    .map((t) => `The person asked: ${t.request}\n${t.engine === 'claude' ? 'Claude' : t.engine === 'hosted' ? 'The hosted open model' : 'Ola'} answered: ${shown(t.answer) || (t.error ? `(it stopped: ${t.error.text})` : '(no answer)')}`)
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

/** A form from opencode as the question the page shows, or null when it is not one we can show: the card described once (server/cards.mjs, OLA-325). */
export function questionOf(form: unknown): Question | null {
  return questionCard(form)
}
