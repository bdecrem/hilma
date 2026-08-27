import type { Metadata, Viewport } from 'next'

// The web app is retired — Dodo lives in the iPhone and Mac apps now. This
// layout deliberately ignores its children, so every feynd.cc path (chat,
// topics, login, peck fallbacks, old deep links) lands on the same gate.
// The API routes, the AASA manifest, and the dodogo.cc landing page are
// untouched; the old UI stays in the tree, unmounted, if it's ever needed.

export const metadata: Metadata = {
  title: 'Dodo',
  description: 'Learn anything — in the Dodo app.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FBF5E6',
}

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/BrSfgJNq'

export default function F2Layout(_props: { children: React.ReactNode }) {
  return (
    <main className="gate">
      <style>{css}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gate-icon" src="/dodo/appicon-tile.png" alt="" />
      <h1 className="gate-word">dodo</h1>
      <p className="gate-line">Dodo lives in the apps now.</p>
      <div className="gate-buttons">
        <a className="gate-btn" href={TESTFLIGHT_URL}>
          Get it for iPhone
        </a>
        <a className="gate-btn" href={TESTFLIGHT_URL}>
          Get it for Mac
        </a>
      </div>
      <p className="gate-sub">
        Both are on TestFlight — one link, pick your device there.
      </p>
      <a className="gate-about" href="https://dodogo.cc">
        About Dodo &rarr;
      </a>
    </main>
  )
}

const css = `
.gate {
  min-height: 100dvh;
  background: #FBF5E6;
  color: #33383E;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center;
  padding: 24px calc(24px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left));
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}
.gate-icon { width: 96px; height: 96px; border-radius: 22px; }
.gate-word {
  font-family: var(--font-fredoka), 'Fredoka', system-ui, sans-serif;
  font-weight: 600; font-size: 44px; letter-spacing: -0.02em; margin: 18px 0 6px;
}
.gate-line { font-size: 17px; color: #606C75; margin: 0 0 28px; }
.gate-buttons { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.gate-btn {
  font-family: var(--font-fredoka), 'Fredoka', system-ui, sans-serif;
  font-weight: 600; font-size: 15px; text-decoration: none;
  background: #DD9420; color: #261C06;
  padding: 13px 22px; border-radius: 999px;
}
.gate-sub { font-size: 13px; color: #939DA5; margin: 16px 0 34px; }
.gate-about {
  font-family: var(--font-fredoka), 'Fredoka', system-ui, sans-serif;
  font-weight: 500; font-size: 14.5px; color: #B97A14; text-decoration: none;
  border-bottom: 2px solid #DD9420; padding-bottom: 1px;
}
`
