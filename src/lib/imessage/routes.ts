// imessage_routes (schema f2/049): which app last had this handle's
// conversation. Its own module so the senders (the daily card) can write to
// it without importing the dispatcher, which imports the agent. Since Polly
// moved to its own backend (2026-09-30) nothing reads it — the sticky routing
// between Dodo and Polly is gone — but it is still a useful record. Old rows
// may say 'polly'.

import { f2Supabase } from '@/lib/f2/supabase'

export type Route = 'onething' | 'dodo' | 'drop'

/// Inbound: the app a message was routed to. Outbound: an app that just asked
/// this handle a question (the daily card).
export async function rememberRoute(handle: string, route: Route, reason: string): Promise<void> {
  if (route === 'drop' || !handle) return
  const { error } = await f2Supabase()
    .from('imessage_routes')
    .upsert({ handle, route, reason, routed_at: new Date().toISOString() }, { onConflict: 'handle' })
  if (error) console.error('[imessage] route save failed:', error)
}
