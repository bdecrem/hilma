'use client'

// The session screen: header with the protocol's progress, the exchange,
// the composer. Opens the session on first load (the tutor speaks first),
// streams each reply, and resumes from the server on reload.

import Markdown from 'react-markdown'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Mastery, MasteryKey, Phase, Session as SessionT } from '@/lib/socratic/types'
import { MASTERY_KEYS, PHASES } from '@/lib/socratic/types'
import { endSession, loadSession, MASTERY_LABELS, PHASE_LABELS, streamTurn, type PublicTurn, type SessionView } from '../../api'
import { rememberSession } from '../../Start'

function Steps({ phase }: { phase: Phase }) {
  const shown = PHASES.filter((p) => p !== 'done')
  const at = phase === 'done' ? shown.length : PHASES.indexOf(phase)
  return (
    <div className="soc-steps" aria-label="Session progress">
      {shown.map((p, i) => (
        <span key={p} className={`soc-step ${i < at ? 'soc-step--done' : ''} ${i === at ? 'soc-step--now' : ''}`}>
          {PHASE_LABELS[p]}
        </span>
      ))}
    </div>
  )
}

function MasteryChips({ mastery, criteria }: { mastery: Mastery; criteria: Record<MasteryKey, string> }) {
  return (
    <div className="soc-mastery" aria-label="Mastery">
      {MASTERY_KEYS.map((k) => (
        <span key={k} className={`soc-chip ${mastery[k] ? 'soc-chip--on' : ''}`} title={criteria[k]}>
          {mastery[k] ? '✓ ' : ''}
          {MASTERY_LABELS[k]}
        </span>
      ))}
    </div>
  )
}

export default function Session({ id }: { id: string }) {
  const [view, setView] = useState<SessionView | null>(null)
  const [turns, setTurns] = useState<PublicTurn[]>([])
  const [live, setLive] = useState<string | null>(null) // the reply being streamed
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const busy = live !== null
  const feedRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollDown = useCallback(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const run = useCallback(
    async (message?: string) => {
      setError(null)
      setLive('')
      try {
        for await (const ev of streamTurn(id, message)) {
          if (ev.type === 'student') {
            setTurns((t) => (t.some((x) => x.id === ev.turn.id) ? t : [...t, ev.turn]))
          } else if (ev.type === 'delta') {
            setLive((s) => (s ?? '') + ev.text)
          } else if (ev.type === 'done') {
            setTurns((t) => [...t, ev.turn])
            setView((v) => (v ? { ...v, session: ev.session } : v))
            setLive(null)
          } else if (ev.type === 'error') {
            setError(ev.message)
            setLive(null)
          }
        }
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLive((s) => (s === '' ? null : s))
      }
    },
    [id],
  )

  // Load, then open the session if it has not been opened yet.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const v = await loadSession(id)
        if (cancelled) return
        setView(v)
        setTurns(v.turns)
        rememberSession({ id: v.session.id, arm: v.session.arm, at: v.session.created_at })
        if (v.turns.length === 0 && !v.session.ended_at && !startedRef.current) {
          startedRef.current = true
          run()
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, run])

  useEffect(() => {
    scrollDown()
  }, [turns, live, scrollDown])

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await run(text)
  }

  async function finish() {
    try {
      await endSession(id)
      setView((v) => (v ? { ...v, session: { ...v.session, ended_at: new Date().toISOString() } } : v))
    } catch (e) {
      setError((e as Error).message)
    }
    setConfirmEnd(false)
  }

  if (loadError) {
    return (
      <main className="soc-start">
        <div className="soc-kicker">Socratic</div>
        <h1>Session not found</h1>
        <p className="soc-sub">{loadError}</p>
        <a href="/socratic">Start a new session</a>
      </main>
    )
  }
  if (!view) {
    return (
      <main className="soc-session">
        <div className="soc-feed">
          <div className="soc-feed-inner">
            <div className="soc-thinking" aria-label="Loading">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
      </main>
    )
  }

  const { session, module: m, arm } = view
  const ended = !!session.ended_at
  const visible = turns.filter((t) => !t.hidden)
  const last = turns[turns.length - 1]
  const tutorMissing = !busy && !!last && last.role === 'student'

  return (
    <main className="soc-session">
      <header className="soc-bar">
        <div className="soc-bar-row">
          <div className="soc-bar-title">
            <b>{m.title}</b>
            <span>
              {m.course} · condition {session.arm}
            </span>
          </div>
          {!ended &&
            (confirmEnd ? (
              <span className="soc-confirm">
                End this session?
                <button className="soc-btn soc-btn--sm soc-btn--claret" onClick={finish}>
                  End
                </button>
                <button className="soc-btn soc-btn--sm soc-btn--ghost" onClick={() => setConfirmEnd(false)}>
                  Keep going
                </button>
              </span>
            ) : (
              <button className="soc-btn soc-btn--sm soc-btn--ghost" onClick={() => setConfirmEnd(true)}>
                End session
              </button>
            ))}
        </div>
        {arm.socratic && (
          <div className="soc-progress">
            <Steps phase={session.phase} />
            <MasteryChips mastery={session.mastery} criteria={m.masteryCriteria} />
          </div>
        )}
      </header>

      <div className="soc-feed" ref={feedRef}>
        <div className="soc-feed-inner">
          {visible.map((t) =>
            t.role === 'tutor' ? (
              <div key={t.id} className="soc-tutor">
                <Markdown>{t.content}</Markdown>
              </div>
            ) : (
              <div key={t.id} className="soc-student">
                {t.content}
              </div>
            ),
          )}
          {live !== null &&
            (live === '' ? (
              <div className="soc-thinking" aria-label="The tutor is thinking">
                <i />
                <i />
                <i />
              </div>
            ) : (
              <div className="soc-tutor soc-tutor--live">
                <Markdown>{live}</Markdown>
              </div>
            ))}
          {error && (
            <div className="soc-note soc-note--error">
              {error}
              {!ended && (
                <button className="soc-btn soc-btn--sm soc-btn--ghost" onClick={() => run()}>
                  Try again
                </button>
              )}
            </div>
          )}
          {!error && tutorMissing && !ended && (
            <div className="soc-note soc-note--error">
              The tutor didn&rsquo;t answer.
              <button className="soc-btn soc-btn--sm soc-btn--ghost" onClick={() => run()}>
                Try again
              </button>
            </div>
          )}
          {ended && <div className="soc-note">Session ended.</div>}
        </div>
      </div>

      {ended ? (
        <div className="soc-ended">
          Thanks — this session is closed.<a href="/socratic">Start another</a>
        </div>
      ) : (
        <div className="soc-composer">
          <div className="soc-composer-inner">
            <textarea
              ref={textareaRef}
              value={draft}
              placeholder={busy ? 'The tutor is speaking…' : 'Your answer'}
              disabled={busy || tutorMissing}
              rows={1}
              onChange={(e) => {
                setDraft(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
            />
            <button className="soc-btn" onClick={send} disabled={busy || !draft.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
