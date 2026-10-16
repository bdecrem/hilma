'use client'

import { useEffect, useRef, useState } from 'react'

// Talk to the step 9 models. They run in this browser, in a worker
// (public/smallgpt/chat/worker.mjs): no server, ~10 MB of weights per model.

type Model = 'cranky' | 'helpful'
type Reply = { text: string; done: boolean; error?: string; ms?: number; tokens?: number }
type Turn = { id: number; q: string; model: Model; main: Reply; base?: Reply }

const MODELS: { id: Model; label: string; note: string }[] = [
  { id: 'cranky', label: 'cranky hacker', note: 'SFT on 3,206 real Usenet questions and replies, made crankier' },
  { id: 'helpful', label: 'helpful regular', note: 'SFT on 2,945 Q&A pairs Claude wrote' },
]

const TRY = ['How do I quit vi?', 'Is a 2400 baud modem worth it?', 'Should I buy an Amiga or an Atari ST?', 'Why is my Mac Plus so slow?']

const empty = (): Reply => ({ text: '', done: false })

export default function Chat() {
  const worker = useRef<Worker | null>(null)
  const nextId = useRef(1)
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const [model, setModel] = useState<Model>('cranky')
  const [withBase, setWithBase] = useState(false)
  const [temperature, setTemperature] = useState(0.7)
  const [topK, setTopK] = useState(40)
  const [loading, setLoading] = useState<string | null>(null)
  const busy = turns.some((t) => !t.main.done || (t.base && !t.base.done))
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const w = new Worker('/smallgpt/chat/worker.mjs', { type: 'module' })
    // Each request id is a turn id (main answer) or minus it (the base model's).
    w.onmessage = ({ data: m }) => {
      if (m.loading) return setLoading(m.loading)
      if (m.loaded) return setLoading(null)
      const patch: Partial<Reply> = m.error ? { error: m.error, done: true } : { text: m.text, done: !!m.done, ms: m.ms, tokens: m.tokens }
      setTurns((ts) =>
        ts.map((t) => {
          if (t.id === m.id) return { ...t, main: { ...t.main, ...patch } }
          if (t.id === -m.id && t.base) return { ...t, base: { ...t.base, ...patch } }
          return t
        }),
      )
    }
    worker.current = w
    // Start downloading the default model while the visitor reads.
    w.postMessage({ preload: 'cranky' })
    return () => w.terminate()
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  function ask(text: string) {
    const question = text.trim()
    if (!question || busy || !worker.current) return
    const id = nextId.current++
    setTurns((ts) => [...ts, { id, q: question, model, main: empty(), base: withBase ? empty() : undefined }])
    worker.current.postMessage({ id, model, text: question, temperature, topK })
    if (withBase) worker.current.postMessage({ id: -id, model: 'base', text: question, temperature, topK })
    setQ('')
    inputRef.current?.focus()
  }

  return (
    <div className="sgc">
      <header className="sgc-head">
        <a className="sgx-back" href="/smallgpt">
          ← smallgpt
        </a>
        <h1>Ask the 1985 hacker</h1>
        <p>
          A 10M-parameter GPT pretrained on Usenet 1981–1991, then taught to answer (step 9). It runs right here in your
          browser. Each question is a new conversation.
        </p>
      </header>

      <main className="sgc-log">
        {turns.length === 0 && (
          <div className="sgc-try">
            {TRY.map((t) => (
              <button key={t} onClick={() => ask(t)} disabled={busy}>
                {t}
              </button>
            ))}
          </div>
        )}
        {turns.map((t) => (
          <section key={t.id} className="sgc-turn">
            <p className="sgc-q">{t.q}</p>
            <Answer tag={t.model === 'cranky' ? 'cranky' : 'helpful'} reply={t.main} />
            {t.base && <Answer tag="base" reply={t.base} />}
          </section>
        ))}
        <div ref={endRef} />
      </main>

      <form
        className="sgc-bar"
        onSubmit={(e) => {
          e.preventDefault()
          ask(q)
        }}
      >
        <div className="sgc-row">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask something from 1985–1991…"
            autoComplete="off"
            enterKeyHint="send"
          />
          <button type="submit" disabled={busy || !q.trim()}>
            Ask
          </button>
        </div>
        <div className="sgc-opts">
          <div className="sgc-models" role="radiogroup" aria-label="Model">
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={model === m.id}
                title={m.note}
                className={model === m.id ? 'on' : ''}
                onClick={() => setModel(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <label>
            <input type="checkbox" checked={withBase} onChange={(e) => setWithBase(e.target.checked)} /> also ask the base
            model
          </label>
          <label>
            temperature
            <input type="range" min={0.1} max={1.5} step={0.1} value={temperature} onChange={(e) => setTemperature(+e.target.value)} />
            <span>{temperature.toFixed(1)}</span>
          </label>
          <label>
            top-k
            <input type="range" min={1} max={200} step={1} value={topK} onChange={(e) => setTopK(+e.target.value)} />
            <span>{topK}</span>
          </label>
        </div>
        {loading && <p className="sgc-loading">downloading the {loading} model (10 MB)…</p>}
      </form>
    </div>
  )
}

function Answer({ tag, reply }: { tag: string; reply: Reply }) {
  return (
    <div className={`sgc-a ${tag}`}>
      <span className="sgc-tag">{tag}</span>
      {reply.error ? (
        <span className="sgc-err">{reply.error}</span>
      ) : reply.text ? (
        reply.text
      ) : (
        <span className="sgc-wait">thinking…</span>
      )}
      {reply.done && reply.tokens ? (
        <span className="sgc-stat">
          {' '}
          {reply.tokens} tokens · {Math.round(reply.ms! / reply.tokens)} ms each
        </span>
      ) : null}
    </div>
  )
}
