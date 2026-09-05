'use client'

// Full-screen sheet with the direct controls: tempo/swing/bars plus a slider
// for every key parameter of the instruments currently in the track.

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
  onTrack: (key: 'bpm' | 'swing' | 'bars', value: number) => void
  onParam: (path: string, value: number | string, label: string) => void
}

const BAR_CHOICES = [1, 2, 4, 8]
type Mode = 'sliders' | 'panels'
const MODE_KEY = 'jam:controlsMode'

export default function ControlsSheet({ open, onClose, bpm, swing, bars, groups, desc, rendering, onTrack, onParam }: Props) {
  // Two control UIs side by side for comparison: the slider list, and the
  // synths' own panels (knobs, wave buttons) skinned like their web UIs.
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
      className="fixed inset-0 z-40 flex flex-col bg-[#0d0e12] text-[#f2f2f5] transition-transform duration-300 ease-out"
      style={{ transform: open ? 'translateY(0)' : 'translateY(100%)', pointerEvents: open ? 'auto' : 'none' }}
    >
      <header
        className="flex items-center justify-between border-b border-white/10 px-4 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold tracking-tight">Controls</h2>
          <div className="flex rounded-full bg-white/5 p-0.5 text-xs">
            <button onClick={() => pickMode('sliders')} className={`rounded-full px-2.5 py-1 ${mode === 'sliders' ? 'bg-white/15 text-white' : 'text-white/50'}`}>Sliders</button>
            <button onClick={() => pickMode('panels')} className={`rounded-full px-2.5 py-1 ${mode === 'panels' ? 'bg-white/15 text-white' : 'text-white/50'}`}>Synth panels</button>
          </div>
          <span className={`text-xs ${rendering ? 'text-[#ffb02e]' : 'text-white/40'}`}>{rendering ? 'rendering…' : 'live'}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-full bg-[#ffb02e] px-4 py-1.5 text-sm font-semibold text-black active:scale-95"
        >
          Done
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)' }}>
        <Section title="Track">
          <SliderRow
            label="tempo"
            display={`${Math.round(bpm)} BPM`}
            t={(bpm - 60) / (200 - 60)}
            onInput={(t) => onTrack('bpm', Math.round(60 + t * 140))}
          />
          <SliderRow
            label="swing"
            display={`${Math.round(swing)}%`}
            t={swing / 100}
            onInput={(t) => onTrack('swing', Math.round(t * 100))}
          />
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-white/70">length</span>
            <div className="flex gap-1 rounded-full bg-white/5 p-1">
              {BAR_CHOICES.map((b) => (
                <button
                  key={b}
                  onClick={() => onTrack('bars', b)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition ${bars === b ? 'bg-[#ffb02e] text-black' : 'text-white/70'}`}
                >
                  {b} {b === 1 ? 'bar' : 'bars'}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {mode === 'panels' && <AltPanels desc={desc} onParam={onParam} />}

        {mode === 'sliders' && groups.length === 0 && (
          <p className="mt-8 text-center text-sm text-white/40">
            Nothing to tweak yet. Ask for a beat first.
          </p>
        )}

        {mode === 'sliders' && groups.map((g) => (
          <Section key={g.id} title={g.title} subtitle={g.subtitle}>
            {g.controls.map((c) => (
              <ParamRow key={c.path} control={c} onCommit={(v) => onParam(c.path, v, `${g.title} ${c.label}`)} />
            ))}
          </Section>
        ))}
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[#5ee0ff]">{title}</h3>
        {subtitle && <span className="text-xs text-white/40">{subtitle}</span>}
      </div>
      <div className="rounded-2xl bg-white/5 px-3">{children}</div>
    </section>
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
      onInput={(t) => {
        const v = fromSlider(control, t)
        setValue(v)
        onCommit(v)
      }}
    />
  )
}

function SliderRow({ label, display, t, onInput }: { label: string; display: string; t: number; onInput: (t: number) => void }) {
  return (
    <div className="border-b border-white/5 py-2 last:border-b-0">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-white/70">{label}</span>
        <span className="font-mono text-sm tabular-nums text-white">{display}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(Math.max(0, Math.min(1, t)) * 1000)}
        onChange={(e) => onInput(Number(e.target.value) / 1000)}
        className="jam-range mt-1 w-full"
        aria-label={label}
      />
    </div>
  )
}
