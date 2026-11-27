'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AREAS, type Activity, type Area, type Issue, type TrackerItem } from '@/lib/venture/board'
import { ago, at } from '../time'
import { Linked, person, REPO, Status, STATUS, STATUS_ORDER } from './common'

// One issue (app.kochitolabs.com/issues/OLA-150, OLA-163). Left: the title and the description,
// each edited by clicking it, then Activity, one thread oldest first: opened, status changes,
// edits, Kit's proof, the commits that name it, comments; a box to comment (Cmd-Return sends).
// Right: the fields; a change saves at once and adds a line to Activity. Done asks for one line of
// proof. Writes go to /api/kochito/app/issues/... as the signed-in account (the route checks the
// session). `mock` (the made-up preview) changes only this page's copy and saves nothing.

type Line = { at: string; ic: string; node: React.ReactNode; cls?: string; key: string }
const FIELD: Record<string, string> = { title: 'the title', what: 'the description', priority: 'the priority', area: 'the area', who: 'who', week: 'the plan week', proof: 'the proof' }
const val = (field: string | null, v: string | null) => (v === null || v === '' ? 'none' : field === 'status' ? STATUS[v as Issue['status']] ?? v : field === 'area' ? AREAS[v as Area] ?? v : field === 'week' ? `week ${v}` : v)

export function thread(i: Issue, act: Activity[], now: string): Line[] {
  const out: Line[] = []
  const opened = act.find((a) => a.kind === 'opened')
  out.push({ key: 'opened', at: i.opened_at, ic: '+', node: <>{opened ? <b>{person(opened.who)}</b> : 'Kit'} opened this</> })
  const statusTo = (s: string) => act.some((a) => a.kind === 'status' && a.new_value === s)
  if (i.started_at && !statusTo('in_progress')) out.push({ key: 'started', at: i.started_at, ic: '›', node: <><b>{person(i.who)}</b> started work</> })
  for (const a of act) {
    if (a.kind === 'opened') continue
    const t = at(a.at, now)
    if (a.kind === 'comment') {
      out.push({
        key: `a${a.id}`,
        at: a.at,
        ic: '“',
        cls: 'comment',
        node: (
          <>
            <b>{person(a.who)}</b>
            <div className="body">
              <Linked text={a.body} />
            </div>
            {a.via === 'board' && <div className={`seen${a.seen_by_kit_at ? '' : ' new'}`}>{a.seen_by_kit_at ? `seen by Kit ${at(a.seen_by_kit_at, now)}` : 'not seen by Kit yet'}</div>}
          </>
        ),
      })
    } else if (a.kind === 'status') {
      out.push({
        key: `a${a.id}`,
        at: a.at,
        ic: '•',
        node: (
          <>
            <b>{person(a.who)}</b> moved this to <b>{val('status', a.new_value)}</b>, {t}
            {a.body ? `. Proof: ${a.body}` : ''}
          </>
        ),
      })
    } else {
      out.push({
        key: `a${a.id}`,
        at: a.at,
        ic: '✎',
        node:
          a.field === 'what' ? (
            <>
              <b>{person(a.who)}</b> edited the description
            </>
          ) : (
            <>
              <b>{person(a.who)}</b> changed {FIELD[a.field ?? ''] ?? a.field} from “{val(a.field, a.old_value)}” to “{val(a.field, a.new_value)}”
            </>
          ),
      })
    }
  }
  for (const c of i.commits)
    out.push({
      key: c.sha,
      at: c.at,
      ic: '◦',
      node: (
        <>
          Commit{' '}
          <a className="sha" href={REPO + c.sha}>
            {c.sha.slice(0, 7)}
          </a>{' '}
          {c.subject}
        </>
      ),
    })
  if (i.finished_at && (i.status === 'done' || i.status === 'dropped') && !statusTo(i.status))
    out.push({ key: 'closed', at: i.finished_at, ic: '•', node: <>{i.status === 'done' ? <><b>{person(i.who)}</b> closed this as done{i.proof ? `. Proof: ${i.proof}` : ''}</> : <>Dropped{i.proof ? `: ${i.proof.replace(/^dropped:\s*/, '')}` : ''}</>}</> })
  return out.sort((a, b) => a.at.localeCompare(b.at))
}

export default function IssueView({ issue, activity, base, now, user, mock = false, list = null, partOf = [] }: { issue: Issue; activity: Activity[] | null; base: string; now: string; user: string; mock?: boolean; list?: TrackerItem[] | null; partOf?: { id: string; title: string }[] }) {
  const router = useRouter()
  const [i, setI] = useState(issue)
  const [act, setAct] = useState(activity)
  useEffect(() => setI(issue), [issue])
  useEffect(() => setAct(activity), [activity])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [editTitle, setEditTitle] = useState(false)
  const [editWhat, setEditWhat] = useState(false)
  const [whatDraft, setWhatDraft] = useState(i.what)
  const [comment, setComment] = useState('')
  const [askProof, setAskProof] = useState(false)
  const [proof, setProof] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editTitle) titleRef.current?.select()
  }, [editTitle])

  const api = `/api/kochito/app/issues/${i.id}`
  const localLine = (kind: Activity['kind'], f: Partial<Activity>) => setAct((a) => [...(a ?? []), { id: Date.now(), issue_id: i.id, at: new Date().toISOString(), who: user, via: 'board', kind, field: null, old_value: null, new_value: null, body: '', seen_by_kit_at: null, ...f }])

  async function save(fields: Record<string, unknown>) {
    setErr('')
    if (mock) {
      for (const [k, v] of Object.entries(fields)) if (k !== 'proof') localLine(k === 'status' ? 'status' : 'edit', { field: k, old_value: String((i as Record<string, unknown>)[k] ?? ''), new_value: String(v ?? ''), body: k === 'status' ? String(fields.proof ?? '') : '' })
      setI((x) => ({ ...x, ...fields, updated_at: new Date().toISOString() }) as Issue)
      return true
    }
    setBusy(true)
    try {
      const res = await fetch(api, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `not saved (${res.status})`)
      setI((x) => ({ ...x, ...j.issue }))
      router.refresh()
      return true
    } catch (e) {
      setErr((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    const body = comment.trim()
    if (!body || busy) return
    setErr('')
    if (mock) {
      localLine('comment', { body })
      setComment('')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`${api}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || `not sent (${res.status})`)
      setComment('')
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const lines = thread(i, act ?? [], now)
  return (
    <>
      <p className="bd-crumb">
        <a href={`${base}/issues`}>Issue Tracker</a> / <span className="m">{i.id}</span>
        {mock && <span className="bd-amber"> · made-up preview: nothing is saved</span>}
      </p>
      <div className="bd-issue">
        <div>
          {editTitle ? (
            <input
              ref={titleRef}
              className="bd-title-edit"
              defaultValue={i.title}
              aria-label="Title"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditTitle(false)
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              onBlur={async (e) => {
                const v = e.currentTarget.value.trim()
                if (v && v !== i.title) await save({ title: v })
                setEditTitle(false)
              }}
            />
          ) : (
            <h1>
              <button type="button" className="bd-title-edit" onClick={() => setEditTitle(true)} title="Click to edit">
                {i.title}
              </button>
            </h1>
          )}
          <div className="bd-desc">
            {editWhat ? (
              <>
                <textarea
                  autoFocus
                  value={whatDraft}
                  onChange={(e) => setWhatDraft(e.target.value)}
                  aria-label="Description"
                  onKeyDown={async (e) => {
                    if (e.key === 'Escape') setEditWhat(false)
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && (await save({ what: whatDraft }))) setEditWhat(false)
                  }}
                />
                <div className="bd-actions">
                  <button type="button" className="bd-btn primary" disabled={busy} onClick={async () => (await save({ what: whatDraft })) && setEditWhat(false)}>
                    Save
                  </button>
                  <button type="button" className="bd-btn" onClick={() => setEditWhat(false)}>
                    Cancel
                  </button>
                  <span className="sub">What and why. Plain text; links work.</span>
                </div>
              </>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className={`bd-desc-view${i.what ? '' : ' empty'}`}
                title="Click to edit"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a')) return
                  setWhatDraft(i.what)
                  setEditWhat(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (setWhatDraft(i.what), setEditWhat(true))
                }}
              >
                {i.what ? <Linked text={i.what} /> : 'Add a description: what and why.'}
              </div>
            )}
          </div>
          {list && (
            <section className="bd-sec">
              {/* a tracker issue (OLA-505): not work itself, the issues it lists, each with what came of it */}
              <h2 className="bd-h2">
                On this list <span className="m">{list.length}</span>
              </h2>
              {list.length === 0 ? (
                <p className="bd-empty">No issues on this list yet.</p>
              ) : (
                <ol className="bd-rows bd-tlist">
                  {list.map((x) => (
                    <li key={x.id}>
                      <a href={`${base}/issues/${x.id}`}>
                        <span className="id">{x.id}</span>
                        {x.status ? <Status s={x.status} /> : <span className="bd-st">not found</span>}
                        <span className="t">
                          {x.title ?? x.id}
                          {x.note && <span className="note">{x.note}</span>}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
          <section className="bd-sec">
            <h2 className="bd-h2">Activity</h2>
            <ol className="bd-thread">
              {lines.map((l) => (
                <li key={l.key} className={l.cls}>
                  <span className="ic">{l.ic}</span>
                  <div className="what">{l.node}</div>
                  <span className="t" title={l.at}>
                    {ago(l.at, now)}
                  </span>
                </li>
              ))}
            </ol>
            {act === null ? (
              <p className="bd-empty" style={{ marginTop: 12 }}>
                Comments are not set up yet.
              </p>
            ) : (
              <div className="bd-comment">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write a comment for Kit"
                  aria-label="Comment"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.preventDefault(), send())
                  }}
                />
                <div className="bd-actions">
                  <button type="button" className="bd-btn primary" disabled={busy || !comment.trim()} onClick={send}>
                    Comment
                  </button>
                  <span className="sub">
                    <kbd>⌘</kbd> <kbd>Return</kbd> sends. Kit sees it in its inbox.
                  </span>
                </div>
              </div>
            )}
            {err && <p className="bd-err">{err}</p>}
          </section>
        </div>
        <aside>
          <dl className="bd-fields">
            <div>
              <dt>Status</dt>
              <dd>
                {list ? (
                  <span className="bd-st">Tracker, not work itself</span>
                ) : (
                <select
                  value={askProof ? 'done' : i.status}
                  disabled={busy}
                  aria-label="Status"
                  onChange={(e) => {
                    const s = e.target.value as Issue['status']
                    if (s === 'done') (setProof(''), setAskProof(true))
                    else (setAskProof(false), save({ status: s }))
                  }}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS[s]}
                    </option>
                  ))}
                </select>
                )}
                {askProof && (
                  <form
                    className="bd-proof"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (await save({ status: 'done', proof })) setAskProof(false)
                    }}
                  >
                    <label htmlFor="bd-proof">What proved it? One line, may be empty.</label>
                    <input id="bd-proof" autoFocus value={proof} onChange={(e) => setProof(e.target.value)} placeholder="e.g. on my phone, by hand" />
                    <div className="bd-actions">
                      <button className="bd-btn primary" disabled={busy}>
                        Mark done
                      </button>
                      <button type="button" className="bd-btn" onClick={() => setAskProof(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>
                <select value={i.priority} disabled={busy} aria-label="Priority" onChange={(e) => save({ priority: e.target.value })}>
                  {['P0', 'P1', 'P2'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </dd>
            </div>
            <div>
              <dt>Area</dt>
              <dd>
                <select value={i.area} disabled={busy} aria-label="Area" onChange={(e) => save({ area: e.target.value })}>
                  {Object.entries(AREAS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            {partOf.length > 0 && (
              <div>
                <dt>Part of</dt>
                <dd>
                  {partOf.map((t) => (
                    <a key={t.id} href={`${base}/issues/${t.id}`}>
                      {t.title}
                    </a>
                  ))}
                </dd>
              </div>
            )}
            {i.builtBy && (
              <div>
                <dt>Built by</dt>
                <dd>Ola, on {i.builtBy.model}</dd>
              </div>
            )}
            <div>
              <dt>Who</dt>
              <dd>
                <input
                  key={i.who}
                  defaultValue={i.who}
                  aria-label="Who"
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim()
                    if (v && v !== i.who) save({ who: v })
                  }}
                />
              </dd>
            </div>
            <div>
              <dt>Plan week</dt>
              <dd>
                <select value={i.week ?? ''} disabled={busy} aria-label="Plan week" onChange={(e) => save({ week: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">None</option>
                  {[1, 2, 3, 4].map((w) => (
                    <option key={w} value={w}>
                      Week {w}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            <div>
              <dt>Opened</dt>
              <dd className="m">{at(i.opened_at, now)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd className="m">{ago(i.updated_at, now)}</dd>
            </div>
            {i.finished_at && (
              <div>
                <dt>{i.status === 'dropped' ? 'Dropped' : 'Closed'}</dt>
                <dd className="m">{at(i.finished_at, now)}</dd>
              </div>
            )}
            {i.links.length > 0 && (
              <div>
                <dt>Links</dt>
                <dd>
                  {i.links.map((l, n) => (
                    <a key={n} href={l.url ?? `${base}/notes/${l.doc}`}>
                      {l.label}
                    </a>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </aside>
      </div>
    </>
  )
}
