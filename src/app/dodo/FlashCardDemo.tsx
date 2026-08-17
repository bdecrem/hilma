'use client'

import { useState } from 'react'

// The hero IS a flash card — the thing the whole app is made of. One real
// question, answerable right on the landing page, with the app's own
// right/wrong feedback. Correct flips the card into the punchline.
const CHOICES = [
  'Berries',
  'Small stones',
  'Fish',
  'Nothing — they forgot',
]
const ANSWER = 'Small stones'

export default function FlashCardDemo() {
  const [picked, setPicked] = useState<string | null>(null)
  const [solved, setSolved] = useState(false)

  function pick(choice: string) {
    if (solved) return
    setPicked(choice)
    if (choice === ANSWER) {
      // Let the green register before the flip.
      setTimeout(() => setSolved(true), 650)
    }
  }

  return (
    <div className="fcd-wrap">
      {!solved ? (
        <div className="fcd-card" key="q">
          <div className="fcd-eyebrow">Try one · card 1 of ∞</div>
          <p className="fcd-question">
            What did dodos swallow to help digest their food?
          </p>
          <div className="fcd-choices">
            {CHOICES.map((c) => {
              const isRight = picked !== null && c === ANSWER && picked === c
              const isWrong = picked === c && c !== ANSWER
              return (
                <button
                  key={c}
                  onClick={() => pick(c)}
                  className={
                    'fcd-choice' +
                    (isRight ? ' fcd-right' : '') +
                    (isWrong ? ' fcd-wrong' : '')
                  }
                >
                  {c}
                  {isRight && <span aria-hidden>✓</span>}
                  {isWrong && <span aria-hidden>✕</span>}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="fcd-card fcd-reveal" key="a">
          <div className="fcd-eyebrow">
            Correct <span className="fcd-xp">+10 XP</span>
          </div>
          <p className="fcd-question">
            Small stones — gizzard pebbles, kept to grind what they ate.
          </p>
          <p className="fcd-punch">
            Dodo works the same way: it keeps the little stones that help you
            digest what you read.
          </p>
          <button
            className="fcd-again"
            onClick={() => {
              setPicked(null)
              setSolved(false)
            }}
          >
            Ask me again
          </button>
        </div>
      )}
    </div>
  )
}
