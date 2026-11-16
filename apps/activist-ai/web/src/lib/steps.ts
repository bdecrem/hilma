// What Ola did, in plain words. The one place that knows opencode's tool names and arguments
// (2.3.0: glob, grep, read, write, edit, apply_patch, shell, todowrite, task, webfetch,
// websearch). A new tool falls through to "Used <name>", so nothing is hidden, only less
// well said. Verbs come from the design's fixed table: Looked through, Read, Wrote, Changed,
// Ran, Checked, Searched.
import type { Problem, StepIcon } from './types.ts'

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

/** A permission request as a question the person can answer. */
export function describeApproval(action: string, resources: string[], metadata: Record<string, unknown> | undefined, dir: string | null): { title: string; items: { label: string; detail: string | null }[] } {
  const files = Array.isArray(metadata?.files) ? (metadata.files as { file?: string; patch?: string; status?: string }[]) : []
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
