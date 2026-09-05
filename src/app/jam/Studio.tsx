'use client'

// Studio — one track: chat with Jambot, hear it, tweak it, save it.
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
import { api, NotSignedIn, publicTrackUrl, type Track, type FeedItem } from './api'
import { LoopPlayer, loopSecondsFor } from './audio'
import { encodeMp3, wavBlob, deliver, trackFilename, type ExportFormat } from './export'
import { buildControlGroups, type ControlGroup } from './controls'
import ControlsSheet from './ControlsSheet'

const SUGGESTIONS = [
  'techno beat at 128 with a 909 kick',
  'dub techno: soft kick, chord stabs into a long delay',
  'add a deep sub bassline',
  'make the kick punchier and add swing',
]

let idCounter = 0
const nid = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`

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
  // Bars of what is looping right now: the arrangement's total in song mode
  // (64 for a 64-bar song), the loop length otherwise.
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

  const jamRef = useRef<JambotModule | null>(null)
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
  const pendingToolIdsRef = useRef<string[]>([])
  const feedEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // ---- feed helpers --------------------------------------------------------

  const setFeedBoth = useCallback((updater: (f: FeedItem[]) => FeedItem[]) => {
    feedRef.current = updater(feedRef.current)
    setFeed(feedRef.current)
  }, [])

  const addItem = useCallback((item: FeedItem) => setFeedBoth((f) => [...f, item]), [setFeedBoth])

  const note = useCallback((text: string, error = false) => {
    addItem({ id: nid(), kind: 'note', text, error })
  }, [addItem])

  // ---- persistence ---------------------------------------------------------

  const saveNow = useCallback(async () => {
    const jam = jamRef.current
    const session = sessionRef.current
    if (!jam || !session) return
    if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    dirtyRef.current = false
    setSaveState('saving')
    try {
      await api.saveTrack(track.id, {
        title: titleRef.current,
        bpm: session.bpm,
        // What the library/catalog should say: the arrangement's total when
        // there is one, otherwise the loop length.
        bars: lastRenderRef.current?.bars ?? session.bars ?? 2,
        session: jam.serializeSession(session),
        messages: messagesRef.current,
        feed: feedRef.current.slice(-200),
      })
      setSaveState('saved')
    } catch (e) {
      if (e instanceof NotSignedIn) { onAuthLost(); return }
      console.warn('[jam] save failed', e)
      setSaveState('failed')
      dirtyRef.current = true
    }
  }, [track.id, onAuthLost])

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => { saveTimerRef.current = null; void saveNow() }, 800)
  }, [saveNow])

  // ---- publish / share -----------------------------------------------------

  const publish = async () => {
    if (pubBusy) return
    setPubBusy(true)
    try {
      if (dirtyRef.current || saveTimerRef.current) await saveNow()
      const { track: t } = pub.published ? await api.unpublish(track.id) : await api.publish(track.id)
      setPub({ published: !!t.published_at, slug: t.slug ?? null })
      if (t.published_at) addItem({ id: nid(), kind: 'note', text: `Published. Anyone can play and remix it at ${publicTrackUrl(t.slug || '')}` })
      else addItem({ id: nid(), kind: 'note', text: 'Unpublished. The link is off; publishing again restores it.' })
    } catch (e) {
      if (e instanceof NotSignedIn) { onAuthLost(); return }
      addItem({ id: nid(), kind: 'note', text: (e as Error).message, error: true })
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
      addItem({ id: nid(), kind: 'note', text: `Link copied: ${url}` })
    } catch {
      addItem({ id: nid(), kind: 'note', text: url })
    }
  }

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

  const applyRender = useCallback((r: RenderResult, autoplay: boolean) => {
    lastRenderRef.current = r
    // Keep the session's bar count in step with what was actually rendered
    // (the agent may ask for 4 bars while the session still says 2).
    if (sessionRef.current && !r.hasArrangement && sessionRef.current.bars !== r.bars) {
      sessionRef.current.bars = r.bars
      refreshDesc()
    }
    const p = player()
    p.setBuffer(r.buffer, loopSecondsFor(r.bars, r.bpm))
    setLoopBars(r.bars)
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
      const r = await jam.renderSessionToBuffer(session, session.bars || 2)
      if (seq !== renderSeqRef.current) return
      applyRender({ ...r, bpm: session.bpm }, autoplay)
    } catch (e) {
      note(`Render failed: ${(e as Error).message}`, true)
    } finally {
      if (seq === renderSeqRef.current) setRendering(false)
    }
  }, [applyRender, note])

  const scheduleRender = useCallback(() => {
    if (renderTimerRef.current) window.clearTimeout(renderTimerRef.current)
    renderTimerRef.current = window.setTimeout(() => {
      renderTimerRef.current = null
      void renderNow(false)
    }, 220)
  }, [renderNow])

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
    ;(async () => {
      try {
        const jam = await loadJambot()
        const tools = await jam.ready()
        if (cancelled) return
        jamRef.current = jam
        toolsRef.current = tools
        if (track.session) {
          try {
            sessionRef.current = jam.deserializeSession(track.session)
          } catch (e) {
            console.warn('[jam] could not restore session, starting fresh', e)
            sessionRef.current = jam.createSession({ bpm: track.bpm || 128 })
          }
        } else {
          sessionRef.current = jam.createSession({ bpm: track.bpm || 128 })
        }
        refreshDesc()
        setStatus('ready')
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
      playerRef.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id])

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ block: 'end' })
  }, [feed, busy])

  // Flush unsaved work when leaving the page.
  useEffect(() => {
    const flush = () => { if (dirtyRef.current) void saveNow() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
    return () => window.removeEventListener('pagehide', flush)
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
    const task = notes.length ? `${text}\n\n[controls] ${notes.join('; ')}` : text

    addItem({ id: nid(), kind: 'user', text })
    if (titleRef.current === 'Untitled') {
      // First sentence, cut at a word boundary, no trailing punctuation.
      let t = text.replace(/\s+/g, ' ').split(/[.!?:;]\s/)[0].trim()
      if (t.length > 40) t = t.slice(0, 40).replace(/\s+\S*$/, '')
      t = t.replace(/[\s,.:;!?-]+$/, '') || 'Untitled'
      titleRef.current = t
      setTitle(t)
    }
    setInput('')
    setBusy(true)
    setSaveOpen(false)
    pendingToolIdsRef.current = []

    try {
      await jam.runAgent({
        task,
        session,
        messages: messagesRef.current,
        llm,
        executeTool: jam.executeTool,
        tools: toolsRef.current,
        systemPrompt: jam.JAMBOT_PROMPT + jam.WEB_PROMPT_ADDENDUM,
        buildStateContext: jam.buildSessionContext,
        buildGenreContext: (t) => jam.buildGenreContext(jam.detectGenres(t)),
        callbacks: {
          onResponse: (t) => addItem({ id: nid(), kind: 'assistant', text: t }),
          onTool: (name, inp) => {
            const id = nid()
            pendingToolIdsRef.current.push(id)
            addItem({ id, kind: 'tool', name, input: inp })
          },
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
      // Song mode: the arrangement renders each section from the params
      // captured inside the saved patterns, so a live tweak alone changes
      // nothing you can hear. Write the value into every saved pattern of
      // that instrument (load → tweak → save), then restore the current one.
      const [inst, ...rest] = path.split('.')
      const saved = session.patterns?.[inst] as Record<string, unknown> | undefined
      const inSong = Array.isArray(session.arrangement) && session.arrangement.length > 0
      const nodeLevel = rest.length === 1 && rest[0] === 'level'
      if (inSong && saved && rest.length > 0 && !nodeLevel && inst !== 'fx') {
        const names = Object.keys(saved)
        const current: string | undefined = session.currentPattern?.[inst] || names[names.length - 1]
        for (const name of names) {
          await jam.executeTool('load_pattern', { instrument: inst, name }, session, {})
          await jam.executeTool('tweak', { path, value }, session, {})
          await jam.executeTool('save_pattern', { instrument: inst, name }, session, {})
        }
        if (current) await jam.executeTool('load_pattern', { instrument: inst, name: current }, session, {})
      }
      controlNotesRef.current.set(path, `${label} → ${path} = ${value}`)
      refreshDesc()   // panels/knobs read their values from the description
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

  const commitTitle = (t: string) => {
    const clean = t.trim().slice(0, 80) || 'Untitled'
    titleRef.current = clean
    setTitle(clean)
    setEditingTitle(false)
    scheduleSave()
  }

  const back = async () => {
    playerRef.current?.stop()
    if (dirtyRef.current || saveTimerRef.current) await saveNow()
    onBack()
  }

  const doExport = useCallback(async (format: ExportFormat) => {
    const jam = jamRef.current
    const r = lastRenderRef.current
    if (!jam || !r) { note('Nothing rendered yet.'); return }
    setSaveOpen(false)
    setExporting({ format, progress: 0 })
    try {
      const blob = format === 'mp3'
        ? await encodeMp3(r.buffer, (p) => setExporting({ format, progress: p }))
        : wavBlob(r.buffer, jam.audioBufferToWav)
      const how = await deliver(blob, trackFilename(r.bpm, format))
      note(how === 'shared' ? `${format.toUpperCase()} ready.` : `${format.toUpperCase()} downloaded.`)
    } catch (e) {
      note(`Export failed: ${(e as Error).message}`, true)
    } finally {
      setExporting(null)
    }
  }, [note])

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
  const ready = status === 'ready'
  const canSend = ready && !busy && input.trim().length > 0

  return (
    <div
      className="flex h-[100dvh] flex-col bg-[#0d0e12] text-[#f2f2f5]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <style>{`
        .jam-range { -webkit-appearance: none; appearance: none; height: 28px; background: transparent; }
        .jam-range::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.14); }
        .jam-range::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; margin-top: -9px; border-radius: 50%; background: #ffb02e; box-shadow: 0 2px 8px rgba(0,0,0,0.5); }
        .jam-range::-moz-range-track { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.14); }
        .jam-range::-moz-range-thumb { width: 24px; height: 24px; border: 0; border-radius: 50%; background: #ffb02e; }
        .jam-feed::-webkit-scrollbar { width: 0; }
        textarea { field-sizing: content; }
      `}</style>

      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <button onClick={back} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80" aria-label="Back to tracks">
          ‹ Tracks
        </button>
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              defaultValue={title}
              onBlur={(e) => commitTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitTitle((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingTitle(false) }}
              className="w-full rounded-lg bg-white/10 px-2 py-0.5 text-[15px] font-semibold outline-none ring-1 ring-[#ffb02e]/60"
            />
          ) : (
            <button onClick={() => setEditingTitle(true)} className="block w-full truncate text-left text-[15px] font-semibold" title="Rename">
              {title}
            </button>
          )}
          <div className="font-mono text-[11px] text-white/50">
            {Math.round(bpm)} BPM · {shownBars} {shownBars === 1 ? 'bar' : 'bars'}{inSong ? ' · song' : ''}{swing ? ` · swing ${swing}` : ''}
            {saveState === 'saving' && <span className="ml-2 text-white/35">saving…</span>}
            {saveState === 'failed' && <span className="ml-2 text-[#ff5c7a]">not saved</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {pub.published && (
            <button onClick={share} className="rounded-full bg-[#5ee0ff] px-3 py-1 text-xs font-semibold text-black active:scale-95" aria-label="Share link">
              Share
            </button>
          )}
          <button
            onClick={publish}
            disabled={pubBusy || !ready || (!pub.published && !hasBuffer)}
            className={`rounded-full px-3 py-1 text-xs font-semibold active:scale-95 disabled:opacity-40 ${pub.published ? 'bg-white/10 text-white/80' : 'bg-[#b6ff3d] text-black'}`}
            title={pub.published ? 'Take it off the catalog' : 'Put it on the catalog so anyone can play and remix it'}
          >
            {pubBusy ? '…' : pub.published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </header>

      <main className="jam-feed flex-1 overflow-y-auto px-4 pb-4">
        {status === 'loading' && <p className="mt-16 text-center text-sm text-white/50">Loading the groovebox…</p>}
        {status === 'error' && (
          <div className="mt-16 rounded-2xl border border-[#ff5c7a]/40 bg-[#ff5c7a]/10 p-4 text-sm">
            <p className="font-semibold">Couldn&apos;t load Jambot.</p>
            <p className="mt-1 text-white/70">{loadError}</p>
          </div>
        )}

        {ready && feed.length === 0 && (
          <div className="mt-10">
            <p className="text-center text-lg font-semibold">What should we make?</p>
            <p className="mt-1 text-center text-sm text-white/50">Say it like you&apos;d say it to a producer.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus() }}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 active:bg-white/15"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-col gap-2">
          {feed.map((it) => {
            if (it.kind === 'user') {
              return (
                <div key={it.id} className="ml-10 self-end rounded-2xl rounded-br-md bg-[#ffb02e] px-3.5 py-2 text-[15px] leading-snug text-black">
                  {it.text}
                </div>
              )
            }
            if (it.kind === 'assistant') {
              return <div key={it.id} className="mr-6 whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">{it.text}</div>
            }
            if (it.kind === 'note') {
              return <div key={it.id} className={`text-xs ${it.error ? 'text-[#ff5c7a]' : 'text-white/45'}`}>{it.text}</div>
            }
            const open = expanded.has(it.id)
            const pending = it.result === undefined
            return (
              <div key={it.id} className="mr-6">
                <button
                  onClick={() => toggleExpanded(it.id)}
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] ${
                    it.isError ? 'border-[#ff5c7a]/50 text-[#ff5c7a]' : pending ? 'border-white/15 text-white/50' : 'border-[#5ee0ff]/30 text-[#5ee0ff]'
                  }`}
                >
                  <span className="truncate">{it.name}</span>
                  <span>{pending ? '…' : it.isError ? '✕' : '✓'}</span>
                </button>
                {open && (
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-snug text-white/70">
                    {JSON.stringify(it.input)}
                    {it.result ? `\n→ ${it.result}` : ''}
                  </pre>
                )}
              </div>
            )
          })}
          {busy && <div className="text-xs text-[#ffb02e]">thinking…</div>}
        </div>
        <div ref={feedEndRef} />
      </main>

      {/* transport */}
      <div className="border-t border-white/10 px-4 pt-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => player().toggle()}
            disabled={!hasBuffer}
            aria-label={playing ? 'Stop' : 'Play'}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#ffb02e] text-black disabled:opacity-30 active:scale-95"
          >
            {playing ? <StopIcon /> : <PlayIcon />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#5ee0ff] transition-[width] duration-75" style={{ width: `${Math.round(pos * 100)}%` }} />
            </div>
            <div className="mt-1 font-mono text-[11px] text-white/45">
              {rendering ? 'rendering…' : hasBuffer ? (playing ? `bar ${barNow}/${shownBars}` : 'ready') : 'no render yet'}
            </div>
          </div>
          <button
            onClick={() => setControlsOpen(true)}
            disabled={!ready}
            className="rounded-full bg-white/10 px-3.5 py-2 text-sm font-medium disabled:opacity-40 active:bg-white/20"
          >
            Controls
          </button>
          <button
            onClick={() => setSaveOpen((s) => !s)}
            disabled={!hasBuffer || !!exporting}
            className="rounded-full bg-white/10 px-3.5 py-2 text-sm font-medium disabled:opacity-40 active:bg-white/20"
          >
            {exporting ? `${Math.round(exporting.progress * 100)}%` : 'Export'}
          </button>
        </div>
        {saveOpen && (
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => doExport('mp3')} className="rounded-full bg-[#b6ff3d] px-4 py-1.5 text-sm font-semibold text-black">MP3</button>
            <button onClick={() => doExport('wav')} className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold">WAV</button>
          </div>
        )}
      </div>

      {/* input */}
      <form
        className="flex items-end gap-2 px-4 pt-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
        onSubmit={(e) => { e.preventDefault(); void send(input) }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }}
          rows={1}
          placeholder={ready ? 'make me a techno beat at 128…' : 'loading…'}
          disabled={!ready}
          className="max-h-32 min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl bg-white/8 px-4 py-2.5 text-base leading-snug outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-[#ffb02e]/60"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="h-11 shrink-0 rounded-2xl bg-[#ffb02e] px-4 text-sm font-semibold text-black disabled:opacity-30 active:scale-95"
        >
          Send
        </button>
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
      />

      <div className="hidden" data-jambot-build={JAMBOT_BUILD} />
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M6 3.5v13l11-6.5z" fill="currentColor" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  )
}
