'use client'

// Studio — one track: chat with Jambot, hear it, tweak it, keep it.
//
// Everything runs in the browser: the Jambot session, the tools, the agent
// loop, and rendering (OfflineAudioContext). The server signs one Messages
// API call at a time (/api/jam/llm) and stores the track (/api/jam/tracks).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { sameScope, hitsAt, type RenderScope, type Hits } from './seq/model'
import { sanitizeHistory } from './history'
import { renderCacheKey, loadCachedRender, saveRender } from './renderCache'

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
type Turn = { id: string; prompt: string; actions: string[]; calls: { name: string; input?: unknown }[]; reply: string }

/** Thin line thumbs (Feather), 15 px; filled when the vote is on. */
function ThumbIcon({ down = false, on = false }: { down?: boolean; on?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={down ? { transform: 'scale(-1)' } : undefined}>
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

/**
 * The quiet vote row under a turn's last message (the ChatGPT-style icon
 * strip): 👍 👎 as thin icons in ink-3, filled in ink when on; a tap adds a
 * thumb (×2, ×3 shown as a small count), the fourth tap clears.
 */
function RewindIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}

type VoteRowProps = {
  score: number
  onVote: (score: number) => void
  /** ↺ is offered on the five most recent earlier turns that have a snapshot. */
  canRollback?: boolean
  asking?: boolean
  onRollback?: (what: 'ask' | 'confirm' | 'cancel') => void
}

function VoteRow({ score, onVote, canRollback = false, asking = false, onRollback }: VoteRowProps) {
  const up = score > 0 ? score : 0
  const down = score < 0 ? -score : 0
  if (asking) {
    return (
      <div className="jb-vote-row" role="group" aria-label="Roll back">
        <span className="jb-vote-ask">Back to here? Later turns and edits are dropped.</span>
        <button type="button" onClick={() => onRollback?.('confirm')} className="jb-key jb-key--orange jb-key--xs">Roll back</button>
        <button type="button" onClick={() => onRollback?.('cancel')} className="jb-key jb-key--ghost jb-key--xs">Keep</button>
      </div>
    )
  }
  return (
    <div className="jb-vote-row" role="group" aria-label="Rate this turn">
      <button type="button" onClick={() => onVote(up === 3 ? 0 : up + 1)} className={`jb-vote-btn${up ? ' on' : ''}`} aria-label={`Thumbs up${up ? ` (${up})` : ''}`} aria-pressed={up > 0}>
        <ThumbIcon on={up > 0} />{up > 1 && <span className="jb-vote-n">{up}</span>}
      </button>
      <button type="button" onClick={() => onVote(down === 3 ? 0 : -(down + 1))} className={`jb-vote-btn${down ? ' on' : ''}`} aria-label={`Thumbs down${down ? ` (${down})` : ''}`} aria-pressed={down > 0}>
        <ThumbIcon down on={down > 0} />{down > 1 && <span className="jb-vote-n">{down}</span>}
      </button>
      {canRollback && (
        <button type="button" onClick={() => onRollback?.('ask')} className="jb-vote-btn" aria-label="Roll back to this point" title="Roll back to this point">
          <RewindIcon />
        </button>
      )}
    </div>
  )
}

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
  /** turnId (the user message that started the turn) → -3..3, from jam_votes. */
  const [votes, setVotes] = useState<Record<string, number>>({})
  const voteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Turn ids that have a server snapshot (the five most recent) — ↺ shows on those. */
  const [snapshots, setSnapshots] = useState<Set<string>>(() => new Set())
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false)
  const openSnapRef = useRef(false)
  const [rollbackAsk, setRollbackAsk] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  /** The session as it was when Controls opened; Revert goes back to it. */
  const controlsBaselineRef = useRef<unknown>(null)
  const [controlsDirty, setControlsDirty] = useState(false)
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
  const cacheTimerRef = useRef<number | null>(null)
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

  /** The track right after a turn, so ↺ can bring it back (the server keeps five per track). */
  const saveSnapshot = useCallback((turnId: string) => {
    const jam = jamRef.current
    const session = sessionRef.current
    if (!jam || !session) return
    api.saveSnapshot(track.id, { turnId, session: jam.serializeSession(session), messages: messagesRef.current, feed: feedRef.current.slice(-200) })
      .then(() => setSnapshots((prev) => new Set(prev).add(turnId)))
      .catch(() => {})
  }, [track.id])

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

  // Key of the current session state for the render cache (serialized session + engine stamp).
  const currentRenderKey = useCallback(async () => {
    const jam = jamRef.current
    const session = sessionRef.current
    if (!jam || !session) return null
    return renderCacheKey(JSON.stringify(jam.serializeSession(session)), JAMBOT_BUILD)
  }, [])

  const applyRender = useCallback((r: RenderResult, autoplay: boolean, scope: RenderScope = SONG) => {
    lastRenderRef.current = r
    // Whole-track renders go to the on-device cache (debounced: a slider storm writes once),
    // so the next open of this track skips the render.
    if (scope.kind === 'song') {
      if (cacheTimerRef.current) window.clearTimeout(cacheTimerRef.current)
      cacheTimerRef.current = window.setTimeout(() => {
        cacheTimerRef.current = null
        void (async () => {
          const key = await currentRenderKey()
          if (key && lastRenderRef.current === r) await saveRender(track.id, key, r)
        })()
      }, 1500)
    }
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
  }, [refreshDesc, currentRenderKey, track.id])

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
        if (d.instruments.some((i) => i.active)) {
          // Same session as last time on this device → play the cached render, no wait.
          const key = await currentRenderKey()
          const cached = key ? await loadCachedRender(track.id, key) : null
          if (cancelled) return
          if (cached) applyRender({ ...cached, bpm: sessionRef.current.bpm }, false)
          else void renderNow(false)
        }
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
      if (cacheTimerRef.current) { window.clearTimeout(cacheTimerRef.current); cacheTimerRef.current = null }
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
      // x-jam-track lets the server mine this turn for a correction of the last one (taste v2).
      headers: { 'content-type': 'application/json', 'x-jam-track': track.id },
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
  }, [track.id])

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

    const turnId = nid()
    addItem({ id: turnId, kind: 'user', text })
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
      // Snapshot the track right after this turn so ↺ can bring it back
      // (the server keeps the five most recent). Losing one only loses the ↺.
      saveSnapshot(turnId)
    }
  }, [busy, llm, addItem, setFeedBoth, refreshDesc, applyRender, note, saveNow, onAuthLost, saveSnapshot])

  // ---- turn votes (👍 / 👎 on the last agent turn) ---------------------------

  useEffect(() => {
    api.votes(track.id).then((r) => setVotes(r.votes)).catch(() => { /* votes are optional on open */ })
    api.snapshots(track.id).then((r) => { setSnapshots(new Set(r.snapshots.map((x) => x.turnId))); setSnapshotsLoaded(true) }).catch(() => { /* no ↺ then */ })
  }, [track.id])


  // A turn = a user message and everything the agent did until the next one.
  const turns = useMemo(() => {
    const out: { turn: Turn; endId: string }[] = []
    let cur: { turn: Turn; endId: string } | null = null
    for (const it of feed) {
      if (it.kind === 'user') {
        if (cur) out.push(cur)
        cur = { turn: { id: it.id, prompt: it.text, actions: [], calls: [], reply: '' }, endId: it.id }
      } else if (cur) {
        cur.endId = it.id
        if (it.kind === 'tool') { cur.turn.actions.push(it.name); cur.turn.calls.push({ name: it.name, input: it.input }) }
        else if (it.kind === 'assistant') cur.turn.reply = cur.turn.reply ? `${cur.turn.reply}\n${it.text}` : it.text
      }
    }
    if (cur) out.push(cur)
    return out
  }, [feed])
  // Every finished turn with agent output gets the quiet 👍 / 👎 row after
  // its last item (the turn still streaming — the last one while busy — waits).
  const turnEnds = useMemo(() => {
    const m: Record<string, Turn> = {}
    turns.forEach(({ turn, endId }, i) => {
      if (endId === turn.id) return
      if (i === turns.length - 1 && busy) return
      m[endId] = turn
    })
    return m
  }, [turns, busy])

  // ↺ on the five most recent earlier turns that have a snapshot (the last
  // turn is the current state — nothing to go back to).
  const rollbackable = useMemo(() => {
    const ids = new Set<string>()
    if (busy || rollingBack) return ids
    for (const { turn } of turns.slice(-5)) if (snapshots.has(turn.id)) ids.add(turn.id)
    return ids
  }, [turns, snapshots, busy, rollingBack])

  // A track whose last turn predates snapshots (or was imported) gets one as
  // it opens, so ↺ on that turn undoes anything done by hand afterwards.
  useEffect(() => {
    if (!snapshotsLoaded || !desc || busy || openSnapRef.current) return
    const last = turns[turns.length - 1]
    if (!last || last.endId === last.turn.id || snapshots.has(last.turn.id)) return
    openSnapRef.current = true
    saveSnapshot(last.turn.id)
  }, [snapshotsLoaded, desc, busy, turns, snapshots, saveSnapshot])

  // Controls: remember the session as opened; Revert puts it back.
  useEffect(() => {
    if (!controlsOpen) return
    const jam = jamRef.current
    const session = sessionRef.current
    controlsBaselineRef.current = jam && session ? jam.serializeSession(session) : null
    setControlsDirty(false)
  }, [controlsOpen])

  const revertControls = useCallback(async () => {
    const jam = jamRef.current
    const base = controlsBaselineRef.current
    if (!jam || !base || busyRef.current) return
    sessionRef.current = jam.deserializeSession(base)
    if (typeof window !== 'undefined') { const w = window as unknown as { __jamSession?: unknown }; if ('__jamSession' in w) w.__jamSession = sessionRef.current }
    controlNotesRef.current.clear()
    seqEditsRef.current.clear()
    renderScopeRef.current = SONG
    setRenderScopeState(SONG)
    refreshDesc()
    setControlsDirty(false)
    await renderNow(false)
    await saveNow()
    note('Controls reverted to how they were when you opened them.')
  }, [refreshDesc, renderNow, saveNow, note])

  const rollbackTo = useCallback(async (turn: Turn) => {
    const jam = jamRef.current
    if (!jam || busyRef.current) return
    setRollbackAsk(null)
    setRollingBack(true)
    try {
      const { snapshot } = await api.snapshot(track.id, turn.id)
      const idx = turns.findIndex((x) => x.turn.id === turn.id)
      const dropped = turns.slice(idx + 1).map(({ turn: t }) => ({ turnId: t.id, prompt: t.prompt, calls: t.calls.slice(0, 40) }))
      sessionRef.current = jam.deserializeSession(snapshot.session)
  if (typeof window !== 'undefined') { const w = window as unknown as { __jamSession?: unknown }; if ('__jamSession' in w) w.__jamSession = sessionRef.current }
      messagesRef.current = sanitizeHistory(snapshot.messages)
      setFeedBoth(() => snapshot.feed)
      renderScopeRef.current = SONG
      setRenderScopeState(SONG)
      refreshDesc()
      await renderNow(false)
      await saveNow()
      api.rollback(track.id, { turnId: turn.id, dropped }).catch(() => {})
      note(`Rolled back to “${turn.prompt.replace(/\s+/g, ' ').slice(0, 48)}”.`)
    } catch (e) {
      note(`Couldn't roll back: ${(e as Error).message}`, true)
    } finally {
      setRollingBack(false)
    }
  }, [turns, track.id, setFeedBoth, refreshDesc, renderNow, saveNow, note])

  const castVote = useCallback((turn: Turn, score: number) => {
    setVotes((v) => { const n = { ...v }; if (score === 0) delete n[turn.id]; else n[turn.id] = score; return n })
    if (voteTimer.current) clearTimeout(voteTimer.current)
    voteTimer.current = setTimeout(() => {
      const d = desc
      api.vote({
        trackId: track.id,
        turnId: turn.id,
        score,
        prompt: turn.prompt,
        reply: turn.reply.slice(0, 600),
        actions: turn.actions.slice(0, 40),
        calls: turn.calls.slice(0, 40),
        state: d ? { bpm: d.bpm, bars: d.bars, swing: d.swing, instruments: d.instruments.filter((i) => i.active).map((i) => i.id), sections: d.arrangement.length } : undefined,
      }).catch((e) => note((e as Error).message || 'Could not save the vote.', true))
    }, 350)
  }, [desc, track.id, note])

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

  // M / S keys: track mute / solo through the same tools the agent uses.
  const onMix = useCallback(async (id: string, what: 'mute' | 'solo', on: boolean) => {
    const jam = jamRef.current
    const session = sessionRef.current
    if (!jam || !session) return
    try {
      const r = what === 'mute'
        ? await jam.executeTool('mute_track', { track: id, mute: on }, session, {})
        : await jam.executeTool('solo_track', { track: id, solo: on, exclusive: false }, session, {})
      if (/^Error/.test(r)) { note(r, true); return }
      controlNotesRef.current.set(`mix:${id}:${what}`, `${id} ${what} ${on ? 'on' : 'off'}`)
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
      // A bounce is a whole-track taste signal (v2); losing it is not worth a note.
      api.signal(track.id, 'bounce').catch(() => {})
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
  // Which instruments/voices sound at this step — drives the panel and section LEDs.
  // Recomputed only when the step changes (~8×/s at 128 BPM), not every frame.
  const hits: Hits = useMemo(
    () => hitsAt(sessionRef.current, desc?.instruments ?? [], playedScope, playStep16),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playStep16, playedScope, desc],
  )
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
            let el: React.ReactNode
            if (it.kind === 'user') el = <div className="jb-bubble">{it.text}</div>
            else if (it.kind === 'assistant') el = <div className="jb-answer">{it.text}</div>
            else if (it.kind === 'note') el = <div className={`jb-note${it.error ? ' err' : ''}`}>{it.text}</div>
            else {
              const open = expanded.has(it.id)
              const pending = it.result === undefined
              el = (
                <div className="mr-6">
                  <button onClick={() => toggleExpanded(it.id)} className={`jb-chip${it.isError ? ' err' : ''}`}>
                    <span className={`jb-led ${pending ? '' : it.isError ? 'on' : 'green'}`} />
                    <span className="truncate">{it.name}</span>
                  </button>
                  {open && <pre className="jb-chip-out">{JSON.stringify(it.input)}{it.result ? `\n→ ${it.result}` : ''}</pre>}
                </div>
              )
            }
            const turn = turnEnds[it.id]
            return (
              <Fragment key={it.id}>
                {el}
                {turn ? (
                  <VoteRow
                    score={votes[turn.id] ?? 0}
                    onVote={(sc) => castVote(turn, sc)}
                    canRollback={rollbackable.has(turn.id)}
                    asking={rollbackAsk === turn.id}
                    onRollback={(what) => { if (what === 'ask') setRollbackAsk(turn.id); else if (what === 'cancel') setRollbackAsk(null); else void rollbackTo(turn) }}
                  />
                ) : null}
              </Fragment>
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
        dirty={controlsDirty}
        onRevert={() => { void revertControls() }}
        onTrack={(k, v) => { setControlsDirty(true); return onTrack(k, v) }}
        onParam={(p, v, l) => { setControlsDirty(true); return onParam(p, v, l) }}
        onMix={(id, what, on) => { setControlsDirty(true); return onMix(id, what, on) }}
        getSession={getSession}
        playStep16={playStep16}
        playScope={playedScope}
        hits={hits}
        onScope={setRenderScope}
        onSeqEdit={(key, head, edit) => { setControlsDirty(true); onSeqEdit(key, head, edit) }}
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
