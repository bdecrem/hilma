// Engine host bridge — Swift ⇄ Jambot (jambot-web.js) inside a hidden WKWebView.
//
// Owns ONE session. Swift calls in with
//
//   window.bridge.call(id, name, argsJSON)
//
// and every call answers exactly once through
//
//   window.webkit.messageHandlers.engine.postMessage({ id, ok, result | error, code? })
//
// Long calls stream extra messages first, all carrying the same `id` plus an
// `event` field:
//
//   { event: 'chunk', group, index, data }        base64 planar Int16 PCM, ≤ 1 MB each
//   { event: 'render', group, chunkCount, ... }   a render the agent produced (meta; PCM in the chunks)
//   { event: 'tool' | 'toolResult' | 'text' }     agent progress
//   { event: 'llm', llmId, request }              the agent needs one Messages API call —
//                                                 Swift POSTs /api/jam/llm with the cookie and
//                                                 answers with bridge.resolveLlm(llmId, json)
//   { event: 'log', level, text }                 console output, for os_log
//
// Call table (DESIGN.md "Engine host bridge" + "Bridge additions"): ready,
// loadSession, serialize, describe, controls, tweak, setTrack, mix, render,
// agent, agentMessages, hits, seq, pattern.
//
// Three blocks below are hand-ported from the web app and must be kept in
// step with their TypeScript originals:
//   buildControlGroups         ← src/app/jam/controls.ts
//   writeThroughSavedPatterns  ← src/app/jam/Studio.tsx
//   writeThroughSavedInserts   ← src/app/jam/Studio.tsx
//   sanitizeHistory            ← src/app/jam/history.ts
//   sequencer block            ← src/app/jam/seq/model.ts (+ Sequencer.tsx commit)
//
// This file never touches the network. The web view has no cookie and no
// backend URL; everything HTTP happens in Swift.

;(() => {
  'use strict'

  // ---- plumbing --------------------------------------------------------------

  const nativeConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }

  function post(msg) {
    try {
      window.webkit.messageHandlers.engine.postMessage(msg)
    } catch (e) {
      nativeConsole.error('[bridge] postMessage failed', e)
    }
  }

  // Console → os_log on the Swift side. Errors thrown inside the engine show
  // up in `log stream --predicate 'subsystem == "com.bartdecrem.Jambot"'`.
  for (const level of ['log', 'warn', 'error']) {
    console[level] = (...args) => {
      nativeConsole[level](...args)
      post({ event: 'log', level, text: args.map((a) => (a instanceof Error ? (a.stack || a.message) : typeof a === 'string' ? a : safeJson(a))).join(' ') })
    }
  }
  window.addEventListener('error', (ev) => post({ event: 'log', level: 'error', text: `uncaught: ${ev.message} (${ev.filename}:${ev.lineno})` }))
  window.addEventListener('unhandledrejection', (ev) => post({ event: 'log', level: 'error', text: `unhandled rejection: ${errMsg(ev.reason)}` }))

  function safeJson(v) {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  function errMsg(e) {
    if (e && typeof e === 'object' && typeof e.message === 'string') return e.message
    return String(e)
  }

  let seq = 0
  const nextId = (prefix) => `${prefix}-${(++seq).toString(36)}`

  // The engine bundle. import() from a classic script resolves against the
  // document URL, so this is jambot-engine://engine/jambot-web.js.
  const jamLoad = import('./jambot-web.js').catch((e) => {
    console.error('[bridge] jambot-web.js failed to load:', errMsg(e))
    throw e
  })

  // ---- engine state ------------------------------------------------------------

  let jam = null          // the module, once `ready` ran
  let tools = null        // tool schema list from jam.ready()
  let session = null      // the one JamSession
  let lastAgentMessages = []
  let agentRunning = false
  const pendingLlm = new Map() // llmId → { resolve, reject }

  function requireJam() {
    if (!jam) throw new Error("engine not ready — call 'ready' first")
    return jam
  }
  function requireSession() {
    if (!session) throw new Error('no session loaded — call loadSession first')
    return session
  }

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

  /**
   * describeSession() shaped for Swift's Codable mirror: every descriptor has
   * numeric min/max and a string unit (choice params in the engine can leave
   * them undefined), voices is always an array, level always a number. The
   * controls builder below runs on this normalized form too — a descriptor
   * whose min/max were missing becomes 0/0 and fails the same `max <= min`
   * test the TypeScript original applied to the undefined values.
   */
  function normDescriptor(desc) {
    desc = desc || {}
    const options = desc.options ?? desc.choices
    const out = { min: isNum(desc.min) ? desc.min : 0, max: isNum(desc.max) ? desc.max : 0, unit: String(desc.unit ?? '') }
    if (Array.isArray(options)) out.options = options.map(String)
    if (isNum(desc.default)) out.default = desc.default
    return out
  }

  /** Plain JSON (no functions / undefined / cycles) or `{}` when it can't be. */
  function plainJson(v) {
    try { return JSON.parse(JSON.stringify(v ?? {})) ?? {} } catch { return {} }
  }

  /** The transport strip — port of Studio.tsx `stripFromDesc` (kick / snare-clap / hats from the live drum pattern; a mono synth's gates on the middle row otherwise). */
  function stripFromDesc(d) {
    const insts = d.instruments || []
    for (const id of ['jt90', 'jb01']) {
      const inst = insts.find((i) => i.id === id && i.active)
      const p = inst && inst.pattern
      if (!p || Array.isArray(p)) continue
      const row = (voices) => Array.from({ length: 16 }, (_, i) => (voices.some((v) => ((p[v] && p[v][i] && p[v][i].velocity) || 0) > 0) ? '1' : '0')).join('')
      return { k: row(['kick']), s: row(['snare', 'clap', 'rimshot']), h: row(['ch', 'oh', 'ride', 'crash', 'cymbal']) }
    }
    for (const id of ['jb202', 'jt30', 'jt10']) {
      const inst = insts.find((i) => i.id === id && i.active)
      const p = inst && inst.pattern
      if (!Array.isArray(p)) continue
      const s = Array.from({ length: 16 }, (_, i) => (p[i] && p[i].gate ? '1' : '0')).join('')
      if (s.includes('1')) return { k: '0'.repeat(16), s, h: '0'.repeat(16) }
    }
    return null
  }

  function describe() {
    const d = requireJam().describeSession(requireSession())
    return {
      ...d,
      strip: stripFromDesc(d),
      swing: isNum(d.swing) ? d.swing : 0,
      instruments: (d.instruments || []).map((inst) => ({
        ...inst,
        type: inst.type || inst.id,
        active: !!inst.active,
        voices: Array.isArray(inst.voices) ? inst.voices : [],
        level: isNum(inst.level) ? inst.level : 0,
        params: (inst.params || []).map((p) => ({
          path: p.path, sub: p.sub, value: p.value === undefined ? null : p.value, descriptor: normDescriptor(p.descriptor), isDefault: !!p.isDefault,
        })),
      })),
      // Effect chains for the Panels tab: params as plain JSON, every
      // descriptor normalised like an instrument's.
      effects: (d.effects || []).map((fx) => ({
        target: String(fx.target),
        chain: (fx.chain || []).map((e) => ({
          id: String(e.id),
          type: String(e.type || ''),
          params: plainJson(e.params),
          descriptors: Object.fromEntries(Object.entries(e.descriptors || {}).map(([k, v]) => [k, normDescriptor(v)])),
        })),
      })),
    }
  }

  // ---- controls (port of src/app/jam/controls.ts) ------------------------------------

  const INSTRUMENT_NAMES = {
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

  function rankKey(name) {
    const i = KEY_PARAMS.indexOf(String(name).toLowerCase())
    return i === -1 ? 999 : i
  }

  function toControl(path, label, value, d) {
    if (typeof value !== 'number' || !isFinite(value)) return null
    if (!d || d.unit === 'choice' || !isFinite(d.min) || !isFinite(d.max) || d.max <= d.min) return null
    const unit = d.unit || ''
    const log = unit === 'Hz' && d.min > 0 && d.max / d.min >= 20
    const step = unit === 'dB' ? 0.5 : unit === 's' || unit === 'seconds' ? 0.1 : unit === '0-1' ? 0.01 : 1
    return { path, label, min: d.min, max: d.max, step, unit, scale: log ? 'log' : 'lin', value }
  }

  function buildControlGroups(desc) {
    const groups = []

    for (const inst of desc.instruments) {
      if (!inst.active) continue
      const controls = []
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
            const c = toControl(p.path, `${voice} ${name}`, p.value, p.descriptor)
            if (c) { controls.push(c); n++ }
            if (n >= 4) break
          }
        }
      } else {
        // Mono synth: ranked key params (paths may be 'filterCutoff' or 'bass.cutoff')
        // JT10's sub oscillator is off while subMode is 0, so its level
        // slider would be a no-op — leave it out until the agent turns it on.
        const subMode = byPath.get('lead.subMode')?.value
        const subOff = (inst.type || inst.id) === 'jt10' && (subMode === 0 || subMode === '0' || subMode === undefined || subMode === null)
        const ranked = inst.params
          .filter((p) => !p.sub.endsWith('.level') && p.sub !== 'level')
          .filter((p) => !(subOff && p.sub.endsWith('subLevel')))
          .map((p) => ({ p, rank: rankKey(p.sub.split('.').pop() || p.sub) }))
          .filter((x) => x.rank < 999)
          .sort((a, b) => a.rank - b.rank)
        for (const { p } of ranked) {
          const c = toControl(p.path, p.sub.split('.').pop() || p.sub, p.value, p.descriptor)
          if (c) controls.push(c)
          if (controls.length >= MAX_PER_GROUP) break
        }
      }

      // Added instances (jb202-2, lead2) show the type name plus their id.
      const type = inst.type || inst.id
      const baseName = INSTRUMENT_NAMES[type] || type
      const group = {
        id: inst.id,
        title: inst.id === type ? baseName : `${baseName} · ${inst.id}`,
        controls,
      }
      if (inst.voices.length) group.subtitle = inst.voices.join(' · ')
      groups.push(group)
    }

    for (const fx of desc.effects || []) {
      for (const e of fx.chain || []) {
        if (!e.descriptors) continue
        const controls = []
        const entries = Object.entries(e.descriptors)
          .map(([name, d]) => ({ name, d, rank: rankKey(name) }))
          .filter((x) => x.rank < 999)
          .sort((a, b) => a.rank - b.rank)
        for (const { name, d } of entries) {
          const v = e.params?.[name]
          const c = toControl(`fx.${fx.target}.${e.id}.${name}`, name, v, d)
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

  // ---- song-mode write-through (port of Studio.tsx) ------------------------------

  /**
   * Song mode: arrangement renders use the params captured inside each saved
   * pattern, so a live `tweak` has to reach every saved pattern of that
   * instrument too. Writes the live node's new engine value straight into the
   * saved copies; nothing on the live node is touched. Returns how many saved
   * patterns were updated.
   */
  function writeThroughSavedPatterns(session, path) {
    const [inst, ...rest] = path.split('.')
    if (!Array.isArray(session.arrangement) || session.arrangement.length === 0) return 0
    if (inst === 'fx' || rest.length === 0) return 0
    if (rest.length === 1 && rest[0] === 'level') return 0 // node output level lives outside patterns
    const saved = session.patterns?.[inst]
    if (!saved) return 0
    const acc = typeof session.instrument === 'function' ? session.instrument(inst) : null
    if (!acc || acc.kind === 'sampler' || acc.kind === 'modular') return 0

    let voice = null
    let key
    if (acc.kind === 'drums') {
      // 'jt90.kick.decay' → params.kick.decay
      ;[voice] = rest
      key = rest.slice(1).join('.')
      if (!key) return 0
    } else {
      // Mono synths store flat params without the node's voice prefix:
      // 'jb202.bass.filterCutoff' → params.filterCutoff. Pick the live key the
      // control path ends with.
      const sub = rest.join('.')
      const live = Object.keys(acc.params || {})
      const match = live.filter((k) => sub === k || sub.endsWith(`.${k}`)).sort((a, b) => b.length - a.length)[0]
      if (!match) return 0
      key = match
    }
    const value = voice ? acc.params?.[voice]?.[key] : acc.params?.[key]
    if (value === undefined) return 0

    let n = 0
    for (const entry of Object.values(saved)) {
      if (!entry || typeof entry !== 'object') continue
      const params = (entry.params ||= {})
      if (voice) {
        const vp = (params[voice] ||= {})
        vp[key] = value
      } else {
        params[key] = value
      }
      n++
    }
    return n
  }

  /**
   * Song mode, effect faders: 'fx.<key>.<effectId>.<param>' — the live
   * effect's new params are copied onto the same effect inside every saved
   * pattern's channelInserts snapshot. Returns how many were updated.
   */
  function writeThroughSavedInserts(session, path) {
    const segs = path.split('.')
    if (segs[0] !== 'fx' || segs.length < 4) return 0
    if (!Array.isArray(session.arrangement) || session.arrangement.length === 0) return 0
    const effectId = segs[segs.length - 2]
    const key = segs.slice(1, -2).join('.')
    const inst = key.split('.')[0]
    if (inst === 'master') return 0
    const live = (session.mixer?.effectChains?.[key] || []).find((e) => e.id === effectId)
    if (!live?._node) return 0
    const params = { ...live._node.getParams() }
    const saved = session.patterns?.[inst]
    if (!saved) return 0
    let n = 0
    for (const entry of Object.values(saved)) {
      const snap = entry?.channelInserts
      if (!snap || typeof snap !== 'object') continue
      const e = snap[key]?.find((x) => x.id === effectId)
      if (!e) continue
      e.params = params
      n++
    }
    return n
  }

  // ---- chat-history hygiene (port of src/app/jam/history.ts) -----------------------

  const CUT_OFF_RESULT = '(this tool call was cut off before it ran — nothing was executed)'
  const roleOk = (r) => r === 'user' || r === 'assistant'

  function normalizeMessage(raw) {
    if (!raw || typeof raw !== 'object') return null
    const { role, content } = raw
    if (!roleOk(role)) return null
    if (typeof content === 'string') return content.trim() ? { role, content } : null
    if (!Array.isArray(content)) return null
    const blocks = []
    for (const b of content) {
      if (!b || typeof b !== 'object' || typeof b.type !== 'string') continue
      switch (b.type) {
        case 'text':
          if (typeof b.text === 'string' && b.text.trim()) blocks.push(b)
          break
        case 'tool_use':
          if (role !== 'assistant' || typeof b.id !== 'string' || typeof b.name !== 'string') break
          blocks.push(b.input && typeof b.input === 'object' ? b : { ...b, input: {} })
          break
        case 'tool_result':
          if (role === 'user' && typeof b.tool_use_id === 'string') blocks.push(b)
          break
        default:
          blocks.push(b)
      }
    }
    return blocks.length ? { role, content: blocks } : null
  }

  const toolUseIds = (m) => Array.isArray(m.content) ? m.content.filter((b) => b.type === 'tool_use').map((b) => b.id) : []
  const toolResultIds = (m) => Array.isArray(m.content) ? m.content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id) : []
  const errorResult = (id) => ({ type: 'tool_result', tool_use_id: id, content: CUT_OFF_RESULT, is_error: true })

  function resultsFirst(blocks) {
    const results = blocks.filter((b) => b.type === 'tool_result')
    return results.length ? [...results, ...blocks.filter((b) => b.type !== 'tool_result')] : blocks
  }

  function sanitizeHistory(input) {
    if (!Array.isArray(input)) return []
    const msgs = []
    for (const raw of input) {
      const m = normalizeMessage(raw)
      if (m) msgs.push(m)
    }

    const out = []
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]

      if (m.role === 'assistant') {
        const uses = toolUseIds(m)
        if (uses.length === 0) { out.push(m); continue }
        const next = msgs[i + 1]
        if (!next) {
          const kept = m.content.filter((b) => b.type !== 'tool_use')
          if (kept.length) out.push({ role: 'assistant', content: kept })
          continue
        }
        out.push(m)
        if (next.role === 'user') {
          const have = new Set(toolResultIds(next))
          const missing = uses.filter((id) => !have.has(id))
          if (missing.length) {
            const content = Array.isArray(next.content) ? next.content : [{ type: 'text', text: next.content }]
            msgs[i + 1] = { role: 'user', content: [...missing.map(errorResult), ...content] }
          }
        } else {
          out.push({ role: 'user', content: uses.map(errorResult) })
        }
        continue
      }

      if (Array.isArray(m.content)) {
        const prev = out[out.length - 1]
        const allowed = new Set(prev && prev.role === 'assistant' ? toolUseIds(prev) : [])
        const seen = new Set()
        let changed = false
        const kept = m.content.filter((b) => {
          if (b.type !== 'tool_result') return true
          const id = b.tool_use_id
          if (!allowed.has(id) || seen.has(id)) { changed = true; return false }
          seen.add(id)
          return true
        })
        if (!kept.length) continue
        const ordered = resultsFirst(kept)
        out.push(changed || ordered !== kept ? { role: 'user', content: ordered } : m)
        continue
      }
      out.push(m)
    }

    while (out.length && out[0].role !== 'user') out.shift()
    return out
  }

  // ---- PCM transport ---------------------------------------------------------------

  const CHUNK_BYTES = 768 * 1024 // → 1 MB of base64 per message

  function base64(bytes) {
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 0x8000, bytes.length)))
    }
    return btoa(bin)
  }

  /** AudioBuffer → planar Int16 (channel 0 fully, then channel 1 …) as base64 chunks. */
  function pcmChunks(buffer) {
    const channels = buffer.numberOfChannels
    const n = buffer.length
    const out = new Int16Array(n * channels)
    for (let c = 0; c < channels; c++) {
      const src = buffer.getChannelData(c)
      const base = c * n
      for (let i = 0; i < n; i++) {
        let v = src[i]
        if (v > 1) v = 1
        else if (v < -1) v = -1
        out[base + i] = v < 0 ? v * 32768 : v * 32767
      }
    }
    const bytes = new Uint8Array(out.buffer)
    const chunks = []
    for (let off = 0; off < bytes.length; off += CHUNK_BYTES) {
      chunks.push(base64(bytes.subarray(off, Math.min(off + CHUNK_BYTES, bytes.length))))
    }
    return chunks
  }

  /**
   * Post a render's PCM as chunk messages under `callId`, return the meta
   * Swift assembles it with. Mirrors Studio.applyRender's bookkeeping: a
   * loop-mode render longer than session.bars (a 4-bar fill) becomes the new
   * session length.
   */
  function shipRender(callId, r) {
    const buffer = r.buffer
    if (!buffer) throw new Error('render produced no buffer')
    const renderedBars = Math.min(128, Math.max(1, Math.round(r.bars)))
    if (session && !r.hasArrangement && session.bars !== renderedBars) session.bars = renderedBars
    const group = nextId('pcm')
    const chunks = pcmChunks(buffer)
    chunks.forEach((data, index) => post({ id: callId, event: 'chunk', group, index, data }))
    return {
      bars: r.bars,
      bpm: session ? session.bpm : r.bpm,
      hasArrangement: !!r.hasArrangement,
      message: r.message || '',
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      length: buffer.length,
      group,
      chunkCount: chunks.length,
    }
  }

  // ---- LLM through Swift -------------------------------------------------------------

  /** The `llm` function runAgent calls: posts the request, waits for resolveLlm. */
  function llmViaSwift(callId) {
    return (req) => new Promise((resolve, reject) => {
      const llmId = nextId('llm')
      pendingLlm.set(llmId, { resolve, reject })
      post({
        id: callId,
        event: 'llm',
        llmId,
        request: { system: req.system, messages: req.messages, tools: req.tools, max_tokens: req.max_tokens },
      })
    })
  }

  // ---- sequencer (port of src/app/jam/seq/model.ts) -----------------------------------
  //
  // Pure pattern maths over Jambot pattern objects. Every edit builds a NEW
  // dense pattern (never mutates the one a render may be reading):
  //   drums (jt90, jb01): { [voice]: [{ velocity, accent }] }, 16 × bars
  //   mono  (jb202, jt30, jt10): [{ note, gate, accent, slide }]

  const DRUM_VOICES = {
    jt90: ['kick', 'snare', 'clap', 'rimshot', 'lowtom', 'midtom', 'hitom', 'ch', 'oh', 'crash', 'ride'],
    jb01: ['kick', 'snare', 'clap', 'ch', 'oh', 'lowtom', 'hitom', 'cymbal'],
  }
  const MONO_TYPES = new Set(['jb202', 'jt30', 'jt10'])

  function kindOf(type) {
    if (DRUM_VOICES[type]) return 'drums'
    if (MONO_TYPES.has(type)) return 'mono'
    return null
  }

  // Notes: sharps only on output ('C#2'); flats accepted on input.
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const NOTE_MAP = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6,
    G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, 'B#': 0,
  }
  const NOTE_MIN = 12 // C0
  const NOTE_MAX = 96 // C7

  function noteToMidi(name) {
    const m = /^([A-Ga-g][#b]?)(-?\d+)$/.exec(String(name || '').trim())
    if (!m) return null
    const letter = m[1].charAt(0).toUpperCase() + m[1].slice(1)
    const semi = NOTE_MAP[letter]
    if (semi === undefined) return null
    return (parseInt(m[2], 10) + 1) * 12 + semi
  }
  function midiToNote(midi) {
    const m = Math.round(midi)
    return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`
  }
  /** Normalise any accepted spelling to sharps, clamped to C0–C7; unknown → 'C2'. */
  function canonicalNote(name) {
    const m = noteToMidi(name)
    return m === null ? 'C2' : midiToNote(Math.max(NOTE_MIN, Math.min(NOTE_MAX, m)))
  }

  const emptyDrumStep = () => ({ velocity: 0, accent: false })
  const emptyMonoStep = (note = 'C2') => ({ note, gate: false, accent: false, slide: false })

  function drumLength(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return 16
    let n = 0
    for (const v of Object.values(p)) if (Array.isArray(v) && v.length > n) n = v.length
    return n || 16
  }
  function monoLength(p) {
    return Array.isArray(p) && p.length ? p.length : 16
  }
  function patternLength(p, kind) {
    return kind === 'drums' ? drumLength(p) : monoLength(p)
  }

  /** Dense copy with every canonical voice at `len` steps; extra voices kept. */
  function normalizeDrums(p, voices, len = drumLength(p)) {
    const src = p && typeof p === 'object' && !Array.isArray(p) ? p : {}
    const out = {}
    for (const voice of [...voices, ...Object.keys(src).filter((v) => !voices.includes(v))]) {
      const arr = Array.isArray(src[voice]) ? src[voice] : []
      out[voice] = Array.from({ length: len }, (_, i) => {
        const s = arr[i]
        const vel = typeof s?.velocity === 'number' && isFinite(s.velocity) ? s.velocity : 0
        return { velocity: vel > 0 ? vel : 0, accent: !!s?.accent && vel > 0 }
      })
    }
    return out
  }

  /** Dense mono copy at `len` steps; new steps rest on the last note. */
  function normalizeMono(p, len = monoLength(p)) {
    const arr = Array.isArray(p) ? p : []
    let last = 'C2'
    for (const s of arr) if (s?.note) last = canonicalNote(s.note)
    return Array.from({ length: len }, (_, i) => {
      const s = arr[i]
      const note = s?.note ? canonicalNote(s.note) : last
      return { note, gate: !!s?.gate, accent: !!s?.accent, slide: !!s?.slide }
    })
  }

  function drumStepState(s) {
    if (!s || !(typeof s.velocity === 'number' && s.velocity > 0)) return 'off'
    return s.accent ? 'accent' : 'hit'
  }

  /** Tap cycle: off → hit → accent → off. */
  function cycleDrumStep(p, voices, voice, i) {
    const next = normalizeDrums(p, voices)
    if (!next[voice]) next[voice] = Array.from({ length: drumLength(next) }, emptyDrumStep)
    if (i < 0 || i >= next[voice].length) throw new Error(`step ${i + 1} is outside the pattern (${next[voice].length} steps)`)
    const cur = next[voice][i]
    const state = drumStepState(cur)
    let s, to
    if (state === 'off') { s = { velocity: 1, accent: false }; to = 'hit' }
    else if (state === 'hit') { s = { velocity: cur.velocity > 0 ? cur.velocity : 1, accent: true }; to = 'accent' }
    else { s = { velocity: 0, accent: false }; to = 'off' }
    next[voice][i] = s
    return { pattern: next, state: to }
  }
  const resizeDrums = (p, voices, steps) => normalizeDrums(p, voices, steps)
  function clearDrums(p, voices) {
    const next = normalizeDrums(p, voices)
    for (const v of Object.keys(next)) next[v] = next[v].map(emptyDrumStep)
    return next
  }

  function monoStepAt(next, i) {
    if (i < 0 || i >= next.length) throw new Error(`step ${i + 1} is outside the pattern (${next.length} steps)`)
    return next[i]
  }
  function toggleGate(p, i) {
    const next = normalizeMono(p)
    next[i] = { ...monoStepAt(next, i), gate: !next[i].gate }
    return next
  }
  function setNote(p, i, note) {
    const next = normalizeMono(p)
    next[i] = { ...monoStepAt(next, i), note: canonicalNote(note) }
    return next
  }
  function toggleAccent(p, i) {
    const next = normalizeMono(p)
    next[i] = { ...monoStepAt(next, i), accent: !next[i].accent }
    return next
  }
  function toggleSlide(p, i) {
    const next = normalizeMono(p)
    next[i] = { ...monoStepAt(next, i), slide: !next[i].slide }
    return next
  }
  /** Resize; new steps carry the last step's note with the gate off. */
  function resizeMono(p, steps) {
    const cur = normalizeMono(p)
    if (steps <= cur.length) return cur.slice(0, steps)
    const last = cur.length ? cur[cur.length - 1].note : 'C2'
    return [...cur, ...Array.from({ length: steps - cur.length }, () => emptyMonoStep(last))]
  }
  /** Gates off everywhere; notes and length kept. */
  const clearMono = (p) => normalizeMono(p).map((s) => ({ ...s, gate: false, accent: false, slide: false }))

  // Arrangement helpers.
  function sectionStarts(arr) {
    const out = []
    let at = 0
    for (const s of arr) { out.push(at); at += Number(s.bars) || 0 }
    return out
  }
  function sectionAtBar(arr, bar) {
    const starts = sectionStarts(arr)
    for (let i = arr.length - 1; i >= 0; i--) if (bar >= starts[i]) return bar < starts[i] + (Number(arr[i].bars) || 0) ? i : null
    return null
  }
  /** Section the playhead is in (song scope: by bar; section audition: that section). */
  function playingSection(arr, scope, playStep16) {
    if (playStep16 == null || !arr.length) return null
    if (scope && scope.kind === 'section') return Math.min(Number(scope.index) || 0, arr.length - 1)
    return sectionAtBar(arr, Math.floor(playStep16 / 16))
  }

  /** instId → voices hitting at this absolute 16th ('gate' for mono synths). */
  function hitsAt(s, scope, playStep16) {
    const out = {}
    if (!s || playStep16 == null || !Number.isFinite(playStep16)) return out
    const arr = Array.isArray(s.arrangement) ? s.arrangement : []
    const inSong = arr.length > 0
    let secIdx = null
    let sectionStartStep = 0
    if (inSong) {
      secIdx = playingSection(arr, scope, playStep16)
      if (secIdx == null) return out
      sectionStartStep = scope && scope.kind === 'section' ? 0 : sectionStarts(arr)[secIdx] * 16
    }
    for (const inst of s.instruments || []) {
      const kind = kindOf(inst.type || inst.id)
      if (!kind) continue
      let pattern = null
      if (inSong) {
        const name = arr[secIdx]?.patterns?.[inst.id]
        if (!name) continue
        pattern = s.patterns?.[inst.id]?.[name]?.pattern ?? null
      } else {
        pattern = s.instrument?.(inst.id)?.pattern ?? null
      }
      if (!pattern) continue
      const len = patternLength(pattern, kind)
      if (!len) continue
      const local = (((playStep16 - sectionStartStep) % len) + len) % len
      if (kind === 'drums') {
        const voices = Object.keys(pattern).filter((v) => (pattern[v]?.[local]?.velocity ?? 0) > 0)
        if (voices.length) out[inst.id] = voices
      } else if (pattern[local]?.gate) {
        out[inst.id] = ['gate']
      }
    }
    return out
  }

  /**
   * Resolve what the Seq view edits: in song mode (a section index and an
   * arrangement) the saved pattern that section plays on `inst`; otherwise
   * the live node's pattern. `write(next)` stores a new pattern the way
   * Sequencer.tsx's `commit` does — song mode also mirrors into the live
   * node when that pattern is the loaded one.
   */
  function seqTarget(s, inst, section) {
    if (typeof inst !== 'string' || !inst) throw new Error('seq needs an instrument id')
    const entry = (s.instruments || []).find((i) => i.id === inst)
    if (!entry) throw new Error(`no instrument '${inst}' in this session`)
    const type = entry.type || entry.id
    const kind = kindOf(type)
    if (!kind) throw new Error(`${inst} (${type}) has no step sequencer`)
    const voices = kind === 'drums' ? DRUM_VOICES[type] : []
    const arr = Array.isArray(s.arrangement) ? s.arrangement : []
    const inSong = section !== undefined && section !== null && arr.length > 0
    if (inSong) {
      const idx = Number(section)
      const sec = arr[idx]
      if (!sec) throw new Error(`section ${idx + 1} does not exist (the arrangement has ${arr.length})`)
      const name = sec.patterns?.[inst] ?? null
      const saved = name ? s.patterns?.[inst]?.[name] : null
      return {
        kind, type, voices, inSong, name,
        silent: !name, missing: !!name && !saved,
        raw: saved ? saved.pattern ?? null : null,
        write(next) {
          if (!name) throw new Error(`${inst} is not playing in section ${idx + 1}`)
          if (!saved) throw new Error(`pattern ${name} is referenced by section ${idx + 1} but not saved`)
          saved.pattern = next
          if (s.currentPattern?.[inst] === name) {
            const acc = s.instrument?.(inst)
            if (acc) acc.pattern = structuredClone(next)
          }
        },
      }
    }
    const acc = s.instrument?.(inst)
    if (!acc) throw new Error(`no instrument '${inst}' in this session`)
    return {
      kind, type, voices, inSong: false, name: s.currentPattern?.[inst] || 'A',
      silent: false, missing: false,
      raw: acc.pattern ?? null,
      write(next) { acc.pattern = next },
    }
  }

  /** The dense pattern payload Swift decodes as `SeqPattern`. */
  function seqPayload(t, raw = t.raw) {
    const pattern = t.kind === 'drums' ? normalizeDrums(raw, t.voices) : normalizeMono(raw)
    return {
      kind: t.kind,
      type: t.type,
      name: t.name,
      length: patternLength(pattern, t.kind),
      silent: !!t.silent,
      missing: !!t.missing,
      pattern,
    }
  }

  // ---- calls -------------------------------------------------------------------------

  const handlers = {
    hits({ step, scope } = {}) {
      const s = requireSession()
      const n = Number(step)
      return { hits: hitsAt(s, scope && typeof scope === 'object' ? scope : { kind: 'song' }, Number.isFinite(n) ? n : null) }
    },

    pattern({ inst, section } = {}) {
      const s = requireSession()
      return seqPayload(seqTarget(s, inst, section))
    },

    seq({ op, inst, section, args } = {}) {
      const s = requireSession()
      const t = seqTarget(s, inst, section)
      const a = args && typeof args === 'object' ? args : {}
      const i = Number(a.i)
      const needStep = () => {
        if (!Number.isInteger(i) || i < 0) throw new Error(`seq ${op}: 'i' must be a step index (got ${a.i})`)
        return i
      }
      let next
      switch (op) {
        case 'cycleDrum': {
          if (t.kind !== 'drums') throw new Error(`cycleDrum: ${inst} is not a drum machine`)
          const voice = String(a.voice || '')
          if (!voice) throw new Error('cycleDrum needs a voice')
          next = cycleDrumStep(t.raw, t.voices, voice, needStep()).pattern
          break
        }
        case 'toggleGate':
          if (t.kind !== 'mono') throw new Error(`toggleGate: ${inst} is not a mono synth`)
          next = toggleGate(t.raw, needStep())
          break
        case 'setNote':
          if (t.kind !== 'mono') throw new Error(`setNote: ${inst} is not a mono synth`)
          if (noteToMidi(a.note) === null) throw new Error(`setNote: '${a.note}' is not a note name`)
          next = setNote(t.raw, needStep(), a.note)
          break
        case 'toggleAccent':
          if (t.kind !== 'mono') throw new Error(`toggleAccent: ${inst} is not a mono synth`)
          next = toggleAccent(t.raw, needStep())
          break
        case 'toggleSlide':
          if (t.kind !== 'mono') throw new Error(`toggleSlide: ${inst} is not a mono synth`)
          next = toggleSlide(t.raw, needStep())
          break
        case 'resize': {
          const bars = Number(a.bars)
          if (![1, 2, 4].includes(bars)) throw new Error(`resize: bars must be 1, 2 or 4 (got ${a.bars})`)
          next = t.kind === 'drums' ? resizeDrums(t.raw, t.voices, bars * 16) : resizeMono(t.raw, bars * 16)
          break
        }
        case 'clear':
          next = t.kind === 'drums' ? clearDrums(t.raw, t.voices) : clearMono(t.raw)
          break
        default:
          throw new Error(`seq: unknown op '${op}'`)
      }
      t.write(next)
      // Loop mode: the loop must be long enough to play the whole pattern.
      if (op === 'resize' && !t.inSong) {
        const bars = Number(a.bars)
        if ((Number(s.bars) || 0) < bars) s.bars = bars
      }
      return { desc: describe(), pattern: seqPayload(t, next) }
    },

    async ready() {
      if (!jam) jam = await jamLoad
      if (!tools) tools = await jam.ready()
      return { version: jam.VERSION, tools: tools.map((t) => t.name) }
    },

    async loadSession({ session: data, bpm } = {}) {
      const j = requireJam()
      if (data) {
        // No silent fallback to a fresh session here (the web app does that):
        // the next autosave would overwrite the saved track with an empty one.
        try {
          session = j.deserializeSession(data)
        } catch (e) {
          throw new Error(`could not restore the saved session: ${errMsg(e)}`)
        }
      } else {
        session = j.createSession({ bpm: Number(bpm) || 128 })
      }
      lastAgentMessages = []
      return { desc: describe() }
    },

    serialize() {
      return { session: requireJam().serializeSession(requireSession()) }
    },

    describe() {
      return { desc: describe() }
    },

    controls() {
      return { groups: buildControlGroups(describe()) }
    },

    async tweak({ path, value } = {}) {
      const j = requireJam()
      const s = requireSession()
      if (typeof path !== 'string' || !path) throw new Error('tweak needs a path')
      const r = await j.executeTool('tweak', { path, value }, s, {})
      if (/^Error/.test(r)) throw new Error(r)
      // Song mode: the arrangement plays the saved patterns' own params and
      // inserts, so the new value goes into every saved pattern too (live
      // node untouched).
      const wroteThrough = path.startsWith('fx.') ? writeThroughSavedInserts(s, path) : writeThroughSavedPatterns(s, path)
      return { result: r, wroteThrough, desc: describe() }
    },

    async setTrack({ key, value } = {}) {
      const j = requireJam()
      const s = requireSession()
      const v = Number(value)
      if (!Number.isFinite(v)) throw new Error(`setTrack ${key}: value is not a number`)
      if (key === 'bpm') s.bpm = v
      else if (key === 'bars') s.bars = v
      else if (key === 'swing') {
        const r = await j.executeTool('set_swing', { amount: v }, s, {})
        if (/^Error/.test(r)) throw new Error(r)
      } else throw new Error(`setTrack: unknown key '${key}'`)
      return { desc: describe() }
    },

    async mix({ id, what, on } = {}) {
      const j = requireJam()
      const s = requireSession()
      let r
      if (what === 'mute') r = await j.executeTool('mute_track', { track: id, mute: !!on }, s, {})
      else if (what === 'solo') r = await j.executeTool('solo_track', { track: id, solo: !!on, exclusive: false }, s, {})
      else throw new Error(`mix: unknown action '${what}'`)
      if (/^Error/.test(r)) throw new Error(r)
      return { result: r, desc: describe() }
    },

    async render({ scope } = {}, ctx) {
      const j = requireJam()
      const s = requireSession()
      const arrangement = Array.isArray(s.arrangement) ? s.arrangement : []
      let r
      if (scope && scope.kind === 'section') {
        const index = Number(scope.index)
        const section = arrangement[index]
        if (!section) throw new Error(`section ${index + 1} does not exist (the arrangement has ${arrangement.length})`)
        // Audition one section from its saved patterns: render a view of the
        // session whose arrangement is just that section. The view inherits
        // everything else (nodes, clock, patterns, mixer) from the real
        // session and nothing is mutated.
        const view = Object.create(s)
        view.arrangement = [section]
        r = await j.renderSessionToBuffer(view, section.bars)
      } else {
        // Loop mode: at least the longest programmed pattern, capped at 128
        // (same rule as the agent's render tool). Arrangements set their own
        // length inside render.js.
        r = await j.renderSessionToBuffer(s, j.resolveRenderBars(s).bars)
      }
      return shipRender(ctx.id, r)
    },

    async agent({ task, messages, notes } = {}, ctx) {
      const j = requireJam()
      const s = requireSession()
      if (agentRunning) throw new Error('an agent turn is already running')
      const text = String(task || '').trim()
      if (!text) throw new Error('agent needs a task')
      const noteList = Array.isArray(notes) ? notes.filter((n) => typeof n === 'string' && n) : []
      const fullTask = noteList.length ? `${text}\n\n[controls] ${noteList.join('; ')}` : text
      // runAgent appends to this array in place; keep the sanitized copy as
      // the live history so `agentMessages` returns the full transcript.
      const history = sanitizeHistory(messages || [])
      // Exposed from the start of the turn: runAgent mutates `history` in
      // place, so after a failed turn `agentMessages` still returns what
      // was appended (the sanitizer drops any half tool round).
      lastAgentMessages = history
      const id = ctx.id
      agentRunning = true
      try {
        const result = await j.runAgent({
          task: fullTask,
          session: s,
          messages: history,
          llm: llmViaSwift(id),
          executeTool: j.executeTool,
          tools,
          systemPrompt: j.JAMBOT_PROMPT + j.WEB_PROMPT_ADDENDUM,
          buildStateContext: j.buildSessionContext,
          buildGenreContext: (t) => j.buildGenreContext(j.detectGenres(t)),
          callbacks: {
            onResponse: (t) => post({ id, event: 'text', text: t }),
            onTool: (name, input) => post({ id, event: 'tool', name, input: input && typeof input === 'object' ? input : {} }),
            onToolResult: (result, name, isError) => post({ id, event: 'toolResult', name, result: String(result ?? ''), isError: !!isError }),
          },
          context: {
            onRender: (r) => {
              try {
                post({ id, event: 'render', ...shipRender(id, r) })
              } catch (e) {
                console.error('[bridge] agent render could not be shipped:', errMsg(e))
              }
            },
          },
        })
        lastAgentMessages = Array.isArray(result?.messages) ? result.messages : history
        return { messages: lastAgentMessages, stopReason: result?.stopReason || 'end_turn', desc: describe() }
      } finally {
        agentRunning = false
        // Any LLM request still pending for this turn can never be answered usefully.
        for (const [llmId, p] of pendingLlm) {
          if (llmId.startsWith('llm-')) { p.reject(new Error('agent turn ended')); pendingLlm.delete(llmId) }
        }
      }
    },

    agentMessages() {
      return { messages: sanitizeHistory(lastAgentMessages) }
    },
  }

  // ---- entry points ------------------------------------------------------------------

  const answered = new Set()
  function answer(id, msg) {
    if (answered.has(id)) {
      console.error(`[bridge] call ${id} tried to answer twice`)
      return
    }
    answered.add(id)
    if (answered.size > 2000) answered.delete(answered.values().next().value)
    post({ id, ...msg })
  }

  window.bridge = {
    /** Swift → JS. Always answers exactly once, asynchronously. */
    call(id, name, argsJSON) {
      Promise.resolve()
        .then(async () => {
          const h = handlers[name]
          if (!h) throw new Error(`unknown bridge call '${name}'`)
          let args = {}
          if (argsJSON !== undefined && argsJSON !== null && argsJSON !== '') {
            args = typeof argsJSON === 'string' ? JSON.parse(argsJSON) : argsJSON
          }
          const result = await h(args || {}, { id })
          answer(id, { ok: true, result: result === undefined ? {} : result })
        })
        .catch((e) => {
          const msg = { ok: false, error: errMsg(e) }
          if (e && e.code) msg.code = e.code
          answer(id, msg)
        })
      return true
    },

    /** Swift → JS: the answer to an `llm` event. `responseJSON` is
     *  { ok: true, response } or { ok: false, error, code? }. */
    resolveLlm(llmId, responseJSON) {
      const p = pendingLlm.get(llmId)
      if (!p) {
        console.warn(`[bridge] resolveLlm for unknown request ${llmId}`)
        return false
      }
      pendingLlm.delete(llmId)
      let r
      try {
        r = typeof responseJSON === 'string' ? JSON.parse(responseJSON) : responseJSON
      } catch (e) {
        p.reject(new Error(`bad LLM response JSON: ${errMsg(e)}`))
        return true
      }
      if (r && r.ok) {
        p.resolve(r.response)
      } else {
        const err = new Error((r && r.error) || 'LLM call failed')
        if (r && r.code) err.code = r.code
        p.reject(err)
      }
      return true
    },
  }

  post({ event: 'log', level: 'log', text: 'engine-bridge.js installed' })
})()
