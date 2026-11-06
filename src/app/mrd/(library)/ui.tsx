import Link from 'next/link'
import type { ReactNode } from 'react'

export const BASE = '/mrd'

export const GROUPS: { key: string; label: string; color: string }[] = [
  { key: 'ADMISSION AND LEGAL STATUS', label: 'Admission and legal status', color: 'var(--g-admission)' },
  { key: 'NON-DISCRIMINATION AND VULNERABILITY', label: 'Non-discrimination and vulnerability', color: 'var(--g-nondisc)' },
  { key: 'SOCIAL RIGHTS', label: 'Social rights', color: 'var(--g-social)' },
  { key: 'INTEGRATION AND CITIZENSHIP', label: 'Integration and citizenship', color: 'var(--g-integration)' },
  { key: 'CIVIL AND POLITICAL RIGHTS', label: 'Civil and political rights', color: 'var(--g-civil)' },
]
export const groupColor = (g?: string | null) => GROUPS.find(x => x.key === g)?.color ?? '#bbb'

// The order and short names the MRD's own country wheels use.
export const WHEEL: { slug: string; short: string; group: string }[] = [
  { slug: 'expulsion-asylum-and-non-refoulement', short: 'Asylum', group: 'ADMISSION AND LEGAL STATUS' },
  { slug: 'equal-protection', short: 'Equality', group: 'NON-DISCRIMINATION AND VULNERABILITY' },
  { slug: 'vulnerable-migrants', short: 'Vulnerable', group: 'NON-DISCRIMINATION AND VULNERABILITY' },
  { slug: 'labor', short: 'Labor', group: 'SOCIAL RIGHTS' },
  { slug: 'education', short: 'Education', group: 'SOCIAL RIGHTS' },
  { slug: 'health', short: 'Health', group: 'SOCIAL RIGHTS' },
  { slug: 'victims-of-crime', short: 'Victimhood', group: 'INTEGRATION AND CITIZENSHIP' },
  { slug: 'family', short: 'Family', group: 'INTEGRATION AND CITIZENSHIP' },
  { slug: 'nationality', short: 'Citizenship', group: 'INTEGRATION AND CITIZENSHIP' },
  { slug: 'peaceful-assembly-and-association', short: 'Assembly', group: 'CIVIL AND POLITICAL RIGHTS' },
  { slug: 'due-process', short: 'Process', group: 'CIVIL AND POLITICAL RIGHTS' },
  { slug: 'legal-personhood', short: 'Personhood', group: 'CIVIL AND POLITICAL RIGHTS' },
  { slug: 'thought-conscience-and-religion-or-belief', short: 'Belief', group: 'CIVIL AND POLITICAL RIGHTS' },
  { slug: 'liberty', short: 'Liberty', group: 'CIVIL AND POLITICAL RIGHTS' },
  { slug: 'civil-and-political-life', short: 'Civil', group: 'CIVIL AND POLITICAL RIGHTS' },
  { slug: 'opinion-and-expression', short: 'Opinion', group: 'CIVIL AND POLITICAL RIGHTS' },
  { slug: 'life', short: 'Life', group: 'CIVIL AND POLITICAL RIGHTS' },
]

export const KINDS: Record<string, string> = {
  constitution: 'Constitution', statute: 'Statute', regulation: 'Regulation', decree: 'Decree', executive_order: 'Executive order',
  administrative_guidance: 'Guidance', court_decision: 'Court decision', treaty: 'Treaty', other: 'Other',
}
export const KIND_ORDER = ['constitution', 'statute', 'regulation', 'decree', 'executive_order', 'administrative_guidance', 'court_decision', 'treaty', 'other']

export const STATUS: Record<string, string> = { text: 'Full text', link: 'Link only', missing: 'Not located' }

const langNames = new Intl.DisplayNames(['en'], { type: 'language' })
export function langName(code?: string | null) {
  if (!code) return null
  try { return langNames.of(code) ?? code } catch { return code }
}

export const fmt = (n: number) => n.toLocaleString('en-US')
export function size(chars?: number | null) {
  if (!chars) return null
  const words = Math.round(chars / 6.2)
  return words >= 1e6 ? `${(words / 1e6).toFixed(1)}M words` : words >= 1000 ? `${fmt(Math.round(words / 1000))}k words` : `${fmt(words)} words`
}

export type Cat = { slug: string; name: string; group: string }
export type CountryRef = { name: string; iso: string; slug: string }

export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{STATUS[status] ?? status}</span>
}

export function CatChip({ c, link = true }: { c: Cat; link?: boolean }) {
  const inner = <><span className="dot" style={{ background: groupColor(c.group) }} />{c.name}</>
  return link ? <Link className="chip" href={`${BASE}/categories/${c.slug}`}>{inner}</Link> : <span className="chip">{inner}</span>
}

/** Search snippets come back with ⟦ ⟧ around the matched words. */
export function Snippet({ text }: { text: string }) {
  const parts = text.replace(/\s+/g, ' ').trim().split(/(⟦[^⟧]*⟧)/g)
  return <>{parts.map((p, i) => (p.startsWith('⟦') ? <mark key={i}>{p.slice(1, -1)}</mark> : p))}</>
}

// trig differs in the last digits between Node and the browser; round so hydration matches
const r2 = (n: number) => Math.round(n * 100) / 100

export function Logo() {
  // a ring of dotted rays around a dense center, after the Initiative's own mark
  const rays: ReactNode[] = []
  const N = 60
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    const c = Math.cos(a), s = Math.sin(a)
    rays.push(<line key={`l${i}`} x1={r2(50 + c * 3)} y1={r2(50 + s * 3)} x2={r2(50 + c * 41)} y2={r2(50 + s * 41)} stroke="currentColor" strokeWidth={0.55} opacity={0.85} />)
    rays.push(<circle key={`d${i}`} cx={r2(50 + c * 45)} cy={r2(50 + s * 45)} r={1.35} fill="currentColor" />)
    if (i % 2 === 0) rays.push(<circle key={`m${i}`} cx={r2(50 + c * 27)} cy={r2(50 + s * 27)} r={0.7} fill="currentColor" opacity={0.7} />)
  }
  return (
    <svg viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id="mri-core">
          <stop offset="0" stopColor="#0b0b50" />
          <stop offset=".55" stopColor="#3b3b8a" stopOpacity=".55" />
          <stop offset="1" stopColor="#0b0b50" stopOpacity="0" />
        </radialGradient>
      </defs>
      {rays}
      <circle cx="50" cy="50" r="13" fill="url(#mri-core)" />
    </svg>
  )
}

/** A country's laws per category as the MRD draws its score wheels: one spoke per category, colored by group. */
export function Wheel({ cats, max, labels = false }: { cats: Record<string, number>; max: number; labels?: boolean }) {
  const R = labels ? 116 : 96
  const C = labels ? 170 : 100
  const W = C * 2
  const n = WHEEL.length
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2
  const gap = 0.012
  return (
    <svg viewBox={`0 0 ${W} ${W}`} role="img" aria-label="Laws cited per category">
      {WHEEL.map((w, i) => {
        const a0 = ang(i - 0.5) + gap, a1 = ang(i + 0.5) - gap
        return <path key={w.slug} d={`M${C},${C} L${r2(C + R * Math.cos(a0))},${r2(C + R * Math.sin(a0))} A${R},${R} 0 0 1 ${r2(C + R * Math.cos(a1))},${r2(C + R * Math.sin(a1))} Z`} style={{ fill: 'var(--wedge)' }} />
      })}
      {WHEEL.map((w, i) => {
        const v = cats[w.slug] ?? 0
        if (!v) return null
        const r = 10 + (R - 18) * Math.sqrt(v / max)
        const x = r2(C + r * Math.cos(ang(i))), y = r2(C + r * Math.sin(ang(i)))
        const col = groupColor(w.group)
        return (
          <g key={w.slug}>
            <line x1={C} y1={C} x2={x} y2={y} stroke={col} strokeWidth={labels ? 1.6 : 1.3} />
            <circle cx={x} cy={y} r={labels ? 4.2 : 3.6} fill={col}><title>{`${w.short}: ${v} law${v === 1 ? '' : 's'}`}</title></circle>
          </g>
        )
      })}
      <circle cx={C} cy={C} r={labels ? 4.5 : 3.8} fill="#475883" />
      {labels && WHEEL.map((w, i) => {
        const a = ang(i)
        const x = r2(C + (R + 18) * Math.cos(a)), y = r2(C + (R + 18) * Math.sin(a))
        const deg = r2((a * 180) / Math.PI + 90)
        const flip = deg > 90 && deg < 270
        return (
          <text key={w.slug} x={x} y={y} fontSize="8.8" textAnchor="middle" dominantBaseline="middle" fill="#000"
            transform={`rotate(${flip ? deg + 180 : deg} ${x} ${y})`}>{w.short}</text>
        )
      })}
    </svg>
  )
}

export function Legend() {
  return (
    <div className="legend">
      <b>Groups of rights:</b>
      {GROUPS.map(g => <span key={g.key}><span className="dot" style={{ background: g.color }} />{g.label}</span>)}
    </div>
  )
}

export function LawMeta({ kind, year, country, status, extra }: { kind?: string; year?: number | null; country?: CountryRef; status?: string; extra?: ReactNode }) {
  return (
    <div className="meta">
      {status && <Badge status={status} />}
      {country && <Link href={`${BASE}/countries/${country.slug}`}>{country.name}</Link>}
      {kind && <span>{KINDS[kind] ?? kind}</span>}
      {year ? <span>{year}</span> : null}
      {extra}
    </div>
  )
}
