'use client'
import type { Area } from '@/lib/venture/board'

// The tracker's filters: a plain GET form (it works without script), sent again as soon as a choice
// changes. The tab stays what it was.
type P = { tab?: string; area?: string; pri?: string; who?: string; week?: string; q?: string; sort?: string }
export default function Filters({ base, p, areas, whos }: { base: string; p: P; areas: [Area, string][]; whos: string[] }) {
  const send = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit()
  return (
    <form className="kb-filters kb-filters-form" action={`${base}/issues`} method="get" role="search">
      {p.tab && <input type="hidden" name="tab" value={p.tab} />}
      <input type="search" name="q" defaultValue={p.q ?? ''} placeholder="Search titles, proof, commits" aria-label="Search" />
      <select name="area" defaultValue={p.area ?? ''} onChange={send} aria-label="Area">
        <option value="">every area</option>
        {areas.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <select name="pri" defaultValue={p.pri ?? ''} onChange={send} aria-label="Priority">
        <option value="">any priority</option>
        <option value="P0">P0, now</option>
        <option value="P1">P1, this week</option>
        <option value="P2">P2, later</option>
      </select>
      <select name="who" defaultValue={p.who ?? ''} onChange={send} aria-label="Who">
        <option value="">anyone</option>
        {whos.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
      <select name="week" defaultValue={p.week ?? ''} onChange={send} aria-label="Plan week">
        <option value="">any week</option>
        {[1, 2, 3, 4].map((w) => (
          <option key={w} value={String(w)}>
            plan week {w}
          </option>
        ))}
      </select>
      <select name="sort" defaultValue={p.sort ?? 'newest'} onChange={send} aria-label="Sort">
        <option value="newest">newest first</option>
        <option value="priority">priority first</option>
      </select>
      <button type="submit">Show</button>
      {(p.q || p.area || p.pri || p.who || p.week) && <a href={`${base}/issues${p.tab ? `?tab=${p.tab}` : ''}`}>clear</a>}
    </form>
  )
}
