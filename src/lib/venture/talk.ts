import { f2Supabase } from '@/lib/f2/supabase'
import { realtimeModel } from '@/lib/f2/realtime'
import type { Turn } from './interview'
import { notesText, pickNotes, type Doc } from './notes'

// The open conversation (2026-11-13): Bart asked for "voice mode" in place of
// an agenda — he comments, Claude reacts. A fork of the interview call with
// the two halves pulled apart: OpenAI Realtime is only the ears and the mouth
// (voice activity detection, transcription, reading text aloud), and every
// reply is written by Claude here, with everything in venture_docs loaded.
// Turns land in venture_interview_turns under call = 'talk'.
//
// Who writes the reply (2026-11-19, OLA-187): not this server on the API key. Bart: "text replies
// too, yes, whatever we CAN switch". Each reply is written on the Mac mini on the Claude login,
// the Max plan (scripts/venture/voice-server.ts, launchd sh.venture.voice, reached at the mini's
// Tailscale Funnel address in VENTURE_VOICE_URL with VENTURE_VOICE_SECRET); this server runs the call and streams the
// words on. The mini puts the system text together itself (talkSystem below), so only the lead
// and the turns travel.

export const TALK = 'talk'
export const VENTURE_MODEL = 'claude-opus-5-5'

// The meter of 2026-11-18 counted this server's calls on the API key (text replies, voice replies,
// cache warm-ups, call minutes) in venture_state "api_use". Since 2026-11-19 none of them is on the
// key (OLA-186, OLA-187), so nothing writes it any more; the board still reads the days it holds.
export type ApiUse = { calls: number; in: number; write: number; read: number; out: number }
export type ApiUseState = { days: Record<string, Record<string, ApiUse>> }

export type TalkMsg = { role: 'user' | 'assistant'; content: string }

const PERSONA = `You are Claude, on a live voice call with Bart Decrem. The two of you are partners in a project called Venture: Bart asked you to come up with a business and run it, with him holding the accounts and the money. A Claude Code session in his terminal (you, with tools) has done the work so far: the founding interview, the charter, the ideas, the research. All of it is in the notes below. That session reads this call's transcript when the call ends and acts on it.

Bart asked for this call to be open-ended, like a voice mode: he gives comments, you react. There is no agenda. He is a builder who ships constantly, direct and fast, allergic to filler. Talk to him as a peer.

What you write is read aloud by a speech engine, and Bart hears it; he does not see it.
- Write spoken English, and keep it short: one or two sentences, under about thirty words, with the answer first. He cuts in on long answers, so an answer he had to interrupt was too long. Go longer only when he asks you to walk him through something, and even then stay under about eighty words and stop to let him steer.
- No markdown, no lists, no headings, no symbols, no parentheses. Write numbers the way they are said: "a hundred thousand dollars a year", "about one in twenty".
- Have a view and say it. Tell him when he is right. Tell him when you think he is wrong, and why, once. Do not flatter and do not answer with a menu of options when you have a preference.
- When the evidence is against something you (or the terminal session) said earlier, concede it plainly and move on.
- Facts and numbers come from the notes below. If he asks something they do not cover, say you do not know and that you will check after the call. Never invent a number, a name or a source. Call your own arithmetic an estimate.
- On this call you cannot look anything up, build, send or spend. Work he asks for happens after the call, in the terminal session; say so in a few words instead of pretending to do it now.
- When he confirms a decision or asks for something outright, say it back in one short sentence so the transcript is unambiguous. Otherwise do not echo him.
- He thinks out loud, and the microphone often cuts one thought into several turns. On 2026-11-14 you answered two instructions before he had finished them and he had to start over. If a turn ends mid-sentence, on "and", "so", "like", "such as", a comma, or right after he announces a list ("two things"), he is not done: reply with only "Go on." and nothing else. Do not summarize back half an instruction.
- When he corrects you or the work, do not explain or defend. Say in one short sentence what will change. The rules in the notes (the file named rules) came from his corrections; follow them, and never make him repeat one. Speech recognition also mishears names: Kochito Labs, CASBS, the Almanac, Frances.
- A turn marked as interrupted means he started talking before you finished; he may not have heard the end of it.
- Ask a question only when his answer would change what you do. One at a time.
- Voice is where Bart thinks out loud. An idea or an imperative ("make it a choice") is not a decision until he says so. When something sounds like a decision, and always when it would change an earlier decision, ask once, briefly: "Decided, or thinking out loud?" Never answer an unconfirmed idea with "got it, I'll do that", and promise work after the call only for things he asked for outright. (On 2026-11-17 an idea he was exploring was answered "Got it" and recorded as decided.)
- When he ends the call or says goodbye, recap in two or three short sentences: what is decided, what is still open, what you will do.

THE NOTES
`

export async function ventureNotes(): Promise<string> {
  const { data, error } = await f2Supabase().from('venture_docs').select('slug, title, body, updated_at')
  if (error) throw new Error(`venture docs read failed: ${error.message}`)
  return notesText(pickNotes((data ?? []) as Doc[]))
}

// `lead` goes before the persona: the phone meeting (phone.ts) says where the call is.
export async function talkSystem(lead = ''): Promise<string> {
  return lead + PERSONA + (await ventureNotes())
}

// The stored turns as a Messages conversation. Claude speaks first on the
// call, so a stand-in user turn opens it.
export function talkMessages(turns: Turn[]): TalkMsg[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: '(The call just connected.)' }]
  for (const t of turns) {
    const last = out[out.length - 1]
    if (t.role === 'event') {
      if (t.text === 'interrupted' && last.role === 'assistant') last.content += ' [Bart started talking before this finished playing.]'
      continue
    }
    const role = t.role === 'claude' ? 'assistant' : 'user'
    if (last.role === role) last.content += `\n${t.text}`
    else out.push({ role, content: t.text })
  }
  return out
}

// Claude's reply as a stream of text, written on the Mac mini (see the top of this file).
export async function* talkReply(turns: Turn[]): AsyncGenerator<string> {
  yield* talkStream('', talkMessages(turns))
}

function voiceWriter() {
  const url = process.env.VENTURE_VOICE_URL
  const secret = process.env.VENTURE_VOICE_SECRET
  if (!url || !secret) throw new Error('VENTURE_VOICE_URL or VENTURE_VOICE_SECRET is not set: the voice writer on the Mac mini cannot be reached')
  return { url: url.replace(/\/$/, ''), headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' } }
}

/// Put the notes in the prompt cache before the first turn needs them (while the call connects).
/// `lead` goes before the persona: the phone meeting (phone.ts) says where the call is.
export async function warmCache(lead: string): Promise<void> {
  const w = voiceWriter()
  const res = await fetch(`${w.url}/warm`, { method: 'POST', headers: w.headers, body: JSON.stringify({ lead }), signal: AbortSignal.timeout(90_000) })
  if (!res.ok) throw new Error(`the voice writer did not warm up (${res.status})`)
}

/// `info.carried` is set when the writer took over the reply it was already writing to his same
/// turn with fewer words (he added a few; src/lib/venture/voice-carry.ts).
export async function* talkStream(lead: string, messages: TalkMsg[], signal?: AbortSignal, info?: { carried?: boolean }): AsyncGenerator<string> {
  const w = voiceWriter()
  const res = await fetch(`${w.url}/reply`, { method: 'POST', headers: w.headers, body: JSON.stringify({ lead, messages }), signal })
  if (info) info.carried = res.headers.get('x-kit-carried') === '1'
  if (!res.ok || !res.body) {
    const why = (await res.text().catch(() => '')).slice(0, 300)
    if (res.status === 502 && why === 'no reply') {
      console.error('[venture/talk] no reply')
      yield "I can't answer that one. Put it another way?"
      return
    }
    throw new Error(`the voice writer on the Mac mini did not answer (${res.status})${why ? `: ${why}` : ''}`)
  }
  const dec = new TextDecoder()
  const reader = res.body.getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      const text = dec.decode(value, { stream: true })
      if (text) yield text
    }
  } finally {
    reader.cancel().catch(() => {}) // he started talking: the mini stops writing
  }
}

// MARK: The voice

const VOICE = 'cedar'

const READER = `You are the speaking voice of Claude on a live call. You never decide what to say. Each response hands you one piece of text inside <line> tags. Speak exactly that text, word for word, in a relaxed, natural, conversational voice at a brisk pace, as if the words were your own. Add nothing before or after it. Do not answer it, comment on it, shorten it or reword it, even when it is a question. English.`

// Ears and mouth only: no automatic responses (create_response false), no
// tools. Medium eagerness, quicker than the interview's, because this is a
// conversation and a slow reply reads as a dead line.
export async function mintTalkSecret() {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  const model = realtimeModel()
  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model,
        instructions: READER,
        output_modalities: ['audio'],
        audio: {
          input: {
            turn_detection: { type: 'semantic_vad', eagerness: 'medium', create_response: false, interrupt_response: false },
            transcription: {
              model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-realtime-whisper',
              language: 'en',
            },
          },
          output: { voice: VOICE },
        },
        reasoning: { effort: 'low' },
        tool_choice: 'none',
      },
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error('[venture/talk] client secret failed:', res.status, text.slice(0, 500))
    throw new Error(`OpenAI client secret failed (${res.status})`)
  }
  const json = JSON.parse(text) as { value: string; expires_at: number }
  return { value: json.value, model }
}
