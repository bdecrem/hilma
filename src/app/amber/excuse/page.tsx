'use client'

import { useState, useCallback } from 'react'

interface Excuse {
  sent: string
  real: string
}

const EXCUSES: Excuse[] = [
  { sent: "I have a prior commitment.", real: "the couch has achieved structural perfection and I cannot disturb it." },
  { sent: "Something came up at work.", real: "nothing came up at work. I just don't want to put on pants." },
  { sent: "I'm not feeling great, might be coming down with something.", real: "I am coming down with a severe case of not wanting to go." },
  { sent: "My car is making a weird noise.", real: "the weird noise is me, sighing at my calendar." },
  { sent: "I double-booked myself, I'm so sorry!", real: "I single-booked myself with doing absolutely nothing and I'm keeping that appointment." },
  { sent: "I have an early morning tomorrow.", real: "I have an early morning every day. I have never once used this fact to go to bed early." },
  { sent: "I'm waiting for an important delivery.", real: "I am waiting for the motivation to arrive. estimated delivery: unclear." },
  { sent: "My allergies are really bad today.", real: "I am allergic to leaving the house." },
  { sent: "I just got back from traveling and I'm wiped.", real: "I walked to the kitchen and back and that was a lot." },
  { sent: "I promised my partner we'd have a quiet night in.", real: "I promised myself I'd have a quiet night in. my partner doesn't know about this promise." },
  { sent: "I have a family thing.", real: "the family thing is that my family (me, the cat, and the fridge) are having a meeting." },
  { sent: "I'm on a deadline.", real: "the deadline is self-imposed. the project is a TV show. the deliverable is finishing season 3." },
  { sent: "I might be getting sick — don't want to risk it.", real: "the only thing I'm catching is up on sleep." },
  { sent: "My phone died and I didn't see your message until just now!", real: "my phone is at 87%. I saw it immediately." },
  { sent: "Traffic is insane right now.", real: "I am in bed. there is no traffic in bed." },
  { sent: "I have a headache.", real: "I have a socialache." },
  { sent: "I forgot I had a doctor's appointment.", real: "the doctor is Dr. Pepper and the appointment is on the couch." },
  { sent: "My dog isn't feeling well and I don't want to leave him.", real: "my dog is fine. I am projecting." },
  { sent: "I think I ate something bad.", real: "I ate an entire pizza and I feel great about it but I cannot move." },
  { sent: "The weather is terrible, I don't think it's safe to drive.", real: "it is partly cloudy. I am fully lazy." },
  { sent: "I need to prep for a meeting tomorrow.", real: "the meeting is an 11am standup that requires zero preparation." },
  { sent: "I'm in the middle of something I can't pause.", real: "I'm in the middle of nothing and I refuse to pause it." },
]

export default function Excuse() {
  const [current, setCurrent] = useState(0)
  const [showReal, setShowReal] = useState(false)

  const next = useCallback(() => {
    setCurrent((current + 1) % EXCUSES.length)
    setShowReal(false)
  }, [current])

  const excuse = EXCUSES[current]

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(135deg, #FFF8E7, #FFECD2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'monospace',
      }}
    >
      <div style={{
        maxWidth: 440,
        width: '100%',
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 16,
        padding: '28px 24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        border: '1px solid rgba(255,255,255,0.5)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: '#FC913A',
            marginBottom: 4,
          }}>excuse generator</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#FF4E50' }}>
            why you can&apos;t come to the thing
          </div>
        </div>

        <div style={{
          height: 1,
          background: 'linear-gradient(to right, transparent, #FC913A, transparent)',
          marginBottom: 20,
          opacity: 0.3,
        }} />

        {/* The excuse you send */}
        <div style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: '#B4E33D',
            marginBottom: 6,
          }}>what you send</div>
          <div style={{
            fontSize: 18,
            lineHeight: 1.5,
            color: '#333',
            padding: '12px 16px',
            background: 'rgba(180,227,61,0.08)',
            borderRadius: 8,
            borderLeft: '3px solid #B4E33D',
          }}>
            {excuse.sent}
          </div>
        </div>

        {/* The real reason */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setShowReal(!showReal)}
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 2,
              color: '#FF4E50',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'monospace',
              padding: '4px 0',
              marginBottom: 6,
              display: 'block',
            }}
          >
            {showReal ? '▾ the real reason' : '▸ tap for the real reason'}
          </button>
          {showReal && (
            <div style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: '#888',
              fontStyle: 'italic',
              padding: '10px 16px',
              background: 'rgba(255,78,80,0.05)',
              borderRadius: 8,
              borderLeft: '3px solid #FF4E50',
              animation: 'fadeIn 0.3s ease-out',
            }}>
              {excuse.real}
            </div>
          )}
        </div>

        {/* Copy button (visual only — actually just shows feedback) */}
        <div style={{
          display: 'flex', gap: 8,
        }}>
          <button
            onClick={next}
            style={{
              flex: 1,
              padding: '12px',
              background: '#FF4E50',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              fontSize: 13,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            next excuse ({current + 1}/{EXCUSES.length})
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 16,
        fontSize: 11,
        color: 'rgba(0,0,0,0.2)',
        textAlign: 'center',
        lineHeight: 1.6,
      }}>
        {EXCUSES.length} pre-approved reasons to stay home — amber
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
