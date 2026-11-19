import { f2Supabase } from '@/lib/f2/supabase'
import { sendIMessage } from '@/lib/f2/bluebubbles'

// Venture over iMessage (2026-11-13): Bart asked Claude to reach him by text
// through the bridge on the Mac mini. Two directions, one table
// (venture_messages):
//   out  the working Claude Code session texts him (scripts/venture/imsg.mjs
//        → POST /api/venture/imsg), every text starting with VENTURE_MARK;
//   in   he texts "v …" or "venture …" from his own handle; the dispatcher
//        (src/lib/imessage/dispatch.ts) hands it here before Onething or Dodo
//        see it, and it is stored. The Mac mini answers it within seconds from
//        the project's documents (texter.ts, scripts/venture/text-reply.ts), on
//        the Claude login. The working session reads the thread when it next runs.

/// What every text Venture sends starts with. The webhook drops from-me
/// echoes that carry it, and it can never match VENTURE_PREFIX.
export const VENTURE_MARK = '✴️'
export const VENTURE_PREFIX = /^(?:v|venture)\b[\s:,.\-]*/i

const OWNER = 'bart' // the f2 account whose paired handles are Bart's

async function ownerHandles(): Promise<string[]> {
  const { data, error } = await f2Supabase().from('f2_users').select('imessage_handles').eq('username', OWNER).maybeSingle()
  if (error) throw new Error(`venture owner lookup failed: ${error.message}`)
  return ((data as { imessage_handles: string[] | null } | null)?.imessage_handles ?? []).filter(Boolean)
}

const digits = (h: string) => (h.includes('@') ? h.trim().toLowerCase() : h.replace(/\D/g, '').slice(-10))

export async function isVentureOwner(handle: string): Promise<boolean> {
  if (!handle) return false
  return (await ownerHandles()).some((h) => digits(h) === digits(handle))
}

async function store(direction: 'in' | 'out', author: string, text: string) {
  const { error } = await f2Supabase().from('venture_messages').insert({ direction, author, text })
  if (error) throw new Error(`venture message insert failed: ${error.message}`)
}

/// Text Bart. Phone number first; an email handle is the fallback.
export async function sendVenture(text: string, author: 'session' | 'reply'): Promise<void> {
  const handles = await ownerHandles()
  const to = handles.find((h) => !h.includes('@')) ?? handles[0]
  if (!to) throw new Error('no iMessage handle is paired to the owner account')
  await sendIMessage({ addresses: [to], text: `${VENTURE_MARK} ${text.trim()}` })
  await store('out', author, text.trim())
}

/// Bart texted (prefix already matched). Store it; this server does not answer it.
/// Since 2026-11-19 (OLA-187) the answer is written on the Mac mini on the Claude login, the Max
/// plan (scripts/venture/text-reply.ts, launchd sh.venture.texts), and comes back through
/// POST /api/venture/imsg with author "reply". Bart: "text replies too, yes, whatever we CAN switch".
export async function ventureInbound(raw: string): Promise<void> {
  const text = raw.replace(VENTURE_PREFIX, '').trim() || raw.trim()
  await store('in', 'bart', text)
}
