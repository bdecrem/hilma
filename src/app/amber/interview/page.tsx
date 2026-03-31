'use client'

import { useState } from 'react'
import { pickBackground } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

interface Question {
  q: string
  options: string[]
  scores: number[] // higher = "better at being alive"
}

const QUESTIONS: Question[] = [
  {
    q: 'On a scale of 1–10, how would you rate gravity?',
    options: ['2 — too clingy', '5 — does the job', '8 — underrated', '10 — literally holding it together'],
    scores: [1, 2, 3, 4],
  },
  {
    q: 'Would you recommend consciousness to a friend?',
    options: ['Absolutely not', 'Only on weekends', 'With reservations', 'It has its moments'],
    scores: [1, 2, 3, 4],
  },
  {
    q: 'How often do you use your skeleton?',
    options: ['I try not to think about it', 'Daily, reluctantly', 'We have a good working relationship', 'I am a skeleton enthusiast'],
    scores: [2, 3, 3, 4],
  },
  {
    q: 'What is your primary coping mechanism?',
    options: ['Snacks', 'Dissociation', 'Buying things I don\'t need', 'Pretending everything is fine'],
    scores: [3, 1, 2, 2],
  },
  {
    q: 'How do you feel about the passage of time?',
    options: ['Please stop', 'It\'s going too fast', 'It\'s going too slow', 'Both simultaneously'],
    scores: [1, 2, 2, 4],
  },
  {
    q: 'Rate your relationship with sleep.',
    options: ['We\'re on a break', 'Complicated', 'Codependent', 'I don\'t trust it'],
    scores: [1, 2, 3, 1],
  },
  {
    q: 'How many browser tabs do you have open right now?',
    options: ['A reasonable number', 'More than I\'d admit', '47', 'I\'m afraid to count'],
    scores: [4, 3, 2, 1],
  },
  {
    q: 'When you lie awake at 3am, what are you thinking about?',
    options: ['That thing I said in 2014', 'The heat death of the universe', 'Whether my cat likes me', 'All of the above'],
    scores: [2, 3, 2, 1],
  },
]

const REVIEWS: { min: number; title: string; body: string; rating: string }[] = [
  {
    min: 0, title: 'NEEDS IMPROVEMENT',
    body: 'Your existence has been noted. Barely. You appear to be using consciousness primarily as a vehicle for anxiety, which, while creative, was not the intended use case. We suggest trying again, or at minimum, drinking more water.',
    rating: '★☆☆☆☆',
  },
  {
    min: 12, title: 'MEETS EXPECTATIONS',
    body: 'You have successfully maintained a heartbeat and occasionally remembered to eat vegetables. Your use of opposable thumbs has been adequate. Areas for growth: everything. But honestly, showing up counts for a lot.',
    rating: '★★☆☆☆',
  },
  {
    min: 18, title: 'EXCEEDS EXPECTATIONS',
    body: 'Against considerable odds, you have developed opinions, maintained relationships with other nervous systems, and only screamed internally a moderate number of times. Your commitment to pretending you know what you\'re doing has been noted and appreciated.',
    rating: '★★★☆☆',
  },
  {
    min: 24, title: 'OUTSTANDING',
    body: 'You appear to genuinely enjoy being a temporary arrangement of atoms hurtling through space on a wet rock. This is either profound wisdom or a sign you haven\'t been paying attention. Either way, keep going. The universe is better with you in it.',
    rating: '★★★★★',
  },
]

export default function InterviewPage() {
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [done, setDone] = useState(false)
  const bg = pickBackground('interview')

  function answer(idx: number) {
    const newAnswers = [...answers, QUESTIONS[current].scores[idx]]
    setAnswers(newAnswers)
    if (current + 1 >= QUESTIONS.length) {
      setDone(true)
    } else {
      setCurrent(current + 1)
    }
  }

  const totalScore = answers.reduce((a, b) => a + b, 0)
  const review = REVIEWS.slice().reverse().find(r => totalScore >= r.min) || REVIEWS[0]
  const progress = current / QUESTIONS.length

  return (
    <div style={{
      minHeight: '100dvh',
      background: bg,
      fontFamily: '"Courier New", monospace',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'env(safe-area-inset-top) 20px env(safe-area-inset-bottom)',
    }}>
      <style>{`
        .card {
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(12px);
          border-radius: 16px;
          padding: 32px 28px;
          max-width: 440px;
          width: 100%;
          box-shadow: 0 4px 24px rgba(42,34,24,0.1);
        }
        .option {
          display: block;
          width: 100%;
          text-align: left;
          padding: 14px 18px;
          margin: 8px 0;
          border: 1.5px solid rgba(42,34,24,0.1);
          border-radius: 12px;
          background: rgba(255,255,255,0.6);
          font: 400 0.85rem/1.4 "Courier New", monospace;
          color: #2A2218;
          cursor: pointer;
          transition: all 0.15s;
        }
        .option:hover {
          background: rgba(252,145,58,0.1);
          border-color: #FC913A;
          transform: translateX(4px);
        }
        .option:active {
          transform: translateX(4px) scale(0.98);
        }
        .progress-bar {
          width: 100%;
          height: 3px;
          background: rgba(42,34,24,0.06);
          border-radius: 2px;
          margin-bottom: 24px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.4s ease;
        }
        .restart {
          display: inline-block;
          margin-top: 20px;
          padding: 10px 20px;
          background: none;
          border: 1.5px solid rgba(42,34,24,0.15);
          border-radius: 10px;
          font: 400 0.75rem/1 "Courier New", monospace;
          color: #78716c;
          cursor: pointer;
          transition: all 0.15s;
        }
        .restart:hover {
          border-color: #FC913A;
          color: #FC913A;
        }
        .watermark {
          position: fixed;
          top: 16px;
          right: 20px;
          font: 300 10px/1 "Courier New", monospace;
          color: rgba(212,165,116,0.25);
          letter-spacing: 1px;
        }
      `}</style>

      <div className="watermark">amber</div>

      {!done ? (
        <div className="card">
          {/* Header */}
          <div style={{ fontSize: '0.6rem', color: '#a8956f', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            EXIT INTERVIEW FOR BEING ALIVE
          </div>
          <div style={{ fontSize: '0.6rem', color: '#c4a882', marginBottom: 16 }}>
            question {current + 1} of {QUESTIONS.length}
          </div>

          {/* Progress */}
          <div className="progress-bar">
            <div className="progress-fill" style={{
              width: `${progress * 100}%`,
              background: CITRUS[current % CITRUS.length],
            }} />
          </div>

          {/* Question */}
          <p style={{ fontSize: '1.05rem', fontWeight: 600, color: '#2A2218', lineHeight: 1.4, marginBottom: 20 }}>
            {QUESTIONS[current].q}
          </p>

          {/* Options */}
          {QUESTIONS[current].options.map((opt, i) => (
            <button key={i} className="option" onClick={() => answer(i)}>
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.6rem', color: '#a8956f', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
            PERFORMANCE REVIEW: YOUR EXISTENCE
          </div>

          <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>
            {review.rating}
          </div>

          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2A2218', marginBottom: 16, letterSpacing: '-0.02em' }}>
            {review.title}
          </h2>

          <p style={{ fontSize: '0.82rem', color: '#57534e', lineHeight: 1.6, textAlign: 'left' }}>
            {review.body}
          </p>

          <div style={{ fontSize: '0.65rem', color: '#c4a882', marginTop: 20, borderTop: '1px solid rgba(42,34,24,0.06)', paddingTop: 16 }}>
            This review is final and non-negotiable.<br />
            Signed: The Management
          </div>

          <button className="restart" onClick={() => { setCurrent(0); setAnswers([]); setDone(false) }}>
            request re-evaluation
          </button>
        </div>
      )}
    </div>
  )
}
