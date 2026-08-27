import { f2Supabase } from './supabase'
import { sendIMessage } from './bluebubbles'

// Admin heads-up on new accounts, over iMessage — the same outbound rails
// the daily card uses, so there's no new channel to operate. The target is
// the admin user's own paired handle (nothing personal hardcoded here).

const ADMIN_USERNAME = process.env.F2_ADMIN_USERNAME || 'bart'

/// Text the admin that an account was just created. Best-effort by design:
/// a notification failure must never break a signup, so everything is
/// swallowed after logging.
export async function notifyAdminNewAccount(
  kind: 'signup' | 'guest',
  username: string,
): Promise<void> {
  try {
    const { data, error } = await f2Supabase()
      .from('f2_users')
      .select('imessage_handles')
      .eq('username', ADMIN_USERNAME)
      .maybeSingle()
    if (error || !data) return
    const handle = (data.imessage_handles as string[] | null)?.[0]
    if (!handle) return
    const label = kind === 'guest' ? 'guest (Try Dodo)' : 'signup'
    await sendIMessage({
      addresses: [handle],
      text: `\u{1F9A4} New Dodo account: ${username} — ${label}`,
    })
  } catch (err) {
    console.error('[f2/admin-notify] new-account ping failed:', err)
  }
}
