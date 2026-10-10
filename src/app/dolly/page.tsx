import { TESTFLIGHT_URL } from '@/lib/dolly/copy'

// ola.cx/dolly — one screen: what Dolly is, and the TestFlight link.
export default function DollyPage() {
  return (
    <main className="dolly-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="dolly-mascot" src="/dodo/jelly/gummy@2x.webp" alt="Gummy, Dolly's mascot: a pink jelly with two little ears" width={150} height={150} />
      <h1>Dolly</h1>
      <p className="dolly-dek">A three-minute call a day, in Spanish.</p>
      <ul className="dolly-steps" aria-label="The three parts of a day">
        <li>
          <b>1</b>Talk
        </li>
        <li>
          <b>2</b>Three things
        </li>
        <li>
          <b>3</b>Cards
        </li>
      </ul>
      <a className="dolly-btn" href={TESTFLIGHT_URL}>
        Get Dolly on TestFlight
      </a>
      <p className="dolly-note">Every morning a text comes with a link straight into the call. Misses come back the next day. That&rsquo;s the loop.</p>
      <p className="dolly-foot">
        Mandarin is on the way. <a href="/design/daily-call-v2">The design, if you&rsquo;re curious.</a>
      </p>
    </main>
  )
}
