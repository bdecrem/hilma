// Researcher view of one session: metrics, then the transcript with the
// observer's verdict under each student message and the tutor's
// self-reported move under each reply.

import Markdown from 'react-markdown'
import { ARM_INFO } from '@/lib/socratic/arms'
import { getModule } from '@/lib/socratic/modules'
import { getSession, listTurns, masteryCount, UUID_RE } from '@/lib/socratic/store'
import type { AnswerType, Turn, TutorMeta, Verdict } from '@/lib/socratic/types'
import { MASTERY_KEYS } from '@/lib/socratic/types'
import { authorized, Denied } from '../auth'

export const dynamic = 'force-dynamic'

function isVerdict(m: Turn['meta']): m is Verdict {
  return !!m && typeof (m as Verdict).answer_type === 'string'
}
function isTutorMeta(m: Turn['meta']): m is TutorMeta {
  return !!m && typeof (m as TutorMeta).move === 'string'
}

export default async function SessionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string }> }) {
  const { id } = await params
  const { key } = await searchParams
  if (!authorized(key)) return <Denied />
  if (!UUID_RE.test(id)) return <Denied />
  const session = await getSession(id)
  if (!session) return <Denied />
  const turns = await listTurns(id)
  const mod = getModule(session.module)

  const students = turns.filter((t) => t.role === 'student' && !t.hidden)
  const verdicts = students.map((t) => t.meta).filter(isVerdict)
  const tutors = turns.filter((t) => t.role === 'tutor')
  const moves = tutors.map((t) => t.meta).filter(isTutorMeta)
  const counts: Partial<Record<AnswerType, number>> = {}
  for (const v of verdicts) counts[v.answer_type] = (counts[v.answer_type] ?? 0) + 1
  const avgQ = verdicts.length ? verdicts.reduce((a, v) => a + v.quality, 0) / verdicts.length : null
  const firstArgument = students.findIndex((t) => isVerdict(t.meta) && t.meta.quality >= 2 && (t.meta.answer_type === 'argument' || t.meta.answer_type === 'counter_argument'))
  const corrections = moves.filter((m) => m.move === 'facts_not_argument').length
  const latency = tutors.filter((t) => t.latency_ms).map((t) => t.latency_ms!)
  const avgLatency = latency.length ? latency.reduce((a, b) => a + b, 0) / latency.length : null
  const tokens = tutors.reduce((a, t) => a + Number((t.usage as { output_tokens?: number } | null)?.output_tokens ?? 0), 0)

  return (
    <main className="soc-admin">
      <div className="soc-kicker">
        <a href={`/socratic/sessions?key=${encodeURIComponent(key!)}`} style={{ textDecoration: 'none' }}>
          ← Sessions
        </a>
      </div>
      <h1>
        {session.participant} · arm {session.arm} · {ARM_INFO[session.arm].name}
      </h1>
      <div className="soc-muted">
        {mod?.title} · started {new Date(session.created_at).toLocaleString()} · phase {session.phase} · tutor {session.tutor_model ?? '—'}
        {session.ended_at ? ' · ended' : ''}
      </div>

      <div className="soc-metrics">
        <div className="soc-metric">
          <b>{students.length}</b>
          <span>student messages</span>
        </div>
        <div className="soc-metric">
          <b>{masteryCount(session.mastery)}/4</b>
          <span>mastery · {MASTERY_KEYS.filter((k) => session.mastery[k]).join(', ') || 'none yet'}</span>
        </div>
        <div className="soc-metric">
          <b>{avgQ === null ? '—' : avgQ.toFixed(2)}</b>
          <span>mean reasoning quality (0–3)</span>
        </div>
        <div className="soc-metric">
          <b>{firstArgument < 0 ? '—' : `#${firstArgument + 1}`}</b>
          <span>first real argument (student message)</span>
        </div>
        <div className="soc-metric">
          <b>{counts.list_of_facts ?? 0}</b>
          <span>lists of facts · {corrections} corrected by the tutor</span>
        </div>
        <div className="soc-metric">
          <b>{avgLatency === null ? '—' : `${(avgLatency / 1000).toFixed(1)}s`}</b>
          <span>mean tutor latency · {tokens} output tokens</span>
        </div>
      </div>

      <div className="soc-t-tags">
        {(Object.keys(counts) as AnswerType[]).map((k) => (
          <span key={k} className="soc-chip">
            {k} × {counts[k]}
          </span>
        ))}
      </div>

      <div className="soc-transcript">
        {turns.map((t) => (
          <div key={t.id} className="soc-t-turn">
            <div className={`soc-t-role ${t.role === 'student' ? 'soc-t-role--student' : ''}`}>
              {t.hidden ? 'opening' : t.role} · {t.idx}
            </div>
            <div className="soc-t-body">
              {t.role === 'tutor' ? (
                <div className="soc-tutor">
                  <Markdown>{t.content}</Markdown>
                </div>
              ) : (
                <div className="soc-t-student" style={t.hidden ? { color: 'var(--ink-3)', fontStyle: 'italic' } : undefined}>
                  {t.content}
                </div>
              )}
              {isVerdict(t.meta) && (
                <div className="soc-t-tags">
                  <span className="soc-chip soc-chip--claret">{t.meta.answer_type}</span>
                  <span className="soc-chip">quality {t.meta.quality}/3</span>
                  {t.meta.doctrinal_error && <span className="soc-chip soc-chip--ink">doctrinal error</span>}
                  <span className="soc-chip">→ {t.meta.recommended_move}</span>
                  <span className="soc-t-rationale">{t.meta.rationale}</span>
                </div>
              )}
              {t.role === 'student' && !t.hidden && t.meta && !isVerdict(t.meta) && (
                <div className="soc-t-tags">
                  <span className="soc-chip soc-chip--ink">observer failed</span>
                  <span className="soc-t-rationale">{String((t.meta as { observer_error?: string }).observer_error ?? '')}</span>
                </div>
              )}
              {t.coach && (
                <details>
                  <summary>Coach note the tutor saw</summary>
                  <pre>{t.coach}</pre>
                </details>
              )}
              {isTutorMeta(t.meta) && (
                <div className="soc-t-tags">
                  <span className="soc-chip soc-chip--ink">{t.meta.move}</span>
                  <span className="soc-chip">phase {t.meta.phase}</span>
                  <span className="soc-chip">read student as {t.meta.student_answer}</span>
                  {t.latency_ms && <span className="soc-chip">{(t.latency_ms / 1000).toFixed(1)}s</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
