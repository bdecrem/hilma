'use client'

// Synth-panel controls: the markup of each instrument's own web UI
// (kochi.to/jb202, /jt30, /jt10, /jt90, /jb01), minus sequencers and
// transport, bound to the Jam session. Skins come from skins.css (scoped
// copies of the originals); delay/reverb get a small matching skin.

import './skins.css'
import './fx-skin.css'
import type { InstrumentDescription, ParamEntry, SessionDescription, ParamDescriptor } from '../jambot'
import { type Control, toControl } from '../controls'
import { Knob, VSlider, Choice, type KnobLayout } from './Knob'

export type OnParam = (path: string, value: number | string, label: string) => void

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

function K({ inst, sub, label, layout, onParam, knobClass, name }: {
  inst: InstrumentDescription; sub: string; label: string; layout: KnobLayout; onParam: OnParam; knobClass?: string; name: string
}) {
  const c = ctl(find(inst, sub), label)
  if (!c) return null
  return <Knob control={c} label={label} layout={layout} knobClass={knobClass} onChange={(v) => onParam(c.path, v, `${name} ${label}`)} />
}

function LevelKnob({ inst, layout, onParam, label = 'LEVEL', knobClass, name }: {
  inst: InstrumentDescription; layout: KnobLayout; onParam: OnParam; label?: string; knobClass?: string; name: string
}) {
  const c = levelControl(inst)
  return <Knob control={c} label={label} layout={layout} knobClass={knobClass} onChange={(v) => onParam(c.path, v, `${name} level`)} />
}

function ChoiceParam({ inst, sub, labels, onParam, className, rowClass, name, options }: {
  inst: InstrumentDescription; sub: string; labels?: Record<string, string>; onParam: OnParam; className?: string; rowClass?: string; name: string; options?: (string | number)[]
}) {
  const p = find(inst, sub)
  if (!p) return null
  const opts = options || (p.descriptor as ParamDescriptor & { options?: (string | number)[] }).options || p.descriptor.choices || []
  return <Choice options={opts} value={p.value} labels={labels} className={className} rowClass={rowClass} onPick={(v) => onParam(p.path, v, `${name} ${sub}`)} />
}

function title(inst: InstrumentDescription, base: string) {
  return inst.id === inst.type ? base : `${base} · ${inst.id}`
}

// ---- JB202 ----------------------------------------------------------------

function JB202Panel({ inst, onParam }: { inst: InstrumentDescription; onParam: OnParam }) {
  const name = inst.id
  const waves = { sawtooth: 'SAW', square: 'SQR', triangle: 'TRI', sine: 'SIN' }
  return (
    <div className="skin-jb202">
      <div className="synth-panel" style={{ padding: 14 }}>
        <header className="header">
          <div className="logo">
            <span className="logo-text">{title(inst, 'JB202')}</span>
            <span className="logo-sub">MODULAR BASS SYNTH</span>
          </div>
        </header>
        <div className="controls-grid" style={{ marginBottom: 0 }}>
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
      <main className="panel" style={{ padding: 14, margin: 0 }}>
        <div className="header-row"><h1>{title(inst, 'JT-30')}</h1></div>
        <section className="controls" style={{ flexWrap: 'wrap' }}>
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
      <div className="synth-container" style={{ padding: 12 }}>
        <header className="synth-header">
          <div className="logo"><span className="brand">JAMBOT</span><span className="model">{title(inst, 'JT-10')}</span></div>
        </header>
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
                const c = ctl(find(inst, s), s[0].toUpperCase())
                return c ? <VSlider key={s} control={c} label={s[0].toUpperCase()} onChange={(v) => onParam(c.path, v, `${name} ${s}`)} /> : null
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

function JT90Panel({ inst, onParam }: { inst: InstrumentDescription; onParam: OnParam }) {
  const name = inst.id
  const voices = inst.voices.length ? inst.voices : Object.keys(JT90_VOICES)
  return (
    <div className="skin-jt90">
      <main className="panel" style={{ padding: 14, margin: 0 }}>
        <div className="header-row"><h1>{title(inst, 'JT-90')}</h1></div>
        <section className="voice-controls">
          <div className="params-grid">
            <div className="voice-panel">
              <div className="voice-panel-header"><div className="voice-panel-led active" /><span className="voice-panel-name">Master</span></div>
              <div className="knobs-container"><LevelKnob inst={inst} layout="wrapper" label="Level" onParam={onParam} name={name} /></div>
            </div>
            {voices.map((v) => (
              <div key={v} className="voice-panel">
                <div className="voice-panel-header">
                  <div className="voice-panel-led active" />
                  <span className="voice-panel-name">{JT90_VOICES[v] || v}</span>
                </div>
                <div className="knobs-container">
                  {voiceParams(inst, v).map((p) => {
                    const label = p.sub.split('.').pop() || p.sub
                    const c = ctl(p, label)
                    return c ? <Knob key={p.path} control={c} label={label} layout="wrapper" onChange={(x) => onParam(c.path, x, `${name} ${v} ${label}`)} /> : null
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

function JB01Panel({ inst, onParam }: { inst: InstrumentDescription; onParam: OnParam }) {
  const name = inst.id
  const voices = inst.voices.length ? inst.voices : Object.keys(JB01_VOICES)
  return (
    <div className="skin-jb01">
      <div className="drum-machine" style={{ padding: 12 }}>
        <header className="header">
          <div className="logo"><span className="logo-text">{title(inst, 'JB01')}</span><span className="logo-sub">DRUM MACHINE</span></div>
          <div className="knob-group"><LevelKnob inst={inst} layout="group" onParam={onParam} name={name} /></div>
        </header>
        <section className="voices-section">
          <div className="voices-grid">
            {voices.map((v) => (
              <div key={v} className="voice-channel" data-voice={v}>
                <div className="voice-header"><span className="voice-name">{JB01_VOICES[v] || v.toUpperCase()}</span></div>
                <div className="voice-knobs">
                  {voiceParams(inst, v).map((p) => {
                    const label = (p.sub.split('.').pop() || p.sub).toUpperCase()
                    const c = ctl(p, label)
                    return c ? <Knob key={p.path} control={c} label={label} layout="group" onChange={(x) => onParam(c.path, x, `${name} ${v} ${label}`)} /> : null
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

// ---- Effects (delay / reverb) ---------------------------------------------

const FX_LABELS: Record<string, string> = {
  time: 'TIME', feedback: 'FDBK', mix: 'MIX', lowcut: 'LO CUT', highcut: 'HI CUT', saturation: 'SAT', spread: 'SPREAD',
  decay: 'DECAY', damping: 'DAMP', predelay: 'PRE', size: 'SIZE', cutoff: 'CUTOFF', resonance: 'RESO', amount: 'AMOUNT',
  attack: 'ATTACK', release: 'RELEASE', threshold: 'THRESH',
}
// Character first, mix last (like the hardware: time/feedback or decay/damp, then wet/dry).
const FX_ORDER = ['time', 'feedback', 'decay', 'damping', 'predelay', 'size', 'lowcut', 'highcut', 'saturation', 'spread', 'cutoff', 'resonance', 'amount', 'attack', 'release', 'threshold', 'mix']

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
        <div className="fx-header">
          <span className="logo-text">{type.toUpperCase()}</span>
          <span className="logo-sub">ON {target.toUpperCase()}</span>
        </div>
        <div className="fx-sections">
          <section className="control-section">
            {choices.map(([k, d]) => {
              const opts = (d as ParamDescriptor & { options?: (string | number)[] }).options || d.choices || []
              return <Choice key={k} options={opts} value={params[k] as string} rowClass="wave-toggle" onPick={(v) => onParam(`${base}.${k}`, v, `${name} ${k}`)} />
            })}
            <div className="knob-row">
              {knobs.map(([k, d]) => {
                const v = params[k]
                const c = typeof v === 'number' ? toControl(`${base}.${k}`, FX_LABELS[k] || k.toUpperCase(), v, d) : null
                return c ? <Knob key={k} control={c} label={FX_LABELS[k] || k.toUpperCase()} layout="group" knobClass={k === 'mix' ? 'knob-large' : ''} onChange={(x) => onParam(c.path, x, `${name} ${k}`)} /> : null
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ---- All panels for a session ---------------------------------------------

const PANELS: Record<string, (p: { inst: InstrumentDescription; onParam: OnParam }) => React.ReactElement | null> = {
  jb202: JB202Panel, jt30: JT30Panel, jt10: JT10Panel, jt90: JT90Panel, jb01: JB01Panel,
}

export default function AltPanels({ desc, onParam }: { desc: SessionDescription | null; onParam: OnParam }) {
  if (!desc) return null
  const active = desc.instruments.filter((i) => i.active && PANELS[i.type || i.id])
  const fx = desc.effects.flatMap((e) => e.chain.filter((c) => c.descriptors && Object.keys(c.descriptors).length).map((c) => ({ ...c, target: e.target })))
  if (!active.length && !fx.length) {
    return <p className="mt-8 text-center text-sm text-white/40">Nothing to tweak yet. Ask for a beat first.</p>
  }
  return (
    <div className="jam-panels mt-4">
      {active.map((inst) => {
        const Panel = PANELS[inst.type || inst.id]
        return <Panel key={inst.id} inst={inst} onParam={onParam} />
      })}
      {fx.map((e) => (
        <EffectPanel key={`${e.target}.${e.id}`} target={e.target} id={e.id} type={e.type} params={e.params || {}} descriptors={e.descriptors || {}} onParam={onParam} />
      ))}
    </div>
  )
}
