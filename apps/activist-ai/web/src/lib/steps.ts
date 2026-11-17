// What Ola did, in plain words. The one place that knows opencode's tool names and arguments
// (2.3.0: glob, grep, read, write, edit, apply_patch, shell, todowrite, task, webfetch,
// websearch). A new tool falls through to "Used <name>", so nothing is hidden, only less
// well said. Verbs come from the design's fixed table: Looked through, Read, Wrote, Changed,
// Ran, Checked, Searched.
import { webRequestOf } from '../../server/webask.mjs'
import type { Problem, StepIcon, StretchReason } from './types.ts'

export interface Words {
  icon: StepIcon
  verb: string
  object: string
}

type Input = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** A path as the person knows it: relative to the workspace, or the bare name. */
export function shortPath(p: string, dir: string | null): string {
  if (!p) return ''
  if (dir && p.startsWith(dir.endsWith('/') ? dir : `${dir}/`)) return p.slice(dir.length + (dir.endsWith('/') ? 0 : 1))
  if (dir && p === dir) return 'the project folder'
  if (p.startsWith('/')) return p.split('/').filter(Boolean).pop() ?? p
  return p.replace(/^\.\//, '')
}

function pathOf(input: Input): string {
  return str(input.path) || str(input.filePath) || str(input.file)
}

/** A shell command, said plainly. */
export function describeCommand(command: string): Words {
  const c = command.trim()
  const web = webRequestOf(c)
  if (web?.kind === 'search') return { icon: 'search', verb: 'Searched the web for', object: web.item ? `“${web.item}”` : 'something' }
  if (web?.kind === 'fetch') return { icon: 'read', verb: 'Downloaded', object: web.item ? hostOf(web.item) : 'a document' }
  if (web?.kind === 'lookup') return { icon: 'search', verb: 'Looked up a paper:', object: web.item ? `“${web.item}”` : 'a reference' }
  if (/^ola-db\s+search\b/.test(c)) return { icon: 'search', verb: 'Searched the documents', object: '' }
  if (/^ola-db\s+load\b/.test(c)) return { icon: 'change', verb: 'Loaded a table into', object: 'the project’s data' }
  if (/^ola-db\s+(query|tables|describe)\b/.test(c)) return { icon: 'look', verb: 'Looked in', object: 'the project’s data' }
  const script = /^(?:python3?|node|Rscript|bash|sh)\s+(?!-)([\w./-]+\.(?:py|js|mjs|R|sh))/.exec(c)
  if (script) return { icon: 'run', verb: 'Ran', object: script[1].split('/').pop() ?? script[1] }
  if (/^(python3?|node|Rscript)\s+-[ce]\b/.test(c) || /^(python3?|node)\s*<</.test(c)) return { icon: 'run', verb: 'Ran a short program', object: '' }
  if (/^(awk|sed|perl|jq)\b/.test(c)) return { icon: 'run', verb: 'Ran a short program', object: '' }
  if (/^(pip3?|npm|uv)\s+install\b/.test(c)) return { icon: 'run', verb: 'Tried to install a tool', object: '' }
  if (/^(ls|find|tree)\b/.test(c)) return { icon: 'look', verb: 'Looked through', object: 'the project folder' }
  if (/^(cat|head|tail|less|wc)\b/.test(c)) {
    const file = c.split(/\s+/).slice(1).find((a) => !a.startsWith('-'))
    return { icon: 'read', verb: c.startsWith('wc') ? 'Counted the lines in' : 'Read', object: file ? (file.split('/').pop() ?? file) : 'a file' }
  }
  if (/^(grep|rg)\b/.test(c)) return { icon: 'search', verb: 'Searched the files', object: '' }
  if (/\b(test|pytest|check)\b/.test(c)) return { icon: 'check', verb: 'Checked the work', object: '' }
  if (/^(mkdir|cp|mv|touch)\b/.test(c)) return { icon: 'change', verb: 'Arranged files', object: '' }
  const first = c.split(/\s+/)[0] ?? ''
  return first && first.length <= 24 ? { icon: 'run', verb: 'Ran', object: first } : { icon: 'run', verb: 'Ran a command', object: '' }
}

export function describeTool(tool: string, input: Input, dir: string | null): Words {
  switch (tool) {
    case 'glob': {
      const pattern = str(input.pattern)
      const bare = pattern.replace(/^(\*\*\/)+/, '')
      if (!pattern || /^\**\/?\*?$/.test(pattern) || bare === '*') return { icon: 'look', verb: 'Looked through', object: 'the project folder' }
      if (!/[*?[\]{}]/.test(bare)) return { icon: 'look', verb: 'Looked for', object: bare }
      return { icon: 'look', verb: 'Looked through', object: `files like ${bare}` }
    }
    case 'list':
    case 'ls':
      return { icon: 'look', verb: 'Looked through', object: shortPath(pathOf(input), dir) || 'the project folder' }
    case 'grep':
      return { icon: 'search', verb: 'Searched the files for', object: `“${str(input.pattern)}”` }
    case 'read':
      return { icon: 'read', verb: 'Read', object: shortPath(pathOf(input), dir) || 'a file' }
    case 'write':
      return { icon: 'write', verb: 'Wrote', object: shortPath(pathOf(input), dir) || 'a file' }
    case 'edit':
    case 'patch':
    case 'apply_patch':
    case 'multiedit':
      return { icon: 'change', verb: 'Changed', object: shortPath(pathOf(input), dir) || 'a file' }
    case 'shell':
    case 'bash':
      return describeCommand(str(input.command))
    case 'todowrite':
    case 'todoread':
      return { icon: 'think', verb: 'Planned the next steps', object: '' }
    case 'task':
      return { icon: 'think', verb: 'Handed part of the work to a helper', object: str(input.description) }
    case 'webfetch':
      return { icon: 'search', verb: 'Opened a web page', object: str(input.url) }
    case 'websearch':
      return { icon: 'search', verb: 'Searched the web for', object: `“${str(input.query)}”` }
    case 'skill':
      return { icon: 'think', verb: 'Looked up how to do this', object: '' }
    default:
      return { icon: 'other', verb: 'Used', object: tool }
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** The short result on the right of a finished step, or null. */
export function describeResult(tool: string, input: Input, output: string, metadata: Record<string, unknown> | undefined): string | null {
  const meta = metadata ?? {}
  if (tool === 'glob' && typeof meta.count === 'number') return plural(meta.count, 'file')
  if (tool === 'grep' && typeof meta.matches === 'number') return plural(meta.matches, 'match', 'matches')
  if (tool === 'read') {
    const lines = output.split('\n').filter((l) => /^\s*\d+[:|\t]/.test(l)).length || output.split('\n').length
    return typeof input.limit === 'number' ? `the first ${plural(Math.min(lines, input.limit), 'line')}` : plural(lines, 'line')
  }
  if (tool === 'shell' || tool === 'bash') {
    const out = output.trim()
    if (out && !out.includes('\n') && out.length <= 32) return `printed ${out}`
    if (out) return plural(out.split('\n').length, 'line') + ' of output'
    return 'done'
  }
  return null
}

/** Did a shell step really work? opencode reports success even when the program exited non-zero. */
export function shellFailed(metadata: Record<string, unknown> | undefined): number | null {
  const exit = metadata?.exit
  return typeof exit === 'number' && exit !== 0 ? exit : null
}

function firstLine(s: string, max = 160): string {
  const line = s.split('\n').find((l) => l.trim()) ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** Why a step failed, in one plain sentence. */
export function stepProblem(error: { type?: string; message?: string } | undefined): Problem {
  const message = error?.message ?? ''
  if (/Invalid arguments for tool/i.test(message)) return { text: 'Ola asked for this the wrong way and can try again.', detail: message }
  if (/declined/i.test(message)) return { text: 'You said no, so Ola did not do this.', detail: message }
  if (/rejected|denied|not allowed/i.test(message)) return { text: 'Not allowed here, so Ola did not do it.', detail: message }
  if (/no such file|ENOENT|not found/i.test(message)) return { text: 'The file was not there.', detail: message }
  if (/timed? ?out/i.test(message)) return { text: 'This took too long and was stopped.', detail: message }
  return { text: firstLine(message) || 'This step did not work.', detail: message || null }
}

/** Why a whole request failed, in plain words, from opencode's structured error. */
export function runProblem(error: { type?: string; message?: string; status?: number } | undefined): Problem {
  const message = error?.message ?? ''
  const status = error?.status
  const detail = [error?.type, status, message].filter(Boolean).join(' · ') || null
  if (status === 429 || /quota|insufficient_quota/i.test(message)) return { text: 'Your share of the machine is used up for this week. Bart can raise it.', detail }
  if (status === 503 || status === 504 || /overloaded|timeout/i.test(message)) return { text: 'The model is busy or did not answer in time. Nothing was lost; try again in a minute.', detail }
  if (status && status >= 500) return { text: 'The model server had a problem. Nothing was lost; try again in a minute.', detail }
  if (status && status >= 400) return { text: 'The model could not take this request. Try saying it another way, or in smaller steps.', detail }
  return { text: firstLine(message) ? `It stopped: ${firstLine(message, 120)}` : 'It stopped before it finished.', detail }
}

// The step words are past tense ("Ran"); a question about the future needs the plain form.
const PRESENT: [RegExp, string][] = [
  [/^Ran\b/, 'Run'],
  [/^Looked\b/, 'Look'],
  [/^Counted\b/, 'Count'],
  [/^Searched\b/, 'Search'],
  [/^Checked\b/, 'Check'],
  [/^Arranged\b/, 'Arrange'],
  [/^Tried to install\b/, 'Install'],
]
export const present = (verb: string) => PRESENT.reduce((v, [re, to]) => v.replace(re, to), verb)

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return 'a document'
  }
}

/** A permission request as a question the person can answer. */
export function describeApproval(action: string, resources: string[], metadata: Record<string, unknown> | undefined, dir: string | null): { title: string; items: { label: string; detail: string | null }[]; web?: { kind: 'search' | 'fetch' | 'lookup'; item: string | null } | null } {
  const files = Array.isArray(metadata?.files) ? (metadata.files as { file?: string; patch?: string; status?: string }[]) : []
  // A web search or download: the question says exactly what would leave the machine.
  const webs = action === 'shell' || action === 'bash' ? resources.map((r) => webRequestOf(r)).filter((x) => !!x) : []
  if (webs.length && webs.length === resources.length) {
    const w = webs[0]!
    const what = w.item ?? 'something'
    return {
      title: w.kind === 'search' ? `Ola wants to search the web for: ${what}` : w.kind === 'lookup' ? `Ola wants to look up this paper: ${what}` : `Ola wants to download: ${what}`,
      items: resources.map((cmd, i) => ({ label: webs[i]!.kind === 'search' ? `Search for ${webs[i]!.item ? `“${webs[i]!.item}”` : 'this'}` : webs[i]!.kind === 'lookup' ? `Look up ${webs[i]!.item ? `“${webs[i]!.item}”` : 'this'}` : `Download ${webs[i]!.item ?? 'this'}`, detail: cmd })),
      web: w,
    }
  }
  if (action === 'shell' || action === 'bash') {
    return {
      title: 'Ola wants to run code on its computer',
      items: resources.map((cmd) => {
        const w = describeCommand(cmd)
        return { label: `${present(w.verb)}${w.object ? ` ${w.object}` : ''}`, detail: cmd }
      }),
    }
  }
  if (action === 'edit' || action === 'write' || action === 'apply_patch') {
    const items = files.length
      ? files.map((f) => ({ label: `${f.status === 'added' ? 'Make a new file:' : 'Change'} ${shortPath(f.file ?? '', dir)}`, detail: f.patch ?? null }))
      : resources.map((r) => ({ label: `Change ${shortPath(r, dir)}`, detail: null }))
    return { title: items.length === 1 ? 'Ola wants to write a file' : `Ola wants to write ${items.length} files`, items }
  }
  return { title: `Ola wants to ${action.replace(/_/g, ' ')}`, items: resources.map((r) => ({ label: r, detail: null })) }
}

// ---------------------------------------------------------------- Claude Code (Fallback to Claude)
//
// Claude Code names its tools differently (Read, Write, Edit, Bash, Glob, Grep, …) and calls the
// file argument file_path. They are said with the same fixed verbs as Ola's, by mapping each to
// its opencode counterpart; an unknown one falls through to "Used <name>", as for opencode.
const CLAUDE_TOOLS: Record<string, string> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  MultiEdit: 'multiedit',
  NotebookEdit: 'edit',
  Bash: 'shell',
  Glob: 'glob',
  Grep: 'grep',
  LS: 'list',
  Task: 'task',
  Agent: 'task',
  TodoWrite: 'todowrite',
  Skill: 'skill',
  ToolSearch: 'skill',
  WebFetch: 'webfetch',
  WebSearch: 'websearch',
}
/** opencode's name for a Claude Code tool (unknown ones keep their own name). */
export const claudeTool = (name: string): string => CLAUDE_TOOLS[name] ?? name
/** Claude Code's arguments, with the file argument where describeTool looks for it. */
export function claudeInput(input: Input): Input {
  const out: Input = { ...input }
  if (typeof input.file_path === 'string' && !out.path) out.path = input.file_path
  if (typeof input.notebook_path === 'string' && !out.path) out.path = input.notebook_path
  return out
}
export function describeClaudeTool(name: string, input: Input, dir: string | null): Words {
  if (name === 'EnterPlanMode' || name === 'ExitPlanMode') return { icon: 'think', verb: 'Planned the next steps', object: '' }
  return describeTool(claudeTool(name), claudeInput(input), dir)
}

/** Claude Code's permission question (can_use_tool) as a question the person can answer. */
export function describeClaudeApproval(name: string, input: Input, dir: string | null): { title: string; action: string; items: { label: string; detail: string | null }[] } {
  const tool = claudeTool(name)
  const a = claudeInput(input)
  if (tool === 'shell') {
    const cmd = str(a.command)
    const w = describeCommand(cmd)
    return { title: 'Claude wants to run code in your project', action: 'shell', items: [{ label: `${present(w.verb)}${w.object ? ` ${w.object}` : ''}`, detail: cmd }] }
  }
  if (tool === 'write' || tool === 'edit' || tool === 'multiedit') {
    const file = shortPath(str(a.path), dir) || 'a file'
    const edits = Array.isArray(a.edits) ? (a.edits as Input[]).map((e) => `- ${str(e?.old_string)}\n+ ${str(e?.new_string)}`).join('\n\n') : ''
    const detail = tool === 'write' ? str(a.content) : edits || (str(a.old_string) || str(a.new_string) ? `- ${str(a.old_string)}\n+ ${str(a.new_string)}` : '')
    return { title: 'Claude wants to write a file', action: 'edit', items: [{ label: `${tool === 'write' ? 'Write' : 'Change'} ${file}`, detail: detail || null }] }
  }
  const w = describeClaudeTool(name, input, dir)
  return { title: `Claude wants to ${present(w.verb).toLowerCase()}${w.object ? ` ${w.object}` : ''}`, action: tool, items: [{ label: name, detail: JSON.stringify(input, null, 2) }] }
}

/**
 * Did an Ola run get stuck, by what can be seen? Only these three, never a score: the run ended
 * in an error; it hit its step or token budget; or three tool calls in a row did not work.
 */
export type Stuck = 'error' | 'budget' | 'tools'
export function stuckReason(t: { status: string; error: Problem | null; steps: { status: string }[] }): Stuck | null {
  const detail = `${t.error?.text ?? ''} ${t.error?.detail ?? ''}`
  if (/429|quota|used up|max(imum)? ?steps|step limit|context length|too long|max_tokens/i.test(detail)) return 'budget'
  let row = 0
  for (const s of t.steps) row = s.status === 'failed' ? row + 1 : 0
  if (row >= 3) return 'tools'
  if (t.status === 'failed') return 'error'
  return null
}
/** The one sentence the person reads when Claude takes over by itself (kept for the record's older runs). */
export const STUCK_WORDS: Record<Stuck | 'always', string> = {
  error: 'Ola ran into an error, so Claude is trying the same request.',
  budget: 'Ola reached the most it may do for one request, so Claude is trying the same request.',
  tools: 'Three of Ola’s steps in a row did not work, so Claude is trying the same request.',
  always: 'This project hands every request to Claude.',
}

// ---------------------------------------------------------------- "a stretch for Ola's own model"
//
// Before a run, a few cheap checks on the request alone, kept small and conservative: they should
// almost never fire on an ordinary request. Every threshold is here, in one object.
export const STRETCH_CHECKS = {
  /** Ola's own model's context, in tokens (workspace/opencode.jsonc, ola/general). */
  contextTokens: 131_072,
  /** A rough count for text: bytes per token. */
  bytesPerToken: 4,
  /** The files a request names, together, count as far larger than the context past this many contexts. */
  overContext: 3,
  /** Only files that are read as text count (a PDF's bytes are not its words). */
  textLike: /\.(txt|md|markdown|csv|tsv|json|jsonl|ndjson|html?|xml|ya?ml|log|py|js|ts|sql|tex|rtf)$/i,
  /** A long multi-part build: at least this many listed parts… */
  buildParts: 8,
  /** …in a request at least this long… */
  buildMinChars: 800,
  /** …that asks for something to be made. */
  buildVerb: /\b(build|make|create|write|set up|develop|implement|design)\b/i,
}

/** Before a run: does the request alone look like a stretch? 'big_files', 'long_build', or null. */
export function precheck(request: string, files: { path: string; size: number }[], c = STRETCH_CHECKS): StretchReason | null {
  const text = request.toLowerCase()
  const named = files.filter((f) => c.textLike.test(f.path) && (text.includes(f.path.toLowerCase()) || text.includes(f.path.split('/').pop()!.toLowerCase())))
  const bytes = named.reduce((n, f) => n + f.size, 0)
  if (bytes / c.bytesPerToken > c.overContext * c.contextTokens) return 'big_files'
  const parts = request.split('\n').filter((l) => /^\s*(\d{1,3}[.)]|[-*•])\s+\S/.test(l)).length
  if (request.length >= c.buildMinChars && parts >= c.buildParts && c.buildVerb.test(request)) return 'long_build'
  return null
}

/** Why Ola suggests handing the request over, in one sentence. */
export const STRETCH_WHY: Record<StretchReason, string> = {
  error: 'Ola’s own model ran into an error on this request.',
  budget: 'Ola’s own model reached the most it may do for one request.',
  tools: 'Three of Ola’s steps in a row did not work.',
  big_files: 'The files this request names are much larger than Ola’s own model can read at once.',
  long_build: 'This is a long build in many parts.',
}

/** The sentence on a reply that was handed over without asking ("Hand it over without asking"). */
export function handoffWords(reason: StretchReason, to: string): string {
  return `${STRETCH_WHY[reason]} This project hands such requests to ${to}, so it is working on it.`
}
