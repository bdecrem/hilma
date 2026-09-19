// imessage_routes (schema f2/049): which app last had this handle's
// conversation. Its own module so the senders (each app's daily card) can
// write to it without importing the dispatcher, which imports both agents.

import { f2Supabase } from '@/lib/f2/supabase'

export type Route = 'onething' | 'polly' | 'dodo' | 'drop'

export async function lastRoute(handle: string): Promise<{ route: Route; at: number } | null> {
  const { data, error } = await f2Supabase()
    .from('imessage_routes')
    .select('route, routed_at')
    .eq('handle', handle)
    .maybeSingle()
  if (error) {
    console.error('[imessage] route lookup failed:', error)
    return null
  }
  if (!data) return null
  return { route: data.route as Route, at: new Date(data.routed_at as string).getTime() }
}

/// Inbound: the app a message was routed to. Outbound: an app that just asked
/// this handle a question (the daily card) takes the conversation, so the
/// answer comes back to it when the handle is paired to both Dodo and Polly.
export async function rememberRoute(handle: string, route: Route, reason: string): Promise<void> {
  if (route === 'drop' || !handle) return
  const { error } = await f2Supabase()
    .from('imessage_routes')
    .upsert({ handle, route, reason, routed_at: new Date().toISOString() }, { onConflict: 'handle' })
  if (error) console.error('[imessage] route save failed:', error)
}
