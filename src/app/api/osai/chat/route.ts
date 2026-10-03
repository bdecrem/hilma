// osai chat: one streamed Messages call per turn, grounded in the three
// documents (src/lib/osai/prompt.ts), with the reader's history and memory
// note from Supabase. Streams plain text. Opus 5.5 by default, Fable 5.1 on
// request; both run with server-side refusal fallbacks on.
//
// Web search is off unless the client asks for it on a turn ({ search: true }):
// the tool is only attached then, so the default answer is document-only.

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse, after } from 'next/server'
import { DISPLAY, getOsaiUser, type OsaiUser } from '@/lib/osai/auth'
import { osaiDb } from '@/lib/osai/db'
import { getNotes, updateNotes } from '@/lib/osai/memory'
import { buildSystem, DEFAULT_MODEL, MODELS, type ModelKey } from '@/lib/osai/prompt'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_TURNS = 40
const MAX_INPUT = 8000
const MAX_TOKENS = 8192
const MAX_SEARCHES = 5
const MAX_CONTINUATIONS = 2 // pause_turn resumes for long searches

let _client: Anthropic | null = null
function client() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

type Row = { id: number; role: 'user' | 'assistant'; content: string; model: string | null; created_at: string }

async function history(user: OsaiUser, limit: number): Promise<Row[]> {
  const { data, error } = await osaiDb()
    .from('osai_messages')
    .select('id, role, content, model, created_at')
    .eq('user_name', user)
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[]).reverse()
}

function searchTool(key: ModelKey): Anthropic.Beta.BetaToolUnion {
  // The dynamic-filtering variant is documented for the Opus line; Fable keeps the basic one.
  return key === 'fable'
    ? { type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES }
    : { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES }
}

export async function GET() {
  const user = await getOsaiUser()
  if (!user) return NextResponse.json({ error: 'sign in' }, { status: 401 })
  const [rows, notes] = await Promise.all([history(user, 200), getNotes(user)])
  return NextResponse.json({ user, name: DISPLAY[user], history: rows, notes, models: MODELS, defaultModel: DEFAULT_MODEL })
}

export async function DELETE() {
  const user = await getOsaiUser()
  if (!user) return NextResponse.json({ error: 'sign in' }, { status: 401 })
  const { error } = await osaiDb().from('osai_messages').delete().eq('user_name', user)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const user = await getOsaiUser()
  if (!user) return new Response('sign in', { status: 401 })

  let body: { message?: unknown; model?: unknown; search?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response('invalid JSON', { status: 400 })
  }
  const text = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_INPUT) : ''
  if (!text) return new Response('message required', { status: 400 })
  const key: ModelKey = body.model === 'fable' ? 'fable' : DEFAULT_MODEL
  const model = MODELS[key].id
  const search = body.search === true

  const [rows, notes] = await Promise.all([history(user, MAX_TURNS), getNotes(user)])
  let convo: Anthropic.Beta.BetaMessageParam[] = [
    ...rows.map((r) => ({ role: r.role, content: r.content })),
    { role: 'user', content: text },
  ]

  // The memory note is folded in after the response has gone out.
  let settle: (r: { reply: string } | null) => void = () => {}
  const finished = new Promise<{ reply: string } | null>((resolve) => {
    settle = resolve
  })
  after(async () => {
    const r = await finished
    if (r && r.reply.trim()) await updateNotes(user, notes, text, r.reply)
  })

  const system = buildSystem(user, notes, search)
  let current: ReturnType<Anthropic['beta']['messages']['stream']> | null = null

  const encoder = new TextEncoder()
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      let reply = ''
      const sources = new Map<string, string>()
      const send = (s: string) => {
        reply += s
        controller.enqueue(encoder.encode(s))
      }
      try {
        let finalModel = model
        for (let turn = 0; ; turn++) {
          const stream = client().beta.messages.stream({
            model,
            max_tokens: MAX_TOKENS,
            system,
            messages: convo,
            ...(search ? { tools: [searchTool(key)] } : {}),
            output_config: { effort: 'medium' },
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
          })
          current = stream
          for await (const ev of stream) {
            if (ev.type !== 'content_block_delta') continue
            if (ev.delta.type === 'text_delta') send(ev.delta.text)
            else if (ev.delta.type === 'citations_delta') {
              const c = ev.delta.citation
              if (c.type === 'web_search_result_location' && c.url) sources.set(c.url, c.title ?? c.url)
            }
          }
          const final = await stream.finalMessage()
          finalModel = final.model
          if (final.stop_reason === 'pause_turn' && turn < MAX_CONTINUATIONS) {
            convo = [...convo, { role: 'assistant', content: final.content }]
            continue
          }
          if (final.stop_reason === 'refusal') send('\n\n(Declined.)')
          else if (final.stop_reason === 'max_tokens') send('\n\n(Cut off.)')
          break
        }
        if (sources.size) {
          send('\n\nSources:\n' + [...sources].map(([url, title]) => `- [${title.replace(/[\[\]]/g, '')}](${url})`).join('\n'))
        }
        const { error } = await osaiDb()
          .from('osai_messages')
          .insert([
            { user_name: user, role: 'user', content: text, model },
            { user_name: user, role: 'assistant', content: reply, model: finalModel },
          ])
        if (error) console.error('[osai/chat] save failed:', error.message)
        settle({ reply })
      } catch (e) {
        const msg = e instanceof Anthropic.APIError ? `API error ${e.status}: ${e.message}` : (e as Error).message
        console.error('[osai/chat]', msg)
        controller.enqueue(encoder.encode(`\n\n(${msg})`))
        settle(null)
      } finally {
        controller.close()
      }
    },
    cancel() {
      current?.controller.abort()
      settle(null)
    },
  })

  return new Response(out, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-osai-model': model,
    },
  })
}
