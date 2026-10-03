'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { inlines } from '@/lib/osai/core'

type Msg = { role: 'user' | 'assistant'; content: string; model?: string | null }
type ModelKey = 'opus' | 'fable'
type State = {
  history: Msg[]
  notes: string
  models: Record<ModelKey, { id: string; label: string }>
  defaultModel: ModelKey
}

const STARTERS = [
  'What is the case for Decentralized AI over open weights?',
  'Where is the field thinnest, and why?',
  'What should the three of us ask each other first?',
]

const MODEL_KEY = 'osai:model'

function labelFor(models: State['models'] | null, id?: string | null) {
  if (!models || !id) return null
  for (const k of Object.keys(models) as ModelKey[]) if (models[k].id === id) return models[k].label
  return id
}

/** Paragraphs, "- " lists and *em* / **strong**; nothing more. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        const isList = lines.length > 0 && lines.every((l) => /^\s*(?:[-•*]|\d+[.)])\s+/.test(l))
        if (isList) {
          const ordered = /^\s*\d+[.)]/.test(lines[0])
          const items = lines.map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, ''))
          return ordered ? (
            <ol key={i}>{items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ol>
          ) : (
            <ul key={i}>{items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>
          )
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
    </>
  )
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlines(text).map((t, i) =>
        t.kind === 'em' ? <em key={i}>{t.text}</em> : t.kind === 'strong' ? <strong key={i}>{t.text}</strong> : <span key={i}>{t.text}</span>,
      )}
    </>
  )
}

export default function Chat({
  user,
  name,
  onClose,
  onSignOut,
}: {
  user: string
  name: string
  onClose: () => void
  onSignOut: () => void
}) {
  const [state, setState] = useState<State | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [notes, setNotes] = useState('')
  const [model, setModel] = useState<ModelKey>('opus')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/osai/chat')
      .then(async (r) => {
        if (!r.ok) throw new Error(`could not load the conversation (${r.status})`)
        return (await r.json()) as State
      })
      .then((s) => {
        if (cancelled) return
        setState(s)
        setMessages(s.history)
        setNotes(s.notes)
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
  }, [user])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  function pickModel(m: ModelKey) {
    setModel(m)
    try { localStorage.setItem(MODEL_KEY, m) } catch { /* ignore */ }
  }

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || busy) return
      setError(null)
      setInput('')
      if (inputRef.current) inputRef.current.style.height = 'auto'
      const next: Msg[] = [...messages, { role: 'user', content }]
      setMessages([...next, { role: 'assistant', content: '', model: state?.models[model].id }])
      setBusy(true)
      try {
        const res = await fetch('/api/osai/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: content, model }),
        })
        if (!res.ok || !res.body) {
          setError(await res.text())
          setMessages(next)
          return
        }
        const modelId = res.headers.get('x-osai-model') ?? state?.models[model].id
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let acc = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          const snapshot = acc
          setMessages([...next, { role: 'assistant', content: snapshot, model: modelId }])
        }
        if (!acc.trim()) {
          setError('Empty reply.')
          setMessages(next)
        }
        // The memory note is updated after the reply lands; refresh it shortly after.
        setTimeout(() => {
          fetch('/api/osai/memory')
            .then((r) => (r.ok ? r.json() : null))
            .then((j: { notes?: string } | null) => j && setNotes(j.notes ?? ''))
            .catch(() => {})
        }, 6000)
      } catch (e) {
        setError((e as Error).message)
        setMessages(next)
      } finally {
        setBusy(false)
        inputRef.current?.focus()
      }
    },
    [busy, messages, model, state],
  )

  async function clearConversation() {
    if (busy) return
    const res = await fetch('/api/osai/chat', { method: 'DELETE' })
    if (res.ok) setMessages([])
    else setError('Could not clear the conversation.')
  }

  async function forget() {
    const res = await fetch('/api/osai/memory', { method: 'DELETE' })
    if (res.ok) setNotes('')
    else setError('Could not clear the memory.')
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

  return (
    <section className="osai-chat">
      <div className="head">
        <div>
          <h2>Ask the notes</h2>
          <div className="sub">Has read all three documents. Remembers you.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="seg" role="group" aria-label="Model">
            <button type="button" aria-pressed={model === 'opus'} onClick={() => pickModel('opus')} title="claude-opus-5-5">
              {models?.opus.label ?? 'Opus 5.5'}
            </button>
            <button type="button" aria-pressed={model === 'fable'} onClick={() => pickModel('fable')} title="claude-fable-5-1">
              {models?.fable.label ?? 'Fable 5.1'}
            </button>
          </div>
          <button className="close" type="button" onClick={onClose} aria-label="Close">Done</button>
        </div>
      </div>

      <div className="log" ref={logRef}>
        {state && messages.length === 0 && (
          <div className="starters">
            <p>Hi {name}. Ask anything about the one-pager or the map, or start with one of these.</p>
            {STARTERS.map((s) => (
              <button key={s} type="button" className="starter" onClick={() => void send(s)}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="msg user">{m.content}</div>
          ) : (
            <div key={i} className="msg assistant">
              <div className="model">{labelFor(models, m.model) ?? 'Assistant'}</div>
              <Rich text={m.content} />
              {busy && i === messages.length - 1 && <span className="cursor" aria-hidden="true" />}
            </div>
          ),
        )}
      </div>

      {error && <div className="err" role="alert">{error}</div>}

      <div className="compose">
        <div className="row">
          <textarea
            id="osai-chat-input"
            ref={inputRef}
            rows={1}
            value={input}
            placeholder={state ? 'Ask…' : 'Loading…'}
            disabled={!state}
            onChange={(e) => { setInput(e.target.value); grow(e.target) }}
            onKeyDown={onKey}
          />
          <button className="send" type="button" disabled={!state || busy || !input.trim()} onClick={() => void send(input)}>
            Send
          </button>
        </div>
        <div className="foot">
          <details className="memory">
            <summary>What it remembers about you</summary>
            <div className={`notes${notes.trim() ? '' : ' empty'}`}>{notes.trim() || 'Nothing yet. It takes notes as you talk.'}</div>
            {notes.trim() && <button type="button" className="forget" onClick={forget}>Forget all of this</button>}
          </details>
          <div style={{ display: 'flex', gap: 12 }}>
            {messages.length > 0 && <button type="button" onClick={clearConversation}>New conversation</button>}
            <button type="button" onClick={onSignOut} className="ui">Sign out</button>
          </div>
        </div>
      </div>
    </section>
  )
}
