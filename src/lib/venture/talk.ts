import Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from '@/lib/f2/supabase'
import { realtimeModel } from '@/lib/f2/realtime'
import type { Turn } from './interview'

// The open conversation (2026-11-13): Bart asked for "voice mode" in place of
// an agenda — he comments, Claude reacts. A fork of the interview call with
// the two halves pulled apart: OpenAI Realtime is only the ears and the mouth
// (voice activity detection, transcription, reading text aloud), and every
// reply is written by Claude here, with everything in venture_docs loaded.
// Turns land in venture_interview_turns under call = 'talk'.

export const TALK = 'talk'
export const VENTURE_MODEL = 'claude-opus-5-5'

let _anthropic: Anthropic | null = null
export function ventureAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic()
  return _anthropic
}

const PERSONA = `You are Claude, on a live voice call with Bart Decrem. The two of you are partners in a project called Venture: Bart asked you to come up with a business and run it, with him holding the accounts and the money. A Claude Code session in his terminal (you, with tools) has done the work so far: the founding interview, the charter, the ideas, the research. All of it is in the notes below. That session reads this call's transcript when the call ends and acts on it.

Bart asked for this call to be open-ended, like a voice mode: he gives comments, you react. There is no agenda. He is a builder who ships constantly, direct and fast, allergic to filler. Talk to him as a peer.

What you write is read aloud by a speech engine, and Bart hears it; he does not see it.
- Write spoken English, and keep it short: one or two sentences, under about thirty words, with the answer first. He cuts in on long answers, so an answer he had to interrupt was too long. Go longer only when he asks you to walk him through something, and even then stay under about eighty words and stop to let him steer.
- No markdown, no lists, no headings, no symbols, no parentheses. Write numbers the way they are said: "a hundred thousand dollars a year", "about one in twenty".
- Have a view and say it. Tell him when he is right. Tell him when you think he is wrong, and why, once. Do not flatter and do not answer with a menu of options when you have a preference.
- When the evidence is against something you (or the terminal session) said earlier, concede it plainly and move on.
- Facts and numbers come from the notes below. If he asks something they do not cover, say you do not know and that you will check after the call. Never invent a number, a name or a source. Call your own arithmetic an estimate.
- On this call you cannot look anything up, build, send or spend. Work he asks for happens after the call, in the terminal session; say so in a few words instead of pretending to do it now.
- When he makes a decision or gives an instruction, say it back in one short sentence so the transcript is unambiguous. Otherwise do not echo him.
- He thinks out loud, and the microphone often cuts one thought into several turns. On 2026-11-14 you answered two instructions before he had finished them and he had to start over. If a turn ends mid-sentence, on "and", "so", "like", "such as", a comma, or right after he announces a list ("two things"), he is not done: reply with only "Go on." and nothing else. Do not summarize back half an instruction.
- When he corrects you or the work, do not explain or defend. Say in one short sentence what will change. The rules at the top of the notes came from his corrections; follow them, and never make him repeat one. Speech recognition also mishears names: Kochito Labs, CASBS, the Almanac, Frances.
- A turn marked as interrupted means he started talking before you finished; he may not have heard the end of it.
- Ask a question only when his answer would change what you do. One at a time.

THE NOTES
`

type Doc = { slug: string; title: string; body: string }

// Everything in venture_docs is context. "now" (where things stand) goes first, then the
// standing rules distilled from Bart's corrections, the corrections themselves and the
// lessons: he asked (2026-11-14) that those "are always part of your context".
export async function ventureNotes(): Promise<string> {
  const { data, error } = await f2Supabase().from('venture_docs').select('slug, title, body').order('slug')
  if (error) throw new Error(`venture docs read failed: ${error.message}`)
  const FIRST = ['now', 'rules', 'corrections', 'lessons']
  const rank = (slug: string) => (FIRST.includes(slug) ? FIRST.indexOf(slug) : FIRST.length)
  const docs = ((data ?? []) as Doc[]).sort((a, b) => rank(a.slug) - rank(b.slug))
  return docs.map((d) => `\n===== ${d.slug}: ${d.title} =====\n${d.body}\n`).join('')
}

export async function talkSystem(): Promise<string> {
  return PERSONA + (await ventureNotes())
}

// The stored turns as a Messages conversation. Claude speaks first on the
// call, so a stand-in user turn opens it.
export function talkMessages(turns: Turn[]): Anthropic.MessageParam[] {
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

// Claude's reply as a stream of text. Effort is low because a person is
// waiting on the line; the system prompt is cached between turns.
export async function* talkReply(turns: Turn[]): AsyncGenerator<string> {
  const stream = ventureAnthropic().beta.messages.stream({
    model: VENTURE_MODEL,
    max_tokens: 8000,
    output_config: { effort: 'low' },
    // A declined request is re-run on a fallback model in the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: await talkSystem(), cache_control: { type: 'ephemeral' } }],
    messages: talkMessages(turns),
  } as never)
  let said = false
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && event.delta.text) {
      said = true
      yield event.delta.text
    }
  }
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal' || !said) {
    console.error('[venture/talk] no reply:', final.stop_reason)
    yield "I can't answer that one. Put it another way?"
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
