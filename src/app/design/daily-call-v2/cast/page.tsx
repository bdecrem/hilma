import type { Metadata } from 'next'
import { CastSheet } from '../Dodo'

// The whole cast side by side with names: the dodo and Dodo's fifteen
// critters. Linked from chapter 5 of /design/daily-call-v2.

export const metadata: Metadata = {
  title: 'The cast — daily call v2',
  description: 'The dodo and the fifteen critters from Dodo, side by side.',
}

export default function CastPage() {
  return (
    <div className="hf">
      <div className="hf-wrap hf-castpage">
        <a className="hf-back" href="/design/daily-call-v2#cast">
          ← Daily call, in color
        </a>
        <h1 className="hf-h1">The cast</h1>
        <p className="hf-dek">The dodo and fifteen critters. Poke one.</p>
        <CastSheet />
      </div>
    </div>
  )
}
