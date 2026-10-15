// Conversations: each user message is one Agent SDK query (resuming the chat's Claude Code session), streamed
// into an event log. Events carry a per-chat sequence number; the browser long-polls for the ones after the
// last it has (tunn3l holds a streamed response until it ends, so no SSE).
import { query } from '@anthropic-ai/claude-agent-sdk'
import * as store from './store.mjs'
import { almanacServer, TOOL_NAMES } from './tools.mjs'
import { systemPrompt } from './prompt.mjs'
import { corpusStats } from './db.mjs'
import { MODEL, EFFORT, WORKSPACE } from './config.mjs'
import { childEnv } from './env.mjs'
import { onJobEvent } from './jobs.mjs'

const live = new Map()
let SYSTEM = null
const system = async () => (SYSTEM ||= systemPrompt(await corpusStats()))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const short = name => String(name).replace(/^mcp__almanac__/, '')
export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status } }

class Live {
  constructor(chatId) {
    Object.assign(this, { chatId, events: [], waiters: new Set(), running: false, partial: '', pending: '', timer: null,
      thought: '', thinkTimer: null, q: null, abort: null, stopped: false })
  }
  emit(type, data = {}, persist = true) {
    const ev = { seq: store.chats.nextSeq(this.chatId), t: store.now(), type, ...data }
    if (persist) store.events.add(this.chatId, ev)
    this.events.push(ev)
    if (this.events.length > 4000) this.events.splice(0, 2000)
    for (const w of this.waiters) w()
    this.waiters.clear()
    return ev
  }
  delta(text) {
    this.partial += text
    this.pending += text
    this.timer ||= setTimeout(() => this.flush(), 120)
  }
  flush() {
    clearTimeout(this.timer); this.timer = null
    if (this.pending) { const text = this.pending; this.pending = ''; this.emit('delta', { text }, false) }
  }
  think(text) {
    this.thought += text
    this.thinkTimer ||= setTimeout(() => {
      this.thinkTimer = null
      this.emit('thinking', { text: this.thought.slice(-400) }, false)
    }, 400)
  }
}
const getLive = id => { let L = live.get(id); if (!L) live.set(id, (L = new Live(id))); return L }

// tool inputs as shown in the chat: long strings cut, bulky payloads replaced by their size
function trimInput(input) {
  const out = {}
  for (const [k, v] of Object.entries(input || {})) {
    if (['html', 'markdown'].includes(k)) out[k] = `${Math.round(String(v).length / 100) / 10} KB`
    else if (k === 'rows') out[k] = `${v.length} rows`
    else if (k === 'spec') out[k] = { mark: v?.mark, layers: v?.layer?.length }
    else if (k === 'fields') out[k] = v.map(f => ({ name: f.name, type: f.type, options: f.options }))
    else if (typeof v === 'string') out[k] = v.length > 3000 ? v.slice(0, 3000) + '…' : v
    else out[k] = v
  }
  return out
}

function handle(L, m) {
  if (m.parent_tool_use_id) return
  switch (m.type) {
    case 'system':
      if (m.subtype === 'init') store.chats.setSession(L.chatId, m.session_id)
      break
    case 'stream_event': {
      const e = m.event
      if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') L.delta(e.delta.text)
      else if (e.type === 'content_block_delta' && e.delta?.type === 'thinking_delta') L.think(e.delta.thinking || '')
      else if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
        L.flush()
        L.emit('tool_start', { id: e.content_block.id, name: short(e.content_block.name) }, false)
      }
      break
    }
    case 'assistant':
      for (const b of m.message?.content || []) {
        if (b.type === 'text' && b.text.trim()) { L.flush(); L.partial = ''; L.emit('text', { text: b.text }) }
        else if (b.type === 'tool_use') { L.flush(); L.thought = ''; L.emit('tool', { id: b.id, name: short(b.name), input: trimInput(b.input) }) }
      }
      break
    case 'user': {
      const content = m.message?.content
      if (!Array.isArray(content)) break
      for (const b of content) {
        if (b.type !== 'tool_result') continue
        const t = typeof b.content === 'string' ? b.content : (b.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n')
        L.emit('tool_result', { id: b.tool_use_id, ok: !b.is_error, summary: t.split('\n')[0].slice(0, 400) })
      }
      break
    }
  }
}

async function attempt(L, prompt, resume) {
  const abort = new AbortController()
  L.abort = abort
  const options = {
    model: MODEL, effort: EFFORT, thinking: { type: 'adaptive', display: 'summarized' },
    tools: [], mcpServers: { almanac: almanacServer({ chatId: L.chatId, author: L.author, onArtifact: a => L.emit('artifact', a) }) },
    allowedTools: TOOL_NAMES.map(n => `mcp__almanac__${n}`), permissionMode: 'dontAsk', settingSources: [],
    systemPrompt: await system(), includePartialMessages: true, maxTurns: 80, cwd: WORKSPACE, env: childEnv(),
    abortController: abort, ...(resume ? { resume } : {}),
  }
  let init = false, result = null
  try {
    L.q = query({ prompt, options })
    for await (const m of L.q) {
      if (m.type === 'system' && m.subtype === 'init') init = true
      if (m.type === 'result') result = m
      handle(L, m)
    }
    return { result }
  } catch (e) {
    return { error: String(e?.message || e), init, result }
  } finally {
    L.flush()
    L.q = null
  }
}

async function runTurn(L, text) {
  const t0 = Date.now()
  const prompt = `${L.author}: ${text}`
  const session = store.chats.get(L.chatId).session_id
  let r = await attempt(L, prompt, session)
  if (r.error && !r.init && session && !L.stopped) {
    // the stored session is gone (cleared transcripts, a move): start a fresh one
    r = await attempt(L, `${L.author}: (The earlier part of this conversation could not be restored; ask if you need it.)\n\n${text}`, null)
  }
  const res = r.result
  const ok = !r.error && res?.subtype === 'success'
  const error = L.stopped ? null : r.error || (res && res.subtype !== 'success' ? [res.subtype, ...(res.errors || [])].join(': ') : null)
  if (L.partial.trim()) { L.emit('text', { text: L.partial }); L.partial = '' }
  L.emit('done', { ok, stopped: L.stopped || undefined, error: error ? error.slice(0, 600) : undefined,
    ms: Date.now() - t0, cost: res?.total_cost_usd, turns: res?.num_turns })
}

export function startTurn(chatId, text, author) {
  const chat = store.chats.get(chatId)
  if (!chat) throw new HttpError(404, 'no such conversation')
  const L = getLive(chatId)
  if (L.running) throw new HttpError(409, 'still answering the last message')
  Object.assign(L, { running: true, partial: '', pending: '', thought: '', stopped: false, author })
  L.emit('user', { text, author })
  store.chats.touch(chatId)
  runTurn(L, text)
    .catch(e => { console.error('turn failed', e); L.emit('done', { ok: false, error: String(e?.message || e) }) })
    .finally(() => { L.running = false; store.chats.touch(chatId); for (const w of L.waiters) w(); L.waiters.clear() })
}

export function stopTurn(chatId) {
  const L = live.get(chatId)
  if (!L?.running) return false
  L.stopped = true
  L.q?.interrupt().catch(() => {})
  const abort = L.abort
  setTimeout(() => { if (L.running && L.abort === abort) abort?.abort() }, 4000)
  return true
}

export function snapshot(chatId) {
  const chat = store.chats.get(chatId)
  if (!chat) throw new HttpError(404, 'no such conversation')
  const L = live.get(chatId)
  const running = !!L?.running
  return {
    chat: { id: chat.id, title: chat.title, author: chat.author, created: chat.created, updated: chat.updated },
    events: store.events.list(chatId),
    running,
    // streamed text not yet in a stored event (minus what is still waiting to go out as a delta)
    partial: running ? L.partial.slice(0, L.partial.length - L.pending.length) : '',
    last: chat.last_seq,
  }
}

export async function waitEvents(chatId, after, waitMs = 25000, holdMs = 150) {
  const L = getLive(chatId)
  const collect = () => {
    const mem = L.events.filter(e => e.seq > after)
    const oldest = L.events.length ? L.events[0].seq : Infinity
    return after < oldest - 1 ? [...store.events.list(chatId, after).filter(e => e.seq < oldest), ...mem] : mem
  }
  let events = collect()
  if (!events.length && L.running && waitMs > 0) {
    await new Promise(res => {
      const done = () => { clearTimeout(t); L.waiters.delete(done); res() }
      const t = setTimeout(done, waitMs)
      L.waiters.add(done)
    })
    if (holdMs) await sleep(holdMs)
    events = collect()
  }
  return { events, running: L.running, last: events.length ? events[events.length - 1].seq : after }
}

export function removeChat(chatId) {
  stopTurn(chatId)
  live.delete(chatId)
  store.chats.remove(chatId)
}
export const isRunning = chatId => !!live.get(chatId)?.running

onJobEvent(job => {
  if (!job?.chat_id || !store.chats.get(job.chat_id)) return
  getLive(job.chat_id).emit('job', { job_id: job.id, name: job.name, status: job.status, done: job.done, total: job.total, artifact_id: job.artifact_id })
})
