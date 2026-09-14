// Researcher view: every session, newest first. Gated by ?key=SOC_ADMIN_KEY.

import { ARM_INFO } from '@/lib/socratic/arms'
import { listSessions, masteryCount } from '@/lib/socratic/store'
import { authorized, Denied } from './auth'

export const dynamic = 'force-dynamic'

function when(iso: string) {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams
  if (!authorized(key)) return <Denied />
  const sessions = await listSessions()
  const byArm = { A: 0, B: 0, C: 0 }
  for (const s of sessions) byArm[s.arm]++

  return (
    <main className="soc-admin">
      <div className="soc-kicker">Socratic · researchers</div>
      <h1>Sessions</h1>
      <div className="soc-muted">
        {sessions.length} sessions · A {byArm.A} · B {byArm.B} · C {byArm.C} · times in Pacific
      </div>
      <div className="soc-table-wrap">
        <table className="soc-table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Participant</th>
              <th>Arm</th>
              <th>Phase</th>
              <th>Student msgs</th>
              <th>Mastery</th>
              <th>Ended</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  <a href={`/socratic/sessions/${s.id}?key=${encodeURIComponent(key!)}`}>{when(s.created_at)}</a>
                </td>
                <td>{s.participant}</td>
                <td>
                  {s.arm} · {ARM_INFO[s.arm].name}
                </td>
                <td>{s.phase}</td>
                <td>{s.student_turns}</td>
                <td>{masteryCount(s.mastery)}/4</td>
                <td>{s.ended_at ? when(s.ended_at) : '—'}</td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={7} className="soc-muted">
                  No sessions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
