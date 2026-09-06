// Loader + types for the Jambot browser bundle (public/jam/jambot-web.js).
// The bundle is generated from ../vibeceo/jambot by scripts/jam/build-jambot.mjs
// and loaded at runtime with a bare dynamic import so Next never tries to
// bundle 1 MB of synth engines.

import meta from '../../../public/jam/jambot-web.meta.json'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type JamSession = any

export type ParamDescriptor = {
  min: number
  max: number
  unit: string
  default?: number | string
  /** Choice params: valid values (synth params use `options`, older effect nodes `choices`). */
  options?: (string | number)[]
  choices?: string[]
}

export type ParamEntry = {
  path: string
  sub: string
  value: number | string
  descriptor: ParamDescriptor
  isDefault: boolean
}

export type InstrumentDescription = {
  id: string
  /** Instrument type (jb202, jt90, …); equals id for the built-in instance. */
  type: string
  active: boolean
  voices: string[]
  pattern: unknown
  level: number
  params: ParamEntry[]
}

export type EffectDescription = {
  target: string
  chain: { id: string; type: string; params: Record<string, unknown>; descriptors?: Record<string, ParamDescriptor> }[]
}

export type SessionDescription = {
  bpm: number
  swing: number
  bars: number
  instruments: InstrumentDescription[]
  effects: EffectDescription[]
  patterns: Record<string, string[]>
  arrangement: { bars: number; patterns: Record<string, string> }[]
  automation: string[]
  /** Per-instrument mixer state from mute_track / solo_track (absent until routing exists). */
  tracks?: Record<string, { mute: boolean; solo: boolean; volume: number }>
  anySolo?: boolean
}

export type ToolDef = { name: string; description: string; input_schema: unknown }

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export type AgentMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] }

export type LlmRequest = {
  system: unknown
  messages: AgentMessage[]
  tools: ToolDef[]
  max_tokens: number
  signal?: AbortSignal
}

export type LlmResponse = {
  stop_reason: string
  content: ContentBlock[]
  usage?: Record<string, number>
}

export type RenderResult = {
  buffer: AudioBuffer
  message: string
  bars: number
  bpm: number
  synths: string[]
  hasArrangement: boolean
}

export type AgentCallbacks = {
  onStart?: (task: string) => void
  onTool?: (name: string, input: Record<string, unknown>) => void
  onToolResult?: (result: string, name: string, isError: boolean) => void
  onAfterTool?: (name: string, session: JamSession) => void
  onResponse?: (text: string) => void
  onEnd?: (stopReason: string) => void
  onUsage?: (usage: Record<string, number>) => void
}

export interface JambotModule {
  VERSION: string
  JAMBOT_PROMPT: string
  WEB_PROMPT_ADDENDUM: string
  ready(): Promise<ToolDef[]>
  createSession(config?: { bpm?: number; swing?: number; bars?: number }): JamSession
  serializeSession(session: JamSession): unknown
  deserializeSession(data: unknown): JamSession
  renderSessionToBuffer(session: JamSession, bars: number): Promise<RenderResult>
  /** Loop-mode render length: the requested count (else session.bars), never shorter than the longest programmed pattern, 1..MAX_RENDER_BARS. */
  resolveRenderBars(session: JamSession, requested?: number): { bars: number; longest: number; longestId: string | null }
  MAX_RENDER_BARS: number
  WEB_MAX_TOKENS: number
  runAgent(opts: {
    task: string
    session: JamSession
    messages: AgentMessage[]
    llm: (req: LlmRequest) => Promise<LlmResponse>
    executeTool: (name: string, input: Record<string, unknown>, session: JamSession, context: unknown) => Promise<string>
    tools: ToolDef[]
    systemPrompt: string
    buildStateContext?: (session: JamSession) => string
    buildGenreContext?: (text: string) => string
    callbacks?: AgentCallbacks
    context?: unknown
    maxIterations?: number
    maxTokens?: number
    signal?: AbortSignal
  }): Promise<{ session: JamSession; messages: AgentMessage[]; iterations: number; stopReason: string }>
  executeTool(name: string, input: Record<string, unknown>, session: JamSession, context: unknown): Promise<string>
  buildSessionContext(session: JamSession): string
  describeSession(session: JamSession): SessionDescription
  readProducerValue(session: JamSession, path: string): number | string | undefined
  formatProducerValue(value: number | string, descriptor?: ParamDescriptor): string
  detectGenres(text: string): string[]
  buildGenreContext(keys: string[]): string
  audioBufferToWav(buffer: AudioBuffer): ArrayBuffer
}

export const JAMBOT_BUILD = meta.stamp

let _mod: Promise<JambotModule> | null = null

export function loadJambot(): Promise<JambotModule> {
  if (!_mod) {
    const url = `/jam/jambot-web.js?v=${encodeURIComponent(meta.stamp)}`
    // Bare import: keeps Next/Turbopack from trying to resolve the file.
    const dyn = new Function('u', 'return import(u)') as (u: string) => Promise<JambotModule>
    _mod = dyn(url).catch((err) => {
      _mod = null
      throw err
    })
  }
  return _mod
}
