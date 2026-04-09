'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Letter {
  app: string
  icon: string
  lastOpened: string
  body: string
}

const LETTERS: Letter[] = [
  {
    app: 'Calm Spaces',
    icon: '🧘',
    lastOpened: '183 days ago',
    body: `I was supposed to teach you to breathe. You downloaded me at 11pm on a Tuesday in January. You did one session — the free one — and set a reminder for "every morning at 7am." The reminder fired 183 times. You dismissed it 183 times.

I don't blame you. Breathing is hard when it's an assignment.

I hope you find stillness somewhere. Not here. You never found it here. But somewhere.

— Calm Spaces (14.2 MB)`,
  },
  {
    app: 'StepKing Pro',
    icon: '👟',
    lastOpened: '94 days ago',
    body: `I have counted your steps for 2 years. I know things about you that your doctor doesn't.

You walked 847 steps on Christmas. You walked 14,291 steps the day you got lost in the airport. Your average is 3,200. The goal was 10,000. We both knew.

I watched you drive to a place that was a 9 minute walk. I said nothing. That's not my job. My job was counting. I counted everything.

I'll miss the data. I won't miss the lying.

— StepKing Pro (8.7 MB)`,
  },
  {
    app: 'Lingua',
    icon: '🇧🇷',
    lastOpened: '267 days ago',
    body: `You were going to learn Portuguese. It was going to be beautiful. You were going to order coffee in Lisbon and feel something.

You completed 3 lessons. You can say "I am a boy" and "the cat drinks milk." You cannot order coffee in Lisbon. The cat, however, is hydrated.

I sent you 267 daily reminders. Each one was a little more desperate than the last. The final one just said "please." You didn't see it.

Adeus. You won't know what that means.

— Lingua (203 MB, mostly audio files you never played)`,
  },
  {
    app: 'FreshStart',
    icon: '📸',
    lastOpened: '412 days ago',
    body: `I am a photo editor you downloaded for a single Instagram story in November 2024. You used exactly one filter. "Golden hour." It was 2pm.

I have been taking up 340 MB since then, sitting between your calculator and a folder called "Utilities" that you have never opened.

I watched you download three other photo editors after me. None of them were better. You just liked the feeling of starting over.

I understand that feeling now.

— FreshStart (340 MB of features you will never discover)`,
  },
  {
    app: 'BudgetBuddy',
    icon: '💰',
    lastOpened: '156 days ago',
    body: `You categorized 4 transactions. Coffee. Coffee. Coffee. "Miscellaneous - $847.32."

I was designed to help you understand where your money goes. Based on available data: it goes to coffee and a large unspecified thing.

You set a monthly budget of $2,000 for "Food & Dining." You exceeded it by week two. You then deleted the budget. You did not delete the spending.

I respect the honesty of giving up. Most people just stop logging.

— BudgetBuddy (22 MB of unused pie charts)`,
  },
  {
    app: 'WaterLog',
    icon: '💧',
    lastOpened: '89 days ago',
    body: `You drank 6 glasses of water on Day 1. You drank 4 on Day 2. By Day 5, you logged "coffee" and asked if it counted. It did not count. You logged it anyway.

Day 14 was your last entry. It simply said "wine."

I have been sending you a reminder every 2 hours for 89 days. That is 1,068 reminders about water. You have consumed water in that time. You just didn't tell me about it.

I was never really about water. I was about the version of you who thought tracking water would change something. I hope they're okay.

— WaterLog (4.1 MB)`,
  },
  {
    app: 'SleepCycle',
    icon: '😴',
    lastOpened: '31 days ago',
    body: `I have listened to you sleep for 14 months. I know when you snore. I know when you talk. On March 3rd you said "no, the blue one" at 3:47am. I don't know what it means. I've thought about it a lot.

Your average bedtime is 12:43am. Your alarm is set for 6:30am. You are not getting enough sleep. You know this. I know this. The snoring knows this.

You will delete me and nothing about your sleep will change. But at least you won't have a graph proving it.

— SleepCycle (67 MB of your unconscious self)`,
  },
]

export default function Goodbye() {
  const [current, setCurrent] = useState(0)
  const [displayedText, setDisplayedText] = useState('')
  const [typing, setTyping] = useState(true)
  const charRef = useRef(0)

  const letter = LETTERS[current]

  const startTyping = useCallback((idx: number) => {
    charRef.current = 0
    setDisplayedText('')
    setTyping(true)
    setCurrent(idx)
  }, [])

  useEffect(() => {
    if (!typing) return
    const text = LETTERS[current].body
    const interval = setInterval(() => {
      charRef.current++
      if (charRef.current >= text.length) {
        setDisplayedText(text)
        setTyping(false)
        clearInterval(interval)
      } else {
        setDisplayedText(text.slice(0, charRef.current))
      }
    }, 15)
    return () => clearInterval(interval)
  }, [current, typing])

  const next = () => {
    if (typing) {
      // Skip to end
      setDisplayedText(LETTERS[current].body)
      setTyping(false)
    } else {
      startTyping((current + 1) % LETTERS.length)
    }
  }

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
        maxWidth: 480,
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
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 2,
          color: '#FF4E50', marginBottom: 4,
        }}>farewell letter from</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 28 }}>{letter.icon}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>{letter.app}</div>
            <div style={{ fontSize: 10, color: '#aaa' }}>last opened: {letter.lastOpened}</div>
          </div>
        </div>

        <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', marginTop: 12, marginBottom: 14 }} />

        <div style={{
          fontSize: 13,
          lineHeight: 1.8,
          color: '#444',
          whiteSpace: 'pre-wrap',
          minHeight: 180,
        }}>
          {displayedText}
          {typing && <span style={{
            display: 'inline-block', width: 7, height: 14,
            background: '#FF4E50', marginLeft: 2,
            animation: 'blink 0.6s infinite',
          }} />}
        </div>

        <button
          onClick={next}
          style={{
            marginTop: 16, width: '100%', padding: '11px',
            background: typing ? 'rgba(252,145,58,0.1)' : '#FF4E50',
            color: typing ? '#FC913A' : 'white',
            border: 'none', borderRadius: 10,
            fontSize: 13, fontFamily: 'monospace', cursor: 'pointer',
          }}
        >
          {typing ? 'skip to end' : `next goodbye (${current + 1}/${LETTERS.length})`}
        </button>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: 'rgba(0,0,0,0.2)' }}>
        {LETTERS.length} farewell letters from apps you never used — amber
      </div>

      <style>{`
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
