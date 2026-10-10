'use client'

export type Mood = 'idle' | 'talking' | 'listening' | 'happy'

/* The placeholder mascot: a parrot, because a parrot says things back.
   Geometric on purpose so a designer can redraw it without losing the
   states (idle / talking / listening / happy), which the screens depend on. */
export function Parrot({ mood = 'idle', size = 120 }: { mood?: Mood; size?: number }) {
  return (
    <svg className={`p2-parrot ${mood}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <g className="p2-crest">
        <ellipse cx="34" cy="34" rx="7" ry="17" transform="rotate(-38 34 34)" fill="var(--p-blue)" />
        <ellipse cx="48" cy="24" rx="7" ry="19" transform="rotate(-14 48 24)" fill="var(--p-blue)" />
        <ellipse cx="62" cy="26" rx="6" ry="16" transform="rotate(12 62 26)" fill="var(--p-blue)" />
      </g>
      <g className="p2-head">
        <circle cx="62" cy="66" r="40" fill="var(--p-red)" />
        <circle cx="40" cy="80" r="9" fill="#ff8a6a" />
        <g className="p2-eye">
          <ellipse cx="74" cy="58" rx="15" ry="17" fill="#fff" />
          <circle className="p2-pupil" cx="77" cy="60" r="7" fill="var(--p-ink)" />
          <circle cx="80" cy="57" r="2.4" fill="#fff" />
        </g>
        <path className="p2-beak-top" d="M88 64 C106 62 111 78 102 92 C98 85 92 80 86 78 Z" fill="var(--p-yellow)" />
        <path className="p2-beak-low" d="M86 78 C92 80 98 85 102 92 C95 94 89 92 85 87 Z" fill="#e2a600" />
      </g>
    </svg>
  )
}
