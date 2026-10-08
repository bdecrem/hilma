// A short memory note per reader, kept by a small Haiku call after each
// exchange. The note goes into the system prompt (src/lib/osai/prompt.ts)
// and is shown to the reader in the chat panel, who can clear it.

import { completedText } from '@/lib/anthropic-response'
import Anthropic from '@anthropic-ai/sdk'
import { FULL_NAME, type OsaiUser } from './auth'
import { osaiDb } from './db'

const MEMORY_MODEL = 'claude-haiku-5-5'
const MAX_NOTE_WORDS = 150

let _client: Anthropic | null = null
function client() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

export async function getNotes(user: OsaiUser): Promise<string> {
  const { data, error } = await osaiDb().from('osai_memory').select('notes').eq('user_name', user).maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.notes as string | undefined) ?? ''
}

export async function setNotes(user: OsaiUser, notes: string): Promise<void> {
  const { error } = await osaiDb()
    .from('osai_memory')
    .upsert({ user_name: user, notes, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

const SYSTEM = `You maintain a short memory note about one reader of a private site, for an assistant that will talk with them again later. You are given the current note and the latest exchange. Return the updated note and nothing else.

Keep: what they are interested in, positions they took, questions they keep returning to, things they asked to be remembered, context they gave about themselves or their plans.
Drop: pleasantries, the assistant's own answers, anything the documents already say.
Form: short lines starting with "- ", at most ${MAX_NOTE_WORDS} words in total, newest facts last. If the exchange adds nothing worth keeping, return the current note unchanged. If the note is empty and nothing is worth keeping, return an empty response.`

/** Fold one exchange into the reader's note. Errors are logged, never thrown. */
export async function updateNotes(user: OsaiUser, current: string, userText: string, reply: string): Promise<void> {
  try {
    const res = await client().messages.create({
      model: MEMORY_MODEL,
      max_tokens: 3072,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            `Reader: ${FULL_NAME[user]}`,
            '',
            'Current note:',
            current.trim() || '(empty)',
            '',
            'Latest exchange:',
            `${FULL_NAME[user].split(' ')[0]}: ${userText.slice(0, 4000)}`,
            `Assistant: ${reply.slice(0, 4000)}`,
          ].join('\n'),
        },
      ],
    })
    const text = completedText(res, true)
    const next = text === '(empty)' ? '' : text
    if (next !== current.trim()) await setNotes(user, next)
  } catch (e) {
    console.error('[osai] memory update failed:', (e as Error).message)
  }
}
