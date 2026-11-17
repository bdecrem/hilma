// The live conversation: @opencode/client over our own origin (/oc, the front desk's door),
// opencode's event stream folded by conversation.ts into a Solid store. Connection loss is
// shown, retried with backoff, and followed by a resync from opencode's stored history, so the
// drawer never shows a stale "working" after the network comes back.
import { OpenCode } from '@opencode/client'
import { createStore, produce, reconcile } from 'solid-js/store'
import { applyClaudeEvent, applyEvent, contextOf, emptyConversation, startClaudeTurn, startTurn, turnFromClaudeRun, turnsFromMessages, type ConversationState } from './conversation.ts'
import { describeApproval, STUCK_WORDS, stuckReason, type Stuck } from './steps.ts'
import type { Autonomy, ClaudeInfo, Connection, Engine, Problem, Turn } from './types.ts'
import { claude, desk, deskHeaders } from './api.ts'

export interface EarlierConversation {
  id: string
  title: string
  updated: number
}

export interface OlaState extends ConversationState {
  connection: Connection
  /** How long the current outage has lasted, for "Trying again". */
  lostSince: number | null
  autonomy: Autonomy
  /** A problem with the conversation itself (not one turn): could not start, could not answer. */
  problem: Problem | null
  earlier: EarlierConversation[]
  /** Fallback to Claude for this project (null until known). */
  claude: ClaudeInfo | null
  /** Who the next request goes to: Ola (the default) or Claude (only while Claude is on). */
  engine: Engine
}

const QUIET_MS = 60_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * `live: false` loads state with plain requests and never opens the event stream: a still
 * picture of the page (?still in the address), for screenshots and printing, where an open
 * stream would keep the page from ever being "loaded".
 */
export function createOla({ baseUrl = new URL('/oc', location.origin).href, live = true }: { baseUrl?: string; live?: boolean } = {}) {
  // The workspace and the CSRF token ride on every request; the front desk checks both.
  const client = OpenCode.make({ baseUrl, headers: deskHeaders() })
  const [state, setState] = createStore<OlaState>({ ...emptyConversation(), connection: 'connecting', lostSince: null, autonomy: 'go', problem: null, earlier: [], claude: null, engine: 'ola' })
  let disposed = false
  let streamAbort: AbortController | null = null

  const fold = (ev: any) => {
    setState(produce((s) => void applyEvent(s, ev)))
    if (ev?.type === 'session.execution.interrupted') void noteCeiling(ev.data?.sessionID ?? null)
    watchStuck()
  }
  /**
   * A run the front desk interrupted at the run ceiling ends like a Stop in opencode's events; the
   * front desk says which runs it stopped (GET /api/runs), and the turn shows why.
   */
  async function noteCeiling(sessionID: string | null) {
    if (!sessionID) return
    let stops
    try {
      stops = (await desk.runs()).stopped.filter((r) => r.session === sessionID)
    } catch {
      return
    }
    const stop = stops[stops.length - 1]
    if (!stop || state.sessionID !== sessionID) return
    setState(
      produce((s) => {
        const turn = s.turns[s.turns.length - 1]
        if (!turn || turn.status === 'sending' || turn.status === 'working' || turn.at > Date.parse(stop.at)) return
        turn.status = 'stopped'
        turn.error = { text: stop.message, detail: `stopped at the run limit (${stop.minutes} min)` }
      }),
    )
  }
  const markLost = () => {
    if (state.connection !== 'lost') setState({ connection: 'lost', lostSince: Date.now() })
  }

  async function listen() {
    let backoff = 1000
    let everOpen = false
    while (!disposed) {
      streamAbort = new AbortController()
      try {
        if (state.connection !== 'lost') setState('connection', 'connecting')
        // A stream that goes quiet (a laptop lid, a dropped Wi-Fi) may never error: opencode sends
        // keepalive frames, so a minute of silence means the connection is gone.
        const ctl = streamAbort
        let quiet = setTimeout(() => ctl.abort(), QUIET_MS)
        const onActivity = () => {
          clearTimeout(quiet)
          quiet = setTimeout(() => ctl.abort(), QUIET_MS)
        }
        ctl.signal.addEventListener('abort', () => clearTimeout(quiet))
        for await (const ev of client.event.subscribe({ signal: ctl.signal, onActivity })) {
          if ((ev as any).type === 'server.connected') {
            const wasLost = state.connection === 'lost' || everOpen
            setState({ connection: 'open', lostSince: null })
            everOpen = true
            backoff = 1000
            if (wasLost) void resync()
            void refreshEarlier()
            continue
          }
          fold(ev)
        }
        throw new Error('the event stream ended')
      } catch {
        if (disposed) return
        markLost()
        await sleep(backoff)
        backoff = Math.min(backoff * 2, 10_000)
      }
    }
  }

  /** After a reconnect: take the session's history and pending approval from opencode. */
  async function resync() {
    const sessionID = state.sessionID
    if (!sessionID) return
    try {
      const list = await client.message.list({ sessionID, limit: 200 })
      const turns = await withClaude(sessionID, turnsFromMessages((list as any).data ?? [], state.directory))
      const last = turns[turns.length - 1]
      // A turn still running has no idle marker yet: keep it working, the stream will finish it.
      setState('turns', reconcile(turns))
      if (last && last.status === 'working') setState('answerMessage', null)
      else void noteCeiling(sessionID)
      const pending = await client.permission.list({ sessionID })
      const p = (pending as any[])[0]
      setState('approval', p ? { id: p.id, sessionID, action: p.action, ...describeApproval(p.action, p.resources ?? [], p.metadata, state.directory), stepID: p.source?.id ?? null } : null)
    } catch {
      /* the stream will retry; the lost banner stays until it does */
    }
  }

  async function refreshEarlier() {
    try {
      const res = await client.session.list({ limit: 20, order: 'desc' })
      setState(
        'earlier',
        res.data.filter((s) => s.id !== state.sessionID).map((s) => ({ id: s.id, title: s.title || 'A conversation', updated: s.time.updated })),
      )
    } catch {
      /* the list is a convenience; the connection banner reports real outages */
    }
  }

  async function ensureSession(firstRequest: string): Promise<string> {
    if (state.sessionID) return state.sessionID
    const title = firstRequest.length > 60 ? `${firstRequest.slice(0, 57)}…` : firstRequest
    const session = await client.session.create({ title, metadata: { autonomy: state.autonomy } })
    setState({ sessionID: session.id, directory: session.location?.directory ?? null })
    return session.id
  }

  async function send(text: string) {
    const request = text.trim()
    if (!request) return
    if (state.claude?.enabled && state.engine === 'claude') return sendClaude(request, state.claude.auto === 'always' ? 'always' : 'asked')
    setState('problem', null)
    let sessionID: string
    const at = Date.now()
    setState(produce((s) => void startTurn(s, request, at)))
    const fail = (detail: unknown) =>
      setState(
        produce((s) => {
          const t = s.turns[s.turns.length - 1]
          if (!t || t.status !== 'sending') return
          t.status = 'failed'
          t.ended = Date.now()
          t.error = { text: 'Your request did not reach Ola’s computer. Nothing was done; send it again when the connection is back.', detail: String((detail as any)?.message ?? detail) }
        }),
      )
    try {
      sessionID = await ensureSession(request)
    } catch (e) {
      return fail(e)
    }
    try {
      await client.session.prompt({ sessionID, text: request })
    } catch (e) {
      fail(e)
    }
  }

  async function stop() {
    const last = state.turns[state.turns.length - 1]
    if (last?.engine === 'claude' && (last.status === 'working' || last.status === 'sending')) {
      if (!last.run) return
      try {
        await claude.stop(last.run)
      } catch (e) {
        setState('problem', { text: 'Ola’s computer did not answer the Stop. Claude may still be working.', detail: String((e as any)?.message ?? e) })
      }
      return
    }
    if (!state.sessionID) return
    try {
      await client.session.interrupt({ sessionID: state.sessionID })
    } catch (e) {
      setState('problem', { text: 'Ola’s computer did not answer the Stop. It may still be working.', detail: String((e as any)?.message ?? e) })
    }
  }

  async function answer(decision: 'once' | 'always' | 'reject') {
    const a = state.approval
    if (!a) return
    if (a.engine === 'claude') {
      try {
        await claude.answer(a.run ?? '', a.id, decision)
      } catch (e) {
        setState('problem', { text: 'Your answer did not reach Ola’s computer. Try again.', detail: String((e as any)?.message ?? e) })
      }
      return
    }
    try {
      await client.permission.reply({ sessionID: a.sessionID, requestID: a.id, decision })
    } catch (e) {
      setState('problem', { text: 'Your answer did not reach Ola’s computer. Try again.', detail: String((e as any)?.message ?? e) })
    }
  }

  async function setAutonomy(autonomy: Autonomy) {
    setState('autonomy', autonomy)
    if (!state.sessionID) return
    try {
      await client.session.update({ sessionID: state.sessionID, metadata: { autonomy } })
    } catch (e) {
      setState('problem', { text: 'The change did not reach Ola’s computer; it still works as before.', detail: String((e as any)?.message ?? e) })
    }
  }

  // ------------------------------------------------------------ Fallback to Claude

  async function loadClaude() {
    try {
      const info = await claude.info()
      setState('claude', info)
      if (!info.enabled) setState('engine', 'ola')
      else if (info.auto === 'always') setState('engine', 'claude')
    } catch {
      setState('claude', null)
    }
  }
  function setEngine(engine: Engine) {
    setState('engine', engine === 'claude' && state.claude?.enabled ? 'claude' : 'ola')
  }

  /** The conversation's Claude runs, kept in the project, put among opencode's turns by time. */
  async function withClaude(sessionID: string, turns: Turn[]): Promise<Turn[]> {
    let runs
    try {
      runs = await claude.turns(sessionID)
    } catch {
      return turns
    }
    const all = [...turns, ...runs.map(turnFromClaudeRun)].sort((a, b) => a.at - b.at)
    const live = all[all.length - 1]
    if (live?.engine === 'claude' && live.status === 'working' && live.run && !following.has(live.run)) void followRun(live.run)
    return all
  }
  const following = new Set<string>()
  /** A Claude run that went on while the page was away: caught up from the front desk, then followed. */
  async function followRun(run: string) {
    following.add(run)
    let reset = true
    try {
      await claude.follow(run, (e) =>
        setState(
          produce((s) => {
            const t = s.turns.find((x) => x.run === run)
            if (!t) return
            if (reset) {
              Object.assign(t, { steps: [], notes: [], answer: '', status: 'working', error: null })
              reset = false
            }
            applyClaudeEvent(s, t, e)
          }),
        ),
      )
    } catch {
      /* gone from the front desk's memory: the record in the project is what the page shows */
    } finally {
      following.delete(run)
    }
  }

  /** Hands a request to Claude Code in the project. why: the person asked, Ola got stuck, or every request goes to Claude. */
  async function sendClaude(request: string, why: 'asked' | 'stuck' | 'always', handoff: string | null = why === 'always' ? STUCK_WORDS.always : null) {
    setState('problem', null)
    const context = contextOf(state.turns)
    const at = Date.now()
    setState(produce((s) => void startClaudeTurn(s, request, at, handoff)))
    const update = (f: (s: OlaState, t: Turn) => void) =>
      setState(
        produce((s) => {
          const t = s.turns.find((x) => x.engine === 'claude' && x.at === at)
          if (t) f(s, t)
        }),
      )
    let conversation: string
    try {
      conversation = await ensureSession(request)
    } catch (e) {
      return update((_, t) => Object.assign(t, { status: 'failed', ended: Date.now(), error: { text: 'Your request did not reach Ola’s computer. Nothing was done; send it again when the connection is back.', detail: String((e as any)?.message ?? e) } }))
    }
    try {
      await claude.run({ request, context, conversation, autonomy: state.autonomy, why }, (e) => update((s, t) => void applyClaudeEvent(s, t, e)))
      update((s, t) => {
        if (t.status !== 'working' && t.status !== 'sending') return
        // The reply ended without its last line: the run may still be going on Ola's computer.
        if (t.run) void followRun(t.run)
        else applyClaudeEvent(s, t, { ola: 'ended', reason: 'failed', message: 'The connection to Ola’s computer was lost before Claude finished.' })
      })
    } catch (e) {
      update((_, t) => Object.assign(t, { status: 'failed', ended: Date.now(), error: (e as any)?.problem ?? { text: 'Claude could not start just now.', detail: String((e as any)?.message ?? e) } }))
    }
    void refreshEarlier()
    void loadClaude() // this month's use changed
  }
  /** "Ask Claude instead" on a finished reply: the same request again, by Claude. */
  function askClaudeInstead(turnId: string) {
    const t = state.turns.find((x) => x.id === turnId)
    if (t && state.claude?.enabled) void sendClaude(t.request, 'asked')
  }

  // "When Ola gets stuck": only what can be seen. The run ended in an error, hit its step or token
  // budget, or made three failed tool calls in a row (then Ola is stopped). Then the same request
  // goes to Claude once, marked, with one sentence of why.
  const loadedAt = Date.now()
  const handedOver = new Set<string>()
  let stopping: { turn: string; why: Stuck } | null = null
  function watchStuck() {
    if (state.claude?.enabled !== true || state.claude.auto !== 'stuck') return
    const t = state.turns[state.turns.length - 1]
    if (!t || t.engine === 'claude' || handedOver.has(t.id) || t.at < loadedAt) return
    const running = t.status === 'working' || t.status === 'sending'
    const why = stuckReason(t)
    if (running) {
      if (why === 'tools' && !stopping) {
        stopping = { turn: t.id, why }
        void stop()
      }
      return
    }
    const reason = stopping?.turn === t.id ? stopping.why : t.status === 'stopped' ? null : why
    stopping = null
    if (!reason) return
    handedOver.add(t.id)
    void sendClaude(t.request, 'stuck', STUCK_WORDS[reason])
  }

  function newConversation() {
    if (state.sessionID) void refreshEarlier()
    setState({ ...emptyConversation(), problem: null })
  }

  async function open(id: string) {
    try {
      const session = await client.session.get({ sessionID: id })
      const list = await client.message.list({ sessionID: id, limit: 200 })
      setState({ ...emptyConversation(), sessionID: id, directory: session.location?.directory ?? null, problem: null, autonomy: (session.metadata as any)?.autonomy === 'ask' ? 'ask' : 'go' })
      setState('turns', await withClaude(id, turnsFromMessages((list as any).data ?? [], session.location?.directory ?? null)))
      void noteCeiling(id)
      const pending = (await client.permission.list({ sessionID: id })) as any[]
      const p = pending[0]
      if (p) setState('approval', { id: p.id, sessionID: id, action: p.action, ...describeApproval(p.action, p.resources ?? [], p.metadata, state.directory), stepID: p.source?.id ?? null })
      void refreshEarlier()
    } catch (e) {
      setState('problem', { text: 'That conversation could not be opened.', detail: String((e as any)?.message ?? e) })
    }
  }

  const onOffline = () => {
    markLost()
    streamAbort?.abort()
  }
  const onOnline = () => streamAbort?.abort()
  window.addEventListener('offline', onOffline)
  window.addEventListener('online', onOnline)
  void loadClaude()
  if (live) void listen()
  else {
    setState('connection', 'open')
    void refreshEarlier()
  }

  return {
    state,
    send,
    sendClaude,
    askClaudeInstead,
    setEngine,
    loadClaude,
    stop,
    answer,
    setAutonomy,
    newConversation,
    open,
    dispose() {
      disposed = true
      streamAbort?.abort()
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    },
  }
}

export type Ola = ReturnType<typeof createOla>
