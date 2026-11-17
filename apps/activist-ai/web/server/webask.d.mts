export interface WebRequest {
  kind: 'search' | 'fetch'
  /** The search words or the https address; null when the command is not in a simple form. */
  item: string | null
}
export function shellWords(cmd: string): string[] | null
export function webRequestOf(cmd: string): WebRequest | null
export function webRequests(action: string, resources: string[]): WebRequest[]
export function webRules(effect: 'ask' | 'allow'): { action: string; resource: string; effect: string }[]
