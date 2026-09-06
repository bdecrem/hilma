// Chat-history hygiene for the browser-side agent loop.
//
// The Messages API rejects a history where an assistant `tool_use` is not
// answered by a `tool_result` in the very next user message (and a few other
// shapes: empty content, a first message that isn't from the user). A track
// can end up storing exactly that — the agent's turn got cut off by
// max_tokens after emitting tool calls, or an autosave snapshotted the
// messages between the tool_use push and the tool_result push and the tab
// died. Once stored, every later send 400s and the track is dead.
//
// sanitizeHistory() repairs such a history into something the API accepts,
// changing as little as possible. It is pure (never mutates its input, no
// React/DOM) and idempotent, so Studio runs it when a track loads, right
// before every send, and on the copy it saves.
//
// Tested from the engine's suite: ../vibeceo/jambot/tests/test-web-history.js
// imports this file directly.

import type { AgentMessage, ContentBlock } from './jambot'

type Role = AgentMessage['role']
type Block = ContentBlock & Record<string, unknown>

/** What the model is told about a tool call whose result never came back. */
export const CUT_OFF_RESULT = '(this tool call was cut off before it ran — nothing was executed)'

const roleOk = (r: unknown): r is Role => r === 'user' || r === 'assistant'

/**
 * One message, cleaned: well-formed role, non-empty content, only blocks that
 * make sense for the role (tool_use ← assistant, tool_result ← user). Returns
 * null when nothing usable is left.
 */
function normalizeMessage(raw: unknown): AgentMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const { role, content } = raw as { role?: unknown; content?: unknown }
  if (!roleOk(role)) return null
  if (typeof content === 'string') return content.trim() ? { role, content } : null
  if (!Array.isArray(content)) return null
  const blocks: Block[] = []
  for (const b of content) {
    if (!b || typeof b !== 'object' || typeof (b as Block).type !== 'string') continue
    const block = b as Block
    switch (block.type) {
      case 'text':
        if (typeof block.text === 'string' && block.text.trim()) blocks.push(block)
        break
      case 'tool_use':
        if (role !== 'assistant' || typeof block.id !== 'string' || typeof block.name !== 'string') break
        blocks.push(block.input && typeof block.input === 'object' ? block : { ...block, input: {} })
        break
      case 'tool_result':
        if (role === 'user' && typeof block.tool_use_id === 'string') blocks.push(block)
        break
      default:
        // Unknown block types pass through untouched; this is a repair pass,
        // not a schema — dropping what we don't know would lose data.
        blocks.push(block)
    }
  }
  return blocks.length ? { role, content: blocks } : null
}

function toolUseIds(m: AgentMessage): string[] {
  if (!Array.isArray(m.content)) return []
  return m.content.filter((b) => b.type === 'tool_use').map((b) => (b as { id: string }).id)
}

function toolResultIds(m: AgentMessage): string[] {
  if (!Array.isArray(m.content)) return []
  return m.content.filter((b) => b.type === 'tool_result').map((b) => (b as { tool_use_id: string }).tool_use_id)
}

function errorResult(id: string): ContentBlock {
  return { type: 'tool_result', tool_use_id: id, content: CUT_OFF_RESULT, is_error: true }
}

/** tool_result blocks first (the API wants them at the head of the message). */
function resultsFirst(blocks: ContentBlock[]): ContentBlock[] {
  const results = blocks.filter((b) => b.type === 'tool_result')
  return results.length ? [...results, ...blocks.filter((b) => b.type !== 'tool_result')] : blocks
}

/**
 * Repair an Anthropic-format history so the API will accept it:
 *
 *  - malformed / empty messages and empty text blocks are dropped
 *  - a trailing assistant message loses its tool_use blocks (no result can
 *    ever follow); if nothing else is in it, the message goes
 *  - an assistant tool_use elsewhere that has no tool_result in the next
 *    user message gets an is_error result inserted (merged into that user
 *    message, or as a new user message when two assistant turns touch)
 *  - tool_results that answer nothing (or answer twice) are dropped
 *  - the history starts with a user message
 *
 * Never mutates `input`; returns a new array (blocks it did not have to
 * change are shared).
 */
export function sanitizeHistory(input: unknown): AgentMessage[] {
  if (!Array.isArray(input)) return []
  const msgs: AgentMessage[] = []
  for (const raw of input) {
    const m = normalizeMessage(raw)
    if (m) msgs.push(m)
  }

  const out: AgentMessage[] = []
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]

    if (m.role === 'assistant') {
      const uses = toolUseIds(m)
      if (uses.length === 0) { out.push(m); continue }
      const next = msgs[i + 1]
      if (!next) {
        // Cut off after emitting tool calls: keep what it said, drop the calls.
        const kept = (m.content as ContentBlock[]).filter((b) => b.type !== 'tool_use')
        if (kept.length) out.push({ role: 'assistant', content: kept })
        continue
      }
      out.push(m)
      if (next.role === 'user') {
        const have = new Set(toolResultIds(next))
        const missing = uses.filter((id) => !have.has(id))
        if (missing.length) {
          const content = Array.isArray(next.content) ? next.content : [{ type: 'text', text: next.content } as ContentBlock]
          msgs[i + 1] = { role: 'user', content: [...missing.map(errorResult), ...content] }
        }
      } else {
        // assistant → assistant: answer the calls in between.
        out.push({ role: 'user', content: uses.map(errorResult) })
      }
      continue
    }

    // User message: tool_results may only answer the assistant message right
    // before it, once each.
    if (Array.isArray(m.content)) {
      const prev = out[out.length - 1]
      const allowed = new Set(prev && prev.role === 'assistant' ? toolUseIds(prev) : [])
      const seen = new Set<string>()
      let changed = false
      const kept = m.content.filter((b) => {
        if (b.type !== 'tool_result') return true
        const id = (b as { tool_use_id: string }).tool_use_id
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

/**
 * True when the API would accept this history's tool pairing and shape.
 * Cheap enough to run in tests and dev assertions.
 */
export function isWellFormedHistory(messages: AgentMessage[]): boolean {
  if (!Array.isArray(messages)) return false
  if (messages.length && messages[0].role !== 'user') return false
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (!roleOk(m.role)) return false
    if (typeof m.content === 'string') { if (!m.content.trim()) return false; continue }
    if (!Array.isArray(m.content) || m.content.length === 0) return false
    for (const b of m.content) {
      if (b.type === 'text' && !b.text.trim()) return false
      if (b.type === 'tool_use' && m.role !== 'assistant') return false
      if (b.type === 'tool_result' && m.role !== 'user') return false
    }
    const uses = toolUseIds(m)
    if (uses.length) {
      const next = messages[i + 1]
      if (!next || next.role !== 'user') return false
      const have = new Set(toolResultIds(next))
      if (uses.some((id) => !have.has(id))) return false
    }
    const results = toolResultIds(m)
    if (results.length) {
      const prev = messages[i - 1]
      const allowed = new Set(prev && prev.role === 'assistant' ? toolUseIds(prev) : [])
      if (results.some((id) => !allowed.has(id))) return false
      if (new Set(results).size !== results.length) return false
      const firstNonResult = (m.content as ContentBlock[]).findIndex((b) => b.type !== 'tool_result')
      const lastResult = (m.content as ContentBlock[]).map((b) => b.type).lastIndexOf('tool_result')
      if (firstNonResult !== -1 && firstNonResult < lastResult) return false
    }
  }
  return true
}
