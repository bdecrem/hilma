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

// "Bicycle with wings" — clean side profile + wings sweeping up
// Grid is 26 wide x 10 tall. Bike sits at bottom, wings rise from frame.
const WINGED_BIKE: Grid = (() => {
  const g: Grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0))

  // === BICYCLE (side profile, centered) ===

  // Rear wheel — center (8, 7), r=2
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const d = Math.sqrt((c - 8) ** 2 + ((r - 7) * 1.0) ** 2)
      if (d >= 1.5 && d <= 2.5) g[r][c] = 1
    }

  // Front wheel — center (18, 7), r=2
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const d = Math.sqrt((c - 18) ** 2 + ((r - 7) * 1.0) ** 2)
      if (d >= 1.5 && d <= 2.5) g[r][c] = 1
    }

  // Frame: seat tube (diagonal from rear axle up)
  g[6][9] = 1; g[5][10] = 1; g[4][11] = 1
  // Top tube (horizontal)
  g[4][12] = 1; g[4][13] = 1; g[4][14] = 1; g[4][15] = 1; g[4][16] = 1
  // Down tube (diagonal from head to bottom bracket)
  g[5][16] = 1; g[6][17] = 1
  // Bottom bracket area
  g[7][13] = 1
  // Chain stay (rear axle to bottom bracket)
  g[7][9] = 1; g[7][10] = 1; g[7][11] = 1; g[7][12] = 1
  // Down stay (front)
  g[7][14] = 1; g[7][15] = 1; g[7][16] = 1; g[7][17] = 1
  // Seat
  g[3][10] = 1; g[3][11] = 1; g[3][12] = 1
  // Handlebars
  g[3][17] = 1; g[3][18] = 1; g[4][17] = 1

  // === WINGS (sweep up and outward from the frame center) ===

  // Left wing — from seat area, sweeping up-left
  g[3][9] = 1; g[2][8] = 1; g[2][7] = 1; g[1][6] = 1; g[1][5] = 1; g[0][4] = 1; g[0][3] = 1; g[0][2] = 1
  g[2][9] = 1; g[1][8] = 1; g[1][7] = 1; g[0][6] = 1; g[0][5] = 1
  g[1][9] = 1; g[0][8] = 1; g[0][7] = 1

  // Right wing — from handlebar area, sweeping up-right
  g[3][19] = 1; g[2][20] = 1; g[2][19] = 1; g[1][21] = 1; g[1][20] = 1; g[0][22] = 1; g[0][23] = 1; g[0][24] = 1
  g[1][19] = 1; g[0][20] = 1; g[0][19] = 1; g[0][21] = 1
  g[2][18] = 1; g[1][18] = 1

  return g
})()

export default function PdfLightPage() {
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

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)

    const FILLS = ['solid', 'checker', 'stripe_h', 'stripe_v', 'dots'] as const
    type Fill = (typeof FILLS)[number]

    function drawPixelBlock(x: number, y: number, size: number, fill: Fill, darkness: number) {
      const v = Math.floor((1 - darkness) * 255)
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
      // Bevel (inverted for light mode)
      ctx.fillStyle = `rgba(0,0,0,0.08)`
      ctx.fillRect(x, y + size - 1, size, 1); ctx.fillRect(x + size - 1, y, 1, size)
      ctx.fillStyle = `rgba(255,255,255,0.4)`
      ctx.fillRect(x, y, size, 1); ctx.fillRect(x, y, 1, size)
    }

    let seed = 77
    function rng() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (WINGED_BIKE[r][c]) {
          const fill: Fill = 'solid'
          const darkness = 0.8
          drawPixelBlock(c * CELL, r * CELL, CELL, fill, darkness)
        }
      }
    }
  }, [])

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        @page { margin: 0; size: letter; }
        @media print { html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: #fff; color: #1a1a1a; }
      `}</style>
      <div style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        background: '#fff',
        color: '#1a1a1a',
        minHeight: '100vh',
        padding: '32px 40px 36px 54px',
        maxWidth: '780px',
        margin: '0 auto',
      }}>
        {/* Title — textmark style */}
        <h1 style={{
          fontSize: '36px',
          fontWeight: 300,
          letterSpacing: '0.08em',
          color: '#1a1a1a',
          marginBottom: '20px',
          lineHeight: 1,
        }}>
          Now what?
        </h1>

        {/* Body text */}
        <div style={{
          fontSize: '11.5px',
          fontWeight: 400,
          lineHeight: 1.5,
          color: '#3a3a3a',
        }}>
          <p style={{ marginBottom: '12px' }}>
            Assume Dario Amodei et al are right, and superintelligence is achieved by 2028. Now what? What happens when intelligence is available <em>on tap</em>?
          </p>

          <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: '#aaa', textTransform: 'uppercase', marginTop: '16px', marginBottom: '8px' }}>The Question</div>

          <p style={{ marginBottom: '12px', color: '#1a1a1a', fontWeight: 600 }}>
            At CASBS I will explore what&rsquo;s on the other side of AGI: my own take on how to harness superintelligence to help people thrive and avoid the traps of cognitive <a href="https://pubmed.ncbi.nlm.nih.gov/27542527/" style={{ color: '#1a1a1a', textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationColor: '#999' }}>offloading</a>, <a href="https://arxiv.org/abs/2506.08872" style={{ color: '#1a1a1a', textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationColor: '#999' }}>debt</a> and <a href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6097646" style={{ color: '#1a1a1a', textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationColor: '#999' }}>surrender</a>.
          </p>

          <p style={{ marginBottom: '12px' }}>
            I&rsquo;m a tinkerer and a hopeless optimist, always curious about new tech and its potential to solve real problems. I spent five+ years in East Palo Alto building a national model for bridging the digital divide, then helped share those learnings nationally from the Steering Committee of the Community Technology Centers Network. I co-founded <a href="https://www.fullcirclefund.org" style={{ color: '#3a3a3a', textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationColor: '#ccc' }}>Full Circle Fund</a> and created the Mozilla Builders incubator, supporting activists and founders building a better internet. Along the way, I also played a key role in the Firefox 1.0 launch and led Disney&rsquo;s early App Store efforts after creating the first iPhone smash hit.
          </p>

          <p style={{ marginBottom: '12px' }}>
            For the last year, I&rsquo;ve been &ldquo;<a href="https://www.decremental.com" style={{ color: '#3a3a3a', textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationColor: '#ccc' }}>building with AI</a>,&rdquo; taking on increasingly ambitious projects, and I&rsquo;ve been blown away by the ability to &ldquo;manifest&rdquo; any software idea I can think of. But I&rsquo;ve also found myself paralyzed at times, overwhelmed by the lack of constraints and a feeling that when anything is possible, maybe nothing matters. I spent years discovering the magic of mashing knobs on analog synths, finding flow state after hours listening and modulating simple music sketches. Then I tried Suno, the AI music app, and it ruined music for me: in 30 seconds it could create any song for me, better than anything I could ever make, often capturing the exact mood I had in mind. I haven&rsquo;t touched the knobs since.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>I want to explore that tension and that feeling.</strong>
          </p>

          <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: '#aaa', textTransform: 'uppercase', marginTop: '16px', marginBottom: '8px' }}>A Bicycle with Wings</div>

          <blockquote style={{
            borderLeft: '2px solid #ddd',
            paddingLeft: '16px',
            margin: '14px 0',
            color: '#777',
            fontStyle: 'italic',
            fontSize: '10.5px',
            lineHeight: 1.45,
          }}>
            &ldquo;I read a study that measured the efficiency of locomotion for various species on the planet. The condor used the least energy to move a kilometer. And humans came in with a rather unimpressive showing. [&hellip;] But then somebody at Scientific American had the insight to test the efficiency of locomotion for a man on a bicycle. And a man on a bicycle blew the condor away, completely off the top of the charts. And that&rsquo;s what a computer is to me. [&hellip;] It&rsquo;s the most remarkable tool that we&rsquo;ve ever come up with, and it&rsquo;s the equivalent of a bicycle for our minds.&rdquo;
            <br /><span style={{ fontStyle: 'normal', color: '#aaa' }}>&mdash; Steve Jobs, 1990</span>
          </blockquote>

          <p style={{ marginBottom: '12px' }}>
            Steve Jobs set out to build a bicycle for the mind. AGI can be a bicycle with wings, letting us fly.
          </p>

          <p style={{ marginBottom: '12px' }}>
            But it&rsquo;s not inevitable, or even the most likely outcome. We already can&rsquo;t put our phones down, and the feed algorithms and synthetic content are about to get a lot more addictive. Why work when we can &ldquo;vibe-work&rdquo;? (Microsoft is marketing that right now.) Why deal with our imperfect friends when we can have AI companions who are always there, always on our side? (<a href="https://www.commonsensemedia.org/press-releases/nearly-3-in-4-teens-have-used-ai-companions-new-national-survey-finds" style={{ color: '#3a3a3a', textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationColor: '#ccc' }}>Three in four teens are already trying it</a>.) How do we resist cognitive surrender, or avoid becoming carbon-based DoorDash delivery drivers for the AI?
          </p>

          <p style={{ marginBottom: '12px', color: '#1a1a1a', fontWeight: 500 }}>
            If a bicycle with wings shows up at our doorstep, how do we learn to ride it and where do we point it?
          </p>

          <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: '#aaa', textTransform: 'uppercase', marginTop: '16px', marginBottom: '8px' }}>The Project</div>

          <p style={{ marginBottom: '12px' }}>
            Over my year at CASBS, I will have in-depth conversations with CASBS fellows and other academics and researchers on campus about cognition, labor, identity and community. I&rsquo;ll engage their ideas with my builder&rsquo;s instinct. Each conversation becomes a blog or podcast episode. And because I&rsquo;m a builder, I&rsquo;ll be creating artifacts: prototypes and tools that explore my ideas. If we&rsquo;re talking about flow state and AI, I&rsquo;ll build an app for that. If we&rsquo;re talking about UBI and the meaning of work, I might sketch a tool that explores that. <strong>Ten conversations, ten artifacts.</strong>
          </p>
        </div>

        {/* Art piece — bicycle with wings */}
        <div style={{
          marginTop: '-20px',
          display: 'flex',
          justifyContent: 'center',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/nowwhat/bicycle_with_wings_light.svg"
            alt="Bicycle with wings"
            style={{
              width: '153px',
              height: 'auto',
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '4px',
          textAlign: 'center',
          fontSize: '11px',
          letterSpacing: '0.15em',
        }}>
          <a
            href="https://nowwhat.cc/nw"
            style={{
              color: '#555',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              textDecorationColor: '#bbb',
            }}
          >
            nowwhat.cc/nw &rarr;
          </a>
        </div>
      </div>
    </>
  )
}
