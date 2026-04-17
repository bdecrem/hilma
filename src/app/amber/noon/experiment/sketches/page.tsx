// Preview of the 10 spring-day concepts at 52×20.
// Each rendered as a static SVG — what the bio-engine will try to converge to.

import { CONCEPTS, COLS, ROWS } from '../concepts'

const BG = '#0C1424'
const TILE = '#E8B86B'

export default function ExperimentSketches() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: BG,
        color: 'rgba(232,232,232,0.85)',
        padding: '5vh 5vw',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <header style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(232,232,232,0.45)' }}>
          experiment · sketches preview
        </div>
        <h1 style={{ marginTop: 10, fontSize: 28, fontWeight: 300, letterSpacing: '0.01em' }}>
          ten shapes · a bright spring day · 52×20
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, color: 'rgba(232,232,232,0.55)', maxWidth: 640, lineHeight: 1.55 }}>
          these are the planted targets the bio-engine will try to converge to each attempt.
          outline only — the engine will fill them in during emergence.
        </p>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
          gap: '30px 36px',
        }}
      >
        {CONCEPTS.map((concept) => (
          <article
            key={concept.name}
            style={{
              background: 'rgba(255,255,255,0.02)',
              padding: '18px',
              borderRadius: 3,
              border: '1px solid rgba(232,184,107,0.1)',
            }}
          >
            <ConceptGrid grid={concept.grid} />
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 16, fontWeight: 400 }}>{concept.name}</span>
              <span style={{ fontSize: 11, color: 'rgba(232,232,232,0.4)', letterSpacing: '0.14em' }}>
                {countTarget(concept.grid)} / {COLS * ROWS} cells
              </span>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}

function countTarget(grid: number[][]): number {
  let n = 0
  for (const row of grid) for (const v of row) if (v) n++
  return n
}

function ConceptGrid({ grid }: { grid: number[][] }) {
  const CELL = 8
  const GAP = 1
  const width = COLS * (CELL + GAP)
  const height = ROWS * (CELL + GAP)
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', display: 'block', background: '#0a1020' }}
      preserveAspectRatio="xMidYMid meet"
    >
      {grid.map((row, r) =>
        row.map((v, c) => {
          if (!v) return null
          return (
            <rect
              key={`${r}-${c}`}
              x={c * (CELL + GAP)}
              y={r * (CELL + GAP)}
              width={CELL}
              height={CELL}
              fill={TILE}
            />
          )
        })
      )}
    </svg>
  )
}
