// Control model for the sliders sheet: picks the parameters worth a slider
// out of describeSession() and gives each a range/scale/step.
//
// Everything here is driven by the descriptors Jambot exposes, so a new
// instrument shows up with no changes as long as its param names match the
// KEY_PARAMS vocabulary below.

import type { ParamDescriptor, SessionDescription } from './jambot'

export type Control = {
  path: string
  label: string
  min: number
  max: number
  step: number
  unit: string
  scale: 'lin' | 'log'
  value: number
}

export type ControlGroup = {
  id: string
  title: string
  subtitle?: string
  controls: Control[]
}

const INSTRUMENT_NAMES: Record<string, string> = {
  jb01: 'JB01 drums',
  jt90: 'JT90 drums',
  jb202: 'JB202 bass',
  jt30: 'JT30 acid',
  jt10: 'JT10 lead',
  jp9000: 'JP9000 modular',
  jbs: 'Sampler',
}

// Per-voice params for drum machines, in display order.
const VOICE_PARAMS = ['level', 'decay', 'tune', 'tone', 'snappy', 'attack', 'sweep']

// Mono synth / effect params, in priority order (first match wins the slot).
const KEY_PARAMS = [
  'cutoff', 'filtercutoff', 'frequency',
  'resonance', 'filterresonance',
  'envmod', 'filterenvamount', 'envamount',
  'decay', 'ampdecay', 'filterdecay',
  'drive', 'accent', 'sublevel',
  'lforate', 'lfoamount', 'lfotofilter',
  'osc2octave', 'osc2detune', 'detune',
  'mix', 'feedback', 'time', 'damping', 'predelay', 'amount', 'threshold',
  'level',
]

const MAX_PER_GROUP = 10

function rankKey(name: string) {
  const i = KEY_PARAMS.indexOf(name.toLowerCase())
  return i === -1 ? 999 : i
}

function toControl(path: string, label: string, value: number, d: ParamDescriptor): Control | null {
  if (typeof value !== 'number' || !isFinite(value)) return null
  if (d.unit === 'choice' || !isFinite(d.min) || !isFinite(d.max) || d.max <= d.min) return null
  const unit = d.unit || ''
  const log = unit === 'Hz' && d.min > 0 && d.max / d.min >= 20
  const step = unit === 'dB' ? 0.5 : unit === 'Hz' ? 1 : unit === 'semitones' ? 1 : unit === 'ms' ? 1 : 1
  return { path, label, min: d.min, max: d.max, step, unit, scale: log ? 'log' : 'lin', value }
}

export function buildControlGroups(desc: SessionDescription): ControlGroup[] {
  const groups: ControlGroup[] = []

  for (const inst of desc.instruments) {
    if (!inst.active) continue
    const controls: Control[] = []
    const byPath = new Map(inst.params.map((p) => [p.sub, p]))

    // Instrument output level always leads.
    controls.push({
      path: `${inst.id}.level`, label: 'level', min: -24, max: 6, step: 0.5, unit: 'dB', scale: 'lin', value: inst.level,
    })

    if (inst.voices.length > 0) {
      // Drum machine: up to four params per active voice
      for (const voice of inst.voices) {
        let n = 0
        for (const name of VOICE_PARAMS) {
          const p = byPath.get(`${voice}.${name}`)
          if (!p) continue
          const c = toControl(p.path, `${voice} ${name}`, p.value as number, p.descriptor)
          if (c) { controls.push(c); n++ }
          if (n >= 4) break
        }
      }
    } else {
      // Mono synth: ranked key params (paths may be 'filterCutoff' or 'bass.cutoff')
      const ranked = inst.params
        .filter((p) => !p.sub.endsWith('.level') && p.sub !== 'level')
        .map((p) => ({ p, rank: rankKey(p.sub.split('.').pop() || p.sub) }))
        .filter((x) => x.rank < 999)
        .sort((a, b) => a.rank - b.rank)
      for (const { p } of ranked) {
        const c = toControl(p.path, p.sub.split('.').pop() || p.sub, p.value as number, p.descriptor)
        if (c) controls.push(c)
        if (controls.length >= MAX_PER_GROUP) break
      }
    }

    groups.push({
      id: inst.id,
      title: INSTRUMENT_NAMES[inst.id] || inst.id,
      subtitle: inst.voices.length ? inst.voices.join(' · ') : undefined,
      controls,
    })
  }

  for (const fx of desc.effects) {
    for (const e of fx.chain) {
      if (!e.descriptors) continue
      const controls: Control[] = []
      const entries = Object.entries(e.descriptors)
        .map(([name, d]) => ({ name, d, rank: rankKey(name) }))
        .filter((x) => x.rank < 999)
        .sort((a, b) => a.rank - b.rank)
      for (const { name, d } of entries) {
        const v = e.params?.[name]
        const c = toControl(`fx.${fx.target}.${e.id}.${name}`, name, v as number, d)
        if (c) controls.push(c)
        if (controls.length >= 6) break
      }
      if (controls.length) {
        groups.push({ id: `fx.${fx.target}.${e.id}`, title: `${e.type} on ${fx.target}`, controls })
      }
    }
  }

  return groups
}

// Slider position (0..1) <-> value, honouring log scale.
export function toSlider(c: Control, value: number) {
  if (c.scale === 'log') return Math.log(value / c.min) / Math.log(c.max / c.min)
  return (value - c.min) / (c.max - c.min)
}

export function fromSlider(c: Control, t: number) {
  const v = c.scale === 'log' ? c.min * Math.pow(c.max / c.min, t) : c.min + t * (c.max - c.min)
  const snapped = Math.round(v / c.step) * c.step
  return Math.max(c.min, Math.min(c.max, +snapped.toFixed(3)))
}

export function formatControl(c: Control, value: number) {
  switch (c.unit) {
    case 'dB': return `${value > 0 ? '+' : ''}${value.toFixed(1).replace(/\.0$/, '')} dB`
    case 'Hz': return value >= 1000 ? `${(value / 1000).toFixed(2).replace(/\.?0+$/, '')} kHz` : `${Math.round(value)} Hz`
    case 'semitones': return `${value > 0 ? '+' : ''}${Math.round(value)} st`
    case 'ms': return `${Math.round(value)} ms`
    case 'cents': return `${value > 0 ? '+' : ''}${Math.round(value)} c`
    default: return `${Math.round(value)}`
  }
}
