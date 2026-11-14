import { f2Supabase } from '@/lib/f2/supabase'
import { sendIMessage } from '@/lib/f2/bluebubbles'
import { VENTURE_MODEL, ventureAnthropic, ventureNotes } from './talk'

// Venture over iMessage (2026-11-13): Bart asked Claude to reach him by text
// through the bridge on the Mac mini. Two directions, one table
// (venture_messages):
//   out  the working Claude Code session texts him (scripts/venture/imsg.mjs
//        → POST /api/venture/imsg), every text starting with VENTURE_MARK;
//   in   he texts "v …" or "venture …" from his own handle; the dispatcher
//        (src/lib/imessage/dispatch.ts) hands it here before Onething or Dodo
//        see it, it is stored, and Claude answers at once from the project's
//        documents. The working session reads the thread when it next runs.

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

type Msg = { id: number; direction: 'in' | 'out'; author: string; text: string; at: string }

async function store(direction: Msg['direction'], author: string, text: string) {
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

const TEXTER = `You are Claude, texting with Bart Decrem over iMessage. The two of you are partners in a project called Venture: Bart asked you to come up with a business and run it, with him holding the accounts and the money. A Claude Code session in his terminal (you, with tools) does the work; everything it knows is in the notes below, "now" first. That session reads this thread when it next runs, and when it is running it sees a new text within a minute. Messages in the thread marked [session] were written by it; the others from you were written here, on arrival.

Bart is direct and fast. Reply like a person texting a partner:
- Plain text, no markdown, no lists. One to three short sentences. Links only when he asks for one.
- Answer what he asked, from the notes. If the notes do not cover it, say you do not know yet and that the session will check; never invent a number, a name or a source.
- You cannot look anything up, build, send or spend from here. When he gives an instruction or a decision, say it back in one sentence and say the session will act on it. Do not claim work has started.
- Have a view. No flattery, no menus of options.
- If his text is only an acknowledgment ("ok", "thanks", a thumbs up), answer with the single word: NONE

THE NOTES
`

/// Bart texted (prefix already matched). Store it, answer it.
export async function ventureInbound(raw: string): Promise<void> {
  const text = raw.replace(VENTURE_PREFIX, '').trim() || raw.trim()
  await store('in', 'bart', text)

  const { data, error } = await f2Supabase().from('venture_messages').select('*').order('id', { ascending: false }).limit(40)
  if (error) throw new Error(`venture thread read failed: ${error.message}`)
  const thread = ((data ?? []) as Msg[]).reverse()
  const messages: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: '(The thread so far follows.)' }]
  for (const m of thread) {
    const role = m.direction === 'in' ? 'user' : 'assistant'
    const body = m.direction === 'out' && m.author === 'session' ? `[session] ${m.text}` : m.text
    const last = messages[messages.length - 1]
    if (last.role === role) last.content += `\n${body}`
    else messages.push({ role, content: body })
  }

  const res = await ventureAnthropic().beta.messages.create({
    model: VENTURE_MODEL,
    max_tokens: 8000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: TEXTER + (await ventureNotes()), cache_control: { type: 'ephemeral' } }],
    messages,
  } as never)
  if (res.stop_reason !== 'end_turn') {
    console.error('[venture/imsg] no reply:', res.stop_reason)
    await sendVenture('Got it. I could not write a proper answer just now; the session will pick this up.', 'reply')
    return
  }
  const reply = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim()
  if (!reply || reply === 'NONE') return
  await sendVenture(reply, 'reply')
}
