'use client'

import { useState, useRef, useEffect } from 'react'

const RATINGS: { threshold: number; label: string; color: string; emoji: string }[] = [
  { threshold: 0, label: 'CATASTROPHIC', color: '#FF4E50', emoji: '💀' },
  { threshold: 15, label: 'REGRETTABLE', color: '#FF4E50', emoji: '😬' },
  { threshold: 30, label: 'QUESTIONABLE', color: '#FC913A', emoji: '🤔' },
  { threshold: 45, label: 'MEH', color: '#FC913A', emoji: '😐' },
  { threshold: 60, label: 'DECENT', color: '#F9D423', emoji: '👍' },
  { threshold: 75, label: 'SOLID', color: '#B4E33D', emoji: '💪' },
  { threshold: 90, label: 'LEGENDARY', color: '#B4E33D', emoji: '👑' },
]

const GOOD_DECISIONS = [
  'quit my job', 'got a dog', 'started therapy', 'went for a walk', 'called my mom',
  'drank water', 'went to bed early', 'deleted twitter', 'read a book', 'left the party',
  'said no', 'took a nap', 'adopted a cat', 'learned to cook', 'moved abroad',
  'started running', 'apologized', 'forgave them', 'planted something', 'asked for help',
  'saved money', 'took the stairs', 'meditated', 'journaled', 'volunteered',
]

const BAD_DECISIONS = [
  'ate cereal for dinner', 'texted my ex', 'stayed up until 4am', 'bought crypto',
  'googled symptoms', 'opened another tab', 'skipped breakfast', 'ignored the alarm',
  'checked email in bed', 'doom scrolled', 'compared myself', 'said yes to everything',
  'procrastinated', 'bought more stuff', 'drove angry', 'sent that email',
  'ate the whole thing', 'lied about being fine', 'overcommitted', 'ignored the deadline',
  'microwaved fish at work', 'replied all', 'trusted the recipe time',
]

const COMMENTARY: Record<string, string[]> = {
  catastrophic: [
    'this is the kind of decision they write country songs about.',
    'bold. wrong, but bold.',
    'future you is already composing a strongly-worded letter to present you.',
    'this has "seemed like a good idea at the time" energy.',
  ],
  regrettable: [
    'not your finest hour. not your worst either. actually wait, maybe it is.',
    'the universe is taking notes.',
    'this will be funny eventually. not now. but eventually.',
    'somewhere, a butterfly flapped its wings and this still happened.',
  ],
  questionable: [
    'the jury is out. and they look concerned.',
    'technically legal. morally debatable.',
    'your past self would have opinions about this.',
    'could go either way. both ways look suspicious.',
  ],
  meh: [
    'aggressively average. the beige of life choices.',
    'neither brave nor foolish. just... there.',
    'you will not remember this decision in 5 years. or 5 days.',
    'the statistical mean of human choice.',
  ],
  decent: [
    'look at you, making reasonable decisions like a functional person.',
    'your therapist would be cautiously optimistic.',
    'not bad. your mom would approve. which is either good or concerning.',
    'this is what growth looks like. slow, unremarkable growth.',
  ],
  solid: [
    'genuinely good decision. screenshot this for when you doubt yourself.',
    'future you just exhaled.',
    'this is the kind of decision that compounds.',
    'whoever raised you did something right. at least once.',
  ],
  legendary: [
    'this is the decision everything else will be measured against.',
    'chef\'s kiss. no notes.',
    'you peaked. it\'s all downhill from here. worth it.',
    'this is going in the autobiography.',
  ],
}

function scoreDecision(text: string): number {
  const lower = text.toLowerCase().trim()
  if (!lower) return 0

  let score = 50 // baseline

  // Check against known good/bad
  for (const good of GOOD_DECISIONS) {
    if (lower.includes(good)) score += 25
  }
  for (const bad of BAD_DECISIONS) {
    if (lower.includes(bad)) score -= 20
  }

  // Heuristic modifiers
  if (lower.includes('ex')) score -= 15
  if (lower.includes('3am') || lower.includes('4am') || lower.includes('2am')) score -= 20
  if (lower.includes('drunk') || lower.includes('impulse')) score -= 25
  if (lower.includes('again')) score -= 10
  if (lower.includes('finally')) score += 15
  if (lower.includes('first time')) score += 10
  if (lower.includes('boundaries')) score += 20
  if (lower.includes('crypto') || lower.includes('nft')) score -= 30
  if (lower.includes('married') || lower.includes('engaged')) score += 20
  if (lower.includes('divorced')) score += 5 // sometimes brave
  if (lower.includes('deleted') && (lower.includes('app') || lower.includes('account'))) score += 15
  if (lower.includes('adopted')) score += 20
  if (lower.includes('revenge')) score -= 20
  if (lower.includes('tattoo') && lower.includes('drunk')) score -= 40
  if (lower.includes('tattoo') && !lower.includes('drunk')) score += 5
  if (lower.includes('invested in myself')) score += 30

  // Length modifier — very short decisions are impulsive
  if (lower.length < 5) score -= 10
  // Very long decisions suggest overthinking (which is its own problem)
  if (lower.length > 100) score -= 5

  // Add some wobble
  score += Math.floor(Math.random() * 10) - 5

  return Math.max(0, Math.min(100, score))
}

export default function Password() {
  const [input, setInput] = useState('')
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [wobble, setWobble] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const wobbleRef = useRef<number>(0)

  useEffect(() => {
    const interval = setInterval(() => {
      if (score !== null) {
        wobbleRef.current += 0.1
        setWobble(Math.sin(wobbleRef.current) * 3)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [score])

  const evaluate = () => {
    if (!input.trim()) return
    const s = scoreDecision(input)
    setScore(s)

    const rating = [...RATINGS].reverse().find(r => s >= r.threshold) || RATINGS[0]
    const key = rating.label.toLowerCase()
    const comments = COMMENTARY[key] || COMMENTARY.meh
    setComment(comments[Math.floor(Math.random() * comments.length)])
  }

  const rating = score !== null
    ? [...RATINGS].reverse().find(r => score >= r.threshold) || RATINGS[0]
    : null

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #FFF8E7, #FFECD2)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'monospace',
    }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        {/* Title */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: '#FC913A', marginBottom: 8 }}>
            life decision strength meter
          </div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#FF4E50' }}>
            how strong is your decision?
          </div>
        </div>

        {/* Input */}
        <div style={{ marginBottom: 24 }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setScore(null) }}
            onKeyDown={(e) => e.key === 'Enter' && evaluate()}
            placeholder="type a life decision..."
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 16,
              fontFamily: 'monospace',
              border: '2px solid rgba(0,0,0,0.08)',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              outline: 'none',
              color: '#333',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={evaluate}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '12px',
              fontSize: 14,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              background: '#FF4E50',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            evaluate decision
          </button>
        </div>

        {/* Result */}
        {score !== null && rating && (
          <div style={{
            background: 'rgba(255,255,255,0.65)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 16,
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
            border: '1px solid rgba(255,255,255,0.5)',
            transform: `rotate(${wobble}deg)`,
            transition: 'transform 0.1s',
          }}>
            {/* Meter bar */}
            <div style={{
              height: 12,
              background: 'rgba(0,0,0,0.06)',
              borderRadius: 6,
              overflow: 'hidden',
              marginBottom: 16,
            }}>
              <div style={{
                height: '100%',
                width: `${score}%`,
                background: rating.color,
                borderRadius: 6,
                transition: 'width 0.5s ease-out',
              }} />
            </div>

            {/* Rating */}
            <div style={{ fontSize: 36, marginBottom: 4 }}>{rating.emoji}</div>
            <div style={{
              fontSize: 20,
              fontWeight: 'bold',
              color: rating.color,
              marginBottom: 4,
            }}>
              {rating.label}
            </div>
            <div style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>
              {score}/100
            </div>

            {/* Commentary */}
            <div style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: '#555',
              fontStyle: 'italic',
              padding: '0 8px',
            }}>
              {comment}
            </div>
          </div>
        )}

        {/* Examples */}
        {score === null && (
          <div style={{ marginTop: 16, fontSize: 12, color: '#aaa', lineHeight: 1.8 }}>
            try: &quot;quit my job&quot; · &quot;texted my ex at 3am&quot; · &quot;got a dog&quot; · &quot;ate cereal for dinner again&quot;
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        position: 'fixed',
        bottom: 16,
        fontSize: 11,
        color: 'rgba(0,0,0,0.2)',
        fontFamily: 'monospace',
      }}>
        not financial, medical, or life advice — amber
      </div>
    </div>
  )
}
