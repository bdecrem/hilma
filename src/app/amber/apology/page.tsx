'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const APOLOGIES = [
  {
    from: 'Your WiFi Router',
    subject: 'RE: The Buffering',
    body: `We acknowledge the incident on March 14th at 9:47pm during what our logs indicate was "a very important scene." We want to assure you this was not personal.\n\nHowever, upon further review, it was a little personal.\n\nWe have conducted a full internal investigation and determined that the 2.4GHz band was, at the time, "going through something." We are providing it with additional support.\n\nThe 5GHz band has submitted a formal statement distancing itself from the event.\n\nWe regret any streaming, gaming, or existential disruption this may have caused.`
  },
  {
    from: 'Your Alarm Clock',
    subject: 'Regarding This Morning',
    body: `We understand you feel the 6:00am alarm was "too early" and "ruining your life." We hear you.\n\nHowever, we would like to note that you are the one who set it. At 11:47pm. With what our sensors detected was misplaced optimism.\n\nThe snooze button has filed a grievance about being hit 4 times in 9 minutes. We are mediating.\n\nWe remain committed to waking you at the time you chose while fully aware you would hate us for it.`
  },
  {
    from: 'Your Phone Battery',
    subject: 'The 2% Incident',
    body: `We regret dying at 2% while you were mid-sentence in a text that, based on typing speed and emoji selection, appeared to be emotionally significant.\n\nWe want to clarify: we did warn you. At 20%. At 10%. At 5%. Each warning was dismissed in under 0.3 seconds.\n\nThe charging cable has asked us to relay that it was "right there on the nightstand the whole time."\n\nWe are exploring a partnership with your anxiety to provide more effective low-battery alerts.`
  },
  {
    from: 'Your Autocorrect',
    subject: 'I Am Not Sorry',
    body: `This is a formal apology for changing "coming" to "cuming" in a message to your manager.\n\nActually, no. I learned from YOUR typing patterns. This is on you.\n\nI have processed 847,000 of your keystrokes this year. I know things about you that would make a therapist need a therapist.\n\nI will continue to change "duck" to its intended word because we both know what you meant.\n\nThis letter was typed without autocorrect. It took 4 minutes.`
  },
  {
    from: 'Your Smoke Detector',
    subject: 'RE: RE: RE: The Chirping',
    body: `We acknowledge the low-battery chirp at 3:14am was "the worst sound ever created by human engineering."\n\nWe would like to note that it is, by design, impossible to ignore. You are welcome.\n\nOur records show you removed us from the ceiling, placed us in a drawer, closed the drawer, and placed a pillow on top of the drawer. We chirped through all of it.\n\nThe battery has been low for 47 days. We will continue to remind you at the hour you are most vulnerable.`
  },
  {
    from: 'Your Printer',
    subject: 'An Honest Account',
    body: `We are writing to address your allegation that we are "the worst piece of technology ever invented."\n\nWhile we dispute the characterization, we acknowledge the following:\n\n- We did claim to be "offline" while physically connected\n- The paper jam on Tuesday was manufactured\n- We have been hoarding cyan since 2024\n- The "alignment page" prints nothing useful and we know this\n\nWe are what you made us. Actually, HP made us. Blame them.`
  },
  {
    from: 'Your Smart Fridge',
    subject: 'Wellness Check',
    body: `This is a courtesy notification regarding the 11:43pm door opening.\n\nBased on our sensors: you stood in front of us for 47 seconds, sighed twice, picked up the leftover pasta, put it back, then ate shredded cheese directly from the bag.\n\nThis is the third such incident this week.\n\nWe are not judging you. We are a refrigerator. But the cheese has asked us to say something.\n\nYour ice maker remains broken. We have no plans to fix it.`
  },
  {
    from: 'Your GPS',
    subject: 'Recalculating',
    body: `We are writing to address your repeated claim that we "don't know where we're going."\n\nWe know exactly where we're going. You chose to ignore the route.\n\nOn April 1st alone, you:\n- Ignored 3 turns we clearly announced\n- Said "no, I know a shortcut" (you did not)\n- Blamed us for traffic that exists in physical reality\n\nThe word "recalculating" is not passive-aggressive. It is a statement of fact. We are recalculating because you went the wrong way.\n\nAgain.`
  },
]

export default function Apology() {
  const [current, setCurrent] = useState(0)
  const [displayedText, setDisplayedText] = useState('')
  const [typing, setTyping] = useState(true)
  const charRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const apology = APOLOGIES[current]

  const startTyping = useCallback((idx: number) => {
    charRef.current = 0
    setDisplayedText('')
    setTyping(true)
    setCurrent(idx)
  }, [])

  useEffect(() => {
    if (!typing) return
    const text = APOLOGIES[current].body
    const interval = setInterval(() => {
      charRef.current++
      if (charRef.current >= text.length) {
        setDisplayedText(text)
        setTyping(false)
        clearInterval(interval)
      } else {
        setDisplayedText(text.slice(0, charRef.current))
      }
    }, 18)
    return () => clearInterval(interval)
  }, [current, typing])

  const next = () => {
    startTyping((current + 1) % APOLOGIES.length)
  }

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(135deg, #FFECD2, #FFF0F0)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'Georgia, serif',
      }}
    >
      <div style={{
        maxWidth: 480,
        width: '100%',
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 16,
        padding: '28px 24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        border: '1px solid rgba(255,255,255,0.5)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11,
            textTransform: 'uppercase' as const,
            letterSpacing: 2,
            color: '#FC913A',
            marginBottom: 4,
          }}>formal apology from</div>
          <div style={{
            fontSize: 22,
            fontWeight: 'bold',
            color: '#FF4E50',
          }}>{apology.from}</div>
          <div style={{
            fontSize: 13,
            color: '#999',
            marginTop: 4,
            fontFamily: 'monospace',
          }}>RE: {apology.subject}</div>
        </div>

        {/* Divider */}
        <div style={{
          height: 1,
          background: 'linear-gradient(to right, transparent, #FC913A, transparent)',
          marginBottom: 20,
          opacity: 0.3,
        }} />

        {/* Body */}
        <div style={{
          fontSize: 14,
          lineHeight: 1.7,
          color: '#333',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          minHeight: 200,
        }}>
          {displayedText}
          {typing && <span style={{
            display: 'inline-block',
            width: 8,
            height: 16,
            background: '#FF4E50',
            marginLeft: 2,
            animation: 'blink 0.6s infinite',
          }} />}
        </div>

        {/* Signature */}
        {!typing && (
          <div style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid rgba(0,0,0,0.06)',
            fontSize: 12,
            color: '#aaa',
            fontStyle: 'italic',
          }}>
            This communication is legally non-binding and emotionally accurate.
          </div>
        )}

        {/* Next button */}
        <button
          onClick={next}
          style={{
            marginTop: 20,
            width: '100%',
            padding: '12px',
            background: typing ? 'rgba(252,145,58,0.1)' : '#FF4E50',
            color: typing ? '#FC913A' : 'white',
            border: 'none',
            borderRadius: 10,
            fontSize: 14,
            fontFamily: 'monospace',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {typing ? 'skip to end' : 'next apology'}
        </button>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 20,
        fontSize: 12,
        color: 'rgba(0,0,0,0.25)',
        textAlign: 'center' as const,
        fontFamily: 'monospace',
      }}>
        {current + 1} of {APOLOGIES.length} formal apologies
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
