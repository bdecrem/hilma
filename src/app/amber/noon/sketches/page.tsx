import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { todayDate } from '../generator'

interface Concept { name: string; blurb: string; grid: number[][] }
interface ConceptsFile { date: string; concepts: Concept[] }
interface MoodFile {
  date: string
  mood: { name: string; reason: string; palette: string; accent: string }
  reaction?: string
  keywords: string[]
}

const PALETTES: Record<string, string> = {
  night: '#0A0A0A', hearth: '#1A110A', ink: '#0C1424',
  petrol: '#0A1C1A', bruise: '#150826', oxblood: '#1C0808',
}
const ACCENTS: Record<string, string> = {
  lime: '#C6FF3C', sodium: '#FF7A1A', uv: '#A855F7',
}

export const dynamic = 'force-dynamic'

export default function SketchesToday() {
  const date = todayDate()
  const dir = join(process.cwd(), 'public', 'amber-noon')
  const conceptsPath = join(dir, `concepts-${date}.json`)
  const moodPath = join(dir, `mood-${date}.json`)

  if (!existsSync(conceptsPath)) {
    return (
      <main style={{ minHeight: '100dvh', background: '#0A0A0A', color: 'rgba(255,255,255,0.6)', padding: '6vh 6vw', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <p>no sketches baked for {date}.</p>
        <p style={{ opacity: 0.5, fontSize: 12, marginTop: 12 }}>run scripts/set-mood.ts then scripts/sketch-concepts.ts.</p>
      </main>
    )
  }

  const { concepts }: ConceptsFile = JSON.parse(readFileSync(conceptsPath, 'utf8'))
  const mood: MoodFile | null = existsSync(moodPath) ? JSON.parse(readFileSync(moodPath, 'utf8')) : null

  const bg = mood ? PALETTES[mood.mood.palette] ?? '#0A0A0A' : '#0A0A0A'
  const accent = mood ? ACCENTS[mood.mood.accent] ?? '#C6FF3C' : '#C6FF3C'

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: bg,
        color: '#E8E8E8',
        padding: '6vh 6vw',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <header style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
          amber · noon sketches · {date}
        </div>
        {mood && (
          <div style={{ marginTop: 12 }}>
            <span style={{ color: accent, fontSize: 28, fontWeight: 300, letterSpacing: '0.02em' }}>
              {mood.mood.name}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginLeft: 14 }}>
              — {mood.mood.reason}
            </span>
          </div>
        )}
        {mood?.reaction && (
          <p
            style={{
              marginTop: 18,
              maxWidth: 720,
              fontFamily: "'Fraunces', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: 15,
              lineHeight: 1.6,
              color: 'rgba(232,232,232,0.8)',
            }}
          >
            {mood.reaction}
          </p>
        )}
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '32px 40px',
        }}
      >
        {concepts.map((c, i) => (
          <article key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: '0.01em', color: '#F2F2F2' }}>
              {c.name}
            </div>
            {c.blurb && (
              <div
                style={{
                  fontFamily: "'Fraunces', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                "{c.blurb}"
              </div>
            )}
            <GridSvg grid={c.grid} accent={accent} />
          </article>
        ))}
      </section>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&family=Fraunces:ital,opsz,wght@0,9..144,300;1,9..144,300&display=swap');
      `}</style>
    </main>
  )
}

function GridSvg({ grid, accent }: { grid: number[][]; accent: string }) {
  const ROWS = grid.length
  const COLS = grid[0]?.length ?? 0
  const CELL = 12
  const GAP = 3
  const W = COLS * CELL
  const H = ROWS * CELL
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: 'block', marginTop: 4, background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}
      shapeRendering="crispEdges"
    >
      {grid.map((row, r) =>
        row.map((v, c) =>
          v ? (
            <rect
              key={`${r}-${c}`}
              x={c * CELL}
              y={r * CELL}
              width={CELL - GAP}
              height={CELL - GAP}
              fill={accent}
              opacity={0.9}
            />
          ) : null,
        ),
      )}
    </svg>
  )
}
