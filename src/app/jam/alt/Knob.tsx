'use client'

// Rotary knob + vertical slider that render with the original synth-UI
// class names (so each skin's CSS styles them) and write producer-unit
// values through the same onParam path the slider sheet uses.
//
// Drag vertically: 150px = full range, like the originals. The .knob element
// itself is rotated (-135° … +135°); every skin draws its indicator as a
// pseudo-element on it. While a drag is live the wrapper carries
// .jam-dragging and a floating readout shows the value above the thumb;
// a double-tap resets to the descriptor default (when one is known).

import { useRef, useState } from 'react'
import { type Control, toSlider, fromSlider, formatControl } from '../controls'

export type KnobLayout = 'group' | 'wrapper' | 'control'

const LAYOUT = {
  group: { wrap: 'knob-group', labelTag: 'label' as const, labelClass: '' },
  wrapper: { wrap: 'knob-wrapper', labelTag: 'span' as const, labelClass: 'knob-label' },
  control: { wrap: 'control', labelTag: 'label' as const, labelClass: '' },
}

const DOUBLE_TAP_MS = 320
const TAP_SLOP_PX = 6

type KnobProps = {
  control: Control
  label: string
  layout: KnobLayout
  onChange: (v: number) => void
  knobClass?: string
  wrapClass?: string
  format?: (v: number) => string
  /** Descriptor default; enables double-tap reset. */
  defaultValue?: number
}

function clamp01(t: number) { return Math.max(0, Math.min(1, t)) }

export function Knob({ control, label, layout, onChange, knobClass = '', wrapClass = '', format, defaultValue }: KnobProps) {
  const [drag, setDrag] = useState<{ startY: number; startT: number; t: number } | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const lastDown = useRef(0)      // time of the previous pointerdown (double-tap detection)
  const moved = useRef(false)     // did the previous gesture travel?
  const emitted = useRef<number | null>(null)
  const t = drag ? drag.t : toSlider(control, control.value)
  const value = drag ? fromSlider(control, drag.t) : control.value
  const deg = -135 + clamp01(t) * 270
  const L = LAYOUT[layout]
  const LabelTag = L.labelTag
  const text = format ? format(value) : formatControl(control, value)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const now = Date.now()
    const isDoubleTap = now - lastDown.current < DOUBLE_TAP_MS && !moved.current
    lastDown.current = now
    moved.current = false
    if (isDoubleTap && defaultValue !== undefined) {
      lastDown.current = 0
      setDrag(null)
      if (defaultValue !== control.value) onChange(defaultValue)
      return
    }
    try { ref.current?.setPointerCapture(e.pointerId) } catch { /* not a live pointer */ }
    const t0 = toSlider(control, control.value)
    emitted.current = control.value
    setDrag({ startY: e.clientY, startT: t0, t: t0 })
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    if (Math.abs(e.clientY - drag.startY) > TAP_SLOP_PX) moved.current = true
    const nt = clamp01(drag.startT + (drag.startY - e.clientY) / 150)
    setDrag({ ...drag, t: nt })
    const v = fromSlider(control, nt)
    if (v !== emitted.current) { emitted.current = v; onChange(v) }
  }
  const onPointerUp = () => setDrag(null)

  return (
    <div className={`${L.wrap} ${wrapClass}${drag ? ' jam-dragging' : ''}`.trim()}>
      <div
        ref={ref}
        className={`knob ${knobClass}`.trim()}
        role="slider"
        aria-label={label}
        aria-valuemin={control.min}
        aria-valuemax={control.max}
        aria-valuenow={value}
        aria-valuetext={text}
        data-path={control.path}
        style={{ transform: `rotate(${deg}deg)`, ['--rotation' as string]: `${deg}deg`, touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {drag && <span className="jam-knob-float" aria-hidden>{text}</span>}
      <LabelTag className={L.labelClass || undefined}>{label}</LabelTag>
      <span className="knob-value">{text}</span>
    </div>
  )
}

/** JT10-style vertical fader (.slider with --value height). */
export function VSlider({ control, label, onChange, defaultValue }: { control: Control; label: string; onChange: (v: number) => void; defaultValue?: number }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const lastDown = useRef(0)
  const emitted = useRef<number | null>(null)
  const t = toSlider(control, control.value)
  const text = formatControl(control, control.value)
  const set = (clientY: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const nt = clamp01(1 - (clientY - r.top) / r.height)
    const v = fromSlider(control, nt)
    if (v !== emitted.current) { emitted.current = v; onChange(v) }
  }
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const now = Date.now()
    const isDoubleTap = now - lastDown.current < DOUBLE_TAP_MS
    lastDown.current = now
    if (isDoubleTap && defaultValue !== undefined) {
      lastDown.current = 0
      setDragging(false)
      if (defaultValue !== control.value) onChange(defaultValue)
      return
    }
    try { ref.current?.setPointerCapture(e.pointerId) } catch { /* not a live pointer */ }
    emitted.current = null
    setDragging(true)
    set(e.clientY)
  }
  return (
    <div className={`control${dragging ? ' jam-dragging' : ''}`}>
      <div
        ref={ref}
        className="slider"
        role="slider"
        aria-label={label}
        aria-valuemin={control.min}
        aria-valuemax={control.max}
        aria-valuenow={control.value}
        aria-valuetext={text}
        data-path={control.path}
        style={{ ['--value' as string]: `${Math.round(t * 100)}%`, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => { if (dragging) set(e.clientY) }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      />
      {dragging && <span className="jam-knob-float" aria-hidden>{text}</span>}
      <label>{label}</label>
      <span className="knob-value">{text}</span>
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
          aria-pressed={String(o) === String(value)}
          onClick={() => onPick(o)}
        >
          {labels?.[String(o)] ?? String(o).toUpperCase()}
        </button>
      ))}
    </div>
  )
}
