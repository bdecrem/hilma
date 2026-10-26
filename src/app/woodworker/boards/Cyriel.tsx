// Cyriel and Krul. Cyriel is Bart's drawing (public/woodworker/cyriel/,
// cyriel.svg for the whole figure and head.svg for the badge by the notes);
// each story pose is that drawing with a few props drawn over it in the same
// coordinates. Krul, the puppy, is still a placeholder doodle.
import type { Pose } from '../lib/story'

const INK = '#2b1a12'
const RED = '#c8323c'
/** The drawing's viewBox (the figure plus room either side), shared by the props layer. */
const VIEW = '100 80 440 790'

/** Krul: a sandy puppy with a tail curled like a wood shaving. */
export function Krul({ x = 0, y = 0, s = 1, run = false }: { x?: number; y?: number; s?: number; run?: boolean }) {
  const legs = run ? ['M-9 6l-9 8', 'M-3 7l-4 10', 'M6 7l5 9', 'M11 5l10 6'] : ['M-9 7v9', 'M-3 8v9', 'M6 8v9', 'M11 6v9']
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} className="krul">
      {legs.map((d, i) => (
        <path key={i} d={d} stroke={INK} strokeWidth="4" strokeLinecap="round" />
      ))}
      <path d="M-15 -3c-9-1-12-10-6-13 4-2 8 1 6 5" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="0" cy="0" rx="16" ry="10" fill="#e4c58f" stroke={INK} strokeWidth="3" />
      <circle cx="15" cy="-10" r="10" fill="#e4c58f" stroke={INK} strokeWidth="3" />
      <path d="M10 -19c-7 0-9 9-4 13" fill="#b98844" stroke={INK} strokeWidth="2.5" />
      <circle cx="18" cy="-12" r="1.8" fill={INK} />
      <circle cx="25" cy="-8" r="2.6" fill={INK} />
      <path d="M17 -4c2 2 5 2 6 0" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </g>
  )
}

/** Props per pose, in the drawing's coordinates: the left hand hangs at (206, 592). */
function Props({ pose }: { pose: Pose }) {
  const o = { stroke: INK, strokeWidth: 5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  switch (pose) {
    case 'travel':
      return (
        <g>
          <path d="M184 616v-24h40v24" fill="none" {...o} strokeWidth={7} />
          <rect x="138" y="614" width="128" height="104" rx="12" fill="#b9633f" {...o} />
          <path d="M138 646h128" {...o} strokeWidth={3} opacity=".5" />
          <circle cx="176" cy="680" r="18" fill="#f4ecd4" {...o} strokeWidth={3} />
          <path d="M166 686l10-14 10 14z" fill="#3f6fb0" />
          <rect x="212" y="666" width="40" height="26" rx="4" fill="#ffd84a" {...o} strokeWidth={3} transform="rotate(-8 232 679)" />
        </g>
      )
    case 'chase':
      return (
        <g>
          <path d="M440 120l-6 70M470 140l-24 56" {...o} strokeWidth={9} />
          <circle cx="428" cy="214" r="6" fill={INK} />
          <path d="M160 300h-50M170 360h-60M160 420h-44" {...o} strokeWidth={4} opacity=".6" />
        </g>
      )
    case 'flu':
      return (
        <g>
          <ellipse cx="306" cy="282" rx="15" ry="11" fill="#e8595a" opacity=".75" />
          <path d="M236 116c10-30 118-34 130 0 4 16-26 24-66 24s-70-8-64-24z" fill="#9fd0ff" {...o} />
          <path d="M262 112c14-8 60-10 78-2" stroke="#e6f4ff" strokeWidth={6} strokeLinecap="round" fill="none" />
          <rect x="286" y="68" width="28" height="22" rx="4" fill="#d9ab4e" {...o} strokeWidth={4} />
          <path d="M262 352c26 18 50 18 76 0l8 28c-30 20-62 20-92 0z" fill={RED} {...o} />
          <path d="M318 378l18 90 30-8-22-86" fill={RED} {...o} />
          <path d="M186 600c-16-22 14-38 26-22 14-12 34 6 20 22 12 16-10 32-24 20-12 14-36-4-22-20z" fill="#fffdf6" {...o} strokeWidth={4} />
        </g>
      )
    case 'court':
      return (
        <g>
          <path d="M300 372l-16 18 16 92 16-92z" fill={RED} {...o} />
          <path d="M404 150c-10 16-10 26 0 30 10-4 10-14 0-30z" fill="#9fd0ff" {...o} strokeWidth={3.5} />
          <g transform="rotate(-10 180 560)">
            <rect x="136" y="520" width="80" height="96" fill="#fffdf6" {...o} strokeWidth={4} />
            <path d="M150 546h52M150 566h52M150 586h30" {...o} strokeWidth={3} />
            <circle cx="196" cy="594" r="10" fill="none" stroke={RED} strokeWidth={4} />
          </g>
        </g>
      )
    case 'home':
      return (
        <g>
          <rect x="130" y="600" width="112" height="92" rx="4" fill="#8d5c3b" {...o} />
          <path d="M186 600v92M130 640h112" stroke="#ffd84a" strokeWidth={12} />
          <path d="M186 600c-22-28-46-12-26 2M186 600c22-28 46-12 26 2" fill="none" stroke="#ffd84a" strokeWidth={9} strokeLinecap="round" />
        </g>
      )
    default:
      return null
  }
}

/** Cyriel in one pose (head: just the face, for the badge by the notes). */
export default function Cyriel({ pose, krul = false, head = false }: { pose: Pose; krul?: boolean; head?: boolean }) {
  if (head) return <img className="cyriel-art" src="/woodworker/cyriel/head.svg" alt="" />
  const pup = krul || pose === 'puppy'
  return (
    <span className={`cyriel-art pose-${pose}`}>
      <img src="/woodworker/cyriel/cyriel.svg" alt="" />
      <svg viewBox={VIEW} aria-hidden>
        <Props pose={pose} />
        {pup && <Krul x={pose === 'chase' ? 470 : 456} y={pose === 'chase' ? 800 : 808} s={3.2} run={pose === 'chase'} />}
      </svg>
    </span>
  )
}
