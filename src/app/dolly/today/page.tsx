import type { Metadata } from 'next'
import { TESTFLIGHT_URL } from '@/lib/dolly/copy'

export const metadata: Metadata = {
  title: 'Today — Dolly',
  description: 'Today’s three-minute call is in the app.',
}

// ola.cx/dolly/today — the daily text's link. With Dolly installed iOS opens
// the app instead of this page (the universal link); without it, this is
// where to get the app, with the custom scheme as a second try.
export default function DollyTodayPage() {
  return (
    <main className="dolly-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="dolly-mascot" src="/dodo/jelly/gummy@2x.webp" alt="" width={150} height={150} />
      <h1>Today</h1>
      <p className="dolly-dek">Your three minutes with Dolly are in the app.</p>
      <a className="dolly-btn" href="dolly://today">
        Open Dolly
      </a>
      <a className="dolly-btn ghost" href={TESTFLIGHT_URL}>
        Get it on TestFlight
      </a>
      <p className="dolly-note">If the app is installed, this link opens it straight on today&rsquo;s call.</p>
    </main>
  )
}
