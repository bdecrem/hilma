'use client'

// Rotary knob + vertical slider that render with the original synth-UI
// class names (so each skin's CSS styles them) and write producer-unit
// values through the same onParam path the slider sheet uses.
//
// Drag vertically: 150px = full range, like the originals. The .knob element
// itself is rotated (-135° … +135°); every skin draws its indicator as a
// pseudo-element on it.

import { useRef, useState } from 'react'
import { type Control, toSlider, fromSlider, formatControl } from '../controls'

export type KnobLayout = 'group' | 'wrapper' | 'control'

const LAYOUT = {
  group: { wrap: 'knob-group', labelTag: 'label' as const, labelClass: '' },
  wrapper: { wrap: 'knob-wrapper', labelTag: 'span' as const, labelClass: 'knob-label' },
  control: { wrap: 'control', labelTag: 'label' as const, labelClass: '' },
}

type KnobProps = {
  control: Control
  label: string
  layout: KnobLayout
  onChange: (v: number) => void
  knobClass?: string
  wrapClass?: string
  format?: (v: number) => string
}

export function Knob({ control, label, layout, onChange, knobClass = '', wrapClass = '', format }: KnobProps) {
  const [drag, setDrag] = useState<{ startY: number; startT: number; t: number } | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const t = drag ? drag.t : toSlider(control, control.value)
  const value = drag ? fromSlider(control, drag.t) : control.value
  const deg = -135 + Math.max(0, Math.min(1, t)) * 270
  const L = LAYOUT[layout]
  const LabelTag = L.labelTag

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    try { ref.current?.setPointerCapture(e.pointerId) } catch { /* not a live pointer */ }
    setDrag({ startY: e.clientY, startT: toSlider(control, control.value), t: toSlider(control, control.value) })
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const nt = Math.max(0, Math.min(1, drag.startT + (drag.startY - e.clientY) / 150))
    setDrag({ ...drag, t: nt })
    onChange(fromSlider(control, nt))
  }
  const onPointerUp = () => setDrag(null)

  return (
    <div className={`${L.wrap} ${wrapClass}`.trim()}>
      <div
        ref={ref}
        className={`knob ${knobClass}`.trim()}
        role="slider"
        aria-label={label}
        aria-valuemin={control.min}
        aria-valuemax={control.max}
        aria-valuenow={value}
        data-path={control.path}
        style={{ transform: `rotate(${deg}deg)`, ['--rotation' as string]: `${deg}deg`, touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <LabelTag className={L.labelClass || undefined}>{label}</LabelTag>
      <span className="knob-value">{format ? format(value) : formatControl(control, value)}</span>
    </div>
  )
}

/** JT10-style vertical fader (.slider with --value height). */
export function VSlider({ control, label, onChange }: { control: Control; label: string; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const t = toSlider(control, control.value)
  const set = (clientY: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const nt = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height))
    onChange(fromSlider(control, nt))
  }
  return (
    <div className="control">
      <div
        ref={ref}
        className="slider"
        role="slider"
        aria-label={label}
        aria-valuenow={control.value}
        data-path={control.path}
        style={{ ['--value' as string]: `${Math.round(t * 100)}%`, touchAction: 'none' }}
        onPointerDown={(e) => { e.preventDefault(); try { ref.current?.setPointerCapture(e.pointerId) } catch { /* not a live pointer */ }; setDragging(true); set(e.clientY) }}
        onPointerMove={(e) => { if (dragging) set(e.clientY) }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      />
      <label>{label}</label>
      <span className="knob-value">{formatControl(control, control.value)}</span>
    </div>
  )
}

/** Row of option buttons for a choice param (waveform, sub mode, delay mode…). */
export function Choice({ options, value, labels, onPick, className = 'wave-btn', rowClass }: {
  options: (string | number)[]
  value: string | number | undefined
  labels?: Record<string, string>
  onPick: (v: string | number) => void
  className?: string
  rowClass?: string
}) {
  return (
    <div className={rowClass}>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          className={`${className}${String(o) === String(value) ? ' active' : ''}`}
          onClick={() => onPick(o)}
        >
          {labels?.[String(o)] ?? String(o).toUpperCase()}
        </button>
      ))}
    </div>
  )
}
