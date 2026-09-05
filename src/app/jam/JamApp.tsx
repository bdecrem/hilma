'use client'

// Jam — chat with Jambot, hear the track, tweak it, save it.
//
// Everything runs in the browser: the Jambot session, the tools, the agent
// loop, and rendering (OfflineAudioContext). The server only signs one
// Messages API call at a time (/api/jam/llm).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadJambot, JAMBOT_BUILD,
  type JambotModule, type JamSession, type AgentMessage, type ToolDef,
  type RenderResult, type LlmRequest, type LlmResponse, type SessionDescription,
} from './jambot'
import { LoopPlayer, loopSecondsFor } from './audio'
import { encodeMp3, wavBlob, deliver, trackFilename, type ExportFormat } from './export'
import { buildControlGroups, type ControlGroup } from './controls'
import ControlsSheet from './ControlsSheet'

type FeedItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'tool'; name: string; input: Record<string, unknown>; result?: string; isError?: boolean }
  | { id: string; kind: 'note'; text: string; error?: boolean }

type Saved = { v: 1; messages: AgentMessage[]; feed: FeedItem[]; session: unknown }

const STORAGE = 'jam:v1'
const KEY_STORAGE = 'jam:key'
const SUGGESTIONS = [
  'techno beat at 128 with a 909 kick',
  'add a squelchy acid bassline',
  'make the kick punchier and add swing',
  'pingpong delay on the hats',
]

let idCounter = 0
const nid = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return null
    const s = JSON.parse(raw) as Saved
    return s && s.v === 1 ? s : null
  } catch { return null }
}

export default function JamApp() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [hasBuffer, setHasBuffer] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [desc, setDesc] = useState<SessionDescription | null>(null)
  const [groups, setGroups] = useState<ControlGroup[]>([])
  const [controlsOpen, setControlsOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [exporting, setExporting] = useState<{ format: ExportFormat; progress: number } | null>(null)
  const [key, setKey] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [confirmNew, setConfirmNew] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const jamRef = useRef<JambotModule | null>(null)
  const toolsRef = useRef<ToolDef[]>([])
  const sessionRef = useRef<JamSession>(null)
  const messagesRef = useRef<AgentMessage[]>([])
  const feedRef = useRef<FeedItem[]>([])
  const playerRef = useRef<LoopPlayer | null>(null)
  const keyRef = useRef('')
  const lastRenderRef = useRef<RenderResult | null>(null)
  const controlNotesRef = useRef<Map<string, string>>(new Map())
  const renderTimerRef = useRef<number | null>(null)
  const renderSeqRef = useRef(0)
  const pendingToolIdsRef = useRef<string[]>([])
  const feedEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // ---- feed helpers --------------------------------------------------------

  const setFeedBoth = useCallback((updater: (f: FeedItem[]) => FeedItem[]) => {
    feedRef.current = updater(feedRef.current)
    setFeed(feedRef.current)
  }, [])

  const addItem = useCallback((item: FeedItem) => {
    setFeedBoth((f) => [...f, item])
  }, [setFeedBoth])

  const note = useCallback((text: string, error = false) => {
    addItem({ id: nid(), kind: 'note', text, error })
  }, [addItem])

  const persist = useCallback(() => {
    const jam = jamRef.current
    if (!jam || !sessionRef.current) return
    try {
      const saved: Saved = {
        v: 1,
        messages: messagesRef.current,
        feed: feedRef.current.slice(-200),
        session: jam.serializeSession(sessionRef.current),
      }
      localStorage.setItem(STORAGE, JSON.stringify(saved))
    } catch (e) {
      console.warn('[jam] persist failed', e)
    }
  }, [])

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
    // (the agent may ask for 4 bars while the session still says 2), so
    // slider re-renders and the transport display match what's looping.
    if (sessionRef.current && !r.hasArrangement && sessionRef.current.bars !== r.bars) {
      sessionRef.current.bars = r.bars
      refreshDesc()
    }
    const p = player()
    p.setBuffer(r.buffer, loopSecondsFor(r.bars, r.bpm))
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
      persist()
    } catch (e) {
      note(`Render failed: ${(e as Error).message}`, true)
    } finally {
      if (seq === renderSeqRef.current) setRendering(false)
    }
  }, [applyRender, note, persist])

  const scheduleRender = useCallback(() => {
    if (renderTimerRef.current) window.clearTimeout(renderTimerRef.current)
    renderTimerRef.current = window.setTimeout(() => {
      renderTimerRef.current = null
      void renderNow(false)
    }, 220)
  }, [renderNow])

  // Playhead
  useEffect(() => {
    if (!playing) { setPos(0); return }
    let raf = 0
    const tick = () => {
      setPos(playerRef.current?.position() ?? 0)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // ---- boot ----------------------------------------------------------------

  useEffect(() => {
    try {
      const k = localStorage.getItem(KEY_STORAGE) || ''
      keyRef.current = k
      setKey(k)
    } catch { /* private mode */ }

    let cancelled = false
    ;(async () => {
      try {
        const jam = await loadJambot()
        const tools = await jam.ready()
        if (cancelled) return
        jamRef.current = jam
        toolsRef.current = tools
        const saved = readSaved()
        if (saved) {
          try {
            sessionRef.current = jam.deserializeSession(saved.session)
            messagesRef.current = saved.messages || []
            feedRef.current = saved.feed || []
            setFeed(feedRef.current)
          } catch (e) {
            console.warn('[jam] could not restore, starting fresh', e)
            sessionRef.current = jam.createSession({ bpm: 128 })
          }
        } else {
          sessionRef.current = jam.createSession({ bpm: 128 })
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
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ block: 'end' })
  }, [feed, busy])

  // ---- LLM proxy -----------------------------------------------------------

  const llm = useCallback(async (req: LlmRequest): Promise<LlmResponse> => {
    const res = await fetch('/api/jam/llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-jam-key': keyRef.current },
      body: JSON.stringify({ system: req.system, messages: req.messages, tools: req.tools, max_tokens: req.max_tokens }),
      signal: req.signal,
    })
    if (res.status === 401) {
      keyRef.current = ''
      setKey('')
      try { localStorage.removeItem(KEY_STORAGE) } catch { /* noop */ }
      throw new Error('Wrong password. Enter the Jam password and send again.')
    }
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
        context: {
          onRender: (r: RenderResult) => applyRender(r, true),
        },
      })
    } catch (e) {
      note((e as Error).message || 'Something went wrong.', true)
    } finally {
      setBusy(false)
      refreshDesc()
      persist()
    }
  }, [busy, llm, addItem, setFeedBoth, refreshDesc, applyRender, note, persist])

  // ---- controls ------------------------------------------------------------

  const onParam = useCallback(async (path: string, value: number, label: string) => {
    const jam = jamRef.current
    const session = sessionRef.current
    if (!jam || !session) return
    try {
      const r = await jam.executeTool('tweak', { path, value }, session, {})
      if (/^Error/.test(r)) { note(r, true); return }
      controlNotesRef.current.set(path, `${label} → ${path} = ${value}`)
      scheduleRender()
    } catch (e) {
      note((e as Error).message, true)
    }
  }, [note, scheduleRender])

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
  }, [refreshDesc, scheduleRender])

  const newTrack = useCallback(() => {
    const jam = jamRef.current
    if (!jam) return
    playerRef.current?.stop()
    sessionRef.current = jam.createSession({ bpm: 128 })
    messagesRef.current = []
    feedRef.current = []
    setFeed([])
    lastRenderRef.current = null
    setHasBuffer(false)
    controlNotesRef.current.clear()
    try { localStorage.removeItem(STORAGE) } catch { /* noop */ }
    refreshDesc()
    setConfirmNew(false)
  }, [refreshDesc])

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

  const saveKey = () => {
    const k = keyDraft.trim()
    if (!k) return
    keyRef.current = k
    setKey(k)
    try { localStorage.setItem(KEY_STORAGE, k) } catch { /* noop */ }
    setKeyDraft('')
  }

  const toggleExpanded = (id: string) => {
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // ---- render --------------------------------------------------------------

  const bpm = desc?.bpm ?? 128
  const bars = desc?.bars ?? 2
  const swing = desc?.swing ?? 0
  const barNow = Math.min(bars, Math.floor(pos * bars) + 1)
  const ready = status === 'ready'
  const canSend = ready && !busy && !!key && input.trim().length > 0

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

      <header className="flex items-center justify-between px-4 pb-2 pt-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-extrabold tracking-[-0.06em]">JAM</h1>
          <span className="font-mono text-xs text-white/50">{Math.round(bpm)} BPM · {bars} {bars === 1 ? 'bar' : 'bars'}{swing ? ` · swing ${swing}` : ''}</span>
        </div>
        {confirmNew ? (
          <div className="flex gap-2">
            <button onClick={newTrack} className="rounded-full bg-[#ff5c7a] px-3 py-1 text-xs font-semibold text-black">Start over</button>
            <button onClick={() => setConfirmNew(false)} className="rounded-full bg-white/10 px-3 py-1 text-xs">Keep</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmNew(true)}
            disabled={!ready || busy}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 disabled:opacity-40"
          >
            New
          </button>
        )}
      </header>

      <main className="jam-feed flex-1 overflow-y-auto px-4 pb-4">
        {status === 'loading' && (
          <p className="mt-16 text-center text-sm text-white/50">Loading the groovebox…</p>
        )}
        {status === 'error' && (
          <div className="mt-16 rounded-2xl border border-[#ff5c7a]/40 bg-[#ff5c7a]/10 p-4 text-sm">
            <p className="font-semibold">Couldn&apos;t load Jambot.</p>
            <p className="mt-1 text-white/70">{loadError}</p>
          </div>
        )}

        {ready && !key && (
          <div className="mt-4 rounded-2xl border border-[#5ee0ff]/30 bg-[#5ee0ff]/10 p-4">
            <p className="text-sm font-semibold">Jam password</p>
            <p className="mt-1 text-xs text-white/60">One-time. Stored on this device.</p>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveKey() }}
                className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-base outline-none ring-1 ring-white/10 focus:ring-[#5ee0ff]/60"
                autoComplete="current-password"
                placeholder="password"
              />
              <button onClick={saveKey} className="rounded-xl bg-[#5ee0ff] px-4 text-sm font-semibold text-black">Save</button>
            </div>
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
              return (
                <div key={it.id} className="mr-6 whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">
                  {it.text}
                </div>
              )
            }
            if (it.kind === 'note') {
              return (
                <div key={it.id} className={`text-xs ${it.error ? 'text-[#ff5c7a]' : 'text-white/45'}`}>
                  {it.text}
                </div>
              )
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
              {rendering ? 'rendering…' : hasBuffer ? (playing ? `bar ${barNow}/${bars}` : 'ready') : 'no render yet'}
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
            {exporting ? `${Math.round(exporting.progress * 100)}%` : 'Save'}
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) }
          }}
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
        rendering={rendering}
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
