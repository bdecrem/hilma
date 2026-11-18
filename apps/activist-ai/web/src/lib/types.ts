// The shapes the page works with. The front desk (dev.mjs today, the real one on the Studio
// later) serves ProjectPayload and FileEntry; opencode's events are mapped to Turn and Step in
// conversation.ts. Nothing here imports opencode's types, so an upgrade changes one module.

export type MadeBy = 'bart' | 'ola' | 'you' | 'group'

export interface Byline {
  madeBy: MadeBy
  /** Names, when a group made it ("Ruth, Dana and Ola"). */
  who?: string
  /** ISO time of the last change. */
  when: string
  /** The files it was made from, as the person knows them. */
  from: string[]
}

interface ThingBase {
  id: string
  title: string
  byline: Byline
  /** 'being-made' while Ola works on it: the one place the lamp shows on the home. */
  state: 'ready' | 'being-made'
  /** The workspace file behind it, when there is one (downloadable). */
  file?: string | null
  /** A page Ola built: "Open" shows it rendered in a new tab (the front desk's /api/open). */
  openable?: boolean
}

export interface Stat {
  value: string
  label: string
}

export interface DashboardThing extends ThingBase {
  kind: 'dashboard'
  live: boolean
  cadence: string
  heading: string
  dek: string
  stats: Stat[]
  series: { label: string; points: { label: string; value: number }[]; note?: string }
  breakdown: { label: string; rows: { label: string; value: number }[] }
}

export interface DocumentSection {
  heading: string | null
  paragraphs: string[]
  pending?: boolean
}

export interface DocumentThing extends ThingBase {
  kind: 'document'
  heading: string
  dek: string | null
  sections: DocumentSection[]
  formats?: string[]
}

export interface ChartThing extends ThingBase {
  kind: 'chart'
  bars: { label: string; value: number }[]
  of: number
  unit: string
}

export interface TableThing extends ThingBase {
  kind: 'table'
  columns: { label: string; numeric?: boolean }[]
  rows: string[][]
  note?: string | null
}

export interface SiteThing extends ThingBase {
  kind: 'site'
  visibility: 'private' | 'public'
  pages: number
  summary: string
}

/** A picture Ola made (a chart it drew, a photo): shown as itself, from /api/thumb. */
export interface ImageThing extends ThingBase {
  kind: 'image'
  alt: string
}

/** A PDF or Word file Ola made: its first page as a picture (a PDF), Open shows the rest. */
export interface FileDocThing extends ThingBase {
  kind: 'filedoc'
  format: 'PDF' | 'Word'
}

/** Something Ola downloaded from the web into sources/: shown apart from what it made, with its address. */
export interface SourceThing extends ThingBase {
  kind: 'source'
  format: 'page' | 'PDF' | 'file'
}

export type Thing = SourceThing | DashboardThing | DocumentThing | ChartThing | TableThing | SiteThing | ImageThing | FileDocThing
export type ThingKind = Thing['kind']

export interface Project {
  id: string
  name: string
  group: string
  people: string[]
  filesUploaded: number
}

export type Role = 'owner' | 'member' | 'viewer'

export interface ProjectPayload {
  project: Project
  /** How many people are working on the machine right now, and how many it can take. Never who. */
  machine: { working: number; capacity: number }
  things: Thing[]
  /** Everything else in the workspace, not shown as a thing (the first 50). */
  files?: FileEntry[]
  /** How many files are not shown as things, in all (`files` lists the first 50). */
  otherTotal?: number
  /** The signed-in person's role in this workspace (the dev server leaves it out: owner). */
  role?: Role
}

/** GET /api/me: the signed-in person, their workspaces, and the front desk's wording. */
export interface Me {
  person: { handle: string; name: string; admin?: boolean }
  csrf: string
  workspaces: { slug: string; name: string; team: string; role: Role }[]
  machine: { working: number; capacity: number }
  policy: { deleteNotice: string; maxUpload?: number; searchProvider?: string }
  /** What the person must be told once, such as a passkey added for another device. */
  notices?: { kind: string; at: string; text: string }[]
  /** Signing in the Mac app and the command line: null when this machine has it off. */
  devices?: { allowed: boolean; count: number } | null
}

/** A computer signed in to the person's account (the Mac app, the command line). */
export interface Device {
  id: number
  name: string
  kind: 'mac' | 'cli'
  created: string
  lastUsed: string | null
  expires: string
}

export interface FileEntry {
  path: string
  size: number
  modified: string
  origin: 'uploaded' | 'made'
  uploaded: string | null
}

// ---------------------------------------------------------------- the conversation

export type Autonomy = 'go' | 'ask'

export type StepIcon = 'look' | 'read' | 'write' | 'change' | 'run' | 'check' | 'search' | 'think' | 'other'

export interface Step {
  /** opencode's tool-call id. */
  id: string
  tool: string
  icon: StepIcon
  /** "Read", "Wrote", "Ran a short program"… from the fixed verb table. */
  verb: string
  /** What it acted on, shown in bold: a file name, a pattern. May be empty. */
  object: string
  /** A short result on the right: "56 rows", "3 files", "exit 1". */
  result: string | null
  status: 'preparing' | 'running' | 'waiting' | 'done' | 'failed'
  /** One line of why, in plain words, when it failed. */
  error: string | null
  /** The raw detail behind "Show details". */
  detail: { input: string; output: string }
  started: number
  ended: number | null
}

export type TurnStatus = 'sending' | 'working' | 'done' | 'failed' | 'stopped'

export interface Turn {
  /** The user message id when known, else a local id. */
  id: string
  request: string
  at: number
  status: TurnStatus
  steps: Step[]
  answer: string
  /** Earlier texts in the same turn ("Let me check the file first."), shown between steps. */
  notes: string[]
  error: Problem | null
  /** Set while opencode is retrying the model: "Trying again in 5 s". */
  notice: string | null
  ended: number | null
  /**
   * Who answered: Ola (opencode with Ola's own model, on this machine; the default), the hosted open
   * model (the same opencode, its model at an outside company), or Claude (Claude Code, outside it).
   */
  engine?: Engine
  /** A Claude turn: its run id, for Stop and for following it again. */
  run?: string | null
  /** Why the request was handed over, in one sentence (null when the person asked). */
  handoff?: string | null
}

export type Engine = 'ola' | 'claude' | 'hosted'
/** The two ways out of this machine, each its own switch. */
export type Fallback = 'hosted' | 'claude'
export type ClaudeAuto = 'ask' | 'stuck' | 'always'
/** "When a request looks like a stretch": suggest it and let me decide; hand it over without asking; never suggest. */
export type Stretch = 'suggest' | 'handover' | 'never'
/** What Ola saw that makes a request look like a stretch (observable signals only, never a score). */
export type StretchReason = 'error' | 'budget' | 'tools' | 'big_files' | 'long_build' | 'many_files' | 'design'

/** GET /api/fallback: the hosted open model for this project. */
export interface HostedInfo {
  enabled: boolean
  canChange: boolean
  /** The machine has a hosted provider set up. */
  configured: boolean
  /** The provider's name as people read it ("Together AI"), or null. */
  provider: string | null
  unavailable: string | null
  month: { unit: 'usd'; used: number; cap: number; reported: boolean }
  running: { conversation: string } | null
}

/** GET /api/fallback: both fallbacks and the setting they share. */
export interface FallbackInfo {
  claude: ClaudeInfo
  hosted: HostedInfo
  stretch: Stretch
  stretchTo: Fallback
  canChange: boolean
}

/** The stretch card: Ola suggests handing one request over, and the person decides. */
export interface Suggestion {
  id: string
  request: string
  /** The Ola turn that got stuck (kept, with what Ola did so far), or null: asked before a run. */
  turnId: string | null
  reason: StretchReason
  /** What it may go to, the first offered first (the hosted open model before Claude). */
  offers: Fallback[]
  /** The one shown now (the person can switch to the other offer). */
  target: Fallback
  /** The person can send it (an owner, or the target's switch is on); else the card only says who can turn it on. */
  canAct: boolean
}

/** GET /api/claude: Fallback to Claude for this project. */
export interface ClaudeInfo {
  enabled: boolean
  auto: ClaudeAuto
  /** Only the project's owner may change the setting. */
  canChange: boolean
  mode: 'oauth' | 'api_key'
  configured: boolean
  /** Why it cannot be turned on, in a plain sentence; null when it can. */
  unavailable: string | null
  month: { unit: 'usd' | 'tokens'; used: number; cap: number; reported: boolean }
  running: { run: string; conversation: string | null } | null
}

/** A question Ola asks the person (opencode's `question` tool raises a form): choices, and its own words. */
export interface Question {
  id: string
  sessionID: string
  fields: { key: string; title: string; text: string; options: { value: string; label: string; description: string | null }[]; custom: boolean; multiple: boolean }[]
  /** The step it belongs to (the `question` tool call), if known. */
  stepID: string | null
}

export interface Approval {
  id: string
  sessionID: string
  action: string
  /** Plain words: "Ola wants to run a short program". */
  title: string
  /** What exactly: the command, or the files it would change. */
  items: { label: string; detail: string | null }[]
  /** The step it belongs to, if any. */
  stepID: string | null
  /** A question from Claude Code (answered through the front desk), not from opencode. */
  engine?: Engine
  run?: string
  /** A web search or download: what would be searched or fetched (null when the command is not simple). */
  web?: { kind: 'search' | 'fetch' | 'lookup'; item: string | null } | null
}

/** The project's settings (GET /api/settings). */
export interface Settings {
  web: { always: boolean; changedAt: string | null; changedBy: string | null; provider: string }
  role: Role
}

/** The project's data (GET /api/data): its tables and its documents. */
export interface DataTable {
  name: string
  kind: 'table' | 'view'
  rows: number
  columns: { name: string; type: string }[]
  description: string | null
  source: string | null
  created: string | null
  updated: string | null
  /** A table of a database the person brought (ola-db attach): read-only, named <file>.<table>. */
  attached?: boolean
}
export interface DataSummary {
  tables: DataTable[]
  documents: { count: number; pages: number; web: number; upload: number; agent: number; ocrPages?: number; mismatches?: number }
  size: number
}
export interface TablePage {
  table: string
  columns: { name: string; type: string }[]
  rows: (string | number | null)[][]
  total: number
  offset: number
  limit: number
}
export interface DocumentRow {
  id: number
  title: string
  path: string
  source_url: string | null
  fetched_at: string | null
  mime: string | null
  pages: number
  unit: 'page' | 'slide' | 'part'
  chars?: number
  added_by: 'upload' | 'web' | 'agent'
  added_at: string
  /** Pages read from a scan by OCR: their words may be wrong. */
  ocr_pages?: number
  /** The right-document check (ola-db check): a 'mismatch' may not be the document wanted. */
  check_result?: 'match' | 'mismatch' | 'unsure' | null
  check_detail?: string | null
}
export interface DocumentHit {
  id: number
  title: string
  path: string
  source_url: string | null
  fetched_at: string | null
  unit: 'page' | 'slide' | 'part'
  page: number
  /** The passage, with the matched words between \u0002 and \u0003. */
  snip: string
  /** 'ocr' when the page was read from a scan. */
  method?: string
}
export type DocsPage = { q: false; documents: DocumentRow[]; total: number; offset: number } | { q: true; hits: DocumentHit[]; total: number; anyWord: boolean; offset: number }

export type Connection = 'connecting' | 'open' | 'lost'

/** An error said out loud: one sentence in plain words, the raw detail behind "Show details". */
export interface Problem {
  text: string
  detail: string | null
}

// ---------------------------------------------------------------- batch jobs (frontdesk/jobs.mjs)
export interface JobField {
  name: string
  type: 'text' | 'category' | 'number' | 'yesno'
  question: string
  values?: string[]
}
export interface JobEstimate {
  documents: number | null
  tokens: number | null
  tokens_in: number | null
  tokens_out: number | null
  seconds: number | null
  budget: number | null
  basis: string | null
  weekQuota: number | null
  weekShare: number | null
}
export type JobState = 'proposed' | 'trial' | 'trial_done' | 'running' | 'paused' | 'done' | 'cancelled'
export interface Job {
  id: string
  name: string | null
  title: string | null
  instructions?: string | null
  fields: JobField[]
  model: 'general' | 'hosted' | 'claude'
  state: JobState
  trialSize: number | null
  budget: number | null
  estimate: JobEstimate | null
  remainingEstimate: JobEstimate | null
  note: string | null
  created: string | null
  heartbeatAge: number | null
  secondsLeft: number | null
  progress: { pending: number; done: number; failed: number; no_text: number; problems: number; trial_total: number; trial_left: number; total: number; tokens: number }
  approved: { state: JobState; stage: 'trial' | 'full'; model: string; budget: number; at: string } | null
  waiting: string | null
}
export interface JobOption {
  model: 'general' | 'hosted' | 'claude'
  label: string
  outside: boolean
  provider?: string
  allowed: boolean
  prices?: { in: number; out: number } | null
}
export interface JobsPayload {
  jobs: Job[]
  options: JobOption[]
  role: string
}
export interface JobPage {
  job: Job
  results: { columns: string[]; rows: (string | number | null)[][]; total: number; offset: number }
  options: JobOption[]
  role: string
}

// ---------------------------------------------------------------- "Compare with Claude"
export type CompareOutcome = 'both_right' | 'claude_better' | 'ola_better' | 'both_wrong' | 'unsure'
export type CompareState = 'making' | 'held' | 'refused' | 'ready' | 'running' | 'done' | 'failed' | 'declined'
export interface CompareResultLine {
  id: string
  mode: 'twin' | 'real'
  state: CompareState
  verdict: 'clean' | 'unsure' | 'leak' | null
  outcome: CompareOutcome | null
  sentence: string | null
}
export interface CompareInfo {
  canCompare: boolean
  configured?: boolean
  unavailable?: string | null
  mode?: 'oauth' | 'api_key'
  real?: boolean
  consent?: string
  auto?: 'ask' | 'daily'
  perDay?: number
  month?: { usedUsd: number; capUsd: number }
  realSent?: { at: number; state: CompareState; outcome: CompareOutcome | null }[]
  /** By the person's message id in this conversation. */
  results?: Record<string, CompareResultLine>
}
export interface CompareCheck {
  name: string
  type: string
  path?: string
  column?: string
  any?: string[]
}
export interface CompareFile {
  name: string
  size: number
  text: string | null
  input?: boolean
}
export interface CompareEngine {
  final: string
  end: string
  ms: number | null
  model: string
  score: { passed: number; total: number; all: boolean; checks: { name: string; ok: boolean; label: string }[] } | null
  outputs: CompareFile[]
}
export interface CompareItem {
  id: string
  mode: 'twin' | 'real'
  state: CompareState
  verdict: 'clean' | 'unsure' | 'leak' | null
  kind: string | null
  outcome: CompareOutcome | null
  twin: { request: string; kind: string; checks: CompareCheck[]; files: CompareFile[] } | null
  findings: { severity: 'leak' | 'unsure'; kind: string; text: string; where: string }[] | null
  result: { engines: { ola: CompareEngine; claude: CompareEngine; hosted?: CompareEngine }; judge: { verdict: string; difference: string }; outcome: CompareOutcome; label: string | null } | null
}
export interface WinTieLoss {
  ola: number
  tie: number
  claude: number
  unsure: number
}
export interface Quality {
  total: WinTieLoss
  overTime: ({ day: string } & WinTieLoss)[]
  byKind: ({ name: string } & WinTieLoss)[]
  byModel: ({ name: string } & WinTieLoss)[]
  reasons: { label: string; n: number }[]
  cost: { micro_usd: number; month_micro_usd: number }
  weekly: { overall: { compared: number; decided: number; matched_or_beat: number; share: number | null; unsure: number } }
  list: { id: string; at: number; mode: string; trigger: string; state: string; verdict: string | null; kind: string | null; outcome: CompareOutcome | null; label: string | null; model: string | null; claudeModel: string | null; olaPassed: number | null; olaTotal: number | null; claudePassed: number | null; claudeTotal: number | null; cost: number | null; project: string; request: string | null; difference: string | null }[]
}
