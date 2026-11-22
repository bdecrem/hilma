export interface CardOption { value: string; label: string; description: string | null }
export interface CardField { key: string; title: string; text: string; options: CardOption[]; custom: boolean; multiple: boolean; placeholder: string }
export interface QuestionCardDesc {
  kind: 'question'
  id: string
  sessionID: string
  stepID: string | null
  kicker: string
  fields: CardField[]
  tapAnswers: boolean
  send: string | null
  boxNote: string
  sent: string
}
export interface PublishCardDesc {
  kind: 'publish' | 'unpublish'
  runtime: 'cloud' | 'local'
  title: string
  lede: string
  address: string
  heading: string | null
  files: string[]
  yes: string
  no: string
  always: false
  sel?: { folder: string } | { page: string }
  folder?: string
  checking?: string | null
  fileNotes?: string[]
  leftOut?: string | null
  warnings?: string[]
  aup?: string | null
  fingerprint?: string | null
}
export function cardCount(n: number, one: string, many?: string): string
export function publishYes(n: number, again?: boolean): string
export function questionCard(form: unknown): QuestionCardDesc | null
export function answerFromWords(card: { fields: { key: string; multiple: boolean }[] } | null | undefined, words: string): Record<string, string | string[]> | null
export function localPublishOf(cmd: string): { publish: { folder: string; name: string } } | { unpublish: { name: string } } | null
export function publishCard(action: string, resources: string[], ctx?: { address?: string; files?: string[] }): PublishCardDesc | null
export function cardBytes(n: number): string
export function publishWithPlan(card: PublishCardDesc | null, plan: unknown): PublishCardDesc | null
export function cardLines(card: QuestionCardDesc | PublishCardDesc | null): string[]
