'use client'

import type { CSSProperties, ReactNode } from 'react'
import DodoMascot from './DodoMascot'
import { SCREEN, heroScenes, lineRuns, stillFor, type Scene } from './scenes'

// The frame: the one way the app is shown everywhere. Four things composed
// the same way — the ground (butter paper, slate ink in dark), the
// bezel-less screen, the bird at the screen's foot, and one Fredoka line
// with a single marigold word. The live hero (DodoHero) uses the same
// primitives; the static formats below are what /dodo/scene/[id] renders
// for Playwright to screenshot (App Store, video frames, feature cards,
// the README strip).

/** "It writes your **flash cards.**" → runs, the marked one in marigold. */
export function Line({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {lineRuns(text).map((r, i) => (r.em ? <em key={i}>{r.text}</em> : <span key={i}>{r.text}</span>))}
    </span>
  )
}

/**
 * The screen. Full frame by default; `crop` renders the scene's focus
 * window at screen width instead (a shorter card, the moment and nothing
 * else). `push` runs a slow zoom toward the focus (or the centre) over
 * `hold` ms — the hero's Ken Burns.
 */
export function Screen({
  scene,
  crop = false,
  push = false,
  hold = 4600,
  className = '',
  style,
  children,
}: {
  scene: Scene
  crop?: boolean
  push?: boolean
  hold?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const [sw, sh] = SCREEN
  const f = crop && scene.focus ? scene.focus : null
  const aspect = f ? `${sw * f.w} / ${sh * f.h}` : `${sw} / ${sh}`
  const img: CSSProperties = f
    ? { position: 'absolute', width: `${100 / f.w}%`, height: 'auto', left: `${(-f.x / f.w) * 100}%`, top: `${(-f.y / f.h) * 100}%` }
    : {}
  if (!f && scene.focus) {
    img.transformOrigin = `${(scene.focus.x + scene.focus.w / 2) * 100}% ${(scene.focus.y + scene.focus.h / 2) * 100}%`
  }
  if (push !== undefined) {
    img.transitionDuration = `${hold}ms`
    ;(img as Record<string, string>)['--push'] = scene.focus ? '1.12' : '1.05'
  }
  return (
    <div className={`df-screen ${className}`} style={{ aspectRatio: aspect, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={'df-img' + (push ? ' df-img-push' : '')} src={stillFor(scene)} alt={scene.tour} style={img} draggable={false} />
      {children}
    </div>
  )
}

export type Format = 'appstore-6.9' | 'appstore-6.5' | 'story' | 'story-title' | 'story-outro' | 'card' | 'wide' | 'wide-title' | 'wide-outro' | 'strip'
export type Kind = 'portrait' | 'card' | 'strip' | 'title' | 'outro'
/** `set` = which manifest set the format walks; null formats render once. */
export const FORMATS: Record<Format, { w: number; h: number; kind: Kind; set: string | null }> = {
  'appstore-6.9': { w: 1320, h: 2868, kind: 'portrait', set: 'appstore' },
  'appstore-6.5': { w: 1284, h: 2778, kind: 'portrait', set: 'appstore' },
  story: { w: 1080, h: 1920, kind: 'portrait', set: 'video' },
  'story-title': { w: 1080, h: 1920, kind: 'title', set: null },
  'story-outro': { w: 1080, h: 1920, kind: 'outro', set: null },
  card: { w: 1600, h: 900, kind: 'card', set: 'hero' },
  wide: { w: 1920, h: 1080, kind: 'card', set: 'video' },
  'wide-title': { w: 1920, h: 1080, kind: 'title', set: null },
  'wide-outro': { w: 1920, h: 1080, kind: 'outro', set: null },
  strip: { w: 1600, h: 640, kind: 'strip', set: null },
}
/** Export layers: the whole frame, the ground alone (no screen, no bird), or the bird alone on transparent. */
export type Layer = 'all' | 'bg' | 'bird'
export type ScreenRect = { left: number; top: number; width: number; height: number; radius: number }

const SCREEN_RATIO = SCREEN[1] / SCREEN[0]

/** Where the bird's feet sit inside its own box (viewBox -66…68, feet at 58). */
const FEET = (58 + 66) / 134
const BIRD_H = 134 / 124

function Bird({ size, beat, left, feetY, still = 0.55 }: { size: number; beat: Scene['bird']; left: number; feetY: number; still?: number }) {
  const h = size * BIRD_H
  return (
    <div className="df-bird" style={{ position: 'absolute', left, top: feetY - h * FEET, width: size, height: h }}>
      <DodoMascot size={size} beat={beat} still={still} />
    </div>
  )
}

/**
 * A static frame at exact pixel size, for exports. The root carries
 * `data-screen` (the screen's rect) so the video assembler can drop a clip
 * exactly where the still sits; `layer` splits the frame for that.
 */
export default function DodoFrame({ scene, format, theme = 'light', layer = 'all' }: { scene: Scene; format: Format; theme?: 'light' | 'dark'; layer?: Layer }) {
  const spec = FORMATS[format]
  const { w: W, h: H } = spec
  const u = W / 100
  const showScreen = layer === 'all'
  const showGround = layer !== 'bird'
  const showBird = layer !== 'bg'
  const rootStyle = (extra: CSSProperties): CSSProperties =>
    layer === 'bird' ? { ...extra, background: 'transparent' } : extra
  const rectAttr = (r: ScreenRect) => JSON.stringify({ ...r, w: W, h: H })

  if (spec.kind === 'title' || spec.kind === 'outro') {
    // Sized off the short side so the card reads the same in 9:16 and 16:9.
    const base = Math.min(W, H)
    const bird = base * 0.36
    const feet = H * 0.5
    return (
      <div className="df df-title" data-theme={theme} data-screen={rectAttr({ left: 0, top: 0, width: 0, height: 0, radius: 0 })} style={rootStyle({ width: W, height: H })}>
        {showGround && <div className="df-bloom" style={{ left: W / 2 - base * 0.6, top: feet - base * 0.7, width: base * 1.2, height: base * 1.2 }} />}
        {showBird && <Bird size={bird} beat={spec.kind === 'outro' ? 'cheer' : 'idle'} left={(W - bird) / 2} feetY={feet} still={0.5} />}
        {showGround && (
          <>
            <div className="df-word" style={{ top: H * 0.5 + base * 0.045, fontSize: base * 0.17 }}>dodo</div>
            <div className={spec.kind === 'outro' ? 'df-tag df-tag-site' : 'df-tag'} style={{ top: H * 0.5 + base * 0.185, fontSize: spec.kind === 'outro' ? base * 0.062 : base * 0.052 }}>
              {spec.kind === 'outro' ? 'dodogo.cc' : 'Learn anything.'}
            </div>
          </>
        )}
      </div>
    )
  }

  if (spec.kind === 'portrait') {
    const lineTop = 7 * u
    const stageTop = 25 * u
    const bottomPad = 12 * u
    const fullH = H - stageTop - bottomPad
    const sw = Math.min(74 * u, fullH / SCREEN_RATIO)
    const f = scene.focus
    const sh = f ? sw * ((SCREEN[1] * f.h) / (SCREEN[0] * f.w)) : sw * SCREEN_RATIO
    // A focus card sits a little above centre so the line and the card read as one group.
    const top = f ? stageTop + Math.max(0, (fullH - sh) * 0.36) : stageTop
    const left = (W - sw) / 2
    const bird = sw * 0.36
    // On a focus card the bird stands further out so it covers less of the moment.
    const birdLeft = left - bird * (f ? 0.66 : 0.42)
    const rect = { left, top, width: sw, height: sh, radius: sw * 0.13 }
    return (
      <div className="df df-portrait" data-theme={theme} data-screen={rectAttr(rect)} style={rootStyle({ width: W, height: H, fontSize: 6.1 * u })}>
        {showGround && <div className="df-bloom" style={{ left: left + sw / 2 - sw, top: top + sh / 2 - sw, width: sw * 2, height: sw * 2 }} />}
        {showGround && (
          <div className="df-line" style={{ top: lineTop, left: 8 * u, right: 8 * u }}>
            <Line text={scene.line} />
          </div>
        )}
        {showScreen && <Screen scene={scene} crop style={{ position: 'absolute', left, top, width: sw, borderRadius: rect.radius }} />}
        {showBird && <Bird size={bird} beat={scene.bird} left={birdLeft} feetY={top + sh - sw * 0.015} />}
      </div>
    )
  }

  if (spec.kind === 'card') {
    const ph = H * 0.82
    const pw = ph / SCREEN_RATIO
    const pLeft = W - W * 0.08 - pw
    const pTop = (H - ph) / 2
    const bird = pw * 0.42
    const bLeft = pLeft - bird * 0.45
    const copyLeft = W * 0.07
    const copyW = bLeft - 60 - copyLeft
    const rect = { left: pLeft, top: pTop, width: pw, height: ph, radius: pw * 0.13 }
    return (
      <div className="df df-card" data-theme={theme} data-screen={rectAttr(rect)} style={rootStyle({ width: W, height: H })}>
        {showGround && <div className="df-bloom" style={{ left: pLeft + pw / 2 - pw * 1.3, top: pTop + ph / 2 - pw * 1.3, width: pw * 2.6, height: pw * 2.6 }} />}
        {showGround && (
          <div className="df-card-copy" style={{ left: copyLeft, width: copyW, top: 0, bottom: 0 }}>
            <div className="df-line" style={{ position: 'static', fontSize: W * 0.046 }}>
              <Line text={scene.line} />
            </div>
            <p className="df-sub" style={{ fontSize: W * 0.017 }}>{scene.tour}</p>
          </div>
        )}
        {showGround && <div className="df-site" style={{ left: copyLeft, bottom: H * 0.08, fontSize: W * 0.015 }}>dodogo.cc</div>}
        {showScreen && <Screen scene={scene} style={{ position: 'absolute', left: pLeft, top: pTop, width: pw, borderRadius: rect.radius }} />}
        {showBird && <Bird size={bird} beat={scene.bird} left={bLeft} feetY={pTop + ph - pw * 0.015} />}
      </div>
    )
  }

  // strip: the hero set in a row, for the repo README.
  const n = heroScenes.length
  const ph = H * 0.72
  const pw = ph / SCREEN_RATIO
  const gap = 26
  const total = n * pw + (n - 1) * gap
  const x0 = (W - total) / 2
  const top = 40
  const bird = pw * 0.38
  return (
    <div className="df df-strip" data-theme={theme} data-screen={rectAttr({ left: x0, top, width: pw, height: ph, radius: pw * 0.13 })} style={{ width: W, height: H }}>
      {heroScenes.map((s, i) => {
        const left = x0 + i * (pw + gap)
        return (
          <div key={s.id}>
            <Screen scene={s} style={{ position: 'absolute', left, top, width: pw, borderRadius: pw * 0.13 }} />
            <div className="df-strip-line" style={{ left, top: top + ph + 16, width: pw, fontSize: 17 }}>
              <Line text={s.line} />
            </div>
          </div>
        )
      })}
      <Bird size={bird} beat="idle" left={x0 - bird * 0.42} feetY={top + ph - pw * 0.015} />
    </div>
  )
}

export const frameCss = `
.df {
  --paper: #FBF5E6; --surface: #FFFDF7; --surface2: #F2EAD6; --border: #E3D9C2;
  --ink: #33383E; --ink2: #606C75; --ink3: #939DA5;
  --marigold: #DD9420; --marigold-deep: #B97A14; --slate: #6A8FA3; --peach: #FCE5D0;
  --shadow: rgba(62,51,36,0.16);
  --display: var(--font-fredoka), 'Fredoka', system-ui, sans-serif;
  --body: var(--font-nunito), 'Nunito', 'Avenir Next', system-ui, sans-serif;
  position: relative; overflow: hidden; background: var(--paper); color: var(--ink);
  font-family: var(--body); box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  .df:not([data-theme="light"]) {
    --paper: #14191D; --surface: #202830; --surface2: #2B343D; --border: #333E48;
    --ink: #F7F0DE; --ink2: #A0ACB4; --ink3: #64717B;
    --marigold: #F0A830; --marigold-deep: #F6C46A; --slate: #8FB0C4; --peach: #243038;
    --shadow: rgba(0,0,0,0.45);
  }
}
.df[data-theme="dark"] {
  --paper: #14191D; --surface: #202830; --surface2: #2B343D; --border: #333E48;
  --ink: #F7F0DE; --ink2: #A0ACB4; --ink3: #64717B;
  --marigold: #F0A830; --marigold-deep: #F6C46A; --slate: #8FB0C4; --peach: #243038;
  --shadow: rgba(0,0,0,0.45);
}
.df * { box-sizing: border-box; }
.df-bloom { position: absolute; pointer-events: none; border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, var(--peach) 0%, transparent 62%); }
.df-screen { position: relative; overflow: hidden; background: var(--surface2);
  border: 1px solid var(--border); box-shadow: 0 18px 40px var(--shadow); border-radius: 28px; }
.df-img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top;
  transform: scale(1); transform-origin: 50% 42%; transition-property: transform; transition-timing-function: linear; }
.df-img-push { transform: scale(var(--push, 1.05)); }
.df-line { position: absolute; text-align: center; font-family: var(--display); font-weight: 600;
  line-height: 1.1; letter-spacing: -0.015em; color: var(--ink); text-wrap: balance; }
.df-line em { font-style: normal; color: var(--marigold-deep); }
.df-sub { font-family: var(--body); color: var(--ink2); line-height: 1.45; margin: 0.6em 0 0; }
.df-card-copy { position: absolute; display: flex; flex-direction: column; justify-content: center; text-align: left; }
.df-card-copy .df-line { text-align: left; }
.df-site { position: absolute; font-family: var(--display); font-weight: 600; color: var(--marigold-deep); letter-spacing: 0.01em; }
.df-strip-line { position: absolute; text-align: center; font-family: var(--display); font-weight: 500; line-height: 1.2; color: var(--ink); }
.df-strip-line em { font-style: normal; color: var(--marigold-deep); }
.df-word { position: absolute; left: 0; right: 0; text-align: center; font-family: var(--display); font-weight: 600;
  letter-spacing: -0.02em; line-height: 1; color: var(--ink); }
.df-tag { position: absolute; left: 0; right: 0; text-align: center; font-family: var(--display); font-weight: 500; line-height: 1; color: var(--ink2); }
.df-tag-site { font-weight: 600; color: var(--marigold-deep); }
.df-bird { pointer-events: none; }
.df-bird svg { display: block; }
@media (prefers-reduced-motion: reduce) { .df-img { transition: none; } .df-img-push { transform: none; } }
`
