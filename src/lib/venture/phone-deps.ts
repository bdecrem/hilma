import { after } from 'next/server'
import { f2Supabase } from '@/lib/f2/supabase'
import { mintElevenConversationToken } from '@/lib/f2/eleven'
import { readAppToken } from '@/lib/kochito/app-auth'
import { addTurn, sessionTurns } from './interview'
import { recentMemos, saveMemo, transcribe } from './memo'
import { PHONE, PHONE_LEAD, type PhoneDeps } from './phone'
import { minutesDeps, minutesFor } from './minutes-store'
import { talkStream, talkSystem, warmCache } from './talk'

// The real services behind src/lib/venture/phone.ts (the tests in scripts/venture/phone-test.ts
// pass stand-ins instead).
export const phoneDeps: PhoneDeps = {
  user: (token) => readAppToken(token),
  turns: (session) => sessionTurns(session),
  async phoneRows(since, limit) {
    const { data, error } = await f2Supabase()
      .from('venture_interview_turns')
      .select('*')
      .eq('call', PHONE)
      .gte('at', since.toISOString())
      .order('id', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`venture phone turns read failed: ${error.message}`)
    return data ?? []
  },
  addTurn: (session, role, text) => addTurn(session, role, text, PHONE),
  async reviseTurn(id, text) {
    const { error } = await f2Supabase().from('venture_interview_turns').update({ text }).eq('id', id).eq('role', 'bart')
    if (error) throw new Error(`venture turn revise failed: ${error.message}`)
  },
  mint: (engineId) => mintElevenConversationToken(engineId),
  system: () => talkSystem(PHONE_LEAD),
  warm: (system) => warmCache(system),
  later: (fn) => after(fn),
  reply: (system, messages, signal) => talkStream(system, messages, signal),
  transcribe: (audio, filename) => transcribe(audio, filename),
  saveMemo: (text) => saveMemo(text),
  memos: (limit) => recentMemos(limit),
  now: () => Date.now(),
  // The mini writes the minutes within about two minutes of the end (minutes-store.ts); this server does not call Claude for them.
  minutesAfter: async () => {},
  minutesFor: (source, refs) => minutesFor(source, refs),
  minutes: minutesDeps,
}
