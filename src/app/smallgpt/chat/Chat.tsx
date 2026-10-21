'use client'

import { useEffect, useRef, useState } from 'react'

// Talk to the step 9, 10, 11 and 13 models. They run in this browser, in a worker
// (public/smallgpt/chat/worker.mjs): no server. The 92M models are 92 MB of
// weights each, the 10M ones 10 MB.

type Model = 'cranky' | 'rlhf' | 'rlvr' | 'cranky-10m' | 'helpful'
type Reply = { text: string; done: boolean; error?: string; ms?: number; tokens?: number }
type Turn = { id: number; q: string; model: Model; main: Reply; base?: Reply }

const MODELS: { id: Model; label: string; base: string; note: string }[] = [
  { id: 'cranky', label: 'cranky 92M', base: 'base', note: 'Step 10: 92M parameters, SFT on 3,206 real Usenet questions and replies, made crankier' },
  { id: 'rlhf', label: 'RLHF 92M', base: 'base', note: 'Step 11: the cranky 92M model after PPO against a reward model trained on Claude\'s judgments' },
  { id: 'rlvr', label: 'RLVR 92M', base: 'base', note: 'Step 13: the RLHF model after GRPO against an arithmetic checker. Ask it what 47 + 38 is' },
  { id: 'cranky-10m', label: 'cranky 10M', base: 'base-10m', note: 'Step 9b: the same SFT on the 10M model' },
  { id: 'helpful', label: 'helpful 10M', base: 'base-10m', note: 'Step 9: SFT on 2,945 Q&A pairs Claude wrote' },
]
const SIZE: Record<string, string> = { cranky: '92', rlhf: '92', rlvr: '92', base: '92', 'cranky-10m': '10', helpful: '10', 'base-10m': '10' }
const TAG: Record<string, string> = { cranky: 'cranky 92M', rlhf: 'RLHF 92M', rlvr: 'RLVR 92M', 'cranky-10m': 'cranky 10M', helpful: 'helpful 10M' }

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
  const [loading, setLoading] = useState<{ name: string; got?: number; total?: number } | null>(null)
  const preloaded = useRef(false)
  const busy = turns.some((t) => !t.main.done || (t.base && !t.base.done))
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const w = new Worker('/smallgpt/chat/worker.mjs', { type: 'module' })
    // Each request id is a turn id (main answer) or minus it (the base model's).
    w.onmessage = ({ data: m }) => {
      if (m.loading) return setLoading({ name: m.loading, got: m.got, total: m.total })
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
    return () => w.terminate()
  }, [])

  // Start downloading the default model (92 MB) once the visitor shows interest, not on every page view.
  function preload() {
    if (preloaded.current || !worker.current) return
    preloaded.current = true
    worker.current.postMessage({ preload: 'cranky' })
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  function ask(text: string) {
    const question = text.trim()
    if (!question || busy || !worker.current) return
    const id = nextId.current++
    setTurns((ts) => [...ts, { id, q: question, model, main: empty(), base: withBase ? empty() : undefined }])
    worker.current.postMessage({ id, model, text: question, temperature, topK })
    const base = MODELS.find((m) => m.id === model)!.base
    if (withBase) worker.current.postMessage({ id: -id, model: base, text: question, temperature, topK })
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
          A 92M-parameter GPT pretrained on Usenet 1981–1991 (step 10), then taught to answer like the net&rsquo;s
          crankiest regulars (step 9). RLHF 92M is the same model after reinforcement learning against a judge (step
          11). It runs right here in your browser; the first question downloads 92 MB. Each question is a new
          conversation.
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
            <Answer tag={TAG[t.model]} cls={t.model === 'helpful' ? 'helpful' : 'cranky'} reply={t.main} />
            {t.base && <Answer tag={SIZE[t.model] === '92' ? 'base 92M' : 'base 10M'} cls="base" reply={t.base} />}
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
            onFocus={preload}
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
        {loading && (
          <p className="sgc-loading">
            downloading the {(TAG[loading.name] || loading.name).replace(/ \d+M$/, '')} model
            {loading.total ? `: ${Math.round((loading.got || 0) / 1e6)} of ${Math.round(loading.total / 1e6)} MB` : ` (${SIZE[loading.name]} MB)`}…
          </p>
        )}
      </form>
    </div>
  )
}

function Answer({ tag, cls, reply }: { tag: string; cls: string; reply: Reply }) {
  return (
    <div className={`sgc-a ${cls}`}>
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
