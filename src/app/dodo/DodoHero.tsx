'use client'

import { useEffect, useRef, useState } from 'react'
import DodoMascot from './DodoMascot'
import { Line, Screen, frameCss } from './DodoFrame'
import { clipFor, clipSeconds, heroScenes, isClip, stillFor } from './scenes'

// The hero: six beats from the manifest's `hero` list, each a scene, a
// line and a bird reaction, looping in about thirty seconds. Stills push in
// slowly toward their focus; clips play through. Click or tap advances,
// the dots jump. Reduced motion: no auto-advance, no push, no crossfade.

const holdFor = (s: (typeof heroScenes)[number]) => (isClip(s) ? clipSeconds(s) * 1000 + 400 : 4600)

export default function DodoHero() {
  const n = heroScenes.length
  const [i, setI] = useState(0)
  const [key, setKey] = useState(0)
  const [reduce, setReduce] = useState(false)
  const videos = useRef<Record<string, HTMLVideoElement | null>>({})
  const scene = heroScenes[i]

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const on = () => setReduce(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const go = (to: number) => {
    setI(((to % n) + n) % n)
    setKey((k) => k + 1)
  }

  useEffect(() => {
    const v = videos.current[scene.id]
    if (v) {
      v.currentTime = 0
      v.play().catch(() => {})
    }
    if (reduce) return
    const t = setTimeout(() => go(i + 1), holdFor(scene))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, key, reduce])

  return (
    <section className="dh df" aria-label="What Dodo does">
      <style>{frameCss + heroCss}</style>
      <div className="dh-stage">
        <div className="dh-bloom" aria-hidden="true" />
        <button className="dh-phone" onClick={() => go(i + 1)} aria-label="Next" title="Next">
          {heroScenes.map((s, k) => (
            <div key={s.id} className={'dh-slide' + (k === i ? ' on' : '')} aria-hidden={k !== i}>
              <Screen scene={s} className="dh-screen" push={k === i && !reduce} hold={holdFor(s)}>
                {clipFor(s) && (
                  <video
                    ref={(el) => { videos.current[s.id] = el }}
                    className="dh-clip"
                    src={clipFor(s) ?? undefined}
                    poster={stillFor(s)}
                    muted
                    playsInline
                    loop
                    preload="auto"
                  />
                )}
              </Screen>
            </div>
          ))}
        </button>
        <div className="dh-bird" aria-hidden="true">
          <DodoMascot size={116} beat={scene.bird} beatKey={key} />
        </div>
      </div>
      <div className="dh-copy">
        <div className="dh-words" key={scene.id}>
          <h2 className="dh-line"><Line text={scene.line} /></h2>
          <p className="dh-sub">{scene.tour}</p>
        </div>
        <div className="dh-dots" role="tablist" aria-label="Beats">
          {heroScenes.map((s, k) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={k === i}
              aria-label={s.id}
              className={k === i ? 'on' : ''}
              onClick={() => go(k)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

const heroCss = `
.dh { overflow: visible; background: transparent; display: grid; grid-template-columns: 318px 1fr; gap: 18px 28px;
  align-items: center; margin: 0 0 52px; }
.dh-stage { position: relative; width: 318px; height: 512px; }
.dh-bloom { position: absolute; inset: -30px -40px; pointer-events: none;
  background: radial-gradient(ellipse 58% 52% at 56% 50%, var(--peach) 0%, transparent 70%); }
.dh-phone { position: absolute; left: 82px; top: 0; width: 226px; aspect-ratio: 1260 / 2736; padding: 0; border: 0;
  background: transparent; cursor: pointer; border-radius: 30px; }
.dh-phone:focus-visible { outline: 3px solid var(--marigold); outline-offset: 4px; }
.dh-slide { position: absolute; inset: 0; opacity: 0; transition: opacity 0.6s ease; }
.dh-slide.on { opacity: 1; }
.dh-screen { width: 100%; height: 100%; border-radius: 30px; }
.dh-clip { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.dh-bird { position: absolute; left: 0; bottom: -6px; width: 116px; height: 126px; overflow: hidden; }
.dh-bird svg { display: block; }
.dh-copy { min-width: 0; }
.dh-words { animation: dh-in 0.5s ease both; }
.dh-line { font-family: var(--display); font-weight: 600; font-size: clamp(28px, 5.4vw, 36px); line-height: 1.1;
  letter-spacing: -0.015em; color: var(--ink); margin: 0 0 12px; text-wrap: balance; }
.dh-line em { font-style: normal; color: var(--marigold-deep); }
.dh-sub { font-family: var(--body); font-size: 16px; line-height: 1.5; color: var(--ink2); margin: 0; max-width: 34ch; }
.dh-dots { display: flex; gap: 6px; margin-top: 22px; }
.dh-dots button { width: 24px; height: 4px; border-radius: 2px; border: 0; padding: 0; background: var(--surface2); cursor: pointer; }
.dh-dots button.on { background: var(--marigold); }
.dh-dots button:focus-visible { outline: 2px solid var(--marigold); outline-offset: 3px; }
@keyframes dh-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@media (max-width: 660px) {
  .dh { grid-template-columns: 1fr; justify-items: center; text-align: center; gap: 22px; margin-bottom: 40px; }
  .dh-copy { order: -1; }
  .dh-sub { margin: 0 auto; }
  .dh-dots { justify-content: center; }
  .dh-stage { width: 300px; height: 486px; }
  .dh-phone { left: 76px; width: 214px; }
  .dh-bird { width: 108px; height: 118px; }
}
@media (prefers-reduced-motion: reduce) {
  .dh-slide, .dh-words { transition: none; animation: none; }
}
`
