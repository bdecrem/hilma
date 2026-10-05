'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { inlines } from '@/lib/osai/core'

type Msg = { role: 'user' | 'assistant'; content: string; model?: string | null; searching?: boolean }
type ModelKey = 'opus' | 'fable'
type State = {
  history: Msg[]
  models: Record<ModelKey, { id: string; label: string }>
  defaultModel: ModelKey
}

const MODEL_KEY = 'osai:model'
const CHECK_WEB = 'Check the web for anything newer on this.'

function labelFor(models: State['models'] | null, id?: string | null) {
  if (!models || !id) return null
  for (const k of Object.keys(models) as ModelKey[]) if (models[k].id === id) return models[k].label
  return id
}

/** The route appends "Sources:" + markdown links after a search turn; show them as chips. */
function splitSources(text: string): { body: string; sources: { url: string; host: string }[] } {
  const at = text.lastIndexOf('\n\nSources:\n')
  if (at < 0) return { body: text, sources: [] }
  const sources: { url: string; host: string }[] = []
  for (const m of text.slice(at).matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)) {
    let host = m[1]
    try {
      host = new URL(m[1]).hostname.replace(/^www\./, '')
    } catch { /* keep the url */ }
    if (!sources.some((s) => s.url === m[1])) sources.push({ url: m[1], host })
  }
  return { body: text.slice(0, at), sources }
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlines(text).map((t, i) =>
        t.kind === 'link' ? <a key={i} href={t.href} target="_blank" rel="noreferrer">{t.text}</a> : t.kind === 'em' ? <em key={i}>{t.text}</em> : t.kind === 'strong' ? <strong key={i}>{t.text}</strong> : <span key={i}>{t.text}</span>,
      )}
    </>
  )
}

/** Paragraphs, lists, *em* / **strong** / links, and a chip row for sources. */
function Rich({ text }: { text: string }) {
  const { body, sources } = splitSources(text)
  const blocks = body.split(/\n{2,}/)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n').filter((l) => l.trim())
        if (!lines.length) return null
        const isList = lines.every((l) => /^\s*(?:[-•*]|\d+[.)])\s+/.test(l))
        if (isList) {
          const ordered = /^\s*\d+[.)]/.test(lines[0])
          const items = lines.map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, ''))
          return ordered ? (
            <ol key={i}>{items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ol>
          ) : (
            <ul key={i}>{items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>
          )
        }
        if (lines.length === 1 && /^(From the web|Sources)[:]?$/i.test(lines[0].trim())) {
          return <div key={i} className="section">{lines[0].replace(/:$/, '')}</div>
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Inline text={l.replace(/^#+\s*/, '')} />
              </span>
            ))}
          </p>
        )
      })}
      {sources.length > 0 && (
        <div className="sources">
          {sources.map((s, i) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" title={s.url}>
              <span className="n">{i + 1}</span>{s.host}
            </a>
          ))}
        </div>
      )}
    </>
  )
}

const Globe = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="8" cy="8" r="6.3" />
    <path d="M1.7 8h12.6M8 1.7c2.2 2.1 2.2 10.5 0 12.6M8 1.7c-2.2 2.1-2.2 10.5 0 12.6" />
  </svg>
)

export default function Chat({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [model, setModel] = useState<ModelKey>('opus')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [webNext, setWebNext] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/osai/chat')
      .then(async (r) => {
        if (!r.ok) throw new Error(`Could not load the conversation (${r.status}).`)
        return (await r.json()) as State
      })
      .then((s) => {
        if (cancelled) return
        setState(s)
        setMessages(s.history)
        let m: ModelKey = s.defaultModel
        try {
          const saved = localStorage.getItem(MODEL_KEY)
          if (saved === 'opus' || saved === 'fable') m = saved
        } catch { /* storage unavailable */ }
        setModel(m)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  function pickModel(m: ModelKey) {
    setModel(m)
    try { localStorage.setItem(MODEL_KEY, m) } catch { /* ignore */ }
  }

  const send = useCallback(
    async (text: string, opts: { search?: boolean } = {}) => {
      const content = text.trim()
      if (!content || busy) return
      const search = opts.search ?? webNext
      setWebNext(false)
      setError(null)
      setInput('')
      if (inputRef.current) inputRef.current.style.height = 'auto'
      const next: Msg[] = [...messages, { role: 'user', content }]
      const modelId = state?.models[model].id
      setMessages([...next, { role: 'assistant', content: '', model: modelId, searching: search }])
      setBusy(true)
      try {
        const res = await fetch('/api/osai/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: content, model, search }),
        })
        if (!res.ok || !res.body) {
          setError(await res.text())
          setMessages(next)
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let acc = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          const snapshot = acc
          setMessages([...next, { role: 'assistant', content: snapshot, model: modelId, searching: search && !snapshot.trim() }])
        }
        if (!acc.trim()) {
          setError('Empty reply.')
          setMessages(next)
        } else {
          setMessages([...next, { role: 'assistant', content: acc, model: modelId }])
        }
      } catch (e) {
        setError((e as Error).message)
        setMessages(next)
      } finally {
        setBusy(false)
        inputRef.current?.focus()
      }
    },
    [busy, messages, model, state, webNext],
  )

  async function newConversation() {
    if (busy) return
    const res = await fetch('/api/osai/chat', { method: 'DELETE' })
    if (res.ok) setMessages([])
    else setError('Could not clear the conversation.')
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const models = state?.models ?? null
  const last = messages.length - 1

  return (
    <section className="osai-chat">
      <div className="head">
        <h2>Ask</h2>
        <div className="tools">
          <div className="seg" role="group" aria-label="Model">
            <button type="button" aria-pressed={model === 'opus'} onClick={() => pickModel('opus')} title="claude-opus-5-5">
              {models?.opus.label ?? 'Opus 5.5'}
            </button>
            <button type="button" aria-pressed={model === 'fable'} onClick={() => pickModel('fable')} title="claude-fable-5-1">
              {models?.fable.label ?? 'Fable 5.1'}
            </button>
          </div>
          {messages.length > 0 && <button type="button" className="new" onClick={newConversation} disabled={busy}>New</button>}
          <button className="close" type="button" onClick={onClose} aria-label="Close the assistant" title="Close (Esc)">×</button>
        </div>
      </div>

      <div className="log" ref={logRef}>
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="msg user">{m.content}</div>
          ) : (
            <div key={i} className="msg assistant">
              <div className="model">{labelFor(models, m.model) ?? 'Assistant'}</div>
              {m.searching && !m.content.trim() ? (
                <div className="searching">Searching the web…</div>
              ) : (
                <Rich text={m.content} />
              )}
              {busy && i === last && !m.searching && <span className="cursor" aria-hidden="true" />}
              {!busy && i === last && !/\n\nSources:\n/.test(m.content) && (
                <button type="button" className="check-web" onClick={() => void send(CHECK_WEB, { search: true })}>
                  <Globe /> Check the web
                </button>
              )}
            </div>
          ),
        )}
      </div>

      {error && <div className="err" role="alert">{error}</div>}

      <div className="compose">
        <textarea
          id="osai-chat-input"
          ref={inputRef}
          rows={1}
          value={input}
          placeholder={state ? 'Ask…' : ''}
          disabled={!state}
          onChange={(e) => { setInput(e.target.value); grow(e.target) }}
          onKeyDown={onKey}
        />
        <button
          type="button"
          className="web"
          aria-pressed={webNext}
          aria-label="Search the web"
          disabled={!state || busy}
          title="Search the web"
          onClick={() => setWebNext((v) => !v)}
        >
          <Globe />
        </button>
        <button className="send" type="button" disabled={!state || busy || !input.trim()} onClick={() => void send(input)}>
          Send
        </button>
      </div>
    </section>
  )
}
