'use client'
import type { Area } from '@/lib/venture/board'
import type { TrackerParams } from './Tracker'

// The tracker's search and filters: a plain GET form (it works without script), sent again as soon
// as a choice changes. The tab, sort and the filters Home and Plan link in with ride along hidden.
export default function Filters({ action, p, areas }: { action: string; p: TrackerParams; areas: [Area, string][] }) {
  const send = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit()
  return (
    <form className="bd-filter" action={action} method="get" role="search">
      {(['tab', 'sort', 'week', 'day', 'opened', 'who'] as const).map((k) => p[k] && <input key={k} type="hidden" name={k} value={p[k]} />)}
      <input id="bd-search" type="search" name="q" defaultValue={p.q ?? ''} placeholder="Search ID, title, description   /" aria-label="Search issues" />
      <select name="area" defaultValue={p.area ?? ''} onChange={send} aria-label="Area">
        <option value="">Every area</option>
        {areas.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <select name="pri" defaultValue={p.pri ?? ''} onChange={send} aria-label="Priority">
        <option value="">Any priority</option>
        <option value="P0">P0</option>
        <option value="P1">P1</option>
        <option value="P2">P2</option>
      </select>
    </form>
  )
}
