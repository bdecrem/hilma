import Link from 'next/link'
import { OVERVIEW_ROWS, TAKEAWAYS, type Room } from '@/lib/osai/overview'

function Gauge({ room, label }: { room: Room; label: string }) {
  return (
    <span className="gcell">
      <span className="gauge" role="img" aria-label={`${room} of 5, ${label}`}>
        {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= room ? 'on' : ''} />)}
      </span>
      <span className="gauge-label">{label}</span>
    </span>
  )
}

export default function Overview() {
  return (
    <article className="osai-ov">
      <div className="eyebrow">Public benefit AI, in one picture</div>
      <h1 style={{ marginTop: 8 }}>Where is there room to work?</h1>
      <p className="lede">
        Public-benefit AI is everything built to make AI serve the public rather than a private return. It comes in eight kinds of work. Each row shows how much room is left in one of them, and whether Mozilla or Stanford HAI already works there. Most room first.
      </p>
      <Link href="/osai/details" className="detail-card">
        <span className="detail-card-text">The full map: every organization, the money, the sources.</span>
        <span className="detail-card-go">Open →</span>
      </Link>
      <div className="legend">
        <span className="item"><span className="gauge" aria-hidden="true"><i className="on" /><i className="on" /><i className="on" /><i className="on" /><i className="on" /></span> wide open</span>
        <span className="item"><span className="gauge" aria-hidden="true"><i className="on" /><i /><i /><i /><i /></span> packed</span>
        <span className="item"><span className="mark m">M</span> Mozilla is already here</span>
        <span className="item"><span className="mark h">H</span> Stanford HAI is already here</span>
      </div>

      <div className="rows" role="list">
        {OVERVIEW_ROWS.map((r, i) => (
          <Link key={r.box} href={`/osai/details#box-${r.box}`} className="row" role="listitem">
            <span className="rank">{i + 1}</span>
            <span className="text">
              <span className="name">{r.name} <span className="tag">{r.tier}</span></span>
              <p className="why">{r.why}</p>
              <p className="eg">For example: {r.examples}</p>
            </span>
            <Gauge room={r.room} label={r.label} />
            <span className="who">
              {r.mozilla !== 'no' && <span className="mark m">M</span>}
              {r.mozilla === 'barely' && <span className="faint">barely</span>}
              {r.hai && <span className="mark h">H</span>}
              {r.mozilla === 'no' && !r.hai && <span className="faint" style={{ fontStyle: 'italic' }}>neither</span>}
            </span>
          </Link>
        ))}
      </div>

      <div className="takes" aria-label="Three takeaways">
        {TAKEAWAYS.map((t) => (
          <div key={t.title} className="take">
            <h3>{t.title}</h3>
            <p>{t.text}</p>
          </div>
        ))}
      </div>

      <p className="eyebrow" style={{ marginTop: 32 }}>As of 2 Oct 2026</p>
    </article>
  )
}
