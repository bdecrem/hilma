export async function POST(request: Request) {
  const { prompt, temperature, topP, topK } = await request.json()

  if (!prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'prompt is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.TOGETHER_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'TOGETHER_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const response = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/Meta-Llama-3-8B-Instruct-Lite',
      messages: [
        {
          role: 'system',
          content: 'You are a raw text completion engine. You do not explain, summarize, or comment. You only continue the text you are given, writing in the style of literary fiction — visceral, strange, sensory, surprising. Write like Kafka, Woolf, Dostoevsky, Poe, Rimbaud. Be weird. Be embodied. Use unexpected metaphors. Never be safe or corporate. Never use bullet points or headers. Just continue the prose.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 1024,
      temperature: temperature ?? 1.0,
      top_p: topP ?? 0.95,
      top_k: topK ?? 80,
      stream: true,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return new Response(JSON.stringify({ error: `Together.ai error: ${errorText}` }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
