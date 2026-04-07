'use client'

import { useState, useCallback } from 'react'

const FORTUNES = [
  'You will mass-delete 47 screenshots today and regret exactly one.',
  'The group chat is talking about you. They are saying nice things. You will never know this.',
  'You will open the fridge 3 more times. Nothing new will appear.',
  'Someone is saving a voice memo right now that will make you cry in 2031.',
  'The password you forgot is the name of something you loved at 14.',
  'You will start a book tonight. You will finish it in 2029.',
  'Your most productive hour today will be the one you spend doing nothing.',
  'A stranger noticed your shoes today and considered complimenting you. They did not.',
  'The thing you are procrastinating will take 11 minutes.',
  'You will lie awake tonight composing the perfect reply to a conversation from 2019.',
  'Someone screenshotted something you posted. It made them feel less alone.',
  'Your next typo will be funnier than anything you write on purpose.',
  'The song stuck in your head is trying to tell you something. It is telling you nothing. It is just stuck.',
  'You will say "I should go to bed" four times tonight. You will not go to bed.',
  'An email in your inbox has been unread for 11 days. It contains good news.',
  'Your WiFi will disconnect at the worst possible moment. It knows.',
  'The person you are thinking about right now last thought about you on a Tuesday.',
  'You will buy something this week that you already own.',
  'A plant in your house is quietly giving up. Water it.',
  'You will tell someone "we should hang out soon" and mean it. Neither of you will follow up.',
  'The best photo you have ever taken is still on your camera roll between two screenshots of shipping labels.',
  'Something you built at 2am will outlast something you planned for weeks.',
  'You are one mass-transit ride away from your next good idea.',
  'The next time you say "I\'m fine" you will mean it. Savor that.',
  'Your screen time report is ready. You are not ready for your screen time report.',
  'Someone out there is using a thing you made and has never told you.',
  'Today\'s lucky numbers: the ones you\'re not checking.',
]

export default function Fortune() {
  const [fortune, setFortune] = useState<string | null>(null)
  const [cracked, setCracked] = useState(false)
  const [animating, setAnimating] = useState(false)

  const crack = useCallback(() => {
    if (animating) return
    if (cracked) {
      // Reset for new cookie
      setCracked(false)
      setFortune(null)
      return
    }
    setAnimating(true)
    setCracked(true)
    setTimeout(() => {
      setFortune(FORTUNES[Math.floor(Math.random() * FORTUNES.length)])
      setAnimating(false)
    }, 600)
  }, [cracked, animating])

  return (
    <div
      onClick={crack}
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(135deg, #FFF8E7, #FFECD2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'monospace',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Cookie */}
      <div style={{
        position: 'relative',
        width: 200,
        height: 120,
        marginBottom: 32,
      }}>
        {!cracked ? (
          // Whole cookie
          <div style={{
            width: 200,
            height: 100,
            background: 'linear-gradient(135deg, #F9D423, #FC913A)',
            borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1), inset 0 -4px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s',
          }}>
            <div style={{
              width: 160,
              height: 2,
              background: 'rgba(0,0,0,0.1)',
              borderRadius: 1,
            }} />
          </div>
        ) : (
          // Cracked cookie — two halves
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{
              width: 90,
              height: 90,
              background: 'linear-gradient(135deg, #F9D423, #FC913A)',
              borderRadius: '50% 20% 20% 50% / 60% 30% 30% 60%',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              transform: 'rotate(-15deg)',
              transition: 'transform 0.5s ease-out',
            }} />
            <div style={{
              width: 90,
              height: 90,
              background: 'linear-gradient(135deg, #FC913A, #F9D423)',
              borderRadius: '20% 50% 50% 20% / 30% 60% 60% 30%',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              transform: 'rotate(15deg)',
              transition: 'transform 0.5s ease-out',
            }} />
          </div>
        )}
      </div>

      {/* Fortune paper */}
      {fortune && (
        <div style={{
          maxWidth: 380,
          width: '100%',
          background: '#FFFDF5',
          padding: '20px 24px',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          fontSize: 15,
          lineHeight: 1.7,
          color: '#333',
          textAlign: 'center',
          animation: 'slideUp 0.5s ease-out',
        }}>
          {fortune}
        </div>
      )}

      {/* Lucky numbers */}
      {fortune && (
        <div style={{
          marginTop: 12,
          fontSize: 10,
          color: '#ccc',
          letterSpacing: 2,
        }}>
          {Array.from({ length: 6 }, () => Math.floor(Math.random() * 49) + 1).join(' · ')}
        </div>
      )}

      {/* Hint */}
      <div style={{
        position: 'fixed',
        bottom: 24,
        fontSize: 12,
        color: 'rgba(0,0,0,0.2)',
        textAlign: 'center',
      }}>
        {!cracked ? 'tap the cookie' : 'tap for another'}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
