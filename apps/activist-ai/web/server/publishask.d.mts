export type PublishSel = { folder: string } | { page: string }
export type PublishAsk = { sel: PublishSel; files: string[]; status?: undefined; bad?: undefined } | { status: true; sel?: undefined; bad?: undefined } | { bad: string; sel?: undefined; status?: undefined }
export function isPublishCommand(cmd: string): boolean
export function publishRequestOf(cmd: string): PublishAsk | null
export function publishAskOf(action: string, resources: string[]): PublishAsk | null
export function sameFiles(a: string[], b: string[]): boolean
export function publishRules(): { action: string; resource: string; effect: 'ask' | 'allow' }[]
