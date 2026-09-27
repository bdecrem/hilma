'use client'

import { useEffect, useRef, useState } from 'react'

const EXCUSES = [
  "A song came on and I had to wait for the bridge.",
  "There was a queue and the queue was the point.",
  "I went to look for keys and forgot why I had hands.",
  "A bird was watching me and it felt rude to leave.",
  "I had to finish a thought I started in 2017.",
  "Three tabs needed closing first. None of them closed.",
  "The light was wrong.",
  "I owed the elevator an apology.",
  "A small but important moral question held me up.",
  "I was inventorying the feelings I hadn't used yet.",
  "The wifi needed a moment.",
  "I stopped to look at a stranger's dog and then the dog knew.",
  "A receipt from last October was suddenly legible.",
  "I had to let the kettle finish telling its story.",
  "The sidewalk, briefly, looked like a photograph.",
  "I rehearsed a conversation that will not happen.",
  "An old voicemail began playing itself in my head.",
  "I was waiting for the right version of the sentence.",
  "A draft had to be saved before it became a file.",
  "Something in the room was humming at a frequency I could not ignore.",
  "I forgot the shape of the door.",
  "I was briefly convinced it was still Tuesday.",
  "A word I do not know in a language I do not speak.",
  "The forecast said to expect a delay and I respect authority.",
  "I misread the hour on a clock that doesn't exist.",
  "A pocket needed emptying. The pocket needed refilling. And so on.",
  "I paused to give a passing mood the courtesy it deserved.",
  "Someone laughed on a podcast and I had to match it.",
  "The coffee was not the coffee I ordered and we had to talk about it.",
  "I was counting the trees and the count kept changing.",
]

const STATUS_MESSAGES = [
  'REVIEWING CIRCUMSTANCES...',
  'CROSS-REFERENCING CLOCK...',
  'CONSULTING THE LEDGER OF MINOR DELAYS...',
  'AFFIXING SEAL...',
  'ISSUING PASS...',
]

const FIELD = '#1A110A'
const CREAM = '#E8E8E8'
const PAPER = '#EFE7D8'
const INK = '#2C2117'
const SODIUM = '#FF7A1A'
const LIME = '#C6FF3C'

function formatDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  return { date: `${y}-${m}-${day}`, time: `${hh}:${mm}` }
}

function serial() {
  // short random serial like AM-26-0423-04A7
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0')
  const now = new Date()
  const y = String(now.getFullYear()).slice(-2)
  const md = String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0')
  return `AM-${y}-${md}-${hex}`
}

export default function LatePassPage() {
  const [state, setState] = useState<'idle' | 'processing' | 'issued'>('idle')
  const [statusLine, setStatusLine] = useState<string>('SYSTEM READY · TAP TO ISSUE')
  const [pass, setPass] = useState<{
    date: string
    time: string
    reason: string
    serialNo: string
  } | null>(null)
  const [usedIndexes, setUsedIndexes] = useState<Set<number>>(new Set())
  const audioCtxRef = useRef<AudioContext | null>(null)

  function getAudio(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch { return null }
    }
    return audioCtxRef.current
  }

  function chime(freq: number, dur: number, vol: number) {
    const ctx = getAudio()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(g).connect(ctx.destination)
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(vol, now + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, now + dur)
    osc.start(now)
    osc.stop(now + dur + 0.02)
  }

  function click(freq = 1200) {
    const ctx = getAudio()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    osc.connect(g).connect(ctx.destination)
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(0.015, now + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
    osc.start(now)
    osc.stop(now + 0.1)
  }

  async function issue() {
    if (state !== 'idle' && state !== 'issued') return
    setState('processing')
    setPass(null)

    const ctx = getAudio()
    if (ctx && ctx.state === 'suspended') {
      try { await ctx.resume() } catch {}
    }

    // status sequence
    for (let i = 0; i < STATUS_MESSAGES.length; i++) {
      setStatusLine(STATUS_MESSAGES[i])
      click(900 + i * 120)
      await new Promise((r) => setTimeout(r, 420 + Math.random() * 200))
    }

    // pick a non-repeat reason
    let idx = Math.floor(Math.random() * EXCUSES.length)
    if (usedIndexes.size < EXCUSES.length) {
      let tries = 0
      while (usedIndexes.has(idx) && tries < 40) {
        idx = Math.floor(Math.random() * EXCUSES.length)
        tries++
      }
    } else {
      setUsedIndexes(new Set())
    }
    const next = new Set(usedIndexes)
    next.add(idx)
    setUsedIndexes(next)

    const now = new Date()
    const { date, time } = formatDate(now)

    setPass({
      date,
      time,
      reason: EXCUSES[idx],
      serialNo: serial(),
    })
    // gentle bell
    chime(740, 0.9, 0.12)
    setTimeout(() => chime(1108, 0.7, 0.06), 180) // perfect fifth up
    setStatusLine('PASS ISSUED · KEEP ON PERSON')
    setState('issued')
  }

  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Fraunces:ital,opsz,wght@1,9..144,300;1,9..144,400&family=Special+Elite&display=swap"
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: FIELD,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding:
            'calc(28px + env(safe-area-inset-top, 0px)) 20px calc(28px + env(safe-area-inset-bottom, 0px))',
          minHeight: '100dvh',
          fontFamily: '"Courier Prime", monospace',
          color: CREAM,
        }}
      >
        {/* CHROME HEADER */}
        <div
          style={{
            border: `2px solid ${SODIUM}`,
            width: '100%',
            maxWidth: 560,
            padding: '20px 22px 18px',
            background: '#120A04',
            boxShadow: `0 0 40px rgba(255,122,26,0.18)`,
            position: 'relative',
            marginTop: 8,
          }}
        >
          {/* scan-line effect */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,122,26,0.04) 0px, rgba(255,122,26,0.04) 1px, transparent 1px, transparent 2px)',
            }}
          />

          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.28em',
              color: SODIUM,
              marginBottom: 6,
            }}
          >
            AMBER INDUSTRIES
          </div>
          <h1
            style={{
              fontSize: 'clamp(22px, 5.5vw, 30px)',
              fontWeight: 700,
              letterSpacing: '0.14em',
              margin: 0,
            }}
          >
            DEPARTMENT OF DELAY
          </h1>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.24em',
              color: 'rgba(232,232,232,0.55)',
              marginTop: 6,
            }}
          >
            OFFICIAL LATE-PASS TERMINAL · EST. 01.12.2026
          </div>

          {/* status panel */}
          <div
            style={{
              marginTop: 18,
              border: `1px solid ${SODIUM}`,
              background: '#000',
              padding: '14px 16px',
              minHeight: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              fontSize: 12,
              letterSpacing: '0.2em',
              color: state === 'processing' ? SODIUM : state === 'issued' ? LIME : 'rgba(232,232,232,0.75)',
              transition: 'color 0.3s',
            }}
          >
            {statusLine}
          </div>

          {/* big chunky button */}
          <button
            onClick={issue}
            disabled={state === 'processing'}
            style={{
              marginTop: 16,
              width: '100%',
              padding: '18px',
              background: state === 'processing' ? '#3a2b1a' : SODIUM,
              color: state === 'processing' ? '#7a6a57' : '#140903',
              border: 'none',
              fontFamily: '"Courier Prime", monospace',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '0.24em',
              cursor: state === 'processing' ? 'not-allowed' : 'pointer',
              boxShadow: state === 'processing' ? 'none' : `0 4px 0 #8B3F0B`,
              textTransform: 'uppercase',
              position: 'relative',
              transition: 'transform 0.1s, box-shadow 0.1s',
            }}
            onPointerDown={(e) => {
              if (state !== 'processing') {
                e.currentTarget.style.transform = 'translateY(4px)'
                e.currentTarget.style.boxShadow = '0 0 0 #8B3F0B'
              }
            }}
            onPointerUp={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = `0 4px 0 #8B3F0B`
            }}
            onPointerLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = state === 'processing' ? 'none' : `0 4px 0 #8B3F0B`
            }}
          >
            {state === 'processing' ? 'PROCESSING…' : state === 'issued' ? 'ISSUE ANOTHER' : 'ISSUE PASS'}
          </button>

          {/* indicator lights */}
          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid rgba(255,122,26,0.35)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <Light key={i} on={state === 'processing'} delay={i * 120} />
            ))}
          </div>
        </div>

        {/* THE PASS */}
        {pass && (
          <div
            key={pass.serialNo}
            style={{
              marginTop: 26,
              width: '100%',
              maxWidth: 560,
              background: PAPER,
              color: INK,
              padding: '26px 28px 26px',
              position: 'relative',
              animation: 'passIn 0.6s ease',
              borderLeft: `6px solid ${SODIUM}`,
              boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
              fontFamily: '"Special Elite", "Courier Prime", monospace',
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: '0.3em',
                color: '#7a6a57',
                marginBottom: 8,
              }}
            >
              FORM LP-001 · DEPARTMENT OF DELAY
            </div>
            <div
              style={{
                fontSize: 'clamp(20px, 5.5vw, 26px)',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: INK,
                marginBottom: 14,
              }}
            >
              OFFICIAL LATE PASS
            </div>

            <PassRow label="DATE" value={pass.date} />
            <PassRow label="TIME" value={pass.time} />
            <PassRow label="BEARER" value="anyone" />
            <PassRow label="SERIAL NO." value={pass.serialNo} small />

            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.24em',
                  color: '#7a6a57',
                  marginBottom: 6,
                }}
              >
                REASON FOR DELAY
              </div>
              <div
                style={{
                  fontFamily: '"Fraunces", serif',
                  fontStyle: 'italic',
                  fontWeight: 400,
                  fontSize: 'clamp(17px, 4.4vw, 22px)',
                  lineHeight: 1.45,
                  color: INK,
                  borderBottom: `1px dashed ${INK}`,
                  paddingBottom: 12,
                }}
              >
                {pass.reason}
              </div>
            </div>

            {/* stamp / signature area */}
            <div
              style={{
                marginTop: 20,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.24em',
                    color: '#7a6a57',
                    marginBottom: 4,
                  }}
                >
                  AUTHORIZED BY
                </div>
                <div
                  style={{
                    fontFamily: '"Fraunces", serif',
                    fontStyle: 'italic',
                    fontWeight: 400,
                    fontSize: 22,
                    color: INK,
                  }}
                >
                  amber
                </div>
              </div>

              {/* stamp */}
              <div
                style={{
                  border: `2px solid ${SODIUM}`,
                  color: SODIUM,
                  padding: '8px 14px',
                  transform: 'rotate(-6deg)',
                  fontFamily: '"Courier Prime", monospace',
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: '0.22em',
                  textAlign: 'center',
                  lineHeight: 1.1,
                  background: 'rgba(255,122,26,0.06)',
                  boxShadow: 'inset 0 0 0 1px rgba(255,122,26,0.35)',
                }}
              >
                GRANTED
                <div
                  style={{
                    fontSize: 8,
                    letterSpacing: '0.3em',
                    marginTop: 2,
                    opacity: 0.85,
                  }}
                >
                  AMBER INDUSTRIES
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                borderTop: '1px dashed rgba(0,0,0,0.25)',
                paddingTop: 10,
                fontSize: 9,
                letterSpacing: '0.2em',
                color: '#7a6a57',
              }}
            >
              THIS PASS NON-TRANSFERABLE · VALID FOR ONE INSTANCE OF DELAY
            </div>
          </div>
        )}

        {/* footer */}
        <div
          style={{
            marginTop: 24,
            fontSize: 10,
            letterSpacing: '0.24em',
            color: 'rgba(232,232,232,0.4)',
            textAlign: 'center',
          }}
        >
          {EXCUSES.length} CLEMENCIES ON FILE · TAP FOR A FRESH REASON
        </div>

        {/* a. back link */}
        <a
          href="/amber"
          style={{
            marginTop: 20,
            color: 'rgba(232,232,232,0.55)',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.18em',
            textDecoration: 'none',
          }}
        >
          a.
          <span style={{ color: SODIUM }}>·</span>
        </a>

        <style jsx>{`
          @keyframes passIn {
            0% { transform: translateY(24px) rotate(-1.5deg); opacity: 0; }
            100% { transform: translateY(0) rotate(0deg); opacity: 1; }
          }
        `}</style>
      </div>
    </>
  )
}

function PassRow({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
      <div
        style={{
          minWidth: 100,
          fontSize: 10,
          letterSpacing: '0.24em',
          color: '#7a6a57',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: '"Special Elite", "Courier Prime", monospace',
          fontSize: small ? 13 : 16,
          color: INK,
          borderBottom: `1px dashed ${INK}`,
          flex: 1,
          paddingBottom: 2,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function Light({ on, delay }: { on: boolean; delay: number }) {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: on ? SODIUM : '#241610',
        boxShadow: on ? `0 0 12px ${SODIUM}, inset 0 0 4px rgba(0,0,0,0.4)` : 'inset 0 0 4px rgba(0,0,0,0.5)',
        animation: on ? `pulse 0.6s infinite ${delay}ms` : 'none',
      }}
    >
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </span>
  )
}
