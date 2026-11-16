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

export type Thing = DashboardThing | DocumentThing | ChartThing | TableThing | SiteThing
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
  /** The signed-in person's role in this workspace (the dev server leaves it out: owner). */
  role?: Role
}

/** GET /api/me: the signed-in person, their workspaces, and the front desk's wording. */
export interface Me {
  person: { handle: string; name: string }
  csrf: string
  workspaces: { slug: string; name: string; team: string; role: Role }[]
  machine: { working: number; capacity: number }
  policy: { deleteNotice: string; maxUpload?: number }
  /** What the person must be told once, such as a passkey added for another device. */
  notices?: { kind: string; at: string; text: string }[]
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
}

export type Connection = 'connecting' | 'open' | 'lost'

/** An error said out loud: one sentence in plain words, the raw detail behind "Show details". */
export interface Problem {
  text: string
  detail: string | null
}
