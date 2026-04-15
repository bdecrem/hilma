'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  COLS, ROWS,
  type Box,
  type Fill,
  FILLS, randomFill,
  n4, n8, lockedCount, getFrontier,
  planEmergentBox,
  snapshotGrid,
  drawScanlines, drawBox,
  type LayoutMetrics,
} from '@/lib/nowwhat'
import { CONCEPTS, type Concept } from '../concepts'
import type { NoonRun } from '../generator'

// ─────────────────────────────────────────────────────────────────
// Amber's Noon Artifact — MVP
//
// Pipeline (eventually):
//   1. Read the world (weather + news)
//   2. Synthesize a mood
//   3. Translate mood → recipe (visual params)
//   4. Run emergence with that recipe
//   5. Judge the crystallization — keep or discard
//   6. Archive the day's winner
//
// MVP scope: just clone of /nowwhat/alive with a hardcoded MOOD
// rendered on screen. Mood doesn't yet drive the visual — that's next.
// ─────────────────────────────────────────────────────────────────

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }

// ─── Amber v3 palette ───────────────────────────────────────
const PALETTES = {
  night:   { bg: '#0A0A0A', name: 'night' },
  hearth:  { bg: '#1A110A', name: 'hearth' },
  ink:     { bg: '#0C1424', name: 'ink' },
  petrol:  { bg: '#0A1C1A', name: 'petrol' },
  bruise:  { bg: '#150826', name: 'bruise' },
  oxblood: { bg: '#1C0808', name: 'oxblood' },
} as const
const ACCENTS = {
  lime:   '#C6FF3C',
  sodium: '#FF7A1A',
  uv:     '#A855F7',
} as const

// "2026-04-14" → "April 14, 2026"
function formatNoonDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const [, y, mm, dd] = m
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const month = months[parseInt(mm, 10) - 1] || mm
  return `${month} ${parseInt(dd, 10)}, ${y}`
}

// Local layout: same cell rules as the shared computeLayout, but center the grid vertically.
function computeNoonLayout(W: number, H: number): LayoutMetrics {
  const maxCellW = Math.floor(W * 0.94 / COLS)
  const maxCellH = Math.floor(H * 0.40 / ROWS)
  const CELL = Math.max(4, Math.min(10, Math.min(maxCellW, maxCellH)))
  const stripW = COLS * CELL
  const stripH = ROWS * CELL
  const bx = Math.floor((W - stripW) / 2)
  const by = Math.floor((H - stripH) / 2)
  return { CELL, stripW, stripH, bx, by }
}

export default function AmberNoon() {
  const params = useParams<{ date: string }>()
  const date = params?.date || ''
  const [run, setRun] = useState<NoonRun | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLDivElement>(null)
  const conceptRef = useRef<HTMLDivElement>(null)
  const conceptBlurbRef = useRef<HTMLDivElement>(null)
  const conceptLabelRef = useRef<HTMLDivElement>(null)
  const scorecardRef = useRef<HTMLDivElement>(null)
  const statementRef = useRef<HTMLDivElement>(null)

  // Load the baked run for this date.
  useEffect(() => {
    if (!date) return
    let cancelled = false
    fetch(`/amber-noon/${date}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`no bake for ${date}`)
        return r.json()
      })
      .then((data: NoonRun) => { if (!cancelled) setRun(data) })
      .catch(err => { if (!cancelled) setLoadError(err.message) })
    return () => { cancelled = true }
  }, [date])

  // Derived mood (palette + accent resolved from v3 tokens).
  const mood = run ? {
    name: run.mood.name,
    reason: run.mood.reason,
    palette: PALETTES[run.mood.palette],
    accent: ACCENTS[run.mood.accent],
  } : null

  useEffect(() => {
    if (!run || !mood) return
    const canvas = canvasRef.current
    if (!canvas) return

    const SCALE = Math.max(2, Math.min(3, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 200)))
    let W = 0, H = 0

    const resize = () => {
      W = Math.floor(window.innerWidth / SCALE)
      H = Math.floor(window.innerHeight / SCALE)
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`

      // Position the caption just below the lower-left corner of the artifact.
      // Canvas coords × SCALE = CSS display pixels.
      const layout = computeNoonLayout(W, H)
      const { bx, by, stripH } = layout
      if (subtitleRef.current) {
        subtitleRef.current.style.left = `${bx * SCALE}px`
        subtitleRef.current.style.top = `${(by + stripH) * SCALE + 16}px`
      }
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    const particles: Particle[] = []

    function updateParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++
        if (p.life > p.maxLife) { particles.splice(i, 1); continue }
        p.x += p.vx; p.y += p.vy; p.vy += 0.008
        const a = (1 - p.life / p.maxLife) * 0.55
        ctx.fillStyle = `rgba(255,255,255,${a})`
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size)
      }
    }

    // Each box is a fresh emergent attempt. Pick one of Amber's 10 concepts
    // and let the engine try to build it. Display the concept name on screen.
    // What's currently being attempted (not necessarily displayed).
    let currentConcept: Concept | null = null
    let currentOutcome: 'fail' | 'succeed' = 'fail'
    // What's currently SHOWN — always the last-failed concept, or (at the end) the winner.
    let displayShown = false
    let displayStart = 0

    function showConcept(concept: Concept, now: number, label: 'last attempt:' | 'landed on:') {
      displayShown = true
      displayStart = now
      if (conceptLabelRef.current) {
        conceptLabelRef.current.textContent = label
        // LANDED ON lights up with the accent — a single signal pulse.
        conceptLabelRef.current.style.color = label === 'landed on:'
          ? mood.accent
          : 'rgba(255,255,255,0.3)'
      }
      if (conceptRef.current) conceptRef.current.textContent = concept.name
      if (conceptBlurbRef.current) conceptBlurbRef.current.textContent = `"${concept.blurb}"`
    }

    function nextBox(now: number, delay: number): Box {
      // Pull the next attempt from the baked run.
      const idx = attemptNumber // 0-based index into the queue
      const attempt = run.attempts[idx] ?? run.winner
      attemptNumber++
      const concept = CONCEPTS.find(c => c.name === attempt.concept) ?? CONCEPTS[0]
      currentConcept = concept
      currentOutcome = attempt.failed ? 'fail' : 'succeed'
      updateScorecard()
      return planEmergentBox(now, delay, concept.grid)
    }

    // Drama ledger — replays the baked run deterministically.
    let attemptNumber = 0
    let failedAttempts = 0
    let winningConcept = ''
    let hasWon = false

    function updateScorecard() {
      if (!scorecardRef.current) return
      if (!hasWon) {
        scorecardRef.current.textContent = attemptNumber > 0 ? `attempt ${attemptNumber}` : ''
      } else {
        const total = attemptNumber
        scorecardRef.current.textContent = `${total} attempts · ${failedAttempts} failed · landed on ${winningConcept}`
      }
    }

    const now0 = performance.now()
    let box = nextBox(now0, 0)

    let textFadedIn = false, textStart = 0
    let showName = '', showNameStart = 0

    function updateText(now: number) {
      if (!textFadedIn && now - now0 > 1500) { textFadedIn = true; textStart = now }
      if (textFadedIn) {
        const age = (now - textStart) / 1000
        const fadeIn = Math.min(1, age / 2.5)
        const breath = 0.76 + 0.24 * Math.sin(now * 0.0006)
        // Top eyebrow (datestamp) — fades in once on first load and stays
        if (titleRef.current) titleRef.current.style.opacity = String(fadeIn * breath * 0.9)
      }
      // Concept caption — hidden until a concept has failed (or won).
      // When shown, fades in over ~1s from displayStart.
      if (subtitleRef.current) {
        if (!displayShown) {
          subtitleRef.current.style.opacity = '0'
        } else {
          const fade = Math.min(1, (now - displayStart) / 1000)
          subtitleRef.current.style.opacity = String(fade * 0.9)
        }
      }
      // Closing statement — fades in ~2s after the piece lands.
      if (statementRef.current) {
        const revealStart = Number(statementRef.current.dataset.revealStart || '0')
        if (!revealStart) {
          statementRef.current.style.opacity = '0'
        } else {
          const elapsed = now - revealStart
          const fade = Math.max(0, Math.min(1, (elapsed - 1200) / 2000))
          statementRef.current.style.opacity = String(fade)
        }
      }
      if (nameRef.current) {
        if (showName && now - showNameStart < 3000) {
          const age = (now - showNameStart) / 1000
          const fade = age < 0.5 ? age / 0.5 : age > 2.5 ? 1 - (age - 2.5) / 0.5 : 1
          nameRef.current.style.opacity = String(fade * 0.7)
          nameRef.current.textContent = showName
        } else {
          nameRef.current.style.opacity = '0'
        }
      }
    }

    function step(now: number): Box {
      const elapsed = now - box.phaseStart
      if (elapsed < 0) return box

      // Attention
      const adx = box.attTX - box.attX, ady = box.attTY - box.attY
      box.attX += adx * box.attSpeed; box.attY += ady * box.attSpeed
      if (Math.abs(adx) < 0.8 && Math.abs(ady) < 0.8) {
        const frontier = getFrontier(box.cells)
        if (frontier.length > 0) {
          const w = frontier.flatMap(f => Array(f.n * 2 + 1).fill(f))
          const p = w[Math.floor(Math.random() * w.length)]
          box.attTX = p.c + (Math.random() - 0.5) * 3
          box.attTY = p.r + (Math.random() - 0.5) * 2
        } else if (box.tCells.length > 0) {
          const p = box.tCells[Math.floor(Math.random() * box.tCells.length)]
          box.attTX = p[1] + (Math.random() - 0.5) * 4
          box.attTY = p[0] + (Math.random() - 0.5) * 3
        }
        box.attSpeed = 0.012 + Math.random() * 0.025
      }

      // Update cells
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          const dA = Math.sqrt((c - box.attX) ** 2 + (r - box.attY) ** 2)
          const aI = Math.max(0, 1 - dA / 7)

          if (cell.isTarget && !cell.locked) {
            const nn = n4(box.cells, r, c)
            cell.agitation += (0.08 + aI * 0.5 + nn * 0.3 - cell.agitation) * 0.1
          } else if (!cell.isTarget && !cell.locked) {
            cell.agitation += (aI * 0.12 - cell.agitation) * 0.06
          }

          if (!cell.locked) {
            if (cell.flipping) {
              cell.flipPhase += cell.flipSpeed * (1 + cell.agitation * 2.5)
              if (cell.flipPhase >= 1) {
                cell.fill = cell.nextFill; cell.brightness = cell.nextBrightness; cell.flipPhase = 0
                if (Math.random() < 0.4 - cell.agitation * 0.2) {
                  cell.flipping = false
                  cell.flipTimer = Math.floor((8 + Math.random() * 35) * (1 - cell.agitation * 0.5))
                } else {
                  cell.nextFill = randomFill()
                  cell.nextBrightness = 0.15 + Math.random() * 0.45 + cell.agitation * 0.2
                }
              }
            } else {
              cell.flipTimer--
              if (cell.flipTimer <= 0) {
                cell.flipping = true; cell.nextFill = randomFill()
                cell.nextBrightness = 0.15 + Math.random() * 0.45 + cell.agitation * 0.2
                cell.flipSpeed = 0.016 + Math.random() * 0.035
              }
            }
          }
        }
      }

      // Phase transitions
      if (box.phase === 'cycling' && elapsed > 1600) {
        box.phase = 'searching'; box.phaseStart = now; box.searchStart = now
      }

      if (box.phase === 'searching') {
        const sE = (now - box.searchStart) / 1000

        if (!box.seeded && sE > 0.6) {
          box.seeded = true
          const seed = box.tCells[Math.floor(Math.random() * box.tCells.length)]
          const cell = box.cells[seed[0]][seed[1]]
          cell.locked = true; cell.lockedAt = now
          cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
          cell.brightness = 0.55 + Math.random() * 0.4
          cell.flipping = false; cell.flipPhase = 0; cell.energy = 0
        }

        const drive = Math.min(3, 0.3 + sE * 0.35)
        const frontier = getFrontier(box.cells)
        for (const f of frontier) {
          const cell = box.cells[f.r][f.c]
          const dA = Math.sqrt((f.c - box.attX) ** 2 + (f.r - box.attY) ** 2)
          const aB = Math.max(0, 1 - dA / 5) * 0.006
          cell.energy += 0.001 * drive + f.n * 0.006 * drive + aB * drive
          const th = 0.04 / (drive * 0.5 + 0.5)
          if (cell.energy > th || Math.random() < cell.energy * 0.8) {
            cell.locked = true; cell.lockedAt = now
            cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
            cell.brightness = 0.55 + Math.random() * 0.45
            cell.flipping = false; cell.flipPhase = 0
            cell.energy = 0; cell.stability = 0
          }
        }

        const nP = lockedCount(box.cells) / box.totalTarget

        // Once the target is mostly there (or we've taken too long), resolve
        // with the baked outcome for this attempt.
        if (nP >= 0.85 || sE > 10) {
          const succeed = currentOutcome === 'succeed'
          if (succeed) {
            box.willSucceed = true
            hasWon = true
            winningConcept = currentConcept ? currentConcept.name : ''
            updateScorecard()
            // The winner: show its name as the piece lands.
            if (currentConcept) {
              showConcept(currentConcept, now, 'landed on:')
              if (statementRef.current) {
                statementRef.current.textContent = run.closingStatement
                statementRef.current.dataset.revealStart = String(now)
              }
            }
            box.phase = 'cascade'; box.phaseStart = now
          } else {
            box.willSucceed = false
            failedAttempts++
            // The failed concept: show its name now, so it's visible while the next attempt begins.
            if (currentConcept) showConcept(currentConcept, now, 'last attempt:')
            box.phase = 'entropy'; box.phaseStart = now; box.entropyStart = now
          }
        }
      }

      // Entropy: the attempt failed. Locked cells dissolve, target fades.
      if (box.phase === 'entropy') {
        const eE = (now - (box.entropyStart ?? box.phaseStart)) / 1000
        const rate = 0.004 + eE * 0.012
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          if (!cell.locked || !cell.isTarget) continue
          const nn = n4(box.cells, r, c)
          const v = Math.max(0.15, 1 - nn * 0.25)
          if (Math.random() < rate * v) {
            cell.locked = false
            cell.flipping = true; cell.flipPhase = 0
            cell.flipSpeed = 0.04 + Math.random() * 0.04
            cell.brightness = 0.25 + Math.random() * 0.2; cell.energy = 0
          }
        }
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          if (cell.locked && cell.isTarget)
            cell.brightness = Math.max(0.15, cell.brightness - 0.002 + Math.sin(now * 0.018 + r * 2 + c * 3) * 0.012)
        }
        if (lockedCount(box.cells) < box.totalTarget * 0.12 || eE > 3.5) {
          box.phase = 'frozen_fail'; box.phaseStart = now
        }
      }

      if (box.phase === 'frozen_fail' && now - box.phaseStart > 1200) {
        box.phase = 'failing'; box.phaseStart = now
      }

      if (box.phase === 'failing' && now - box.phaseStart > 900) {
        box.phase = 'dark'; box.phaseStart = now
      }

      if (box.phase === 'dark' && now - box.phaseStart > 600) {
        showName = ''
        return nextBox(now, 200)
      }

      if (box.phase === 'cascade') {
        const cE = now - box.phaseStart
        let rem: [number, number][] = []
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
          if (box.cells[r][c].isTarget && !box.cells[r][c].locked) rem.push([r, c])
        const rate = Math.max(1, Math.floor(1 + cE / 60))
        for (let i = 0; i < Math.min(rate, rem.length); i++) {
          let best = rem[0], bestN = -1
          for (const [r, c] of rem) {
            const nn = n8(box.cells, r, c)
            if (nn > bestN || (nn === bestN && Math.random() < 0.4)) { bestN = nn; best = [r, c] }
          }
          const [br, bc] = best
          const cell = box.cells[br][bc]
          cell.locked = true; cell.lockedAt = now
          cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
          cell.brightness = 0.65 + Math.random() * 0.35
          cell.flipping = false; cell.flipPhase = 0
          rem = rem.filter(([r, c]) => r !== br || c !== bc)
        }
        if (rem.length === 0) {
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            if (!box.cells[r][c].isTarget) {
              box.cells[r][c].locked = false; box.cells[r][c].flipping = false
              box.cells[r][c].flipTimer = 99999; box.cells[r][c].brightness = 0.02
            }
          }
          box.phase = 'blink'; box.phaseStart = now
        }
      }

      if (box.phase === 'blink' && now - box.phaseStart > 700) {
        box.phase = 'won'; box.phaseStart = now
      }

      // When we've won — stay there. This is today's artifact.
      if (box.phase === 'won' && hasWon) {
        return box
      }

      return box
    }

    let frame = 0
    const tick = () => {
      const now = performance.now()
      ctx.fillStyle = mood.palette.bg
      ctx.fillRect(0, 0, W, H)

      const layout = computeNoonLayout(W, H)
      const { CELL, bx, by } = layout

      const elapsed = now - box.phaseStart

      if (elapsed < 0) {
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) {
            ctx.fillStyle = 'rgba(255,255,255,0.012)'
            ctx.fillRect(bx + c * CELL, by + r * CELL, CELL - 1, CELL - 1)
          }
        updateParticles(); drawScanlines(ctx, W, H); updateText(now)
        frame = requestAnimationFrame(tick); return
      }

      box = step(now)

      drawBox(ctx, box, now, layout)
      updateParticles()
      drawScanlines(ctx, W, H)
      updateText(now)

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  // Loading / error state — match the palette if we know it, otherwise black.
  if (!run || !mood) {
    return (
      <div className="min-h-dvh overflow-hidden relative" style={{ backgroundColor: '#0A0A0A' }}>
        {loadError && (
          <div
            className="fixed inset-0 flex items-center justify-center pointer-events-none"
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 12,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            no piece baked for {date || 'this date'}.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-dvh overflow-hidden relative" style={{ backgroundColor: mood.palette.bg }}>
      <canvas
        ref={canvasRef}
        className="fixed inset-0"
        style={{ imageRendering: 'pixelated' }}
      />
      {/* TOP EYEBROW — datestamp */}
      <div
        ref={titleRef}
        className="fixed z-10 pointer-events-none"
        style={{
          top: '5vh',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: 'clamp(11px, 1.5vw, 13px)',
          letterSpacing: '0.06em',
          color: 'rgba(255,255,255,0.5)',
          opacity: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {formatNoonDate(run.date)}
      </div>

      {/* LAST ATTEMPT — anchored to the lower-left corner of the artifact. */}
      <div
        ref={subtitleRef}
        className="fixed z-10 pointer-events-none"
        style={{
          top: 0,
          left: 0,
          maxWidth: '260px',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          opacity: 0,
        }}
      >
        <div
          ref={conceptLabelRef}
          style={{
            fontSize: '10px',
            letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.3)',
            marginBottom: '6px',
          }}
        >
          last attempt:
        </div>
        <div
          ref={conceptRef}
          style={{
            fontSize: '14px',
            color: 'rgba(255,255,255,0.7)',
            fontWeight: 300,
            letterSpacing: '0.03em',
          }}
        >
          &nbsp;
        </div>
        <div
          ref={conceptBlurbRef}
          style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.35)',
            fontStyle: 'italic',
            marginTop: '4px',
            letterSpacing: '0.01em',
            lineHeight: 1.4,
          }}
        >
          &nbsp;
        </div>
      </div>

      {/* CLOSING STATEMENT — italic, centered below the artifact; appears only after the piece lands */}
      <div
        ref={statementRef}
        className="fixed z-10 pointer-events-none text-center"
        style={{
          bottom: '10vh',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 'min(620px, 86vw)',
          fontFamily: "'Fraunces', Georgia, serif",
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: 'clamp(13px, 1.6vw, 16px)',
          lineHeight: 1.55,
          letterSpacing: '0.005em',
          color: 'rgba(232,232,232,0.82)',
          opacity: 0,
          transition: 'opacity 0.4s',
        }}
      />

      {/* SCORECARD — stacked under the date stamp */}
      <div
        ref={scorecardRef}
        className="fixed z-10 pointer-events-none"
        style={{
          top: 'calc(5vh + 28px)',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: '10px',
          letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.35)',
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      />

      {/* ARCHIVE LINK — bottom-right */}
      <a
        href="/amber"
        className="fixed z-10"
        style={{
          bottom: '3vh',
          right: '3vw',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: '10px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.28)',
          textDecoration: 'none',
          transition: 'color 0.3s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.28)')}
      >
        archive &rarr;
      </a>

      {/* Reserved placeholder (future ceremony) */}
      <div
        ref={nameRef}
        className="fixed z-20 pointer-events-none"
        style={{ opacity: 0 }}
      />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&family=Fraunces:ital,opsz,wght@0,9..144,300;1,9..144,300&display=swap');
      `}</style>
    </div>
  )
}
