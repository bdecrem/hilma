// The live conversation: @opencode/client over our own origin (/oc, the front desk's door),
// opencode's event stream folded by conversation.ts into a Solid store. Connection loss is
// shown, retried with backoff, and followed by a resync from opencode's stored history, so the
// drawer never shows a stale "working" after the network comes back.
import { OpenCode } from '@opencode/client'
import { createStore, produce, reconcile } from 'solid-js/store'
import { applyEvent, emptyConversation, startTurn, turnsFromMessages, type ConversationState } from './conversation.ts'
import { describeApproval } from './steps.ts'
import type { Autonomy, Connection, Problem } from './types.ts'

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
}

const QUIET_MS = 60_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * `live: false` loads state with plain requests and never opens the event stream: a still
 * picture of the page (?still in the address), for screenshots and printing, where an open
 * stream would keep the page from ever being "loaded".
 */
export function createOla({ baseUrl = new URL('/oc', location.origin).href, live = true }: { baseUrl?: string; live?: boolean } = {}) {
  const client = OpenCode.make({ baseUrl })
  const [state, setState] = createStore<OlaState>({ ...emptyConversation(), connection: 'connecting', lostSince: null, autonomy: 'go', problem: null, earlier: [] })
  let disposed = false
  let streamAbort: AbortController | null = null

  const fold = (ev: any) => setState(produce((s) => void applyEvent(s, ev)))
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
      const turns = turnsFromMessages((list as any).data ?? [], state.directory)
      const last = turns[turns.length - 1]
      // A turn still running has no idle marker yet: keep it working, the stream will finish it.
      setState('turns', reconcile(turns))
      if (last && last.status === 'working') setState('answerMessage', null)
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

  function newConversation() {
    if (state.sessionID) void refreshEarlier()
    setState({ ...emptyConversation(), problem: null })
  }

  async function open(id: string) {
    try {
      const session = await client.session.get({ sessionID: id })
      const list = await client.message.list({ sessionID: id, limit: 200 })
      setState({ ...emptyConversation(), sessionID: id, directory: session.location?.directory ?? null, problem: null, autonomy: (session.metadata as any)?.autonomy === 'ask' ? 'ask' : 'go' })
      setState('turns', turnsFromMessages((list as any).data ?? [], session.location?.directory ?? null))
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
  if (live) void listen()
  else {
    setState('connection', 'open')
    void refreshEarlier()
  }

  return {
    state,
    send,
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
