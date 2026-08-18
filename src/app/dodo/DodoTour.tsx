'use client'

import { useEffect, useRef, useState } from 'react'

// The tour: every slide is a real screenshot from the app, captioned with
// Bart's script. The last beat is a 7s screen recording of the daily card
// arriving over iMessage.
type Slide = { src: string; video?: boolean; caption: string }

const SLIDES: Slide[] = [
  { src: '/dodo/tour/s1677.png', caption: 'Meet Dodo.' },
  {
    src: '/dodo/tour/s1678.png',
    caption:
      'Start a new topic with just a chat, or by sharing a link to a YouTube video, or uploading an article or book.',
  },
  { src: '/dodo/tour/s1679.png', caption: 'Talk it through — text or voice.' },
  { src: '/dodo/tour/s1680.png', caption: 'Talk it through — text or voice.' },
  {
    src: '/dodo/tour/s1681.png',
    caption:
      'Generate flash cards. You can describe how many, what the focus should be — and edit, add or delete at any time.',
  },
  {
    src: '/dodo/tour/s1682.png',
    caption:
      'Flash cards have multiple choice, typed responses, or voice mode, along with a hybrid mode.',
  },
  {
    src: '/dodo/tour/s1683.png',
    caption:
      'Flash cards have multiple choice, typed responses, or voice mode, along with a hybrid mode.',
  },
  {
    src: '/dodo/tour/s1684.png',
    caption:
      "Create your own artifacts to go with a topic — key quotes, dates and more, for easy viewing. They're also shown as part of the flash card sets.",
  },
  {
    src: '/dodo/tour/s1685.png',
    caption:
      "Once you've completed the flash card sets, you can do a final review — an oral exam. You can let the AI agent drive the conversation or set your own format.",
  },
  { src: '/dodo/tour/s1686.png', caption: 'But you need an A to pass.' },
  {
    src: '/dodo/tour/s1687.png',
    caption:
      "After two tries, you're offered a Second Chance: three questions. If you ace them, you pass.",
  },
  {
    src: '/dodo/tour/s1688.png',
    caption:
      "In agent mode, you take control and tell the agent what you want to change. Make a new batch of flash cards, skip the flash cards entirely… or just give you an A already. Hey, you're in charge.",
  },
  {
    src: '/dodo/tour/s1689.png',
    caption:
      "Optional refresher: after 30, 60, 90 days, you'll take a short refresher test to keep your status on that topic.",
  },
  {
    src: '/dodo/tour/s1690.png',
    caption:
      'Peck Mode is a flash card game across all your topics. You can take the sets in multiple choice, text or voice modes.',
  },
  {
    src: '/dodo/tour/s1691.png',
    caption: 'You can control which of your topics are included.',
  },
  { src: '/dodo/tour/s1690.png', caption: "Don't forget to tickle Dodo." },
  { src: '/dodo/tour/s1692.png', caption: 'Levels, settings and stuff.' },
  {
    src: '/dodo/tour/daily.mp4',
    video: true,
    caption: 'A daily mini-quiz over iMessage, linked to your Peck Mode game.',
  },
]

// Reading-time hold per slide; the video slide holds for its full 7s run.
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
