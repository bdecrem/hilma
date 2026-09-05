'use client'

// The signature: a 16-step LED strip showing a track's kick / snare / hat
// pattern. Static on cards; on the transport the current step is ringed as
// the loop plays. `chase` puts one idle LED walking across (hero only).

import type { Strip } from './api'

const EMPTY: Strip = { k: '0'.repeat(16), s: '0'.repeat(16), h: '0'.repeat(16) }

export default function LedStrip({ strip, step, big, chase, className = '' }: {
  strip?: Strip | null
  /** Current 16th within the bar (0-15) while playing. */
  step?: number | null
  big?: boolean
  chase?: boolean
  className?: string
}) {
  const s = strip || EMPTY
  const rows: [keyof Strip, string][] = [['k', s.k], ['s', s.s], ['h', s.h]]
  return (
    <div className={`jb-strip ${big ? 'big' : ''} ${chase ? 'jb-chase' : ''} ${className}`.trim()} aria-hidden>
      {rows.map(([name, bits]) => (
        <div key={name} className={`jb-strip-row ${name}`}>
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className={`jb-strip-cell${bits[i] === '1' ? ' hit' : ''}${step === i ? ' now' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  )
}
