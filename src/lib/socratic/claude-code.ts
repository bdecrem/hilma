// Local backend: the tutor and the observer through the Claude Code CLI on
// this machine, which runs on the Max subscription (its OAuth login) instead
// of API credit. `SOC_BACKEND=claude-code` in .env.local turns it on.
//
// Only for local runs by the account holder: the login is personal, the CLI
// is not on Vercel, and production keeps the API path in anthropic.ts.
//
// Shape: one `claude -p` per call, no tools, no settings, no MCP servers, a
// custom system prompt and `--json-schema` for the structured output (the
// CLI implements it as a StructuredOutput tool call, so the reply streams as
// `input_json_delta` chunks). The tutor's conversation is a Claude Code
// session keyed by the socratic session id (`--session-id` on the first
// call, `--resume` after); the observer's one-shot calls are not persisted.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function useClaudeCode(): boolean {
  return process.env.SOC_BACKEND === 'claude-code'
}

/** A directory with no CLAUDE.md above it, so the CLI sees only our prompt. */
const CWD = join(homedir(), 'Library', 'Caches', 'socratic-claude-code')

/** Whether the CLI already has a session file for this id (a retry after a failed first turn). */
function sessionOnDisk(id: string): boolean {
  const root = join(homedir(), '.claude', 'projects')
  if (!existsSync(root)) return false
  return readdirSync(root).some((dir) => existsSync(join(root, dir, `${id}.jsonl`)))
}

export type ClaudeCodeCall = {
  model: string
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  system: string
  schema: object
  /** The user message for this turn. */
  prompt: string
  /** Persisted conversation to start or continue; omit for a one-shot call. */
  session?: { id: string }
  /** The structured output as it is being written (accumulated JSON text). */
  onPartialJson?: (json: string) => void
}

export type ClaudeCodeResult = {
  output: unknown
  usage: Record<string, unknown>
  costUsd: number
  latencyMs: number
}

type StreamLine =
  | { type: 'stream_event'; event: { type: string; delta?: { type: string; partial_json?: string } } }
  | { type: 'result'; is_error: boolean; subtype: string; result?: string; structured_output?: unknown; usage?: Record<string, unknown>; total_cost_usd?: number }
  | { type: string }

export function runClaudeCode(call: ClaudeCodeCall): Promise<ClaudeCodeResult> {
  mkdirSync(CWD, { recursive: true })
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--model', call.model,
    '--effort', call.effort,
    '--tools', '',
    '--setting-sources', '',
    '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}',
    '--system-prompt', call.system,
    '--json-schema', JSON.stringify(call.schema),
  ]
  if (call.session) {
    args.push(sessionOnDisk(call.session.id) ? '--resume' : '--session-id', call.session.id)
  } else {
    args.push('--no-session-persistence')
  }

  // The CLI resolves ANTHROPIC_API_KEY before the login; drop it so the
  // subscription is used (that is the point of this backend).
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.CLAUDECODE

  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: CWD, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let json = ''
    let stderr = ''
    let pending = ''
    let result: Extract<StreamLine, { type: 'result' }> | null = null

    const handleLine = (line: string) => {
      if (!line.trim()) return
      let msg: StreamLine
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      if (msg.type === 'stream_event') {
        const ev = (msg as Extract<StreamLine, { type: 'stream_event' }>).event
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta' && ev.delta.partial_json) {
          json += ev.delta.partial_json
          call.onPartialJson?.(json)
        }
      } else if (msg.type === 'result') {
        result = msg as Extract<StreamLine, { type: 'result' }>
      }
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const l of lines) handleLine(l)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (e) => reject(new Error(`claude CLI could not start: ${e.message}`)))
    child.on('close', (code) => {
      if (pending) handleLine(pending)
      const r = result
      if (!r) return reject(new Error(`claude CLI exited ${code} without a result${stderr ? `: ${stderr.trim()}` : ''}`))
      if (r.is_error) return reject(new Error(`claude CLI: ${r.result || r.subtype}`))
      if (r.structured_output === undefined) return reject(new Error('claude CLI returned no structured output'))
      resolve({ output: r.structured_output, usage: r.usage ?? {}, costUsd: r.total_cost_usd ?? 0, latencyMs: Date.now() - t0 })
    })
    child.stdin.end(call.prompt)
  })
}
