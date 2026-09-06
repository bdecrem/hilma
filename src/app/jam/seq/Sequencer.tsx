'use client'

// SEQ — a thumb-sized step sequencer inside the Controls sheet.
//
// Reads and writes the Jambot session directly: in loop mode the live node
// pattern, in song mode the saved pattern the selected section plays. Every
// edit hands the host (Studio) a note for the agent and asks it to refresh,
// re-render and save. Pure pattern maths live in model.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './seq.css'
import type { JamSession, SessionDescription } from '../jambot'
import { INSTRUMENT_NAMES } from '../controls'
import * as M from './model'
import type { RenderScope, SeqKind } from './model'

export type SeqEdit = (key: string, head: string, edit: string) => void

type Props = {
  desc: SessionDescription
  getSession: () => JamSession | null
  /** Sheet is open and showing this view (drives the section-loop scope). */
  active: boolean
  /** Remembered per track by the sheet. */
  instId: string | null
  onInst: (id: string) => void
  section: number | null
  onSection: (i: number) => void
  /** Absolute 16th index of the playing render (null when stopped). */
  playStep16: number | null
  /** Scope of the render that is currently playing. */
  playScope: RenderScope
  onScope: (s: RenderScope) => void
  onEdit: SeqEdit
  /** Wide layouts show 16 steps per page. */
  wide?: boolean
}

type Option = { id: string; type: string; kind: SeqKind; label: string; used: boolean }

const BAR_CHOICES = [1, 2, 4]

export default function Sequencer({ desc, getSession, active, instId, onInst, section, onSection, playStep16, playScope, onScope, onEdit, wide = false }: Props) {
  const arr = desc.arrangement as M.Section[]
  const inSong = arr.length > 0

  // ---- instrument options ---------------------------------------------------
  const options = useMemo<Option[]>(() => {
    const list: Option[] = []
    for (const inst of desc.instruments) {
      const kind = M.kindOf(inst.type || inst.id)
      if (!kind) continue
      const type = inst.type || inst.id
      const base = INSTRUMENT_NAMES[type] || type
      const used = inst.active || arr.some((s) => !!s.patterns?.[inst.id])
      list.push({ id: inst.id, type, kind, used, label: `${inst.id === type ? base : `${base} · ${inst.id}`}${used ? '' : ' (empty)'}` })
    }
    return [...list.filter((o) => o.used), ...list.filter((o) => !o.used)]
  }, [desc.instruments, arr])

  const picked = options.find((o) => o.id === instId)
    || options.find((o) => o.used && o.kind === 'drums')
    || options.find((o) => o.used)
    || options[0]
  const id = picked?.id ?? null
  const kind = picked?.kind ?? 'drums'
  const type = picked?.type ?? 'jt90'
  const voices = kind === 'drums' ? DRUM_VOICES_OF(type) : []

  // ---- section ---------------------------------------------------------------
  const [defaultSection] = useState(() => {
    if (!inSong) return 0
    if (playScope.kind === 'section') return Math.min(playScope.index, arr.length - 1)
    if (playStep16 != null) return M.sectionAtBar(arr, Math.floor(playStep16 / 16)) ?? 0
    return 0
  })
  const secIdx = inSong ? Math.max(0, Math.min(arr.length - 1, section ?? defaultSection)) : 0
  const sec = inSong ? arr[secIdx] : null
  const patName: string | null = inSong && id ? sec?.patterns?.[id] ?? null : null

  // ---- the target pattern ------------------------------------------------------
  const [tick, setTick] = useState(0)
  const session = getSession()
  const raw: unknown = useMemo(() => {
    if (!session || !id) return null
    if (inSong) return patName ? session.patterns?.[id]?.[patName]?.pattern ?? null : null
    return session.instrument?.(id)?.pattern ?? null
    // `tick` and `desc` are the change signals: the session object itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, id, inSong, patName, tick, desc])
  const missing = inSong && !!patName && raw === null
  const silent = inSong && (!patName || missing)
  const len = M.patternLength(raw, kind)
  const bars = len / 16
  const per = wide ? 16 : M.PAGE
  const pages = Math.max(1, Math.ceil(len / per))

  // ---- paging -------------------------------------------------------------------
  const [page, setPageRaw] = useState(0)
  const pageNow = Math.min(page, pages - 1)
  const [sel, setSelRaw] = useState(0)
  const selNow = Math.min(sel, len - 1)
  // Paging keeps the step editor on a visible step: an off-page selection
  // moves to the first step of the new page.
  const setPage = useCallback((p: number) => {
    const next = ((p % pages) + pages) % pages
    setPageRaw(next)
    setSelRaw((s) => (Math.floor(s / per) === next ? s : next * per))
  }, [pages, per])
  const setSel = (i: number) => { const s = ((i % len) + len) % len; setSelRaw(s); setPageRaw(Math.floor(s / per)) }

  const pickInst = (next: string) => { onInst(next); setPageRaw(0); setSelRaw(0) }
  const pickSection = (i: number) => { onSection(i); setPageRaw(0) }

  // ---- section audition -------------------------------------------------------
  const [loopSec, setLoopSec] = useState(true)
  useEffect(() => { if (active) setLoopSec(true) }, [active])
  useEffect(() => {
    onScope(active && inSong && loopSec ? { kind: 'section', index: secIdx } : { kind: 'song' })
  }, [active, inSong, loopSec, secIdx, onScope])
  useEffect(() => () => onScope({ kind: 'song' }), [onScope])

  // ---- playhead ----------------------------------------------------------------
  const playStep = useMemo(() => {
    if (playStep16 == null || !len || silent) return null
    if (!inSong) return playStep16 % len
    if (playScope.kind === 'section') return playScope.index === secIdx ? playStep16 % len : null
    const bar = Math.floor(playStep16 / 16)
    if (M.sectionAtBar(arr, bar) !== secIdx) return null
    return (playStep16 - M.sectionStarts(arr)[secIdx] * 16) % len
  }, [playStep16, len, silent, inSong, playScope, secIdx, arr])

  // ---- writes ------------------------------------------------------------------
  const commit = useCallback((next: unknown, edit: string, extra?: (s: JamSession) => void) => {
    const s = getSession()
    if (!s || !id) return
    if (inSong) {
      if (!patName) return
      const entry = s.patterns?.[id]?.[patName]
      if (!entry) return
      entry.pattern = next
      // Keep the live node in step with what the agent believes is loaded.
      if (s.currentPattern?.[id] === patName) { const acc = s.instrument?.(id); if (acc) acc.pattern = structuredClone(next) }
    } else {
      const acc = s.instrument?.(id)
      if (!acc) return
      acc.pattern = next
    }
    extra?.(s)
    const where = inSong ? `pattern ${patName}` : 'live pattern'
    onEdit(`seq:${id}:${inSong ? patName : 'live'}`, `sequencer edited ${id} ${where} (steps counted from 1)`, edit)
    setTick((t) => t + 1)
  }, [getSession, id, inSong, patName, onEdit])

  const tapDrum = (voice: string, i: number) => {
    const { pattern, state } = M.cycleDrumStep(raw, voices, voice, i)
    commit(pattern, `${voice} step ${i + 1} ${state === 'hit' ? 'on' : state}`)
  }
  const tapMono = (i: number) => {
    const mono = M.normalizeMono(raw)
    const next = M.toggleGate(mono, i)
    setSelRaw(i)
    commit(next, next[i].gate ? `step ${i + 1} on (${next[i].note})` : `step ${i + 1} off`)
  }
  const shift = (semis: number) => {
    const mono = M.normalizeMono(raw)
    const from = mono[selNow].note
    const to = M.shiftNote(from, semis)
    if (to === from) return
    commit(M.setNote(mono, selNow, to), `step ${selNow + 1} note ${from} → ${to}`)
  }
  const accent = () => { const n = M.toggleAccent(raw, selNow); commit(n, `step ${selNow + 1} accent ${n[selNow].accent ? 'on' : 'off'}`) }
  const slide = () => { const n = M.toggleSlide(raw, selNow); commit(n, `step ${selNow + 1} slide ${n[selNow].slide ? 'on' : 'off'}`) }
  const gateOff = () => { if (M.normalizeMono(raw)[selNow].gate) commit(M.setGate(raw, selNow, false), `step ${selNow + 1} off`) }

  const setLength = (b: number) => {
    if (b === bars) return
    const steps = b * 16
    const next = kind === 'drums' ? M.resizeDrums(raw, voices, steps) : M.resizeMono(raw, steps)
    commit(next, `length → ${b} ${b === 1 ? 'bar' : 'bars'}`, (s) => {
      // Loop mode: make the loop long enough to play the whole pattern.
      if (!inSong && (Number(s.bars) || 0) < b) s.bars = b
    })
    setPageRaw(0)
  }

  const [armed, setArmed] = useState(false)
  const armTimer = useRef<number | null>(null)
  useEffect(() => () => { if (armTimer.current) window.clearTimeout(armTimer.current) }, [])
  const clear = () => {
    if (!armed) {
      setArmed(true)
      armTimer.current = window.setTimeout(() => { armTimer.current = null; setArmed(false) }, 3000)
      return
    }
    if (armTimer.current) { window.clearTimeout(armTimer.current); armTimer.current = null }
    setArmed(false)
    commit(kind === 'drums' ? M.clearDrums(raw, voices) : M.clearMono(raw), 'cleared all steps')
  }

  // ---- swipe to page ----------------------------------------------------------
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null)
  const suppress = useRef(false)
  const onDown = (e: React.PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId } }
  const onUp = (e: React.PointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s || s.id !== e.pointerId) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (Math.abs(dx) >= 40 && Math.abs(dy) < 40) {
      setPage(pageNow + (dx < 0 ? 1 : -1))
      suppress.current = true
      window.setTimeout(() => { suppress.current = false }, 200)
    }
  }
  const guard = (fn: () => void) => () => { if (!suppress.current) fn() }

  // ---- derived views ---------------------------------------------------------
  const hits = useMemo(() => M.hitRow(raw, kind), [raw, kind])
  const drums = kind === 'drums' ? M.normalizeDrums(raw, voices) : null
  const mono = kind === 'mono' ? M.normalizeMono(raw) : null
  const first = pageNow * per
  const cols = Array.from({ length: per }, (_, k) => first + k).filter((i) => i < len)
  const usedIn = patName ? M.sectionsUsing(arr, id || '', patName) : []
  const selStep = mono ? mono[selNow] : null

  if (!options.length) {
    return <p className="jb-body jb-muted mt-8 text-center">No sequencer-ready instruments in this session yet. Ask for a beat first.</p>
  }

  return (
    <div className="seq" data-testid="seq">
      {/* a. instrument picker */}
      <div className="jb-group" style={{ marginTop: 16 }}><span className="jb-eyebrow">Instrument</span></div>
      <div className="seq-pick">
        <select aria-label="Instrument" value={id || ''} onChange={(e) => pickInst(e.target.value)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      {/* b. section row (song mode) */}
      {inSong && (
        <>
          <div className="seq-head">
            <span className="jb-eyebrow">Section</span>
            <span className="rule" />
            <button
              onClick={() => setLoopSec((v) => !v)}
              className="jb-key jb-key--panel jb-key--sm seq-led-key"
              aria-pressed={loopSec}
              title="Play only this section while editing"
            >
              <span className={`jb-led ${loopSec ? 'on' : ''}`} />Loop section
            </button>
          </div>
          <div className="seq-pills" role="tablist" aria-label="Sections">
            {arr.map((s, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === secIdx}
                onClick={() => pickSection(i)}
                className={`seq-pill${i === secIdx ? ' on' : ''}${id && !s.patterns?.[id] ? ' silent' : ''}`}
              >
                <span className="n">{i + 1}</span>
                <span className="b">{s.bars} {s.bars === 1 ? 'bar' : 'bars'}</span>
              </button>
            ))}
          </div>
          <div className="jb-readout seq-caption" data-testid="seq-caption">
            {patName && !missing && <>pattern <b>{patName}</b> · used in {usedIn.length === 1 ? 'section' : 'sections'} {M.listSections(usedIn)}</>}
            {patName && missing && <span className="lit">pattern {patName} is referenced here but not saved</span>}
            {!patName && <>not playing in section <b>{secIdx + 1}</b></>}
          </div>
          {silent && <div className="jb-note seq-hint">pick another section, or ask in chat to add it here</div>}
        </>
      )}

      {/* c. overview strip */}
      <div className="seq-ov" aria-label="Pattern overview">
        {Array.from({ length: Math.ceil(len / 16) }, (_, b) => (
          <div key={b} className="seq-ov-bar">
            {Array.from({ length: Math.ceil(Math.min(16, len - b * 16) / per) }, (_, pg) => {
              const p = Math.floor((b * 16) / per) + pg
              return (
                <button key={pg} type="button" className={`seq-ov-page${p === pageNow ? ' on' : ''}`} onClick={() => setPage(p)} aria-label={`Go to steps ${p * per + 1}–${Math.min(len, (p + 1) * per)}`}>
                  {Array.from({ length: Math.min(per, len - p * per) }, (_, k) => {
                    const i = p * per + k
                    return <span key={k} className={`seq-ov-cell${hits[i] ? ' hit' : ''}${playStep === i ? ' now' : ''}`} />
                  })}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* d. page nav */}
      <div className="seq-nav">
        <button onClick={() => setPage(pageNow - 1)} className="jb-key jb-key--panel" aria-label="Previous steps" disabled={pages < 2}>‹</button>
        <span className="seq-nav-readout" data-testid="seq-page">{M.pageLabel(pageNow, len, per)}</span>
        <button onClick={() => setPage(pageNow + 1)} className="jb-key jb-key--panel" aria-label="Next steps" disabled={pages < 2}>›</button>
      </div>

      {/* e. grid */}
      <div
        className={`seq-grid${wide ? ' wide' : ''}${silent ? ' off' : ''}`}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => { swipe.current = null }}
        data-testid="seq-grid"
      >
        <span className="seq-colhead" />
        {cols.map((i) => (
          <span key={i} className={`seq-colhead${playStep === i ? ' now' : ''}`}>{(i % 16) + 1}</span>
        ))}

        {drums && voices.map((voice) => {
          const row = drums[voice] || []
          const has = row.some((s) => M.drumStepState(s) !== 'off')
          return (
            <DrumRow key={voice} voice={voice} row={row} cols={cols} has={has} playStep={playStep} onTap={(i) => guard(() => tapDrum(voice, i))()} />
          )
        })}

        {mono && (
          <>
            <span className="seq-lbl">{type}</span>
            {cols.map((i) => {
              const s = mono[i]
              const cls = ['seq-pad', 'seq-pad--note']
              if (i % 4 === 0) cls.push('beat')
              if (s.gate) cls.push('hit')
              if (s.gate && s.accent) cls.push('acc')
              if (playStep === i) cls.push('now')
              if (selNow === i) cls.push('sel')
              return (
                <button
                  key={i}
                  type="button"
                  className={cls.join(' ')}
                  onClick={guard(() => tapMono(i))}
                  aria-label={`Step ${i + 1} ${s.gate ? s.note : 'off'}`}
                  aria-pressed={s.gate}
                  data-step={i}
                >
                  {s.gate && s.slide && <span className="slide">~</span>}
                  {s.gate && <span className="note">{s.note}</span>}
                  {s.gate && <span className="pitch" style={{ width: `calc((100% - 8px) * ${M.pitchFrac(s.note, type).toFixed(3)})` }} />}
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* mono: step editor */}
      {mono && selStep && !silent && (
        <div className="jb-card seq-editor" data-testid="seq-editor">
          <div className="seq-editor-head">
            <span className="jb-eyebrow" style={{ color: 'var(--ink-2)' }}>Step {selNow + 1}</span>
            <div className="keys">
              <button onClick={() => setSel(selNow - 1)} className="jb-key jb-key--panel" aria-label="Previous step">‹</button>
              <button onClick={() => setSel(selNow + 1)} className="jb-key jb-key--panel" aria-label="Next step">›</button>
            </div>
          </div>
          <div className="seq-note-row">
            <span className={`seq-note${selStep.gate ? '' : ' off'}`} data-testid="seq-note">{selStep.note}</span>
            <span className="jb-readout">
              {selStep.gate ? <><b>on</b>{selStep.accent ? ' · accent' : ''}{selStep.slide ? ' · slide' : ''}</> : <span className="jb-muted">off</span>}
            </span>
          </div>
          <div className="seq-keys">
            <button onClick={() => shift(-12)} className="jb-key jb-key--panel">−oct</button>
            <button onClick={() => shift(-1)} className="jb-key jb-key--panel">−1</button>
            <button onClick={() => shift(1)} className="jb-key jb-key--panel">+1</button>
            <button onClick={() => shift(12)} className="jb-key jb-key--panel">+oct</button>
          </div>
          <div className="seq-keys seq-keys--3">
            <button onClick={accent} className="jb-key jb-key--panel seq-led-key" aria-pressed={selStep.accent}><span className={`jb-led ${selStep.accent ? 'on' : ''}`} />acc</button>
            <button onClick={slide} className="jb-key jb-key--panel seq-led-key" aria-pressed={selStep.slide}><span className={`jb-led ${selStep.slide ? 'on' : ''}`} />slide</button>
            <button onClick={gateOff} className="jb-key jb-key--ghost" disabled={!selStep.gate}>off</button>
          </div>
        </div>
      )}

      {/* f. footer */}
      <div className="seq-foot">
        <span className="jb-eyebrow">Length</span>
        {BAR_CHOICES.map((b) => (
          <button key={b} onClick={() => setLength(b)} disabled={silent} className={`jb-key jb-key--xs ${bars === b ? '' : 'jb-key--panel'}`} aria-pressed={bars === b}>{b}</button>
        ))}
        <span className="spacer" />
        <button onClick={clear} disabled={silent} className={`jb-key jb-key--ghost jb-key--xs${armed ? ' armed' : ''}`} data-testid="seq-clear">
          {armed ? 'clear?' : 'clear'}
        </button>
      </div>
    </div>
  )
}

function DRUM_VOICES_OF(type: string) {
  return M.DRUM_VOICES[type] || M.DRUM_VOICES.jt90
}

function DrumRow({ voice, row, cols, has, playStep, onTap }: {
  voice: string
  row: M.DrumStep[]
  cols: number[]
  has: boolean
  playStep: number | null
  onTap: (i: number) => void
}) {
  return (
    <>
      <span className={`seq-lbl${has ? '' : ' muted'}`} title={voice}>{M.VOICE_SHORT[voice] || voice.slice(0, 2)}</span>
      {cols.map((i) => {
        const st = M.drumStepState(row[i])
        const cls = ['seq-pad']
        if (i % 4 === 0) cls.push('beat')
        if (st !== 'off') cls.push('hit')
        if (st === 'accent') cls.push('acc')
        if (playStep === i) cls.push('now')
        return (
          <button
            key={i}
            type="button"
            className={cls.join(' ')}
            onClick={() => onTap(i)}
            aria-label={`${voice} step ${i + 1}: ${st}`}
            aria-pressed={st !== 'off'}
            data-voice={voice}
            data-step={i}
            data-state={st}
          />
        )
      })}
    </>
  )
}
