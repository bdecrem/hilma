// What Ola did, in plain words. The one place that knows opencode's tool names and arguments
// (2.3.0: glob, grep, read, write, edit, apply_patch, shell, todowrite, task, webfetch,
// websearch). A new tool falls through to "Used <name>", so nothing is hidden, only less
// well said. Verbs come from the design's fixed table: Looked through, Read, Wrote, Changed,
// Ran, Checked, Searched.
import { webRequestOf } from '../../server/webask.mjs'
import { publishAskOf, publishRequestOf } from '../../server/publishask.mjs'
import { publishCard } from '../../server/cards.mjs'
import type { Problem, PublishCard, StepIcon, StretchReason } from './types.ts'

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

/** The step that wrote a job down: the conversation then points at Jobs, where it is started. */
export const JOB_PROPOSED = 'Wrote down a job'

/**
 * The parts of a shell command that run one after another (`&&`, `||`, `;`, new lines), with the
 * bodies of heredocs taken out, so `cd /work && cat > t.js <<EOF … EOF` + `ola-test a.js t.js` is
 * three parts and the words of a test file never count as a command (OLA-474).
 */
export function commandParts(command: string): string[] {
  const bare = command.replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '<<$2$3')
  return bare.split(/&&|\|\||;|\n/).map((p) => p.trim()).filter(Boolean)
}

/** The command a step is about: the test run in a chain, or the one command after `cd <folder> &&`. */
function mainCommand(c: string): string {
  const parts = commandParts(c)
  if (parts.length < 2) return c
  const test = parts.find((p) => TEST_COMMAND.test(p))
  if (test) return test
  const rest = parts.filter((p) => !/^cd(\s|$)/.test(p))
  return rest.length === 1 ? rest[0] : c
}

/** A shell command, said plainly. */
export function describeCommand(command: string): Words {
  const c = mainCommand(command.trim())
  const web = webRequestOf(c)
  if (web?.kind === 'search') return { icon: 'search', verb: 'Searched the web for', object: web.item ? `“${web.item}”` : 'something' }
  if (web?.kind === 'fetch') return { icon: 'read', verb: 'Downloaded', object: web.item ? hostOf(web.item) : 'a document' }
  if (web?.kind === 'lookup') return { icon: 'search', verb: 'Looked up a paper:', object: web.item ? `“${web.item}”` : 'a reference' }
  const pub = publishRequestOf(c)
  if (pub?.status) return { icon: 'look', verb: 'Checked', object: 'whether the page is published' }
  if (pub?.unpublish) return { icon: 'change', verb: 'Took down', object: 'the published pages' }
  if (pub?.sel) return { icon: 'change', verb: 'Published', object: `${pub.files.length === 1 ? 'one file' : `${pub.files.length} files`} at sites.ola.cx` }
  if (/^ola-db\s+search\b/.test(c)) return { icon: 'search', verb: 'Searched the documents', object: '' }
  if (/^ola-db\s+load\b/.test(c)) return { icon: 'change', verb: 'Loaded a table into', object: 'the project’s data' }
  if (/^ola-db\s+(query|tables|describe)\b/.test(c)) return { icon: 'look', verb: 'Looked in', object: 'the project’s data' }
  // Ola's own commands in the project, said as what they do (a person never needs their names).
  const own = /^(?:\/opt\/ola\/bin\/)?(ola-[a-z-]+)(?=\s|$)/.exec(c)
  // The first argument that names a file (has an extension and is not an option).
  const file = (c.split(/\s+/).slice(1).map((a) => a.replace(/^["']|["']$/g, '')).find((a) => !a.startsWith('-') && /\.\w{1,5}$/.test(a)) ?? '').split('/').pop() ?? ''
  const OWN: Record<string, Words> = {
    'ola-page': { icon: 'check', verb: 'Looked at how the page shows', object: file },
    'ola-test': { icon: 'check', verb: 'Tested', object: file || 'its work' },
    'ola-view': { icon: 'look', verb: 'Looked at', object: file },
    'ola-see': { icon: 'look', verb: 'Looked at the picture', object: file },
    'ola-ocr': { icon: 'read', verb: 'Read the scanned pages of', object: file },
    'ola-translate': { icon: 'change', verb: 'Translated', object: file },
    'ola-draw': { icon: 'write', verb: 'Drew a picture', object: '' },
    'ola-embed': { icon: 'search', verb: 'Searched the documents', object: '' },
    'ola-rerank': { icon: 'search', verb: 'Searched the documents', object: '' },
    'ola-transcribe': { icon: 'read', verb: 'Wrote down what is said in', object: file },
    'ola-unzip': { icon: 'change', verb: 'Unpacked', object: file },
    'ola-files': { icon: 'look', verb: 'Looked through', object: 'the project folder' },
  }
  if (own?.[1] === 'ola-batch') {
    const sub = c.split(/\s+/)[1] ?? ''
    if (sub === 'propose') return { icon: 'write', verb: JOB_PROPOSED, object: '' }
    if (sub === 'results') return { icon: 'read', verb: 'Read the job’s answers', object: '' }
    if (sub === 'check') return { icon: 'check', verb: 'Checked a quote in', object: 'the document' }
    if (sub === 'run') return { icon: 'run', verb: 'Tried to start the job', object: '' }
    return { icon: 'look', verb: 'Checked on the job', object: '' }
  }
  if (own && OWN[own[1]]) return OWN[own[1]]
  if (own) return { icon: 'run', verb: 'Used one of Ola’s tools', object: '' }
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
  if (/^sleep\b/.test(c)) return { icon: 'think', verb: 'Waited', object: '' }
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
    case 'question':
      return { icon: 'think', verb: 'Asked you', object: str((input.questions as any)?.[0]?.question ?? (input.questions as any)?.[0]?.header) }
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
  // The tool's own message ("ripgrep execution failed") is the machine's word: under Show details.
  return { text: 'This step did not work. Ola can try another way.', detail: message || null }
}

/**
 * The week's allowance of Ola's model is used up (OLA-205): whose it is and the moment it starts
 * again, in the reader's own time zone ("Your weekly allowance of Ola's model is used up. It starts
 * again on Sunday, November 22, at 4 pm."). The moment is the instant in the gateway's message when
 * it carries one, else the gateway's rule: weeks start Monday 00:00 UTC. A person's own computer
 * hears "Your", a project's workspace "This project's". No token counts, no settings, no names.
 */
export function quotaProblem(message: string, now: number = Date.now()): string {
  const whose = /your weekly allowance/i.test(message) ? 'Your' : /project|this week's quota/i.test(message) ? "This project's" : 'Your'
  const iso = message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z/)?.[0]
  const at = iso ? new Date(iso) : nextWeekStart(now)
  return `${whose} weekly allowance of Ola's model is used up. It starts again ${when(at)}.`
}
function nextWeekStart(now: number): Date {
  const d = new Date(now)
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 7))
}
function when(d: Date): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const h = d.getHours(), m = d.getMinutes()
  const time = `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`
  return h === 0 && m === 0 ? `at the start of ${day}` : `on ${day}, at ${time}`
}

/** Why a whole request failed, in plain words, from opencode's structured error. */
export function runProblem(error: { type?: string; message?: string; status?: number } | undefined): Problem {
  const message = error?.message ?? ''
  const status = error?.status
  const detail = [error?.type, status, message].filter(Boolean).join(' · ') || null
  if (status === 429 || /quota|insufficient_quota|weekly allowance/i.test(message)) return { text: quotaProblem(message), detail }
  if (status === 503 || status === 504 || /overloaded|timeout/i.test(message)) return { text: 'The model is busy or did not answer in time. Nothing was lost; try again in a minute.', detail }
  if (status && status >= 500) return { text: 'The model server had a problem. Nothing was lost; try again in a minute.', detail }
  if (status && status >= 400) return { text: 'The model could not take this request. Try saying it another way, or in smaller steps.', detail }
  // "Step interrupted" and the like are the machine's words; the detail keeps them.
  if (/interrupt|abort|cancel/i.test(message)) return { text: 'This stopped before it finished. What Ola did so far stays as it is.', detail }
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
export function describeApproval(action: string, resources: string[], metadata: Record<string, unknown> | undefined, dir: string | null): { title: string; items: { label: string; detail: string | null }[]; web?: { kind: 'search' | 'fetch' | 'lookup'; item: string | null } | null; publish?: { sel: { folder: string } | { page: string }; files: string[] } | null; card?: PublishCard | null } {
  const files = Array.isArray(metadata?.files) ? (metadata.files as { file?: string; patch?: string; status?: string }[]) : []
  // Publishing from the conversation (OLA-230): the sheet shows the list that would go public.
  // The card's words come from server/cards.mjs (OLA-325), the same in the Mac and iPhone apps; never the command.
  const card = publishCard(action, resources)
  if (card?.kind === 'unpublish') return { title: card.title, items: [], publish: null, card }
  if (card?.kind === 'publish') return { title: card.title, items: card.files.map((f) => ({ label: f, detail: null })), publish: card.sel ? { sel: card.sel, files: card.files } : null, card }
  const pub = publishAskOf(action, resources)
  if (pub && !pub.status) return { title: 'Ola wants to publish this on the web', items: resources.map((cmd) => ({ label: 'Publish', detail: cmd })), publish: null }
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
  // The simple confidence check (OLA-144, Bart, 2026-11-18: "a simple heuristic and then we'll
  // see if in practice that's useful"): offer the card before a task that is big (many documents)
  // or of a kind the evaluations show Ola's own model often fails (design; long jobs are above).
  /** Many documents: the request names at least this many of the project's files… */
  manyNamed: 8,
  /** …or asks for all of them ("every PDF", "all the reports")… */
  allOfThem: /\b(all|every|each)\b[^.?!\n]{0,40}\b(files?|documents?|docs|pdfs?|papers?|reports?|studies|letters|transcripts|minutes|laws|pages)\b/i,
  /** …in a project with at least this many documents. */
  manyDocs: 20,
  /** What counts as a document. */
  docLike: /\.(pdf|docx?|txt|md|markdown|rtf|csv|tsv|xlsx?|pptx?|html?|json|epub)$/i,
  /** Design: the request asks for a designed thing (evals/results/summary-design.json: without
   *  help the model's pages mostly fail as slop or broken)… */
  designThing: /\b(landing page|home ?page|web ?site|poster|flyer|logo|branding|brochure)\b/i,
  /** …to be made… */
  designVerb: /\b(build|make|create|draw|lay ?out|restyle)\b/i,
  /** …or says "design a…" outright ("the design of this survey" is a question, not a request to make). */
  designAsk: /\b(re)?design (a|an|the|me|us|our|my|some|this|that)\b/i,
  /** Off since OLA-168: design requests go to the design model, not to a fallback. */
  designBeforeRun: false,
}

/** Before a run: does the request alone look like a stretch? 'big_files', 'many_files', 'long_build', 'design', or null. */
export function precheck(request: string, files: { path: string; size: number }[], c = STRETCH_CHECKS): StretchReason | null {
  const text = request.toLowerCase()
  const named = files.filter((f) => c.textLike.test(f.path) && (text.includes(f.path.toLowerCase()) || text.includes(f.path.split('/').pop()!.toLowerCase())))
  const bytes = named.reduce((n, f) => n + f.size, 0)
  if (bytes / c.bytesPerToken > c.overContext * c.contextTokens) return 'big_files'
  const namedAny = files.filter((f) => text.includes(f.path.toLowerCase()) || text.includes(f.path.split('/').pop()!.toLowerCase())).length
  if (namedAny >= c.manyNamed) return 'many_files'
  if (c.allOfThem.test(request) && files.filter((f) => c.docLike.test(f.path)).length >= c.manyDocs) return 'many_files'
  const parts = request.split('\n').filter((l) => /^\s*(\d{1,3}[.)]|[-*•])\s+\S/.test(l)).length
  if (request.length >= c.buildMinChars && parts >= c.buildParts && c.buildVerb.test(request)) return 'long_build'
  // Design is no longer a stretch (OLA-168, Bart, Nov 20): design work runs on Ola's design model
  // (gateway/design.mjs) once the designer skill is loaded, so the card is not offered for it before a run.
  if (c.designBeforeRun && (c.designAsk.test(request) || (c.designThing.test(request) && c.designVerb.test(request)))) return 'design'
  return null
}

/** A command (one part of a step's command, see commandParts) that runs a test (OLA-474: ola-test, or the model's own pytest / unittest). */
export const TEST_COMMAND = /^(?:\/opt\/ola\/bin\/)?ola-test(?=\s|$)|^(?:python3?\s+-m\s+)?(?:pytest|unittest)\b|^python3?\s+\S*test\w*\.py\b/

/**
 * A turn Ola itself sends its model is marked, so the page shows it as Ola's line, never as the
 * person's words. Today the hand-off below and the pressed-page follow-up (POKE_MARK); conversations from Nov 26 and 27 also hold the
 * "run a test" and "finish it" turns of the removed OLA-479, shown in one plain sentence each.
 */
export const NUDGE_MARK = '<ola-nudge>'
/**
 * A hand-off without asking (OLA-486): the larger model is told, as Ola, that it takes the request
 * over and does the work. The page shows the first line (the sentence of why) as Ola's, never the
 * person's request a second time. The apps' `Escalate.handoffPrompt`.
 */
export const HANDOFF_MARK = `${NUDGE_MARK}<ola-handoff>`
export const handoffPrompt = (sentence: string, request: string) =>
  `${HANDOFF_MARK}${sentence}\n\nFrom Ola, not the person: Ola’s own model could not finish the person’s request in this conversation, so you are taking it over. Do the work now, in full, building on what is already in the project, and check it; do not ask the person what they want. Their request: ${request}`
/** Ola pressed the page its model handed over and found something dead (OLA-515, lib/poke.ts): its one follow-up, first line shown. */
export const POKE_MARK = `${NUDGE_MARK}<ola-poke>`
/** A request as the person sees it, and whether Ola sent it. */
export function nudgeOf(text: string): { request: string; nudge: boolean } {
  if (text.startsWith(POKE_MARK)) return { request: text.slice(POKE_MARK.length).split('\n')[0], nudge: true }
  if (text.startsWith(HANDOFF_MARK)) return { request: text.slice(HANDOFF_MARK.length).split('\n')[0], nudge: true }
  if (!text.startsWith(NUDGE_MARK)) return { request: text, nudge: false }
  // An older conversation's OLA-479 turns: "finish as well as you can", or "run a test first".
  const finish = /chose not to hand this request/.test(text)
  return { request: finish ? 'Ola asked its model to finish as well as it can and to say plainly what it could not check.' : 'Ola asked its model to run a test of the logic before handing it over.', nudge: true }
}

type TestStep = { tool: string; status: string; detail: { input: string; output?: string } }
/**
 * Was this step a test run, and did it pass? Null when no part of its command runs a test. A chain's
 * exit code is its last command's (`ola-test … | tail`), so ola-test's own last line counts too:
 * "N passed, M failed[, K errors]" fails on any failure or error, or when no check passed.
 */
export function testOutcome(s: TestStep): 'passed' | 'failed' | null {
  if (s.tool !== 'shell' && s.tool !== 'bash') return null
  if (!commandParts(s.detail.input).some((p) => TEST_COMMAND.test(p))) return null
  if (s.status === 'failed') return 'failed'
  const m = [...(s.detail.output ?? '').matchAll(/^(\d+) passed, (\d+) failed(?:, (\d+) errors?)?\s*$/gm)].pop()
  return m && (+m[2] > 0 || +(m[3] ?? 0) > 0 || +m[1] === 0) ? 'failed' : 'passed'
}

/** Why Ola suggests handing the request over, in one sentence. */
export const STRETCH_WHY: Record<StretchReason, string> = {
  error: 'Ola’s own model ran into an error on this request.',
  budget: 'Ola’s own model reached the most it may do for one request.',
  tools: 'Three of Ola’s steps in a row did not work.',
  big_files: 'The files this request names are much larger than Ola’s own model can read at once.',
  long_build: 'This is a long build in many parts.',
  many_files: 'This request covers many documents at once.',
  design: 'Design is the kind of work Ola’s own model is weakest at today.',
  dead: 'Some of the page still does not work after Ola asked its model to fix it.',
}

/** The sentence on a reply that was handed over without asking ("Hand it over without asking"). */
export function handoffWords(reason: StretchReason, to: string): string {
  return `${STRETCH_WHY[reason]} This project hands such requests to ${to}, so it is working on it.`
}
