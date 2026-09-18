// Polly's iMessage webhook is the same inbox as Dodo's: BlueBubbles posts
// every message to one URL and the dispatcher (src/lib/imessage/dispatch.ts)
// decides whether it is for Onething, Polly or Dodo. Registering this URL
// in BlueBubbles as well is harmless — both routes share one dedup table.
export { POST } from '@/app/api/f2/clients/imessage/webhook/route'

export const runtime = 'nodejs'
export const maxDuration = 60
