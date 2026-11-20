// The live conversation: @opencode/client over our own origin (/oc, the front desk's door),
// opencode's event stream folded by conversation.ts into a Solid store. Connection loss is
// shown, retried with backoff, and followed by a resync from opencode's stored history, so the
// drawer never shows a stale "working" after the network comes back.
import { OpenCode } from '@opencode/client'
import { createStore, produce, reconcile } from 'solid-js/store'
import { applyClaudeEvent, applyEvent, contextOf, emptyConversation, mergeResync, questionOf, startClaudeTurn, startTurn, switchOf, turnFromClaudeRun, turnsFromMessages, type ConversationState } from './conversation.ts'
import { describeApproval, handoffWords, precheck, STRETCH_CHECKS, stuckReason, type Stuck } from './steps.ts'
import type { Autonomy, ClaudeInfo, Connection, Engine, Fallback, HostedInfo, Problem, Stretch, StretchReason, Suggestion, Turn } from './types.ts'
import { claude, desk, deskHeaders, fallback, hosted, workspace } from './api.ts'
import { parseCommand } from './commands.ts'

/** How a fallback is named to the person: "the hosted open model" (at its provider), "Claude". */
export const fallbackName = (f: Fallback) => (f === 'claude' ? 'Claude' : 'the hosted open model')
/** Where a request handed to it goes: the provider's name, or Anthropic. */
export const fallbackPlace = (f: Fallback, provider: string | null | undefined) => (f === 'claude' ? 'Anthropic' : provider || 'an outside company')

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
  /** Fallback to a hosted open model for this project (null until known). */
  hosted: HostedInfo | null
  /** "When a request looks like a stretch", and where a handover goes. */
  stretch: Stretch
  stretchTo: Fallback
  /** The signed-in person owns the project (may change the fallbacks, or hand one request over while one is off). */
  owner: boolean
  /** Who the next request goes to: Ola (the default), or a fallback that is switched on. */
  engine: Engine
  /** The stretch card, when Ola suggests handing a request over. */
  suggestion: Suggestion | null
  /** Reasons the person answered "Not now" to in this conversation: not asked again for them. */
  declined: StretchReason[]
  /** One plain sentence about the last thing typed that was not sent (a command refused, "No such command"). */
  said: string | null
  /** /help: the commands, listed in the conversation (never sent to the model). */
  help: boolean
}

/** What the page does after something typed: keep the text in the composer, or show the files. */
export interface Typed {
  keep: boolean
  files?: boolean
}

const QUIET_MS = 60_000
// A deploy restarts the front desk, which ends the event stream; the page opens it again at once and
// it is back within a second or two. Only a stream gone this long is "Lost the connection" (OLA-94).
export const LOST_AFTER_MS = 5_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * `live: false` loads state with plain requests and never opens the event stream: a still
 * picture of the page (?still in the address), for screenshots and printing, where an open
 * stream would keep the page from ever being "loaded".
 */
export function createOla({ baseUrl = new URL('/oc', location.origin).href, live = true }: { baseUrl?: string; live?: boolean } = {}) {
  // The workspace and the CSRF token ride on every request; the front desk checks both.
  const client = OpenCode.make({ baseUrl, headers: deskHeaders() })
  // "Lots of permissions" stays as the person left it in this project (OLA-142: the setting follows
  // the runtime, not the conversation): a new conversation, and the page opened again, start from
  // the last choice. An older conversation still opens on its own.
  const lotsKey = `ola.permissions.${new URLSearchParams(location.search).get('w') ?? ''}`
  const rememberedAutonomy = (): Autonomy => {
    try {
      return localStorage.getItem(lotsKey) === 'ask' ? 'ask' : 'go'
    } catch {
      return 'go'
    }
  }
  const [state, setState] = createStore<OlaState>({ ...emptyConversation(), connection: 'connecting', lostSince: null, autonomy: rememberedAutonomy(), problem: null, earlier: [], claude: null, hosted: null, stretch: 'suggest', stretchTo: 'hosted', owner: false, engine: 'ola', suggestion: null, declined: [], said: null, help: false })
  let disposed = false
  let streamAbort: AbortController | null = null

  const fold = (ev: any) => {
    setState(produce((s) => void applyEvent(s, ev)))
    if (ev?.type === 'session.execution.interrupted') void noteCeiling(ev.data?.sessionID ?? null)
    watchStretch()
    // A hosted run that just ended changed this month's use.
    const t = state.turns[state.turns.length - 1]
    if (t?.engine === 'hosted' && (t.status === 'done' || t.status === 'failed' || t.status === 'stopped') && !counted.has(t.id)) {
      counted.add(t.id)
      void loadFallback()
    }
  }
  const counted = new Set<string>()
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
  let lostTimer: ReturnType<typeof setTimeout> | null = null
  const markLost = () => {
    if (lostTimer) clearTimeout(lostTimer)
    lostTimer = null
    if (state.connection !== 'lost') setState({ connection: 'lost', lostSince: Date.now() })
  }
  /** The stream is gone: lost only if it is not back within LOST_AFTER_MS. */
  const markGone = () => {
    if (!lostTimer && state.connection !== 'lost') lostTimer = setTimeout(markLost, LOST_AFTER_MS)
  }

  async function listen() {
    let backoff = 250
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
            if (lostTimer) clearTimeout(lostTimer)
            lostTimer = null
            setState({ connection: 'open', lostSince: null })
            everOpen = true
            backoff = 250
            if (wasLost) void resync()
            void refreshEarlier()
            continue
          }
          fold(ev)
        }
        throw new Error('the event stream ended')
      } catch {
        if (disposed) return
        markGone()
        // The stream is also cut when the person is taken off the project: if this project is no
        // longer theirs, the page says so now instead of retrying until a reload (first-user pass, B11).
        void desk
          .me()
          .then((m) => !disposed && !m.workspaces.some((w) => w.slug === workspace()) && window.dispatchEvent(new Event('ola:signed-out')))
          .catch(() => {})
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
      if (state.sessionID !== sessionID) return
      const turns = mergeResync(state.turns, await withClaude(sessionID, turnsFromMessages((list as any).data ?? [], state.directory)))
      const last = turns[turns.length - 1]
      // A turn still running has no idle marker yet: keep it working, the stream will finish it.
      setState('turns', reconcile(turns))
      if (last && last.status === 'working') setState('answerMessage', null)
      else void noteCeiling(sessionID)
      const pending = await client.permission.list({ sessionID })
      const p = (pending as any[])[0]
      setState('approval', p ? { id: p.id, sessionID, action: p.action, ...describeApproval(p.action, p.resources ?? [], p.metadata, state.directory), stepID: p.source?.id ?? null } : null)
      await loadQuestion(sessionID)
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

  /** A request. `via` overrides the choice beside the composer for this one request (a slash command). */
  async function send(text: string, via: Engine = state.engine) {
    const request = text.trim()
    if (!request) return
    setState({ suggestion: null, said: null, help: false }) // a new request answers an open card by moving on
    if (state.claude?.enabled && via === 'claude') return sendClaude(request, 'asked')
    if (state.hosted?.enabled && via === 'hosted') return sendHosted(request)
    // Before a run: a few cheap checks on the request alone (steps.ts precheck). The project's
    // files are asked for only when the request seems to name one, and only if a card could follow.
    if ((['big_files', 'many_files', 'long_build', 'design'] as const).some((r) => planFor(r).kind !== 'none')) {
      let files: { path: string; size: number }[] = []
      if (/\.[A-Za-z0-9]{2,8}\b/.test(request) || STRETCH_CHECKS.allOfThem.test(request)) files = await Promise.race([desk.files().catch(() => []), sleep(3000).then(() => [])])
      const reason = precheck(request, files)
      if (reason && stretch(reason, request, null)) return
    }
    return sendOla(request)
  }

  async function sendOla(request: string) {
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
      return fail(e)
    }
    // Taken, but nothing heard of it in 20 s (the project restarted as it arrived): ask the
    // computer what it has, so the request is either shown running or said not to have run.
    setTimeout(() => {
      const t = state.turns[state.turns.length - 1]
      if (!disposed && state.sessionID === sessionID && t?.at === at && t.status === 'sending') void resync()
    }, 20_000)
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

  /** A question Ola is waiting on in this conversation (after a reload or a lost connection). */
  async function loadQuestion(sessionID: string) {
    try {
      const forms = (await client.session.form.list({ sessionID })) as any
      const list: any[] = Array.isArray(forms) ? forms : (forms?.data ?? [])
      if (state.sessionID !== sessionID) return
      setState('question', list.map(questionOf).find(Boolean) ?? null)
    } catch {
      /* the stream brings the next one; the lost banner reports real outages */
    }
  }

  /** The person's answer to Ola's question: one value per field (a choice's value, or their own words). */
  async function answerQuestion(answer: Record<string, string | string[]>) {
    const q = state.question
    if (!q) return false
    try {
      await client.session.form.reply({ sessionID: q.sessionID, formID: q.id, answer } as any)
      if (state.question?.id === q.id) setState('question', null)
      return true
    } catch (e) {
      setState('problem', { text: 'Your answer did not reach Ola’s computer. Try again.', detail: String((e as any)?.message ?? e) })
      return false
    }
  }

  async function setAutonomy(autonomy: Autonomy) {
    setState('autonomy', autonomy)
    try {
      localStorage.setItem(lotsKey, autonomy)
    } catch {
      /* a browser that keeps nothing: the choice lasts for this page */
    }
    if (!state.sessionID) return
    try {
      await client.session.update({ sessionID: state.sessionID, metadata: { autonomy } })
    } catch (e) {
      setState('problem', { text: 'The change did not reach Ola’s computer; it still works as before.', detail: String((e as any)?.message ?? e) })
    }
  }

  // ------------------------------------------------------------ Fallback to Claude

  /** Both fallbacks and the stretch setting (GET /api/fallback). */
  async function loadFallback() {
    try {
      const f = await fallback.info()
      setState({ claude: f.claude, hosted: f.hosted, stretch: f.stretch, stretchTo: f.stretchTo, owner: f.canChange })
      if ((state.engine === 'claude' && !f.claude.enabled) || (state.engine === 'hosted' && !f.hosted.enabled)) setState('engine', 'ola')
    } catch {
      setState({ claude: null, hosted: null })
    }
  }
  const isOn = (f: Fallback) => (f === 'claude' ? !!(state.claude?.enabled && state.claude.configured) : !!(state.hosted?.enabled && state.hosted.configured))
  const isSetUp = (f: Fallback) => (f === 'claude' ? !!state.claude?.configured : !!state.hosted?.configured)
  function setEngine(engine: Engine) {
    setState('engine', engine !== 'ola' && isOn(engine) ? engine : 'ola')
  }

  // ------------------------------------------------------------ "a stretch for Ola's own model"
  //
  // What Ola does when a request looks like a stretch (before a run: precheck; during one:
  // stuckReason). Nothing, when neither fallback is set up on this machine, when the project says
  // "Never suggest", or when the person said "Not now" to this reason in this conversation. A
  // handover, when the project says "Hand it over without asking" and a fallback is on. Else the
  // card: the owner can hand it over (just this once, or always); a member can when a switch is
  // on, and otherwise reads who can turn it on.
  type Plan = { kind: 'none' } | { kind: 'handover'; target: Fallback } | { kind: 'card'; offers: Fallback[]; canAct: boolean }
  function planFor(reason: StretchReason): Plan {
    const setUp = (['hosted', 'claude'] as Fallback[]).filter(isSetUp)
    if (!setUp.length || state.stretch === 'never' || state.declined.includes(reason)) return { kind: 'none' }
    const on = setUp.filter(isOn)
    if (state.stretch === 'handover' && on.length) return { kind: 'handover', target: on.includes(state.stretchTo) ? state.stretchTo : on[0] }
    if (state.owner) return { kind: 'card', offers: setUp, canAct: true }
    if (on.length) return { kind: 'card', offers: on, canAct: true }
    return { kind: 'card', offers: setUp, canAct: false }
  }
  /** Acts on a stretch: a card or a handover. False when nothing is done (the caller goes on with Ola). */
  function stretch(reason: StretchReason, request: string, turnId: string | null): boolean {
    const plan = planFor(reason)
    if (plan.kind === 'none') return false
    if (plan.kind === 'handover') {
      const to = plan.target === 'claude' ? 'Claude' : 'the hosted open model'
      void runOn(plan.target, request, { why: 'stuck', handoff: handoffWords(reason, to), once: false, after: turnId !== null })
      return true
    }
    setState('suggestion', { id: `s${Date.now()}`, request, turnId, reason, offers: plan.offers, target: plan.offers[0], canAct: plan.canAct })
    return true
  }
  /**
   * Hands one request to a fallback: on (its switch), or just this once (the owner, the switch left off).
   * `after`: false only for a stretch seen before Ola ran (precheck): then Ola did not try, so it is
   * not a switch (OLA-157); otherwise the conversation's last turn decides (switchOf).
   */
  function runOn(target: Fallback, request: string, o: { why: 'asked' | 'stuck'; handoff: string | null; once: boolean; after?: boolean }) {
    return target === 'claude' ? sendClaude(request, o.why, o.handoff, o.once, o.after ?? true) : sendHosted(request, o.handoff, o.once, o.after ?? true, o.why)
  }
  /** The card's answers. "Always" comes here after the person confirmed the consent text (when the switch was off). */
  async function answerSuggestion(answer: 'once' | 'always' | 'not_now') {
    const s = state.suggestion
    if (!s) return
    if (answer === 'not_now' || !s.canAct) {
      setState(produce((st) => void ((st.suggestion = null), st.declined.includes(s.reason) || st.declined.push(s.reason))))
      if (s.turnId === null) void sendOla(s.request)
      return
    }
    if (answer === 'always') {
      try {
        if (!isOn(s.target)) await (s.target === 'claude' ? claude.settings({ enabled: true, consent: true }) : hosted.settings({ enabled: true, consent: true }))
        await fallback.settings({ stretch: 'handover', stretchTo: s.target })
        await loadFallback()
      } catch (e) {
        setState('problem', (e as any)?.problem ?? { text: 'The change did not reach Ola’s computer. Nothing was changed.', detail: String(e) })
        return
      }
    }
    setState('suggestion', null)
    void runOn(s.target, s.request, { why: s.turnId ? 'stuck' : 'asked', handoff: null, once: answer === 'once' && !isOn(s.target), after: s.turnId !== null })
  }
  /** The card offers both: show the other one ("or Claude"). */
  function switchSuggestion() {
    const s = state.suggestion
    if (s && s.offers.length > 1) setState('suggestion', 'target', s.offers.find((o) => o !== s.target) ?? s.target)
  }

  /** One request with the hosted open model, in this conversation (the front desk switches the model for that run). */
  async function sendHosted(request: string, handoff: string | null = null, once = false, after = true, why: 'asked' | 'stuck' = 'asked') {
    setState('problem', null)
    const sw = after ? switchOf(state.turns, 'hosted') : null
    const at = Date.now()
    setState(
      produce((s) => {
        const t = startTurn(s, request, at)
        t.engine = 'hosted'
        t.handoff = handoff
      }),
    )
    const update = (f: (t: Turn) => void) =>
      setState(
        produce((s) => {
          const t = s.turns.find((x) => x.engine === 'hosted' && x.at === at)
          if (t) f(t)
        }),
      )
    try {
      const conversation = await ensureSession(request)
      await hosted.run({ request, conversation, once, why, ...(sw?.switchedFrom === 'ola' ? { switchedFrom: 'ola' as const, ...(sw.fromMessage ? { fromMessage: sw.fromMessage } : {}) } : {}) })
    } catch (e) {
      update((t) => Object.assign(t, { status: 'failed', ended: Date.now(), error: (e as any)?.problem ?? { text: 'The hosted open model could not start just now. Nothing was done.', detail: String((e as any)?.message ?? e) } }))
    }
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
  async function sendClaude(request: string, why: 'asked' | 'stuck' | 'always', handoff: string | null = null, once = false, after = true) {
    setState('problem', null)
    const sw = after ? switchOf(state.turns, 'claude') : null
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
      await claude.run({ request, context, conversation, autonomy: state.autonomy, why, ...(once ? { once: true } : {}), ...(sw ?? {}) }, (e) => update((s, t) => void applyClaudeEvent(s, t, e)))
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
    void loadFallback() // this month's use changed
  }
  /** "Ask Claude instead" / "Ask the hosted model instead" on a finished Ola reply: the same request again. */
  function askInstead(turnId: string, target: Fallback) {
    const t = state.turns.find((x) => x.id === turnId)
    if (t && isOn(target)) void runOn(target, t.request, { why: 'asked', handoff: null, once: false })
  }

  // During a run, only what can be seen (stuckReason): the run ended in an error, hit its step or
  // token budget, or made three failed tool calls in a row. Then Ola pauses (on the third failed
  // step it is stopped, keeping what it did so far) and the card is shown, or with "Hand it over
  // without asking" the same request goes to the fallback, marked, with one sentence of why.
  const loadedAt = Date.now()
  const flagged = new Set<string>()
  let stopping: { turn: string; why: Stuck } | null = null
  function watchStretch() {
    const t = state.turns[state.turns.length - 1]
    if (!t || t.engine === 'claude' || t.engine === 'hosted' || flagged.has(t.id) || t.at < loadedAt || state.suggestion) return
    const running = t.status === 'working' || t.status === 'sending'
    const why = stuckReason(t)
    if (running) {
      if (why === 'tools' && !stopping && planFor('tools').kind !== 'none') {
        stopping = { turn: t.id, why }
        void stop()
      }
      return
    }
    const reason = stopping?.turn === t.id ? stopping.why : t.status === 'stopped' ? null : why
    stopping = null
    if (!reason) return
    flagged.add(t.id)
    stretch(reason, t.request, t.id)
  }

  function newConversation() {
    if (state.sessionID) void refreshEarlier()
    setState({ ...emptyConversation(), problem: null, suggestion: null, declined: [], said: null, help: false, autonomy: rememberedAutonomy() })
  }

  // ------------------------------------------------------------ what the person typed: a request or a slash command
  //
  // The README's "Slash commands and reactions (all surfaces)". The command word never reaches a
  // model: only the request after it is sent. /claude and /hosted are the owner's yes for that one
  // request: with the switch off it goes through the one-time grant ("Just this once", audited
  // claude_once / hosted_once) and the switch stays off. A member with the switch off sends
  // nothing and reads who can turn it on; a fallback not set up on this machine says so.
  const busy = () => {
    const t = state.turns[state.turns.length - 1]
    return !!t && (t.status === 'working' || t.status === 'sending')
  }
  const BUSY = 'Ola is still working on your last request. Wait for it to finish, or type /stop.'
  function typed(text: string): Typed {
    const value = text.trim()
    const p = parseCommand(value)
    const say = (sentence: string): Typed => (setState('said', sentence), { keep: true })
    setState('said', null)
    if (p.kind === 'none') {
      if (!value || busy() || state.connection === 'lost') return { keep: true }
      void send(value)
      return { keep: false }
    }
    if (p.kind === 'unknown') return say('No such command. Type / to see the commands.')
    const { name, rest } = p
    if (name === 'help') return setState('help', true), { keep: false }
    if (name === 'files') return { keep: false, files: true }
    if (name === 'stop') {
      if (!busy()) return say('Nothing is running, so there is nothing to stop.')
      void stop()
      return { keep: false }
    }
    if (name === 'new') {
      if (busy()) return say('Wait for this request to finish, or stop it, before starting a new conversation.')
      newConversation()
      return { keep: false }
    }
    if (busy()) return say(BUSY)
    if (state.connection === 'lost') return say('The connection to Ola’s computer is lost. Send this again when it is back.')
    const last = [...state.turns].reverse().find((t) => t.request.trim())
    if (name === 'ola') {
      if (!rest) return say('Type your request after /ola.')
      void send(rest, 'ola')
      return { keep: false }
    }
    // /claude or /hosted. With no text: the previous request again, as "Ask Claude instead".
    const f: Fallback = name
    const request = rest || last?.request || ''
    if (!request) return say(`Type your request after /${name}.`)
    const info = f === 'claude' ? state.claude : state.hosted
    if (!info) return say('Ola’s computer has not said yet whether this is available here. Try again in a moment.')
    if (!info.configured)
      return say(f === 'claude' ? 'Claude Code is not set up on this machine, so this request cannot go to Claude.' : 'The hosted open model is not set up on this machine, so this request cannot go to it.')
    const on = isOn(f)
    if (!on && !state.owner) return say(f === 'claude' ? 'Claude is off for this project. The project’s owner can turn it on in Settings.' : 'The hosted open model is off for this project. The project’s owner can turn it on in Settings.')
    setState({ suggestion: null, help: false })
    void runOn(f, request, { why: 'asked', handoff: null, once: !on })
    return { keep: false }
  }

  async function open(id: string) {
    try {
      const session = await client.session.get({ sessionID: id })
      const list = await client.message.list({ sessionID: id, limit: 200 })
      setState({ ...emptyConversation(), suggestion: null, declined: [], sessionID: id, directory: session.location?.directory ?? null, problem: null, autonomy: (session.metadata as any)?.autonomy === 'ask' ? 'ask' : 'go' })
      setState('turns', await withClaude(id, turnsFromMessages((list as any).data ?? [], session.location?.directory ?? null)))
      void noteCeiling(id)
      const pending = (await client.permission.list({ sessionID: id })) as any[]
      const p = pending[0]
      if (p) setState('approval', { id: p.id, sessionID: id, action: p.action, ...describeApproval(p.action, p.resources ?? [], p.metadata, state.directory), stepID: p.source?.id ?? null })
      await loadQuestion(id)
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
  void loadFallback()
  if (live) void listen()
  else {
    setState('connection', 'open')
    void refreshEarlier()
  }

  return {
    state,
    send,
    typed,
    clearSaid: () => state.said && setState('said', null),
    sendClaude,
    askInstead,
    answerSuggestion,
    switchSuggestion,
    setEngine,
    loadClaude: loadFallback,
    loadFallback,
    stop,
    answer,
    answerQuestion,
    setAutonomy,
    newConversation,
    open,
    dispose() {
      disposed = true
      if (lostTimer) clearTimeout(lostTimer)
      streamAbort?.abort()
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    },
  }
}

export type Ola = ReturnType<typeof createOla>
