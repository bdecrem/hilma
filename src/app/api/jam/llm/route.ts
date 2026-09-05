// Jam — one Messages API call for the browser-side Jambot agent loop.
//
// The whole agent (session, tools, rendering) runs in the browser; this route
// only adds the API key. The request body is exactly what core/agent.js
// hands its `llm` function: { system, messages, tools, max_tokens }.
//
// Requires a signed-in Jam account (jam_session cookie) so a public URL
// can't become an open proxy for the key.

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'

export const runtime = 'nodejs'
export const maxDuration = 120

const DEFAULT_MODEL = 'claude-opus-5'
const MAX_TOKENS_CAP = 16384

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

export async function POST(req: NextRequest) {
  const user = await getJamUser()
  if (!user) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  }

  let body: { system?: unknown; messages?: unknown; tools?: unknown; max_tokens?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const { system, messages, tools, max_tokens } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }
  if (!Array.isArray(tools)) {
    return NextResponse.json({ error: 'tools required' }, { status: 400 })
  }

  const model = process.env.JAM_MODEL || DEFAULT_MODEL
  const maxTokens = Math.min(typeof max_tokens === 'number' ? max_tokens : 8192, MAX_TOKENS_CAP)

  try {
    const res = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      system: system as Anthropic.MessageCreateParams['system'],
      tools: tools as Anthropic.MessageCreateParams['tools'],
      messages: messages as Anthropic.MessageParam[],
    })
    return NextResponse.json(res)
  } catch (err) {
    const e = err as { status?: number; message?: string }
    console.error('[jam/llm]', e.status, e.message)
    return NextResponse.json({ error: e.message || 'LLM call failed' }, { status: e.status && e.status >= 400 ? e.status : 502 })
  }
}
