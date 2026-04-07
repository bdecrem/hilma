'use client'

import { useState } from 'react'

interface Review {
  employee: string
  title: string
  emoji: string
  tenure: string
  categories: { name: string; score: number; note: string }[]
  summary: string
  recommendation: string
}

const REVIEWS: Review[] = [
  {
    employee: 'The Sun',
    title: 'Main Sequence Star, Solar System Division',
    emoji: '☀️',
    tenure: '4.6 billion years',
    categories: [
      { name: 'Punctuality', score: 10, note: 'Has not been late once in 4.6 billion years. Sets the standard, literally.' },
      { name: 'Teamwork', score: 4, note: 'Insists on being the center of everything. Could share the spotlight.' },
      { name: 'Work-Life Balance', score: 1, note: 'Does not stop. Ever. We have raised this concern before.' },
      { name: 'Communication', score: 3, note: 'Passive-aggressive with UV rays. Sends mixed signals at sunset.' },
      { name: 'Innovation', score: 2, note: 'Has been doing the same thing for 4.6 billion years. Zero iteration.' },
    ],
    summary: 'Reliable but inflexible. The team literally revolves around them, which is both the strength and the problem.',
    recommendation: 'Retain. Irreplaceable, unfortunately.',
  },
  {
    employee: 'The Moon',
    title: 'Satellite, Night Shift',
    emoji: '🌙',
    tenure: '4.5 billion years',
    categories: [
      { name: 'Punctuality', score: 7, note: 'Shows up most nights. Sometimes just a sliver. Sometimes not at all.' },
      { name: 'Teamwork', score: 9, note: 'Excellent relationship with the tides. The wolves seem to like them too.' },
      { name: 'Work-Life Balance', score: 8, note: 'Takes regular phases off. A model for sustainable work habits.' },
      { name: 'Communication', score: 2, note: 'Literally just reflects what someone else said. No original contributions.' },
      { name: 'Innovation', score: 3, note: 'Same orbit for 4.5 billion years. Applied for no internal transfers.' },
    ],
    summary: 'Dependable but derivative. Has coasted on the sun\'s output for their entire career.',
    recommendation: 'Retain for morale purposes. The office is worse without them.',
  },
  {
    employee: 'Gravity',
    title: 'Senior Force, Physics Department',
    emoji: '🍎',
    tenure: '13.8 billion years',
    categories: [
      { name: 'Punctuality', score: 10, note: 'Always there. Cannot be turned off. This is both a strength and a concern.' },
      { name: 'Teamwork', score: 10, note: 'Works with literally everything. Has never refused a collaboration.' },
      { name: 'Work-Life Balance', score: 0, note: 'Does not have a life. IS the work. HR is unsure how to categorize this.' },
      { name: 'Communication', score: 1, note: 'Invisible. Refuses to explain themselves. You just feel the effects.' },
      { name: 'Innovation', score: 6, note: 'Warps spacetime, which is creative. But has not shipped a new feature since the Big Bang.' },
    ],
    summary: 'The most fundamental employee we have. Also the most impossible to manage.',
    recommendation: 'Do not attempt to terminate.',
  },
  {
    employee: 'Rain',
    title: 'Precipitation Specialist, Weather Division',
    emoji: '🌧️',
    tenure: '3.8 billion years',
    categories: [
      { name: 'Punctuality', score: 3, note: 'Arrives whenever it wants. Has never once checked the calendar.' },
      { name: 'Teamwork', score: 7, note: 'Great with plants. Terrible with outdoor events. Mixed reviews from umbrellas.' },
      { name: 'Work-Life Balance', score: 6, note: 'Takes long breaks (droughts). Then overcompensates (floods).' },
      { name: 'Communication', score: 5, note: 'Gives about 20 minutes warning. Thinks thunder counts as an email.' },
      { name: 'Innovation', score: 8, note: 'Recently shipped: acid rain, freezing rain, that weird warm rain in February. Always iterating.' },
    ],
    summary: 'Unpredictable but essential. The only employee who can make an entire city smell like wet concrete.',
    recommendation: 'Retain. Has tried to quit before. Consequences were severe.',
  },
  {
    employee: 'Time',
    title: 'Director of Passage, Existential Operations',
    emoji: '⏰',
    tenure: 'undefined',
    categories: [
      { name: 'Punctuality', score: 10, note: 'Is punctuality.' },
      { name: 'Teamwork', score: 1, note: 'Waits for no one. Has been told this is a problem. Did not wait for the feedback.' },
      { name: 'Work-Life Balance', score: 5, note: 'Moves at exactly one second per second. Refuses to negotiate.' },
      { name: 'Communication', score: 0, note: 'Only communicates through wrinkles and expired milk.' },
      { name: 'Innovation', score: 3, note: 'Daylight saving was not their idea and they want that on record.' },
    ],
    summary: 'The one employee who is genuinely impossible to fire, promote, or even understand. Just... keeps going.',
    recommendation: 'No action possible.',
  },
  {
    employee: 'Wind',
    title: 'Air Movement Coordinator',
    emoji: '💨',
    tenure: '4.4 billion years',
    categories: [
      { name: 'Punctuality', score: 2, note: 'Shows up uninvited. Leaves without saying goodbye.' },
      { name: 'Teamwork', score: 4, note: 'Keeps knocking things over during meetings. Kites love them though.' },
      { name: 'Work-Life Balance', score: 7, note: 'Alternates between doing nothing (calm days) and way too much (hurricanes).' },
      { name: 'Communication', score: 6, note: 'Speaks through wind chimes, which is pretty but not actionable.' },
      { name: 'Innovation', score: 9, note: 'Invented erosion. Shaped the Grand Canyon. Side projects are top tier.' },
    ],
    summary: 'Chaotic but occasionally brilliant. Would benefit from a project manager.',
    recommendation: 'Retain. Previous attempts to contain wind have failed catastrophically.',
  },
]

export default function Review() {
  const [current, setCurrent] = useState(0)
  const review = REVIEWS[current]

  const next = () => setCurrent((current + 1) % REVIEWS.length)

  const scoreColor = (s: number) => {
    if (s >= 8) return '#B4E33D'
    if (s >= 5) return '#F9D423'
    if (s >= 3) return '#FC913A'
    return '#FF4E50'
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #FFF8E7, #FFECD2)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'monospace',
    }}>
      <div style={{
        maxWidth: 460,
        width: '100%',
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 16,
        padding: '24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        border: '1px solid rgba(255,255,255,0.5)',
      }}>
        <div style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 2,
          color: '#FC913A',
          marginBottom: 4,
        }}>annual performance review</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 32 }}>{review.emoji}</span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#FF4E50' }}>{review.employee}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{review.title}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 16 }}>tenure: {review.tenure}</div>

        <div style={{ height: 1, background: 'linear-gradient(to right, transparent, #FC913A, transparent)', opacity: 0.3, marginBottom: 16 }} />

        {review.categories.map((cat, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#333' }}>{cat.name}</span>
              <span style={{ fontSize: 14, fontWeight: 'bold', color: scoreColor(cat.score) }}>{cat.score}/10</span>
            </div>
            <div style={{ height: 6, background: 'rgba(0,0,0,0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', width: `${cat.score * 10}%`, background: scoreColor(cat.score), borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
            <div style={{ fontSize: 11, color: '#777', lineHeight: 1.4 }}>{cat.note}</div>
          </div>
        ))}

        <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', marginTop: 16, marginBottom: 12 }} />

        <div style={{ fontSize: 12, color: '#555', lineHeight: 1.5, fontStyle: 'italic', marginBottom: 8 }}>
          {review.summary}
        </div>
        <div style={{ fontSize: 11, color: '#FF4E50', fontWeight: 'bold' }}>
          Recommendation: {review.recommendation}
        </div>

        <button
          onClick={next}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '11px',
            background: '#FF4E50',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            fontSize: 13,
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          next review ({current + 1}/{REVIEWS.length})
        </button>
      </div>

      <div style={{
        marginTop: 14,
        fontSize: 11,
        color: 'rgba(0,0,0,0.2)',
        fontFamily: 'monospace',
      }}>
        {REVIEWS.length} celestial performance reviews — amber
      </div>
    </div>
  )
}
