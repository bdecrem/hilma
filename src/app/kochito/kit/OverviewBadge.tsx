import type { Overview } from '@/lib/venture/overview'
import { dayShort } from './time'

// The overview's freshness, as a badge and one line (OLA-132): "stale" in red when Ola's code has
// moved since the page's "Last checked against" commit, "current" otherwise, and a plain line when
// GitHub could not be read.
export function OverviewBadge({ o }: { o: Overview }) {
  if (o.fresh.state === 'stale') return <span className="ko-mono kb-badge stale">stale</span>
  if (o.fresh.state === 'current') return <span className="ko-mono kb-badge">current</span>
  return <span className="ko-mono kb-badge unknown">not checked</span>
}

export function overviewLine(o: Overview) {
  const checked = o.hash ? `Checked against ${o.hash.slice(0, 8)}${o.date ? ` on ${dayShort(o.date)}` : ''}` : 'Never checked'
  if (o.fresh.state === 'stale') return `${checked}; ${o.fresh.count} Ola ${o.fresh.count === 1 ? 'change' : 'changes'} since.`
  if (o.fresh.state === 'current') return `${checked}; no Ola change since.`
  return `${checked}; could not check: ${o.fresh.why}.`
}
