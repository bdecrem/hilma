export type PublishSel = { folder: string } | { page: string }
export type PublishAsk = { sel: PublishSel; files: string[]; status?: undefined; bad?: undefined; unpublish?: undefined } | { status: true; sel?: undefined; bad?: undefined; unpublish?: undefined } | { unpublish: true; sel?: undefined; bad?: undefined; status?: undefined } | { bad: string; sel?: undefined; status?: undefined; unpublish?: undefined }
export function isPublishCommand(cmd: string): boolean
export function publishRequestOf(cmd: string): PublishAsk | null
export function publishAskOf(action: string, resources: string[]): PublishAsk | null
export function sameFiles(a: string[], b: string[]): boolean
export function publishRules(): { action: string; resource: string; effect: 'ask' | 'allow' }[]
