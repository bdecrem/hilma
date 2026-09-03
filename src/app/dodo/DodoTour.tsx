'use client'

import { useEffect, useRef, useState } from 'react'
import { clipFor, scenes, stillFor } from './scenes'

// The tour: every slide is a scene from scripts/dodo-scenes/scenes.json
// (the one list behind the hero, the tour, the App Store shots and the
// video). Assets are exported by `pnpm dodo:capture` into public/dodo/scenes.
// To change the tour, edit the manifest — never this file's slide list.
type Slide = { src: string; video?: boolean; caption: string }

const SLIDES: Slide[] = scenes
  .filter((s) => s.sets.includes('tour'))
  .map((s) => ({ src: clipFor(s) ?? stillFor(s), video: Boolean(clipFor(s)), caption: s.tour }))

// Reading-time hold per slide; the video slide holds for its full run.
function holdFor(slide: Slide): number {
  if (slide.video) return 7400
  return Math.min(7000, Math.max(3200, 2200 + slide.caption.length * 32))
}

export default function DodoTour() {
  const [i, setI] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const slide = SLIDES[i]
    if (slide.video && videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), holdFor(slide))
    return () => clearTimeout(t)
  }, [i])

  const advance = () => setI((n) => (n + 1) % SLIDES.length)

  return (
    <div className="dd-tour" aria-label="A tour of the app">
      <button
        className="dd-tour-phone"
        onClick={advance}
        aria-label="Next screen"
        title="Next"
      >
        {SLIDES.map((s, n) =>
          s.video ? (
            <video
              key={n}
              ref={videoRef}
              className={'dd-tour-slide' + (n === i ? ' dd-tour-on' : '')}
              src={s.src}
              muted
              loop
              playsInline
              preload="auto"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={n}
              className={'dd-tour-slide' + (n === i ? ' dd-tour-on' : '')}
              src={s.src}
              alt={n === i ? s.caption : ''}
            />
          )
        )}
      </button>
      <div className="dd-tour-bar" role="presentation">
        <span style={{ transform: `scaleX(${(i + 1) / SLIDES.length})` }} />
      </div>
      {/* All captions are stacked so the block keeps the height of the
          tallest one — the text swap never shifts the layout. */}
      <div className="dd-tour-captions">
        {SLIDES.map((s, n) => (
          <p
            key={n}
            className={'dd-tour-caption' + (n === i ? ' dd-tour-on' : '')}
            aria-hidden={n !== i}
          >
            {s.caption}
          </p>
        ))}
      </div>
    </div>
  )
}
