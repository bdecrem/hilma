import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Link from 'next/link'
import type { NoonRun } from '../generator'
import { CONCEPTS } from '../concepts'

export const dynamic = 'force-dynamic'

const PALETTES: Record<string, string> = {
  night: '#0A0A0A', hearth: '#1A110A', ink: '#0C1424',
  petrol: '#0A1C1A', bruise: '#150826', oxblood: '#1C0808',
}
const ACCENTS: Record<string, string> = {
  lime: '#C6FF3C', sodium: '#FF7A1A', uv: '#A855F7',
}

function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const [, y, mm, dd] = m
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(mm, 10) - 1]} ${parseInt(dd, 10)}, ${y}`
}

function loadAllRuns(): NoonRun[] {
  const dir = join(process.cwd(), 'public', 'amber-noon')
  const files = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  const runs: NoonRun[] = []
  for (const f of files) {
    try {
      runs.push(JSON.parse(readFileSync(join(dir, f), 'utf8')))
    } catch {}
  }
  return runs.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export default function NoonArchive() {
  const runs = loadAllRuns()

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#0A0A0A',
        color: '#E8E8E8',
        padding: '6vh 6vw',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <header style={{ marginBottom: 44 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
          amber · noon · archive
        </div>
        <h1 style={{ marginTop: 10, fontSize: 28, fontWeight: 300, letterSpacing: '0.02em' }}>
          one piece a day at noon
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, color: 'rgba(255,255,255,0.55)', maxWidth: 560, lineHeight: 1.5 }}>
          weather + the world, filtered through amber's mood. {runs.length}{' '}
          {runs.length === 1 ? 'piece' : 'pieces'} so far.
        </p>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '28px 32px',
        }}
      >
        {runs.map(run => {
          const bg = run.mood.bgColor ?? PALETTES[run.mood.palette] ?? '#0A0A0A'
          const tile = run.mood.tileColor ?? '#E8E8E8'
          const accent = ACCENTS[run.mood.accent] ?? '#C6FF3C'
          const grid = run.winner.grid
            ?? CONCEPTS.find(c => c.name === run.winner.concept)?.grid
            ?? null
          return (
            <Link
              key={run.date}
              href={`/amber/noon/${run.date}`}
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <article
                style={{
                  background: bg,
                  padding: 18,
                  borderRadius: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  transition: 'transform 0.2s',
                }}
              >
                {grid && <GridSvg grid={grid} tile={tile} />}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 400 }}>{run.winner.concept}</span>
                  <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'rgba(232,232,232,0.5)' }}>
                    {formatDate(run.date)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(232,232,232,0.55)' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: accent }} />
                  {run.mood.name}
                </div>
                {run.closingStatement && (
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "'Fraunces', Georgia, serif",
                      fontStyle: 'italic',
                      fontWeight: 300,
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      color: 'rgba(232,232,232,0.68)',
                      letterSpacing: '0.005em',
                    }}
                  >
                    {run.closingStatement}
                  </p>
                )}
              </article>
            </Link>
          )
        })}
      </section>

      <footer style={{ marginTop: 64 }}>
        <Link
          href="/amber"
          style={{
            fontSize: 11,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)',
            textDecoration: 'none',
          }}
        >
          ← back to amber
        </Link>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&family=Fraunces:ital,opsz,wght@0,9..144,300;1,9..144,300&display=swap');
      `}</style>
    </main>
  )
}

function GridSvg({ grid, tile }: { grid: number[][]; tile: string }) {
  const ROWS = grid.length
  const COLS = grid[0]?.length ?? 0
  const CELL = 10
  return (
    <svg
      viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`}
      width="100%"
      style={{ display: 'block' }}
      shapeRendering="crispEdges"
    >
      {grid.map((row, r) =>
        row.map((v, c) =>
          v ? (
            <rect key={`${r}-${c}`} x={c * CELL} y={r * CELL} width={CELL - 1} height={CELL - 1} fill={tile} />
          ) : null,
        ),
      )}
    </svg>
  )
}
