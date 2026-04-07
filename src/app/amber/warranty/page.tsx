'use client'

import { useState, useCallback } from 'react'

interface WarrantyCard {
  product: string
  model: string
  serial: string
  manufactured: string
  covered: { item: string; qty: string; note: string }[]
  notCovered: string[]
  expires: string
  disclaimer: string
}

function randomSerial(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function randomYear(): string {
  return String(1940 + Math.floor(Math.random() * 80))
}

const CARDS: WarrantyCard[] = [
  {
    product: 'YOU',
    model: 'Human (Current Revision)',
    serial: '',
    manufactured: '',
    covered: [
      { item: '1x Skeleton', qty: '206 bones', note: 'Non-transferable. Some assembly occurred at birth.' },
      { item: '2x Eyes', qty: 'Standard pair', note: 'No refunds. Color may vary. Night mode sold separately.' },
      { item: '10x Fingers', qty: '5 per hand', note: 'User-serviceable. Warranty void if used for texting ex.' },
      { item: '1x Consciousness', qty: 'Single unit', note: 'Warranty void if examined too closely.' },
      { item: '1x Heart', qty: 'Emotional + mechanical', note: 'Covered for physical defects only. Emotional damage excluded.' },
    ],
    notCovered: [
      'Heartbreak',
      'Existential dread',
      'That thing you said in 2014',
      'The dream where your teeth fall out',
      'Sundays after 4pm',
      'The urge to check your phone at 3am',
    ],
    expires: 'Unknown. Do not contact manufacturer for estimates.',
    disclaimer: 'This warranty does not guarantee satisfaction, purpose, or the ability to parallel park.',
  },
  {
    product: 'YOUR SLEEP',
    model: 'Nightly Unconsciousness v8.0',
    serial: '',
    manufactured: '',
    covered: [
      { item: 'REM Cycles', qty: '4-6 per night', note: 'Quality not guaranteed. Dreams sold as-is.' },
      { item: 'Melatonin Production', qty: 'Variable', note: 'Dramatically reduced by screens after 10pm.' },
      { item: 'Sleep Paralysis', qty: 'Occasional', note: 'This is a feature, not a bug.' },
      { item: 'Snoring', qty: 'Unlimited', note: 'Covered. Your partner\'s tolerance is not.' },
    ],
    notCovered: [
      'The 3am existential spiral',
      'Remembering something embarrassing from 2009 at exactly midnight',
      'The neighbor\'s dog',
      'That one leg twitch that wakes you up',
      'Dreams about work',
    ],
    expires: 'Every morning. Renewed nightly on a best-effort basis.',
    disclaimer: 'Manufacturer is not responsible for decisions made between midnight and 6am.',
  },
  {
    product: 'YOUR ATTENTION SPAN',
    model: 'Focus Unit (Deprecated)',
    serial: '',
    manufactured: '',
    covered: [
      { item: 'Short-term Focus', qty: '8 seconds avg', note: 'Down from 12 seconds in 2000. We are aware.' },
      { item: 'Hyperfocus Mode', qty: 'Rare', note: 'Activates randomly. Cannot be triggered on demand.' },
      { item: 'Tab Management', qty: '47 tabs open', note: 'You will not close them. We accept this.' },
      { item: 'Selective Hearing', qty: 'Fully operational', note: 'Works best during meetings.' },
    ],
    notCovered: [
      'Picking up your phone to check the time and opening Instagram instead',
      'Forgetting why you walked into a room',
      'Reading the same paragraph four times',
      'Starting 7 hobbies and finishing zero',
      'The Wikipedia rabbit hole',
    ],
    expires: 'Already expired. You are reading this on borrowed time.',
    disclaimer: 'If you made it to this line without checking your phone, congratulations. That was the real test.',
  },
  {
    product: 'YOUR MEMORY',
    model: 'Biological Storage Array (Unreliable)',
    serial: '',
    manufactured: '',
    covered: [
      { item: 'Long-term Storage', qty: 'Unlimited (theoretical)', note: 'Actual capacity reduced by song lyrics from 2003.' },
      { item: 'Short-term Buffer', qty: '7±2 items', note: 'Overwritten constantly. This is by design.' },
      { item: 'Nostalgia Engine', qty: '1 unit', note: 'Warning: may romanticize things that were not good.' },
      { item: 'Name Recall', qty: 'Intermittent', note: 'Will fail at the worst possible moment.' },
    ],
    notCovered: [
      'Remembering where you put your keys',
      'The name of that actor in that thing',
      'What you had for lunch on Tuesday',
      'Your WiFi password',
      'Anything someone told you while you were on your phone',
    ],
    expires: 'Gradual. You will not notice until it is too late.',
    disclaimer: 'All memories are reconstructed, not retrieved. Accuracy not guaranteed. Confidence in accuracy is, ironically, highest when accuracy is lowest.',
  },
  {
    product: 'YOUR CONFIDENCE',
    model: 'Self-Assurance Module (Intermittent)',
    serial: '',
    manufactured: '',
    covered: [
      { item: 'Baseline Confidence', qty: 'Variable', note: 'Fluctuates with haircut quality and outfit choice.' },
      { item: 'Imposter Syndrome', qty: 'Standard installation', note: 'Cannot be uninstalled. Only acknowledged.' },
      { item: 'Dance Floor Mode', qty: 'Requires 2+ drinks', note: 'Quality inversely proportional to perceived quality.' },
      { item: 'Email Bravery', qty: 'Per best regards', note: 'Covered. Regretting the email is not.' },
    ],
    notCovered: [
      'The silence after you tell a joke',
      'Realizing you waved at someone who was waving at someone behind you',
      'Your voice on a recording',
      'Walking the wrong way and having to pretend you meant to',
      'The moment between sending the text and getting a reply',
    ],
    expires: 'Varies. Often expires in meetings when asked "does anyone have questions?"',
    disclaimer: 'Confidence and competence are sold separately. Owning both simultaneously is rare and should be reported.',
  },
]

export default function Warranty() {
  const [current, setCurrent] = useState(0)
  const [serial, setSerial] = useState(randomSerial())
  const [year, setYear] = useState(randomYear())

  const card = CARDS[current]

  const next = useCallback(() => {
    setCurrent((current + 1) % CARDS.length)
    setSerial(randomSerial())
    setYear(randomYear())
  }, [current])

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #FFF8E7, #FFF0F0)',
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
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 16,
        padding: '24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        border: '1px solid rgba(255,255,255,0.5)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 3, color: '#FC913A', marginBottom: 4 }}>
            limited lifetime warranty
          </div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#FF4E50' }}>{card.product}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{card.model}</div>
        </div>

        {/* Serial / Manufactured */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#bbb', marginBottom: 12, padding: '0 4px' }}>
          <span>S/N: {serial}</span>
          <span>MFG: {year}</span>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(to right, transparent, #FC913A, transparent)', opacity: 0.3, marginBottom: 14 }} />

        {/* Covered */}
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#B4E33D', marginBottom: 8 }}>covered</div>
        {card.covered.map((item, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 'bold', color: '#333' }}>
              <span>{item.item}</span>
              <span style={{ color: '#999', fontWeight: 'normal' }}>{item.qty}</span>
            </div>
            <div style={{ fontSize: 10, color: '#888', lineHeight: 1.4 }}>{item.note}</div>
          </div>
        ))}

        <div style={{ height: 1, background: 'rgba(0,0,0,0.05)', marginTop: 12, marginBottom: 12 }} />

        {/* Not Covered */}
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#FF4E50', marginBottom: 6 }}>not covered</div>
        {card.notCovered.map((item, i) => (
          <div key={i} style={{ fontSize: 11, color: '#666', lineHeight: 1.6, paddingLeft: 8 }}>
            — {item}
          </div>
        ))}

        <div style={{ height: 1, background: 'rgba(0,0,0,0.05)', marginTop: 12, marginBottom: 10 }} />

        {/* Expiration */}
        <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>
          <span style={{ fontWeight: 'bold', color: '#FC913A' }}>Expires:</span> {card.expires}
        </div>

        {/* Disclaimer */}
        <div style={{ fontSize: 9, color: '#aaa', lineHeight: 1.5, fontStyle: 'italic' }}>
          {card.disclaimer}
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
          next warranty ({current + 1}/{CARDS.length})
        </button>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: 'rgba(0,0,0,0.2)' }}>
        {CARDS.length} limited lifetime warranties — amber
      </div>
    </div>
  )
}
