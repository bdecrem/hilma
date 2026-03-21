const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

export async function POST(request: Request) {
  const { prompt, temperature, topP, topK } = await request.json()

  if (!prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'prompt is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hilma-writer-q4',
      prompt,
      stream: true,
      options: {
        temperature: temperature ?? 1.0,
        top_p: topP ?? 0.95,
        top_k: topK ?? 80,
        num_predict: 1024,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return new Response(JSON.stringify({ error: `Ollama error: ${errorText}` }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Transform Ollama's NDJSON stream into SSE format the frontend expects
  const reader = response.body!.getReader()
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
        return
      }
      const text = decoder.decode(value, { stream: true })
      for (const line of text.split('\n').filter(Boolean)) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.response) {
            const sseData = JSON.stringify({ choices: [{ text: parsed.response }] })
            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
          }
          if (parsed.done) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          }
        } catch {
          // skip malformed chunks
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
