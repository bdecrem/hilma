import Anthropic from '@anthropic-ai/sdk'
import type { F2Thread } from './threads'

const MODEL = 'claude-sonnet-4-6'
const MAX_CONTEXT_FOR_CHAT = 24000

let _client: Anthropic | null = null
function anthropic(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey })
  return _client
}

export async function chatWithThread(
  thread: F2Thread,
  userText: string,
): Promise<string> {
  const content = thread.content
    ? thread.content.slice(0, MAX_CONTEXT_FOR_CHAT)
    : null

  const systemText = content
    ? `You're helping the user learn about a specific source they shared. Answer their questions using the content below as the primary source. If the answer isn't in the content, say so plainly.

URL: ${thread.url}

Content:
${content}

Reply rules:
- Be direct. No preambles like "Great question" or "Based on the article".
- Plain text, no markdown.
- Keep replies tight — a few paragraphs max unless the user asks for more.`
    : `You're helping the user learn about a source they shared, but the fetched content was empty or unavailable. Answer from your general knowledge about the URL and flag uncertainty.

URL: ${thread.url}

Reply rules:
- Be direct, plain text, no markdown.
- Keep replies tight.`

  const history = thread.messages.map((m) => ({
    role: m.role,
    content: m.text,
  }))

  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 800,
    system: [
      {
        type: 'text',
        text: systemText,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [...history, { role: 'user', content: userText }],
  })

  const block = response.content[0]
  if (block?.type === 'text') return block.text.trim()
  return '(no response)'
}
