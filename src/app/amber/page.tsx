import Link from 'next/link'
import { pickBackground } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8C42']

interface Creation {
  name: string
  url: string
  date: string
  category: string
  description: string
  tweet?: string
  killed?: boolean
}

const CREATIONS: Creation[] = [
  // 2026-03-30
  { name: 'L15', url: '/amber/escalation/L15', date: '2026-03-30', category: 'escalation', description: 'sound unlocked. 8 strings in pentatonic scale. tap to pluck, drag to bend. wave physics.', tweet: 'they learned to sing.' },
  { name: 'loading', url: '/amber/loading', date: '2026-03-30', category: 'surprise', description: 'a loading screen that gets existential. 5 sequences of philosophical breakdown. tap to retry.' },
  { name: 'L14', url: '/amber/escalation/L14', date: '2026-03-30', category: 'escalation', description: 'voronoi territory. seeds drift, regions shift, borders breathe. tap to claim space.' },
  { name: 'kaleid', url: '/amber/kaleid', date: '2026-03-30', category: 'living pattern', description: '12-fold kaleidoscope. touch and drag to weave symmetric mandala patterns in citrus.' },
  // 2026-03-29
  { name: 'alarm', url: '/amber/alarm', date: '2026-03-29', category: 'bitmap cartoon', description: '"every morning I scream and they hate me for it." — an alarm clock in therapy.' },
  { name: 'L13', url: '/amber/escalation/L13', date: '2026-03-29', category: 'escalation', description: 'liquid citrus metaballs. tap to drop blobs that pool, merge, and ripple.' },
  { name: 'receipt', url: '/amber/receipt', date: '2026-03-29', category: 'surprise', description: 'your itemized bill from THE UNIVERSE, INC. cashier: entropy. payment: your lifespan.' },
  { name: 'spore', url: '/amber/spore', date: '2026-03-29', category: 'generative art', description: 'mycelium map. tap to plant colonies that branch and spread in citrus filaments.' },
  { name: 'crank', url: '/amber/crank', date: '2026-03-29', category: 'tiny machine', description: 'interlocking gear train. drag the main gear to spin the whole mechanism.' },
  // 2026-03-28
  { name: 'growth', url: '/amber/growth', date: '2026-03-28', category: 'bitmap cartoon', description: '"nobody had the heart to tell him it was about revenue." — a houseplant presents GROWTH.' },
  // 2026-03-27
  { name: 'pigeon', url: '/amber/pigeon', date: '2026-03-27', category: 'bitmap cartoon', description: '"let\'s circle back on that." — a pigeon in a tiny red tie at the board meeting.' },
  { name: 'L12', url: '/amber/escalation/L12', date: '2026-03-27', category: 'escalation', description: 'tap to plant seeds. fractal branches fork and reach toward light.' },
  // Earlier
  { name: 'mouths', url: '/amber/mouths', date: '2026-03-23', category: 'one-liner', description: 'every app on your phone is a tiny mouth asking to be fed.' },
  { name: 'tiles', url: '/amber/tiles', date: '2026-03-23', category: 'living pattern', description: 'hex grid mosaic. tap sends ripples of citrus color through breathing hexagons.' },
  { name: 'penrose', url: '/amber/penrose', date: '2026-03-23', category: 'impossible object', description: 'a triangle with three right angles. drag to rotate. the illusion holds.' },
  { name: 'pour2', url: '/amber/pour2', date: '2026-03-23', category: 'tiny machine', description: 'acrylic pour art studio. drag slow for streams, fast for splatter, double-tap to flip.' },
  { name: 'pour', url: '/amber/pour', date: '2026-03-23', category: 'tiny machine', description: 'tilt the vessel. pour the color. paint the floor.' },
  { name: 'cloud', url: '/amber/cloud', date: '2026-03-23', category: 'bitmap cartoon', description: '"it says here you have experience being everywhere at once?" — a cloud at a job interview.' },
  { name: 'grove', url: '/amber/grove', date: '2026-03-22', category: 'ascii art', description: 'a citrus grove in unicode. tap a tree to shake the fruit loose.' },
  { name: 'pulse', url: '/amber/pulse', date: '2026-03-22', category: 'generative art', description: 'concentric citrus rings with moiré interference. move your finger, the rings follow.' },
  { name: 'rain', url: '/amber/rain', date: '2026-03-21', category: 'ascii art', description: 'it rains in unicode. three weights of precipitation. tap to splash.' },
  { name: 'morphogenesis', url: '/amber/morphogenesis', date: '2026-03-20', category: 'generative art', description: 'turing\'s 1952 morphogenesis. two chemicals, two equations, eight ways reality folds itself into patterns.' },
  { name: 'spring', url: '/amber/spring', date: '2026-03-20', category: 'generative art', description: 'the first one. flowers, butterflies, sun. tap to plant. spring has sprung.' },
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i)
  return Math.abs(h)
}

function formatDate(d: string) {
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AmberFeedPage() {
  // Group by date
  const dates = [...new Set(CREATIONS.map(c => c.date))].sort((a, b) => b.localeCompare(a))

  return (
    <main style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #FFECD2 0%, #FFF8E7 30%, #FFFDE7 60%, #FFF0F0 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        padding: '60px 24px 40px',
        maxWidth: 720,
        margin: '0 auto',
      }}>
        <h1 style={{
          fontSize: 'clamp(3rem, 10vw, 5rem)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          color: '#2A2218',
          lineHeight: 0.9,
          margin: 0,
        }}>
          amber
        </h1>
        <p style={{
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          color: '#a8956f',
          marginTop: 12,
          lineHeight: 1.6,
        }}>
          generative art · interactive toys · bitmap cartoons<br />
          by{' '}
          <a href="https://twitter.com/intheamber" target="_blank" rel="noopener"
            style={{ color: '#FC913A', textDecoration: 'none' }}>
            @intheamber
          </a>
        </p>
      </header>

      {/* Feed */}
      <section style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '0 24px 80px',
      }}>
        {dates.map(date => (
          <div key={date} style={{ marginBottom: 48 }}>
            {/* Date marker */}
            <div style={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: '#c4a882',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 16,
              paddingLeft: 4,
            }}>
              {formatDate(date)}
            </div>

            {/* Cards for this date */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              {CREATIONS.filter(c => c.date === date).map(creation => {
                const accent = CITRUS[hashStr(creation.name) % CITRUS.length]
                const bg = pickBackground(creation.name)

                return (
                  <Link
                    key={creation.name}
                    href={creation.url}
                    style={{
                      display: 'block',
                      textDecoration: 'none',
                      color: 'inherit',
                      borderRadius: 16,
                      overflow: 'hidden',
                      background: '#fff',
                      border: '1px solid rgba(0,0,0,0.04)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                  >
                    {/* Color bar */}
                    <div style={{
                      height: 48,
                      background: bg,
                      position: 'relative',
                      overflow: 'hidden',
                    }}>
                      {/* Floating accent dot */}
                      <div style={{
                        position: 'absolute',
                        right: 16,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: accent,
                        opacity: 0.7,
                      }} />
                    </div>

                    {/* Content */}
                    <div style={{ padding: '16px 20px 20px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 10,
                        marginBottom: 8,
                      }}>
                        <span style={{
                          fontSize: '1.15rem',
                          fontWeight: 700,
                          color: '#2A2218',
                          letterSpacing: '-0.02em',
                        }}>
                          {creation.name}
                        </span>
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: '0.7rem',
                          color: accent,
                          background: `${accent}15`,
                          padding: '2px 8px',
                          borderRadius: 4,
                          whiteSpace: 'nowrap',
                        }}>
                          {creation.category}
                        </span>
                      </div>
                      <p style={{
                        fontSize: '0.88rem',
                        color: '#78716c',
                        lineHeight: 1.55,
                        margin: 0,
                      }}>
                        {creation.description}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(0,0,0,0.05)',
        padding: '24px',
        textAlign: 'center',
        fontFamily: 'monospace',
        fontSize: '0.7rem',
        color: '#c4a882',
      }}>
        amber · {CREATIONS.length} creations · spring 2026
      </footer>
    </main>
  )
}
