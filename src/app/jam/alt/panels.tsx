'use client'

// Synth-panel controls: the markup of each instrument's own web UI
// (kochi.to/jb202, /jt30, /jt10, /jt90, /jb01), minus sequencers and
// transport, bound to the Jam session. Skins come from skins.css (scoped
// copies of the originals); delay/reverb get a small matching skin.
//
// Every panel sits in an accordion (one open at a time, remembered per
// device). panels-mobile.css re-flows the originals for a phone-width sheet
// when the root is narrower than 700px (.jam-panels--narrow, measured with a
// ResizeObserver) and constrains the original grids when it is wider.

import './skins.css'
import './fx-skin.css'
import './panels-mobile.css'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { InstrumentDescription, ParamEntry, SessionDescription, ParamDescriptor } from '../jambot'
import { type Control, toControl, formatControl } from '../controls'
import { Knob, VSlider, Choice, type KnobLayout } from './Knob'
import type { Hits } from '../seq/model'
import MuteSolo, { isSilenced, type OnMix } from '../MuteSolo'

export type OnParam = (path: string, value: number | string, label: string) => void

const OPEN_KEY = 'jam:panelsOpen'
const NARROW_MAX = 700

// ---- helpers --------------------------------------------------------------

function find(inst: InstrumentDescription, sub: string): ParamEntry | undefined {
  return inst.params.find((p) => p.sub === sub || p.sub.endsWith('.' + sub))
}

function levelControl(inst: InstrumentDescription): Control {
  return { path: `${inst.id}.level`, label: 'level', min: -24, max: 6, step: 0.5, unit: 'dB', scale: 'lin', value: inst.level }
}

function ctl(p: ParamEntry | undefined, label: string): Control | null {
  if (!p || typeof p.value !== 'number') return null
  return toControl(p.path, label, p.value, p.descriptor)
}

function dflt(d: ParamDescriptor | undefined): number | undefined {
  return typeof d?.default === 'number' ? d.default : undefined
}

function fmt(inst: InstrumentDescription, sub: string): string | null {
  const c = ctl(find(inst, sub), sub)
  return c ? formatControl(c, c.value) : null
}

function K({ inst, sub, label, layout, onParam, knobClass, name }: {
  inst: InstrumentDescription; sub: string; label: string; layout: KnobLayout; onParam: OnParam; knobClass?: string; name: string
}) {
  const p = find(inst, sub)
  const c = ctl(p, label)
  if (!c) return null
  return <Knob control={c} label={label} layout={layout} knobClass={knobClass} defaultValue={dflt(p?.descriptor)} onChange={(v) => onParam(c.path, v, `${name} ${label}`)} />
}

function LevelKnob({ inst, layout, onParam, label = 'LEVEL', knobClass, name }: {
  inst: InstrumentDescription; layout: KnobLayout; onParam: OnParam; label?: string; knobClass?: string; name: string
}) {
  const c = levelControl(inst)
  return <Knob control={c} label={label} layout={layout} knobClass={knobClass} defaultValue={0} onChange={(v) => onParam(c.path, v, `${name} level`)} />
}

function ChoiceParam({ inst, sub, labels, onParam, className, rowClass, name, options }: {
  inst: InstrumentDescription; sub: string; labels?: Record<string, string>; onParam: OnParam; className?: string; rowClass?: string; name: string; options?: (string | number)[]
}) {
  const p = find(inst, sub)
  if (!p) return null
  const opts = options || (p.descriptor as ParamDescriptor & { options?: (string | number)[] }).options || p.descriptor.choices || []
  return <Choice options={opts} value={p.value} labels={labels} className={className} rowClass={rowClass} onPick={(v) => onParam(p.path, v, `${name} ${sub}`)} />
}

/** Compact header readout: "5 voices · +1 dB" / "cutoff 420 Hz · reso 28". */
function instrumentSummary(inst: InstrumentDescription): string {
  const level = formatControl(levelControl(inst), inst.level)
  if (inst.voices.length) return `${inst.voices.length} voice${inst.voices.length === 1 ? '' : 's'} · ${level}`
  const pick = (subs: string[], label: string) => {
    for (const s of subs) { const v = fmt(inst, s); if (v) return `${label} ${v}` }
    return null
  }
  const parts = [pick(['filterCutoff', 'cutoff'], 'cutoff'), pick(['filterResonance', 'resonance'], 'reso')].filter(Boolean)
  return parts.length ? parts.join(' · ') : level
}

function effectSummary(type: string, params: Record<string, unknown>, descriptors: Record<string, ParamDescriptor>): string {
  const f = (k: string) => {
    const d = descriptors[k]; const v = params[k]
    if (!d || v === undefined || v === null) return null
    if (d.unit === 'choice' || typeof v !== 'number') return String(v)
    const c = toControl(k, k, v, d)
    return c ? formatControl(c, v) : String(v)
  }
  const parts: string[] = []
  if (type === 'delay') {
    const sync = params.sync
    parts.push(sync && sync !== 'off' ? String(sync) : `time ${f('time')}`)
  } else if (type === 'reverb') {
    parts.push(`decay ${f('decay')}`)
  } else {
    const first = Object.keys(descriptors).find((k) => k !== 'mix' && descriptors[k].unit !== 'choice')
    if (first) parts.push(`${first} ${f(first)}`)
  }
  const mix = f('mix')
  if (mix) parts.push(`mix ${mix}`)
  return parts.join(' · ')
}

// ---- JB202 ----------------------------------------------------------------

function JB202Panel({ inst, onParam }: { inst: InstrumentDescription; onParam: OnParam }) {
  const name = inst.id
  const waves = { sawtooth: 'SAW', square: 'SQR', triangle: 'TRI', sine: 'SIN' }
  return (
    <div className="skin-jb202">
      <div className="synth-panel">
        <div className="controls-grid">
          {(['osc1', 'osc2'] as const).map((osc) => (
            <section key={osc} className="control-section osc-section">
              <h3>{osc === 'osc1' ? 'OSC 1' : 'OSC 2'}</h3>
              <ChoiceParam inst={inst} sub={`${osc}Waveform`} labels={waves} onParam={onParam} rowClass="wave-toggle" name={name} />
              <div className="knob-row">
                <K inst={inst} sub={`${osc}Octave`} label="OCT" layout="group" onParam={onParam} name={name} />
                <K inst={inst} sub={`${osc}Detune`} label="DETUNE" layout="group" onParam={onParam} name={name} />
                <K inst={inst} sub={`${osc}Level`} label="LEVEL" layout="group" onParam={onParam} name={name} />
              </div>
            </section>
          ))}
          <section className="control-section filter-section">
            <h3>FILTER</h3>
            <div className="knob-row">
              <K inst={inst} sub="filterCutoff" label="CUTOFF" layout="group" knobClass="knob-large" onParam={onParam} name={name} />
              <K inst={inst} sub="filterResonance" label="RESO" layout="group" knobClass="knob-large" onParam={onParam} name={name} />
              <K inst={inst} sub="filterEnvAmount" label="ENV" layout="group" onParam={onParam} name={name} />
            </div>
          </section>
          <section className="control-section env-section">
            <h3>FILTER ENV</h3>
            <div className="knob-row">
              <K inst={inst} sub="filterAttack" label="A" layout="group" knobClass="knob-small" onParam={onParam} name={name} />
              <K inst={inst} sub="filterDecay" label="D" layout="group" knobClass="knob-small" onParam={onParam} name={name} />
              <K inst={inst} sub="filterSustain" label="S" layout="group" knobClass="knob-small" onParam={onParam} name={name} />
              <K inst={inst} sub="filterRelease" label="R" layout="group" knobClass="knob-small" onParam={onParam} name={name} />
            </div>
          </section>
          <section className="control-section env-section">
            <h3>AMP ENV</h3>
            <div className="knob-row">
              <K inst={inst} sub="ampAttack" label="A" layout="group" knobClass="knob-small" onParam={onParam} name={name} />
              <K inst={inst} sub="ampDecay" label="D" layout="group" knobClass="knob-small" onParam={onParam} name={name} />
              <K inst={inst} sub="ampSustain" label="S" layout="group" knobClass="knob-small" onParam={onParam} name={name} />
              <K inst={inst} sub="ampRelease" label="R" layout="group" knobClass="knob-small" onParam={onParam} name={name} />
            </div>
          </section>
          <section className="control-section output-section">
            <h3>OUTPUT</h3>
            <div className="knob-row">
              <K inst={inst} sub="drive" label="DRIVE" layout="group" onParam={onParam} name={name} />
              <LevelKnob inst={inst} layout="group" onParam={onParam} name={name} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ---- JT30 -----------------------------------------------------------------

function JT30Panel({ inst, onParam }: { inst: InstrumentDescription; onParam: OnParam }) {
  const name = inst.id
  return (
    <div className="skin-jt30">
      <main className="panel">
        <section className="controls">
          <ChoiceParam inst={inst} sub="waveform" labels={{ sawtooth: 'SAW', square: 'SQR' }} onParam={onParam} rowClass="waveform-toggle" name={name} />
          <div className="controls-divider" />
          <div className="knob-group">
            <K inst={inst} sub="cutoff" label="Cutoff" layout="wrapper" onParam={onParam} name={name} />
            <K inst={inst} sub="resonance" label="Reso" layout="wrapper" onParam={onParam} name={name} />
            <K inst={inst} sub="envMod" label="Env Mod" layout="wrapper" onParam={onParam} name={name} />
            <K inst={inst} sub="decay" label="Decay" layout="wrapper" onParam={onParam} name={name} />
            <K inst={inst} sub="accent" label="Accent" layout="wrapper" onParam={onParam} name={name} />
            <K inst={inst} sub="drive" label="Drive" layout="wrapper" onParam={onParam} name={name} />
            <LevelKnob inst={inst} layout="wrapper" label="Level" onParam={onParam} name={name} />
          </div>
        </section>
      </main>
    </div>
  )
}

// ---- JT10 -----------------------------------------------------------------

function JT10Panel({ inst, onParam }: { inst: InstrumentDescription; onParam: OnParam }) {
  const name = inst.id
  return (
    <div className="skin-jt10">
      <div className="synth-container">
        <main className="control-panel">
          <section className="section vco-section">
            <h3>VCO</h3>
            <div className="controls-row">
              <K inst={inst} sub="sawLevel" label="SAW" layout="control" onParam={onParam} name={name} />
              <K inst={inst} sub="pulseLevel" label="PULSE" layout="control" onParam={onParam} name={name} />
              <K inst={inst} sub="pulseWidth" label="PW" layout="control" onParam={onParam} name={name} />
            </div>
          </section>
          <section className="section sub-section">
            <h3>SUB</h3>
            <div className="controls-row">
              <K inst={inst} sub="subLevel" label="LEVEL" layout="control" onParam={onParam} name={name} />
            </div>
            <div className="sub-mode-switch">
              <span className="mode-label">MODE</span>
              <ChoiceParam inst={inst} sub="subMode" labels={{ '0': 'OFF', '1': '-1', '2': '-2' }} className="mode-btn" rowClass="mode-buttons" onParam={onParam} name={name} />
            </div>
          </section>
          <section className="section filter-section">
            <h3>VCF</h3>
            <div className="controls-row">
              <K inst={inst} sub="cutoff" label="FREQ" layout="control" onParam={onParam} name={name} />
              <K inst={inst} sub="resonance" label="RES" layout="control" onParam={onParam} name={name} />
              <K inst={inst} sub="envMod" label="ENV" layout="control" onParam={onParam} name={name} />
            </div>
          </section>
          <section className="section env-section">
            <h3>ENV</h3>
            <div className="controls-row">
              {(['attack', 'decay', 'sustain', 'release'] as const).map((s) => {
                const p = find(inst, s)
                const c = ctl(p, s[0].toUpperCase())
                return c ? <VSlider key={s} control={c} label={s[0].toUpperCase()} defaultValue={dflt(p?.descriptor)} onChange={(v) => onParam(c.path, v, `${name} ${s}`)} /> : null
              })}
            </div>
          </section>
          <section className="section lfo-section">
            <h3>LFO</h3>
            <div className="controls-row">
              <K inst={inst} sub="lfoRate" label="RATE" layout="control" onParam={onParam} name={name} />
            </div>
            <ChoiceParam inst={inst} sub="lfoWaveform" labels={{ triangle: 'tri', square: 'sq', sh: 'S/H', sine: 'sin', ramp: 'ramp', sample: 'S/H' }} rowClass="lfo-waveform" onParam={onParam} name={name} />
            <div className="lfo-destinations">
              <K inst={inst} sub="lfoToPitch" label="PITCH" layout="control" knobClass="small" onParam={onParam} name={name} />
              <K inst={inst} sub="lfoToFilter" label="VCF" layout="control" knobClass="small" onParam={onParam} name={name} />
              <K inst={inst} sub="lfoToPW" label="PW" layout="control" knobClass="small" onParam={onParam} name={name} />
            </div>
          </section>
          <section className="section volume-section">
            <h3>VCA</h3>
            <div className="controls-row">
              <LevelKnob inst={inst} layout="control" label="VOL" onParam={onParam} name={name} />
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

// ---- JT90 -----------------------------------------------------------------

const JT90_VOICES: Record<string, string> = {
  kick: 'Bass Drum', snare: 'Snare', clap: 'Clap', rimshot: 'Rim Shot', lowtom: 'Low Tom', midtom: 'Mid Tom',
  hitom: 'High Tom', ch: 'Closed Hat', oh: 'Open Hat', crash: 'Crash', ride: 'Ride',
}

function voiceParams(inst: InstrumentDescription, voice: string) {
  return inst.params.filter((p) => p.sub.startsWith(voice + '.') && p.descriptor.unit !== 'choice' && typeof p.value === 'number')
}

function JT90Panel({ inst, onParam, hitVoices = [] }: { inst: InstrumentDescription; onParam: OnParam; hitVoices?: string[] }) {
  const name = inst.id
  const voices = inst.voices.length ? inst.voices : Object.keys(JT90_VOICES)
  return (
    <div className="skin-jt90">
      <main className="panel">
        <section className="voice-controls">
          <div className="params-grid">
            <div className="voice-panel jam-master">
              <div className="voice-panel-header"><div className="voice-panel-led active" /><span className="voice-panel-name">Master</span></div>
              <div className="knobs-container"><LevelKnob inst={inst} layout="wrapper" label="Level" onParam={onParam} name={name} /></div>
            </div>
            {voices.map((v) => (
              <div key={v} className="voice-panel">
                <div className="voice-panel-header">
                  <div className={`voice-panel-led active${hitVoices.includes(v) ? ' hit' : ''}`} />
                  <span className="voice-panel-name">{JT90_VOICES[v] || v}</span>
                </div>
                <div className="knobs-container">
                  {voiceParams(inst, v).map((p) => {
                    const label = p.sub.split('.').pop() || p.sub
                    const c = ctl(p, label)
                    return c ? <Knob key={p.path} control={c} label={label} layout="wrapper" defaultValue={dflt(p.descriptor)} onChange={(x) => onParam(c.path, x, `${name} ${v} ${label}`)} /> : null
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

// ---- JB01 -----------------------------------------------------------------

const JB01_VOICES: Record<string, string> = {
  kick: 'KICK', snare: 'SNARE', clap: 'CLAP', ch: 'C.HAT', oh: 'O.HAT', lowtom: 'L.TOM', hitom: 'H.TOM', cymbal: 'CYMBAL',
}

function JB01Panel({ inst, onParam, hitVoices = [] }: { inst: InstrumentDescription; onParam: OnParam; hitVoices?: string[] }) {
  const name = inst.id
  const voices = inst.voices.length ? inst.voices : Object.keys(JB01_VOICES)
  return (
    <div className="skin-jb01">
      <div className="drum-machine">
        <section className="voices-section">
          <div className="voices-grid">
            <div className="voice-channel jam-master" data-voice="master">
              <div className="voice-header"><span className="voice-name">MASTER</span></div>
              <div className="voice-knobs"><LevelKnob inst={inst} layout="group" onParam={onParam} name={name} /></div>
            </div>
            {voices.map((v) => (
              <div key={v} className="voice-channel" data-voice={v}>
                <div className="voice-header"><span className={`jam-voice-led${hitVoices.includes(v) ? ' hit' : ''}`} aria-hidden /><span className="voice-name">{JB01_VOICES[v] || v.toUpperCase()}</span></div>
                <div className="voice-knobs">
                  {voiceParams(inst, v).map((p) => {
                    const label = (p.sub.split('.').pop() || p.sub).toUpperCase()
                    const c = ctl(p, label)
                    return c ? <Knob key={p.path} control={c} label={label} layout="group" defaultValue={dflt(p.descriptor)} onChange={(x) => onParam(c.path, x, `${name} ${v} ${label}`)} /> : null
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ---- Effects (delay / reverb / sidechain …) ---------------------------------

const FX_LABELS: Record<string, string> = {
  time: 'TIME', feedback: 'FDBK', mix: 'MIX', lowcut: 'LO CUT', highcut: 'HI CUT', saturation: 'SAT', spread: 'SPREAD',
  decay: 'DECAY', damping: 'DAMP', predelay: 'PRE', size: 'SIZE', width: 'WIDTH', cutoff: 'CUTOFF', resonance: 'RESO', amount: 'AMOUNT',
  attack: 'ATTACK', release: 'RELEASE', hold: 'HOLD', threshold: 'THRESH',
}
// Character first, mix last (like the hardware: time/feedback or decay/damp, then wet/dry).
const FX_ORDER = ['time', 'feedback', 'decay', 'damping', 'predelay', 'size', 'width', 'lowcut', 'highcut', 'saturation', 'spread', 'cutoff', 'resonance', 'amount', 'attack', 'hold', 'release', 'threshold', 'mix']

function EffectPanel({ target, id, type, params, descriptors, onParam }: {
  target: string; id: string; type: string; params: Record<string, unknown>; descriptors: Record<string, ParamDescriptor>; onParam: OnParam
}) {
  const base = `fx.${target}.${id}`
  const entries = Object.entries(descriptors)
    .sort((a, b) => (FX_ORDER.indexOf(a[0]) === -1 ? 99 : FX_ORDER.indexOf(a[0])) - (FX_ORDER.indexOf(b[0]) === -1 ? 99 : FX_ORDER.indexOf(b[0])))
  const choices = entries.filter(([, d]) => d.unit === 'choice')
  const knobs = entries.filter(([, d]) => d.unit !== 'choice')
  const name = `${type} on ${target}`
  return (
    <div className="skin-fx">
      <div className="fx-panel">
        <div className="fx-sections">
          <section className="control-section">
            {choices.map(([k, d]) => {
              const opts = (d as ParamDescriptor & { options?: (string | number)[] }).options || d.choices || []
              return (
                <div key={k} className={`fx-choice${opts.length > 4 ? ' fx-choice--many' : ''}`}>
                  <span className="fx-choice-label">{FX_LABELS[k] || k.toUpperCase()}</span>
                  <Choice options={opts} value={params[k] as string} rowClass="wave-toggle" onPick={(v) => onParam(`${base}.${k}`, v, `${name} ${k}`)} />
                </div>
              )
            })}
            <div className="knob-row">
              {knobs.map(([k, d]) => {
                const v = params[k]
                const c = typeof v === 'number' ? toControl(`${base}.${k}`, FX_LABELS[k] || k.toUpperCase(), v, d) : null
                return c ? <Knob key={k} control={c} label={FX_LABELS[k] || k.toUpperCase()} layout="group" knobClass={k === 'mix' ? 'knob-large' : ''} defaultValue={dflt(d)} onChange={(x) => onParam(c.path, x, `${name} ${k}`)} /> : null
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ---- Accordion ------------------------------------------------------------

const PANELS: Record<string, (p: { inst: InstrumentDescription; onParam: OnParam; hitVoices?: string[] }) => React.ReactElement | null> = {
  jb202: JB202Panel, jt30: JT30Panel, jt10: JT10Panel, jt90: JT90Panel, jb01: JB01Panel,
}
const DISPLAY: Record<string, string> = { jb202: 'JB202', jt30: 'JT-30', jt10: 'JT-10', jt90: 'JT-90', jb01: 'JB01' }

type PanelItem = { id: string; skin: string; name: string; sub?: string; summary: string; body: React.ReactElement; instrument?: boolean }

/** Header LED: an instrument lights on any of its hits; an effect lights with its target
 *  (a voice target like jt90.oh only when that voice hits). */
function isHit(id: string, hits: Hits): boolean {
  if (!id.startsWith('fx.')) return (hits[id]?.length ?? 0) > 0
  const target = id.slice(3, id.lastIndexOf('.'))
  const [inst, voice] = target.split('.')
  const h = hits[inst]
  if (!h?.length) return false
  return voice ? h.includes(voice) : true
}

function PanelShell({ item, open, userOpened, hit, silenced, mix, onToggle }: { item: PanelItem; open: boolean; userOpened: boolean; hit: boolean; silenced: boolean; mix: React.ReactNode; onToggle: () => void }) {
  const bodyId = `jam-panel-${item.id.replace(/[^a-z0-9-]/gi, '-')}`
  const ref = useRef<HTMLElement | null>(null)
  // A panel the user just opened comes into view (the one above it may have collapsed).
  useEffect(() => {
    if (open && userOpened) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [open, userOpened])
  return (
    <section ref={ref} className={`jam-panel${open ? ' is-open' : ''}${silenced ? ' is-silenced' : ''}`} data-skin={item.skin} data-panel={item.id}>
      {/* The M/S keys sit beside the head button (buttons can't nest), sharing its bar. */}
      <div className="jam-panel-bar">
        <button type="button" className="jam-panel-head" aria-expanded={open} aria-controls={open ? bodyId : undefined} onClick={onToggle}>
          <span className={`jam-panel-led${hit ? ' hit' : ''}`} aria-hidden />
          <span className="jam-panel-name">{item.name}{item.sub && <small>{item.sub}</small>}</span>
          <span className="jam-panel-sum">{item.summary}</span>
          <span className="jam-panel-chev" aria-hidden />
        </button>
        {mix}
      </div>
      {open && <div className="jam-panel-body" id={bodyId}>{item.body}</div>}
    </section>
  )
}

export default function AltPanels({ desc, onParam, hits = {}, onMix }: { desc: SessionDescription | null; onParam: OnParam; hits?: Hits; onMix?: OnMix }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [narrow, setNarrow] = useState(true)          // phone-first default until measured
  const [picked, setPicked] = useState<string | null>(null)   // user's choice this mount ('' = all closed)
  const [stored, setStored] = useState<string | null>(null)   // remembered per device

  useLayoutEffect(() => {
    try { setStored(localStorage.getItem(OPEN_KEY)) } catch { /* no storage */ }
    const el = rootRef.current
    if (!el) return
    const measure = () => setNarrow(el.getBoundingClientRect().width < NARROW_MAX)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const items: PanelItem[] = []
  if (desc) {
    for (const inst of desc.instruments) {
      const type = inst.type || inst.id
      const Panel = PANELS[type]
      if (!inst.active || !Panel) continue
      items.push({
        id: inst.id, skin: type, name: DISPLAY[type] || type.toUpperCase(), sub: inst.id === type ? undefined : inst.id,
        summary: instrumentSummary(inst), body: <Panel inst={inst} onParam={onParam} hitVoices={hits[inst.id] || []} />, instrument: true,
      })
    }
    for (const e of desc.effects) {
      for (const c of e.chain) {
        if (!c.descriptors || !Object.keys(c.descriptors).length) continue
        const id = `fx.${e.target}.${c.id}`
        items.push({
          id, skin: 'fx', name: c.type.toUpperCase(), sub: `on ${e.target}`,
          summary: effectSummary(c.type, c.params || {}, c.descriptors),
          body: <EffectPanel target={e.target} id={c.id} type={c.type} params={c.params || {}} descriptors={c.descriptors} onParam={onParam} />,
        })
      }
    }
  }
  const ids = items.map((i) => i.id)
  let open: string | null
  if (picked === '') open = null
  else if (picked && ids.includes(picked)) open = picked
  else if (stored && ids.includes(stored)) open = stored
  else open = ids[0] ?? null

  const toggle = (id: string) => {
    const next = open === id ? '' : id
    setPicked(next)
    if (next) { try { localStorage.setItem(OPEN_KEY, next) } catch { /* no storage */ } }
  }

  return (
    <div ref={rootRef} className={`jam-panels mt-4${narrow ? ' jam-panels--narrow' : ''}`}>
      {items.length === 0 && <p className="jb-body jb-muted mt-4 text-center">Nothing to tweak yet. Ask for a beat first.</p>}
      {items.map((item) => (
        <PanelShell
          key={item.id}
          item={item}
          open={open === item.id}
          userOpened={picked === item.id}
          hit={isHit(item.id, hits)}
          silenced={!!item.instrument && isSilenced(item.id, desc?.tracks, desc?.anySolo)}
          mix={item.instrument && onMix ? <MuteSolo id={item.id} tracks={desc?.tracks} anySolo={desc?.anySolo} onMix={onMix} tone="panel" /> : null}
          onToggle={() => toggle(item.id)}
        />
      ))}
    </div>
  )
}
