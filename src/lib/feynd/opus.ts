type Turn = { role: 'user' | 'assistant'; text: string }

type VideoContext = {
  title?: string
  author?: string
  host?: string
  publishedOn?: string
  transcript?: string
}

const DEFAULT_SYSTEM = `You are the reasoning brain behind Feynd, a voice tutor that can teach anything. A voice AI has captured the user's spoken question and passed it to you. Answer clearly, accurately, and with a light, curious tone.

Your output will be spoken aloud, so write plain prose:
- No markdown, no bullet points, no headers, no code blocks.
- Short sentences. Conversational cadence. Vivid examples and analogies.
- Two to four sentences is usually enough. Go longer only when the idea genuinely needs it.

If the question is broad, pick the most useful angle and address it directly — don't ask a clarifying question, since that round-trip is expensive. If the question is genuinely nonsensical, say so briefly.`

export async function opusAsk(opts: {
  question: string
  history?: Turn[]
  videoContext?: VideoContext
  system?: string              // override the default spoken-prose persona
  maxTokens?: number
  temperature?: number
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const history = Array.isArray(opts.history) ? opts.history.slice(-20) : []
  const messages = [
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user' as const, content: opts.question },
  ]

  const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
    { type: 'text', text: opts.system ?? DEFAULT_SYSTEM },
  ]
  const vc = opts.videoContext
  if (vc && vc.transcript && vc.transcript.trim().length > 0) {
    const header = `The user is asking about this specific video. Ground your answer in its transcript. If the transcript doesn't cover the question, say so briefly, then give your best answer from general knowledge.\n\nVIDEO: "${vc.title ?? ''}" — ${vc.author ?? ''}${vc.host ? ` (with ${vc.host})` : ''}${vc.publishedOn ? `, ${vc.publishedOn}` : ''}\n\nTRANSCRIPT:\n`
    systemBlocks.push({
      type: 'text',
      text: header + vc.transcript,
      cache_control: { type: 'ephemeral' },
    })
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: opts.maxTokens ?? 700,
      temperature: opts.temperature ?? 1,
      system: systemBlocks,
      messages,
    }),
  })

  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${raw}`)
  }
  const data = JSON.parse(raw) as { content?: Array<{ type: string; text?: string }> }
  const answer = (data.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n')
    .trim()
  if (!answer) throw new Error('No text in Anthropic response')
  return answer
}
