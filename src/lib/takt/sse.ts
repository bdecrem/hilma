// Server-sent events for Agent mode: the app reads the steps as the agent works. One JSON
// object per `data:` line; a comment every ten seconds keeps the connection open through a
// long Opus turn.

export function sseResponse(run: (emit: (event: Record<string, unknown>) => void) => Promise<void>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const send = (line: string) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(line))
        } catch {
          open = false
        }
      }
      const emit = (event: Record<string, unknown>) => send(`data: ${JSON.stringify(event)}\n\n`)
      const heartbeat = setInterval(() => send(': ping\n\n'), 10_000)
      try {
        await run(emit)
      } catch (e) {
        console.error('[takt/mods] turn failed:', e)
        emit({ type: 'error', text: e instanceof Error ? e.message : String(e) })
      } finally {
        clearInterval(heartbeat)
        open = false
        try {
          controller.close()
        } catch {
          // already closed by the client
        }
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
