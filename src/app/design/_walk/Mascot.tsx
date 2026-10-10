'use client'

import { createContext, useContext, useId } from 'react'

export type Theme = 'arcade' | 'candy' | 'sticker'
export type Mood = 'idle' | 'talking' | 'listening' | 'happy'

const ThemeCtx = createContext<Theme>('candy')
export const ThemeProvider = ThemeCtx.Provider

/* One mascot per theme, all three on the same motion hooks (.m-head,
   .m-crest, .m-eye, .m-pupil, .m-beak-low) and the same --m-* color
   tokens, so the screens never know which one they got. */
export function Mascot({ mood = 'idle', size = 120 }: { mood?: Mood; size?: number }) {
  const theme = useContext(ThemeCtx)
  const cls = `w-mascot ${mood}`
  if (theme === 'arcade') return <PixelParrot cls={cls} size={size} />
  if (theme === 'sticker') return <StickerParrot cls={cls} size={size} />
  return <JellyParrot cls={cls} size={size} />
}

/* ---- arcade: a 12x12 pixel parrot ---- */
const GRID = [
  '....C.C.....',
  '...CCCC.....',
  '...RRRRR....',
  '..RRRRRRR...',
  '.RRRRRWWRB..',
  '.RRRRRWKRBB.',
  '.RRRRRRRRb..',
  '.RPPRRRRR...',
  '.RPPRRRR....',
  '..RRRRR.....',
  '...RRR......',
  '............',
]
const PX: Record<string, string> = {
  C: 'var(--m-crest)',
  R: 'var(--m-body)',
  P: 'var(--m-cheek)',
  W: 'var(--m-eye)',
  K: 'var(--m-pupil)',
  B: 'var(--m-beak)',
  b: 'var(--m-beak-low, var(--m-beak))',
}
function cells(chars: string) {
  const out: { x: number; y: number; c: string }[] = []
  GRID.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (chars.includes(row[x])) out.push({ x, y, c: row[x] })
  })
  return out
}
function PixelParrot({ cls, size }: { cls: string; size: number }) {
  const rect = (p: { x: number; y: number; c: string }) => <rect key={`${p.x}-${p.y}`} x={p.x * 10} y={p.y * 10} width="10" height="10" fill={PX[p.c]} />
  return (
    <svg className={`${cls} pixel`} width={size} height={size} viewBox="0 0 120 120" shapeRendering="crispEdges" aria-hidden>
      <g className="m-crest">{cells('C').map(rect)}</g>
      <g className="m-head">
        {cells('RP').map(rect)}
        <g className="m-eye">
          {cells('W').map(rect)}
          <g className="m-pupil">{cells('K').map(rect)}</g>
        </g>
        {cells('B').map(rect)}
        <g className="m-beak-low">{cells('b').map(rect)}</g>
      </g>
    </svg>
  )
}

/* ---- candy: a gummy parrot with a gloss ---- */
function JellyParrot({ cls, size }: { cls: string; size: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={`${cls} jelly`} width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <defs>
        <radialGradient id={`${id}b`} cx="35%" cy="28%" r="80%">
          <stop offset="0" style={{ stopColor: 'var(--m-body-hi)' }} />
          <stop offset="1" style={{ stopColor: 'var(--m-body)' }} />
        </radialGradient>
        <radialGradient id={`${id}c`} cx="40%" cy="20%" r="90%">
          <stop offset="0" style={{ stopColor: 'var(--m-crest-hi)' }} />
          <stop offset="1" style={{ stopColor: 'var(--m-crest)' }} />
        </radialGradient>
        <radialGradient id={`${id}k`} cx="40%" cy="25%" r="85%">
          <stop offset="0" style={{ stopColor: 'var(--m-beak-hi)' }} />
          <stop offset="1" style={{ stopColor: 'var(--m-beak)' }} />
        </radialGradient>
      </defs>
      <ellipse cx="62" cy="112" rx="34" ry="6" fill="var(--m-shadow)" />
      <g className="m-crest">
        <ellipse cx="34" cy="34" rx="8" ry="18" transform="rotate(-38 34 34)" fill={`url(#${id}c)`} />
        <ellipse cx="48" cy="23" rx="8" ry="20" transform="rotate(-14 48 23)" fill={`url(#${id}c)`} />
        <ellipse cx="62" cy="25" rx="7" ry="17" transform="rotate(12 62 25)" fill={`url(#${id}c)`} />
      </g>
      <g className="m-head">
        <circle cx="62" cy="66" r="42" fill={`url(#${id}b)`} />
        <ellipse cx="46" cy="44" rx="14" ry="8" transform="rotate(-30 46 44)" fill="#fff" opacity="0.55" />
        <circle cx="40" cy="82" r="10" fill="var(--m-cheek)" opacity="0.9" />
        <g className="m-eye">
          <ellipse cx="74" cy="58" rx="16" ry="18" fill="var(--m-eye)" />
          <circle className="m-pupil" cx="77" cy="60" r="8" fill="var(--m-pupil)" />
          <circle cx="80" cy="56" r="3" fill="#fff" />
          <circle cx="73" cy="64" r="1.6" fill="#fff" />
        </g>
        <path d="M88 64 C106 62 112 78 103 93 C99 86 93 81 86 79 Z" fill={`url(#${id}k)`} />
        <path className="m-beak-low" d="M86 79 C93 81 99 86 103 93 C96 95 90 93 85 88 Z" fill="var(--m-beak-lo)" />
      </g>
    </svg>
  )
}

/* ---- sticker: flat fills, fat outline, a white die-cut edge ---- */
function StickerParrot({ cls, size }: { cls: string; size: number }) {
  const shapes = (stroke: string, width: number, fill: boolean) => (
    <>
      <ellipse cx="34" cy="34" rx="7" ry="17" transform="rotate(-38 34 34)" fill={fill ? 'var(--m-crest)' : '#fff'} stroke={stroke} strokeWidth={width} />
      <ellipse cx="48" cy="24" rx="7" ry="19" transform="rotate(-14 48 24)" fill={fill ? 'var(--m-crest)' : '#fff'} stroke={stroke} strokeWidth={width} />
      <ellipse cx="62" cy="26" rx="6" ry="16" transform="rotate(12 62 26)" fill={fill ? 'var(--m-crest)' : '#fff'} stroke={stroke} strokeWidth={width} />
      <circle cx="62" cy="66" r="40" fill={fill ? 'var(--m-body)' : '#fff'} stroke={stroke} strokeWidth={width} />
      <path d="M88 64 C106 62 111 78 102 92 C98 85 92 80 86 78 Z" fill={fill ? 'var(--m-beak)' : '#fff'} stroke={stroke} strokeWidth={width} strokeLinejoin="round" />
    </>
  )
  return (
    <svg className={`${cls} sticker`} width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <g className="m-cut">{shapes('#fff', 14, false)}</g>
      <g className="m-crest">
        <ellipse cx="34" cy="34" rx="7" ry="17" transform="rotate(-38 34 34)" fill="var(--m-crest)" stroke="var(--m-outline)" strokeWidth="3.5" />
        <ellipse cx="48" cy="24" rx="7" ry="19" transform="rotate(-14 48 24)" fill="var(--m-crest)" stroke="var(--m-outline)" strokeWidth="3.5" />
        <ellipse cx="62" cy="26" rx="6" ry="16" transform="rotate(12 62 26)" fill="var(--m-crest)" stroke="var(--m-outline)" strokeWidth="3.5" />
      </g>
      <g className="m-head">
        <circle cx="62" cy="66" r="40" fill="var(--m-body)" stroke="var(--m-outline)" strokeWidth="3.5" />
        <circle cx="40" cy="80" r="8" fill="var(--m-cheek)" />
        <g className="m-eye">
          <ellipse cx="74" cy="58" rx="15" ry="17" fill="var(--m-eye)" stroke="var(--m-outline)" strokeWidth="3" />
          <circle className="m-pupil" cx="77" cy="60" r="7" fill="var(--m-pupil)" />
          <circle cx="80" cy="57" r="2.4" fill="#fff" />
        </g>
        <path d="M88 64 C106 62 111 78 102 92 C98 85 92 80 86 78 Z" fill="var(--m-beak)" stroke="var(--m-outline)" strokeWidth="3.5" strokeLinejoin="round" />
        <path className="m-beak-low" d="M86 78 C92 80 98 85 102 92 C95 94 89 92 85 87 Z" fill="var(--m-beak-lo)" stroke="var(--m-outline)" strokeWidth="3" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
