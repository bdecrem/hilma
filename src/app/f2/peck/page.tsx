import type { Metadata, Viewport } from 'next'

// feynd.cc/peck — the universal link texted after the daily card. With Dodo
// installed, iOS opens the app's Peck tab and this page never loads. It
// exists for everyone else: link-preview crawlers get real OG tags (the
// opengraph-image.png next to this file), and browsers get bounced to the
// web app via meta refresh — a server redirect would have no <head> for
// crawlers to read.
export const metadata: Metadata = {
  title: 'Dodo — Peck',
  description: 'Keep your streak going — your daily answers already count on the map.',
  robots: { index: false },
}

export const viewport: Viewport = { themeColor: '#FCE5D0' }

export default function PeckLanding() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: '#FCE5D0',
        color: '#3E4A52',
        fontFamily: 'system-ui, sans-serif',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <p>
        Opening Dodo… <a href="/">continue on the web</a>
      </p>
      {/* Crawlers read the head and stop; humans move on after a beat. */}
      <script
        dangerouslySetInnerHTML={{
          __html: "setTimeout(function(){window.location.replace('/')},800)",
        }}
      />
    </main>
  )
}
