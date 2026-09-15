'use client'

// Start screen: pick up the participant code and study arm (from the URL
// when a study platform sends the student here, otherwise remembered per
// browser), then open a session.

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { isArm } from '@/lib/socratic/arms'
import type { Arm } from '@/lib/socratic/types'
import { createSession } from './api'

type ModuleInfo = { id: string; title: string; subtitle: string; course: string; source: string }

type Props = {
  modules: ModuleInfo[]
  defaultModule: string
  arms: Record<Arm, { name: string; blurb: string }>
}

type Recent = { id: string; arm: Arm; at: string }

const PID_KEY = 'soc:pid'
const RECENT_KEY = 'soc:recent'

function randomPid() {
  const s = Math.random().toString(36).slice(2, 8)
  return `p-${s}`
}

export function readRecent(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as Recent[]) : []
  } catch {
    return []
  }
}

export function rememberSession(r: Recent) {
  try {
    const list = [r, ...readRecent().filter((x) => x.id !== r.id)].slice(0, 8)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {}
}

export default function Start({ modules, defaultModule, arms }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [pid, setPid] = useState('')
  const [arm, setArm] = useState<Arm>('B')
  const [moduleId, setModuleId] = useState(defaultModule)
  const m = modules.find((x) => x.id === moduleId) ?? modules[0]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<Recent[]>([])

  useEffect(() => {
    const qPid = params.get('pid')
    const qArm = params.get('arm')
    let p = qPid && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(qPid) ? qPid : ''
    if (!p) {
      try {
        p = localStorage.getItem(PID_KEY) || ''
      } catch {}
    }
    if (!p) p = randomPid()
    setPid(p)
    if (isArm(qArm)) setArm(qArm)
    const qModule = params.get('module')
    if (qModule && modules.some((x) => x.id === qModule)) setModuleId(qModule)
    setRecent(readRecent())
  }, [params, modules])

  async function begin() {
    setBusy(true)
    setError(null)
    try {
      try {
        localStorage.setItem(PID_KEY, pid)
      } catch {}
      const s = await createSession(pid.trim(), arm, m.id)
      rememberSession({ id: s.id, arm, at: s.created_at })
      router.push(`/socratic/s/${s.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="soc-start">
      <div className="soc-kicker">Socratic · {m.course}</div>
      <h1>{m.title}</h1>
      <p className="soc-sub">{m.subtitle}</p>
      <p className="soc-source">{m.source}.</p>

      <section className="soc-card">
        <h2>How this works</h2>
        <p>
          You&rsquo;ll get the doctrine first, the way it&rsquo;s set up in class. Then the tutor puts a hard extension of the rule in front of you and you argue your way through it, one reply at a time. Plan on twenty to thirty minutes.
        </p>
        <p className="soc-quote">&ldquo;A list of facts is never an argument.&rdquo;</p>
      </section>

      <section className="soc-card">
        {modules.length > 1 && (
          <div className="soc-field">
            <label htmlFor="soc-module">Topic</label>
            <select id="soc-module" value={m.id} onChange={(e) => setModuleId(e.target.value)}>
              {modules.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="soc-field">
          <label htmlFor="soc-pid">Participant code</label>
          <input
            id="soc-pid"
            value={pid}
            onChange={(e) => setPid(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="p-abc123"
          />
          <span className="soc-hint">Whatever the study gave you. If you weren&rsquo;t given one, keep the one here.</span>
        </div>
        <div className="soc-field">
          <label>Study condition</label>
          <div className="soc-seg" role="group" aria-label="Study condition">
            {(Object.keys(arms) as Arm[]).map((k) => (
              <button key={k} type="button" aria-pressed={arm === k} onClick={() => setArm(k)}>
                <b>
                  {k} · {arms[k].name}
                </b>
                <span>{arms[k].blurb}</span>
              </button>
            ))}
          </div>
        </div>
        <button className="soc-btn soc-btn--claret" onClick={begin} disabled={busy || !pid.trim()} style={{ width: '100%' }}>
          {busy ? 'Opening…' : 'Begin session'}
        </button>
        {error && <p className="soc-error">{error}</p>}
        <p className="soc-textlink-row">
          Teaching something else?{' '}
          <a className="soc-textlink" href="/socratic/new">
            Create a new topic
          </a>
        </p>
      </section>

      {recent.length > 0 && (
        <section className="soc-resume">
          <h3>Resume a session</h3>
          {recent.map((r) => (
            <a key={r.id} href={`/socratic/s/${r.id}`}>
              <span style={{ color: 'inherit', fontSize: 14 }}>
                Condition {r.arm} · {arms[r.arm]?.name}
              </span>
              <span>{new Date(r.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </a>
          ))}
        </section>
      )}
    </main>
  )
}
