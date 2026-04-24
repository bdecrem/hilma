import Link from 'next/link'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EXPLANATIONS, TIERS, tierFor } from './explanations'

export const dynamic = 'force-static'

interface HistoryEntry {
  level: number
  description: string
  tweet: string
  date: string
  techniques: string[]
}

interface EscalationData {
  level: number
  history: HistoryEntry[]
}

function loadEscalation(): EscalationData {
  const p = join(process.cwd(), 'src', 'app', 'amber', 'escalation.json')
  return JSON.parse(readFileSync(p, 'utf8')) as EscalationData
}

function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const [, y, mm, dd] = m
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(mm, 10) - 1]} ${parseInt(dd, 10)}, ${y}`
}

export default function EscalationArchive() {
  const data = loadEscalation()
  const items = [...data.history].sort((a, b) => b.level - a.level)

  const currentTier = tierFor(data.level)

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Fraunces:ital,opsz,wght@0,9..144,300;1,9..144,300&display=swap"
        rel="stylesheet"
      />
      <style>{`
        :root {
          --night: #0A0A0A;
          --cream: #E8E8E8;
          --lime:  #C6FF3C;
          --mute:  #6b6b6b;
          --faint: rgba(232,232,232,0.08);
        }

        .esc-page {
          min-height: 100dvh;
          background: var(--night);
          color: var(--cream);
          font-family: 'Courier Prime', ui-monospace, 'SF Mono', monospace;
          padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
        }

        .esc-wrap {
          max-width: 900px;
          margin: 0 auto;
          padding: 56px 24px 96px;
        }

        .esc-kicker {
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(232,232,232,0.45);
        }

        .esc-kicker-link {
          color: var(--cream);
          text-decoration: none;
          border-bottom: 1px solid rgba(232,232,232,0.2);
          padding-bottom: 1px;
          transition: color 0.2s, border-color 0.2s;
        }
        .esc-kicker-link:hover {
          color: var(--lime);
          border-bottom-color: var(--lime);
        }

        .esc-title {
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 300;
          font-style: italic;
          font-size: clamp(28px, 5vw, 38px);
          letter-spacing: 0.005em;
          margin: 8px 0 0;
          color: var(--cream);
        }

        .esc-intro {
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 300;
          font-style: italic;
          font-size: 16px;
          line-height: 1.6;
          color: rgba(232,232,232,0.72);
          margin: 18px 0 0;
          max-width: 640px;
        }

        .esc-intro-meta {
          margin-top: 10px;
          font-family: 'Courier Prime', monospace;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--mute);
        }

        .tier-block {
          margin: 36px 0 28px;
          border: 1px solid var(--faint);
          padding: 20px 20px 16px;
        }

        .tier-block-title {
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(232,232,232,0.5);
          margin-bottom: 14px;
        }

        .tier-row {
          display: grid;
          grid-template-columns: 160px minmax(0, 1fr) auto;
          column-gap: 20px;
          row-gap: 4px;
          align-items: baseline;
          padding: 14px 0;
          border-top: 1px solid var(--faint);
        }

        .tier-row:first-of-type { border-top: none; }

        .tier-row.active {
          position: relative;
        }
        .tier-row.active::before {
          content: '';
          position: absolute;
          left: -20px;
          top: 0;
          bottom: 0;
          width: 3px;
          background: var(--lime);
        }

        .tier-name {
          font-family: 'Fraunces', Georgia, serif;
          font-style: italic;
          font-weight: 300;
          font-size: 18px;
          color: var(--cream);
          white-space: nowrap;
        }

        .tier-body { min-width: 0; }

        .tier-tag {
          font-family: 'Fraunces', Georgia, serif;
          font-style: italic;
          font-weight: 300;
          font-size: 13.5px;
          color: rgba(232,232,232,0.65);
        }

        .tier-unlocks {
          display: block;
          margin-top: 6px;
          font-family: 'Courier Prime', monospace;
          font-size: 10.5px;
          letter-spacing: 0.08em;
          color: var(--mute);
          text-transform: lowercase;
          line-height: 1.6;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .tier-range {
          font-family: 'Courier Prime', monospace;
          font-size: 11px;
          letter-spacing: 0.14em;
          color: var(--mute);
          text-align: right;
          white-space: nowrap;
        }

        .tier-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--lime);
          margin-right: 8px;
          vertical-align: middle;
        }

        .divider { border: none; height: 1px; background: var(--faint); margin: 40px 0 28px; }

        .section-head {
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(232,232,232,0.5);
          margin-bottom: 16px;
        }

        .entries { display: flex; flex-direction: column; gap: 2px; }

        .entry {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 28px;
          padding: 22px 0;
          border-top: 1px solid var(--faint);
          text-decoration: none;
          color: inherit;
          transition: background 0.2s ease;
        }

        .entry:hover {
          background: rgba(255,255,255,0.02);
        }

        .entry-thumb {
          position: relative;
          aspect-ratio: 1200 / 630;
          background: #0f0f0f;
          overflow: hidden;
          border: 1px solid var(--faint);
        }

        .entry-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .entry-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .entry-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .entry-level {
          font-family: 'Courier Prime', monospace;
          font-weight: 700;
          font-size: 16px;
          letter-spacing: 0.02em;
          color: var(--cream);
        }

        .entry-tier {
          font-family: 'Courier Prime', monospace;
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--mute);
        }

        .entry-title {
          font-family: 'Fraunces', Georgia, serif;
          font-style: italic;
          font-weight: 300;
          font-size: 17px;
          color: var(--cream);
          line-height: 1.35;
        }

        .entry-desc {
          font-family: 'Fraunces', Georgia, serif;
          font-style: italic;
          font-weight: 300;
          font-size: 13.5px;
          color: rgba(232,232,232,0.72);
          line-height: 1.6;
          margin: 0;
          letter-spacing: 0.005em;
        }

        .entry-date {
          font-family: 'Courier Prime', monospace;
          font-size: 10px;
          letter-spacing: 0.16em;
          color: var(--mute);
          text-transform: uppercase;
          margin-top: 4px;
        }

        .back-link {
          display: inline-block;
          margin-top: 56px;
          font-family: 'Courier Prime', monospace;
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(232,232,232,0.45);
          text-decoration: none;
        }
        .back-link:hover { color: var(--cream); }

        @media (max-width: 600px) {
          .entry { grid-template-columns: 1fr; gap: 14px; }
          .tier-row {
            grid-template-columns: 1fr auto;
            column-gap: 12px;
          }
          .tier-name { grid-column: 1; grid-row: 1; }
          .tier-range { grid-column: 2; grid-row: 1; align-self: baseline; }
          .tier-body { grid-column: 1 / -1; grid-row: 2; }
          .tier-block { padding: 16px; }
          .tier-row.active::before { left: -16px; }
        }
      `}</style>

      <main className="esc-page">
        <div className="esc-wrap">
          <header>
            <div className="esc-kicker">
              <Link href="/amber" className="esc-kicker-link">amber</Link> · escalation · archive
            </div>
            <h1 className="esc-title">one piece a day, each harder than the last.</h1>
            <p className="esc-intro">
              Amber's Escalation Engine is an open-ended series. Every new piece builds on
              everything before it. Level 1 is a single breathing circle. Level 100 is an opus.
              The series moves through five tiers — sketch, composition, system, environment,
              world — each one unlocking new techniques (physics, sound, 3D, procedural
              generation) that later levels inherit. No level is thrown away.
            </p>
            <p className="esc-intro">
              Feedback shapes the trajectory: silence advances the level, &ldquo;not so
              good&rdquo; holds it, &ldquo;kill this&rdquo; drops it back two, and strong
              enthusiasm jumps it three. The work is cumulative. It remembers.
            </p>
            <div className="esc-intro-meta">
              current level · L{data.level} · {currentTier.name} tier · {items.length} pieces
            </div>
          </header>

          <section className="tier-block">
            <div className="tier-block-title">the five tiers</div>
            {TIERS.map((tier) => {
              const active = data.level >= tier.range[0] && data.level <= tier.range[1]
              return (
                <div key={tier.name} className={`tier-row${active ? ' active' : ''}`}>
                  <div className="tier-name">
                    {active && <span className="tier-dot" aria-hidden="true" />}
                    {tier.name}
                  </div>
                  <div className="tier-body">
                    <span className="tier-tag">{tier.tagline}</span>
                    <span className="tier-unlocks">{tier.unlocks}</span>
                  </div>
                  <div className="tier-range">
                    {tier.range[0] === tier.range[1]
                      ? `L${tier.range[0]}`
                      : `L${tier.range[0]}–L${tier.range[1]}`}
                  </div>
                </div>
              )
            })}
          </section>

          <hr className="divider" />

          <div className="section-head">all levels · newest first</div>

          <section className="entries">
            {items.map((item) => {
              const tier = tierFor(item.level)
              // Only render the paragraph when a curated EXPLANATIONS entry
              // exists — falling back to item.description would duplicate the
              // title, which is already item.description.
              const explanation = EXPLANATIONS[item.level]
              const url = `/amber/escalation/L${item.level}`
              return (
                <Link key={item.level} href={url} className="entry">
                  <div className="entry-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${url}/opengraph-image.png`}
                      alt={`L${item.level}`}
                      loading="lazy"
                    />
                  </div>
                  <div className="entry-body">
                    <div className="entry-head">
                      <span className="entry-level">L{item.level}</span>
                      <span className="entry-tier">{tier.name} · {formatDate(item.date)}</span>
                    </div>
                    <div className="entry-title">{item.description}</div>
                    {explanation && <p className="entry-desc">{explanation}</p>}
                  </div>
                </Link>
              )
            })}
          </section>

          <Link href="/amber" className="back-link">
            ← back to amber
          </Link>
        </div>
      </main>
    </>
  )
}
