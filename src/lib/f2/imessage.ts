import { f2Supabase } from './supabase'
import { sendIMessage } from './bluebubbles'

/// Pairing flow:
///   1. user → POST /imessage/start { handle }
///      server normalizes handle, generates 6-digit code, stores pending,
///      sends "Your Feynd code is XXXXXX" via iMessage.
///   2. user → POST /imessage/confirm { handle, code }
///      server verifies + binds handle to user.imessage_handles, deletes
///      pending row.

const CODE_TTL_MIN = 10

/// Normalize a handle to the form BlueBubbles webhooks deliver:
///   - phones: digits only, leading `+` retained (e.g. "+15551234567")
///   - emails: lowercased
///   - everything else: lowercased
export function normalizeHandle(raw: string): string {
  const s = raw.trim()
  if (s.includes('@')) return s.toLowerCase()
  // Strip non-digits except a single leading +.
  const plus = s.startsWith('+')
  const digits = s.replace(/[^\d]/g, '')
  return (plus ? '+' : '') + digits
}

export function isPlausibleHandle(raw: string): boolean {
  const h = normalizeHandle(raw)
  if (h.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h)
  }
  // 7+ digits is the loose floor for any real phone number anywhere.
  const digits = h.replace(/[^\d]/g, '')
  return digits.length >= 7 && digits.length <= 15
}

function generateCode(): string {
  // Crypto-strong 6-digit code so users can't guess across requests.
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return n.toString().padStart(6, '0')
}

export type StartResult =
  | { ok: true; handle: string; code: string }
  | { ok: false; status: number; error: string }

/// Step 1 of pairing. Stores the pending code and sends it via iMessage.
export async function startImessagePairing(
  userId: string,
  rawHandle: string,
): Promise<StartResult> {
  if (!isPlausibleHandle(rawHandle)) {
    return { ok: false, status: 400, error: 'Enter a phone number or iCloud email.' }
  }
  const handle = normalizeHandle(rawHandle)

  // If already confirmed for this user, treat as success — no need to re-pair.
  const sb = f2Supabase()
  const { data: user } = await sb
    .from('f2_users')
    .select('imessage_handles')
    .eq('id', userId)
    .maybeSingle()
  if (user && Array.isArray(user.imessage_handles) && user.imessage_handles.includes(handle)) {
    return { ok: false, status: 409, error: 'That handle is already paired.' }
  }

  // Make sure no other account claims this handle (one handle = one user).
  const { data: claimedBy } = await sb
    .from('f2_users')
    .select('id')
    .contains('imessage_handles', [handle])
    .neq('id', userId)
    .maybeSingle()
  if (claimedBy) {
    return { ok: false, status: 409, error: 'That handle is paired with another account.' }
  }

  const code = generateCode()
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString()
  const { error: upErr } = await sb
    .from('f2_imessage_pending')
    .upsert(
      { user_id: userId, handle, code, expires_at: expires },
      { onConflict: 'user_id,handle' },
    )
  if (upErr) {
    console.error('[f2/imessage] pending upsert failed:', upErr)
    return { ok: false, status: 500, error: 'Could not start pairing.' }
  }

  return { ok: true, handle, code }
}

/// Fire-and-forget BlueBubbles send. The /imessage/start route stores the
/// pending row + returns 200 immediately (so the client UI can advance),
/// then schedules this via `after()` so AppleScript's 10–20s delivery
/// chain doesn't blow the Vercel function timeout.
export async function sendPairingMessage(handle: string, code: string): Promise<void> {
  try {
    await sendIMessage({
      addresses: [handle],
      text: `Your Feynd confirmation code is ${code}. Expires in ${CODE_TTL_MIN} minutes.`,
    })
  } catch (e) {
    console.error('[f2/imessage] send failed (code already stored; user can retry):', e)
  }
}

export type ConfirmResult =
  | { ok: true; handle: string }
  | { ok: false; status: number; error: string }

/// Step 2 — user types the 6-digit code from iMessage into the app.
export async function confirmImessagePairing(
  userId: string,
  rawHandle: string,
  rawCode: string,
): Promise<ConfirmResult> {
  const handle = normalizeHandle(rawHandle)
  const code = rawCode.trim()
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, status: 400, error: 'Enter the 6-digit code.' }
  }

  const sb = f2Supabase()
  const { data: pending } = await sb
    .from('f2_imessage_pending')
    .select('code, expires_at')
    .eq('user_id', userId)
    .eq('handle', handle)
    .maybeSingle()
  if (!pending) {
    return { ok: false, status: 404, error: 'No pending pairing for that handle.' }
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 410, error: 'Code expired. Start over.' }
  }
  if (pending.code !== code) {
    return { ok: false, status: 401, error: "Code didn't match." }
  }

  // Atomic-ish: append handle to user's array if not already present.
  const { data: user } = await sb
    .from('f2_users')
    .select('imessage_handles')
    .eq('id', userId)
    .maybeSingle()
  const current: string[] = (user?.imessage_handles as string[] | undefined) ?? []
  if (!current.includes(handle)) {
    const next = [...current, handle]
    const { error } = await sb
      .from('f2_users')
      .update({ imessage_handles: next })
      .eq('id', userId)
    if (error) {
      console.error('[f2/imessage] confirm persist failed:', error)
      return { ok: false, status: 500, error: 'Could not save handle.' }
    }
  }

  await sb
    .from('f2_imessage_pending')
    .delete()
    .eq('user_id', userId)
    .eq('handle', handle)

  return { ok: true, handle }
}

export async function listImessageHandles(userId: string): Promise<string[]> {
  const { data } = await f2Supabase()
    .from('f2_users')
    .select('imessage_handles')
    .eq('id', userId)
    .maybeSingle()
  return ((data?.imessage_handles as string[] | undefined) ?? []).slice()
}

export async function removeImessageHandle(
  userId: string,
  rawHandle: string,
): Promise<void> {
  const handle = normalizeHandle(rawHandle)
  const sb = f2Supabase()
  const { data: user } = await sb
    .from('f2_users')
    .select('imessage_handles')
    .eq('id', userId)
    .maybeSingle()
  const current: string[] = (user?.imessage_handles as string[] | undefined) ?? []
  const next = current.filter(h => h !== handle)
  if (next.length === current.length) return
  await sb.from('f2_users').update({ imessage_handles: next }).eq('id', userId)
}

/// Webhook-side: given an inbound iMessage handle, find the owning user.
/// Returns null if no user has claimed this handle yet.
export async function findUserByImessageHandle(
  rawHandle: string,
): Promise<{ id: string } | null> {
  const handle = normalizeHandle(rawHandle)
  const { data } = await f2Supabase()
    .from('f2_users')
    .select('id')
    .contains('imessage_handles', [handle])
    .maybeSingle()
  return (data as { id: string } | null) ?? null
}
