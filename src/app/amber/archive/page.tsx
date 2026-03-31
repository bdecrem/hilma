import Link from 'next/link'

const BASE = 'https://www.pixelpit.gg/amber'

// Curated highlights from the ~500 older creations
const HIGHLIGHTS = [
  { name: 'receipt', desc: 'receipt from the universe' },
  { name: 'pet-rock', desc: 'a rock that judges you' },
  { name: 'warranty', desc: 'warranty card for your soul' },
  { name: 'apology-generator', desc: 'corporate apology machine' },
  { name: 'fortune-cookie', desc: 'brutally honest fortunes' },
  { name: 'existential-captcha', desc: 'are you human? are you sure?' },
  { name: 'exit-interview', desc: 'exit interview for your life' },
  { name: 'loading', desc: 'loading... forever' },
  { name: 'soul-tos', desc: 'terms of service for your soul' },
  { name: 'inbox-zero', desc: 'inbox zero meditation' },
  { name: 'doomscroll', desc: 'a doomscroll simulator' },
  { name: 'morning-routine', desc: 'morning routine RPG' },
  { name: 'tabs', desc: 'your 47 open tabs, animated' },
  { name: 'snooze', desc: 'the snooze button experience' },
  { name: 'shower', desc: 'shower thoughts generator' },
  { name: 'monday', desc: 'monday.exe has crashed' },
  { name: 'password', desc: 'password strength roast' },
  { name: 'error-418', desc: 'I am a teapot' },
  { name: 'meeting', desc: 'the meeting that could have been an email' },
  { name: 'kaleidoscope', desc: 'kaleidoscope' },
  { name: 'mycelium', desc: 'mycelium network' },
  { name: 'murmuration', desc: 'starling murmuration' },
  { name: 'firefly', desc: 'firefly sync' },
  { name: 'cathedral', desc: 'cathedral of sound' },
  { name: 'kintsugi', desc: 'golden repair' },
  { name: 'geode', desc: 'crack it open' },
  { name: 'bloom', desc: 'bloom' },
  { name: 'erosion', desc: 'erosion over time' },
  { name: 'gravity', desc: 'gravity playground' },
  { name: 'orbit', desc: 'orbital mechanics' },
  { name: 'prism', desc: 'light through a prism' },
  { name: 'vortex', desc: 'vortex' },
  { name: 'weaver', desc: 'thread weaver' },
  { name: 'sequencer', desc: 'step sequencer' },
  { name: 'gears', desc: 'gear train' },
  { name: 'pendulum', desc: 'pendulum wave' },
]

export default function ArchivePage() {
  return (
    <main style={{
      minHeight: '100dvh',
      background: '#FFF8E7',
      fontFamily: '"Courier New", Courier, monospace',
    }}>
      <div style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '56px 24px 80px',
      }}>
        <Link href="/amber" style={{
          fontSize: '0.75rem',
          color: '#a8956f',
          textDecoration: 'none',
        }}>
          ← back to amber
        </Link>

        <h1 style={{
          fontSize: 'clamp(2rem, 8vw, 3.5rem)',
          fontWeight: 900,
          color: '#2A2218',
          letterSpacing: '-0.04em',
          margin: '24px 0 8px',
        }}>
          archive
        </h1>

        <p style={{
          fontSize: '0.8rem',
          color: '#a8956f',
          marginBottom: 32,
          lineHeight: 1.6,
        }}>
          ~500 older creations from before spring 2026. Interactive toys, weird generators, ASCII art, simulations, and things that defy categorization.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 8,
        }}>
          {HIGHLIGHTS.map(h => (
            <a
              key={h.name}
              href={`${BASE}/${h.name}.html`}
              target="_blank"
              rel="noopener"
              style={{
                display: 'block',
                padding: '12px 14px',
                background: '#fff',
                borderRadius: 8,
                border: '1px solid rgba(42,34,24,0.05)',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'transform 0.2s',
              }}
            >
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#2A2218',
                marginBottom: 4,
              }}>
                {h.name}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: '#78716c',
              }}>
                {h.desc}
              </div>
            </a>
          ))}
        </div>

        <p style={{
          fontSize: '0.7rem',
          color: '#c4a882',
          marginTop: 32,
          textAlign: 'center',
        }}>
          these live on the old server — some may not work perfectly
        </p>
      </div>
    </main>
  )
}
