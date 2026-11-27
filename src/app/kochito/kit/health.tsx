import { alarmSays, type LiveStatus } from '@/lib/venture/board'
import { ago, at } from './time'

// The status panel (OLA-164): one reading from the Ola machine, one time. Bart, Nov 18: "It says,
// Alarm, the mini disc is almost full, and then right below it says, Disk, 73 gigs free. That makes
// no sense. Then it says, Updated two hours ago, and then below it, Status, nine minutes ago."
// So: the alarm line is computed from the same reading as the lines under it (alarmSays drops a
// sentence the reading itself contradicts); "updated" is the web app's deploy, said as such; and
// there is exactly one "read ... ago", amber after 30 minutes. The compact form is in Shell.tsx.

export const STATUS_STALE = 30 * 60e3

export function reading(s: LiveStatus | null, now: string) {
  if (!s) return { state: 'none' as const, says: [], dropped: 0, ago: '', stale: true }
  const { says, dropped } = alarmSays(s)
  const state = says.length ? ('alarm' as const) : s.alarm?.state === 'warn' ? ('warn' as const) : ('ok' as const)
  return { state, says, dropped, ago: ago(s.at, now), stale: Date.parse(now) - Date.parse(s.at) > STATUS_STALE }
}

/** The newest automatic check of main (OLA-84): "a1b2c3d4 passed 520 of 520, 12 min ago" or why it failed. */
export function ciLine(s: LiveStatus, now: string) {
  const c = s.ci
  if (!c) return 'no check reported yet'
  let n = 0
  let of = 0
  for (const v of Object.values(c.suites)) {
    const m = v.match(/^(\d+) of (\d+)$/)
    if (m) (n += Number(m[1]), (of += Number(m[2])))
  }
  const when = c.at ? `, ${at(c.at, now)}` : ''
  return c.ok ? `${c.commit.slice(0, 8)} passed${of ? ` ${n} of ${of}` : ''}${when}` : `${c.commit.slice(0, 8)} FAILED: ${c.why ?? 'see the check log'}${when}`
}

export function Health({ s, now }: { s: LiveStatus | null; now: string }) {
  const r = reading(s, now)
  if (!s) return <p className="bd-empty">The Ola machine has not sent a reading yet.</p>
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  return (
    <dl className="bd-health" aria-label="Health of the Ola machine">
      <dt>Mac mini</dt>
      <dd className={`state ${r.state}`}>
        <span className={`bd-dot ${r.state === 'alarm' ? 'alarm' : 'ok'}`} />
        {r.state === 'alarm' ? `ALARM: ${r.says.map(cap).join(' ')}` : 'OK'}
        {r.state === 'warn' && s.alarm.warns.length > 0 && <span className="note">warning: {s.alarm.warns.join('; ')}</span>}
        {r.dropped > 0 && <span className="note">(an older alarm sentence this reading contradicts is not shown)</span>}
      </dd>
      <dt>Web app</dt>
      <dd>{s.deployed ? `version ${s.deployed.commit.slice(0, 8)}${s.deployed.at ? `, updated ${at(s.deployed.at, now)}` : ''}${s.checks ? `, ${s.checks.passed} of ${s.checks.total} checks` : ''}` : 'no version reported'}</dd>
      <dt>Checks on main</dt>
      <dd className={s.ci && !s.ci.ok ? 'state alarm' : undefined}>{ciLine(s, now)}</dd>
      <dt>Disk</dt>
      <dd>{s.disk ? `${s.disk.freeGB} GB free` : 'not measured'}</dd>
      <dt />
      <dd className={`read${r.stale ? ' stale' : ''}`}>{r.stale ? `read ${r.ago}: no reading since` : `read ${r.ago}`}</dd>
    </dl>
  )
}

/** The Mac Studio's reading in one line under the mini's (OLA-477): its state and when it was read.
 *  Shown only once the Studio has sent a reading. */
export function StudioLine({ s, now }: { s: LiveStatus | null; now: string }) {
  if (!s) return null
  const r = reading(s, now)
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  return (
    <dl className="bd-health" aria-label="Health of the Mac Studio">
      <dt>Mac Studio</dt>
      <dd className={`state ${r.state}`}>
        <span className={`bd-dot ${r.state === 'alarm' ? 'alarm' : 'ok'}`} />
        {r.state === 'alarm' ? `ALARM: ${r.says.map(cap).join(' ')}` : 'OK'}
        {r.state === 'warn' && s.alarm.warns.length > 0 && <span className="note">warning: {s.alarm.warns.join('; ')}</span>}
      </dd>
      <dt>Disk</dt>
      <dd>{s.disk ? `${s.disk.freeGB} GB free` : 'not measured'}</dd>
      <dt />
      <dd className={`read${r.stale ? ' stale' : ''}`}>{r.stale ? `read ${r.ago}: no reading since` : `read ${r.ago}`}</dd>
    </dl>
  )
}
