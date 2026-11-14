// Voice notes: Bart asked (2026-11-14) for "a permanent conversation URL I can
// bookmark... a URL where I can leave you voice notes". ola.cx/venture/memo
// records a note, this transcribes it, and it lands in the same thread as his
// texts (venture_messages, direction "in"), so the working session's text
// watcher (scripts/venture/imsg.mjs --wait) picks it up within a minute. He
// does not have to text that a note exists. Nothing answers a note here; the
// session reads it and acts.
import { f2Supabase } from '@/lib/f2/supabase'

export const MEMO_MARK = '(voice note) '

// Names speech recognition gets wrong, given to the model as a hint.
const HINT = 'Kochito Labs, Claude, Venture, Namecheap, Shopify, SendGrid, CASBS, Vercel, Supabase, ola.cx, PDF, ADA Title II'

export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  const form = new FormData()
  form.append('file', audio, filename)
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe')
  form.append('language', 'en')
  form.append('prompt', HINT)
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
  if (!res.ok) throw new Error(`transcription failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
  const out = (await res.json()) as { text?: string }
  return (out.text ?? '').trim()
}

export type Memo = { id: number; text: string; at: string; seen_at: string | null }

/// Store a note. A check's note (test) is stored as already read, so it never wakes the session.
export async function saveMemo(text: string, test = false): Promise<Memo> {
  const row = { direction: 'in', author: 'bart', text: MEMO_MARK + text, ...(test ? { seen_at: new Date().toISOString() } : {}) }
  const { data, error } = await f2Supabase().from('venture_messages').insert(row).select('id, text, at, seen_at').single()
  if (error) throw new Error(`venture memo store failed: ${error.message}`)
  return strip(data as Memo)
}

/// His latest notes, newest first, each with when the session read it.
export async function recentMemos(limit = 12): Promise<Memo[]> {
  const { data, error } = await f2Supabase()
    .from('venture_messages')
    .select('id, text, at, seen_at')
    .eq('direction', 'in')
    .like('text', `${MEMO_MARK}%`)
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`venture memo read failed: ${error.message}`)
  return ((data ?? []) as Memo[]).map(strip)
}

const strip = (m: Memo): Memo => ({ ...m, text: m.text.startsWith(MEMO_MARK) ? m.text.slice(MEMO_MARK.length) : m.text })
