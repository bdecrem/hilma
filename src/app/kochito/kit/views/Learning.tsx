import type { Learning } from '@/lib/venture/board'
import { at, dayShort, pday } from '../time'

// Agent learning (Bart, Nov 18): "a widget / section that tracks Agent Learning, in two parts: (1)
// THIS agent, the overall system that's building and working with me on Ola (2) the thing that is
// the harness, evaluates what models to use, what skills need improving etc. i want a bottom line
// number/percentage/progress for each". Data: venture_state "learning" (scripts/venture/learning.mjs).
// Missing: "not measured yet"; older than a day: "as of <when>" in amber. Never a made-up number.
const DAY = 24 * 3600e3

export function learningAge(l: Learning | null, now: string) {
  if (!l) return { old: true, line: 'not measured yet' }
  const old = Date.parse(now) - Date.parse(l.at) > DAY
  return { old, line: old ? `as of ${at(l.at, now)}` : `measured ${at(l.at, now)}` }
}

export function LearningFigures({ l, now, href }: { l: Learning | null; now: string; href: string }) {
  const age = learningAge(l, now)
  if (!l) return <p className="bd-empty">Agent learning is not measured yet.</p>
  const fig = (name: string, what: string, pct: number, goal: number, line: string, small: string) => (
    <div className="bd-learn-fig">
      <p className="who">
        {name} <span>{what}</span>
      </p>
      <b>{Math.round(pct)}%</b>
      <p className="line">{line}</p>
      <span className="bar" role="img" aria-label={`${Math.round(pct)} of ${goal}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, (pct / (goal || 100)) * 100))}%` }} />
      </span>
      {small && <p className="small">{small}</p>}
    </div>
  )
  const k = l.kit
  const o = l.ola
  const today = k.latest_day ? `${k.latest_day.day === pday(now) ? 'today' : dayShort(k.latest_day.day)}: ${k.latest_day.corrections} corrections, ${k.latest_day.repeats} repeats` : ''
  return (
    <>
      <div className="bd-learn">
        {fig('Kit', 'the system that works with you', k.percent, k.goal, k.label, [today, k.steers ? `${k.steers.rate} steers per 100 messages` : ''].filter(Boolean).join(' · '))}
        {fig('Ola', 'models and skills', o.percent, o.goal, o.label, o.own && o.claude ? `${Math.round(o.own.rate)}% against Claude's ${Math.round(o.claude.rate)}%, ${o.model}${o.measured ? `, ${o.measured}` : ''}` : '')}
      </div>
      <p className={`bd-learn-foot${age.old ? ' bd-amber' : ''}`}>
        <span className="m">{age.line}</span> <a href={href}>How Kit and Ola learn</a>
      </p>
    </>
  )
}
