import { readFileSync } from 'node:fs';
import path from 'node:path';

// Chat with the model on the Stanford Mac mini (qwen3.5:9b via Ollama),
// with the Openlab constitution as the system prompt. Streams plain text.
export const runtime = 'nodejs';
export const maxDuration = 120;

let _constitution: string | undefined;
function constitution() {
  if (!_constitution) {
    _constitution = readFileSync(
      path.join(process.cwd(), 'apps/openlab/01-constitution/constitution.md'),
      'utf8',
    );
  }
  return _constitution;
}

type Msg = { role: 'user' | 'assistant'; content: string };

export async function POST(req: Request) {
  const url = process.env.OPENLAB_MINI_URL;
  const token = process.env.OPENLAB_MINI_TOKEN;
  if (!url || !token) return new Response('OPENLAB_MINI_URL / OPENLAB_MINI_TOKEN not set', { status: 500 });

  const body = (await req.json()) as { messages?: Msg[] };
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!messages.length) return new Response('no messages', { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: process.env.OPENLAB_MODEL || 'qwen3.5:9b',
        messages: [{ role: 'system', content: constitution() }, ...messages],
        stream: true,
        think: false,
        options: { temperature: 0.3, num_predict: 800 },
      }),
    });
  } catch (e) {
    return new Response(`The mini is not reachable (${(e as Error).message}).`, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(`The mini answered ${upstream.status}: ${await upstream.text()}`, { status: 502 });
  }

  // Ollama streams NDJSON; forward only the text tokens.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = '';
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) { controller.close(); return; }
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line) as { message?: { content?: string }; error?: string };
          if (j.error) controller.enqueue(encoder.encode(`\n[${j.error}]`));
          else if (j.message?.content) controller.enqueue(encoder.encode(j.message.content));
        } catch { /* partial line */ }
      }
    },
    cancel() { reader.cancel(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
