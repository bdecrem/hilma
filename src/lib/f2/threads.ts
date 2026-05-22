import { f2Supabase } from './supabase'
import type { F2Client } from './agent'

export type F2ThreadMessage = {
  role: 'user' | 'assistant'
  text: string
  created_at: string
}

export type F2Thread = {
  id: string
  handle: string
  client: F2Client
  url: string | null
  topic: string | null
  content: string | null
  messages: F2ThreadMessage[]
  created_at: string
  updated_at: string
}

export type CreateThreadInput = {
  client: F2Client
  handle: string
  url?: string | null
  topic?: string | null
  content?: string | null
}

export async function createThread(
  input: CreateThreadInput,
): Promise<F2Thread | null> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .insert({
      client: input.client,
      handle: input.handle,
      url: input.url ?? null,
      topic: input.topic ?? null,
      content: input.content ?? null,
      messages: [],
    })
    .select('*')
    .single()

  if (error) {
    console.error('[f2] createThread failed:', error)
    return null
  }
  return data as F2Thread
}

export async function getLatestThread(
  client: F2Client,
  handle: string,
): Promise<F2Thread | null> {
  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .select('*')
    .eq('client', client)
    .eq('handle', handle)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[f2] getLatestThread failed:', error)
    return null
  }
  return (data as F2Thread | null) ?? null
}

export async function appendMessages(
  threadId: string,
  existing: F2ThreadMessage[],
  toAdd: F2ThreadMessage[],
): Promise<void> {
  const messages = [...existing, ...toAdd]
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ messages, updated_at: new Date().toISOString() })
    .eq('id', threadId)

  if (error) console.error('[f2] appendMessages failed:', error)
}
