'use client'

// Studio — one track: chat with Jambot, hear it, tweak it, keep it.
//
// Everything runs in the browser: the Jambot session, the tools, the agent
// loop, and rendering (OfflineAudioContext). The server signs one Messages
// API call at a time (/api/jam/llm) and stores the track (/api/jam/tracks).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadJambot, JAMBOT_BUILD,
  type JambotModule, type JamSession, type AgentMessage, type ToolDef,
  type RenderResult, type LlmRequest, type LlmResponse, type SessionDescription,
} from './jambot'
import { api, NotSignedIn, publicTrackUrl, type Track, type FeedItem, type Strip } from './api'
import { LoopPlayer, loopSecondsFor } from './audio'
import { encodeMp3, wavBlob, deliver, trackFilename, type ExportFormat } from './export'
import { buildControlGroups, type ControlGroup } from './controls'
import ControlsSheet from './ControlsSheet'
import LedStrip from './LedStrip'
import { sameScope, type RenderScope } from './seq/model'
import { sanitizeHistory } from './history'

const SONG: RenderScope = { kind: 'song' }

const SUGGESTIONS = [
  'techno at 128 with a 909 kick and offbeat hats',
  'dub techno: soft kick, chord stabs into a long delay',
  'add a deep sub bassline',
  'make the kick punchier and add swing',
]

let idCounter = 0
const nid = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`

/** The transport strip, read live from the session description. */
function stripFromDesc(desc: SessionDescription | null): Strip | null {
  if (!desc) return null
  for (const id of ['jt90', 'jb01']) {
    const inst = desc.instruments.find((i) => i.id === id && i.active)
    const p = inst?.pattern as Record<string, ({ velocity?: number } | null)[]> | undefined
    if (!p) continue
    const row = (voices: string[]) => Array.from({ length: 16 }, (_, i) => (voices.some((v) => (p[v]?.[i]?.velocity ?? 0) > 0) ? '1' : '0')).join('')
    return { k: row(['kick']), s: row(['snare', 'clap', 'rimshot']), h: row(['ch', 'oh', 'ride', 'crash', 'cymbal']) }
  }
  // No drums: the first mono synth's gates on the middle row.
  for (const id of ['jb202', 'jt30', 'jt10']) {
    const inst = desc.instruments.find((i) => i.id === id && i.active)
    const p = inst?.pattern as ({ gate?: boolean } | null)[] | undefined
    if (!Array.isArray(p)) continue
    const s = Array.from({ length: 16 }, (_, i) => (p[i]?.gate ? '1' : '0')).join('')
    if (s.includes('1')) return { k: '0'.repeat(16), s, h: '0'.repeat(16) }
  }
  return null
}

/**
 * Song mode: arrangement renders use the params captured inside each saved
 * pattern, so a live `tweak` has to reach every saved pattern of that
 * instrument too. This writes the live node's new engine value straight into
 * the saved copies — the same value `save_pattern` would capture — without
 * the old load_pattern → tweak → save_pattern round-trip, which replaced the
 * live pattern, params, automation and inserts with each saved copy and so
 * wiped anything programmed since the last save. Nothing on the live node,
 * the automation, the inserts or `currentPattern` is touched here, which is
 * also why it is safe to run while the agent is mid-turn.
 *
 * Returns how many saved patterns were updated. Mirrored (kept in step by
 * hand) in ../vibeceo/jambot/tests/test-web-writethrough.js.
 */
function writeThroughSavedPatterns(session: JamSession, path: string): number {
  const [inst, ...rest] = path.split('.')
  if (!Array.isArray(session.arrangement) || session.arrangement.length === 0) return 0
  if (inst === 'fx' || rest.length === 0) return 0
  if (rest.length === 1 && rest[0] === 'level') return 0 // node output level lives outside patterns
  const saved = session.patterns?.[inst] as Record<string, { params?: Record<string, unknown> } | null> | undefined
  if (!saved) return 0
  const acc = session.instrument?.(inst)
  if (!acc || acc.kind === 'sampler' || acc.kind === 'modular') return 0

  let voice: string | null = null
  let key: string
  if (acc.kind === 'drums') {
    // 'jt90.kick.decay' → params.kick.decay
    ;[voice] = rest
    key = rest.slice(1).join('.')
    if (!key) return 0
  } else {
    // Mono synths store flat params without the node's voice prefix:
    // 'jb202.bass.filterCutoff' → params.filterCutoff. Pick the live key the
    // control path ends with.
    const sub = rest.join('.')
    const live = Object.keys(acc.params || {})
    const match = live.filter((k) => sub === k || sub.endsWith(`.${k}`)).sort((a, b) => b.length - a.length)[0]
    if (!match) return 0
    key = match
  }
  const value = voice ? acc.params?.[voice]?.[key] : acc.params?.[key]
  if (value === undefined) return 0

  let n = 0
  for (const entry of Object.values(saved)) {
    if (!entry || typeof entry !== 'object') continue
    const params = (entry.params ||= {})
    if (voice) {
      const vp = (params[voice] ||= {}) as Record<string, unknown>
      vp[key] = value
    } else {
      params[key] = value
    }
    n++
  }
  return n
}

/**
 * Song mode, effect faders: 'fx.<key>.<effectId>.<param>' where key is an
 * instrument id or '<instrument>.<voice>'. The live chain is what renders (in
 * every section), but save_pattern snapshots the instrument's inserts into the
 * pattern (channelInserts) and load_pattern restores that snapshot — so the
 * live effect's new params are copied onto the same effect inside every saved
 * pattern of that instrument, or the agent's next load_pattern would put the
 * fader back where it was at save time. Effects not present in a snapshot are
 * left alone. Returns how many saved patterns were updated. Mirrored in
 * ../vibeceo/jambot/tests/test-web-writethrough.js and scripts/jam/controls-sweep.mjs.
 */
function writeThroughSavedInserts(session: JamSession, path: string): number {
  const segs = path.split('.')
  if (segs[0] !== 'fx' || segs.length < 4) return 0
  if (!Array.isArray(session.arrangement) || session.arrangement.length === 0) return 0
  const effectId = segs[segs.length - 2]
  const key = segs.slice(1, -2).join('.')
  const inst = key.split('.')[0]
  if (inst === 'master') return 0
  type LiveEffect = { id: string; _node?: { getParams(): Record<string, unknown> } }
  const live = (session.mixer?.effectChains?.[key] as LiveEffect[] | undefined)?.find((e) => e.id === effectId)
  if (!live?._node) return 0
  const params = { ...live._node.getParams() }
  type SavedEffect = { id: string; type: string; params?: Record<string, unknown> }
  const saved = session.patterns?.[inst] as Record<string, { channelInserts?: Record<string, SavedEffect[]> | null } | null> | undefined
  if (!saved) return 0
  let n = 0
  for (const entry of Object.values(saved)) {
    const snap = entry?.channelInserts
    if (!snap || typeof snap !== 'object') continue
    const e = snap[key]?.find((x) => x.id === effectId)
    if (!e) continue
    e.params = params
    n++
  }
  return n
}

/** Release the audio hardware. */
function closePlayer(p: LoopPlayer) {
  p.close()
}

type Props = {
  track: Track
  onBack: () => void
  onAuthLost: () => void
}

export default function Studio({ track, onBack, onAuthLost }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [feed, setFeed] = useState<FeedItem[]>(track.feed || [])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [hasBuffer, setHasBuffer] = useState(false)
  const [loopBars, setLoopBars] = useState<number | null>(null)
  const [rendering, setRendering] = useState(false)
  const [desc, setDesc] = useState<SessionDescription | null>(null)
  const [groups, setGroups] = useState<ControlGroup[]>([])
  const [controlsOpen, setControlsOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [exporting, setExporting] = useState<{ format: ExportFormat; progress: number } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState(track.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [pub, setPub] = useState<{ published: boolean; slug: string | null }>({ published: !!track.published_at, slug: track.slug ?? null })
  const [pubBusy, setPubBusy] = useState(false)
  // What the next render covers (whole arrangement, or one section while the
  // sequencer auditions it) and what the buffer now playing actually covers.
  const [renderScope, setRenderScopeState] = useState<RenderScope>(SONG)
  const [playedScope, setPlayedScope] = useState<RenderScope>(SONG)

  const jamRef = useRef<JambotModule | null>(null)
  const renderScopeRef = useRef<RenderScope>(SONG)
  const seqEditsRef = useRef<Map<string, { edits: string[]; dropped: number }>>(new Map())
  const toolsRef = useRef<ToolDef[]>([])
  const sessionRef = useRef<JamSession>(null)
  const messagesRef = useRef<AgentMessage[]>(track.messages || [])
  const feedRef = useRef<FeedItem[]>(track.feed || [])
  const titleRef = useRef(track.title)
  const playerRef = useRef<LoopPlayer | null>(null)
  const lastRenderRef = useRef<RenderResult | null>(null)
  const controlNotesRef = useRef<Map<string, string>>(new Map())
  const renderTimerRef = useRef<number | null>(null)
  const renderSeqRef = useRef(0)
  const saveTimerRef = useRef<number | null>(null)
  const dirtyRef = useRef(false)
  const busyRef = useRef(false)
  // Save ordering: one PUT in flight at a time, at most one queued behind it.
  const saveInFlightRef = useRef<Promise<void> | null>(null)
  const saveQueuedRef = useRef<Promise<void> | null>(null)
  const saveSeqRef = useRef(0)
  const pendingToolIdsRef = useRef<string[]>([])
  const feedEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // ---- feed helpers --------------------------------------------------------

  const setFeedBoth = useCallback((updater: (f: FeedItem[]) => FeedItem[]) => {
    feedRef.current = updater(feedRef.current)
    setFeed(feedRef.current)
  }, [])
  const addItem = useCallback((item: FeedItem) => setFeedBoth((f) => [...f, item]), [setFeedBoth])
  const note = useCallback((text: string, error = false) => addItem({ id: nid(), kind: 'note', text, error }), [addItem])

  // ---- persistence ---------------------------------------------------------

  /**
   * Save the track as it is right now. Saves are strictly serial: a PUT that
   * starts later also lands later, so a slow older body can never overwrite
   * a newer one in the database. While one save is in flight, a second call
   * queues exactly one follow-up (it snapshots the latest state when it
   * starts); further calls share that follow-up. Resolves when this call's
   * state is on the server (or the attempt has failed and marked dirty).
   */
  const saveNow = useCallback((): Promise<void> => {
    if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null }

    const runSave = async (): Promise<void> => {
      const jam = jamRef.current
      const session = sessionRef.current
      if (!jam || !session) return
      const seq = ++saveSeqRef.current
      dirtyRef.current = false
      setSaveState('saving')
      // Snapshot now: the body must not change while the request is on the wire.
      const body = {
        title: titleRef.current,
        bpm: session.bpm,
        bars: lastRenderRef.current?.bars ?? session.bars ?? 2,
        session: jam.serializeSession(session),
        // Never persist a half tool round (the sanitizer drops a trailing
        // unanswered tool_use), so a reload always resumes a valid history.
        messages: sanitizeHistory(messagesRef.current),
        feed: feedRef.current.slice(-200),
      }
      try {
        await api.saveTrack(track.id, body)
        if (seq === saveSeqRef.current) setSaveState('saved')
      } catch (e) {
        if (e instanceof NotSignedIn) { onAuthLost(); return }
        console.warn('[jam] save failed', e)
        if (seq === saveSeqRef.current) setSaveState('failed')
        dirtyRef.current = true
      }
    }

    const start = (): Promise<void> => {
      const p: Promise<void> = runSave().finally(() => { if (saveInFlightRef.current === p) saveInFlightRef.current = null })
      saveInFlightRef.current = p
      return p
    }

    if (saveInFlightRef.current) {
      if (!saveQueuedRef.current) {
        saveQueuedRef.current = saveInFlightRef.current.then(() => { saveQueuedRef.current = null; return start() })
      }
      return saveQueuedRef.current
    }
    return start()
  }, [track.id, onAuthLost])

  /** Wait until everything dirty or in flight is on the server. */
  const settleSaves = useCallback(async () => {
    if (dirtyRef.current || saveTimerRef.current) await saveNow()
    else await (saveQueuedRef.current ?? saveInFlightRef.current ?? Promise.resolve())
  }, [saveNow])

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => { saveTimerRef.current = null; void saveNow() }, 800)
  }, [saveNow])

  const refreshDesc = useCallback(() => {
    const jam = jamRef.current
    if (!jam || !sessionRef.current) return
    try {
      const d = jam.describeSession(sessionRef.current)
      setDesc(d)
      setGroups(buildControlGroups(d))
    } catch (e) {
      console.warn('[jam] describe failed', e)
    }
  }, [])

  // ---- audio ---------------------------------------------------------------

  const player = () => {
    if (!playerRef.current) {
      const p = new LoopPlayer()
      p.onState = setPlaying
      playerRef.current = p
    }
    return playerRef.current
  }

  const applyRender = useCallback((r: RenderResult, autoplay: boolean, scope: RenderScope = SONG) => {
    lastRenderRef.current = r
    const renderedBars = Math.min(128, Math.max(1, Math.round(r.bars)))
    if (sessionRef.current && !r.hasArrangement && sessionRef.current.bars !== renderedBars) {
      sessionRef.current.bars = renderedBars
      refreshDesc()
    }
    const p = player()
    p.setBuffer(r.buffer, loopSecondsFor(r.bars, r.bpm))
    setLoopBars(r.bars)
    setPlayedScope(scope)
    setHasBuffer(true)
    if (autoplay && !p.playing) p.play()
  }, [refreshDesc])

  const renderNow = useCallback(async (autoplay: boolean) => {
    const jam = jamRef.current
    const session = sessionRef.current
    if (!jam || !session) return
    const seq = ++renderSeqRef.current
    setRendering(true)
    try {
      let scope = renderScopeRef.current
      const arrangement: { bars: number }[] = Array.isArray(session.arrangement) ? session.arrangement : []
      if (scope.kind === 'section' && !arrangement[scope.index]) {
        // The arrangement changed under us (agent cleared or shortened it).
        scope = SONG
        renderScopeRef.current = SONG
        setRenderScopeState(SONG)
      }
      let r: RenderResult
      if (scope.kind === 'section') {
        // Audition one section from its saved patterns: render a view of the
        // session whose arrangement is just that section. The view inherits
        // everything else (nodes, clock, patterns, mixer) from the real
        // session and nothing is mutated, so a describeSession() or an edit
        // landing mid-render still sees the whole arrangement.
        const view = Object.create(session)
        view.arrangement = [arrangement[scope.index]]
        r = await jam.renderSessionToBuffer(view, arrangement[scope.index].bars)
      } else {
        // Loop mode: at least the longest programmed pattern, capped at 128 (same rule as the agent's render tool).
        const loopBarsWanted = jam.resolveRenderBars(session).bars
        r = await jam.renderSessionToBuffer(session, loopBarsWanted)
      }
      if (seq !== renderSeqRef.current) return
      applyRender({ ...r, bpm: session.bpm }, autoplay, scope)
    } catch (e) {
      note(`Render failed: ${(e as Error).message}`, true)
    } finally {
      if (seq === renderSeqRef.current) setRendering(false)
    }
  }, [applyRender, note])

  const scheduleRender = useCallback((delay = 220) => {
    if (renderTimerRef.current) window.clearTimeout(renderTimerRef.current)
    renderTimerRef.current = window.setTimeout(() => { renderTimerRef.current = null; void renderNow(false) }, delay)
  }, [renderNow])

  /** Sequencer audition: loop one section or the whole song. Re-renders on change. */
  const setRenderScope = useCallback((scope: RenderScope) => {
    if (sameScope(renderScopeRef.current, scope)) return
    renderScopeRef.current = scope
    setRenderScopeState(scope)
    if (!sessionRef.current) return
    const inSong = Array.isArray(sessionRef.current.arrangement) && sessionRef.current.arrangement.length > 0
    if (scope.kind === 'section' || inSong) scheduleRender(150)
  }, [scheduleRender])

  useEffect(() => {
    if (!playing) { setPos(0); return }
    let raf = 0
    const tick = () => { setPos(playerRef.current?.position() ?? 0); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // ---- boot ----------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    const renderSeq = renderSeqRef
    ;(async () => {
      try {
        const jam = await loadJambot()
        const tools = await jam.ready()
        if (cancelled) return
        jamRef.current = jam
        toolsRef.current = tools
        // A stored history can end in an unanswered tool_use (a cut-off turn,
        // or an autosave that caught a half round); repair it before it is
        // ever sent, or every later message 400s and the track is dead.
        messagesRef.current = sanitizeHistory(track.messages || [])
        if (track.session) {
          try { sessionRef.current = jam.deserializeSession(track.session) }
          catch (e) { console.warn('[jam] could not restore session, starting fresh', e); sessionRef.current = jam.createSession({ bpm: track.bpm || 128 }) }
        } else {
          sessionRef.current = jam.createSession({ bpm: track.bpm || 128 })
        }
        refreshDesc()
        setStatus('ready')
        if (process.env.NODE_ENV !== 'production') {
          // Dev hook for browser tests: the live session and the pending agent notes.
          const w = window as unknown as { __jamSession?: unknown; __jamNotes?: Map<string, string> }
          w.__jamSession = sessionRef.current
          w.__jamNotes = controlNotesRef.current
        }
        const d = jam.describeSession(sessionRef.current)
        if (d.instruments.some((i) => i.active)) void renderNow(false)
      } catch (e) {
        if (cancelled) return
        setLoadError((e as Error).message)
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      // Leaving the track: silence and release the audio hardware, drop the
      // last render (a long song is tens of MB) and any pending render. The
      // session stays only while an agent turn is still finishing — its
      // final save needs it.
      if (renderTimerRef.current) { window.clearTimeout(renderTimerRef.current); renderTimerRef.current = null }
      renderSeq.current++ // a render that lands after this is ignored (renderNow checks the seq)
      if (playerRef.current) { closePlayer(playerRef.current); playerRef.current = null }
      lastRenderRef.current = null
      if (!busyRef.current) sessionRef.current = null
      if (process.env.NODE_ENV !== 'production') {
        const w = window as unknown as { __jamSession?: unknown; __jamNotes?: unknown }
        delete w.__jamSession
        delete w.__jamNotes
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id])

  useEffect(() => { feedEndRef.current?.scrollIntoView({ block: 'end' }) }, [feed, busy])

  useEffect(() => {
    const flush = () => { if (dirtyRef.current) void saveNow() }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [saveNow])

  // ---- LLM proxy -----------------------------------------------------------

  const llm = useCallback(async (req: LlmRequest): Promise<LlmResponse> => {
    const res = await fetch('/api/jam/llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system: req.system, messages: req.messages, tools: req.tools, max_tokens: req.max_tokens }),
      signal: req.signal,
      credentials: 'same-origin',
    })
    if (res.status === 401) throw new NotSignedIn()
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      throw new Error(j.error || `LLM error ${res.status}`)
    }
    return res.json()
  }, [])

  // ---- send ----------------------------------------------------------------

  const send = useCallback(async (raw: string) => {
    const text = raw.trim()
    const jam = jamRef.current
    const session = sessionRef.current
    if (!text || busy || !jam || !session) return
    player().unlock()

    const notes = Array.from(controlNotesRef.current.values())
    controlNotesRef.current.clear()
    seqEditsRef.current.clear()
    const task = notes.length ? `${text}\n\n[controls] ${notes.join('; ')}` : text

    addItem({ id: nid(), kind: 'user', text })
    if (titleRef.current === 'Untitled') {
      let t = text.replace(/\s+/g, ' ').split(/[.!?:;]\s/)[0].trim()
      if (t.length > 40) t = t.slice(0, 40).replace(/\s+\S*$/, '')
      t = t.replace(/[\s,.:;!?-]+$/, '') || 'Untitled'
      titleRef.current = t
      setTitle(t)
    }
    setInput('')
    setBusy(true)
    busyRef.current = true
    setSaveOpen(false)
    pendingToolIdsRef.current = []

    // runAgent appends to this array in place, so keep the sanitized copy as
    // the live history.
    const history = sanitizeHistory(messagesRef.current)
    messagesRef.current = history

    try {
      await jam.runAgent({
        task, session, messages: history, llm,
        executeTool: jam.executeTool,
        tools: toolsRef.current,
        systemPrompt: jam.JAMBOT_PROMPT + jam.WEB_PROMPT_ADDENDUM,
        buildStateContext: jam.buildSessionContext,
        buildGenreContext: (t) => jam.buildGenreContext(jam.detectGenres(t)),
        callbacks: {
          onResponse: (t) => addItem({ id: nid(), kind: 'assistant', text: t }),
          onTool: (name, inp) => { const id = nid(); pendingToolIdsRef.current.push(id); addItem({ id, kind: 'tool', name, input: inp }) },
          onToolResult: (result, name, isError) => {
            const id = pendingToolIdsRef.current.shift()
            setFeedBoth((f) => f.map((it) => (it.id === id && it.kind === 'tool' ? { ...it, result, isError } : it)))
            if (name !== 'render') refreshDesc()
          },
          onAfterTool: () => refreshDesc(),
        },
        context: { onRender: (r: RenderResult) => applyRender(r, true) },
      })
    } catch (e) {
      if (e instanceof NotSignedIn) { onAuthLost(); return }
      note((e as Error).message || 'Something went wrong.', true)
    } finally {
      setBusy(false)
      busyRef.current = false
      refreshDesc()
      void saveNow()
    }
  }, [busy, llm, addItem, setFeedBoth, refreshDesc, applyRender, note, saveNow, onAuthLost])

  // ---- controls ------------------------------------------------------------

  const onParam = useCallback(async (path: string, value: number | string, label: string) => {
    const jam = jamRef.current
    const session = sessionRef.current
    if (!jam || !session) return
    try {
      const r = await jam.executeTool('tweak', { path, value }, session, {})
      if (/^Error/.test(r)) { note(r, true); return }
      // Song mode: the arrangement plays the saved patterns' own params and
      // inserts, so the new value goes into every saved pattern too (live
      // node untouched).
      if (path.startsWith('fx.')) writeThroughSavedInserts(session, path)
      else writeThroughSavedPatterns(session, path)
      controlNotesRef.current.set(path, `${label} → ${path} = ${value}`)
      refreshDesc()
      scheduleRender()
      scheduleSave()
    } catch (e) {
      note((e as Error).message, true)
    }
  }, [note, refreshDesc, scheduleRender, scheduleSave])

  const onTrack = useCallback(async (k: 'bpm' | 'swing' | 'bars', value: number) => {
    const jam = jamRef.current
    const session = sessionRef.current
    if (!jam || !session) return
    if (k === 'bpm') session.bpm = value
    else if (k === 'bars') session.bars = value
    else await jam.executeTool('set_swing', { amount: value }, session, {})
    controlNotesRef.current.set(k, `${k} = ${value}`)
    refreshDesc()
    scheduleRender()
    scheduleSave()
  }, [refreshDesc, scheduleRender, scheduleSave])

  /**
   * A sequencer edit already landed in the session. Fold it into one agent
   * note per instrument+pattern (last 8 edits), then refresh, re-render, save.
   */
  const onSeqEdit = useCallback((key: string, head: string, edit: string) => {
    const entry = seqEditsRef.current.get(key) || { edits: [], dropped: 0 }
    entry.edits.push(edit)
    while (entry.edits.length > 8) { entry.edits.shift(); entry.dropped++ }
    seqEditsRef.current.set(key, entry)
    controlNotesRef.current.set(key, `${head}: ${entry.dropped ? '…, ' : ''}${entry.edits.join(', ')}`)
    refreshDesc()
    scheduleRender(300)
    scheduleSave()
  }, [refreshDesc, scheduleRender, scheduleSave])

  const getSession = useCallback(() => sessionRef.current, [])

  const commitTitle = (t: string) => {
    const clean = t.trim().slice(0, 80) || 'Untitled'
    titleRef.current = clean
    setTitle(clean)
    setEditingTitle(false)
    scheduleSave()
  }

  const back = async () => {
    playerRef.current?.stop()
    await settleSaves()
    onBack()
  }

  const doExport = useCallback(async (format: ExportFormat) => {
    const jam = jamRef.current
    const r = lastRenderRef.current
    if (!jam || !r) { note('Nothing rendered yet.'); return }
    setSaveOpen(false)
    setExporting({ format, progress: 0 })
    try {
      const blob = format === 'mp3' ? await encodeMp3(r.buffer, (p) => setExporting({ format, progress: p })) : wavBlob(r.buffer, jam.audioBufferToWav)
      const how = await deliver(blob, trackFilename(r.bpm, format))
      note(how === 'shared' ? `${format.toUpperCase()} ready.` : `${format.toUpperCase()} downloaded.`)
    } catch (e) {
      note(`Export failed: ${(e as Error).message}`, true)
    } finally {
      setExporting(null)
    }
  }, [note])

  // ---- publish / share -----------------------------------------------------

  const publish = async () => {
    if (pubBusy) return
    setPubBusy(true)
    try {
      await settleSaves()
      const { track: t } = pub.published ? await api.unpublish(track.id) : await api.publish(track.id)
      setPub({ published: !!t.published_at, slug: t.slug ?? null })
      if (t.published_at) note(`Published. Anyone can play and remix it at ${publicTrackUrl(t.slug || '')}`)
      else note('Unpublished. The link is off; publishing again restores it.')
    } catch (e) {
      if (e instanceof NotSignedIn) { onAuthLost(); return }
      note((e as Error).message, true)
    } finally {
      setPubBusy(false)
    }
  }

  const share = async () => {
    if (!pub.slug) return
    const url = publicTrackUrl(pub.slug)
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    try {
      if (nav.share) { await nav.share({ title: titleRef.current, url }); return }
      await navigator.clipboard.writeText(url)
      note(`Link copied: ${url}`)
    } catch {
      note(url)
    }
  }

  const toggleExpanded = (id: string) => {
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  // ---- render --------------------------------------------------------------

  const bpm = desc?.bpm ?? track.bpm ?? 128
  const bars = desc?.bars ?? track.bars ?? 2
  const swing = desc?.swing ?? 0
  const inSong = !!desc && desc.arrangement.length > 0
  const shownBars = loopBars ?? bars
  const barNow = Math.min(shownBars, Math.floor(pos * shownBars) + 1)
  const playStep16 = playing ? Math.floor(pos * shownBars * 16) : null
  const step = playStep16 === null ? null : playStep16 % 16
  const sectionNow = playedScope.kind === 'section' ? playedScope.index + 1 : null
  const strip = stripFromDesc(desc)
  const ready = status === 'ready'
  const canSend = ready && !busy && input.trim().length > 0

  return (
    <div className="jb-screen jb-screen--fixed">
      {/* header: nav row (back · actions) over the title block, all on the chat's 16px margin */}
      <header className="jb-studio-head">
        <div className="jb-nav">
          <button onClick={back} className="jb-back" aria-label="Back to tracks"><span className="chev">‹</span>Tracks</button>
          <div className="flex shrink-0 gap-1.5">
            {pub.published && <button onClick={share} className="jb-key jb-key--panel jb-key--xs" aria-label="Share link">Share</button>}
            <button
              onClick={publish}
              disabled={pubBusy || !ready || (!pub.published && !hasBuffer)}
              className={`jb-key jb-key--xs ${pub.published ? 'jb-key--ghost' : ''}`}
              style={pub.published ? undefined : { background: 'var(--green)', color: '#fff', boxShadow: '0 2px 0 #0a6a49' }}
              title={pub.published ? 'Take it off the catalog' : 'Put it on the catalog so anyone can play and remix it'}
            >
              {pubBusy ? '…' : pub.published ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        </div>
        <div className="jb-title-block">
          {editingTitle ? (
            <input
              autoFocus
              defaultValue={title}
              onBlur={(e) => commitTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitTitle((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingTitle(false) }}
              className="jb-field"
              style={{ padding: '4px 8px', fontFamily: 'var(--font-panel-stack)', textTransform: 'uppercase', fontWeight: 600, fontSize: 22 }}
            />
          ) : (
            <button onClick={() => setEditingTitle(true)} className="jb-track-name jb-track-name--studio block w-full text-left" style={{ background: 'none', border: 0, padding: 0 }} title="Rename">
              {title}
            </button>
          )}
          <div className="jb-readout mt-1">
            <b>{Math.round(bpm)}</b> BPM · {shownBars} {shownBars === 1 ? 'bar' : 'bars'}{inSong ? (sectionNow ? ` · section ${sectionNow}` : ' · song') : ''}{swing ? ` · swing ${swing}` : ''}
            {saveState === 'saving' && <span className="jb-muted"> · saving</span>}
            {saveState === 'failed' && <span className="lit"> · not saved</span>}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4">
        {status === 'loading' && <p className="jb-note mt-16 text-center">Loading the groovebox…</p>}
        {status === 'error' && (
          <div className="jb-card mt-16 p-4 text-sm">
            <p className="font-semibold">Couldn&apos;t load Jambot.</p>
            <p className="jb-muted mt-1">{loadError}</p>
          </div>
        )}

        {ready && feed.length === 0 && (
          <div className="mt-10">
            <p className="jb-eyebrow text-center">Say it like you&apos;d say it to a producer</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus() }} className="jb-key jb-key--panel jb-key--sm" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-body-stack)', fontWeight: 500 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-col gap-2.5">
          {feed.map((it) => {
            if (it.kind === 'user') return <div key={it.id} className="jb-bubble">{it.text}</div>
            if (it.kind === 'assistant') return <div key={it.id} className="jb-answer">{it.text}</div>
            if (it.kind === 'note') return <div key={it.id} className={`jb-note${it.error ? ' err' : ''}`}>{it.text}</div>
            const open = expanded.has(it.id)
            const pending = it.result === undefined
            return (
              <div key={it.id} className="mr-6">
                <button onClick={() => toggleExpanded(it.id)} className={`jb-chip${it.isError ? ' err' : ''}`}>
                  <span className={`jb-led ${pending ? '' : it.isError ? 'on' : 'green'}`} />
                  <span className="truncate">{it.name}</span>
                </button>
                {open && <pre className="jb-chip-out">{JSON.stringify(it.input)}{it.result ? `\n→ ${it.result}` : ''}</pre>}
              </div>
            )
          })}
          {busy && <div className="jb-thinking jb-note"><span className="jb-led on" />working</div>}
        </div>
        <div ref={feedEndRef} />
      </main>

      {/* transport */}
      <div className="jb-transport">
        <LedStrip strip={strip} step={step} />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => player().toggle()}
            disabled={!hasBuffer}
            aria-label={playing ? 'Stop' : 'Play'}
            className="jb-key jb-key--square"
          >
            {playing ? <StopIcon /> : <PlayIcon />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`jb-led ${playing ? 'on' : rendering ? 'green' : ''}`} />
              <span className="jb-readout">
                {rendering ? 'rendering' : hasBuffer ? (playing ? <>{sectionNow ? <>section <b>{sectionNow}</b> · </> : null}bar <b>{barNow}</b>/{shownBars}</> : sectionNow ? <>section <b>{sectionNow}</b> · ready</> : 'ready') : 'no sound yet'}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--rule)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.round(pos * 100)}%`, background: 'var(--ink)' }} />
            </div>
          </div>
          <button onClick={() => setControlsOpen(true)} disabled={!ready} className="jb-key jb-key--sm">Controls</button>
          <button onClick={() => setSaveOpen((s) => !s)} disabled={!hasBuffer || !!exporting} className="jb-key jb-key--panel jb-key--sm">
            {exporting ? `${Math.round(exporting.progress * 100)}%` : 'Bounce'}
          </button>
        </div>
        {saveOpen && (
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => doExport('mp3')} className="jb-key jb-key--orange jb-key--sm">MP3</button>
            <button onClick={() => doExport('wav')} className="jb-key jb-key--ghost jb-key--sm">WAV</button>
          </div>
        )}
      </div>

      {/* composer */}
      <form className="jb-composer" onSubmit={(e) => { e.preventDefault(); void send(input) }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }}
          rows={1}
          placeholder={ready ? 'tell it what to play…' : 'loading…'}
          disabled={!ready}
          className="jb-field"
          style={{ fieldSizing: 'content' } as React.CSSProperties}
        />
        <button type="submit" disabled={!canSend} className="jb-key jb-key--orange" style={{ height: 48 }}>Send</button>
      </form>

      <ControlsSheet
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        bpm={bpm}
        swing={swing}
        bars={bars}
        groups={groups}
        desc={desc}
        rendering={rendering}
        loopBars={loopBars}
        onTrack={onTrack}
        onParam={onParam}
        getSession={getSession}
        playStep16={playStep16}
        playScope={playedScope}
        onScope={setRenderScope}
        onSeqEdit={onSeqEdit}
      />

      <div className="hidden" data-jambot-build={JAMBOT_BUILD} data-render-scope={renderScope.kind === 'section' ? `section-${renderScope.index}` : 'song'} />
    </div>
  )
}

function PlayIcon() {
  return <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden><path d="M6 3.5v13l11-6.5z" fill="currentColor" /></svg>
}
function StopIcon() {
  return <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden><rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor" /></svg>
}
