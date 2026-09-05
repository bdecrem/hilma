'use client'

// Full-screen sheet with the direct controls: tempo/swing/length plus either
// the fader list or the synths' own panels.

import { useEffect, useState } from 'react'
import { type Control, type ControlGroup, formatControl, fromSlider, toSlider } from './controls'
import type { SessionDescription } from './jambot'
import AltPanels from './alt/panels'

type Props = {
  open: boolean
  onClose: () => void
  bpm: number
  swing: number
  bars: number
  groups: ControlGroup[]
  desc: SessionDescription | null
  rendering: boolean
  /** Bars of the last render (an arrangement's total, not the loop length). */
  loopBars?: number | null
  onTrack: (key: 'bpm' | 'swing' | 'bars', value: number) => void
  onParam: (path: string, value: number | string, label: string) => void
}

const BAR_CHOICES = [1, 2, 4, 8, 16, 32, 64, 128]
type Mode = 'sliders' | 'panels'
const MODE_KEY = 'jam:controlsMode'

export default function ControlsSheet({ open, onClose, bpm, swing, bars, groups, desc, rendering, loopBars, onTrack, onParam }: Props) {
  const inSong = !!desc && desc.arrangement.length > 0
  const [mode, setMode] = useState<Mode>('sliders')
  useEffect(() => {
    try { const m = localStorage.getItem(MODE_KEY); if (m === 'panels' || m === 'sliders') setMode(m) } catch { /* noop */ }
  }, [])
  const pickMode = (m: Mode) => { setMode(m); try { localStorage.setItem(MODE_KEY, m) } catch { /* noop */ } }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div
      aria-hidden={!open}
      className="jb-sheet"
      style={{ transform: open ? 'translateY(0)' : 'translateY(100%)', pointerEvents: open ? 'auto' : 'none' }}
    >
      <header className="jb-sheet-head">
        <div className="flex items-center gap-3">
          <span className="jb-title">Controls</span>
          <span className="flex items-center gap-2">
            <span className={`jb-led ${rendering ? 'on' : 'green'}`} />
            <span className="jb-readout">{rendering ? 'rendering' : 'live'}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="jb-seg">
            <button onClick={() => pickMode('sliders')} className={mode === 'sliders' ? 'on' : ''}>Faders</button>
            <button onClick={() => pickMode('panels')} className={mode === 'panels' ? 'on' : ''}>Panels</button>
          </div>
          <button onClick={onClose} className="jb-key jb-key--orange jb-key--sm">Done</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)' }}>
        <div className="jb-group"><span className="jb-eyebrow">Track</span></div>
        <div className="jb-card px-3">
          <SliderRow label="tempo" display={`${Math.round(bpm)} BPM`} t={(bpm - 60) / (200 - 60)} onInput={(t) => onTrack('bpm', Math.round(60 + t * 140))} />
          <SliderRow label="swing" display={`${Math.round(swing)}%`} t={swing / 100} onInput={(t) => onTrack('swing', Math.round(t * 100))} />
          {inSong ? (
            <div className="jb-row py-3">
              <span className="lbl" style={{ fontSize: 14, color: 'var(--ink-2)' }}>length</span>
              <span className="jb-readout">
                arrangement · <b>{loopBars ?? bars}</b> bars <span className="jb-muted">· {desc?.arrangement.length} sections, set in chat</span>
              </span>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3 py-3">
              <span style={{ fontSize: 14, color: 'var(--ink-2)', paddingTop: 4 }}>length</span>
              <div className="flex flex-wrap justify-end gap-1">
                {BAR_CHOICES.map((b) => (
                  <button key={b} onClick={() => onTrack('bars', b)} className={`jb-key jb-key--xs ${bars === b ? '' : 'jb-key--panel'}`}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {mode === 'panels' && <AltPanels desc={desc} onParam={onParam} />}

        {mode === 'sliders' && groups.length === 0 && (
          <p className="jb-body jb-muted mt-8 text-center">Nothing to tweak yet. Ask for a beat first.</p>
        )}

        {mode === 'sliders' && groups.map((g) => (
          <section key={g.id}>
            <div className="jb-group">
              <span className="jb-eyebrow">{g.title}</span>
              {g.subtitle && <span className="jb-readout jb-muted">{g.subtitle}</span>}
            </div>
            <div className="jb-card px-3">
              {g.controls.map((c) => (
                <ParamRow key={c.path} control={c} onCommit={(v) => onParam(c.path, v, `${g.title} ${c.label}`)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function ParamRow({ control, onCommit }: { control: Control; onCommit: (v: number) => void }) {
  const [value, setValue] = useState(control.value)
  useEffect(() => setValue(control.value), [control.value, control.path])
  return (
    <SliderRow
      label={control.label}
      display={formatControl(control, value)}
      t={toSlider(control, value)}
      onInput={(t) => { const v = fromSlider(control, t); setValue(v); onCommit(v) }}
    />
  )
}

function SliderRow({ label, display, t, onInput }: { label: string; display: string; t: number; onInput: (t: number) => void }) {
  return (
    <div className="jb-slider-row">
      <div className="jb-row">
        <span className="lbl">{label}</span>
        <span className="jb-readout"><b>{display}</b></span>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(Math.max(0, Math.min(1, t)) * 1000)}
        onChange={(e) => onInput(Number(e.target.value) / 1000)}
        className="jb-fader"
        aria-label={label}
      />
    </div>
  )
}
