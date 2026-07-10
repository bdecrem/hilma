// Provider-agnostic chat completion for F2.
//
// One entry point (`llmComplete`) over a model registry, so the chat layer
// never talks to a vendor SDK directly. Adding a model = one MODELS entry.
//
// Providers:
//   - anthropic: @anthropic-ai/sdk (Messages API)
//   - together:  Together.ai OpenAI-compatible /v1/chat/completions
//
// Tools are declared once in the Anthropic shape ({name, description,
// input_schema}); the Together driver converts them to OpenAI function
// format and normalizes the response back to a single LlmResult.

import Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// Registry

export type LlmModelKey = 'sonnet-4-6' | 'opus-4-8' | 'fable-5' | 'glm-5.2'

type ModelSpec = {
  provider: 'anthropic' | 'together'
  apiModel: string
  label: string
  /** Anthropic thinking config. Omit entirely for models where thinking is
   *  always on (Fable 5) or not wanted (Sonnet legacy path). */
  thinking?: { type: 'adaptive' }
  /** output_config.effort — only sent when set. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** Extra anthropic-beta headers (comma-joined). */
  betaHeaders?: string[]
  /** Thinking tokens count against max_tokens; models that think need
   *  headroom beyond the small caps the chat layer asks for. */
  maxTokensFloor?: number
  /** How many chars of source material the chat layer may inline into the
   *  system prompt for this model. Roughly 3.5 chars/token; set well under
   *  the model's context window to leave room for history, tool schemas,
   *  thinking, and output. Book-sized topics get truncated to this. */
  contextCharBudget: number
  /** On stop_reason "refusal" (Fable 5 safety classifiers), retry the same
   *  request once on this model key. */
  refusalFallback?: LlmModelKey
}

// 'sonnet-4-6' is the legacy default — requests that don't name a model
// (the web app) keep today's exact behavior. The iOS/macOS picker exposes
// the other three.
const MODELS: Record<LlmModelKey, ModelSpec> = {
  'sonnet-4-6': {
    provider: 'anthropic',
    apiModel: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    // 1M-token context window so full transcripts / books fit.
    betaHeaders: ['context-1m-2025-08-07'],
    contextCharBudget: 3_000_000,
  },
  'opus-4-8': {
    provider: 'anthropic',
    apiModel: 'claude-opus-4-8',
    label: 'Opus 4.8',
    // Opus 4.8 runs without thinking unless asked; adaptive is the
    // recommended default. 1M context is standard, no beta needed.
    thinking: { type: 'adaptive' },
    maxTokensFloor: 8192,
    contextCharBudget: 3_000_000,
  },
  'fable-5': {
    provider: 'anthropic',
    apiModel: 'claude-fable-5',
    label: 'Fable 5',
    // Thinking is always on for Fable 5 — never send a thinking config.
    effort: 'medium',
    maxTokensFloor: 8192,
    refusalFallback: 'opus-4-8',
    contextCharBudget: 3_000_000,
  },
  'glm-5.2': {
    provider: 'together',
    apiModel: 'zai-org/GLM-5.2',
    label: 'GLM-5.2',
    // GLM-5.2 thinks by default; reasoning tokens draw from max_tokens.
    maxTokensFloor: 8192,
    // 262K-token window — far smaller than the Claude models' 1M. ~600K
    // chars ≈ 170K tokens of source leaves room for history + output.
    contextCharBudget: 600_000,
  },
}

/** Keys the clients may select. The legacy default stays internal. */
export const SELECTABLE_MODELS: LlmModelKey[] = ['opus-4-8', 'fable-5', 'glm-5.2']

export const DEFAULT_MODEL: LlmModelKey = 'sonnet-4-6'

export function isModelKey(key: string): key is LlmModelKey {
  return key in MODELS
}

// ---------------------------------------------------------------------------
// Request / result shapes

export type LlmTool = {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export type LlmMessage = { role: 'user' | 'assistant'; content: string }

export type LlmRequest = {
  /** Registry key. Missing/null → DEFAULT_MODEL (legacy web behavior). */
  model?: string | null
  system: string
  messages: LlmMessage[]
  maxTokens: number
  tools?: LlmTool[]
  /** Force the model to call one of `tools` (Anthropic tool_choice "any" /
   *  OpenAI "required"). */
  forceTool?: boolean
}

export type LlmResult =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }

export function resolveModel(key: string | null | undefined): LlmModelKey {
  if (!key) return DEFAULT_MODEL
  if (!isModelKey(key)) throw new Error(`Unknown model key: ${key}`)
  return key
}

/** Char budget for inlined source material on this model. The chat layer
 *  truncates topic sources to this before building the system prompt, so a
 *  book-sized topic degrades to a truncated source instead of a hard API
 *  error on smaller-context models. */
export function contextCharBudget(key: string | null | undefined): number {
  return MODELS[resolveModel(key)].contextCharBudget
}

// ---------------------------------------------------------------------------
// Entry point

export async function llmComplete(req: LlmRequest): Promise<LlmResult> {
  const key = resolveModel(req.model)
  const spec = MODELS[key]
  const maxTokens = Math.max(req.maxTokens, spec.maxTokensFloor ?? 0)

  if (spec.provider === 'anthropic') {
    return anthropicComplete(key, spec, req, maxTokens)
  }
  return togetherComplete(spec, req, maxTokens)
}

// ---------------------------------------------------------------------------
// Anthropic driver

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

async function anthropicComplete(
  key: LlmModelKey,
  spec: ModelSpec,
  req: LlmRequest,
  maxTokens: number,
): Promise<LlmResult> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: spec.apiModel,
    max_tokens: maxTokens,
    system: [
      { type: 'text', text: req.system, cache_control: { type: 'ephemeral' } },
    ],
    messages: req.messages,
  }
  if (spec.thinking) params.thinking = spec.thinking
  if (spec.effort) params.output_config = { effort: spec.effort }
  if (req.tools && req.tools.length > 0) {
    params.tools = req.tools
    if (req.forceTool) params.tool_choice = { type: 'any' }
  }

  const options = spec.betaHeaders?.length
    ? { headers: { 'anthropic-beta': spec.betaHeaders.join(',') } }
    : undefined

  const response = await anthropic().messages.create(params, options)

  // Safety classifiers (Fable 5) return HTTP 200 with stop_reason "refusal".
  // Retry the identical request once on the fallback model.
  if (response.stop_reason === 'refusal') {
    if (spec.refusalFallback) {
      return llmComplete({ ...req, model: spec.refusalFallback })
    }
    throw new Error(`${key} refused the request`)
  }

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (toolUse && toolUse.type === 'tool_use') {
    return {
      type: 'tool_call',
      name: toolUse.name,
      input: toolUse.input as Record<string, unknown>,
    }
  }
  const text = response.content.find((b) => b.type === 'text')
  return { type: 'text', text: text?.type === 'text' ? text.text.trim() : '' }
}

// ---------------------------------------------------------------------------
// Together driver (OpenAI-compatible chat completions)

type TogetherToolCall = {
  function?: { name?: string; arguments?: string }
}
type TogetherResponse = {
  choices?: {
    message?: {
      content?: string | null
      tool_calls?: TogetherToolCall[]
    }
  }[]
}

async function togetherComplete(
  spec: ModelSpec,
  req: LlmRequest,
  maxTokens: number,
): Promise<LlmResult> {
  const apiKey = process.env.TOGETHER_API_KEY
  if (!apiKey) throw new Error('TOGETHER_API_KEY is not set')

  const body: Record<string, unknown> = {
    model: spec.apiModel,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: req.system },
      ...req.messages,
    ],
  }
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))
    if (req.forceTool) body.tool_choice = 'required'
  }

  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Together API ${res.status}: ${detail.slice(0, 300)}`)
  }

  const data = (await res.json()) as TogetherResponse
  const message = data.choices?.[0]?.message
  if (!message) throw new Error('Together API returned no choices')

  const call = message.tool_calls?.[0]
  if (call?.function?.name) {
    let input: Record<string, unknown> = {}
    try {
      input = JSON.parse(call.function.arguments || '{}')
    } catch {
      throw new Error(
        `GLM returned unparseable tool arguments for ${call.function.name}`,
      )
    }
    return { type: 'tool_call', name: call.function.name, input }
  }
  return { type: 'text', text: (message.content ?? '').trim() }
}
