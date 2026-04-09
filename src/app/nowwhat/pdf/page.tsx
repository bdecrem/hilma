'use client'

import { useEffect, useRef } from 'react'

const COLS = 26
const ROWS = 10

type Grid = number[][]

function mk(fn: (c: number, r: number) => boolean): Grid {
  const g: Grid = []
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = []
    for (let c = 0; c < COLS; c++) row.push(fn(c, r) ? 1 : 0)
    g.push(row)
  }
  return g
}

function personAt(g: Grid, cx: number, f: number) {
  const p = [[0,1,0],[0,1,0],[1,1,1],[0,1,0],[1,0,1]]
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 3; c++)
      if (p[r][c]) {
        const gr = f - 4 + r, gc = cx - 1 + c
        if (gr >= 0 && gr < ROWS && gc >= 0 && gc < COLS) g[gr][gc] = 1
      }
}

// "Holding hands" shape from production
const HOLDING_HANDS: Grid = (() => {
  const g = mk(() => false)
  personAt(g, 10, 9)
  personAt(g, 16, 9)
  g[6][12] = 1; g[6][13] = 1; g[6][14] = 1
  return g
})()

export default function PdfPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const CELL = 8
    const W = COLS * CELL
    const H = ROWS * CELL
    canvas.width = W
    canvas.height = H

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    const FILLS = ['solid', 'checker', 'stripe_h', 'stripe_v', 'dots'] as const
    type Fill = (typeof FILLS)[number]

    function drawPixelBlock(x: number, y: number, size: number, fill: Fill, brightness: number) {
      const v = Math.floor(brightness * 255)
      ctx.fillStyle = `rgb(${v},${v},${v})`
      switch (fill) {
        case 'solid':
          ctx.fillRect(x + 1, y + 1, size - 2, size - 2); break
        case 'checker':
          for (let px = 0; px < size - 2; px++)
            for (let py = 0; py < size - 2; py++)
              if ((px + py) % 2 === 0) ctx.fillRect(x + 1 + px, y + 1 + py, 1, 1)
          break
        case 'stripe_h':
          for (let py = 0; py < size - 2; py++)
            if (py % 2 === 0) ctx.fillRect(x + 1, y + 1 + py, size - 2, 1)
          break
        case 'stripe_v':
          for (let px = 0; px < size - 2; px++)
            if (px % 2 === 0) ctx.fillRect(x + 1 + px, y + 1, 1, size - 2)
          break
        case 'dots':
          ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + size - 3, y + 2, 1, 1)
          ctx.fillRect(x + 2, y + size - 3, 1, 1); ctx.fillRect(x + size - 3, y + size - 3, 1, 1)
          break
      }
      // Bevel
      ctx.fillStyle = `rgba(255,255,255,0.18)`
      ctx.fillRect(x, y, size, 1); ctx.fillRect(x, y, 1, size)
      ctx.fillStyle = `rgba(0,0,0,0.3)`
      ctx.fillRect(x, y + size - 1, size, 1); ctx.fillRect(x + size - 1, y, 1, size)
    }

    // Draw the shape
    let seed = 42
    function rng() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (HOLDING_HANDS[r][c]) {
          const fill = FILLS[Math.floor(rng() * FILLS.length)]
          const brightness = 0.55 + rng() * 0.45
          drawPixelBlock(c * CELL, r * CELL, CELL, fill, brightness)
        }
      }
    }
  }, [])

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <style>{`
        @page { margin: 0; size: letter; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: #0a0a0a; color: #e8e8e8; }
      `}</style>
      <div style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        background: '#0a0a0a',
        color: '#e8e8e8',
        minHeight: '100vh',
        padding: '60px 64px',
        maxWidth: '800px',
        margin: '0 auto',
      }}>
        {/* Title */}
        <h1 style={{
          fontSize: '32px',
          fontWeight: 300,
          letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.88)',
          marginBottom: '48px',
        }}>
          Now what?
        </h1>

        {/* Body text */}
        <div style={{
          fontSize: '14px',
          fontWeight: 300,
          lineHeight: 1.85,
          color: 'rgba(255,255,255,0.65)',
        }}>
          <p style={{ marginBottom: '20px', color: 'rgba(255,255,255,0.8)', fontWeight: 400 }}>
            Assume Dario Amodei et al are right, and Superintelligence is achieved by 2028. Now what?
          </p>

          <p style={{ marginBottom: '20px' }}>
            What happens when intelligence is available &lsquo;on tap&rsquo;? How can we use that to foster human flourishing?
          </p>

          <p style={{ marginBottom: '20px' }}>
            I&rsquo;m a tinkerer and a hopeless optimist, always curious to learn about and try out the latest in digital technology, always excited about its potential to improve my life, and help solve critical problems facing our communities and mankind. When I graduated from Stanford Law School, as an Echoing Green fellow, I spent the better half of a decade building Plugged In in East Palo Alto, a national model for bridging the Digital Divide, and as chair of the Community Technology Centers Network. I was part of the Firefox 1.0 launch team, securing the open web that fostered so much innovation over the past 20 years and, more recently, was one of the founders of the Mozilla Builders incubator, supporting young activists and entrepreneurs with fresh ideas for how to make the internet work better for communities that need it most. I also shipped 25 number-one App Store hits.
          </p>

          <p style={{ marginBottom: '20px' }}>
            I want to explore that tension and that feeling.
          </p>

          <blockquote style={{
            borderLeft: '2px solid rgba(255,255,255,0.15)',
            paddingLeft: '20px',
            margin: '28px 0',
            color: 'rgba(255,255,255,0.45)',
            fontStyle: 'italic',
            fontSize: '13px',
            lineHeight: 1.8,
          }}>
            &ldquo;I read a study that measured the efficiency of locomotion for various species on the planet. The condor used the least energy to move a kilometer. And humans came in with a rather unimpressive showing, about a third of the way down the list. [&hellip;] But then somebody at Scientific American had the insight to test the efficiency of locomotion for a man on a bicycle. And a man on a bicycle blew the condor away, completely off the top of the charts. And that&rsquo;s what a computer is to me. [&hellip;] It&rsquo;s the most remarkable tool that we&rsquo;ve ever come up with, and it&rsquo;s the equivalent of a bicycle for our minds.&rdquo;
            <br /><span style={{ fontStyle: 'normal', color: 'rgba(255,255,255,0.3)' }}>&mdash; Steve Jobs, 1990</span>
          </blockquote>

          <p style={{ marginBottom: '20px' }}>
            Steve Jobs set out to build a bicycle for the mind. AGI can be a bicycle with wings, allowing us to soar.
          </p>

          <p style={{ marginBottom: '20px' }}>
            But it won&rsquo;t just happen by itself.
          </p>

          <p style={{ marginBottom: '20px' }}>
            For the last year, I&rsquo;ve been &ldquo;building with AI&rdquo;: building an AI research agent, a personal assistant, an AI that creates art multiple times a day&hellip; 14 projects and counting. I&rsquo;ve been blown away by the ability to &ldquo;manifest&rdquo; any software idea I can think of. But more recently, I&rsquo;ve also found myself paralyzed at times, overwhelmed by the lack of constraints, and a feeling that when anything is possible, maybe nothing matters. I spent years discovering the magical power of playing with musical instruments, finding flow state after hours, just &ldquo;knob mashing&rdquo; on analogue synths, and the pure joy of listening and modulating simple music sketches. But then I tried Suno, the AI music service, and the AI ruined music for me: I could type in a one sentence idea and it would come back 30 seconds later with a complete song, at a much better quality than my simple sketches, and even capturing the general mood I had in mind.
          </p>

          <p style={{ marginBottom: '20px', color: 'rgba(255,255,255,0.8)', fontWeight: 400 }}>
            Cognitive surrender.
          </p>

          <p style={{ marginBottom: '20px' }}>
            The project is to have a series of conversations with some of the smartest thinkers on the planet to explore this topic: what do we humans do after the AGI. How do we avoid becoming &ldquo;carbon-based DoorDash delivery agents&rdquo; for the AI? How do we avoid living in a world where computers do the work, and we just live in our feeds, mindlessly consuming, mindlessly Generating Answers? How do we instead use intelligence on tap to let us soar?
          </p>

          <p style={{ marginBottom: '20px' }}>
            Over the next year we will explore this topic with researchers at CASBS, elsewhere on campus and around the world, and start sketching out ideas for what such a future might look like and what kinds of tools could help us get there.
          </p>
        </div>

        {/* Art piece at bottom */}
        <div style={{
          marginTop: '48px',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <canvas
            ref={canvasRef}
            style={{
              imageRendering: 'pixelated',
              width: `${COLS * 8 * 2}px`,
              height: `${ROWS * 8 * 2}px`,
              opacity: 0.7,
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '32px',
          textAlign: 'center',
          fontSize: '11px',
          color: 'rgba(255,255,255,0.15)',
          letterSpacing: '0.15em',
        }}>
          nowwhat.ac
        </div>
      </div>
    </>
  )
}
