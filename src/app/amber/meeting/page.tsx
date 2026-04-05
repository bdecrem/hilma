'use client'

import { useState, useEffect, useRef } from 'react'

interface Attendee {
  name: string
  title: string
  emoji: string
  status: string[]
  quotes: string[]
  bgColor: string
}

const ATTENDEES: Attendee[] = [
  {
    name: 'Stapler',
    title: 'VP of Binding',
    emoji: '📎',
    status: ['presenting Q3 results', 'sharing screen', 'looking for slide 14', 'apologizing for wrong deck'],
    quotes: [
      '"If we could just... hold everything together on this one."',
      '"Per my last staple, the numbers are attached."',
      '"I want to circle back to the binding issue from last quarter."',
      '"Let me pin that thought."',
    ],
    bgColor: '#FF4E50',
  },
  {
    name: 'Coffee Mug',
    title: 'Head of Sustenance',
    emoji: '☕',
    status: ['on mute', 'definitely on mute', 'forgot they were on mute', 'still on mute'],
    quotes: [
      '"Sorry, I was on mute. Can you repeat the last 20 minutes?"',
      '"I think we all need to refill before we continue."',
      '"I have a hard stop in 5 minutes. I have had a hard stop in 5 minutes for the last 30 minutes."',
      '"*long sip*"',
    ],
    bgColor: '#FC913A',
  },
  {
    name: 'Potted Plant',
    title: 'Director of Presence',
    emoji: '🪴',
    status: ['just listening', 'growing quietly', 'photosynthesizing', 'being green'],
    quotes: [
      '"..."',
      '"I\'m just here for the oxygen."',
      '"I agree with whatever gets me more sunlight."',
      '"Could we take this offline? I mean literally outside."',
    ],
    bgColor: '#B4E33D',
  },
  {
    name: 'Rubber Duck',
    title: 'Senior Debug Consultant',
    emoji: '🦆',
    status: ['having thoughts', 'debugging silently', 'judging', 'quacking internally'],
    quotes: [
      '"Have you tried explaining the problem out loud?"',
      '"I don\'t have a solution but I am an excellent listener."',
      '"*squeak*"',
      '"The bug is on line 1. The line is your entire approach."',
    ],
    bgColor: '#F9D423',
  },
  {
    name: 'Desk Lamp',
    title: 'Chief Illumination Officer',
    emoji: '💡',
    status: ['bright idea incoming', 'flickering', 'burned out from last meeting', 'on low'],
    quotes: [
      '"I\'d like to shed some light on this."',
      '"Can we illuminate the key takeaways?"',
      '"I\'m going to need to recharge after this."',
      '"This meeting has dimmed my enthusiasm significantly."',
    ],
    bgColor: '#FF6B81',
  },
  {
    name: 'Sticky Note',
    title: 'VP of Reminders',
    emoji: '📝',
    status: ['action items', 'losing adhesion', 'falling off the monitor', 'covered in older notes'],
    quotes: [
      '"I\'ll make a note of that. I\'ll lose the note by Thursday."',
      '"Can someone summarize this in 3 words or less? I have limited space."',
      '"I was originally a to-do list. Now I\'m a cry-for-help list."',
      '"URGENT: this meeting is not urgent."',
    ],
    bgColor: '#FC913A',
  },
]

export default function Meeting() {
  const [elapsed, setElapsed] = useState(0)
  const [bubble, setBubble] = useState<{ idx: number; text: string } | null>(null)
  const [statuses, setStatuses] = useState(() => ATTENDEES.map(a => a.status[0]))
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed(e => e + 1)
      // Rotate statuses randomly
      setStatuses(prev => prev.map((s, i) => {
        if (Math.random() < 0.15) {
          const options = ATTENDEES[i].status
          return options[Math.floor(Math.random() * options.length)]
        }
        return s
      }))
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const showBubble = (idx: number) => {
    const quotes = ATTENDEES[idx].quotes
    setBubble({ idx, text: quotes[Math.floor(Math.random() * quotes.length)] })
    setTimeout(() => setBubble(null), 3000)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #FFF8E7, #FFECD2)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '16px',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{
        width: '100%', maxWidth: 500,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, padding: '0 4px',
      }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#FC913A' }}>
            meeting in progress
          </div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#FF4E50' }}>
            Q3 Synergy Alignment Sync
          </div>
        </div>
        <div style={{
          fontSize: 18, fontWeight: 'bold', color: '#FF4E50',
          background: 'rgba(255,78,80,0.1)', padding: '4px 12px', borderRadius: 8,
        }}>
          {formatTime(elapsed)}
        </div>
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 10,
        maxWidth: 500,
        width: '100%',
      }}>
        {ATTENDEES.map((a, i) => (
          <div
            key={i}
            onClick={() => showBubble(i)}
            style={{
              background: 'rgba(255,255,255,0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: 12,
              padding: '14px 12px',
              cursor: 'pointer',
              border: bubble?.idx === i ? `2px solid ${a.bgColor}` : '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
              position: 'relative',
              transition: 'border 0.2s',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>{a.emoji}</div>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>{a.name}</div>
            <div style={{ fontSize: 9, color: '#999', marginBottom: 6 }}>{a.title}</div>
            <div style={{
              fontSize: 10, color: a.bgColor,
              background: `${a.bgColor}15`,
              padding: '3px 6px', borderRadius: 4,
              display: 'inline-block',
            }}>
              {statuses[i]}
            </div>

            {/* Speech bubble */}
            {bubble?.idx === i && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'white',
                borderRadius: 10,
                padding: '8px 12px',
                fontSize: 11,
                color: '#333',
                lineHeight: 1.4,
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                maxWidth: 220,
                zIndex: 10,
                marginBottom: 6,
              }}>
                {bubble.text}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 16, fontSize: 12, color: '#aaa',
        textAlign: 'center', maxWidth: 400, lineHeight: 1.6,
      }}>
        <span style={{ color: '#FF4E50' }}>this meeting could have been an email.</span>
        <br />
        <span style={{ fontSize: 10 }}>tap an attendee to hear their contribution.</span>
      </div>
    </div>
  )
}
