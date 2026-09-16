'use client'

// The "create a new topic" form. Explains what the method needs (a settled
// rule plus an open question to argue), shows an example that can be
// dropped into the field, takes optional source material, then waits out
// the four-minute draft with a progress bar and hands back the reviewer
// notes and a way into a session on the new topic.

import { useEffect, useRef, useState } from 'react'

type Props = { allowed: boolean; keyParam: string }

const EXAMPLE_TOPIC =
  'The French Revolution: the Declaration of the Rights of Man and of the Citizen (1789) against the logic of the Terror (1793–94). The hypothetical should be a contested case of suspending rights to defend the revolution, arguing both sides of whether emergency measures are consistent with the Declaration.'
const EXAMPLE_COURSE = 'History · Revolutions'

/** The draft takes about four minutes; the bar eases toward, never past, 95%. */
const EXPECTED_SECONDS = 240

type Done = { module: { id: string; title: string; subtitle: string; course: string }; notes: string; latencyMs: number }

/** The notes come back as light Markdown (bold, italics, paragraphs); render just that. */
function Notes({ text }: { text: string }) {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <div className="soc-notes">
      {paras.map((p, i) => (
        <p key={i}>{inline(p)}</p>
      ))}
    </div>
  )
}

function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    out.push(m[1] !== undefined ? <b key={m.index}>{m[1]}</b> : <i key={m.index}>{m[2]}</i>)
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

export default function NewTopic({ allowed, keyParam }: Props) {
  const [topic, setTopic] = useState('')
  const [course, setCourse] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [state, setState] = useState<'idle' | 'drafting' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState<Done | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state !== 'drafting') return
    const t0 = Date.now()
    setElapsed(0)
    const t = setInterval(() => setElapsed((Date.now() - t0) / 1000), 1000)
    return () => clearInterval(t)
  }, [state])

  async function submit() {
    setError(null)
    setState('drafting')
    try {
      const fd = new FormData()
      fd.set('topic', topic.trim())
      fd.set('course', course.trim())
      fd.set('sourceText', sourceText.trim())
      if (keyParam) fd.set('key', keyParam)
      for (const f of files) fd.append('files', f)
      const res = await fetch('/api/socratic/modules', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `${res.status}`)
      setDone(j as Done)
      setState('done')
    } catch (e) {
      setError((e as Error).message)
      setState('idle')
    }
  }

  function reset() {
    setTopic('')
    setCourse('')
    setSourceText('')
    setFiles([])
    if (fileInput.current) fileInput.current.value = ''
    setDone(null)
    setState('idle')
  }

  const pct = Math.min(95, 100 * (1 - Math.exp(-elapsed / (EXPECTED_SECONDS / 2.2))))
  const mmss = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`

  if (!allowed) {
    return (
      <main className="soc-start">
        <div className="soc-kicker">Socratic · new topic</div>
        <h1>Create a new topic</h1>
        <section className="soc-card">
          <p>Creating topics needs the researcher key in the URL. Ask whoever runs the study for the link.</p>
        </section>
        <p className="soc-textlink-row">
          <a className="soc-textlink" href="/socratic">
            Back to the start page
          </a>
        </p>
      </main>
    )
  }

  if (state === 'done' && done) {
    return (
      <main className="soc-start">
        <div className="soc-kicker">Socratic · new topic</div>
        <h1>{done.module.title}</h1>
        <p className="soc-sub">{done.module.subtitle}</p>
        <p className="soc-source">{done.module.course}.</p>

        <section className="soc-card">
          <h2>Drafted, and ready to try</h2>
          <p>
            The tutor now has the doctrine, a hypothetical to argue, a session protocol, a question bank with model answers and four mastery criteria for this topic. It is in the topic picker on the start page.
          </p>
          <div className="soc-actions">
            <a className="soc-btn soc-btn--claret" href={`/socratic?module=${encodeURIComponent(done.module.id)}`}>
              Start a session
            </a>
            <button className="soc-btn soc-btn--ghost" onClick={reset}>
              Create another
            </button>
          </div>
        </section>

        <section className="soc-card">
          <h2>What to check before students see it</h2>
          <p>The draft&rsquo;s own notes on what it took from the sources, what it supplied from memory, and what a subject-matter reader should verify.</p>
          <Notes text={done.notes} />
        </section>
      </main>
    )
  }

  return (
    <main className="soc-start">
      <div className="soc-kicker">Socratic · new topic</div>
      <h1>Create a new topic</h1>
      <p className="soc-sub">Give the tutor a rule and an open question. It drafts the rest in the same format as the negligent entrustment session.</p>

      <section className="soc-card">
        <h2>What makes a good topic</h2>
        <p>
          The tutor teaches by argument, not explanation. It works when there is a <b>settled rule or account</b> and a <b>live question that rule doesn&rsquo;t settle</b>, so the student has to take a position and defend it.
        </p>
        <div className="soc-fit">
          <div className="soc-fit--good">
            <h3>Works well</h3>
            <ul>
              <li>A legal doctrine and a case that stretches it</li>
              <li>A contested historical judgment (was it a revolution? was the Terror consistent with the Declaration?)</li>
              <li>An ethics or policy question with real arguments on both sides</li>
            </ul>
          </div>
          <div className="soc-fit--weak">
            <h3>Poor fit</h3>
            <ul>
              <li>Mechanisms to understand (how transformers work, how the heart pumps)</li>
              <li>Facts to memorise (dates, vocabulary, formulas)</li>
              <li>Skills to practise (writing code, solving integrals)</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="soc-card">
        <div className="soc-field">
          <label htmlFor="soc-topic">Topic</label>
          <textarea
            id="soc-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={state === 'drafting'}
            placeholder="Name the rule or case the session teaches, then the open question it should argue."
          />
          <span className="soc-hint">Two or three sentences. The more specific the anchor (a case, a text, a date) and the question, the better the draft.</span>
          <div className="soc-example">
            <div className="soc-example-label">
              <span>Example</span>
              <button
                type="button"
                onClick={() => {
                  setTopic(EXAMPLE_TOPIC)
                  setCourse(EXAMPLE_COURSE)
                }}
                disabled={state === 'drafting'}
              >
                Use this example
              </button>
            </div>
            <q>{EXAMPLE_TOPIC}</q>
          </div>
        </div>

        <div className="soc-field">
          <label htmlFor="soc-course">Course · unit</label>
          <input id="soc-course" value={course} onChange={(e) => setCourse(e.target.value)} disabled={state === 'drafting'} placeholder="Torts · Duty" />
          <span className="soc-hint">Optional. Shown on the start page.</span>
        </div>

        <div className="soc-field">
          <label htmlFor="soc-source">Source material</label>
          <textarea
            id="soc-source"
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            disabled={state === 'drafting'}
            placeholder="Paste lecture notes, a case, a syllabus section, a chapter…"
            style={{ minHeight: 90 }}
          />
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            disabled={state === 'drafting'}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <span className="soc-hint">
            Optional, but it is what keeps the draft faithful. Paste text or add .txt, .md or .docx files. Without a source the tutor drafts from its own knowledge and lists what to check.
          </span>
        </div>

        {state === 'drafting' ? (
          <div className="soc-drafting">
            <span className="soc-thinking">
              <i />
              <i />
              <i />
            </span>
            <b>Drafting the topic</b>
            <span>Writing the doctrine, the hypothetical, the protocol and eleven questions. About four minutes — keep this page open.</span>
            <div className="soc-progress-bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <span className="soc-elapsed">{mmss}</span>
          </div>
        ) : (
          <button className="soc-btn soc-btn--claret" onClick={submit} disabled={topic.trim().length < 20} style={{ width: '100%' }}>
            Draft the topic
          </button>
        )}
        {error && <p className="soc-error">{error}</p>}
      </section>

      <p className="soc-textlink-row">
        <a className="soc-textlink" href="/socratic">
          Back to the start page
        </a>
      </p>
    </main>
  )
}
